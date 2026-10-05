'use strict';
const { app, BrowserWindow, Menu, globalShortcut, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
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

/* -------------------- In-App Auto Updater & Direct Downloader -------------------- */
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let downloadedInstallerPath = null;
let isDownloading = false;

function isRunningPortable() {
  return !!(
    process.env.PORTABLE_EXECUTABLE_DIR ||
    process.env.PORTABLE_EXECUTABLE_FILE ||
    (app.getPath('exe') && app.getPath('exe').toLowerCase().includes('portable'))
  );
}

function fetchLatestGitHubRelease() {
  return new Promise((resolve, reject) => {
    const url = 'https://api.github.com/repos/Arvinb1386/blackout-game/releases/latest';
    https.get(url, {
      headers: {
        'User-Agent': 'Blackout-Game',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('GitHub API HTTP ' + res.statusCode));
      }
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadFileWithProgress(url, destPath, onProgress, maxRedirects = 8) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects while downloading update'));
    }

    const client = url.startsWith('http:') ? http : https;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Blackout-Game-Updater',
        'Accept': 'application/octet-stream, application/vnd.github.v3+json, */*'
      }
    }, (res) => {
      // Follow HTTP redirects (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).href;
        return downloadFileWithProgress(nextUrl, destPath, onProgress, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Server returned HTTP ${res.statusCode}: ${res.statusMessage}`));
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let receivedBytes = 0;
      let lastTime = Date.now();
      let lastBytes = 0;
      let lastEmitTime = 0;

      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileStream = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        receivedBytes += chunk.length;
        const now = Date.now();

        // Throttle progress emissions to every 80ms
        if (now - lastEmitTime >= 80 || receivedBytes === totalBytes) {
          const dt = (now - lastTime) / 1000;
          let bytesPerSecond = 0;
          if (dt > 0.08) {
            bytesPerSecond = Math.round((receivedBytes - lastBytes) / dt);
            lastTime = now;
            lastBytes = receivedBytes;
          }
          const percent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;
          if (typeof onProgress === 'function') {
            onProgress({
              percent,
              transferred: receivedBytes,
              total: totalBytes,
              bytesPerSecond
            });
          }
          lastEmitTime = now;
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve(destPath));
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });

      res.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

ipcMain.handle('check-update', async () => {
  try {
    if (app.isPackaged) {
      try {
        const res = await autoUpdater.checkForUpdates();
        if (res && res.updateInfo) {
          return { success: true, updateInfo: res.updateInfo, source: 'electron-updater' };
        }
      } catch (err) {
        console.warn('[Main] autoUpdater check returned error, checking GitHub directly:', err.message);
      }
    }
    const release = await fetchLatestGitHubRelease();
    return { success: true, updateInfo: release, source: 'direct' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download-update', async (_e, options) => {
  if (isDownloading) {
    return { success: false, error: 'Download already in progress' };
  }

  // If electron-updater can download (packaged NSIS) and no specific downloadUrl was forced
  if (app.isPackaged && (!options || !options.downloadUrl)) {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true, method: 'electron-updater' };
    } catch (err) {
      console.warn('[Main] autoUpdater.downloadUpdate failed, falling back to direct stream:', err.message);
    }
  }

  // Fallback / direct streaming download:
  try {
    isDownloading = true;
    let targetUrl = options && options.downloadUrl;
    let targetFileName = options && options.filename;
    let version = options && options.version;

    if (!targetUrl) {
      const release = await fetchLatestGitHubRelease();
      version = release.tag_name || release.name;
      if (release && Array.isArray(release.assets)) {
        const isPortable = isRunningPortable();
        let asset = null;
        if (isPortable) {
          asset = release.assets.find(a => a.name.includes('Portable') && a.name.endsWith('.exe'));
        }
        if (!asset) {
          asset = release.assets.find(a => a.name.endsWith('.exe') && !a.name.includes('.blockmap'));
        }
        if (asset) {
          targetUrl = asset.browser_download_url;
          targetFileName = asset.name;
        }
      }
    }

    if (!targetUrl) {
      isDownloading = false;
      throw new Error('No downloadable installer asset found in release');
    }

    const tempDir = app.getPath('temp');
    const safeFileName = (targetFileName || 'Blackout-Update-Setup.exe').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const destPath = path.join(tempDir, safeFileName);

    await downloadFileWithProgress(targetUrl, destPath, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-progress', progress);
      }
    });

    downloadedInstallerPath = destPath;
    isDownloading = false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: version || 'latest',
        path: destPath,
        fileName: safeFileName
      });
    }

    return { success: true, method: 'direct', path: destPath };
  } catch (err) {
    isDownloading = false;
    console.error('[Main] Direct download failed:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', err.message || 'Download failed');
    }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  try {
    if (downloadedInstallerPath && fs.existsSync(downloadedInstallerPath)) {
      console.log('[Main] Launching downloaded installer:', downloadedInstallerPath);
      const isExe = downloadedInstallerPath.toLowerCase().endsWith('.exe');
      if (isExe) {
        const child = spawn(downloadedInstallerPath, [], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      } else {
        shell.openPath(downloadedInstallerPath);
      }

      if (runningServer) {
        try { runningServer.close(); } catch (_) {}
      }

      setTimeout(() => {
        app.quit();
      }, 300);

      return { success: true };
    }

    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (err) {
    console.error('[Main] install-update failed:', err);
    return { success: false, error: err.message };
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-not-available', info);
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-progress', progress);
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-downloaded', info);
});

autoUpdater.on('error', (err) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-error', err ? err.message : 'Update error');
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

