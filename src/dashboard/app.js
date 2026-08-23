const API_BASE = "http://localhost:19999";
const POLL_INTERVAL = 3000;
const TIMESTAMP_REFRESH_INTERVAL = 30_000;
const AUTO_MARK_READ_DELAY = 1500;
const CLEAR_ARM_TIMEOUT = 3000;

const STATUS_ICONS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
  busy: "⏳",
};

const STATUSES = ["success", "error", "warning", "info", "busy"];

// ─── State ───────────────────────────────────────────────────
let items = [];
let filter = "all";
let query = "";
let selectedId = null;
let online = false;
let offlineToastShown = false;
let autoMarkReadTimer = null;
let clearArmTimer = null;
let lastSnapshot = "";
let prevRenderedIds = new Set();

// ─── DOM refs ────────────────────────────────────────────────
const listEl = document.getElementById("notificationList");
const emptyTeachEl = document.getElementById("emptyTeach");
const emptyFilteredEl = document.getElementById("emptyFiltered");
const filtersEl = document.getElementById("filters");
const searchInput = document.getElementById("searchInput");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const countLabel = document.getElementById("countLabel");
const markAllReadBtn = document.getElementById("markAllReadBtn");
const clearBtn = document.getElementById("clearBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const soundToggle = document.getElementById("soundToggle");
const launchToggle = document.getElementById("launchToggle");
const testPingBtn = document.getElementById("testPingBtn");
const testPingEmptyBtn = document.getElementById("testPingEmptyBtn");
const restartBtn = document.getElementById("restartBtn");
const connectionInfo = document.getElementById("connectionInfo");
const toastRegion = document.getElementById("toastRegion");

// ─── Boot ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  setupSnippet();
  await loadSettingsUI();
  attachEvents();
  await fetchAndRender();
});

function attachEvents() {
  searchInput.addEventListener("input", () => {
    query = searchInput.value.trim().toLowerCase();
    render();
  });

  markAllReadBtn.addEventListener("click", () => markAllRead());

  clearBtn.addEventListener("click", () => handleClearClick());
  restartBtn.addEventListener("click", handleRestart);

  settingsBtn.addEventListener("click", toggleSettingsPanel);
  soundToggle.addEventListener("change", () =>
    saveSettings({ sound: soundToggle.checked }),
  );
  launchToggle.addEventListener("change", () =>
    saveSettings({ launchAtLogin: launchToggle.checked }),
  );

  testPingBtn.addEventListener("click", sendTestPing);
  testPingEmptyBtn.addEventListener("click", sendTestPing);

  const copySnippetBtn = document.getElementById("copySnippetBtn");
  if (copySnippetBtn) {
    copySnippetBtn.addEventListener("click", (e) =>
      flashCopied(e.currentTarget, document.getElementById("emptySnippet").textContent),
    );
  }

  // Card actions via delegation
  listEl.addEventListener("click", (e) => {
    const card = e.target.closest(".notification-card");
    if (!card) return;
    selectedId = card.dataset.id;
    if (e.target.closest(".copy")) {
      copyMessage(card.dataset.id, e.target.closest(".copy"));
    } else if (e.target.closest(".delete")) {
      deleteItem(card.dataset.id);
    } else {
      render();
    }
  });

  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("focus", scheduleAutoMarkRead);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) fetchAndRender();
  });

  // Real-time push from Electron IPC
  if (window.pingPing && window.pingPing.onNewNotification) {
    window.pingPing.onNewNotification((notif) => {
      if (!items.some((n) => n.id === notif.id)) {
        items.unshift({ ...notif, read: Boolean(notif.read) });
        render();
        if (document.hasFocus() && !document.hidden) scheduleAutoMarkRead();
      }
    });
  }

  startPolling();
  startTimestampRefresh();
}

