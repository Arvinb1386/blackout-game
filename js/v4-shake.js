/* =========================================================================
 * BLACKOUT :: v4-shake.js
 * Screen-shake overhaul. Replaces the sine-based trauma wobble with layered
 * value noise and adds three new camera channels:
 *  - punch(angle, px): directional spring-damper kick that overshoots and
 *    settles (hits, blasts, recoil, dodges)
 *  - zoomPunch(k): brief zoom-in on heavy moments (big shots, kills, blasts)
 *  - rumble(k, s): sustained low-frequency sway (miniguns, boss slams,
 *    nearby explosions)
 * Everything respects Settings > SCREEN SHAKE.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const Cam = BO.Camera && BO.Camera.prototype;
  if (!Cam) return;

  const MAX_OFFSET = 30;
  const MAX_ROT = 0.05;
  const MAX_ZOOM = 0.12;
  const MAX_PUNCH = 52;
  const SPRING_K = 190;
  const SPRING_DAMP = 0.42;

  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1; }
  function fbm(x, seed) { return vnoise(x + seed) * 0.65 + vnoise(x * 2.3 + seed * 1.7) * 0.35; }

  function init(c) {
    if (c._v4s) return;
    c._v4s = true;
    c._px = 0; c._py = 0; c._pvx = 0; c._pvy = 0;
    c._zk = 0; c._rumble = 0; c._rumbleT = 0;
  }
  function reset(c) { init(c); c._px = c._py = c._pvx = c._pvy = 0; c._zk = 0; c._rumble = 0; c._rumbleT = 0; }

  Cam.punch = function (angle, amount) {
    init(this);
    if (!this.shakeEnabled || !(amount > 0) || !U.isFiniteNumber(angle)) return;
    const v = Math.min(amount, 40) * 24;
    this._pvx += Math.cos(angle) * v;
    this._pvy += Math.sin(angle) * v;
  };

  Cam.zoomPunch = function (amount) {
    init(this);
    if (!this.shakeEnabled || !(amount > 0)) return;
    this._zk = Math.min(MAX_ZOOM, this._zk + amount);
  };

  Cam.rumble = function (amount, duration) {
    init(this);
    if (!this.shakeEnabled || !(amount > 0)) return;
    this._rumble = Math.min(1, Math.max(this._rumble, amount));
    this._rumbleT = Math.max(this._rumbleT, duration || 0.3);
  };

  const origSnap = Cam.snapTo;
  Cam.snapTo = function (x, y) {
    origSnap.call(this, x, y);
    if (this._baseZoom !== undefined) this.zoom = this._baseZoom;
    reset(this);
  };

  const origUpdate = Cam.update;
  Cam.update = function (dt, target, aimX, aimY, lookAhead) {
    init(this);
    if (this._baseZoom !== undefined) this.zoom = this._baseZoom;
    origUpdate.call(this, dt, target, aimX, aimY, lookAhead);
    this._baseZoom = this.zoom;
    if (!this.shakeEnabled) { reset(this); this.shakeX = this.shakeY = this.shakeRot = 0; return; }

    if (this._rumbleT > 0) this._rumbleT -= dt;
    if (this._rumbleT <= 0) { this._rumbleT = 0; this._rumble = 0; }
    const t = this.time;
    const s = this.trauma * this.trauma;
    const rb = this._rumble * Math.min(1, this._rumbleT * 3);
    const hi = s * MAX_OFFSET, lo = rb * 10;
    this.shakeX = hi * fbm(t * 26, 1.3) + lo * fbm(t * 7, 9.1);
    this.shakeY = hi * fbm(t * 26, 47.9) + lo * fbm(t * 7, 77.7);
    this.shakeRot = MAX_ROT * s * fbm(t * 15, 133.3) + rb * 0.009 * fbm(t * 5, 21.2);

    // Directional punch: semi-implicit spring-damper, sub-stepped for stability.
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps, c = 2 * Math.sqrt(SPRING_K) * SPRING_DAMP;
    for (let i = 0; i < steps; i++) {
      this._pvx += (-SPRING_K * this._px - c * this._pvx) * h;
      this._pvy += (-SPRING_K * this._py - c * this._pvy) * h;
      this._px += this._pvx * h;
      this._py += this._pvy * h;
    }
    const pl = Math.hypot(this._px, this._py);
    if (pl > MAX_PUNCH) { this._px *= MAX_PUNCH / pl; this._py *= MAX_PUNCH / pl; }
    if (!U.isFiniteNumber(this._px + this._py + this._pvx + this._pvy)) reset(this);
    this.shakeX += this._px;
    this.shakeY += this._py;

    this._zk *= Math.exp(-6.5 * dt);
    if (this._zk < 1e-4) this._zk = 0;
    this.zoom = this._baseZoom * (1 + this._zk);
  };

  /* ------------------------------ Triggers ------------------------------ */
  const G = BO.Game && BO.Game.prototype;
  if (!G) return;
  const nearness = (g, x, y, r) => { const p = g.player; return p ? U.clamp(1 - U.dist(p.x, p.y, x, y) / r, 0, 1) : 0; };
  const wrap = (name, after) => {
    const orig = G[name];
    if (typeof orig !== 'function') return;
    G[name] = function () {
      const res = orig.apply(this, arguments);
      const args = arguments;
      if (this.camera && this.camera.punch) U.safe('v4shake.' + name, () => after.apply(this, args));
      return res;
    };
  };

  wrap('onPlayerFired', function (player, w, mx, my, angle) {
    const def = w.def, cam = this.camera;
    cam.punch(angle + Math.PI, def.shake * 12 + def.kick * 0.15);
    if (def.shake >= 0.3) cam.zoomPunch(0.01 + def.shake * 0.028);
    if (def.auto && def.fireRate >= 12) cam.rumble(0.1 + def.shake * 1.4, 0.14);
  });

  wrap('onPlayerDamaged', function (amount, sx, sy) {
    const p = this.player, cam = this.camera;
    if (!p) return;
    const a = Math.atan2(p.y - sy, p.x - sx);
    cam.punch(a, U.clamp(amount * 0.35, 3, 14));
    cam.zoomPunch(U.clamp(amount / 520, 0.008, 0.05));
    if (amount > 35) cam.rumble(0.45, 0.35);
  });

  wrap('explode', function (x, y, radius) {
    const p = this.player, cam = this.camera;
    if (!p) return;
    const k = nearness(this, x, y, Math.max(500, radius * 6));
    if (k <= 0) return;
    const a = Math.atan2(p.y - y, p.x - x);
    cam.punch(a, 24 * k * U.clamp(radius / 120, 0.5, 1.6));
    cam.zoomPunch(0.075 * k);
    cam.rumble(0.65 * k, 0.45 + 0.5 * k);
  });

  wrap('onEnemyKilled', function (e, info) {
    if (!info || info.source === 'hazard') return;
    const cam = this.camera;
    const k = nearness(this, e.x, e.y, 950);
    cam.zoomPunch(0.009 * k + (info.headshot ? 0.012 : 0));
    if (info.headshot && U.isFiniteNumber(info.angle)) cam.punch(info.angle + Math.PI, 3.5);
  });

  wrap('onPlayerMelee', function () { this.camera.addTrauma(0.15); });
  wrap('onBossSlam', function () { this.camera.rumble(0.85, 0.9); this.camera.zoomPunch(0.05); });
  wrap('onBossPhase', function () { this.camera.rumble(0.7, 1.2); });
  wrap('onBossIntro', function () { this.camera.rumble(0.5, 1.4); });

  wrap('onEnemyFired', function (e, x, y) {
    const loud = e.type === 'heavy' ? 0.02 : e.type === 'breacher' ? 0.06 : e.type === 'sniper' ? 0.05 : 0;
    if (!loud) return;
    const k = nearness(this, x, y, 520);
    if (k > 0) this.camera.addTrauma(loud * k);
  });

  // Suppression: enemy rounds smacking the wall right next to you.
  wrap('onBulletHitWorld', function (p, hit) {
    if (p.owner !== BO.PROJECTILE_OWNER.ENEMY || !this.player) return;
    const d = U.dist(hit.x, hit.y, this.player.x, this.player.y);
    if (d < 70) this.camera.addTrauma(0.05 * (1 - d / 70));
  });

  const P = BO.Player && BO.Player.prototype;
  if (P && P.update) {
    const origPU = P.update;
    P.update = function (dt, input, game) {
      const was = !!this.isDodging;
      origPU.call(this, dt, input, game);
      if (!was && this.isDodging && game && game.camera && game.camera.punch) {
        U.safe('v4shake.dodge', () => {
          const sp = Math.hypot(this.vx || 0, this.vy || 0);
          if (sp > 1) game.camera.punch(Math.atan2(this.vy, this.vx), 5);
        });
      }
    };
  }
})(window.BO);
