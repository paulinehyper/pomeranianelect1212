const { ipcMain } = require('electron');
const Imap = require('imap-simple');
const db = require('./db');

function getImapConfig({ mailType, protocol, mailId, mailPw }) {
  let host, port, tls;
  if (mailType === 'naver') {
    host = 'imap.naver.com';
  } else if (mailType === 'gmail') {
    host = 'imap.gmail.com';
  } else {
    host = '';
  }
  if (protocol === 'imap-ssl') {
    port = 993; tls = true;
  } else if (protocol === 'imap') {
    port = 143; tls = false;
  } else if (protocol === 'pop3-ssl') {
    // POP3는 별도 구현 필요, 여기선 IMAP만 예시
    port = 995; tls = true;
  } else if (protocol === 'pop3') {
    port = 110; tls = false;
  }
  return {
    imap: {
      user: mailId,
      password: mailPw,
      host,
      port,
      tls,
      authTimeout: 5000
    }
  };
}

function setupMailIpc(main) {
  ipcMain.handle('mail-connect', async (event, info) => {
    if (info.protocol.startsWith('imap')) {
      const config = getImapConfig(info);
      try {
        const conn = await Imap.connect(config);
        // INBOX에서 최근 10개 메일 불러오기
        const box = await conn.openBox('INBOX');
        const searchCriteria = ['ALL'];
        const fetchOptions = {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
          struct: true,
          markSeen: false
        };
        const messages = await conn.search(searchCriteria, fetchOptions);
        // 최근 10개만
        const recentMessages = messages.slice(-10);
        const insert = db.prepare('INSERT INTO emails (received_at, subject, body, from_addr, todo_flag) VALUES (?, ?, ?, ?, ?)');
        const TODO_KEYWORDS = [
          '할일', '제출', '마감', '기한', '검토', '확인', '필수', '요청', '과제', '숙제', 'deadline', 'due', 'todo', 'assignment', 'report'
        ];
        for (const m of recentMessages) {
          const header = m.parts.find(p => p.which.startsWith('HEADER'));
          const bodyPart = m.parts.find(p => p.which === 'TEXT');
          const subject = header && header.body.subject ? header.body.subject[0] : '';
          const from = header && header.body.from ? header.body.from[0] : '';
          const date = header && header.body.date ? header.body.date[0] : '';
          const body = bodyPart ? bodyPart.body : '';
          const text = (subject + ' ' + (body || '')).toLowerCase();
          const todoFlag = TODO_KEYWORDS.some(k => text.includes(k)) ? 1 : 0;
          insert.run(date, subject, body, from, todoFlag);
        }
        await conn.end();
        return { success: true, message: '연동완료!' };
      } catch (e) {
        return { success: false, message: '연동실패: ' + e.message };
      }
    } else {
      return { success: false, message: 'POP3는 미지원' };
    }
  });
}

module.exports = setupMailIpc;
