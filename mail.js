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
        const insert = db.prepare('INSERT INTO emails (received_at, subject, body, from_addr, todo_flag, unique_hash) VALUES (?, ?, ?, ?, ?, ?)');
        const exists = db.prepare('SELECT COUNT(*) as cnt FROM emails WHERE unique_hash = ?');
        const crypto = require('crypto');
        // ONNX 모델 기반 todo 분류 함수
        const ort = require('onnxruntime-node');
        let session = null;
        async function loadModel() {
          if (!session) {
            session = await ort.InferenceSession.create('todo_classifier.onnx');
          }
        }
        async function isTodoMail(text) {
          await loadModel();
          // 텍스트를 전처리하여 모델 입력에 맞게 변환 (예: 토크나이즈, 벡터화)
          // 아래는 예시: 실제 모델에 맞게 수정 필요
          const inputTensor = new ort.Tensor('string', [text], [1]);
          const feeds = { input: inputTensor };
          const results = await session.run(feeds);
          // 결과에서 todo 여부 추출 (예: softmax > 0.5)
          const score = results.output.data[0];
          return score > 0.8;
        }
        const { simpleParser } = require('mailparser');
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

          if (exists.get(hash).cnt === 0) {
            insert.run(date, subject, body, from, 0, hash);
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
