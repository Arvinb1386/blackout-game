/* =========================================================================
 * BLACKOUT :: audio-plus.js
 * Sound overhaul (v3). Plugs into AudioSystem without touching audio.js.
 *  - Mixer: convolution reverb send, bus saturation + EQ, tighter limiter,
 *    distance low-pass (far sounds get muffled and wetter), low-HP muffle.
 *  - Layered gunshots for every weapon: transient + crack + body + sub +
 *    brown-noise tail + mechanical action (clack, bolt, pump) with per-shot
 *    pitch / timbre variation so automatic fire never sounds like a loop.
 *  - New SFX: footsteps, bullet whiz-bys, brass tinkle, ricochets, armour
 *    thuds, power-down deaths, multi-layer explosions with debris rattle.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const AS = BO.AudioSystem;
  if (!AS) return;
  const A = AS.prototype;
  const rnd = U.rand;

  /* ---------------------------- Buffers ---------------------------- */
  function makeIR(ctx, seconds, decay) {
    const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.9 - t * 0.75); // tail darkens as it decays
        d[i] = lp * Math.pow(1 - t, decay);
      }
      // A handful of early reflections: concrete corridors.
      for (let k = 0; k < 10; k++) {
        const idx = Math.floor(rate * (0.006 + Math.random() * 0.07));
        if (idx < len) d[idx] += (Math.random() < 0.5 ? -1 : 1) * 0.7 * (1 - k / 10);
      }
    }
    return buf;
  }

  function makeBrown(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return buf;
  }

  function driveCurve(k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    return c;
  }

  /* ----------------------------- Mixer ----------------------------- */
  const origBuild = A._buildGraph;
  A._buildGraph = function () {
    origBuild.call(this);
    U.safe('audio+.graph', () => {
      const ctx = this.ctx;
      this.brownBuffer = makeBrown(ctx, 3);
      const drive = ctx.createWaveShaper();
      drive.curve = driveCurve(1.6);
      drive.oversample = '2x';
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 110; lowShelf.gain.value = 4.5;
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking'; presence.frequency.value = 3000; presence.Q.value = 0.9; presence.gain.value = 2;
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.6;
      this.sfxBus.disconnect();
      this.sfxBus.connect(drive);
      drive.connect(lowShelf); lowShelf.connect(presence); presence.connect(this.muffle);
      this.muffle.connect(this.master);

      const rvIn = ctx.createGain();
      const rvHP = ctx.createBiquadFilter(); rvHP.type = 'highpass'; rvHP.frequency.value = 200;
      const rvLP = ctx.createBiquadFilter(); rvLP.type = 'lowpass'; rvLP.frequency.value = 5500;
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = makeIR(ctx, 2.6, 3);
      const rvOut = ctx.createGain(); rvOut.gain.value = 0.5;
      rvIn.connect(rvHP); rvHP.connect(this.reverb); this.reverb.connect(rvLP); rvLP.connect(rvOut); rvOut.connect(this.muffle);
      this.sfxWet = ctx.createGain();
      this.sfxWet.connect(rvIn);
      const musicSend = ctx.createGain(); musicSend.gain.value = 0.22;
      this.musicFilter.connect(musicSend); musicSend.connect(rvIn);

      const c = this.compressor;
      c.threshold.value = -12; c.knee.value = 10; c.ratio.value = 6; c.attack.value = 0.003; c.release.value = 0.2;
      this.applyVolumes();
    });
  };

  const origApply = A.applyVolumes;
  A.applyVolumes = function () {
    origApply.call(this);
    if (this.ctx && this.sfxWet) this.sfxWet.gain.setTargetAtTime(this.volumes.sfx, this.ctx.currentTime, 0.05);
  };

  A.setMuffle = function (on) {
    if (!this.ctx || !this.muffle || this._muffled === on) return;
    this._muffled = on;
    this.muffle.frequency.setTargetAtTime(on ? 2200 : 20000, this.ctx.currentTime, 0.25);
  };

  /** Spatial voice output: gain -> distance low-pass -> pan -> sfx bus (+ reverb send). Null if inaudible. */
  A._v = function (x, y, vol, wet, minVol, panOverride) {
    const ctx = this.ctx;
    const s = this.spatial(x, y);
    const sv = Math.max(s.vol, minVol || 0);
    if (sv <= 0.01) return null;
    const far = x === undefined ? 0 : 1 - s.vol;
    const g = ctx.createGain();
    g.gain.value = vol * Math.pow(sv, 1.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.value = 20000 * Math.pow(0.07, far);
    g.connect(lp);
    let tail = lp;
    const pan = panOverride !== undefined ? panOverride : s.pan;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = U.clamp(pan, -1, 1);
      lp.connect(p);
      tail = p;
    }
    tail.connect(this.sfxBus);
    if (this.sfxWet) {
      const w = ctx.createGain();
      w.gain.value = (wet || 0.15) + far * 0.45;
      tail.connect(w); w.connect(this.sfxWet);
    }
    return g;
  };

  /** Noise voice with optional brown-noise source. */
  A.noise = function (o) {
    const ctx = this.ctx, t = (o.when || ctx.currentTime);
    const buf = (o.brown && this.brownBuffer) ? this.brownBuffer : this.noiseBuffer;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(o.freqEnd, 20), t + o.dur);
    f.Q.value = o.q || 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(o.vol, 0.0002), t + (o.attack || 0.003));
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(env).connect(o.out || this._out(o.dest, 1, o.pan));
    src.start(t, Math.random() * Math.max(0, buf.duration - o.dur - 0.1));
    src.stop(t + o.dur + 0.05);
  };

  /** Inharmonic metallic ring. */
  A._bell = function (t, f, dur, vol, out) {
    const partials = [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]];
    for (let i = 0; i < partials.length; i++) {
      this.tone({ when: t, type: 'sine', freq: f * partials[i][0], dur: dur * (1 - i * 0.18), vol: vol * partials[i][1], out, attack: 0.001 });
    }
  };

  /** Random short clicks: debris, chips, gear rattle. */
  A._ticks = function (t, n, spread, f0, f1, vol, out) {
    for (let i = 0; i < n; i++) {
      this.noise({ when: t + Math.random() * spread, dur: rnd(0.008, 0.025), filter: 'bandpass', freq: rnd(f0, f1), q: rnd(3, 8), vol: vol * rnd(0.5, 1), out, attack: 0.0008 });
    }
  };

  A._ricochet = function (t, out) {
    const f = rnd(2600, 4200);
    this.tone({ when: t, type: 'sine', freq: f, freqEnd: f * 0.35, dur: rnd(0.18, 0.32), vol: 0.28, out, attack: 0.005 });
    this.tone({ when: t, type: 'sine', freq: f * 1.5, freqEnd: f * 0.5, dur: 0.16, vol: 0.08, out, attack: 0.005 });
  };

  /* --------------------------- Gunshots --------------------------- */
  // crack: [bandpass Hz, dur] body: [f0, f1, dur] sub: [f0, f1, dur, gain] tail: [dur, lp0, lp1, gain]
  const GUNS = {
    pistol:      { vol: 0.55, crack: [2600, 0.06], body: [190, 60, 0.09], tail: [0.35, 2200, 300, 0.35], mech: 'light', wet: 0.18 },
    revolver:    { vol: 0.8,  crack: [2000, 0.1],  body: [140, 40, 0.18], sub: [70, 30, 0.25, 0.6], tail: [0.7, 1800, 200, 0.5], ring: [1900, 0.25], wet: 0.25 },
    smg:         { vol: 0.36, crack: [3000, 0.04], body: [230, 90, 0.05], tail: [0.22, 2600, 500, 0.3], mech: 'light', wet: 0.12 },
    rifle:       { vol: 0.5,  crack: [3400, 0.06], body: [160, 50, 0.08], sub: [80, 40, 0.12, 0.4], tail: [0.45, 2400, 300, 0.4], mech: 'light', wet: 0.18 },
    burst:       { vol: 0.44, crack: [3800, 0.05], body: [180, 60, 0.07], sub: [85, 40, 0.1, 0.3], tail: [0.35, 2600, 350, 0.35], mech: 'light', wet: 0.16 },
    shotgun:     { vol: 0.95, crack: [1600, 0.14], body: [110, 34, 0.22], sub: [65, 26, 0.32, 0.9], tail: [0.9, 1600, 160, 0.6], mech: 'pump', wet: 0.28 },
    dmr:         { vol: 0.7,  crack: [4200, 0.09], body: [130, 40, 0.14], sub: [70, 30, 0.2, 0.6], tail: [0.8, 2600, 250, 0.5], mech: 'heavy', wet: 0.25 },
    lmg:         { vol: 0.5,  crack: [3000, 0.06], body: [140, 45, 0.09], sub: [75, 35, 0.14, 0.5], tail: [0.45, 2200, 280, 0.4], mech: 'light', wet: 0.18 },
    sniper:      { vol: 1.0,  crack: [5200, 0.14], body: [100, 28, 0.3], sub: [55, 22, 0.5, 1], tail: [1.6, 3000, 180, 0.7], mech: 'bolt', wet: 0.35 },
    launcher:    { vol: 0.7,  crack: [900, 0.12],  body: [260, 60, 0.2], sub: [60, 30, 0.3, 0.6], tail: [0.6, 900, 150, 0.4], whoosh: true, mech: 'heavy', wet: 0.2 },
    enemy:       { vol: 0.36, crack: [2600, 0.05], body: [140, 50, 0.07], tail: [0.35, 1900, 280, 0.35], wet: 0.2 },
    heavy:       { vol: 0.32, crack: [2200, 0.05], body: [110, 45, 0.06], sub: [70, 35, 0.08, 0.3], tail: [0.25, 1700, 300, 0.3], wet: 0.15, gap: 0.02 },
    esniper:     { vol: 0.8,  crack: [4600, 0.12], body: [95, 30, 0.26], sub: [55, 24, 0.4, 0.8], tail: [1.3, 2600, 200, 0.6], wet: 0.35 },
    boss:        { vol: 0.42, crack: [1500, 0.08], body: [320, 80, 0.12], sub: [60, 28, 0.2, 0.6], tail: [0.5, 1400, 200, 0.4], energy: [900, 160, 0.18], wet: 0.25 },
    mpistol:     { vol: 0.32, crack: [3400, 0.035], body: [240, 100, 0.045], tail: [0.2, 2800, 600, 0.28], mech: 'light', wet: 0.12 },
    stinger:     { vol: 0.7,  crack: [1100, 0.1],  body: [220, 50, 0.22], sub: [60, 28, 0.3, 0.6], tail: [0.6, 1000, 160, 0.4], whoosh: true, wet: 0.22 },
    autoshotgun: { vol: 0.78, crack: [1800, 0.11], body: [105, 34, 0.18], sub: [65, 28, 0.24, 0.7], tail: [0.6, 1700, 180, 0.5], mech: 'light', wet: 0.22 },
    minigun:     { vol: 0.3,  crack: [3400, 0.03], body: [170, 70, 0.035], sub: [80, 40, 0.05, 0.25], tail: [0.16, 2400, 500, 0.25], wet: 0.1, gap: 0.02 },
    plasma:      { vol: 0.38, crack: [1800, 0.04], body: [640, 180, 0.1], tail: [0.3, 1500, 300, 0.25], energy: [1500, 280, 0.16], wet: 0.3 },
    railgun:     { vol: 1.0,  crack: [6000, 0.12], body: [80, 26, 0.4], sub: [50, 20, 0.6, 1], tail: [1.4, 3200, 200, 0.6], energy: [2600, 120, 0.5], ring: [3100, 0.9], wet: 0.4 }
  };
  BO.GUN_SOUNDS = GUNS;

  const origShot = A.shot;
  A.shot = function (kind, x, y, pitch) {
    if (!this._ready()) return;
    const p = GUNS[kind];
    if (!p) return origShot.call(this, kind, x, y, pitch);
    if (!this._throttle('shot:' + kind, p.gap || 0.028)) return;
    const out = this._v(x, y, p.vol, p.wet);
    if (!out) return;
    const t = this.ctx.currentTime;
    const k = (pitch || 1) * rnd(0.95, 1.05);
    // 1. Transient click: the "snap" that makes it feel instant.
    this.noise({ when: t, dur: 0.014, filter: 'highpass', freq: 4500, vol: 0.8, out, attack: 0.0008 });
    // 2. Crack: supersonic / muzzle blast band.
    this.noise({ when: t, dur: p.crack[1] * rnd(0.9, 1.1), filter: 'bandpass', freq: p.crack[0] * k, freqEnd: p.crack[0] * 0.45, q: 0.9, vol: 1.1, out, attack: 0.001 });
    // 3. Body: pitched punch.
    this.tone({ when: t, type: 'triangle', freq: p.body[0] * k, freqEnd: p.body[1], dur: p.body[2], vol: 0.95, out, attack: 0.001 });
    // 4. Sub: chest thump for big guns.
    if (p.sub) this.tone({ when: t, type: 'sine', freq: p.sub[0] * k, freqEnd: p.sub[1], dur: p.sub[2], vol: p.sub[3], out, attack: 0.002 });
    // 5. Tail: rolling brown-noise decay that feeds the reverb.
    this.noise({ when: t + 0.006, brown: true, dur: p.tail[0] * rnd(0.9, 1.1), filter: 'lowpass', freq: p.tail[1] * k, freqEnd: p.tail[2], q: 0.6, vol: p.tail[3], out, attack: 0.004 });
    if (p.energy) {
      const e = p.energy;
      this.tone({ when: t, type: 'sawtooth', freq: e[0] * k, freqEnd: e[1], dur: e[2], vol: 0.35, out, filter: 'lowpass', filterFreq: 5000 });
      this.tone({ when: t, type: 'square', freq: e[0] * k * 1.007, freqEnd: e[1] * 1.5, dur: e[2] * 0.7, vol: 0.12, out, filter: 'bandpass', filterFreq: 2200, q: 2 });
    }
    if (p.ring) this._bell(t, p.ring[0] * k, p.ring[1], 0.1, out);
    if (p.whoosh) this.noise({ when: t, dur: 0.45, filter: 'bandpass', freq: 350, freqEnd: 2800, q: 1.3, vol: 0.6, out, attack: 0.03 });
    if (p.mech) this._mech(p.mech, t);
  };

  /** Mechanical action, always close to the listener (it's your gun). */
  A._mech = function (type, t) {
    const out = this._v(undefined, undefined, type === 'light' ? 0.16 : 0.26, 0.06);
    if (!out) return;
    const click = (when, f, v, q) => this.noise({ when, dur: 0.014, filter: 'bandpass', freq: f, q: q || 6, vol: v, out, attack: 0.0006 });
    if (type === 'light') {
      click(t + 0.03, rnd(3800, 4600), 0.9);
      click(t + 0.048, rnd(2000, 2600), 0.6, 4);
    } else if (type === 'heavy') {
      click(t + 0.04, 2600, 1);
      this.tone({ when: t + 0.04, type: 'triangle', freq: 1250, freqEnd: 1100, dur: 0.07, vol: 0.18, out });
      click(t + 0.07, 1500, 0.7, 3);
    } else if (type === 'pump') {
      const p = t + 0.3;
      this.noise({ when: p, dur: 0.08, filter: 'bandpass', freq: 1500, freqEnd: 800, q: 2, vol: 0.8, out });
      click(p + 0.005, 3200, 1);
      this.noise({ when: p + 0.13, dur: 0.07, filter: 'bandpass', freq: 900, freqEnd: 1700, q: 2, vol: 0.8, out });
      click(p + 0.2, 2600, 1.1);
      this.tone({ when: p + 0.2, type: 'triangle', freq: 900, freqEnd: 800, dur: 0.06, vol: 0.2, out });
    } else if (type === 'bolt') {
      const b = t + 0.42;
      click(b, 2800, 1);
      this.noise({ when: b + 0.02, dur: 0.1, filter: 'bandpass', freq: 1800, freqEnd: 1100, q: 3, vol: 0.6, out });
      click(b + 0.17, 2200, 1);
      this.noise({ when: b + 0.19, dur: 0.09, filter: 'bandpass', freq: 1200, freqEnd: 2000, q: 3, vol: 0.6, out });
      click(b + 0.3, 3400, 1.2);
    }
  };

  /* ---------------------------- Reloads ---------------------------- */
  A.reloadStart = function () {
    if (!this._ready()) return;
    const out = this._v(undefined, undefined, 0.32, 0.06);
    const t = this.ctx.currentTime;
    this.noise({ when: t, dur: 0.014, filter: 'bandpass', freq: 3600, q: 6, vol: 1, out, attack: 0.0006 }); // mag release
    this.noise({ when: t + 0.03, dur: 0.14, filter: 'bandpass', freq: 1400, freqEnd: 650, q: 2.5, vol: 0.7, out, attack: 0.01 }); // slide out
    this.tone({ when: t + 0.02, type: 'triangle', freq: 820, freqEnd: 760, dur: 0.05, vol: 0.12, out });
  };

  A.reloadEnd = function () {
    if (!this._ready()) return;
    const out = this._v(undefined, undefined, 0.38, 0.06);
    const t = this.ctx.currentTime;
    // Mag seat: plastic-metal thunk.
    this.noise({ when: t, brown: true, dur: 0.06, filter: 'lowpass', freq: 1200, freqEnd: 300, vol: 1, out });
    this.noise({ when: t, dur: 0.02, filter: 'bandpass', freq: 2400, q: 5, vol: 1, out, attack: 0.0006 });
    this.tone({ when: t, type: 'sine', freq: 230, freqEnd: 140, dur: 0.06, vol: 0.4, out });
    // Charging handle: back... and forward.
    this.noise({ when: t + 0.12, dur: 0.06, filter: 'bandpass', freq: 1700, freqEnd: 2600, q: 3, vol: 0.7, out });
    this.noise({ when: t + 0.2, dur: 0.016, filter: 'bandpass', freq: 3800, q: 7, vol: 1.1, out, attack: 0.0006 });
    this._bell(t + 0.2, 2300, 0.12, 0.06, out);
  };

  A.empty = function () {
    if (!this._ready() || !this._throttle('empty', 0.18)) return;
    const out = this._v(undefined, undefined, 0.2, 0.04);
    const t = this.ctx.currentTime;
    this.noise({ when: t, dur: 0.01, filter: 'highpass', freq: 3000, vol: 1, out, attack: 0.0005 });
    this.tone({ when: t, type: 'triangle', freq: 2500, freqEnd: 2100, dur: 0.02, vol: 0.4, out });
  };

  /* ---------------------------- Impacts ---------------------------- */
  A.impact = function (x, y, kind) {
    if (!this._ready() || !this._throttle('impact', 0.03)) return;
    const out = this._v(x, y, 0.26, 0.2);
    if (!out) return;
    const t = this.ctx.currentTime;
    if (kind === 'metal') {
      this._bell(t, rnd(1800, 3200), 0.25, 0.22, out);
      this.noise({ when: t, dur: 0.03, filter: 'highpass', freq: 3000, vol: 0.9, out });
      if (Math.random() < 0.3) this._ricochet(t + 0.01, out);
    } else {
      this.noise({ when: t, dur: 0.045, filter: 'bandpass', freq: rnd(1800, 2800), q: 1.2, vol: 1, out, attack: 0.0008 });
      this.noise({ when: t, brown: true, dur: 0.12, filter: 'lowpass', freq: 900, freqEnd: 200, vol: 0.6, out });
      this._ticks(t + 0.02, 3, 0.15, 2500, 6000, 0.25, out);
      if (Math.random() < 0.12) this._ricochet(t + 0.01, out);
    }
  };

  A.enemyHit = function (x, y, crit) {
    if (!this._ready() || !this._throttle('ehit', 0.03)) return;
    const out = this._v(x, y, 0.36, 0.12, 0.3);
    if (!out) return;
    const t = this.ctx.currentTime;
    this.tone({ when: t, type: 'sine', freq: rnd(150, 190), freqEnd: 55, dur: 0.09, vol: 1, out });
    this.noise({ when: t, brown: true, dur: 0.08, filter: 'lowpass', freq: 1400, freqEnd: 300, vol: 0.9, out });
    this.noise({ when: t, dur: 0.04, filter: 'bandpass', freq: rnd(2600, 3400), q: 3, vol: 0.4, out }); // armour plate tick
    this.tone({ when: t, type: 'square', freq: rnd(90, 120), dur: 0.05, vol: 0.12, out, filter: 'bandpass', filterFreq: 1800, q: 3 }); // circuit crackle
    if (crit) {
      this._bell(t, 1760, 0.35, 0.22, out);
      this.tone({ when: t + 0.03, type: 'triangle', freq: 2637, dur: 0.18, vol: 0.12, out });
    }
  };

  A.enemyDeath = function (x, y) {
    if (!this._ready()) return;
    const out = this._v(x, y, 0.5, 0.25, 0.25);
    if (!out) return;
    const t = this.ctx.currentTime;
    // Suit power-down.
    this.tone({ when: t, type: 'sawtooth', freq: rnd(520, 640), freqEnd: 38, dur: 0.55, vol: 0.45, out, filter: 'lowpass', filterFreq: 1800 });
    this.tone({ when: t, type: 'square', freq: rnd(300, 360), freqEnd: 30, dur: 0.4, vol: 0.12, out, filter: 'lowpass', filterFreq: 1200 });
    for (let i = 0; i < 4; i++) {
      this.tone({ when: t + 0.03 + i * rnd(0.04, 0.08), type: 'square', freq: rnd(400, 2200), dur: 0.025, vol: 0.1, out, filter: 'bandpass', filterFreq: 2000, q: 2 });
    }
    this.noise({ when: t, dur: 0.25, filter: 'bandpass', freq: 2000, freqEnd: 300, q: 0.8, vol: 0.5, out });
    // Body + gear hitting the floor.
    const f = t + rnd(0.22, 0.32);
    this.tone({ when: f, type: 'sine', freq: 110, freqEnd: 45, dur: 0.14, vol: 0.8, out });
    this.noise({ when: f, brown: true, dur: 0.16, filter: 'lowpass', freq: 700, freqEnd: 150, vol: 0.9, out });
    this._ticks(f + 0.02, 3, 0.18, 1800, 4200, 0.2, out);
  };

  A.explosion = function (x, y, big) {
    if (!this._ready() || !this._throttle('explosion', 0.04)) return;
    const out = this._v(x, y, big ? 1.1 : 0.9, 0.35, 0.18);
    if (!out) return;
    const t = this.ctx.currentTime, L = big ? 1.25 : 1;
    this.noise({ when: t, dur: 0.04, filter: 'highpass', freq: 2500, vol: 1, out, attack: 0.0008 }); // crack
    this.noise({ when: t, dur: 0.18, filter: 'bandpass', freq: 1200, freqEnd: 300, q: 0.7, vol: 1, out, attack: 0.001 }); // punch
    this.tone({ when: t, type: 'sine', freq: 150, freqEnd: 40, dur: 0.3 * L, vol: 1, out, attack: 0.002 }); // chest hit
    this.tone({ when: t, type: 'sine', freq: 62, freqEnd: 22, dur: 1.3 * L, vol: 0.95, out, attack: 0.005 }); // sub drop
    this.noise({ when: t + 0.01, brown: true, dur: 2.0 * L, filter: 'lowpass', freq: 2400, freqEnd: 80, q: 0.5, vol: 1.1, out, attack: 0.008 }); // roar
    this.noise({ when: t + 0.05, brown: true, dur: 1.4 * L, filter: 'bandpass', freq: 500, freqEnd: 120, q: 0.6, vol: 0.6, out, attack: 0.05 }); // rumble swell
    const n = big ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const w = t + 0.12 + Math.pow(Math.random(), 1.6) * 1.1 * L;
      this.noise({ when: w, dur: rnd(0.01, 0.03), filter: 'bandpass', freq: rnd(1500, 5000), q: rnd(3, 8), vol: Math.max(0.05, rnd(0.15, 0.45) * (1 - (w - t) / 1.6)), out, attack: 0.0008 });
    }
  };

  /* ----------------------------- Player ---------------------------- */
  A.playerHurt = function () {
    if (!this._ready() || !this._throttle('hurt', 0.12)) return;
    const out = this._v(undefined, undefined, 0.55, 0.08);
    const t = this.ctx.currentTime;
    this.tone({ when: t, type: 'sine', freq: rnd(170, 210), freqEnd: 70, dur: 0.2, vol: 1, out });
    this.noise({ when: t, brown: true, dur: 0.16, filter: 'lowpass', freq: 1100, freqEnd: 200, vol: 1, out });
    this.noise({ when: t, dur: 0.03, filter: 'highpass', freq: 3500, vol: 0.6, out });
    this.tone({ when: t + 0.01, type: 'sawtooth', freq: rnd(120, 145), freqEnd: 95, dur: 0.16, vol: 0.22, out, filter: 'bandpass', filterFreq: rnd(600, 800), q: 3, attack: 0.01 }); // grunt
  };

  A.heartbeat = function () {
    if (!this._ready()) return;
    const out = this._v(undefined, undefined, 0.5, 0.04);
    const t = this.ctx.currentTime;
    [0, 0.19].forEach((d, i) => {
      this.tone({ when: t + d, type: 'sine', freq: i ? 52 : 60, freqEnd: i ? 34 : 38, dur: 0.17, vol: i ? 0.7 : 1, out });
      this.noise({ when: t + d, brown: true, dur: 0.09, filter: 'lowpass', freq: 240, freqEnd: 80, vol: 0.8, out });
    });
  };

  A.dodge = function () {
    if (!this._ready()) return;
    const out = this._v(undefined, undefined, 0.28, 0.08);
    const t = this.ctx.currentTime;
    this.noise({ when: t, dur: 0.28, filter: 'bandpass', freq: 300, freqEnd: 1600, q: 0.9, vol: 0.8, out, attack: 0.04 }); // cloth whoosh
    this._ticks(t + 0.04, 3, 0.12, 2200, 4500, 0.25, out); // gear rattle
    this.noise({ when: t + 0.26, brown: true, dur: 0.1, filter: 'lowpass', freq: 600, freqEnd: 150, vol: 0.9, out }); // landing
    this.tone({ when: t + 0.26, type: 'sine', freq: 90, freqEnd: 45, dur: 0.08, vol: 0.5, out });
  };

  A.footstep = function (sprint) {
    if (!this._ready() || !this._throttle('step', 0.12)) return;
    const out = this._v(undefined, undefined, sprint ? 0.2 : 0.12, 0.05);
    const t = this.ctx.currentTime;
    this.noise({ when: t, brown: true, dur: 0.07, filter: 'lowpass', freq: rnd(800, 1000), freqEnd: 200, vol: 1, out });
    this.noise({ when: t + 0.01, dur: 0.05, filter: 'bandpass', freq: rnd(2400, 3400), q: 2, vol: 0.25, out }); // scuff
    this.tone({ when: t, type: 'sine', freq: rnd(70, 90), freqEnd: 45, dur: 0.06, vol: 0.5, out });
    if (sprint && Math.random() < 0.5) this._ticks(t + 0.02, 1, 0.04, 3000, 5000, 0.15, out); // kit jingle
  };

  A.casing = function (big, delay) {
    if (!this._ready() || !this._throttle('casing', 0.06)) return;
    const out = this._v(undefined, undefined, 0.12, 0.08);
    const t = this.ctx.currentTime + (delay || 0.3);
    if (big) {
      this.noise({ when: t, dur: 0.04, filter: 'bandpass', freq: 1100, q: 3, vol: 0.9, out });
      this.noise({ when: t + 0.12, dur: 0.03, filter: 'bandpass', freq: 1300, q: 3, vol: 0.5, out });
      return;
    }
    const f = rnd(4200, 6200);
    [0, 0.08, 0.13].forEach((d, i) => this.tone({ when: t + d, type: 'triangle', freq: f * (1 - i * 0.03), dur: 0.035, vol: 0.6 * (1 - i * 0.3), out }));
  };

  A.whiz = function (delay, pan, close) {
    if (!this._ready() || !this._throttle('whiz', 0.06)) return;
    const out = this._v(undefined, undefined, 0.24 * close, 0.1, 0, pan);
    const t = this.ctx.currentTime + delay;
    this.noise({ when: t, dur: 0.16, filter: 'bandpass', freq: 3200, freqEnd: 900, q: 3, vol: 1, out, attack: 0.03 });
    this.tone({ when: t, type: 'sine', freq: 2200, freqEnd: 700, dur: 0.14, vol: 0.25, out, attack: 0.02 });
  };

  A.melee = function (x, y) {
    if (!this._ready()) return;
    const out = this._v(x, y, 0.42, 0.12, 0.2);
    if (!out) return;
    const t = this.ctx.currentTime;
    this.noise({ when: t, dur: 0.18, filter: 'bandpass', freq: 3000, freqEnd: 700, q: 2, vol: 1, out, attack: 0.02 }); // blade swish
    this.tone({ when: t + 0.02, type: 'sawtooth', freq: 4200, freqEnd: 2600, dur: 0.12, vol: 0.06, out, filter: 'highpass', filterFreq: 2000 }); // edge scrape
  };

  A.door = function (x, y) {
    if (!this._ready() || !this._throttle('door', 0.1)) return;
    const out = this._v(x, y, 0.22, 0.2);
    if (!out) return;
    const t = this.ctx.currentTime;
    this.noise({ when: t, dur: 0.4, filter: 'highpass', freq: 3000, vol: 0.5, out, attack: 0.06 }); // pneumatic hiss
    this.tone({ when: t, type: 'sawtooth', freq: 85, freqEnd: 110, dur: 0.35, vol: 0.35, out, filter: 'lowpass', filterFreq: 400, attack: 0.03 }); // motor
    this.noise({ when: t + 0.3, brown: true, dur: 0.12, filter: 'lowpass', freq: 600, freqEnd: 120, vol: 1, out }); // clunk
    this.tone({ when: t + 0.3, type: 'sine', freq: 95, freqEnd: 50, dur: 0.1, vol: 0.6, out });
  };

  A.pickup = function (kind) {
    if (!this._ready()) return;
    const out = this._v(undefined, undefined, 0.2, 0.35);
    const t = this.ctx.currentTime;
    if (kind === 'credits') {
      this._bell(t, 1568, 0.5, 0.5, out);
      this._bell(t + 0.07, 2093, 0.6, 0.45, out);
      this.noise({ when: t, dur: 0.05, filter: 'highpass', freq: 6000, vol: 0.3, out });
      return;
    }
    const base = kind === 'power' ? 523 : kind === 'intel' ? 880 : 660;
    const steps = kind === 'power' ? [0, 4, 7, 12, 16, 19] : [0, 7, 12];
    steps.forEach((st, i) => {
      const f = base * Math.pow(2, st / 12);
      this.tone({ when: t + i * 0.05, type: 'triangle', freq: f, dur: 0.22, vol: 0.5, out });
      this.tone({ when: t + i * 0.05, type: 'sine', freq: f * 2, dur: 0.12, vol: 0.15, out });
    });
    this.noise({ when: t, dur: 0.3, filter: 'bandpass', freq: 3000, freqEnd: 8000, q: 1, vol: 0.15, out, attack: 0.05 });
  };

  /* ------------------------- Gameplay hooks ------------------------ */
  const P = BO.Player && BO.Player.prototype;
  if (P) {
    const origUpdate = P.update;
    P.update = function (dt, input, game) {
      origUpdate.call(this, dt, input, game);
      U.safe('audio+.player', () => {
        const audio = game.audio;
        audio.setMuffle(!this.dead && this.hp < this.maxHp * 0.25);
        if (this.dead || this.isDodging) return;
        const phase = Math.floor(this.walkCycle / Math.PI);
        if (this._stepPhase === undefined) this._stepPhase = phase;
        if (phase !== this._stepPhase && Math.hypot(this.vx, this.vy) > 40) audio.footstep(this.sprinting);
        this._stepPhase = phase;
      });
    };
  }

  const G = BO.Game && BO.Game.prototype;
  if (G) {
    const origEnemyFired = G.onEnemyFired;
    G.onEnemyFired = function (e, x, y, angle) {
      origEnemyFired.call(this, e, x, y, angle);
      U.safe('audio+.whiz', () => {
        const p = this.player;
        if (!p || p.dead) return;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const dx = p.x - x, dy = p.y - y;
        const along = dx * ca + dy * sa, perp = -dx * sa + dy * ca;
        if (along < 120 || Math.abs(perp) > 80) return;
        const cx = x + ca * along;
        this.audio.whiz(along / ((e.def && e.def.bulletSpeed) || 800), U.clamp((cx - p.x) / 80, -1, 1), 1 - Math.abs(perp) / 80 * 0.6);
      });
    };
    const origPlayerFired = G.onPlayerFired;
    G.onPlayerFired = function (player, w, mx, my, angle) {
      origPlayerFired.call(this, player, w, mx, my, angle);
      if (w.def.casing && Math.random() < 0.7) this.audio.casing(!!w.def.bigCasing, rnd(0.28, 0.5));
    };
  }
})(window.BO);
