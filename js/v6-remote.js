/* =========================================================================
 * BLACKOUT :: v6-remote.js
 * Remote controller – drives Player 2 in co-op via WebSocket.
 *
 * Features:
 *  - Fully manual aim with smooth angular interpolation (no abrupt jumping)
 *  - Auto-fire ONLY when crosshair ray physically intersects an enemy hitbox
 *  - Dedicated Revive (KeyE) support with hold-to-revive and partner alert
 *  - Weapon switching strictly isolated to Player 2
 *
 * Load order: after v6-coop.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const V6 = BO.V6;
  if (!V6) return;
  const C = BO.Collision;

  /* ------------------------------ State -------------------------------- */
  let ws = null;
  let connected = false;
  let reconnectTimer = null;
  let remoteActive = false;
  let lastP1Downed = false;

  const cur = {
    mx: 0, my: 0,
    ax: 0, ay: 0,
    reload: false,
    sprint: false,
    use: false,
  };
  const prev = { reload: false, use: false };
  const queue = { reload: false, swap: 0, slot: -1 };

  /* ----------------------------- WebSocket ----------------------------- */
  function connect() {
    if (ws) return;
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(proto + '://' + location.host + '/?role=game');
    } catch (e) { scheduleReconnect(); return; }

    ws.onopen = function () {
      connected = true;
      console.log('[Remote] connected');
      var g = BO.game;
      if (g && g.ui) g.ui.toast(BO.t('remote.connected'));
    };

    ws.onmessage = function (ev) {
      try {
        var d = JSON.parse(ev.data);
        if (d.t !== 'inp') return;
        remoteActive = true;
        cur.mx = d.mx || 0;
        cur.my = d.my || 0;
        cur.ax = d.ax || 0;
        cur.ay = d.ay || 0;
        cur.reload = !!d.r;
        cur.sprint = !!d.sp;
        cur.use = !!d.u;
        if (cur.reload && !prev.reload) queue.reload = true;
        if (d.sw) queue.swap += d.sw;
        if (d.sl >= 0) queue.slot = d.sl;
        prev.reload = cur.reload;
      } catch (e) {}
    };

    ws.onclose = function () {
      connected = false; ws = null;
      scheduleReconnect();
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () { reconnectTimer = null; connect(); }, 2000);
  }

  if (location.protocol === 'http:' || location.protocol === 'https:') connect();

  /* ------------- Force co-op ON when remote is active ------------------ */
  if (V6.pads) {
    const origList = V6.pads.list;
    V6.pads.list = function () {
      var real = origList.call(this);
      if (remoteActive && connected && !real.some(function (p) { return p._remote; })) {
        real.push({
          _remote: true, index: 99, connected: true, active: true,
          l: { x: 0, y: 0, len: 0 }, r: { x: 0, y: 0, len: 0 },
          down: function () { return false; },
          hit: function () { return false; },
          rumble: function () {}
        });
      }
      return real;
    };
  }

  /* ------------- Patch P2 aim to preserve smooth angle ----------------- */
  const P = BO.Player.prototype;
  const coopAim = P._updateAim;
  P._updateAim = function (game) {
    if (!this.isP2 || !this.v6in) return coopAim.call(this, game);
    // this.angle is smoothly maintained in feedP2 — do not snap it!
    var dist = this._remoteAimDist || 450;
    this.aimX = this.x + Math.cos(this.angle) * dist;
    this.aimY = this.y + Math.sin(this.angle) * dist;
  };

  /* -------- Check if aim is directly ON an enemy (strict raycast) ------ */
  function enemyOnCrosshair(game, p, angle, maxRange) {
    var enemies = game.enemies || [];
    var cosA = Math.cos(angle), sinA = Math.sin(angle);
    var best = null, bestDist = Infinity;

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead || e.visible === false) continue;

      var dx = e.x - p.x, dy = e.y - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxRange || dist < 1) continue;

      // Distance along the aim ray
      var along = dx * cosA + dy * sinA;
      if (along < 0) continue; // Behind player

      // Perpendicular distance to ray
      var perp = Math.abs(dx * sinA - dy * cosA);
      var hitR = (e.r || 14) + 16;
      if (perp > hitR) continue;

      // Line of sight required
      if (!C.lineOfSight(game.map, p.x, p.y, e.x, e.y, BO.COLLIDE.BULLET)) continue;

      if (dist < bestDist) { bestDist = dist; best = e; }
    }
    return best;
  }

  /* ------------------- Feed input into P2's PadInput ------------------- */
  const G = BO.Game.prototype;
  const origExposure = G._updateExposure;
  G._updateExposure = function (dt) {
    if (connected && remoteActive && this.coop && this.player2) {
      U.safe('remote.feed', feedP2.bind(null, this, dt));
    }
    return origExposure.call(this, dt);
  };

  function feedP2(game, dt) {
    var p2 = game.player2;
    if (!p2 || p2.dead) return;
    var inp = p2.v6in;
    if (!inp) return;

    var effectiveDt = (typeof dt === 'number' && dt > 0 && dt < 0.2) ? dt : 0.016;

    // === Movement ===
    inp.mx = cur.mx;
    inp.my = cur.my;
    if (cur.sprint) inp.keys.add('ShiftLeft');

    // === Reload ===
    if (queue.reload) { inp.pressed.add('KeyR'); queue.reload = false; }

    // === Revive / Use / Interact (KeyE) ===
    if (cur.use) {
      inp.keys.add('KeyE');
      if (!prev.use) inp.pressed.add('KeyE');
    }
    prev.use = cur.use;

    // === Weapon swap (strictly P2 only) ===
    if (queue.swap) { inp.wheel += queue.swap; queue.swap = 0; }

    // === Weapon slots (strictly P2 only) ===
    if (queue.slot >= 0 && queue.slot < 5) {
      if (p2.slots && p2.slots[queue.slot]) {
        p2.equip(queue.slot, game.audio);
      } else {
        inp.pressed.add('Digit' + (queue.slot + 1));
      }
      queue.slot = -1;
    }

    // === Notify controller if partner (P1) is downed ===
    var p1 = game.player;
    var p1Downed = !!(p1 && p1.v6downed);
    if (p1Downed !== lastP1Downed) {
      lastP1Downed = p1Downed;
      if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ t: 'partner_downed', downed: p1Downed })); } catch (e) {}
      }
    }

    // === Aim: SMOOTH ROTATION, no jumps or pops ===
    var alen = Math.sqrt(cur.ax * cur.ax + cur.ay * cur.ay);
    if (alen > 0.08) {
      p2._targetAngle = Math.atan2(cur.ay, cur.ax);
      p2._targetAimDist = 250 + alen * 450;
    }

    if (p2._targetAngle !== undefined) {
      if (p2.angle === undefined || isNaN(p2.angle)) p2.angle = p2._targetAngle;
      var diff = U.angleDiff(p2.angle, p2._targetAngle);
      // Snappy and responsive yet silky smooth damp (~22 rad/s damping)
      var lambda = 22;
      p2.angle += diff * (1 - Math.exp(-lambda * effectiveDt));
      if (p2.angle > Math.PI) p2.angle -= U.TAU;
      if (p2.angle < -Math.PI) p2.angle += U.TAU;
    }

    p2._remoteAimDist = U.damp(p2._remoteAimDist || 450, p2._targetAimDist || 450, 14, effectiveDt);

    // === Auto-fire: ONLY when current crosshair ray is physically ON an enemy ===
    var w0 = p2.weapon;
    if (w0) {
      var weaponRange = w0.def.range || 900;
      var tgt = enemyOnCrosshair(game, p2, p2.angle, weaponRange * 1.15);
      if (tgt && w0.mag > 0 && !w0.reloading) {
        inp.mouseDown = true;
        inp.mousePressed = true;
        inp.fire = true;
        inp.firePressed = true;
      }
    }

    inp.device = 'pad';
  }

  /* ---- Patch P2 HUD crosshair to render at the smooth aim position ---- */
  const UI = BO.UIManager.prototype;
  const coopHUD = UI.renderHUD;
  UI.renderHUD = function (ctx, game, time) {
    coopHUD.call(this, ctx, game, time);
    if (!game.coop || !game.player2 || game.player2.dead) return;
    if (game.state !== BO.Game.STATE.PLAYING) return;
    var p2 = game.player2;
    var cam = game.camera;
    var dist = p2._remoteAimDist || 450;
    var sx = (p2.x + Math.cos(p2.angle) * dist - cam.x) * cam.zoom + cam.viewW / 2;
    var sy = (p2.y + Math.sin(p2.angle) * dist - cam.y) * cam.zoom + cam.viewH / 2;
    var dpr = game.renderer.dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Erase the old static crosshair drawn by v6-coop at hardcoded 150px
    var oldSx = (p2.x + Math.cos(p2.angle) * 150 - cam.x) * cam.zoom + cam.viewW / 2;
    var oldSy = (p2.y + Math.sin(p2.angle) * 150 - cam.y) * cam.zoom + cam.viewH / 2;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(oldSx, oldSy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Draw the new smooth crosshair
    ctx.strokeStyle = 'rgba(5,6,14,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#19c3dd'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();

    // Crosshair ticks
    ctx.strokeStyle = 'rgba(25,195,221,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx - 16, sy); ctx.lineTo(sx - 5, sy);
    ctx.moveTo(sx + 5, sy);  ctx.lineTo(sx + 16, sy);
    ctx.moveTo(sx, sy - 16); ctx.lineTo(sx, sy - 5);
    ctx.moveTo(sx, sy + 5);  ctx.lineTo(sx, sy + 16);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#19c3dd';
    ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    ctx.restore();
  };

  /* ----------------------------- Feedback ------------------------------- */
  var origDmg = G.onPlayerDamaged;
  if (origDmg) {
    G.onPlayerDamaged = function () {
      var res = origDmg.apply(this, arguments);
      if (this.player === (this.player2 || null)) {
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ t: 'haptic', ms: 120, strong: true })); } catch (e) {}
        }
      }
      return res;
    };
  }

  /* ------------------------------ Strings ------------------------------- */
  BO.I18N.extend('en', {
    'remote.connected': 'REMOTE CONTROLLER CONNECTED (P2)',
    'coop.noPad': 'P2: CONNECT A GAMEPAD / REMOTE CONTROLLER',
    'coop.reviveP2': 'P2: HOLD REVIVE BUTTON TO REVIVE',
  });
  BO.I18N.extend('fa', {
    'remote.connected': 'دسته ریموت وصل شد (بازیکن ۲)',
    'coop.noPad': 'بازیکن ۲: دسته یا کنترلر ریموت وصل کن',
    'coop.reviveP2': 'بازیکن ۲: دکمه REVIVE (احیا) را نگه دار',
  });
})(window.BO);
