const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("readerAPI", {
  getLibrary: () => ipcRenderer.invoke("library:get"),
  importWithDialog: () => ipcRenderer.invoke("books:importDialog"),
  importPaths: (paths) => ipcRenderer.invoke("books:importPaths", paths),
  readBook: (id) => ipcRenderer.invoke("books:read", id),
  updateProgress: (payload) => ipcRenderer.invoke("books:updateProgress", payload),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  importFont: () => ipcRenderer.invoke("fonts:importDialog"),
  removeBook: (id) => ipcRenderer.invoke("books:remove", id),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onWindowStateChanged: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("window:state-changed", wrapped);
    return () => ipcRenderer.removeListener("window:state-changed", wrapped);
  }
});
