// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('dialog:openFile'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  startProcessing: (videoPath, languages, apiKey, model, saveDirectory) =>
    ipcRenderer.invoke('process:video', videoPath, languages, apiKey, model, saveDirectory),
  fetchModels: (apiKey) => ipcRenderer.invoke('openai:fetchModels', apiKey),
});

