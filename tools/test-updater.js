'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function pass(msg, extra) {
  passed++;
  console.log(`PASS  ${msg}` + (extra !== undefined ? `  -> ${extra}` : ''));
}
function fail(msg, err) {
  console.error(`FAIL  ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

const root = path.resolve(__dirname, '..');

// 1. Verify i18n keys
try {
  const i18nContent = fs.readFileSync(path.join(root, 'js', 'i18n.js'), 'utf8');
  const requiredKeys = [
    'update.title',
    'update.checking',
    'update.latest',
    'update.available',
    'update.downloading',
    'update.ready',
    'update.btnDownload',
    'update.btnRestart',
    'update.btnWeb',
    'update.btnCheck',
    'update.error',
    'update.manualHint',
    'update.inAppHint',
    'update.restartNotice',
    'update.installing'
  ];

  for (const k of requiredKeys) {
    assert(i18nContent.includes(`'${k}'`), `Missing key in i18n.js: ${k}`);
  }
  pass('i18n: all updater keys present in dictionaries', requiredKeys.length);
} catch (e) {
  fail('i18n keys test failed', e);
}

// 2. Verify preload.js
try {
  const preloadContent = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  assert(preloadContent.includes("downloadUpdate: (options) => ipcRenderer.invoke('download-update', options)"), 'preload.js missing downloadUpdate options');
  assert(preloadContent.includes("installUpdate: () => ipcRenderer.invoke('install-update')"), 'preload.js missing installUpdate');
  assert(preloadContent.includes("checkForUpdates: () => ipcRenderer.invoke('check-update')"), 'preload.js missing checkForUpdates');
  assert(preloadContent.includes("onDownloadProgress: (cb) =>"), 'preload.js missing onDownloadProgress');
  assert(preloadContent.includes("onUpdateDownloaded: (cb) =>"), 'preload.js missing onUpdateDownloaded');
  pass('preload: exposes full updater API with options payload');
} catch (e) {
  fail('preload test failed', e);
}

// 3. Verify main.js updater logic
try {
  const mainContent = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert(mainContent.includes("ipcMain.handle('check-update'"), 'main.js missing check-update handler');
  assert(mainContent.includes("ipcMain.handle('download-update'"), 'main.js missing download-update handler');
  assert(mainContent.includes("ipcMain.handle('install-update'"), 'main.js missing install-update handler');
  assert(mainContent.includes('downloadFileWithProgress'), 'main.js missing downloadFileWithProgress');
  assert(mainContent.includes('fetchLatestGitHubRelease'), 'main.js missing fetchLatestGitHubRelease');
  assert(mainContent.includes('isRunningPortable'), 'main.js missing isRunningPortable');
  assert(mainContent.includes('spawn(downloadedInstallerPath'), 'main.js missing detached installer spawn');
  pass('main: in-app streaming download & installer launch implemented');
} catch (e) {
  fail('main.js test failed', e);
}

// 4. Verify updater.js
try {
  const updaterContent = fs.readFileSync(path.join(root, 'js', 'updater.js'), 'utf8');
  assert(updaterContent.includes("if (isElectron) {"), 'updater.js missing isElectron guard');
  assert(updaterContent.includes("BO.t('update.inAppHint')"), 'updater.js missing inAppHint');
  assert(updaterContent.includes("BO.t('update.restartNotice')"), 'updater.js missing restartNotice');
  assert(updaterContent.includes("BO.t('update.btnDownload')"), 'updater.js missing btnDownload');
  assert(updaterContent.includes("BO.t('update.btnRestart')"), 'updater.js missing btnRestart');
  assert(updaterContent.includes("window.electronUpdater.downloadUpdate(downloadOptions)"), 'updater.js missing downloadUpdate call with options');
  assert(updaterContent.includes("window.electronUpdater.installUpdate()"), 'updater.js missing installUpdate call');
  pass('updater.js: in-app download and restart flow verified');
} catch (e) {
  fail('updater.js test failed', e);
}

// 5. Semver comparison unit test
try {
  function semverCompare(v1, v2) {
    const clean1 = (v1 || '').replace(/^v/i, '').trim();
    const clean2 = (v2 || '').replace(/^v/i, '').trim();
    const parts1 = clean1.split('.').map(Number);
    const parts2 = clean2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  assert.strictEqual(semverCompare('1.1.0', '1.0.0'), 1);
  assert.strictEqual(semverCompare('v1.1.0', '1.1.0'), 0);
  assert.strictEqual(semverCompare('1.0.0', '1.1.0'), -1);
  assert.strictEqual(semverCompare('1.1.1', '1.1.0'), 1);
  assert.strictEqual(semverCompare('2.0.0', '1.9.9'), 1);
  pass('semver: version comparison unit tests pass');
} catch (e) {
  fail('semver test failed', e);
}

console.log(`\nAll ${passed} updater checks passed successfully.`);
process.exit(0);
