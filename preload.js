const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  getTodos: () => ipcRenderer.invoke('get-todos'),
  openSettings: () => ipcRenderer.send('open-settings'),
  mailConnect: (info) => ipcRenderer.invoke('mail-connect', info),
  getEmails: () => ipcRenderer.invoke('get-emails'),
  openEmails: () => ipcRenderer.send('open-emails'),
  setEmailTodoFlag: (id, flag) => ipcRenderer.invoke('set-email-todo-flag', id, flag)
});
