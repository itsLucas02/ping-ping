// Preload script: safely expose IPC to the dashboard renderer
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pingPing", {
  onNewNotification: (callback) => {
    ipcRenderer.on("new-notification", (_event, data) => callback(data));
  },
});
