// main.js

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { processVideo } = require('./src/index');
const axios = require('axios');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Videos',
        extensions: [
          'mp4',
          'avi',
          'mkv',
          'mov',
          'flv',
          'wmv',
          'webm',
          'mpeg',
          'mpg',
          'm4v',
          // Add other video extensions as needed
        ],
      },
    ],
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle('dialog:selectDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle(
  'process:video',
  async (event, videoPath, languages, apiKey, model, saveDirectory) => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const processingResult = await processVideo(
        videoPath,
        languages,
        apiKey,
        model,
        saveDirectory,
        (message) => {
          win.webContents.send('progress-update', message);
        }
      );
      console.log('Processing Result:', processingResult);
      return processingResult;
    } catch (error) {
      console.error('Error during processing:', error);
      throw error;
    }
  }
);

