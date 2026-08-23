const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { MAX_NOTIFICATIONS, getDataDir, getDataFile } = require("./config");

function ensureStore() {
  const dir = getDataDir();
  const file = getDataFile();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([]), "utf8");
}

function getNotifications() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(getDataFile(), "utf8"));
  } catch {
    return [];
  }
}

function addNotification({ title, message, status }) {
  ensureStore();
  const notifications = getNotifications();
  const entry = {
    id: uuidv4(),
    title,
    message,
    status: status || "info",
    read: false,
    timestamp: new Date().toISOString(),
  };
  // Newest first, cap at MAX_NOTIFICATIONS
  notifications.unshift(entry);
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.length = MAX_NOTIFICATIONS;
  }
  writeAll(notifications);
  return entry;
}

function deleteNotification(id) {
  ensureStore();
  const notifications = getNotifications();
  const next = notifications.filter((n) => n.id !== id);
  if (next.length === notifications.length) return false;
  writeAll(next);
  return true;
}

function markNotificationsRead({ ids, all } = {}) {
  ensureStore();
  const notifications = getNotifications();
  const idSet = Array.isArray(ids) ? new Set(ids) : null;
  let updated = 0;

  for (const n of notifications) {
    if (n.read) continue;
    if (all || (idSet && idSet.has(n.id))) {
      n.read = true;
      updated += 1;
    }
  }

  if (updated > 0) writeAll(notifications);
  return updated;
}

function clearNotifications() {
  ensureStore();
  writeAll([]);
}

function writeAll(notifications) {
  fs.writeFileSync(getDataFile(), JSON.stringify(notifications, null, 2), "utf8");
}

module.exports = {
  getNotifications,
  addNotification,
  deleteNotification,
  markNotificationsRead,
  clearNotifications,
};
