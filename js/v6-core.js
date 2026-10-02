/* =========================================================================
 * BLACKOUT :: v6-core.js
 * v6 bootstrap shared by the gamepad, touch and co-op modules:
 *  - persists the new settings (the strict save sanitiser drops unknown keys)
 *  - a "virtual" input layer merged into InputManager, so analog devices can
 *    drive Player 1 without touching the core keyboard/mouse code
 *  - aim-assist helpers, a per-frame hook for input sources
 *  - extra rows in Settings + shared strings
 * Load order: after the v4 packs, before v6-gamepad / v6-touch / v6-coop.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TOUCH_MODES = ['auto', 'off', 'easy', 'pro'];

  /* ----------------------------- Settings ----------------------------- */
  const S = BO.SaveSystem;
  function readRaw(sys) {
    try {
      const txt = sys.storage ? sys.storage.get(sys.key) : window.localStorage.getItem(sys.key || 'blackout.save.v1');
      return JSON.parse(txt || 'null');
    } catch (e) { return null; }
  }
  if (S && S.load) {
    const origLoad = S.load;
    S.load = function () {
      const data = origLoad.apply(this, arguments);
      const raw = readRaw(this);
      const rs = raw && raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
      data.settings.touch = TOUCH_MODES.indexOf(rs.touch) >= 0 ? rs.touch : 'auto';
      data.settings.rumble = typeof rs.rumble === 'boolean' ? rs.rumble : true;
      data.settings.aimAssist = typeof rs.aimAssist === 'boolean' ? rs.aimAssist : true;
      data.settings.coop = typeof rs.coop === 'boolean' ? rs.coop : false;
      // Co-op operations live outside BO.MISSIONS, so the sanitiser strips their completion flags.
      if (raw && Array.isArray(raw.completedMissions) && Array.isArray(BO.COOP_MISSIONS)) {
        BO.COOP_MISSIONS.forEach(m => {
          if (raw.completedMissions.indexOf(m.id) >= 0 && data.completedMissions.indexOf(m.id) < 0) data.completedMissions.push(m.id);
        });
      }
      return data;
    };
  }

  /* -------------------------- Virtual input --------------------------- */
  const IM = BO.InputManager.prototype;
  function virt(im) {
    if (!im._v6) {
      im._v6 = {
        keys: new Set(), pressed: new Set(), mx: 0, my: 0, fire: false, firePressed: false, wheel: 0,
        aimReq: null, aimAngle: 0, aimDist: 200, aimSource: 'mouse', realMouse: false, device: 'kbm'
      };
    }
    return im._v6;
  }

  const origBind = IM._bind;
  IM._bind = function () {
    origBind.call(this);
    const v = virt(this);
    window.addEventListener('mousedown', (e) => { if (e.button === 0) v.realMouse = true; v.device = 'kbm'; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) v.realMouse = false; });
    window.addEventListener('mousemove', (e) => {
      // Ignore sub-pixel jitter so a resting mouse never steals aim from a stick.
      if (Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 3) { v.aimSource = 'mouse'; v.device = 'kbm'; }
    });
    window.addEventListener('keydown', () => { v.device = 'kbm'; });
    BO.events.on('input:blur', () => { v.realMouse = false; v.fire = false; v.keys.clear(); v.pressed.clear(); });
  };

  const origIsDown = IM.isDown, origWas = IM.wasPressed, origConsume = IM.consume, origMove = IM.moveVector, origEnd = IM.endFrame;
  IM.isDown = function (code) { return origIsDown.call(this, code) || (!!this._v6 && this._v6.keys.has(code)); };
  IM.wasPressed = function (code) { return origWas.call(this, code) || (!!this._v6 && this._v6.pressed.has(code)); };
  IM.consume = function (code) { origConsume.call(this, code); if (this._v6) this._v6.pressed.delete(code); };
  IM.moveVector = function (out) {
    origMove.call(this, out);
    const v = this._v6;
    if (v && out.x === 0 && out.y === 0 && (v.mx || v.my)) {
      const len = Math.sqrt(v.mx * v.mx + v.my * v.my);
      const k = len > 1 ? 1 / len : 1; // analog: partial deflection = partial speed
      out.x = v.mx * k; out.y = v.my * k;
    }
    return out;
  };
  IM.endFrame = function () { origEnd.call(this); if (this._v6) this._v6.pressed.clear(); };

  /* ------------------------------ V6 API ------------------------------ */
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  const V6 = {
    sources: [],
    pads: null,       // filled by v6-gamepad.js
    touchMode: () => 'off', // replaced by v6-touch.js
    virt,
    wrapAngle,
    addSource(src) { this.sources.push(src); },
    setting(key) { const d = S && S.data && S.data.settings; return d ? d[key] : undefined; },
    playing(g) { return !!g && g.state === BO.Game.STATE.PLAYING; },

    /** Best visible enemy inside `cone` radians of `angle` with a clear shot. */
    target(game, p, angle, cone, range) {
      const list = game.enemies || [];
      let best = null, bestScore = Infinity;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.visible === false) continue;
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d > range) continue;
        const da = Math.abs(wrapAngle(Math.atan2(e.y - p.y, e.x - p.x) - angle));
        if (da > cone) continue;
        const score = da + (d / range) * 0.35;
        if (score >= bestScore) continue;
        if (!BO.Collision.lineOfSight(game.map, p.x, p.y, e.x, e.y, BO.COLLIDE.BULLET)) continue;
        bestScore = score; best = e;
      }
      return best;
    },

    /** Soft aim magnetism for sticks (respects Settings > AIM ASSIST). */
    assist(game, p, angle, cone, range, strength) {
      if (this.setting('aimAssist') === false) return angle;
      const e = this.target(game, p, angle, cone, range);
      if (!e) return angle;
      return angle + wrapAngle(Math.atan2(e.y - p.y, e.x - p.x) - angle) * strength;
    },

    /** Runs every frame before the game reads input. */
    frame(game, dt) {
      const im = game.input, v = virt(im);
      v.keys.clear(); v.mx = 0; v.my = 0; v.fire = false; v.aimReq = null;
      for (let i = 0; i < this.sources.length; i++) {
        const src = this.sources[i];
        U.safe('v6.source', () => src.update(game, dt, v));
      }
      im.mouseDown = v.realMouse || v.fire;
      if (v.firePressed) { im.mousePressed = true; v.firePressed = false; }
      if (v.wheel) { im.wheel += v.wheel; v.wheel = 0; }
      if (v.aimReq !== null) { v.aimAngle = v.aimReq; v.aimSource = 'virtual'; }
      const p = game.player;
      if (v.aimSource === 'virtual' && this.playing(game) && p && !p.dead) {
        // Park the (virtual) cursor on a ring around the operator so every
        // system that reads the cursor (aim, camera lead, crosshair) just works.
        const cam = game.camera;
        const sx = (p.x - cam.x) * cam.zoom + cam.viewW / 2, sy = (p.y - cam.y) * cam.zoom + cam.viewH / 2;
        im.cursorX = U.clamp(sx + Math.cos(v.aimAngle) * v.aimDist, 0, cam.viewW);
        im.cursorY = U.clamp(sy + Math.sin(v.aimAngle) * v.aimDist, 0, cam.viewH);
      }
    }
  };
  BO.V6 = V6;

  const G = BO.Game.prototype;
  const origGF = G._gameFrame, origMF = G._menuFrame;
  G._gameFrame = function (dt) { V6.frame(this, dt); return origGF.call(this, dt); };
  G._menuFrame = function (dt) { V6.frame(this, dt); return origMF.call(this, dt); };

  /* ------------------------- DOM: style + rows ------------------------- */
  const css = document.createElement('style');
  css.textContent = [
    '.v6-focus { outline: 2px solid #ff8a1a !important; outline-offset: 3px; }',
    '.nav.v6-focus { color: #eef0f6; transform: translateX(8px); }',
    '[data-screen="settings"] .settings { max-height: calc(100vh - 230px); overflow-y: auto; }',
    '.v6-hint { color: #9aa0b4; font-size: 14px; line-height: 1.7; margin: 0 0 14px; }',
    '.v6-pads { color: #19c3dd; font-weight: 700; letter-spacing: .06em; }'
  ].join('\n');
  document.head.appendChild(css);

  function frag(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  V6.frag = frag;

  const box = document.querySelector('[data-screen="settings"] .settings');
  if (box) {
    const anchor = box.querySelector('.row.danger');
    const rows = [
      '<div class="row"><span data-i18n="set.touch"></span><div class="seg">' +
        TOUCH_MODES.map(m => '<button data-action="v6-touch" data-value="' + m + '" data-i18n="set.touch.' + m + '"></button>').join('') + '</div></div>',
      '<div class="row"><span data-i18n="set.aimAssist"></span><button class="toggle" data-action="toggle" data-key="aimAssist"></button></div>',
      '<div class="row"><span data-i18n="set.rumble"></span><button class="toggle" data-action="toggle" data-key="rumble"></button></div>',
      '<div class="row"><span data-i18n="set.pads"></span><output class="v6-pads" id="v6-pad-count"></output></div>'
    ];
    rows.forEach(html => { const el = frag(html); if (anchor) box.insertBefore(el, anchor); else box.appendChild(el); });
  }

  const uiRoot = document.getElementById('ui');
  if (uiRoot) {
    uiRoot.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action="v6-touch"]');
      if (!b || !BO.game) return;
      BO.game.save.data.settings.touch = b.dataset.value;
      BO.game.save.save();
      BO.game.ui.renderSettings();
    });
  }

  V6.padCountText = function () {
    const n = V6.pads ? V6.pads.list().length : 0;
    return n ? BO.t('pad.count', { n: BO.I18N.num(n) }) : BO.t('pad.none');
  };

  const UI = BO.UIManager.prototype;
  const origRS = UI.renderSettings;
  UI.renderSettings = function () {
    origRS.call(this);
    const s = this.game.save.data.settings;
    document.querySelectorAll('[data-action="v6-touch"]').forEach(b => b.classList.toggle('on', b.dataset.value === s.touch));
    const out = document.getElementById('v6-pad-count');
    if (out) out.textContent = V6.padCountText();
  };

  /* ------------------------------ Strings ----------------------------- */
  BO.I18N.extend('en', {
    'set.touch': 'TOUCH CONTROLS', 'set.touch.auto': 'AUTO', 'set.touch.off': 'OFF', 'set.touch.easy': 'EASY', 'set.touch.pro': 'PRO',
    'set.aimAssist': 'AIM ASSIST (GAMEPAD)', 'set.rumble': 'GAMEPAD VIBRATION', 'set.pads': 'GAMEPADS',
    'pad.count': '{n} CONNECTED', 'pad.none': 'NONE DETECTED (PRESS A BUTTON)'
  });
  BO.I18N.extend('fa', {
    'set.touch': 'کنترل لمسی', 'set.touch.auto': 'خودکار', 'set.touch.off': 'خاموش', 'set.touch.easy': 'آسان', 'set.touch.pro': 'حرفه‌ای',
    'set.aimAssist': 'کمک‌نشانه‌گیری (دسته)', 'set.rumble': 'لرزش دسته', 'set.pads': 'دسته‌های بازی',
    'pad.count': '{n} دسته وصل است', 'pad.none': 'دسته‌ای پیدا نشد (یک دکمه بزن)'
  });
})(window.BO);
