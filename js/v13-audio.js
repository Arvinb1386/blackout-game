/* =========================================================================
 * BLACKOUT :: v13-audio.js
 * More sound effects, all procedural (Web Audio), plugged into AudioSystem
 * and the game loop without touching the core files.
 *
 *  - ENEMY FOOTSTEPS: every hostile now makes steps you can hear in the dark,
 *    spatialised (pan + distance low-pass + reverb) and tuned per archetype:
 *    grunt boots, light quick rusher scuffs, armoured heavy stomps with gear
 *    rattle, soft creeping sniper steps. Dazed (blacked-out) hostiles stumble.
 *  - BOSS FOOTSTEPS: huge mech stomps with sub-bass, metal clang, hydraulic
 *    servo whine and a little screen shake when the boss is close.
 *  - SURFACES: steps (yours too) change with the floor under them: concrete,
 *    metal plate, grating, tiles, carpet, wood, snow crunch, ice, and splashes
 *    on rainy maps. Uses BO.V13Tex.floorAt() from v13-textures.js.
 *  - COMBAT CUES: radio squelch when a hostile spots you, blade "shing" + growl
 *    when a rusher winds up a lunge, rising spin-up whine when a heavy's
 *    minigun starts turning.
 *
 * Only the nearest few steps per frame are voiced, so big fights never spam
 * the mixer. Load order: after audio-plus.js (needs A._v) and after
 * v13-textures.js; anywhere before main.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U, AS = BO.AudioSystem;
  if (!U || !AS || !BO.Game) return;
  const A = AS.prototype, G = BO.Game.prototype;
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ------------------------------ Tuning ------------------------------ */
  const STEP = {
    grunt:   { stride: 44, vol: 0.24, weight: 0.55, hear: 760 },
    rusher:  { stride: 56, vol: 0.18, weight: 0.35, hear: 700, light: true },
    heavy:   { stride: 60, vol: 0.38, weight: 1.0,  hear: 900, gear: true },
    sniper:  { stride: 46, vol: 0.12, weight: 0.4,  hear: 520 },
    default: { stride: 46, vol: 0.22, weight: 0.55, hear: 740 }
  };
  const BOSS = { stride: 84, vol: 0.85, weight: 2.2, hear: 1700 };
  const MAX_STEPS_PER_FRAME = 3;
  const MAX_TELEPORT = 140; // px in one frame: a spawn / knockback, not a step

  /** Sound family for a floor material from v13-textures.js. */
  const FAMILY = {
    concrete: 'concrete', asphalt: 'concrete', flagstone: 'stone', mosaic: 'stone',
    plate: 'metal', panel: 'metal', raised: 'metal', grate: 'grate',
    tile: 'tile', carpet: 'carpet', planks: 'wood', snow: 'snow', ice: 'ice'
  };
  function surfaceAt(g, x, y) {
    const lv = g && g.level;
    if (!lv) return 'concrete';
    const mat = BO.V13Tex && BO.V13Tex.floorAt ? BO.V13Tex.floorAt(lv, x, y) : 'concrete';
    return FAMILY[mat] || 'concrete';
  }
  const isWet = g => !!(g && g.level && g.level.theme && g.level.theme.weather === 'rain');

  /* --------------------------- Step synthesis --------------------------- */
  /**
   * One footstep. o = { x, y, vol, weight, surface, wet, light, gear, boss, near }
   * Position undefined = at the listener (the player's own feet).
   */
  A.v13Step = function (o) {
    if (!this._ready || !this._ready() || !this._v) return false;
    const out = this._v(o.x, o.y, o.vol, o.boss ? 0.3 : 0.14, 0);
    if (!out) return false;
    const t = this.ctx.currentTime + (o.delay || 0);
    const w = o.weight || 0.5;
    // Heel strike: low thud whose weight scales with the body.
    this.noise({ when: t, brown: true, dur: 0.05 + w * 0.05, filter: 'lowpass', freq: rnd(500, 750) / Math.sqrt(w + 0.3), freqEnd: 120, vol: 0.9, out });
    this.tone({ when: t, type: 'sine', freq: rnd(70, 95) / (0.6 + w * 0.4), freqEnd: 38, dur: 0.05 + w * 0.05, vol: 0.35 + w * 0.25, out });
    switch (o.surface) {
      case 'metal':
        if (this._bell) this._bell(t + 0.004, rnd(900, 1500) / (0.7 + w * 0.3), 0.09 + w * 0.05, 0.05 + w * 0.03, out);
        this.noise({ when: t, dur: 0.03, filter: 'highpass', freq: 2600, vol: 0.35, out });
        break;
      case 'grate':
        if (this._ticks) this._ticks(t + 0.005, 3 + Math.round(w * 2), 0.07, 1500, 4200, 0.3, out);
        if (this._bell) this._bell(t, rnd(600, 900), 0.12, 0.04, out);
        break;
      case 'tile':
        this.noise({ when: t, dur: 0.018, filter: 'highpass', freq: 3600, vol: 0.55, out, attack: 0.0006 });
        this.noise({ when: t + 0.01, dur: 0.04, filter: 'bandpass', freq: rnd(2200, 2900), q: 3, vol: 0.25, out });
        break;
      case 'stone':
        this.noise({ when: t, dur: 0.04, filter: 'bandpass', freq: rnd(1500, 2100), q: 1.6, vol: 0.4, out });
        if (this._ticks && Math.random() < 0.3) this._ticks(t + 0.02, 1, 0.04, 3000, 5200, 0.12, out); // grit
        break;
      case 'carpet':
        this.noise({ when: t, dur: 0.06, filter: 'lowpass', freq: 420, vol: 0.5, out });
        break;
      case 'wood':
        this.tone({ when: t, type: 'triangle', freq: rnd(170, 210), freqEnd: 120, dur: 0.07, vol: 0.28, out });
        this.noise({ when: t, dur: 0.05, filter: 'bandpass', freq: rnd(700, 950), q: 2.2, vol: 0.4, out });
        if (Math.random() < 0.15) this.tone({ when: t + 0.03, type: 'sawtooth', freq: rnd(380, 520), freqEnd: 300, dur: 0.12, vol: 0.03, out, filter: 'bandpass', filterFreq: 900, q: 6 }); // creak
        break;
      case 'snow':
        for (let i = 0; i < 6; i++) this.noise({ when: t + i * rnd(0.008, 0.016), dur: rnd(0.012, 0.03), filter: 'bandpass', freq: rnd(1400, 4200), q: rnd(2, 5), vol: rnd(0.25, 0.5), out, attack: 0.001 });
        this.noise({ when: t, dur: 0.1, filter: 'lowpass', freq: 1600, freqEnd: 500, vol: 0.3, out });
        break;
      case 'ice':
        this.noise({ when: t, dur: 0.015, filter: 'highpass', freq: 4200, vol: 0.5, out, attack: 0.0006 });
        if (Math.random() < 0.25) this.tone({ when: t + 0.01, type: 'sine', freq: rnd(2600, 3600), freqEnd: 1800, dur: 0.06, vol: 0.05, out });
        break;
      default: // concrete
        this.noise({ when: t + 0.006, dur: 0.04, filter: 'bandpass', freq: rnd(2000, 3000), q: 1.8, vol: 0.3, out }); // scuff
    }
    if (o.wet) this.noise({ when: t, dur: 0.12, filter: 'bandpass', freq: 1300, freqEnd: 3200, q: 1.2, vol: 0.35, out, attack: 0.004 });
    if (o.light) this.noise({ when: t + 0.02, dur: 0.05, filter: 'bandpass', freq: rnd(3000, 4200), q: 2, vol: 0.2, out }); // sole squeak / scrape
    if (o.gear && this._ticks) this._ticks(t + 0.02, 2, 0.08, 2000, 4200, 0.22, out); // armour plates rattling
    if (o.boss) {
      // Mech stomp: sub drop, chassis clang and a hydraulic servo.
      this.tone({ when: t, type: 'sine', freq: 52, freqEnd: 22, dur: 0.45, vol: 1, out, attack: 0.003 });
      this.noise({ when: t, brown: true, dur: 0.45, filter: 'lowpass', freq: 900, freqEnd: 70, vol: 1, out });
      if (this._bell) this._bell(t + 0.01, rnd(320, 420), 0.35, 0.08, out);
      this.tone({ when: t - 0.12 > this.ctx.currentTime ? t - 0.12 : t, type: 'sawtooth', freq: rnd(260, 320), freqEnd: rnd(150, 190), dur: 0.22, vol: 0.06, out, filter: 'bandpass', filterFreq: 1100, q: 3, attack: 0.04 });
      this.noise({ when: t + 0.05, dur: 0.18, filter: 'highpass', freq: 3800, vol: 0.12, out, attack: 0.03 }); // hydraulic hiss
      if (this._ticks) this._ticks(t + 0.06, 4, 0.25, 1200, 3800, 0.18, out); // debris
    }
    return true;
  };

  /** Radio squelch + static burst: a hostile just called you in. */
  A.v13Radio = function (x, y) {
    if (!this._ready || !this._ready() || !this._v || !this._throttle('v13radio', 0.45)) return;
    const out = this._v(x, y, 0.2, 0.12, 0.08);
    if (!out) return;
    const t = this.ctx.currentTime;
    this.noise({ when: t, dur: 0.035, filter: 'bandpass', freq: 2200, q: 4, vol: 1, out, attack: 0.0008 });
    this.tone({ when: t, type: 'square', freq: 1350, freqEnd: 950, dur: 0.05, vol: 0.12, out, filter: 'bandpass', filterFreq: 1600, q: 3 });
    this.noise({ when: t + 0.04, dur: 0.22, filter: 'bandpass', freq: 1800, q: 0.8, vol: 0.35, out, attack: 0.01 });
    this.tone({ when: t + 0.27, type: 'square', freq: 900, dur: 0.03, vol: 0.08, out, filter: 'bandpass', filterFreq: 1400, q: 3 });
  };

  /** Rusher wind-up: blade shing + throaty growl. */
  A.v13Lunge = function (x, y) {
    if (!this._ready || !this._ready() || !this._v || !this._throttle('v13lunge', 0.12)) return;
    const out = this._v(x, y, 0.28, 0.12, 0.05);
    if (!out) return;
    const t = this.ctx.currentTime;
    this.noise({ when: t, dur: 0.16, filter: 'bandpass', freq: 5200, freqEnd: 2600, q: 3, vol: 0.7, out, attack: 0.01 });
    this.tone({ when: t, type: 'sawtooth', freq: 6200, freqEnd: 4100, dur: 0.12, vol: 0.03, out, filter: 'highpass', filterFreq: 3000 });
    this.tone({ when: t, type: 'sawtooth', freq: rnd(85, 105), freqEnd: 70, dur: 0.24, vol: 0.12, out, filter: 'bandpass', filterFreq: 600, q: 4, attack: 0.02 });
  };

  /** Heavy minigun spin-up whine. */
  A.v13SpinUp = function (x, y) {
    if (!this._ready || !this._ready() || !this._v || !this._throttle('v13spin', 0.3)) return;
    const out = this._v(x, y, 0.3, 0.14, 0.05);
    if (!out) return;
    const t = this.ctx.currentTime;
    this.tone({ when: t, type: 'sawtooth', freq: 140, freqEnd: 820, dur: 0.75, vol: 0.12, out, filter: 'bandpass', filterFreq: 1400, q: 2, attack: 0.05 });
    this.tone({ when: t, type: 'square', freq: 70, freqEnd: 410, dur: 0.75, vol: 0.05, out, filter: 'lowpass', filterFreq: 900, attack: 0.05 });
    if (this._ticks) this._ticks(t, 8, 0.7, 2500, 5000, 0.12, out);
  };

  /* ------------------- Player footsteps: surface layer ------------------- */
  const origFootstep = A.footstep;
  if (origFootstep) {
    A.footstep = function (sprint) {
      const before = this.lastPlayed && this.lastPlayed.step;
      const r = origFootstep.apply(this, arguments);
      // Only layer when the original actually played (it is throttled).
      if (!this._ready || !this._ready() || !this.lastPlayed || this.lastPlayed.step === before) return r;
      U.safe('v13.pstep', () => {
        const g = BO.game, p = g && g.player;
        if (!p) return;
        const surface = surfaceAt(g, p.x, p.y);
        const wet = isWet(g);
        if (surface === 'concrete' && !wet) return; // the stock step already is concrete
        this.v13Step({ vol: sprint ? 0.12 : 0.07, weight: 0.45, surface, wet });
      });
      return r;
    };
  }

  /* ------------------------- World step tracking ------------------------- */
  const S = () => BO.ENEMY_STATE || {};
  function engagedState(e) {
    const st = S();
    return e.state === st.CHASE || e.state === st.ATTACK || e.state === st.RETREAT;
  }

  function track(g, e, isBoss, cands, lx, ly, a) {
    if (!e) return;
    if (e.dead) { e._v13 = null; return; }
    const prof = isBoss ? BOSS : (STEP[e.type] || STEP.default);
    let m = e._v13;
    if (!m) { m = e._v13 = { x: e.x, y: e.y, acc: Math.random() * prof.stride, eng: !isBoss && engagedState(e), windup: e.windup || 0, spin: e.spin || 0 }; return; }
    const dx = e.x - m.x, dy = e.y - m.y;
    m.x = e.x; m.y = e.y;
    const d = Math.hypot(dx, dy);
    const dist = Math.hypot(e.x - lx, e.y - ly);
    // Combat cues on state transitions.
    if (!isBoss) {
      const eng = engagedState(e);
      if (eng && !m.eng && dist < 950) a.v13Radio(e.x, e.y);
      m.eng = eng;
      if (e.type === 'rusher' && (e.windup || 0) > 0 && !(m.windup > 0) && dist < 800) a.v13Lunge(e.x, e.y);
      m.windup = e.windup || 0;
      if (e.type === 'heavy' && (e.spin || 0) > 0.05 && !(m.spin > 0.05) && dist < 900) a.v13SpinUp(e.x, e.y);
      m.spin = e.spin || 0;
    }
    if (d > MAX_TELEPORT || d < 0.01) return;
    const scale = isBoss && e.r ? U.clamp(e.r / 40, 1, 2) : 1;
    const dazed = e.v10daze > 0;
    const stride = prof.stride * scale * (dazed ? 0.7 : 1);
    m.acc += d;
    if (m.acc < stride) return;
    m.acc = m.acc > stride * 2 ? 0 : m.acc - stride;
    if (dist > prof.hear) return;
    const fall = 1 - dist / prof.hear;
    cands.push({ e, prof, dist, isBoss, k: fall, dazed });
  }

  function stepWorld(g) {
    const a = g.audio;
    if (!a || !a._ready || !a._ready() || !a.v13Step) return;
    const lx = a.listenerX, ly = a.listenerY;
    const cands = [];
    const seen = new Set();
    const list = g.enemies || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e) continue;
      seen.add(e);
      track(g, e, !!e.isBoss, cands, lx, ly, a);
    }
    const b = g.boss;
    if (b && !seen.has(b) && b.mode !== 'dormant') track(g, b, true, cands, lx, ly, a);
    if (!cands.length) return;
    cands.sort((p, q) => p.dist - q.dist);
    const wet = isWet(g);
    const n = Math.min(MAX_STEPS_PER_FRAME, cands.length);
    for (let i = 0; i < n; i++) {
      const c = cands[i], e = c.e;
      const vol = c.prof.vol * (0.35 + 0.65 * c.k) * (c.dazed ? 0.8 : 1);
      a.v13Step({
        x: e.x, y: e.y, vol, weight: c.prof.weight, surface: surfaceAt(g, e.x, e.y), wet,
        light: !!c.prof.light, gear: !!c.prof.gear, boss: c.isBoss, delay: i * 0.012 + (c.dazed ? Math.random() * 0.05 : 0)
      });
      if (c.isBoss && g.camera && g.camera.addTrauma && c.dist < 700) g.camera.addTrauma(0.06 * (1 - c.dist / 700));
    }
  }

  const origUpdate = G._update;
  G._update = function (dt) {
    const r = origUpdate.apply(this, arguments);
    const ST = BO.Game.STATE;
    if (ST && this.state !== ST.PLAYING) return r;
    if (this.player && this.enemies) U.safe('v13.steps', () => stepWorld(this));
    return r;
  };

  BO.V13Audio = { STEP, BOSS, FAMILY, surfaceAt, stepWorld };
})(window.BO);
