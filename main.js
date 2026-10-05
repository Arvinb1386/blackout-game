'use strict';
const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { startServer, server } = require('./server');

// Linux Wayland/Hyprland compatibility: use in-process GPU to retain full hardware
// acceleration without out-of-process Vulkan swapchain failure.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('in-process-gpu');
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let runningServer = null;
let targetPort = parseInt(process.env.PORT, 10) || 8080;

function createWindow(loadUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1024,
    minHeight: 600,
    title: 'BLACKOUT',
    backgroundColor: '#0a0b0e',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove default menu bar for immersive gaming feel
  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window focus on second-instance launch
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // F11 fullscreen toggle
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (loadUrl) {
    mainWindow.loadURL(loadUrl).catch((err) => {
      console.warn('[Electron] Failed to load URL, falling back to local file:', err.message);
      mainWindow.loadFile(path.join(__dirname, 'index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }
}

app.whenReady().then(() => {
  // Start internal game and controller WebSocket server
  startServer(targetPort, (err, info) => {
    if (err) {
      console.warn('[Electron] Could not bind server to port ' + targetPort + ' (' + err.message + ').');
      // If port 8080 is in use, try dynamic port 0
      if (err.code === 'EADDRINUSE' && targetPort !== 0) {
        console.log('[Electron] Retrying on a dynamic available port...');
        targetPort = 0;
        startServer(0, (err2, info2) => {
          if (err2) {
            console.error('[Electron] Fallback to direct file loading:', err2.message);
            createWindow(null);
          } else {
            runningServer = server;
            const actualPort = server.address().port;
            createWindow(`http://localhost:${actualPort}`);
          }
        });
        return;
      }
      createWindow(null);
      return;
    }

    runningServer = server;
    createWindow(`http://localhost:${info.port}`);
  });
});

app.on('window-all-closed', () => {
  if (runningServer) {
    try { runningServer.close(); } catch (_) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/* -------------------- In-App Auto Updater (electron-updater) -------------------- */
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

ipcMain.handle('check-update', async () => {
  try {
    const res = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: res ? res.updateInfo : null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  try {
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-not-available', info);
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) mainWindow.webContents.send('download-progress', progress);
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
});

autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('update-error', err ? err.message : 'Update error');
});

/* -------------------- Safe File-Based Save Persistence -------------------- */
ipcMain.handle('save-game-file', async (_e, { key, data }) => {
  try {
    const saveDir = path.join(app.getPath('userData'), 'saves');
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    const safeKey = (key || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(saveDir, `${safeKey}.json`);
    fs.writeFileSync(filePath, typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
    return { success: true };
  } catch (err) {
    console.warn('[Main] Failed to save backup to file:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-game-file', async (_e, { key }) => {
  try {
    const saveDir = path.join(app.getPath('userData'), 'saves');
    const safeKey = (key || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(saveDir, `${safeKey}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, data: content };
    }
    return { success: false, data: null };
  } catch (err) {
    console.warn('[Main] Failed to load backup from file:', err.message);
    return { success: false, error: err.message };
  }
});

