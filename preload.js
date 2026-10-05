'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, isolated update methods to the renderer process
contextBridge.exposeInMainWorld('electronUpdater', {
  isElectron: true,
  checkForUpdates: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (cb) => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.on('update-available', (_e, info) => cb(info));
  },
  onUpdateNotAvailable: (cb) => {
    ipcRenderer.removeAllListeners('update-not-available');
    ipcRenderer.on('update-not-available', (_e, info) => cb(info));
  },
  onDownloadProgress: (cb) => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_e, progress) => cb(progress));
  },
  onUpdateDownloaded: (cb) => {
    ipcRenderer.removeAllListeners('update-downloaded');
    ipcRenderer.on('update-downloaded', (_e, info) => cb(info));
  },
  onError: (cb) => {
    ipcRenderer.removeAllListeners('update-error');
    ipcRenderer.on('update-error', (_e, err) => cb(err));
  },
});

// Expose safe file-based save persistence to preserve saves across reinstalls
contextBridge.exposeInMainWorld('electronStorage', {
  saveToFile: (key, data) => ipcRenderer.invoke('save-game-file', { key, data }),
  loadFromFile: (key) => ipcRenderer.invoke('load-game-file', { key }),
});

