const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const isDev = !app.isPackaged;

let mainWindow = null;
let db = null;

app.whenReady().then(async () => {
  const { default: initSqlJs } = require('sql.js');
  const dbPath = path.join(app.getPath('userData'), 'edh-deckbuilder.db');

  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      const SQL = await initSqlJs();
      db = new SQL.Database(buffer);
    } else {
      const SQL = await initSqlJs();
      db = new SQL.Database();
    }
    createWindow();
    setupIPC();
  } catch (err) {
    console.error('Failed to initialize database:', err);
    const SQL = await initSqlJs();
    db = new SQL.Database();
    createWindow();
    setupIPC();
  }
});

let server = null;

function getMime(ext) {
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
  };
  return types[ext] || 'application/octet-stream';
}

function createWindow() {
  if (!isDev) {
    const distDir = path.join(app.getAppPath(), 'dist');
    server = http.createServer((req, res) => {
      const filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url.replace(/\?.*/, ''));
      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': getMime(path.extname(filePath)),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3456;
      openWindow(port);
    });
  } else {
    openWindow(5173);
  }
}

function openWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'EDH Deck Builder',
    backgroundColor: '#faf7f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDesc, url) => {
    console.error(`Failed to load ${url}: ${errorCode} - ${errorDesc}`);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  }
}

app.on('window-all-closed', () => {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dbPath = path.join(app.getPath('userData'), 'edh-deckbuilder.db');
    fs.writeFileSync(dbPath, buffer);
    db.close();
  }
  if (server) {
    server.close();
  }
  app.quit();
});

function setupIPC() {
  ipcMain.handle('db:run', (_event, query, params) => {
    try {
      db.run(query, params);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('db:all', (_event, query, params) => {
    try {
      const stmt = db.prepare(query);
      if (params) stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return { ok: true, rows };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('db:exec', (_event, sql) => {
    try {
      db.exec(sql);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('db:save', () => {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      const dbPath = path.join(app.getPath('userData'), 'edh-deckbuilder.db');
      fs.writeFileSync(dbPath, buffer);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('dialog:openCsv', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import ManaBox Collection CSV',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    try {
      return { ok: true, content: fs.readFileSync(filePath, 'utf-8') };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  let scryfallQueue = [];
  let scryfallTimer = null;
  const SCRYFALL_DELAY = 80;

  function processScryfallQueue() {
    if (scryfallQueue.length === 0) {
      scryfallTimer = null;
      return;
    }
    const { id, resolve } = scryfallQueue.shift();
    const request = net.request(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`);
    request.on('response', (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk.toString(); });
      response.on('end', () => {
        try {
          if (response.statusCode === 200) {
            resolve({ ok: true, data: JSON.parse(body) });
          } else {
            resolve({ ok: false, error: `HTTP ${response.statusCode}` });
          }
        } catch (err) {
          resolve({ ok: false, error: err.message });
        }
      });
    });
    request.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    request.end();
    scryfallTimer = setTimeout(processScryfallQueue, SCRYFALL_DELAY);
  }

  ipcMain.handle('scryfall:fetchCard', async (_event, scryfallId) => {
    return new Promise((resolve) => {
      scryfallQueue.push({ id: scryfallId, resolve });
      if (!scryfallTimer) processScryfallQueue();
    });
  });
}
