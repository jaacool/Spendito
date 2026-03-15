const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;

console.log('App starting...');
console.log('isDev:', isDev);
console.log('__dirname:', __dirname);
console.log('app.isPackaged:', app.isPackaged);

function createWindow() {
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

  // Always open DevTools for debugging
  win.webContents.openDevTools();

  if (isDev) {
    // During development, load from the expo dev server
    console.log('Loading dev server...');
    win.loadURL('http://localhost:8081').catch(err => {
      console.error('Failed to load dev server:', err);
    });
  } else {
    // In production, load the built files
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log('Loading production build from:', indexPath);
    console.log('File exists:', fs.existsSync(indexPath));
    
    if (fs.existsSync(indexPath)) {
      win.loadFile(indexPath).catch(err => {
        console.error('Failed to load index.html:', err);
      });
    } else {
      console.error('index.html not found at:', indexPath);
      console.log('Directory contents:', fs.readdirSync(__dirname));
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
