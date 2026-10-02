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

  async function boot() {
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
    window.addEventListener('resize', () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => { resizeQueued = false; game.onResize(); });
    });
    document.addEventListener('fullscreenchange', () => { game.onResize(); if (ui.current === 'settings') ui.renderSettings(); });

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
