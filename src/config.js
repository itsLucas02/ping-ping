const { app } = require("electron");
const path = require("path");

const PORT = 19999;
const MAX_NOTIFICATIONS = 500;

// Use Electron's userData path (e.g. %APPDATA%/ping-ping)
function getDataDir() {
  return app
    ? app.getPath("userData")
    : path.join(process.env.APPDATA || "", "ping-ping");
}

function getDataFile() {
  return path.join(getDataDir(), "notifications.json");
}

module.exports = { PORT, MAX_NOTIFICATIONS, getDataDir, getDataFile };
