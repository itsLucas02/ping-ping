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
    timestamp: new Date().toISOString(),
  };
  // Newest first, cap at MAX_NOTIFICATIONS
  notifications.unshift(entry);
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.length = MAX_NOTIFICATIONS;
  }
  fs.writeFileSync(
    getDataFile(),
    JSON.stringify(notifications, null, 2),
    "utf8",
  );
  return entry;
}

function clearNotifications() {
  ensureStore();
  fs.writeFileSync(getDataFile(), JSON.stringify([]), "utf8");
}

module.exports = { getNotifications, addNotification, clearNotifications };
