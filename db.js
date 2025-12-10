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
`);

module.exports = db;
