const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createDatabase } = require('./database.cjs');

let database;

function registerDatabaseHandlers() {
  const operations = [
    'initialize',
    'getMaterials',
    'getProjects',
    'getCashEntries',
    'getBudgets',
    'addBudget',
    'updateBudget',
    'deleteBudget',
    'addMaterial',
    'receiveMaterial',
    'addProject',
    'completeProject',
    'addCashEntry'
  ];
  for (const operation of operations) {
    ipcMain.handle(`database:${operation}`, (_event, ...args) => database[operation](...args));
  }
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once('ready-to-show', () => window.show());
  if (app.isPackaged) {
    await window.loadFile(path.join(__dirname, '..', 'dist', 'hikari-control', 'browser', 'index.html'));
  } else {
    await window.loadURL('http://127.0.0.1:4200');
  }
}

app.whenReady().then(async () => {
  database = await createDatabase(path.join(app.getPath('userData'), 'hikari-control.sqlite'));
  registerDatabaseHandlers();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => database?.close());