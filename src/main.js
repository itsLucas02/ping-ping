const {
  app,
  Tray,
  Menu,
  BrowserWindow,
  Notification,
  nativeImage,
  shell,
} = require("electron");
const path = require("path");
const { createServer } = require("./server");
const { PORT } = require("./config");

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Keep references alive so they aren't garbage collected
let tray = null;
let dashboardWindow = null;
let server = null;

// Status icon flash timeout
let flashTimeout = null;

// ─── App Ready ────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Hide from taskbar/alt-tab — tray only
  app.setAppUserModelId("com.pingping.app");

  setupTray();
  setupDashboardWindow();

  // Start HTTP server, fire toast on each ping
  server = await createServer((notification) => {
    showToast(notification);
    flashTray();
    // Notify dashboard if it's open
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send("new-notification", notification);
    }
  });
});

app.on("window-all-closed", (e) => {
  // Prevent default quit — we live in the tray
  e.preventDefault();
});

// ─── Tray ─────────────────────────────────────────────────────────────────────

function setupTray() {
  const iconPath = path.join(__dirname, "..", "assets", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(`ping-ping — listening on port ${PORT}`);

  buildTrayMenu();

  tray.on("double-click", () => {
    toggleDashboard();
  });
}

function buildTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "🔔 ping-ping",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open Dashboard",
      click: () => toggleDashboard(),
    },
    {
      label: `Listening on :${PORT}`,
      enabled: false,
    },
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
  if (flashTimeout) clearTimeout(flashTimeout);
  const alertIconPath = path.join(__dirname, "..", "assets", "icon.png");
  const icon = nativeImage.createFromPath(alertIconPath);
  tray.setImage(icon.resize({ width: 16, height: 16 }));
  flashTimeout = setTimeout(() => {
    // Restore normal icon after 5s
    const normalIcon = nativeImage.createFromPath(
      path.join(__dirname, "..", "assets", "icon.png"),
    );
    tray.setImage(normalIcon.resize({ width: 16, height: 16 }));
    flashTimeout = null;
  }, 5000);
}

// ─── Dashboard Window ─────────────────────────────────────────────────────────

function setupDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    show: false,
    frame: true,
    title: "ping-ping — Dashboard",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    backgroundColor: "#0a0a0f",
  });

  dashboardWindow.loadFile(path.join(__dirname, "dashboard", "index.html"));

  // Hide instead of close when user hits X
  dashboardWindow.on("close", (e) => {
    e.preventDefault();
    dashboardWindow.hide();
  });
}

function toggleDashboard() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    setupDashboardWindow();
  }
  if (dashboardWindow.isVisible()) {
    dashboardWindow.hide();
  } else {
    dashboardWindow.show();
    dashboardWindow.focus();
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────────

const STATUS_ICONS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

function showToast({ title, message, status }) {
  if (!Notification.isSupported()) return;

  const icon = STATUS_ICONS[status] || "ℹ️";

  const notif = new Notification({
    title: `${icon} ${title}`,
    body: message,
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    silent: false,
  });

  notif.on("click", () => {
    if (dashboardWindow) {
      dashboardWindow.show();
      dashboardWindow.focus();
    }
  });

  notif.show();
}
