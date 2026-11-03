// Archive Tracker desktop window: the same website, in its own app, so a dropped file or folder gives
// its real full path (see preload.js). Pick which server it opens from the Server menu; the choice is kept.
const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const SERVERS = {
  production: { label: 'Production (vercel.app)', url: 'https://sarangpur-archive.vercel.app' },
  local: { label: 'Local (localhost:3000)', url: 'http://localhost:3000' },
};

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}
function writeSettings(next) {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...next }));
  } catch {
    /* settings are a convenience only */
  }
}

let win = null;

function currentServer() {
  const key = readSettings().server;
  return SERVERS[key] ? key : 'production';
}

function load(key) {
  writeSettings({ server: key });
  win?.loadURL(SERVERS[key].url);
  buildMenu();
}

function buildMenu() {
  const active = currentServer();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Server',
        submenu: Object.entries(SERVERS).map(([key, s]) => ({
          label: s.label,
          type: 'radio',
          checked: key === active,
          click: () => load(key),
        })),
      },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    ]),
  );
}

function createWindow() {
  const { width, height } = readSettings().bounds ?? { width: 1440, height: 900 };
  win = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e1116',
    title: 'Archive Tracker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // the preload needs `webUtils`
    },
  });

  // Links to other sites open in the normal browser; the app itself stays on its own server.
  const own = new Set(Object.values(SERVERS).map((s) => new URL(s.url).origin));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (own.has(new URL(url).origin)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!own.has(new URL(url).origin)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.on('close', () => writeSettings({ bounds: win.getBounds() }));
  win.on('closed', () => {
    win = null;
  });

  // A dropped file must never navigate the window away to open it: the page handles drops itself.
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file:')) e.preventDefault();
  });

  win.loadURL(SERVERS[currentServer()].url).catch(() => {
    // Server not reachable (for example Local without `npm run dev`): show a plain hint.
    void win?.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<body style="font:15px system-ui;background:#0e1116;color:#e6e9ef;padding:48px"><h2>Cannot reach the server</h2><p>Start it (Local: <code>npm run dev</code>) or choose another server from the Server menu.</p></body>',
        ),
    );
  });
}

// One window only: opening the app again focuses the first one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
