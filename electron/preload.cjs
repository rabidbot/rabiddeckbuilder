const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    run: (query, params) => ipcRenderer.invoke('db:run', query, params),
    all: (query, params) => ipcRenderer.invoke('db:all', query, params),
    exec: (sql) => ipcRenderer.invoke('db:exec', sql),
    save: () => ipcRenderer.invoke('db:save'),
  },
  dialog: {
    openCsv: () => ipcRenderer.invoke('dialog:openCsv'),
  },
  fs: {
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  },
  scryfall: {
    fetchCard: (scryfallId) => ipcRenderer.invoke('scryfall:fetchCard', scryfallId),
  },
  isElectron: true,
});
