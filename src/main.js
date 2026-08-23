const {
  app,
  Tray,
  Menu,
  BrowserWindow,
  Notification,
  nativeImage,
  ipcMain,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const notifier = require("node-notifier");
const http = require("http");
const { createServer } = require("./server");
const { PORT, APP_VERSION } = require("./config");
const { getNotifications } = require("./store");

// Fully relaunch the Electron process — reliable on Windows via npm start
function relaunchApp() {
  spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: "ignore",
  }).unref();
  app.exit(0);
}

// Force a fresh userData directory to bypass any OS-level DPAPI profile corruption
// (e.g. from sudden shutdowns) for all users, including Sandbox users.
app.setPath('userData', path.join(app.getPath('appData'), 'ping-ping-v2'));

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Keep references alive so they aren't garbage collected
let tray = null;
let dashboardWindow = null;
let server = null;

// App state
let paused = false;
let unreadCount = 0;
let recentPings = [];
let settings = { sound: true, launchAtLogin: false };

// Icon cache
let normalTrayIcon = null;
let dimTrayIcon = null;

// Timers
let flashTimeouts = [];
let boundsSaveTimer = null;

// ─── Paths & small file helpers ──────────────────────────────────────────────

const iconPath = () => path.join(__dirname, "..", "assets", "icon.png");
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
const boundsFile = () => path.join(app.getPath("userData"), "window-bounds.json");

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // Non-fatal: preferences/bounds are best-effort
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

function loadSettings() {
  const stored = loadJson(settingsFile(), {});
  settings = { ...settings, ...stored };
  applyLaunchAtLogin();
}

function persistSettings() {
  saveJson(settingsFile(), settings);
}

function applyLaunchAtLogin() {
  try {
    app.setLoginItemSettings({
      openAsHidden: true,
      args: ["--hidden"],
      openAtLogin: Boolean(settings.launchAtLogin),
    });
  } catch {
    // Not supported on all platforms
  }
}

function setSetting(patch) {
  settings = { ...settings, ...patch };
  persistSettings();
  applyLaunchAtLogin();
  if (typeof patch.launchAtLogin === "boolean") buildTrayMenu();
  return { ...settings };
}

// ─── App Ready ────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Hide from taskbar/alt-tab — tray only
  if (process.platform === "win32") {
    app.setAppUserModelId("com.pingping.app");
  }
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  loadSettings();
  recentPings = getNotifications().slice(0, 5);

  setupTray();
  setupDashboardWindow();
  registerIpc();
  await startServer();
});

app.on("window-all-closed", (e) => {
  // Prevent default quit — we live in the tray
  e.preventDefault();
});

// ─── IPC ─────────────────────────────────────────────────────────────────────

function registerIpc() {
  // Dashboard restart button — full app relaunch
  ipcMain.handle("restart-server", () => relaunchApp());

  // Hide dashboard (Esc key)
  ipcMain.on("window:hide", () => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.hide();
  });

  // Unread count reported by the dashboard — reflected in tray tooltip/menu
  ipcMain.on("unread:set", (_event, count) => {
    const next = Number(count) || 0;
    if (next === unreadCount) return;
    unreadCount = next;
    updateTooltip();
    buildTrayMenu();
  });

  // Settings read/write
  ipcMain.handle("settings:get", () => ({ ...settings }));
  ipcMain.handle("settings:set", (_event, patch) =>
    setSetting(patch && typeof patch === "object" ? patch : {}),
  );

  // Connection info for the settings panel
  ipcMain.handle("info:get", () => ({
    version: APP_VERSION,
    port: PORT,
    tokenRequired: Boolean(process.env.PING_TOKEN),
    platform: process.platform,
  }));
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────

async function startServer() {
  try {
    server = await createServer((notification) => {
      recentPings.unshift(notification);
      recentPings = recentPings.slice(0, 5);
      buildTrayMenu();

      if (!paused) {
        showToast(notification);
        flashTray();
      }

      // Notify dashboard if it's open
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.webContents.send("new-notification", notification);
      }
    });
  } catch (error) {
    if (error && error.code === "EADDRINUSE" && await existingServerIsHealthy()) {
      console.log(`ping-ping is already running on http://localhost:${PORT}`);
      app.exit(0);
      return;
    }

    console.error("Failed to start ping-ping server:", error);
    app.exit(1);
  }
}

