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
      return processingResult;
    } catch (error) {
      console.error('Error during processing:', error);
      throw error;
    }
  }
);

ipcMain.handle('openai:fetchModels', async (event, apiKey) => {
  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // Return the list of models
    return response.data.data; // `data` contains an array of models
  } catch (error) {
    console.error('Error fetching models:', error.response ? error.response.data : error.message);
    throw error; // Rethrow the error to be caught in the renderer process
  }
});
