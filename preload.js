const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  getTodos: () => ipcRenderer.invoke('get-todos'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openKeyword: () => ipcRenderer.send('open-keyword'),
  getKeywords: () => ipcRenderer.invoke('get-keywords'),
  insertKeyword: (kw) => ipcRenderer.invoke('insert-keyword', kw),
  updateKeyword: (oldKw, newKw) => ipcRenderer.invoke('update-keyword', oldKw, newKw),
  deleteKeyword: (kw) => ipcRenderer.invoke('delete-keyword', kw),
  mailConnect: (info) => ipcRenderer.invoke('mail-connect', info),
  getEmails: () => ipcRenderer.invoke('get-emails'),
  openEmails: () => ipcRenderer.send('open-emails'),
  setEmailTodoFlag: (id, flag) => ipcRenderer.invoke('set-email-todo-flag', id, flag),
  setEmailTodoComplete: (id) => ipcRenderer.invoke('set-email-todo-complete', id),
  getMailSettings: () => ipcRenderer.invoke('get-mail-settings'),
  saveMailSettings: (settings) => ipcRenderer.invoke('save-mail-settings', settings),
  saveMemo: (id, memo) => ipcRenderer.invoke('save-memo', id, memo),
  insertTodo: (todo) => ipcRenderer.invoke('insert-todo', todo)
});
