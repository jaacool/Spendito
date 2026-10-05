const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const isDev = !app.isPackaged;

let localServer = null;
const SERVER_PORT = 34567;
const DEV_SERVER_URL = 'http://localhost:8081';
const PROD_SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Only the PayPal OAuth login may open as an in-app popup: the backend's
// callback page hands the token back via window.opener.postMessage, which
// requires a real child window. Everything else opens in the system browser.
const IN_APP_POPUP_PREFIXES = ['https://www.paypal.com/signin/authorize'];

function isHttpUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Locks down navigation and window creation for the main window:
 * - window.open: PayPal login as hardened in-app popup, other http(s) links in
 *   the system browser, everything else denied.
 * - will-navigate: the main window may only stay on the app's own origin.
 */
function applySecurityHandlers(win, appOrigin) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (IN_APP_POPUP_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            // no preload script for third-party content
          },
        },
      };
    }
    if (isHttpUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Child windows (PayPal popup) may not open further windows or leave http(s)
  win.webContents.on('did-create-window', (child) => {
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (isHttpUrl(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    child.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('https://') && !url.startsWith('spendito://')) {
        event.preventDefault();
      }
    });
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (getOrigin(url) !== appOrigin) {
      event.preventDefault();
      if (isHttpUrl(url)) shell.openExternal(url);
    }
  });
}

console.log('App starting...');
console.log('isDev:', isDev);
console.log('__dirname:', __dirname);
console.log('app.isPackaged:', app.isPackaged);

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const expressApp = express();
    const distPath = path.join(__dirname, 'dist');
    
    console.log('Starting local server for dist folder:', distPath);
    
    // Serve static files from dist folder
    expressApp.use(express.static(distPath));
    
    // Fallback to index.html for SPA routing
    expressApp.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    
    localServer = expressApp.listen(SERVER_PORT, 'localhost', () => {
      console.log(`Local server running at ${PROD_SERVER_URL}`);
      resolve(PROD_SERVER_URL);
    });
    
    localServer.on('error', (err) => {
      console.error('Failed to start local server:', err);
      reject(err);
    });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Spendito',
    autoHideMenuBar: true,
  });

  applySecurityHandlers(win, isDev ? DEV_SERVER_URL : PROD_SERVER_URL);

  // DevTools only during development, never in the packaged app
  if (isDev) {
    win.webContents.openDevTools();
  }

  if (isDev) {
    // During development, load from the expo dev server
    console.log('Loading dev server...');
    win.loadURL(DEV_SERVER_URL).catch(err => {
      console.error('Failed to load dev server:', err);
    });
  } else {
    // In production, start local server and load from it
    // This is necessary because Expo Router doesn't work with file:// protocol
    try {
      const serverUrl = await startLocalServer();
      console.log('Loading from local server:', serverUrl);
      await win.loadURL(serverUrl);
    } catch (err) {
      console.error('Failed to start local server or load app:', err);
    }
  }

  // Log any console messages from the renderer
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer: ${message}`);
  });

  // Log navigation errors
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
}

// Ensure the dist directory exists before creating the window
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Close local server if running
  if (localServer) {
    console.log('Closing local server...');
    localServer.close();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Ensure server is closed on quit
  if (localServer) {
    localServer.close();
  }
});
