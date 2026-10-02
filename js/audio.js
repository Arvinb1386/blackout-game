/* =========================================================================
 * BLACKOUT :: audio.js
 * Fully procedural audio using the Web Audio API: synthesized weapon sounds,
 * impacts, UI cues and an adaptive step-sequenced soundtrack
 * (menu / explore / combat / boss).
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const MAX_HEAR_DIST = 1500;
  const LOOKAHEAD = 0.12;
  const SCHEDULE_MS = 25;

  /** Per-weapon synthesis recipes. All sounds are noise + pitched body layers. */
  const SHOT_PROFILES = {
    pistol:   { noiseDur: 0.12, cut0: 3400, cut1: 700,  body0: 170, body1: 55, bodyDur: 0.1,  vol: 0.5 },
    revolver: { noiseDur: 0.26, cut0: 2600, cut1: 400,  body0: 120, body1: 38, bodyDur: 0.2,  vol: 0.72 },
    smg:      { noiseDur: 0.07, cut0: 3000, cut1: 1200, body0: 210, body1: 90, bodyDur: 0.05, vol: 0.32 },
    rifle:    { noiseDur: 0.11, cut0: 4200, cut1: 900,  body0: 150, body1: 48, bodyDur: 0.09, vol: 0.42 },
    burst:    { noiseDur: 0.09, cut0: 4600, cut1: 1100, body0: 175, body1: 60, bodyDur: 0.07, vol: 0.38 },
    shotgun:  { noiseDur: 0.38, cut0: 2200, cut1: 260,  body0: 95,  body1: 32, bodyDur: 0.26, vol: 0.85 },
    dmr:      { noiseDur: 0.2,  cut0: 5200, cut1: 900,  body0: 115, body1: 40, bodyDur: 0.15, vol: 0.6 },
    lmg:      { noiseDur: 0.12, cut0: 3600, cut1: 700,  body0: 125, body1: 42, bodyDur: 0.1,  vol: 0.45 },
    sniper:   { noiseDur: 0.55, cut0: 6500, cut1: 350,  body0: 85,  body1: 28, bodyDur: 0.38, vol: 0.95 },
    launcher: { noiseDur: 0.16, cut0: 900,  cut1: 200,  body0: 240, body1: 60, bodyDur: 0.22, vol: 0.6 },
    enemy:    { noiseDur: 0.1,  cut0: 2600, cut1: 700,  body0: 130, body1: 50, bodyDur: 0.08, vol: 0.32 },
    heavy:    { noiseDur: 0.08, cut0: 2000, cut1: 600,  body0: 100, body1: 45, bodyDur: 0.06, vol: 0.28 },
    esniper:  { noiseDur: 0.45, cut0: 5600, cut1: 400,  body0: 90,  body1: 30, bodyDur: 0.3,  vol: 0.75 },
    boss:     { noiseDur: 0.14, cut0: 1800, cut1: 300,  body0: 320, body1: 80, bodyDur: 0.12, vol: 0.36, square: true }
  };

  /** D minor progression: i - VI - VII - v, one chord per bar. */
  const PROGRESSION = [
    { root: 38, tones: [0, 3, 7] }, { root: 34, tones: [0, 4, 7] },
    { root: 36, tones: [0, 4, 7] }, { root: 33, tones: [0, 3, 7] }
  ];
  const MUSIC_MODES = {
    menu:    { bpm: 84,  pad: 0.11, drone: 0.09, arp: 0.05, bass: 0,    kick: 0,    snare: 0,    hat: 0 },
    explore: { bpm: 92,  pad: 0.08, drone: 0.08, arp: 0.025, bass: 0.07, kick: 0.12, snare: 0,    hat: 0.025 },
    combat:  { bpm: 124, pad: 0.06, drone: 0.05, arp: 0.05, bass: 0.12, kick: 0.5,  snare: 0.22, hat: 0.06 },
    boss:    { bpm: 140, pad: 0.07, drone: 0.08, arp: 0.06, bass: 0.15, kick: 0.6,  snare: 0.28, hat: 0.08 }
  };
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  class AudioSystem {
    constructor() {
      this.ctx = null;
      this.volumes = { master: 0.8, music: 0.55, sfx: 0.85 };
      this.listenerX = 0;
      this.listenerY = 0;
      this.lastPlayed = Object.create(null);
      this.musicMode = 'off';
      this.pendingMode = null;
      this.step = 0;
      this.nextNoteTime = 0;
      this.schedulerId = null;
      this.ducked = false;
    }

    /** Must be called from a user gesture (browsers block autoplay). */
    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this._buildGraph();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.musicMode !== 'off' && !this.schedulerId) this._startScheduler();
      } catch (err) { U.reportError('audio.unlock', err); }
    }

    _buildGraph() {
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.ratio.value = 5;
      this.master.connect(this.compressor).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 18000;
      this.musicBus.connect(this.musicFilter).connect(this.master);
      // 2 seconds of white noise reused by every noise voice.
      const len = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }

    setVolumes(settings) {
      this.volumes.master = settings.master;
      this.volumes.music = settings.music;
      this.volumes.sfx = settings.sfx;
      this.applyVolumes();
    }

    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
      this.musicBus.gain.setTargetAtTime(this.volumes.music * (this.ducked ? 0.45 : 1), t, 0.1);
    }

    duck(on) {
      this.ducked = on;
      if (!this.ctx) return;
      this.musicFilter.frequency.setTargetAtTime(on ? 700 : 18000, this.ctx.currentTime, 0.15);
      this.applyVolumes();
    }

    setListener(x, y) { this.listenerX = x; this.listenerY = y; }

    _ready() { return this.ctx && this.ctx.state === 'running'; }

    _throttle(name, gap) {
      const now = this.ctx.currentTime;
      if (this.lastPlayed[name] && now - this.lastPlayed[name] < gap) return false;
      this.lastPlayed[name] = now;
      return true;
    }

    /** Converts a world position into {vol, pan} relative to the listener. */
    spatial(x, y) {
      if (x === undefined) return { vol: 1, pan: 0 };
      const dx = x - this.listenerX, dy = y - this.listenerY;
      const d = Math.sqrt(dx * dx + dy * dy);
      return { vol: U.clamp(1 - d / MAX_HEAR_DIST, 0, 1), pan: U.clamp(dx / 700, -1, 1) };
    }

    _out(dest, vol, pan) {
      const g = this.ctx.createGain();
      g.gain.value = vol;
      if (pan && this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p).connect(dest || this.sfxBus);
      } else {
        g.connect(dest || this.sfxBus);
      }
      return g;
    }

    /** Pitched oscillator voice with exponential decay. */
    tone(o) {
      const ctx = this.ctx, t = (o.when || ctx.currentTime);
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(o.freqEnd, 1), t + o.dur);
      if (o.detune) osc.detune.value = o.detune;
      const env = ctx.createGain();
      const attack = o.attack || 0.004;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(Math.max(o.vol, 0.0002), t + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      let node = osc;
      if (o.filter) {
        const f = ctx.createBiquadFilter();
        f.type = o.filter;
        f.frequency.value = o.filterFreq || 1200;
        f.Q.value = o.q || 0.7;
        osc.connect(f);
        node = f;
      }
      node.connect(env).connect(o.out || this._out(o.dest, 1, o.pan));
      osc.start(t);
      osc.stop(t + o.dur + 0.05);
    }

    /** Filtered white noise voice. */
    noise(o) {
      const ctx = this.ctx, t = (o.when || ctx.currentTime);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
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
      src.start(t, Math.random() * 0.3);
      src.stop(t + o.dur + 0.05);
    }

    /* ----------------------------- SFX ----------------------------- */
    shot(kind, x, y, pitch) {
      if (!this._ready()) return;
      const p = SHOT_PROFILES[kind] || SHOT_PROFILES.rifle;
      if (!this._throttle('shot:' + kind, 0.028)) return;
      const s = this.spatial(x, y);
      if (s.vol <= 0.01) return;
      const k = pitch || 1;
      const out = this._out(this.sfxBus, p.vol * s.vol, s.pan);
      this.noise({ dur: p.noiseDur, freq: p.cut0 * k, freqEnd: p.cut1, vol: 1, out });
      this.tone({ type: p.square ? 'square' : 'sine', freq: p.body0 * k, freqEnd: p.body1, dur: p.bodyDur, vol: 0.9, out });
      this.noise({ dur: 0.02, filter: 'highpass', freq: 5000, vol: 0.5, out });
    }

    reloadStart() {
      if (!this._ready()) return;
      const out = this._out(this.sfxBus, 0.35, 0);
      this.noise({ dur: 0.05, filter: 'bandpass', freq: 2200, q: 4, vol: 0.9, out });
      this.tone({ type: 'square', freq: 520, freqEnd: 300, dur: 0.06, vol: 0.25, out, filter: 'lowpass', filterFreq: 1800 });
    }

    reloadEnd() {
      if (!this._ready()) return;
      const out = this._out(this.sfxBus, 0.4, 0);
      const t = this.ctx.currentTime;
      this.noise({ when: t, dur: 0.04, filter: 'bandpass', freq: 1700, q: 5, vol: 1, out });
      this.noise({ when: t + 0.09, dur: 0.12, filter: 'bandpass', freq: 900, freqEnd: 2600, q: 2, vol: 0.7, out });
      this.tone({ when: t + 0.09, type: 'square', freq: 260, freqEnd: 180, dur: 0.05, vol: 0.2, out, filter: 'lowpass', filterFreq: 1400 });
    }

    empty() {
      if (!this._ready() || !this._throttle('empty', 0.18)) return;
      this.tone({ type: 'square', freq: 1500, freqEnd: 900, dur: 0.035, vol: 0.12, filter: 'lowpass', filterFreq: 3000 });
    }

    impact(x, y, kind) {
      if (!this._ready() || !this._throttle('impact', 0.035)) return;
      const s = this.spatial(x, y);
      if (s.vol < 0.05) return;
      const out = this._out(this.sfxBus, 0.2 * s.vol, s.pan);
      if (kind === 'metal') {
        this.tone({ type: 'triangle', freq: U.rand(2200, 3600), freqEnd: 1500, dur: 0.08, vol: 0.5, out });
      }
      this.noise({ dur: 0.06, filter: 'highpass', freq: 1800, vol: 0.8, out });
    }

    enemyHit(x, y, crit) {
      if (!this._ready() || !this._throttle('ehit', 0.03)) return;
      const s = this.spatial(x, y);
      const out = this._out(this.sfxBus, 0.32 * Math.max(s.vol, 0.3), s.pan);
      this.tone({ type: 'sine', freq: crit ? 520 : 330, freqEnd: 140, dur: 0.07, vol: 0.9, out });
      this.noise({ dur: 0.05, filter: 'bandpass', freq: 1300, q: 1.5, vol: 0.6, out });
      if (crit) this.tone({ type: 'triangle', freq: 1900, freqEnd: 1300, dur: 0.09, vol: 0.4, out });
    }

    hitmarker() {
      if (!this._ready() || !this._throttle('hitmarker', 0.05)) return;
      this.tone({ type: 'triangle', freq: 2600, freqEnd: 2000, dur: 0.04, vol: 0.06 });
    }

    enemyDeath(x, y) {
      if (!this._ready()) return;
      const s = this.spatial(x, y);
      const out = this._out(this.sfxBus, 0.45 * Math.max(s.vol, 0.25), s.pan);
      this.tone({ type: 'sawtooth', freq: 420, freqEnd: 50, dur: 0.42, vol: 0.5, out, filter: 'lowpass', filterFreq: 1400 });
      this.noise({ dur: 0.3, freq: 1800, freqEnd: 200, vol: 0.7, out });
    }

    explosion(x, y, big) {
      if (!this._ready() || !this._throttle('explosion', 0.04)) return;
      const s = this.spatial(x, y);
      const out = this._out(this.sfxBus, (big ? 1 : 0.8) * Math.max(s.vol, 0.15), s.pan);
      this.noise({ dur: big ? 1.6 : 1.1, freq: 1400, freqEnd: 90, vol: 1, out, attack: 0.005 });
      this.tone({ type: 'sine', freq: 90, freqEnd: 24, dur: big ? 1.0 : 0.7, vol: 1, out });
      this.noise({ dur: 0.08, filter: 'highpass', freq: 3000, vol: 0.6, out });
    }

    playerHurt() {
      if (!this._ready() || !this._throttle('hurt', 0.12)) return;
      const out = this._out(this.sfxBus, 0.5, 0);
      this.tone({ type: 'sine', freq: 190, freqEnd: 80, dur: 0.18, vol: 0.9, out });
      this.noise({ dur: 0.12, freq: 700, vol: 0.6, out });
    }

    heartbeat() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      this.tone({ when: t, type: 'sine', freq: 62, freqEnd: 40, dur: 0.16, vol: 0.4 });
      this.tone({ when: t + 0.2, type: 'sine', freq: 55, freqEnd: 36, dur: 0.18, vol: 0.3 });
    }

    pickup(kind) {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      const base = kind === 'credits' ? 1046 : kind === 'power' ? 523 : kind === 'intel' ? 880 : 660;
      const steps = kind === 'power' ? [0, 4, 7, 12, 16] : [0, 7, 12];
      steps.forEach((st, i) => this.tone({ when: t + i * 0.05, type: 'triangle', freq: base * Math.pow(2, st / 12), dur: 0.16, vol: 0.14 }));
    }

    uiClick() {
      if (!this._ready()) return;
      this.tone({ type: 'square', freq: 880, freqEnd: 660, dur: 0.05, vol: 0.06, filter: 'lowpass', filterFreq: 2400 });
    }

    uiHover() {
      if (!this._ready() || !this._throttle('hover', 0.04)) return;
      this.tone({ type: 'sine', freq: 1500, dur: 0.03, vol: 0.025 });
    }

    uiDeny() {
      if (!this._ready()) return;
      this.tone({ type: 'square', freq: 180, freqEnd: 120, dur: 0.18, vol: 0.08, filter: 'lowpass', filterFreq: 900 });
    }

    dodge() {
      if (!this._ready()) return;
      this.noise({ dur: 0.22, filter: 'bandpass', freq: 400, freqEnd: 1800, q: 1.2, vol: 0.18 });
    }

    melee(x, y) {
      if (!this._ready()) return;
      const s = this.spatial(x, y);
      this.noise({ dur: 0.16, filter: 'bandpass', freq: 2400, freqEnd: 600, q: 2, vol: 0.4 * s.vol, pan: s.pan });
    }

    sniperCharge(x, y, progress) {
      if (!this._ready() || !this._throttle('scharge', 0.16 - progress * 0.1)) return;
      const s = this.spatial(x, y);
      this.tone({ type: 'sine', freq: 1500 + progress * 900, dur: 0.05, vol: 0.09 * Math.max(s.vol, 0.4), pan: s.pan });
    }

    beep(freq, vol) {
      if (!this._ready()) return;
      this.tone({ type: 'square', freq: freq || 700, dur: 0.06, vol: vol || 0.05, filter: 'lowpass', filterFreq: 2500 });
    }

    door(x, y) {
      if (!this._ready() || !this._throttle('door', 0.1)) return;
      const s = this.spatial(x, y);
      if (s.vol < 0.05) return;
      this.noise({ dur: 0.35, freq: 500, freqEnd: 180, vol: 0.18 * s.vol, pan: s.pan });
    }

    levelUp() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      [0, 4, 7, 11, 14, 19].forEach((st, i) => this.tone({ when: t + i * 0.07, type: 'triangle', freq: 523 * Math.pow(2, st / 12), dur: 0.4, vol: 0.12 }));
    }

    missionComplete() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      [[50, 53, 57], [46, 50, 53], [48, 52, 55], [50, 54, 57, 62]].forEach((chord, i) => {
        chord.forEach(n => this.tone({ when: t + i * 0.32, type: 'sawtooth', freq: midiToFreq(n + 12), dur: i === 3 ? 1.6 : 0.36, vol: 0.06, filter: 'lowpass', filterFreq: 2200, attack: 0.02 }));
      });
    }

    bossWarning() {
      if (!this._ready()) return;
      const t = this.ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        this.tone({ when: t + i * 0.55, type: 'sawtooth', freq: 320, freqEnd: 640, dur: 0.5, vol: 0.12, filter: 'lowpass', filterFreq: 1600, attack: 0.05 });
      }
      this.tone({ when: t, type: 'sine', freq: 48, dur: 2.4, vol: 0.4, attack: 0.3 });
    }

    telegraph() {
      if (!this._ready() || !this._throttle('telegraph', 0.2)) return;
      this.tone({ type: 'sawtooth', freq: 220, freqEnd: 440, dur: 0.35, vol: 0.07, filter: 'lowpass', filterFreq: 1400, attack: 0.05 });
    }

    /* ---------------------------- MUSIC ---------------------------- */
    setMusic(mode) {
      if (mode === this.musicMode && !this.pendingMode && this.schedulerId) return;
      if (mode === 'off') { this.musicMode = 'off'; this.pendingMode = null; this._stopScheduler(); return; }
      if (this.musicMode === 'off' || !this.schedulerId) {
        this.musicMode = mode;
        this.pendingMode = null;
        this._startScheduler();
      } else {
        this.pendingMode = mode;
      }
    }

    _startScheduler() {
      if (!this.ctx || this.schedulerId) return;
      this.step = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.08;
      this.schedulerId = setInterval(() => U.safe('audio.scheduler', () => this._schedule()), SCHEDULE_MS);
    }

    _stopScheduler() {
      if (this.schedulerId) clearInterval(this.schedulerId);
      this.schedulerId = null;
    }

    _schedule() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      // If the tab was in the background we may be far behind; skip ahead.
      if (this.nextNoteTime < this.ctx.currentTime - 0.5) this.nextNoteTime = this.ctx.currentTime + 0.05;
      while (this.nextNoteTime < this.ctx.currentTime + LOOKAHEAD) {
        if (this.pendingMode && this.step % 4 === 0) { this.musicMode = this.pendingMode; this.pendingMode = null; }
        const mode = MUSIC_MODES[this.musicMode];
        if (!mode) return;
        this._playStep(this.step, this.nextNoteTime, mode);
        this.nextNoteTime += 60 / mode.bpm / 4;
        this.step = (this.step + 1) % 64;
      }
    }

    _playStep(step, t, m) {
      const bar = Math.floor(step / 16) % PROGRESSION.length;
      const s = step % 16;
      const chord = PROGRESSION[bar];
      const stepDur = 60 / m.bpm / 4;
      const out = this.musicBus;
      if (s === 0 && m.pad > 0) {
        chord.tones.forEach(tn => {
          const f = midiToFreq(chord.root + 24 + tn);
          this.tone({ when: t, type: 'sawtooth', freq: f, dur: stepDur * 16, vol: m.pad * 0.5, attack: 0.6, filter: 'lowpass', filterFreq: 900, out });
          this.tone({ when: t, type: 'sawtooth', freq: f, detune: 9, dur: stepDur * 16, vol: m.pad * 0.4, attack: 0.7, filter: 'lowpass', filterFreq: 800, out });
        });
      }
      if (s === 0 && m.drone > 0) {
        this.tone({ when: t, type: 'triangle', freq: midiToFreq(chord.root), dur: stepDur * 16, vol: m.drone, attack: 0.4, out });
      }
      if (m.kick > 0 && (this.musicMode === 'explore' ? (s === 0 || s === 8) : (s === 0 || s === 6 || s === 8 || (this.musicMode === 'boss' && (s === 3 || s === 11))))) {
        this.tone({ when: t, type: 'sine', freq: 140, freqEnd: 40, dur: 0.22, vol: m.kick, out });
      }
      if (m.snare > 0 && (s === 4 || s === 12)) {
        this.noise({ when: t, dur: 0.16, filter: 'bandpass', freq: 1900, q: 0.9, vol: m.snare, out });
        this.tone({ when: t, type: 'triangle', freq: 210, freqEnd: 140, dur: 0.08, vol: m.snare * 0.5, out });
      }
      if (m.hat > 0 && (this.musicMode === 'explore' ? s % 4 === 2 : true)) {
        this.noise({ when: t, dur: s % 2 === 0 ? 0.05 : 0.025, filter: 'highpass', freq: 7000, vol: m.hat * (s % 4 === 2 ? 1 : 0.55), out });
      }
      if (m.bass > 0) {
        const pattern = this.musicMode === 'explore' ? (s === 0 || s === 10) : (s % 2 === 0 || s === 7 || s === 15);
        if (pattern) {
          const octave = (this.musicMode === 'boss' && s % 4 === 2) ? 12 : 0;
          this.tone({ when: t, type: 'sawtooth', freq: midiToFreq(chord.root + octave), dur: stepDur * 0.9, vol: m.bass, filter: 'lowpass', filterFreq: this.musicMode === 'boss' ? 900 : 600, q: 4, out });
        }
      }
      if (m.arp > 0 && s % 2 === 0) {
        const seq = [0, 1, 2, 1, 2, 0, 2, 1];
        const tn = chord.tones[seq[(s / 2) % seq.length]];
        const lift = this.musicMode === 'menu' ? 36 : 48;
        if (this.musicMode !== 'explore' || s % 8 === 0) {
          this.tone({ when: t, type: 'triangle', freq: midiToFreq(chord.root + lift + tn), dur: stepDur * 1.8, vol: m.arp, out });
          this.tone({ when: t + stepDur * 3, type: 'triangle', freq: midiToFreq(chord.root + lift + tn), dur: stepDur * 1.5, vol: m.arp * 0.35, out });
        }
      }
    }
  }

  BO.AudioSystem = AudioSystem;
})(window.BO);
