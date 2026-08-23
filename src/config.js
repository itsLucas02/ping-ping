const { app } = require("electron");
const path = require("path");

const PORT = 19999;
// History cap. The whole file is rewritten on every ping, so this bounds
// disk I/O and memory. Raise/lower here if you want more or less history.
const MAX_NOTIFICATIONS = 2000;

let APP_VERSION = "0.0.0";
try {
  APP_VERSION = require(path.join(__dirname, "..", "package.json")).version;
} catch {
  // Fall back to placeholder when package.json is unavailable
}

// Use Electron's userData path (e.g. %APPDATA%/ping-ping)
function getDataDir() {
  return app
    ? app.getPath("userData")
    : path.join(process.env.APPDATA || "", "ping-ping");
}

function getDataFile() {
  return path.join(getDataDir(), "notifications.json");
}

module.exports = { PORT, MAX_NOTIFICATIONS, APP_VERSION, getDataDir, getDataFile };