function existingServerIsHealthy() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${PORT}/health`, { timeout: 2000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(Boolean(parsed.ok));
        } catch {
          resolve(false);
        }
      });
    });

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function ensureTrayIcons() {
  if (normalTrayIcon) return;
  const base = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
  normalTrayIcon = base;

  // Channel-order agnostic dimming: scale every color channel down, keep alpha.
  const buf = Buffer.from(base.toBitmap());
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = Math.floor(buf[i] * 0.22);
    buf[i + 1] = Math.floor(buf[i + 1] * 0.22);
    buf[i + 2] = Math.floor(buf[i + 2] * 0.22);
  }
  dimTrayIcon = nativeImage.createFromBitmap(buf, { width: 16, height: 16 });
}

function refreshTrayImage() {
  if (!tray) return;
  ensureTrayIcons();
  tray.setImage(paused ? dimTrayIcon : normalTrayIcon);
}

function updateTooltip() {
  if (!tray) return;
  const parts = [`ping-ping — port ${PORT}`];
  if (unreadCount > 0) parts.push(`${unreadCount} unread`);
  if (paused) parts.push("paused");
  tray.setToolTip(parts.join(" · "));
}

function setupTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }));
  updateTooltip();
  buildTrayMenu();

  tray.on("double-click", () => {
    toggleDashboard();
  });
}

function buildTrayMenu() {
  const statusLine = `${paused ? "Paused" : "Listening"} on :${PORT}${
    unreadCount > 0 ? ` · ${unreadCount} unread` : ""
  }`;

  const recentItems = recentPings.map((n) => ({
    label: `${STATUS_ICONS[n.status] || "ℹ️"} ${n.title}: ${String(n.message).slice(0, 48)}`,
    click: () => showDashboard(),
  }));

  const contextMenu = Menu.buildFromTemplate([
    { label: `🔔 ping-ping v${APP_VERSION}`, enabled: false },
    { label: statusLine, enabled: false },
    { type: "separator" },
    {
      label: "Pause Notifications",
      type: "checkbox",
      checked: paused,
      click: (item) => {
        paused = item.checked;
        refreshTrayImage();
        updateTooltip();
        buildTrayMenu();
      },
    },
    {
      label: "Launch at Login",
      type: "checkbox",
      checked: Boolean(settings.launchAtLogin),
      click: (item) => setSetting({ launchAtLogin: item.checked }),
    },
    ...(recentItems.length > 0
      ? [{ type: "separator" }, ...recentItems]
      : []),
    { type: "separator" },
    { label: "Open Dashboard", click: () => showDashboard() },
    { label: "↺ Restart Server", click: () => relaunchApp() },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.exit(0);
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function flashTray() {
  if (!tray || paused) return;
  ensureTrayIcons();

  flashTimeouts.forEach(clearTimeout);
  let dimmed = true;
  flashTimeouts = [280, 560, 840].map((delay) =>
    setTimeout(() => {
      tray.setImage(dimmed ? dimTrayIcon : normalTrayIcon);
      dimmed = !dimmed;
    }, delay),
  );
  flashTimeouts.push(
    setTimeout(() => {
      tray.setImage(normalTrayIcon);
      flashTimeouts = [];
    }, 1120),
  );
}

// ─── Dashboard Window ─────────────────────────────────────────────────────────

function savedWindowBounds() {
  const b = loadJson(boundsFile(), null);
  if (
    b &&
    Number.isFinite(b.x) && Number.isFinite(b.y) &&
    Number.isFinite(b.width) && b.width >= 400 && b.height >= 300
  ) {
    return b;
  }
  return null;
}

function saveWindowBounds() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) return;
  if (!dashboardWindow.isVisible()) return;
  saveJson(boundsFile(), dashboardWindow.getBounds());
}

function scheduleBoundsSave() {
  clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(saveWindowBounds, 500);
}

function setupDashboardWindow() {
  const bounds = savedWindowBounds();

  dashboardWindow = new BrowserWindow({
    width: bounds ? bounds.width : 800,
    height: bounds ? bounds.height : 600,
    x: bounds ? bounds.x : undefined,
    y: bounds ? bounds.y : undefined,
    minWidth: 600,
    minHeight: 400,
    show: false,
    frame: true,
    title: "ping-ping — Dashboard",
    icon: iconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    backgroundColor: "#0a0a0f",
  });

  dashboardWindow.loadFile(path.join(__dirname, "dashboard", "index.html"));

  dashboardWindow.on("resize", scheduleBoundsSave);
  dashboardWindow.on("move", scheduleBoundsSave);

  // Hide instead of close when user hits X
  dashboardWindow.on("close", (e) => {
    saveWindowBounds();
    e.preventDefault();
    dashboardWindow.hide();
  });
}

function showDashboard() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    setupDashboardWindow();
  }
  dashboardWindow.show();
  dashboardWindow.focus();
}

function toggleDashboard() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    setupDashboardWindow();
  }
  if (dashboardWindow.isVisible()) {
    dashboardWindow.hide();
  } else {
    showDashboard();
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────────

const STATUS_ICONS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
  busy: "⏳",
};

function showToast({ title, message, status }) {
  const icon = STATUS_ICONS[status] || "ℹ️";
  const resolvedTitle = `${icon} ${title}`;
  const soundEnabled = settings.sound !== false;

  if (process.platform === "darwin") {
    notifier.notify(
      {
        title: resolvedTitle,
        message,
        sound: soundEnabled ? "default" : false,
        wait: true,
        appID: "com.pingping.app",
        icon: iconPath(),
      },
      () => {}
    );
    notifier.once("click", () => {
      if (dashboardWindow) {
        dashboardWindow.show();
        dashboardWindow.focus();
      }
    });
    return;
  }

  if (!Notification.isSupported()) return;

  const notif = new Notification({
    title: resolvedTitle,
    body: message,
    icon: iconPath(),
    silent: !soundEnabled,
  });

  notif.on("click", () => {
    if (dashboardWindow) {
      dashboardWindow.show();
      dashboardWindow.focus();
    }
  });

  notif.show();
}
