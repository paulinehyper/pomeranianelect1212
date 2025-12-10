


const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const db = require('./db');
const setupMailIpc = require('./mail');

let mainWindow = null;
let settingsWindow = null;
let emailsWindow = null;

ipcMain.handle('set-email-todo-flag', (event, id, flag) => {
  db.prepare('UPDATE emails SET todo_flag = ? WHERE id = ?').run(flag, id);
  return { success: true };
});

ipcMain.on('open-emails', () => {
  if (emailsWindow && !emailsWindow.isDestroyed()) {
    emailsWindow.focus();
    return;
  }
  emailsWindow = new BrowserWindow({
    width: 700,
    height: 500,
    resizable: true,
    minimizable: true,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  emailsWindow.loadFile('emails.html');
  emailsWindow.on('closed', () => { emailsWindow = null; });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 400,
    alwaysOnTop: true,
    frame: false,
    resizable: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');

  ipcMain.on('minimize', () => {
    mainWindow.minimize();
  });
  ipcMain.on('close', () => {
    mainWindow.close();
  });

  ipcMain.handle('get-todos', () => {
    const rows = db.prepare('SELECT * FROM todos ORDER BY id').all();
    return rows;
  });

  ipcMain.handle('get-emails', () => {
    const rows = db.prepare('SELECT * FROM emails ORDER BY id DESC').all();
    return rows;
  });

  ipcMain.on('open-settings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus();
      return;
    }
    settingsWindow = new BrowserWindow({
      width: 640,
      height: 500,
      resizable: false,
      alwaysOnTop: true,
      frame: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    settingsWindow.loadFile('settings.html');
    settingsWindow.on('closed', () => { settingsWindow = null; });
  });
}


app.whenReady().then(() => {
  createWindow();
  setupMailIpc();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
