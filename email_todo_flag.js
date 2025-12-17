// 이메일 제목/본문에서 to-do(할일, 제출, 검토, 기한 등) 키워드가 있으면 todo_flag=1로 업데이트
// (간단한 키워드 기반, 추후 onnxruntime-node 연동 가능)

const db = require('./db');

const TODO_KEYWORDS = [
  '할일', '제출', '마감', '기한', '검토', '확인', '필수', '요청', '과제', '숙제', 'deadline', 'due', 'todo', 'assignment', 'report'
];

function markTodoEmails() {
  const emails = db.prepare('SELECT id, subject, body FROM emails WHERE todo_flag = 0').all();
  const update = db.prepare('UPDATE emails SET todo_flag = 1 WHERE id = ?');
  for (const mail of emails) {
    const text = (mail.subject + ' ' + (mail.body || '')).toLowerCase();
    if (TODO_KEYWORDS.some(k => text.includes(k))) {
      update.run(mail.id);
    }
  }
}

if (require.main === module) {
  markTodoEmails();
  console.log('이메일 todo_flag 업데이트 완료');
}

module.exports = markTodoEmails;

// emails 테이블에서 todo_flag=1인 이메일을 todos 테이블에 할일로 추가
function addTodosFromEmailTodos() {
  const emails = db.prepare('SELECT id, subject, body, deadline FROM emails WHERE todo_flag = 1').all();
  const insertTodo = db.prepare('INSERT INTO todos (date, dday, task, memo, deadline, todo_flag) VALUES (?, ?, ?, ?, ?, 1)');
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
  for (const mail of emails) {
    // 이미 같은 제목의 할일이 있으면 중복 추가 방지
    const exists = db.prepare('SELECT COUNT(*) as cnt FROM todos WHERE task = ? AND todo_flag = 1').get(mail.subject).cnt;
    if (exists === 0) {
      insertTodo.run(
        today, // date
        '',    // dday
        mail.subject, // task
        mail.body || '', // memo
        mail.deadline || '' // deadline
      );
    }
  }
}

module.exports.addTodosFromEmailTodos = addTodosFromEmailTodos;
