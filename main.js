const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const db = require('./db');
const setupMailIpc = require('./mail');

let mainWindow = null;
let settingsWindow = null;
let emailsWindow = null;

ipcMain.handle('save-mail-settings', (event, settings) => {
  const stmt = db.prepare(`INSERT INTO mail_settings (mail_type, protocol, mail_id, mail_pw, mail_since) VALUES (?, ?, ?, ?, ?)`);
  stmt.run(settings.mailType, settings.protocol, settings.mailId, settings.mailPw, settings.mailSince);
  return { success: true };
});

ipcMain.handle('get-mail-settings', () => {
  const row = db.prepare('SELECT * FROM mail_settings ORDER BY id DESC LIMIT 1').get();
  return row || null;
});

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

  const extractDeadline = (body) => {
    if (!body) return null;
    // YYYY-MM-DD, YYYY/MM/DD, MM/DD, MM월DD일, 12일까지, 12일, 12/30 등 다양한 날짜 패턴
    const patterns = [
      /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/, // 2025-12-30
      /(\d{1,2})[./-](\d{1,2})/, // 12-30
      /(\d{1,2})월\s?(\d{1,2})일/, // 12월 30일
      /(\d{1,2})일/, // 30일
      /(\d{1,2})일까지/ // 30일까지
    ];
    for (const re of patterns) {
      const m = body.match(re);
      if (m) {
        if (m.length >= 4 && m[1].length === 4) {
          // YYYY-MM-DD
          return `${m[1]}/${m[2].padStart(2,'0')}/${m[3].padStart(2,'0')}`;
        } else if (m.length >= 3 && re === patterns[1]) {
          // MM/DD
          return `${new Date().getFullYear()}/${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}`;
        } else if (m.length >= 3 && re === patterns[2]) {
          // MM월 DD일
          return `${new Date().getFullYear()}/${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}`;
        } else if (m.length >= 2 && (re === patterns[3] || re === patterns[4])) {
          // DD일, DD일까지
          return `${new Date().getFullYear()}/${(new Date().getMonth()+1).toString().padStart(2,'0')}/${m[1].padStart(2,'0')}`;
        }
      }
    }
    return null;
  };

  ipcMain.handle('get-todos', () => {
    // 기존 todos + emails에서 todo_flag=1인 메일을 합쳐 반환
    const todos = db.prepare('SELECT * FROM todos ORDER BY id').all();
    const emails = db.prepare('SELECT * FROM emails WHERE todo_flag=1 ORDER BY id DESC').all();
    const now = new Date();
    const emailTodos = emails.map(mail => {
      // 마감기한 추출
      const deadlineStr = extractDeadline(mail.body);
      let dday = '없음';
      let date = '없음';
      if (deadlineStr) {
        date = deadlineStr.replace(/\//g, '/');
        const deadline = new Date(date);
        if (!isNaN(deadline)) {
          const diff = Math.ceil((deadline - now) / (1000*60*60*24));
          dday = diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
        }
      }
      return {
        id: `mail-${mail.id}`,
        date,
        dday,
        task: mail.subject
      };
    });
    return [...todos, ...emailTodos];
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