// ─── API helpers ─────────────────────────────────────────────
async function api(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAndRender() {
  try {
    const data = await api("/api/notifications");
    setOnline(true);
    offlineToastShown = false;

    // Re-render only when something actually changed — prevents poll churn
    const snapshot = JSON.stringify(data);
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;

    items = Array.isArray(data) ? data : [];
    render();
  } catch {
    setOnline(false);
  }
}

function startPolling() {
  setInterval(() => {
    if (!document.hidden) fetchAndRender();
  }, POLL_INTERVAL);
}

// ─── Rendering ───────────────────────────────────────────────
function visibleItems() {
  let view = items;
  if (filter !== "all") view = view.filter((n) => n.status === filter);
  if (query) {
    view = view.filter(
      (n) =>
        n.title.toLowerCase().includes(query) ||
        n.message.toLowerCase().includes(query),
    );
  }
  return view;
}

function render() {
  const view = visibleItems();
  const prevScroll = listEl.scrollTop;

  renderChips();
  updateCountLabel(view.length);
  syncUnread();

  const hasAny = items.length > 0;
  emptyTeachEl.hidden = hasAny || view.length > 0;
  emptyFilteredEl.hidden = !(hasAny && view.length === 0);

  const frag = document.createDocumentFragment();
  let lastDay = null;
  const nextIds = new Set();

  for (const n of view) {
    nextIds.add(n.id);
    const label = dayLabel(n.timestamp);
    if (label !== lastDay) {
      lastDay = label;
      frag.appendChild(dayDivider(label));
    }
    // Animate entrance only for ids the user hasn't seen rendered before
    const isNewArrival = prevRenderedIds.size > 0 && !prevRenderedIds.has(n.id);
    frag.appendChild(buildCard(n, isNewArrival));
  }

  listEl.querySelectorAll(".day-divider, .notification-card").forEach((el) => el.remove());
  const anchor = emptyTeachEl.hidden
    ? emptyFilteredEl.hidden
      ? null
      : emptyFilteredEl
    : emptyTeachEl;
  listEl.insertBefore(frag, anchor);

  listEl.scrollTop = prevScroll;
  prevRenderedIds = nextIds;

  restoreSelectionInView();
}

function dayDivider(label) {
  const div = document.createElement("div");
  div.className = "day-divider";
  div.setAttribute("aria-hidden", "true");
  div.textContent = label;
  return div;
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function agentHue(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

function buildCard(n, animate = false) {
  const s = STATUSES.includes(n.status) ? n.status : "info";
  const icon = STATUS_ICONS[s];
  const unread = !n.read;

  const card = document.createElement("article");
  card.className = `notification-card ${s}${unread ? " unread" : ""}${
    n.id === selectedId ? " selected" : ""
  }${animate ? " enter" : ""}`;
  card.dataset.id = n.id;
  card.tabIndex = -1;

  const chip = document.createElement("span");
  chip.className = "card-chip";
  chip.style.setProperty("--agent-hue", String(agentHue(n.title)));
  chip.textContent = icon;
  chip.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "card-body";

  const header = document.createElement("div");
  header.className = "card-header";

  if (unread) {
    const dot = document.createElement("span");
    dot.className = "unread-dot";
    dot.title = "Unread";
    header.appendChild(dot);
  }

  const title = document.createElement("span");
  title.className = "card-title";
  title.textContent = n.title;
  header.appendChild(title);

  const badge = document.createElement("span");
  badge.className = `card-badge ${s}`;
  badge.textContent = s;
  header.appendChild(badge);

  const time = document.createElement("time");
  time.className = "card-time";
  time.dataset.timestamp = n.timestamp;
  time.dateTime = n.timestamp;
  time.title = new Date(n.timestamp).toLocaleString();
  time.textContent = formatTime(n.timestamp);
  header.appendChild(time);

  const message = document.createElement("p");
  message.className = "card-message";
  message.textContent = n.message;

  body.appendChild(header);
  body.appendChild(message);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "card-action copy";
  copyBtn.textContent = "Copy";
  copyBtn.title = "Copy message (C)";

  const delBtn = document.createElement("button");
  delBtn.className = "card-action delete";
  delBtn.textContent = "✕";
  delBtn.title = "Delete notification (Del)";
  delBtn.setAttribute("aria-label", "Delete notification");

  actions.appendChild(copyBtn);
  actions.appendChild(delBtn);

  card.appendChild(chip);
  card.appendChild(body);
  card.appendChild(actions);
  return card;
}

function restoreSelectionInView() {
  if (!selectedId) return;
  const el = listEl.querySelector(`[data-id="${CSS.escape(selectedId)}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
}

function renderChips() {
  const counts = { all: items.length };
  for (const s of STATUSES) counts[s] = 0;
  for (const n of items) if (counts[n.status] !== undefined) counts[n.status]++;

  const defs = [{ key: "all", label: "All" }, ...STATUSES.map((s) => ({ key: s, label: s }))];

  filtersEl.replaceChildren(
    ...defs.map(({ key, label }) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.dataset.filter = key;
      btn.setAttribute("aria-pressed", String(filter === key));

      const dot = document.createElement("span");
      dot.className = `chip-dot ${key}`;
      dot.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = label.charAt(0).toUpperCase() + label.slice(1);

      const count = document.createElement("span");
      count.className = "count";
      count.textContent = counts[key];

      btn.appendChild(dot);
      btn.appendChild(text);
      btn.appendChild(count);
      btn.addEventListener("click", () => {
        filter = key;
        render();
      });
      return btn;
    }),
  );
}

function updateCountLabel(shown) {
  const filtered = shown !== items.length || filter !== "all" || query;
  countLabel.textContent =
    items.length === 0
      ? ""
      : filtered
        ? `${shown} of ${items.length}`
        : `${items.length} notification${items.length === 1 ? "" : "s"}`;
}

function syncUnread() {
  const unread = items.filter((n) => !n.read).length;
  markAllReadBtn.hidden = unread === 0;
  markAllReadBtn.textContent = `Mark all read (${unread})`;
  if (window.pingPing && window.pingPing.setUnreadCount) {
    window.pingPing.setUnreadCount(unread);
  }
}

// ─── Read state ──────────────────────────────────────────────
function scheduleAutoMarkRead() {
  clearTimeout(autoMarkReadTimer);
  autoMarkReadTimer = setTimeout(async () => {
    if (document.hidden || !document.hasFocus()) return;
    if (!items.some((n) => !n.read)) return;
    try {
      await api("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      items.forEach((n) => (n.read = true));
      render();
    } catch {
      // Server unreachable — keep unread state
    }
  }, AUTO_MARK_READ_DELAY);
}

async function markAllRead() {
  try {
    await api("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    items.forEach((n) => (n.read = true));
    render();
  } catch {
    showToast("Could not reach ping-ping server", "error");
  }
}

// ─── Item actions ────────────────────────────────────────────
async function copyMessage(id, btn) {
  const item = items.find((n) => n.id === id);
  if (!item) return;
  try {
    await navigator.clipboard.writeText(item.message);
    if (btn) flashCopied(btn, "Copy");
  } catch {
    showToast("Copy failed — clipboard unavailable", "error");
  }
}

function flashCopied(btn, originalText) {
  btn.classList.add("copied");
  const prev = btn.textContent;
  btn.textContent = "Copied ✓";
  setTimeout(() => {
    btn.classList.remove("copied");
    btn.textContent = originalText || prev;
  }, 1300);
}

async function deleteItem(id) {
  try {
    await api(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
    items = items.filter((n) => n.id !== id);
    if (selectedId === id) selectedId = null;
    render();
  } catch {
    showToast("Delete failed — is the server running?", "error");
  }
}

function handleClearClick() {
  if (!items.length) return;
  if (!clearBtn.classList.contains("armed")) {
    clearBtn.classList.add("armed");
    clearBtn.textContent = "Confirm?";
    clearTimerToDisarm();
    return;
  }
  disarmClearButton();
  clearAll();
}

function clearTimerToDisarm() {
  clearTimeout(clearArmTimer);
  clearArmTimer = setTimeout(disarmClearButton, CLEAR_ARM_TIMEOUT);
}

function disarmClearButton() {
  clearTimeout(clearArmTimer);
  clearBtn.classList.remove("armed");
  clearBtn.textContent = "Clear";
}

async function clearAll() {
  try {
    await api("/api/notifications", { method: "DELETE" });
    items = [];
    selectedId = null;
    render();
  } catch {
    showToast("Clear failed — is the server running?", "error");
  }
}

async function sendTestPing() {
  try {
    await api("/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "ping-ping",
        message: "Test ping — your notification relay works!",
        status: "info",
      }),
    });
    showToast("Test ping sent");
  } catch {
    showToast("Could not reach ping-ping server", "error");
  }
}

async function handleRestart() {
  restartBtn.disabled = true;
  restartBtn.textContent = "Restarting…";
  try {
    if (window.pingPing && window.pingPing.restartServer) {
      await window.pingPing.restartServer();
    }
  } finally {
    setTimeout(() => {
      restartBtn.disabled = false;
      restartBtn.textContent = "↺ Restart server";
    }, 1500);
  }
}

// ─── Settings panel ──────────────────────────────────────────
async function loadSettingsUI() {
  if (!window.pingPing) return;
  try {
    const settings = await window.pingPing.getSettings();
    soundToggle.checked = settings.sound !== false;
    launchToggle.checked = Boolean(settings.launchAtLogin);

    const info = await window.pingPing.getInfo();
    connectionInfo.textContent =
      `v${info.version} · port ${info.port} · ` +
      `${info.tokenRequired ? "PING_TOKEN required" : "no token required"} · ${info.platform}`;
  } catch {
    connectionInfo.textContent = "Settings unavailable outside Electron.";
  }
}

async function saveSettings(patch) {
  if (!window.pingPing || !window.pingPing.setSettings) return;
  try {
    await window.pingPing.setSettings(patch);
  } catch {
    showToast("Failed to save setting", "error");
  }
}

function toggleSettingsPanel(force) {
  const show = force !== undefined ? force : settingsPanel.hidden;
  settingsPanel.hidden = !show;
  settingsBtn.setAttribute("aria-expanded", String(show));
}

// ─── Empty-state snippet ─────────────────────────────────────
function setupSnippet() {
  const snippetEl = document.getElementById("emptySnippet");
  const isWindows = navigator.platform.includes("Win");
  snippetEl.textContent = isWindows
    ? [
        "Invoke-RestMethod -Uri 'http://127.0.0.1:19999/ping' -Method Post `",
        "  -ContentType 'application/json' `",
        "  -Body '{\"title\":\"My Agent\",\"message\":\"Done!\",\"status\":\"success\"}'",
      ].join("\n")
    : [
        "curl -X POST http://127.0.0.1:19999/ping \\",
        '  -H "Content-Type: application/json" \\',
        '  -d \'{"title":"My Agent","message":"Done!","status":"success"}\'',
      ].join("\n");
}

// ─── Keyboard ────────────────────────────────────────────────
function handleKeydown(e) {
  const typing = e.target instanceof HTMLInputElement;

  if (e.key === "/" && !typing) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  if (e.key === "Escape") {
    if (!settingsPanel.hidden) {
      toggleSettingsPanel(false);
    } else if (clearBtn.classList.contains("armed")) {
      disarmClearButton();
    } else if (typing && searchInput.value) {
      searchInput.value = "";
      query = "";
      render();
    } else if (window.pingPing && window.pingPing.hideWindow) {
      window.pingPing.hideWindow();
    }
    return;
  }

  if (typing) return;

  const view = visibleItems();
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    moveSelection(view, e.key === "ArrowDown" ? 1 : -1);
  } else if ((e.key === "c" || e.key === "C") && selectedId) {
    copyMessage(selectedId, null);
    const btn = listEl.querySelector(`[data-id="${CSS.escape(selectedId)}"] .copy`);
    if (btn) flashCopied(btn, "Copy");
  } else if (e.key === "Delete" && selectedId) {
    deleteItem(selectedId);
  }
}

function moveSelection(view, delta) {
  if (view.length === 0) return;
  const idx = view.findIndex((n) => n.id === selectedId);
  const nextIdx = idx === -1 ? (delta > 0 ? 0 : view.length - 1) : Math.min(view.length - 1, Math.max(0, idx + delta));
  selectedId = view[nextIdx].id;
  render();
}

// ─── Status & toasts ─────────────────────────────────────────
function setOnline(value) {
  if (online === value) {
    statusDot.className = `status-dot ${value ? "online" : "offline"}`;
    return;
  }
  online = value;
  statusDot.className = `status-dot ${online ? "online" : "offline"}`;
  statusLabel.textContent = online ? "Online" : "Offline";
  if (!online && !offlineToastShown) {
    offlineToastShown = true;
    showToast("Can't reach ping-ping server", "error");
  }
}

function showToast(text, kind) {
  const toast = document.createElement("div");
  toast.className = `toast${kind === "error" ? " error" : ""}`;
  toast.textContent = text;
  toastRegion.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// ─── Live timestamp refresh ──────────────────────────────────
function startTimestampRefresh() {
  setInterval(() => {
    listEl.querySelectorAll(".card-time[data-timestamp]").forEach((el) => {
      el.textContent = formatTime(el.dataset.timestamp);
      el.title = new Date(el.dataset.timestamp).toLocaleString();
    });
  }, TIMESTAMP_REFRESH_INTERVAL);
}

// ─── Utils ───────────────────────────────────────────────────
function formatTime(iso) {
  try {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `${Math.max(diff, 0)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}
