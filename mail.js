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
        const fetchOptions = {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
          struct: true,
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
        for (const m of messages) {
          const header = m.parts.find(p => p.which.startsWith('HEADER'));
          const bodyPart = m.parts.find(p => p.which === 'TEXT');
          const subject = header && header.body.subject ? header.body.subject[0] : '';
          const from = header && header.body.from ? header.body.from[0] : '';
          const date = header && header.body.date ? header.body.date[0] : '';
          const body = bodyPart ? bodyPart.body : '';
          const text = (subject + ' ' + (body || '')).toLowerCase();
          // 광고성 메일 필터링
          const adKeywords = ['instagram', 'facebook', '온라인투어', 'onlinetour', '페이스북', '인스타그램'];
          const isAdMail = adKeywords.some(kw =>
            (from && from.toLowerCase().includes(kw)) ||
            (subject && subject.toLowerCase().includes(kw)) ||
            (body && body.toLowerCase().includes(kw))
          );
          // 마감일 패턴(몇일까지 제출 등)이 있는 경우만 todo로 분류
          let todoFlag = 0;
          if (!isAdMail) {
            // '몇일까지 제출' 등 마감일 패턴
            const deadlinePatterns = [
              /(\d{1,2})월\s?(\d{1,2})일.*제출/, // 12월 30일 제출
              /(\d{1,2})일까지.*제출/,            // 30일까지 제출
              /(\d{1,2})일.*제출/,                // 30일 제출
              /by\s+(\d{1,2})[./-](\d{1,2})/i,  // by 12-30
              /submit.*by.*(\d{1,2})[./-](\d{1,2})/i // submit by 12-30
            ];
            const hasDeadline = deadlinePatterns.some(re => text.match(re));
            if (hasDeadline) {
              try {
                todoFlag = await isTodoMail(text) ? 1 : 0;
              } catch (err) {
                todoFlag = 1; // 패턴이 있으면 백업으로 무조건 todo 처리
              }
            }
          }
          const hash = crypto.createHash('sha256').update(date + subject).digest('hex');
          if (exists.get(hash).cnt === 0) {
            insert.run(date, subject, body, from, todoFlag, hash);
          }
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
