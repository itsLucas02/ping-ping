// Preload script: safely expose IPC to the dashboard renderer
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pingPing", {
  onNewNotification: (callback) => {
    ipcRenderer.on("new-notification", (_event, data) => callback(data));
  },
  restartServer: () => ipcRenderer.invoke("restart-server"),
  hideWindow: () => ipcRenderer.send("window:hide"),
  setUnreadCount: (count) => ipcRenderer.send("unread:set", count),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  getInfo: () => ipcRenderer.invoke("info:get"),
});
