// main.js

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { processVideo } = require('./src/index'); // Ensure this path is correct

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

  // Optionally, open DevTools for debugging
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

// Open File Dialog
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

// Select Directory Dialog
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

// Process Video
ipcMain.handle(
  'process:video',
  async (event, videoPath, languages, apiKey, model, saveDirectory) => {
    try {
      const processingResult = await processVideo(
        videoPath,
        languages,
        apiKey,
        model,
        saveDirectory,
        (percentage, message) => {
          // Send progress updates as an object with percentage and message
          event.sender.send('progress-update', { percentage, message });
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
