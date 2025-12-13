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
  // 다양한 타입을 안전하게 Buffer로 변환
  function toBuffer(body) {
    if (Buffer.isBuffer(body)) return body;
    if (typeof body === 'string') return Buffer.from(body);
    if (body && typeof body === 'object' && body.type === 'Buffer' && Array.isArray(body.data)) {
      return Buffer.from(body.data);
    }
    return Buffer.alloc(0);
  }
  ipcMain.handle('mail-connect', async (event, info) => {
    if (info.protocol.startsWith('imap')) {
      const config = getImapConfig(info);
      try {
        const conn = await Imap.connect(config);
        // INBOX에서 메일 불러오기 (mailSince 있으면 해당 날짜 이후)
        const box = await conn.openBox('INBOX');
        let searchCriteria = ['ALL'];
        if (info.mailSince) {
          // IMAP에서 SINCE DD-MMM-YYYY 형식 필요 (예: 10-Dec-2025)
          const dateObj = new Date(info.mailSince);
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const day = dateObj.getDate();
          const month = months[dateObj.getMonth()];
          const year = dateObj.getFullYear();
          const sinceStr = `${day}-${month}-${year}`;
          searchCriteria = ['ALL', ['SINCE', sinceStr]];
        }
        // imap-simple에서 BODY[]와 HEADER.FIELDS를 동시에 요청하면 일부 서버에서 오류가 발생할 수 있음
        // mailparser를 쓸 때는 BODY[]만 요청하는 것이 가장 호환성이 높음
        const fetchOptions = {
          bodies: [''], // '' = RFC822 전체 (BODY[]와 동일, 네이버 호환)
          struct: false,
          markSeen: false
        };
        const messages = await conn.search(searchCriteria, fetchOptions);
        // 최근 10개 제한 제거: 조건에 맞는 모든 메일 저장
        const insert = db.prepare('INSERT INTO emails (received_at, subject, body, from_addr, todo_flag, unique_hash, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const exists = db.prepare('SELECT COUNT(*) as cnt FROM emails WHERE unique_hash = ?');
        const crypto = require('crypto');
        // ONNX 모델 기반 분류 제거: 키워드/패턴 기반 분류만 사용
        const { simpleParser } = require('mailparser');
        // extractDeadline 함수 main.js에서 복사
        function extractDeadline(body) {
          if (!body) return null;
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
        }
        for (const m of messages) {
          // 디버깅: 실제 파트 종류 확인
          console.log('IMAP parts:', m.parts.map(p => p.which));
          const rawPart = m.parts.find(p => p.which === '');
          if (!rawPart) continue;

          const raw = toBuffer(rawPart.body);
          const parsed = await simpleParser(raw);

          let body = parsed.text || '';
          if (!body && parsed.html) {
            const { htmlToText } = require('html-to-text');
            body = htmlToText(parsed.html, { wordwrap: false });
          }

          const subject = parsed.subject || '';
          const from = parsed.from?.text || '';
          const date = parsed.date?.toISOString() || '';

          const hash = crypto.createHash('sha256')
            .update(date + subject)
            .digest('hex');

          // 제목+본문에서 마감/요청 패턴이 있으면 todo_flag=1
          const text = (subject + ' ' + body).toLowerCase();
          // 마감일/요청 패턴 (예: 12월 30일까지 제출, 30일까지 회신, by 12-30, ~까지 요청 등)
          const deadlinePatterns = [
            /\d{1,2}월\s?\d{1,2}일.*(제출|요청|회신|완료|필요|해달라|해 주세요|해주십시오)/,
            /\d{1,2}일까지.*(제출|요청|회신|완료|필요|해달라|해 주세요|해주십시오)/,
            /\d{1,2}일.*(제출|요청|회신|완료|필요|해달라|해 주세요|해주십시오)/,
            /by\s+\d{1,2}[./-]\d{1,2}/i,
            /submit.*by.*\d{1,2}[./-]\d{1,2}/i,
            /~\s*\d{1,2}[./-]\d{1,2}.*(요청|제출|회신|필요)/i
          ];
          let todoFlag = 0;
          // 1차: AI 분류 제거, 키워드/패턴 기반만 사용
          // keyword 테이블 기반 분류(복합)
          try {
            const keywords = db.getAllKeywords ? db.getAllKeywords() : [];
            if (keywords.length > 0 && keywords.some(kw => kw && text.includes(kw.toLowerCase()))) {
              todoFlag = 1;
            }
          } catch (e) {
            console.error('keyword 테이블 조회 오류:', e);
          }
          // 기존 마감일/요청 패턴도 유지
          if (deadlinePatterns.some(re => text.match(re))) {
            todoFlag = 1;
          }

          // 마감일 추출 (제목+본문)
          const deadline = extractDeadline(subject + ' ' + body);
          if (exists.get(hash).cnt === 0) {
            insert.run(date, subject, body, from, todoFlag, hash, deadline);
          }
        }
        await conn.end();
        return { success: true, message: '연동완료!' };
      } catch (e) {
        console.error('IMAP 연동실패:', e && (e.stack || e.message || e));
        return { success: false, message: '연동실패: ' + (e && (e.stack || e.message || JSON.stringify(e))) };
      }
    } else {
      return { success: false, message: 'POP3는 미지원' };
    }
  });
}

module.exports = setupMailIpc;
