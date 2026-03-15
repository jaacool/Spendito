const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const isDev = !app.isPackaged;

let localServer = null;
const SERVER_PORT = 34567;

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
      console.log(`Local server running at http://localhost:${SERVER_PORT}`);
      resolve(`http://localhost:${SERVER_PORT}`);
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

  // Always open DevTools for debugging
  win.webContents.openDevTools();

  if (isDev) {
    // During development, load from the expo dev server
    console.log('Loading dev server...');
    win.loadURL('http://localhost:8081').catch(err => {
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
