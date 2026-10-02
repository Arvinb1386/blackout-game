/* =========================================================================
 * BLACKOUT :: v6-gamepad.js
 * Gamepad support (standard mapping: Xbox / PlayStation / most USB pads).
 *  - Player 1 can play fully on a pad (twin-stick aim with soft aim assist)
 *  - Player 2 in local co-op reads its own pad through BO.PadInput
 *  - menus are navigable with the D-pad / left stick, A = select, B = back
 *  - optional vibration on hits and heavy weapons
 *
 *  Gameplay layout
 *    L-stick move · R-stick aim · RT fire · LT / L3 sprint · A dodge
 *    B reload · X interact (hold) · Y / RB next weapon · LB previous weapon
 *    D-pad slots 1-4 · VIEW/BACK hold = intel panel · START pause
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const V6 = BO.V6;
  if (!V6) return;
  const DEAD = 0.2;
  const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const ZERO = { x: 0, y: 0, len: 0 };

  /** Radial dead zone with rescale so small deflections stay precise. */
  function stick(x, y) {
    const len = Math.sqrt(x * x + y * y);
    if (!(len > DEAD)) return ZERO;
    const mag = Math.min(1, (len - DEAD) / (1 - DEAD));
    return { x: x / len * mag, y: y / len * mag, len: mag };
  }

  class PadState {
    constructor(index) {
      this.index = index;
      this.cur = []; this.prev = [];
      this.l = ZERO; this.r = ZERO;
      this.connected = false; this.active = false; this.gp = null; this.id = '';
    }

    read(gp) {
      this.prev = this.cur;
      this.cur = [];
      this.gp = gp || null;
      this.connected = !!gp && gp.connected !== false;
      if (!this.connected) { this.l = this.r = ZERO; this.active = false; return; }
      this.id = gp.id || '';
      for (let i = 0; i < gp.buttons.length; i++) {
        const b = gp.buttons[i];
        const val = typeof b === 'object' ? b.value : b;
        this.cur[i] = (typeof b === 'object' && b.pressed) || val > 0.35;
      }
      const ax = gp.axes || [];
      this.l = stick(ax[0] || 0, ax[1] || 0);
      this.r = stick(ax[2] || 0, ax[3] || 0);
      this.active = this.l.len > 0 || this.r.len > 0 || this.cur.some(Boolean);
    }

    down(i) { return !!this.cur[i]; }
    hit(i) { return !!this.cur[i] && !this.prev[i]; }

    rumble(strong, weak, ms) {
      if (V6.setting('rumble') === false) return;
      const a = this.gp && this.gp.vibrationActuator;
      if (!a || !a.playEffect) return;
      try {
        const pr = a.playEffect(a.type || 'dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: U.clamp(strong, 0, 1), weakMagnitude: U.clamp(weak, 0, 1) });
        if (pr && pr.catch) pr.catch(() => { /* not supported */ });
      } catch (e) { /* not supported */ }
    }
  }

  const states = new Map();
  let connected = [];

  function poll() {
    let raw = [];
    try { raw = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch (e) { raw = []; }
    const seen = new Set();
    raw.forEach((gp, i) => {
      if (!gp) return;
      const idx = typeof gp.index === 'number' ? gp.index : i;
      seen.add(idx);
      if (!states.has(idx)) states.set(idx, new PadState(idx));
      states.get(idx).read(gp);
    });
    states.forEach((st, idx) => { if (!seen.has(idx)) st.read(null); });
    connected = Array.from(states.values()).filter(s => s.connected).sort((a, b) => a.index - b.index);
  }

  /**
   * Who drives which pad.
   *  solo            : every pad drives Player 1
   *  co-op, 1 pad    : P1 = keyboard + mouse, P2 = the pad
   *  co-op, 2+ pads  : P1 = first pad (keyboard still works), P2 = second pad
   */
  function roles(game) {
    if (game && game.coop && game.player2) {
      if (connected.length >= 2) return { p1: [connected[0]], p2: connected[1] };
      return { p1: [], p2: connected[0] || null };
    }
    return { p1: connected, p2: null };
  }

  /** Writes one pad's state into a virtual-input record (P1 merge or P2 PadInput). */
  function feed(game, pad, t, player) {
    if (!pad || !pad.connected) return;
    t.mx += pad.l.x; t.my += pad.l.y;
    if (pad.down(BTN.RT)) t.fire = true;
    if (pad.hit(BTN.RT)) t.firePressed = true;
    if (pad.hit(BTN.A)) t.pressed.add('Space');
    if (pad.hit(BTN.B)) t.pressed.add('KeyR');
    if (pad.down(BTN.X)) t.keys.add('KeyE');
    if (pad.hit(BTN.X)) t.pressed.add('KeyE');
    if (pad.down(BTN.LT) || pad.down(BTN.LS)) { t.keys.add('ShiftLeft'); }
    if (pad.hit(BTN.RB) || pad.hit(BTN.Y)) t.wheel += 1;
    if (pad.hit(BTN.LB)) t.wheel -= 1;
    if (pad.down(BTN.BACK)) t.keys.add('Tab');
    if (pad.hit(BTN.UP)) t.pressed.add('Digit1');
    if (pad.hit(BTN.DOWN)) t.pressed.add('Digit2');
    if (pad.hit(BTN.LEFT)) t.pressed.add('Digit3');
    if (pad.hit(BTN.RIGHT)) t.pressed.add('Digit4');
    if (!player || player.dead) return;
    let a = null;
    if (pad.r.len > 0.25) a = Math.atan2(pad.r.y, pad.r.x);
    else if (pad.l.len > 0.3 && !pad.down(BTN.RT)) a = Math.atan2(pad.l.y, pad.l.x); // face where you walk
    else if (pad.down(BTN.RT)) a = player.angle;
    if (a !== null) t.aimReq = V6.assist(game, player, a, 0.2, 950, pad.r.len > 0.25 ? 0.5 : 0.3);
    t.aimDist = 150 + pad.r.len * 130;
    if (pad.active) t.device = 'pad';
  }

  /* --------------------------- P2 input object -------------------------- */
  /** Same surface as InputManager for the bits Player.update reads. */
  class PadInput {
    constructor() {
      this.keys = new Set(); this.pressed = new Set();
      this.mouseDown = false; this.mousePressed = false; this.wheel = 0;
      this.mx = 0; this.my = 0; this.fire = false; this.firePressed = false;
      this.aimReq = null; this.aimDist = 200; this.device = 'pad'; this.pad = null;
    }
    reset() {
      this.keys.clear(); this.pressed.clear();
      this.mouseDown = false; this.mousePressed = false; this.wheel = 0;
      this.mx = 0; this.my = 0; this.fire = false; this.firePressed = false; this.aimReq = null;
    }
    isDown(code) { return this.keys.has(code); }
    wasPressed(code) { return this.pressed.has(code); }
    consume(code) { this.pressed.delete(code); }
    moveVector(out) {
      const len = Math.sqrt(this.mx * this.mx + this.my * this.my);
      const k = len > 1 ? 1 / len : 1;
      out.x = this.mx * k; out.y = this.my * k;
      return out;
    }
  }
  BO.PadInput = PadInput;

  function feedP2(game, pad) {
    const p2 = game.player2;
    const t = p2.v6in || (p2.v6in = new PadInput());
    t.reset();
    t.pad = pad;
    if (pad) feed(game, pad, t, p2);
    t.mouseDown = t.fire;
    t.mousePressed = t.firePressed;
  }

  /* ---------------------------- Menu navigation -------------------------- */
  const nav = { dir: null, t: 0 };

  function navRoot() {
    return document.querySelector('#profiles-ov.show') || document.querySelector('#confirm.show') || document.querySelector('#ui .screen.active');
  }

  function candidates() {
    const root = navRoot();
    if (!root) return [];
    return Array.from(root.querySelectorAll('button, input[type="range"]')).filter(el =>
      !el.disabled && !el.hidden && el.offsetParent !== null && el.getClientRects().length > 0);
  }

  function focusEl(el, game) {
    document.querySelectorAll('.v6-focus').forEach(x => x.classList.remove('v6-focus'));
    if (!el) return;
    el.classList.add('v6-focus');
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* old browsers */ }
    if (game && game.audio && game.audio.uiHover) game.audio.uiHover();
  }

  function defaultFocus(list) {
    return list.find(e => e.classList.contains('primary-nav')) || list.find(e => e.classList.contains('primary') && !e.hidden) || list[0];
  }

  function moveFocus(dir, game) {
    const list = candidates();
    if (!list.length) return;
    const cur = list.indexOf(document.activeElement) >= 0 ? document.activeElement : null;
    if (!cur) { focusEl(defaultFocus(list), game); return; }
    if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      // RTL sliders still grow to the right in Chromium/Firefox.
      if (dir === 'right') cur.stepUp(); else cur.stepDown();
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const vx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, vy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    let best = null, bestS = Infinity;
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const ex = q.left + q.width / 2 - cx, ey = q.top + q.height / 2 - cy;
      const along = ex * vx + ey * vy;
      if (along <= 4) continue;
      const across = vx ? Math.abs(ey) : Math.abs(ex);
      const s = along + across * 2.2;
      if (s < bestS) { bestS = s; best = el; }
    }
    if (best) focusEl(best, game);
  }

  function activate(game) {
    const list = candidates();
    const cur = list.indexOf(document.activeElement) >= 0 ? document.activeElement : null;
    if (!cur) { focusEl(defaultFocus(list), game); return; }
    if (cur.type === 'range') return;
    cur.click();
  }

  function back() {
    const confirm = document.querySelector('#confirm.show');
    if (confirm) { const no = confirm.querySelector('[data-action="confirm-no"]'); if (no) no.click(); return; }
    const prof = document.querySelector('#profiles-ov.show');
    if (prof) { prof.classList.remove('show'); return; }
    BO.events.emit('input:key', 'Escape');
  }

  function menuNav(game, dt) {
    if (!connected.length) return;
    let dx = 0, dy = 0, a = false, b = false;
    connected.forEach(pad => {
      dx += pad.l.x + (pad.down(BTN.RIGHT) ? 1 : 0) - (pad.down(BTN.LEFT) ? 1 : 0);
      dy += pad.l.y + (pad.down(BTN.DOWN) ? 1 : 0) - (pad.down(BTN.UP) ? 1 : 0);
      if (pad.hit(BTN.A)) a = true;
      if (pad.hit(BTN.B)) b = true;
    });
    let dir = null;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (dir) {
      if (dir !== nav.dir) { nav.dir = dir; nav.t = 0.38; moveFocus(dir, game); }
      else { nav.t -= dt; if (nav.t <= 0) { nav.t = 0.11; moveFocus(dir, game); } }
    } else nav.dir = null;
    if (a) activate(game);
    if (b) back();
  }

  window.addEventListener('mousemove', () => { document.querySelectorAll('.v6-focus').forEach(x => x.classList.remove('v6-focus')); });

  /* -------------------------------- Source ------------------------------- */
  V6.addSource({
    update(game, dt, v) {
      poll();
      const S = BO.Game.STATE;
      const playing = game.state === S.PLAYING;
      // START pauses from any pad; in menus it acts like Escape.
      if (connected.some(p => p.hit(BTN.START))) {
        if (playing) v.pressed.add('Escape');
        else BO.events.emit('input:key', 'Escape');
      }
      const r = roles(game);
      if (playing) {
        for (let i = 0; i < r.p1.length; i++) feed(game, r.p1[i], v, game.player);
      } else if (game.state === S.MENU || game.state === S.PAUSED) {
        menuNav(game, dt);
      }
      if (game.coop && game.player2) feedP2(game, playing ? r.p2 : null);
    }
  });

  V6.pads = {
    list: () => connected.slice(),
    roles,
    p2Pad: (game) => roles(game).p2,
    BTN,
    /** Pads that belong to a given operator. */
    of(game, player) {
      const r = roles(game);
      if (player && player.isP2) return r.p2 ? [r.p2] : [];
      return r.p1;
    }
  };

  /* ------------------------------ Vibration ------------------------------ */
  const G = BO.Game.prototype;
  const origDamaged = G.onPlayerDamaged;
  G.onPlayerDamaged = function (amount, sx, sy) {
    const res = origDamaged.apply(this, arguments);
    const k = U.clamp(amount / 50, 0.25, 1);
    V6.pads.of(this, this.player).forEach(p => p.rumble(k, 0.5, 200));
    return res;
  };
  const origFired = G.onPlayerFired;
  G.onPlayerFired = function (player, w) {
    const res = origFired.apply(this, arguments);
    const s = w && w.def ? w.def.shake || 0 : 0;
    if (s > 0.08) V6.pads.of(this, player).forEach(p => p.rumble(s > 0.3 ? s * 0.6 : 0, U.clamp(s * 1.5, 0.1, 0.7), s > 0.3 ? 110 : 55));
    return res;
  };

  /* --------------------------- Connect / disconnect ---------------------- */
  window.addEventListener('gamepadconnected', (e) => {
    poll();
    const g = BO.game;
    if (g && g.ui) g.ui.toast(BO.t('pad.connected', { n: BO.I18N.num(connected.length) }));
    if (g && g.ui && g.ui.current === 'settings') g.ui.renderSettings();
    void e;
  });
  window.addEventListener('gamepaddisconnected', () => {
    poll();
    const g = BO.game;
    if (!g || !g.ui) return;
    g.ui.toast(BO.t('pad.disconnected'));
    if (g.state === BO.Game.STATE.PLAYING) g.pause();
    if (g.ui.current === 'settings') g.ui.renderSettings();
  });

  BO.I18N.extend('en', { 'pad.connected': 'GAMEPAD CONNECTED ({n} TOTAL)', 'pad.disconnected': 'GAMEPAD DISCONNECTED' });
  BO.I18N.extend('fa', { 'pad.connected': 'دسته وصل شد ({n} دسته)', 'pad.disconnected': 'اتصال دسته قطع شد' });
})(window.BO);
