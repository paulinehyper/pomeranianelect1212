const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');

// 사용자 직접 할일 추가
ipcMain.handle('insert-todo', (event, { task, deadline, memo }) => {
  try {
    // deadline이 없으면 null, memo는 빈 문자열 허용
    db.insertTodo({
      date: deadline || '',
      dday: '',
      task,
      memo: memo || '',
      deadline: deadline || ''
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
// 이메일 todo 완료 처리 (todo_flag=2)
ipcMain.handle('set-email-todo-complete', (event, id) => {
  db.prepare('UPDATE emails SET todo_flag = 2 WHERE id = ?').run(id);
  return { success: true };
});
let tray = null;
const path = require('path');
const db = require('./db');
const setupMailIpc = require('./mail');
let mainWindow = null;
let settingsWindow = null;
let emailsWindow = null;
let keywordWindow = null;

// Keyword 창 열기
ipcMain.on('open-keyword', () => {
  if (keywordWindow && !keywordWindow.isDestroyed()) {
    keywordWindow.focus();
    return;
  }
  keywordWindow = new BrowserWindow({
    width: 420,
    height: 340,
    resizable: false,
    alwaysOnTop: true,
    frame: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  keywordWindow.loadFile('keyword.html');
  keywordWindow.on('closed', () => { keywordWindow = null; });
});

// Keyword 저장
ipcMain.handle('insert-keyword', (event, keyword) => {
  try {
    db.insertKeyword(keyword);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
// Keyword 전체 조회
ipcMain.handle('get-keywords', () => {
  try {
    const keywords = db.getAllKeywords();
    return { success: true, keywords };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
// Keyword 수정
ipcMain.handle('update-keyword', (event, oldKw, newKw) => {
  try {
    db.updateKeyword(oldKw, newKw);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
// Keyword 삭제
ipcMain.handle('delete-keyword', (event, kw) => {
  try {
    db.deleteKeyword(kw);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-memo', (event, id, memo) => {
  // id가 'mail-123' 형태면 emails, 아니면 todos
  if (typeof id === 'string' && id.startsWith('mail-')) {
    const mailId = id.replace('mail-', '');
    db.prepare('UPDATE emails SET memo = ? WHERE id = ?').run(memo, mailId);
  } else {
    db.prepare('UPDATE todos SET memo = ? WHERE id = ?').run(memo, id);
  }
  return { success: true };
});

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
  if (flag == 1) {
    // 메일 본문+제목을 positive(할일) 샘플로 저장 및 todos에 insert
    const mail = db.prepare('SELECT subject, body, deadline, from_addr FROM emails WHERE id = ?').get(id);
    if (mail) {
      // 중복 방지: subject+body+from_addr+deadline 해시
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update((mail.subject||'')+(mail.body||'')+(mail.from_addr||'')+(mail.deadline||'')).digest('hex');
      const exists = db.prepare('SELECT COUNT(*) as cnt FROM todos WHERE unique_hash = ?').get(hash);
      if (exists.cnt === 0) {
        db.prepare('INSERT INTO todos (task, memo, deadline, unique_hash) VALUES (?, ?, ?, ?)').run(mail.subject, '', mail.deadline, hash);
      }
      // 학습 데이터 저장
      const fs = require('fs');
      const line = `1\t${(mail.subject || '').replace(/\t/g,' ')} ${(mail.body || '').replace(/\t/g,' ')}\n`;
      fs.appendFileSync('todo_train_data.txt', line);
    }
  }
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
    icon: path.join(__dirname, 'icon.ico'),
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
    width: 600,
    minWidth: 320,
    height: 400,
    alwaysOnTop: true,
    frame: false,
    resizable: true,
    transparent: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');

  // 트레이 아이콘 클릭 시 창 토글
  if (tray) {
    tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    });
  }

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
    // YYYY년 MM월 DD일 패턴 우선 적용
    const yearMonthDay = body.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (yearMonthDay) {
      return `${yearMonthDay[1]}/${yearMonthDay[2].padStart(2,'0')}/${yearMonthDay[3].padStart(2,'0')}`;
    }
    return null;
  };

  ipcMain.handle('get-todos', () => {
    // todos 테이블만 조회
    const todos = db.prepare('SELECT * FROM todos ORDER BY id').all();
    const now = new Date();
    return todos.map(todo => {
      let deadline = todo.deadline;
      let dday = '없음';
      let date = '없음';
      if (deadline) {
        date = deadline.replace(/\//g, '/');
        const deadlineDate = new Date(date);
        if (!isNaN(deadlineDate)) {
          const diff = Math.ceil((deadlineDate - now) / (1000*60*60*24));
          dday = diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
        }
      }
      return {
        id: todo.id,
        date,
        dday,
        task: todo.task,
        deadline: deadline || '없음',
        memo: todo.memo || '',
        todo_flag: todo.todo_flag // 완료 여부 반환
      };
    });
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
      icon: path.join(__dirname, 'icon.ico'),
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
    // 트레이 아이콘 생성
    const iconPath = path.join(__dirname, 'icon.ico');
    tray = new Tray(iconPath);
    tray.setToolTip('할일 위젯');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '열기', click: () => { if (mainWindow) mainWindow.show(); } },
      { label: '종료', click: () => { app.quit(); } }
    ]));

    // 1분마다 emails 테이블에서 todo_flag가 NULL인 메일을 분석하여 todo_flag 업데이트
    const analyzeTodos = async () => {
      const db = require('./db');
      const ort = require('onnxruntime-node');
      let session = null;
      async function loadModel() {
        if (!session) session = await ort.InferenceSession.create('todo_classifier.onnx');
      }
      // 마감일 패턴(몇일까지 제출 등)
      const deadlinePatterns = [
        /(\d{1,2})월\s?(\d{1,2})일.*제출/, /(\d{1,2})일까지.*제출/, /(\d{1,2})일.*제출/, /by\s+(\d{1,2})[./-](\d{1,2})/i, /submit.*by.*(\d{1,2})[./-](\d{1,2})/i
      ];
      const adKeywords = ['instagram', 'facebook', '온라인투어', 'onlinetour', '페이스북', '인스타그램'];
      const emails = db.prepare('SELECT * FROM emails WHERE todo_flag IS NULL').all();
      for (const mail of emails) {
        const text = ((mail.subject || '') + ' ' + (mail.body || '')).toLowerCase();
        const from = (mail.from_addr || '').toLowerCase();
        // 광고성 메일 제외
        const isAdMail = adKeywords.some(kw => from.includes(kw) || text.includes(kw));
        let todoFlag = 0;
        if (!isAdMail) {
          const hasDeadline = deadlinePatterns.some(re => text.match(re));
          if (hasDeadline) {
            try {
              await loadModel();
              const inputTensor = new ort.Tensor('string', [text], [1]);
              const feeds = { input: inputTensor };
              const results = await session.run(feeds);
              const score = results.output.data[0];
              todoFlag = score > 0.8 ? 1 : 0;
            } catch (err) {
              todoFlag = 1;
            }
          }
        }
        db.prepare('UPDATE emails SET todo_flag = ? WHERE id = ?').run(todoFlag, mail.id);
        // todo_flag=1이면 todos에 insert (중복 방지)
        if (todoFlag === 1) {
          const crypto = require('crypto');
          const hash = crypto.createHash('sha256').update((mail.subject||'')+(mail.body||'')+(mail.from_addr||'')+(mail.deadline||'')).digest('hex');
          const exists = db.prepare('SELECT COUNT(*) as cnt FROM todos WHERE unique_hash = ?').get(hash);
          if (exists.cnt === 0) {
            db.prepare('INSERT INTO todos (task, memo, deadline, unique_hash) VALUES (?, ?, ?, ?)').run(mail.subject, '', mail.deadline, hash);
          }
        }
      }
    };
    setInterval(analyzeTodos, 60 * 1000);
    analyzeTodos();
  createWindow();
  setupMailIpc();

  // 1분마다 환경설정의 메일 계정으로 메일 동기화
  const { ipcMain } = require('electron');
  const db = require('./db');
  const { BrowserWindow } = require('electron');
  const syncMail = async () => {
    // 최신 메일 설정 가져오기
    const row = db.prepare('SELECT * FROM mail_settings ORDER BY id DESC LIMIT 1').get();
    if (row && row.mail_id && row.mail_pw && row.protocol && row.mail_type) {
      // mail-connect IPC 핸들러 직접 호출
      const mailModule = require('./mail');
      // mail.js의 setupMailIpc에서 ipcMain.handle로 등록된 핸들러를 직접 실행
      // (ipcMain.handle은 렌더러에서만 호출 가능하므로, mail.js의 내부 함수를 별도로 export하는 것이 더 안전)
      // 여기서는 ipcMain.invoke 대신 mailModule.syncMail(row) 형태로 구현 권장
      if (typeof mailModule.syncMail === 'function') {
        await mailModule.syncMail(row);
      } else {
        // fallback: BrowserWindow에서 mail-connect IPC 호출
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send('mail-connect', row);
        }
      }
    }
  };
  setInterval(syncMail, 60 * 1000); // 1분마다 실행
  // 앱 시작 직후에도 1회 실행
  syncMail();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
