const Database = require('better-sqlite3');
const db = new Database('todo.db');

db.exec(`
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  dday TEXT NOT NULL,
  task TEXT NOT NULL
);
DELETE FROM todos;
INSERT INTO todos (date, dday, task) VALUES ('12/30', 'D-100', '할일100');
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  from_addr TEXT NOT NULL,
  todo_flag INTEGER DEFAULT 0,
  unique_hash TEXT
);

CREATE TABLE IF NOT EXISTS mail_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mail_type TEXT,
  protocol TEXT,
  mail_id TEXT,
  mail_pw TEXT,
  mail_since TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
