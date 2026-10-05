/* =========================================================================
 * BLACKOUT :: main.js
 * Bootstrap: load save, apply language, wait for fonts, wire global events
 * (resize, focus loss, pointer lock, ESC navigation) and start the loop.
 * ========================================================================= */
'use strict';
(function (BO) {
  function waitForFonts(timeoutMs) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const loads = [
      document.fonts.load('600 20px Vazirmatn', 'خاموشی'),
      document.fonts.load('700 20px Khand', 'BLACKOUT'),
      document.fonts.load('600 20px "Chakra Petch"', 'HUD')
    ];
    return Promise.race([Promise.all(loads).catch(() => null), new Promise(r => setTimeout(r, timeoutMs))]);
  }

  function lockKeyboard() {
    if (navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
      navigator.keyboard.lock(['Escape']).catch(() => {});
    }
  }

  function requestFullscreen() {
    const el = document.documentElement;
    if (!el || !el.requestFullscreen) return;
    const go = () => {
      const p = el.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) {
        p.then(lockKeyboard).catch(() => { try { el.requestFullscreen(); lockKeyboard(); } catch (_) {} });
      } else {
        lockKeyboard();
      }
    };
    // Fire immediately (works when the browser allows it), and otherwise retry
    // on the first real user gesture.
    try { go(); } catch (_) { /* needs a gesture */ }
    if (document.fullscreenElement) return;
    const retry = () => {
      if (document.fullscreenElement) return;
      try { go(); } catch (_) { /* blocked */ }
    };
    window.addEventListener('pointerdown', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
  }

  async function boot() {
    // data/weapons.json is applied before anything reads BO.WEAPONS.
    if (BO.WeaponConfig && BO.WeaponConfig.ready) { try { await BO.WeaponConfig.ready; } catch (_) {} }
    // Open fullscreen. Browsers only honour a request made from a user gesture,
    // so this is attempted on the first click/keypress and silently skipped when
    // it is refused.
    requestFullscreen();
    const save = BO.SaveSystem.load();
    BO.I18N.setLang(save.settings.lang);
    const canvas = document.getElementById('game');
    const game = new BO.Game(canvas);
    const ui = new BO.UIManager(game);
    game.attachUI(ui);
    game.applySettings();
    BO.game = game;
    await waitForFonts(1500);
    ui.showMenu();
    if (BO.SaveSystem.wasCorrupted) ui.toast(BO.t('menu.corrupt'));
    game.start();
    document.body.classList.add('ready');

    let resizeQueued = false;
    const updateFullscreenClass = () => {
      const isFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) ||
        (window.screen && (window.innerWidth >= window.screen.width - 4 && window.innerHeight >= window.screen.height - 4))
      );
      document.documentElement.classList.toggle('fullscreen', isFs);
      if (document.body) document.body.classList.toggle('fullscreen', isFs);
    };
    updateFullscreenClass();

    const queueResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        updateFullscreenClass();
        game.onResize();
      });
    };
    window.addEventListener('resize', queueResize);
    // Entering/leaving fullscreen and browser UI changes alter the viewport
    // without always firing `resize`.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', queueResize);
      window.visualViewport.addEventListener('scroll', queueResize);
    }
    document.addEventListener('fullscreenchange', () => {
      updateFullscreenClass();
      queueResize();
      lockKeyboard();
      if (ui.current === 'settings') ui.renderSettings();
    });
    document.addEventListener('webkitfullscreenchange', () => {
      updateFullscreenClass();
      queueResize();
      lockKeyboard();
    });
    if (window.screen && screen.orientation) screen.orientation.addEventListener('change', queueResize);

    const unlockAudio = () => { game.audio.unlock(); };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    canvas.addEventListener('mousedown', () => {
      if (game.state === BO.Game.STATE.PLAYING && !game.input.locked) game.input.requestLock();
    });

    BO.events.on('input:lockLost', () => { if (game.state === BO.Game.STATE.PLAYING) game.pause(); });
    window.addEventListener('blur', () => { if (game.state === BO.Game.STATE.PLAYING) game.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === BO.Game.STATE.PLAYING) game.pause(); });

    BO.events.on('input:key', (code) => {
      if (code !== 'Escape') return;
      const S = BO.Game.STATE;
      if (game.state === S.PLAYING) {
        game.pause();
        return;
      }
      if (game.state === S.PAUSED) {
        if (ui.current === 'settings') ui.showPause();
        else game.resume();
        return;
      }
      if (game.state === S.MENU && ui.current && ui.current !== 'menu') {
        if (ui.current === 'results' || ui.current === 'death' || ui.current === 'quit') return;
        ui.showMenu();
      }
    });
  }

  window.addEventListener('error', (e) => { BO.U.reportError('window', e.error || e.message); });
  window.addEventListener('unhandledrejection', (e) => { BO.U.reportError('promise', e.reason); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot(); });
  else boot();
})(window.BO);
