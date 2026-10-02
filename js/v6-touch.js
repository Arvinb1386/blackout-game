/* =========================================================================
 * BLACKOUT :: v6-touch.js
 * Touch controls for phones and tablets.
 *  EASY : left thumb = floating move stick. Aim-assist locks onto the nearest
 *         visible hostile and fires automatically; tap/hold the right side to
 *         fire manually when nothing is locked.
 *  PRO  : twin-stick. Right thumb = floating aim stick, push past half-way to
 *         fire. Light aim assist only.
 *  Both : DODGE / RELOAD / USE (hold) / SWAP buttons, tap a HUD weapon slot
 *         to equip it, push the move stick to the edge to sprint.
 * Settings > TOUCH CONTROLS: AUTO (on for touch screens) / OFF / EASY / PRO.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const V6 = BO.V6;
  if (!V6) return;
  const STICK_R = 62;

  let touchSeen = false;
  const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  window.addEventListener('touchstart', () => { touchSeen = true; }, { passive: true, capture: true });

  function mode() {
    const m = V6.setting('touch') || 'auto';
    if (m === 'auto') return (touchSeen || (coarse && coarse.matches)) ? 'easy' : 'off';
    return m;
  }
  V6.touchMode = mode;

  /* --------------------------------- DOM --------------------------------- */
  const css = document.createElement('style');
  css.textContent = `
#touch-ui { position: fixed; inset: 0; display: none; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
#touch-ui.show { display: block; }
#touch-ui .t-btn { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 50%;
  background: rgba(8,9,18,.45); border: 2px solid rgba(255,138,26,.6); color: #eef0f6; font: 700 12px 'Chakra Petch', Vazirmatn, sans-serif;
  letter-spacing: .04em; text-align: center; padding: 0; }
#touch-ui .t-btn.on { background: rgba(255,138,26,.5); color: #160b02; }
#touch-ui .t-fire { width: 92px; height: 92px; right: 206px; bottom: 140px; border-color: rgba(255,51,85,.7); font-size: 14px; }
#touch-ui .t-dodge { width: 78px; height: 78px; right: 26px; bottom: 140px; }
#touch-ui .t-reload { width: 62px; height: 62px; right: 120px; bottom: 136px; }
#touch-ui .t-use { width: 66px; height: 66px; right: 32px; bottom: 236px; border-color: rgba(25,195,221,.7); }
#touch-ui .t-swap { width: 56px; height: 56px; right: 116px; bottom: 216px; }
#touch-ui .t-pause { width: 46px; height: 46px; left: 22px; top: 150px; border-radius: 10px; font-size: 16px; }
#touch-ui .t-stick { position: absolute; width: ${STICK_R * 2}px; height: ${STICK_R * 2}px; margin: -${STICK_R}px 0 0 -${STICK_R}px; border-radius: 50%;
  border: 2px solid rgba(238,240,246,.28); background: rgba(8,9,18,.22); opacity: .3; pointer-events: none; transition: opacity .15s; }
#touch-ui .t-stick.on { opacity: 1; }
#touch-ui .t-stick i { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: rgba(255,138,26,.55); }
#touch-ui .t-stick.aim i { background: rgba(25,195,221,.6); }
#touch-ui[data-mode="easy"] .t-stick.aim { display: none; }
#touch-ui[data-mode="pro"] .t-fire { display: none; }
#touch-ui .t-rotate { display: none; position: absolute; inset: 0; background: rgba(5,6,12,.92); color: #eef0f6; font: 700 18px 'Chakra Petch', Vazirmatn, sans-serif;
  align-items: center; justify-content: center; text-align: center; padding: 24px; }
@media (orientation: portrait) { #touch-ui.show .t-rotate { display: flex; } }
`;
  document.head.appendChild(css);

  const root = document.createElement('div');
  root.id = 'touch-ui';
  root.dataset.mode = 'off';
  root.innerHTML =
    '<div class="t-stick move"><i></i></div>' +
    '<div class="t-stick aim"><i></i></div>' +
    '<button class="t-btn t-fire" data-tb="fire" data-i18n="touch.fire"></button>' +
    '<button class="t-btn t-dodge" data-tb="dodge" data-i18n="touch.dodge"></button>' +
    '<button class="t-btn t-reload" data-tb="reload" data-i18n="touch.reload"></button>' +
    '<button class="t-btn t-use" data-tb="use" data-i18n="touch.use"></button>' +
    '<button class="t-btn t-swap" data-tb="swap" data-i18n="touch.swap"></button>' +
    '<button class="t-btn t-pause" data-tb="pause">II</button>' +
    '<div class="t-rotate" data-i18n="touch.rotate"></div>';
  const uiEl = document.getElementById('ui');
  if (uiEl && uiEl.parentNode) uiEl.parentNode.insertBefore(root, uiEl); else document.body.appendChild(root);
  const moveEl = root.querySelector('.t-stick.move'), aimEl = root.querySelector('.t-stick.aim');

  /* -------------------------------- State -------------------------------- */
  const T = { move: null, aim: null, right: null, btn: new Map(), held: new Map(), edges: new Set(), fireLatch: false };
  const pendingSlot = [];

  function placeStick(el, s, fallbackX, fallbackY) {
    if (s) {
      el.classList.add('on');
      el.style.left = s.ox + 'px'; el.style.top = s.oy + 'px';
      let dx = s.x - s.ox, dy = s.y - s.oy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > STICK_R) { dx = dx / len * STICK_R; dy = dy / len * STICK_R; }
      el.firstChild.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    } else {
      el.classList.remove('on');
      el.style.left = fallbackX + 'px'; el.style.top = fallbackY + 'px';
      el.firstChild.style.transform = '';
    }
  }

  function slotAt(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    const sw = 74, gap = 8, total = sw * 5 + gap * 4, x0 = w / 2 - total / 2, sy = h - 64;
    if (y < sy || y > sy + 44 || x < x0 || x > x0 + total) return -1;
    const i = Math.floor((x - x0) / (sw + gap));
    return i >= 0 && i < 5 && x - x0 - i * (sw + gap) <= sw ? i : -1;
  }

  function press(name, on) {
    const n = (T.held.get(name) || 0) + (on ? 1 : -1);
    if (n <= 0) T.held.delete(name); else T.held.set(name, n);
    const b = root.querySelector('[data-tb="' + name + '"]');
    if (b) b.classList.toggle('on', n > 0);
  }

  function resetAll() {
    T.move = T.aim = T.right = null;
    T.btn.clear(); T.held.clear(); T.edges.clear(); T.fireLatch = false;
    root.querySelectorAll('.t-btn.on').forEach(b => b.classList.remove('on'));
  }

  root.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const w = window.innerWidth;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const b = t.target && t.target.closest ? t.target.closest('[data-tb]') : null;
      if (b) { const name = b.dataset.tb; T.btn.set(t.identifier, name); press(name, true); T.edges.add(name); continue; }
      const slot = slotAt(t.clientX, t.clientY);
      if (slot >= 0) { pendingSlot.push(slot); continue; }
      const s = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY, fired: false };
      if (t.clientX < w * 0.45) { if (!T.move) T.move = s; }
      else if (mode() === 'pro') { if (!T.aim) T.aim = s; }
      else if (!T.right) T.right = s;
    }
  }, { passive: false });

  root.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      [T.move, T.aim, T.right].forEach(s => { if (s && s.id === t.identifier) { s.x = t.clientX; s.y = t.clientY; } });
    }
  }, { passive: false });

  function end(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (T.btn.has(t.identifier)) { press(T.btn.get(t.identifier), false); T.btn.delete(t.identifier); }
      if (T.move && T.move.id === t.identifier) T.move = null;
      if (T.aim && T.aim.id === t.identifier) T.aim = null;
      if (T.right && T.right.id === t.identifier) { T.right = null; T.fireLatch = false; }
    }
  }
  root.addEventListener('touchend', end, { passive: false });
  root.addEventListener('touchcancel', end, { passive: false });
  // Stray mouse clicks (desktop testing in device mode) should not leak through.
  root.addEventListener('mousedown', (e) => e.stopPropagation());

  function vec(s) {
    if (!s) return { x: 0, y: 0, k: 0 };
    const dx = s.x - s.ox, dy = s.y - s.oy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 6) return { x: 0, y: 0, k: 0 };
    return { x: dx / len, y: dy / len, k: Math.min(1, len / STICK_R) };
  }

  /* -------------------------------- Source ------------------------------- */
  V6.addSource({
    update(game, dt, v) {
      const m = mode();
      const show = m !== 'off' && V6.playing(game);
      root.classList.toggle('show', show);
      root.dataset.mode = m;
      if (!show) { if (T.move || T.aim || T.right || T.held.size) resetAll(); pendingSlot.length = 0; return; }
      const p = game.player;
      const h = window.innerHeight, w = window.innerWidth;
      placeStick(moveEl, T.move, 130, h - 190);
      placeStick(aimEl, T.aim, w - 330, h - 190);
      if (!p || p.dead) { T.edges.clear(); pendingSlot.length = 0; return; }

      if (T.edges.has('pause')) { resetAll(); game.pause(); return; }

      const mv = vec(T.move);
      if (mv.k > 0) {
        v.mx += mv.x * mv.k; v.my += mv.y * mv.k;
        if (mv.k > 0.94) v.keys.add('ShiftLeft');
      }
      if (T.edges.has('dodge')) v.pressed.add('Space');
      if (T.edges.has('reload')) v.pressed.add('KeyR');
      if (T.held.has('use')) v.keys.add('KeyE');
      if (T.edges.has('use')) v.pressed.add('KeyE');
      if (T.edges.has('swap')) v.wheel += 1;
      while (pendingSlot.length) v.pressed.add('Digit' + (pendingSlot.shift() + 1));
      const manualEdge = T.edges.has('fire');
      T.edges.clear();

      const moveA = mv.k > 0 ? Math.atan2(mv.y, mv.x) : null;
      const w0 = p.weapon;
      const canShoot = w0 && w0.mag > 0 && !w0.reloading;
      if (m === 'pro') {
        const av = vec(T.aim);
        if (av.k > 0.15) {
          v.aimReq = V6.assist(game, p, Math.atan2(av.y, av.x), 0.16, 900, 0.35);
          if (av.k > 0.5) {
            v.fire = true;
            if (!T.aim.fired) { v.firePressed = true; T.aim.fired = true; }
          } else T.aim.fired = false;
        } else if (moveA !== null) v.aimReq = moveA;
      } else {
        const range = Math.min(720, (w0 && w0.def.range) || 720);
        const tgt = V6.target(game, p, p.angle, Math.PI, range);
        if (tgt) {
          v.aimReq = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          // Auto-fire only with rounds in the mag, so an empty gun never spams "no ammo".
          if (canShoot) { v.fire = true; v.firePressed = true; }
        } else if (moveA !== null) v.aimReq = moveA;
        const manual = !!T.right || T.held.has('fire');
        if (manual) {
          v.fire = true;
          if (!T.fireLatch || manualEdge) { v.firePressed = true; T.fireLatch = true; }
        } else T.fireLatch = false;
      }
      v.aimDist = 170;
      v.device = 'touch';
    }
  });

  BO.events.on('input:blur', resetAll);

  BO.I18N.extend('en', {
    'touch.fire': 'FIRE', 'touch.dodge': 'DODGE', 'touch.reload': 'RELOAD', 'touch.use': 'USE', 'touch.swap': 'SWAP',
    'touch.rotate': 'ROTATE YOUR DEVICE TO LANDSCAPE'
  });
  BO.I18N.extend('fa', {
    'touch.fire': 'شلیک', 'touch.dodge': 'غلت', 'touch.reload': 'خشاب', 'touch.use': 'تعامل', 'touch.swap': 'سلاح',
    'touch.rotate': 'گوشی را افقی بگیر'
  });
})(window.BO);
