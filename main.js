const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const crypto = require('crypto');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const http = require('http');
const url = require('url');
const open = require('open');

// ─────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = '972705955264-1r2bivpb0ece9bvvs8vbe0tuklru9761.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/auth/callback';

let mainWindow;
let oauthServer;
let pendingOAuthState = null;
const store = new Store({
  name: 'medication-manager',
  schema: {
    accessToken: { type: 'string', default: null },
    refreshToken: { type: 'string', default: null },
    expiresAt: { type: 'number', default: null },
    darkMode: { type: 'boolean', default: false }
  }
});

// ─────────────────────────────────────────────────────────────────
// App ready
// ─────────────────────────────────────────────────────────────────

app.on('ready', () => {
  createWindow();
  startOAuthServer();
  
  // Setup auto-updates (check every hour) — only when packaged
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 3600000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

// ─────────────────────────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      sandbox: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createMenu();
}

// ─────────────────────────────────────────────────────────────────
// Application menu
// ─────────────────────────────────────────────────────────────────

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─────────────────────────────────────────────────────────────────
// OAuth Server (handles redirects from Google)
// ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function startOAuthServer() {
  oauthServer = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // Serve simple callback page and extract auth code
    if (parsedUrl.pathname === '/auth/callback') {
      const code = parsedUrl.query.code;
      const error = parsedUrl.query.error;
      const state = parsedUrl.query.state;

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<h1>Auth Error</h1><p>${escapeHtml(error)}</p><p>Return to the app to try again.</p>`);
        return;
      }

      if (!state || state !== pendingOAuthState) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid state parameter');
        return;
      }
      pendingOAuthState = null;

      if (code) {
        try {
          // Exchange code for tokens
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              code,
              grant_type: 'authorization_code',
              redirect_uri: REDIRECT_URI
            })
          });

          const tokenData = await tokenRes.json();

          if (tokenData.access_token) {
            // Store tokens
            store.set({
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token || store.get('refreshToken'),
              expiresAt: Date.now() + (tokenData.expires_in * 1000)
            });

            // Notify renderer
            if (mainWindow) {
              mainWindow.webContents.send('auth:success', {
                accessToken: tokenData.access_token
              });
            }

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f0f0;">
                  <div style="text-align: center;">
                    <h1>✓ Authentication successful</h1>
                    <p>You can close this window and return to the app.</p>
                  </div>
                </body>
              </html>
            `);
          } else {
            throw new Error('No access token in response');
          }
        } catch (err) {
          console.error('Token exchange error:', err);
          if (mainWindow) {
            mainWindow.webContents.send('auth:error', {
              message: 'Token exchange failed: ' + err.message
            });
          }
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Token Error</h1><p>${escapeHtml(err.message)}</p>`);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing "code" parameter');
        return;
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  oauthServer.listen(3000, '127.0.0.1', () => {
    console.log('OAuth server listening on http://127.0.0.1:3000');
  });
}

// ─────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────

ipcMain.handle('auth:get-token', async () => {
  let token = store.get('accessToken');
  const expiresAt = store.get('expiresAt');

  // Refresh if expired
  if (token && expiresAt && Date.now() > expiresAt) {
    try {
      token = await refreshAccessToken();
    } catch (err) {
      console.error('Token refresh failed:', err);
      return null;
    }
  }

  return token;
});

ipcMain.handle('auth:start-login', async () => {
  pendingOAuthState = crypto.randomBytes(32).toString('hex');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', pendingOAuthState);

  // Open browser
  open(authUrl.toString());
});

ipcMain.handle('auth:logout', async () => {
  store.delete('accessToken');
  store.delete('refreshToken');
  store.delete('expiresAt');
  return true;
});

ipcMain.handle('storage:set', async (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('storage:get', async (event, key) => {
  return store.get(key);
});

ipcMain.handle('storage:delete', async (event, key) => {
  store.delete(key);
  return true;
});

ipcMain.handle('app:check-update', async () => {
  const result = await autoUpdater.checkForUpdates();
  return {
    updateAvailable: result.updateInfo.version !== app.getVersion(),
    currentVersion: app.getVersion(),
    latestVersion: result.updateInfo.version
  };
});

// ─────────────────────────────────────────────────────────────────
// Token refresh
// ─────────────────────────────────────────────────────────────────

async function refreshAccessToken() {
  const refreshToken = store.get('refreshToken');
  if (!refreshToken) throw new Error('No refresh token');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('No access token in refresh response');

  store.set({
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  });

  return data.access_token;
}

// ─────────────────────────────────────────────────────────────────
// Auto-update events
// ─────────────────────────────────────────────────────────────────

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'A new version is available. The app will restart to install it.',
    buttons: ['Install', 'Later']
  }).then(result => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err);
});
