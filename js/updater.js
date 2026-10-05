/* =========================================================================
 * BLACKOUT :: updater.js
 * In-App & Web Auto-Updater integration.
 * Supports:
 *  1. Electron native updater (electron-updater via preload IPC) for installed Setup.exe
 *  2. GitHub Releases API fallback for web browser / portable testing
 * ========================================================================= */
'use strict';
(function (BO) {
  const APP_VERSION = (typeof window !== 'undefined' && window.electronUpdater && window.electronUpdater.appVersion) || '1.1.0';
  const GITHUB_REPO = 'Arvinb1386/blackout-game';
  const RELEASES_API = 'https://api.github.com/repos/' + GITHUB_REPO + '/releases/latest';
  const RELEASES_URL = 'https://github.com/' + GITHUB_REPO + '/releases';

  let modalEl = null;
  let statusTextEl = null;
  let spinnerEl = null;
  let versionsEl = null;
  let currVerEl = null;
  let targetVerEl = null;
  let progressWrapEl = null;
  let progressFillEl = null;
  let progressPercentEl = null;
  let progressSpeedEl = null;
  let detailsEl = null;
  let hintEl = null;
  let actionBtnEl = null;

  let state = 'idle'; // 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'web_available' | 'error'
  let latestReleaseInfo = null;
  let isElectron = false;
  let listenersAttached = false;

  function initElements() {
    if (!modalEl) {
      modalEl = document.getElementById('update-modal');
    }
    if (!modalEl) return;
    statusTextEl = document.getElementById('update-status-text');
    spinnerEl = document.getElementById('update-spinner');
    versionsEl = document.getElementById('update-versions');
    currVerEl = document.getElementById('update-curr-ver');
    targetVerEl = document.getElementById('update-target-ver');
    progressWrapEl = document.getElementById('update-progress-wrap');
    progressFillEl = document.getElementById('update-progress-fill');
    progressPercentEl = document.getElementById('update-progress-percent');
    progressSpeedEl = document.getElementById('update-progress-speed');
    detailsEl = document.getElementById('update-details');
    hintEl = document.getElementById('update-hint');
    actionBtnEl = document.getElementById('update-action-btn');

    const badge = document.getElementById('update-badge');
    if (badge) badge.textContent = 'v' + APP_VERSION;
    if (currVerEl) currVerEl.textContent = 'v' + APP_VERSION;

    isElectron = !!(window.electronUpdater && window.electronUpdater.isElectron);

    if (isElectron && !listenersAttached) {
      listenersAttached = true;
      window.electronUpdater.onUpdateAvailable((info) => {
        onElectronUpdateAvailable(info);
      });
      window.electronUpdater.onUpdateNotAvailable((info) => {
        onElectronUpdateNotAvailable(info);
      });
      window.electronUpdater.onDownloadProgress((prog) => {
        onElectronDownloadProgress(prog);
      });
      window.electronUpdater.onUpdateDownloaded((info) => {
        onElectronUpdateDownloaded(info);
      });
      window.electronUpdater.onError((err) => {
        onElectronError(err);
      });
    }
  }

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

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
  }

  function setStatus(text, showSpinner) {
    if (statusTextEl) statusTextEl.textContent = text;
    if (spinnerEl) spinnerEl.style.display = showSpinner ? 'inline-block' : 'none';
  }

  function checkUpdates() {
    initElements();
    state = 'checking';
    setStatus(BO.t('update.checking'), true);

    if (versionsEl) versionsEl.style.display = 'none';
    if (progressWrapEl) progressWrapEl.style.display = 'none';
    if (detailsEl) detailsEl.style.display = 'none';
    if (hintEl) hintEl.style.display = 'none';
    if (actionBtnEl) actionBtnEl.style.display = 'none';

    if (isElectron) {
      window.electronUpdater.checkForUpdates().then((res) => {
        if (!res || !res.success) {
          const err = (res && res.error) ? res.error : 'Updater check failed';
          console.warn('[Updater] electron-updater check returned error, falling back to web check:', err);
          checkWebUpdates(err);
        }
      }).catch((err) => {
        console.warn('[Updater] electron-updater IPC call failed:', err);
        checkWebUpdates(err.message || String(err));
      });
    } else {
      checkWebUpdates();
    }
  }

  function onElectronUpdateAvailable(info) {
    state = 'available';
    latestReleaseInfo = info;
    const newVer = (info && info.version) ? ('v' + info.version) : 'New version';
    setStatus(BO.t('update.available', { version: newVer }), false);

    if (versionsEl) {
      versionsEl.style.display = 'flex';
      if (currVerEl) currVerEl.textContent = 'v' + APP_VERSION;
      if (targetVerEl) targetVerEl.textContent = newVer;
    }

    if (info && info.releaseNotes && detailsEl) {
      detailsEl.style.display = 'block';
      detailsEl.textContent = typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : JSON.stringify(info.releaseNotes, null, 2);
    }

    if (actionBtnEl) {
      actionBtnEl.style.display = 'inline-block';
      actionBtnEl.textContent = BO.t('update.btnDownload');
      actionBtnEl.className = 'btn primary';
    }
  }

  function onElectronUpdateNotAvailable(info) {
    state = 'latest';
    const ver = 'v' + APP_VERSION;
    setStatus(BO.t('update.latest', { version: ver }), false);

    if (versionsEl) {
      versionsEl.style.display = 'flex';
      if (currVerEl) currVerEl.textContent = ver;
      if (targetVerEl) targetVerEl.textContent = ver;
    }

    if (actionBtnEl) {
      actionBtnEl.style.display = 'inline-block';
      actionBtnEl.textContent = BO.t('update.btnCheck');
      actionBtnEl.className = 'btn';
    }
  }

  function onElectronDownloadProgress(prog) {
    state = 'downloading';
    const percent = Math.round(prog.percent || 0);
    setStatus(BO.t('update.downloading', { percent: percent }), true);

    if (progressWrapEl) progressWrapEl.style.display = 'flex';
    if (progressFillEl) progressFillEl.style.width = percent + '%';
    if (progressPercentEl) progressPercentEl.textContent = percent + '%';
    if (progressSpeedEl && prog.bytesPerSecond) {
      progressSpeedEl.textContent = formatBytes(prog.bytesPerSecond) + '/s';
    }

    if (actionBtnEl) actionBtnEl.style.display = 'none';
  }

  function onElectronUpdateDownloaded(info) {
    state = 'downloaded';
    setStatus(BO.t('update.ready'), false);

    if (progressWrapEl) {
      progressWrapEl.style.display = 'flex';
      if (progressFillEl) progressFillEl.style.width = '100%';
      if (progressPercentEl) progressPercentEl.textContent = '100%';
      if (progressSpeedEl) progressSpeedEl.textContent = '';
    }

    if (actionBtnEl) {
      actionBtnEl.style.display = 'inline-block';
      actionBtnEl.textContent = BO.t('update.btnRestart');
      actionBtnEl.className = 'btn primary';
    }
  }

  function onElectronError(err) {
    console.warn('[Updater] electron-updater error:', err);
    if (state === 'checking') {
      checkWebUpdates(err);
    } else {
      state = 'error';
      setStatus(BO.t('update.error', { error: err }), false);
      if (actionBtnEl) {
        actionBtnEl.style.display = 'inline-block';
        actionBtnEl.textContent = BO.t('update.btnCheck');
        actionBtnEl.className = 'btn';
      }
    }
  }

  async function checkWebUpdates(originalErr) {
    try {
      const resp = await fetch(RELEASES_API, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });

      if (!resp.ok) {
        if (resp.status === 404) {
          state = 'latest';
          setStatus(BO.t('update.latest', { version: 'v' + APP_VERSION }), false);
          if (versionsEl) {
            versionsEl.style.display = 'flex';
            if (currVerEl) currVerEl.textContent = 'v' + APP_VERSION;
            if (targetVerEl) targetVerEl.textContent = 'v' + APP_VERSION;
          }
          if (actionBtnEl) {
            actionBtnEl.style.display = 'inline-block';
            actionBtnEl.textContent = BO.t('update.btnCheck');
            actionBtnEl.className = 'btn';
          }
          return;
        }
        throw new Error('HTTP ' + resp.status);
      }

      const release = await resp.json();
      latestReleaseInfo = release;
      const tag = release.tag_name || release.name || '';
      const hasUpdate = semverCompare(tag, APP_VERSION) > 0;

      if (versionsEl) {
        versionsEl.style.display = 'flex';
        if (currVerEl) currVerEl.textContent = 'v' + APP_VERSION;
        if (targetVerEl) targetVerEl.textContent = tag || ('v' + APP_VERSION);
      }

      if (hasUpdate) {
        state = 'web_available';
        setStatus(BO.t('update.available', { version: tag }), false);
        if (hintEl) hintEl.style.display = 'block';
        if (release.body && detailsEl) {
          detailsEl.style.display = 'block';
          detailsEl.textContent = release.body;
        }
        if (actionBtnEl) {
          actionBtnEl.style.display = 'inline-block';
          actionBtnEl.textContent = BO.t('update.btnWeb');
          actionBtnEl.className = 'btn primary';
        }
      } else {
        state = 'latest';
        setStatus(BO.t('update.latest', { version: 'v' + APP_VERSION }), false);
        if (actionBtnEl) {
          actionBtnEl.style.display = 'inline-block';
          actionBtnEl.textContent = BO.t('update.btnCheck');
          actionBtnEl.className = 'btn';
        }
      }
    } catch (err) {
      state = 'error';
      console.warn('[Updater] GitHub API fetch failed:', err);
      const msg = err.message || originalErr || 'Network error';
      setStatus(BO.t('update.error', { error: msg }), false);
      if (hintEl) {
        hintEl.style.display = 'block';
        hintEl.textContent = 'GitHub: ' + RELEASES_URL;
      }
      if (actionBtnEl) {
        actionBtnEl.style.display = 'inline-block';
        actionBtnEl.textContent = BO.t('update.btnWeb');
        actionBtnEl.className = 'btn';
      }
    }
  }

  function handleAction() {
    if (state === 'available' && isElectron) {
      state = 'downloading';
      setStatus(BO.t('update.downloading', { percent: 0 }), true);
      if (progressWrapEl) {
        progressWrapEl.style.display = 'flex';
        if (progressFillEl) progressFillEl.style.width = '0%';
        if (progressPercentEl) progressPercentEl.textContent = '0%';
      }
      if (actionBtnEl) actionBtnEl.style.display = 'none';
      window.electronUpdater.downloadUpdate().catch((e) => {
        onElectronError(e.message || String(e));
      });
    } else if (state === 'downloaded' && isElectron) {
      window.electronUpdater.installUpdate();
    } else if (state === 'web_available' || state === 'error') {
      const url = (latestReleaseInfo && latestReleaseInfo.html_url) ? latestReleaseInfo.html_url : RELEASES_URL;
      window.open(url, '_blank');
    } else if (state === 'latest') {
      checkUpdates();
    }
  }

  function open() {
    initElements();
    if (modalEl) modalEl.classList.add('show');
    checkUpdates();
  }

  function close() {
    if (modalEl) modalEl.classList.remove('show');
  }

  BO.VERSION = APP_VERSION;
  BO.Updater = {
    open: open,
    close: close,
    handleAction: handleAction,
    checkUpdates: checkUpdates,
  };
})(window.BO);
