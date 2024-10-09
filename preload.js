// preload.js

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposes Electron APIs to the renderer process securely.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('dialog:openFile'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  startProcessing: (videoPath, languages, apiKey, model, saveDirectory) =>
    ipcRenderer.invoke('process:video', videoPath, languages, apiKey, model, saveDirectory),
  onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (event, message) => callback(message)),
});
