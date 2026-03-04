const API_BASE = "http://localhost:19999";
const POLL_INTERVAL = 2500;

const STATUS_ICONS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

let knownIds = new Set();
let pollTimer = null;

// ─── DOM refs ────────────────────────────────────────────────
const listEl = document.getElementById("notificationList");
const emptyEl = document.getElementById("emptyState");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const countLabel = document.getElementById("countLabel");
const clearBtn = document.getElementById("clearBtn");

// ─── Boot ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  fetchAndRender();
  startPolling();

  clearBtn.addEventListener("click", async () => {
    await fetch(`${API_BASE}/api/notifications`, { method: "DELETE" });
    knownIds.clear();
    clearCards();
    updateCount(0);
  });

  // Listen for real-time push from Electron IPC (new notification)
  if (window.pingPing && window.pingPing.onNewNotification) {
    window.pingPing.onNewNotification((notif) => {
      if (!knownIds.has(notif.id)) {
        prependCard(notif);
        knownIds.add(notif.id);
        updateCount(knownIds.size);
      }
    });
  }
});

// ─── Fetch & render ─────────────────────────────────────────
async function fetchAndRender() {
  try {
    const res = await fetch(`${API_BASE}/api/notifications`);
    if (!res.ok) throw new Error("not ok");
    const data = await res.json();

    setOnline(true);

    // Find new entries (not yet rendered)
    const newEntries = data.filter((n) => !knownIds.has(n.id));

    if (newEntries.length > 0) {
      newEntries.forEach((n) => {
        prependCard(n);
        knownIds.add(n.id);
      });
    }

    // If the known set has entries no longer in data (e.g., cleared from tray)
    const serverIds = new Set(data.map((n) => n.id));
    const stale = [...knownIds].filter((id) => !serverIds.has(id));
    if (stale.length > 0) {
      knownIds.clear();
      clearCards();
      data.forEach((n) => {
        prependCard(n);
        knownIds.add(n.id);
      });
    }

    updateCount(knownIds.size);
  } catch {
    setOnline(false);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchAndRender, POLL_INTERVAL);
}

// ─── Render helpers ──────────────────────────────────────────
function prependCard(notif) {
  hideEmpty();
  const card = buildCard(notif);
  // Insert after the empty state div (or at top)
  if (listEl.firstChild && listEl.firstChild.id === "emptyState") {
    listEl.insertBefore(card, listEl.firstChild.nextSibling);
  } else {
    listEl.insertBefore(card, listEl.firstChild);
  }
}

function buildCard({ id, title, message, status, timestamp }) {
  const s = status || "info";
  const icon = STATUS_ICONS[s] || "ℹ️";

  const card = document.createElement("div");
  card.className = `notification-card ${s}`;
  card.dataset.id = id;

  card.innerHTML = `
    <span class="card-icon">${icon}</span>
    <div class="card-body">
      <div class="card-header">
        <span class="card-title">${escHtml(title)}</span>
        <span class="card-badge ${s}">${escHtml(s)}</span>
      </div>
      <p class="card-message">${escHtml(message)}</p>
      <p class="card-time">${formatTime(timestamp)}</p>
    </div>
  `;
  return card;
}

function clearCards() {
  // Remove all cards (not the empty state)
  Array.from(listEl.querySelectorAll(".notification-card")).forEach((el) =>
    el.remove(),
  );
  showEmpty();
}

function hideEmpty() {
  emptyEl.style.display = "none";
}
function showEmpty() {
  emptyEl.style.display = "";
}

function updateCount(n) {
  countLabel.textContent =
    n === 0 ? "No notifications yet" : `${n} notification${n === 1 ? "" : "s"}`;
}

function setOnline(online) {
  statusDot.className = `status-dot ${online ? "online" : "offline"}`;
  statusLabel.textContent = online ? "Server online" : "Server offline";
}

// ─── Utils ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return `${diff}s ago`;
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
