/* =========================================================================
 * BLACKOUT :: v13-synth.js
 * Tiny procedural sound-effect synthesiser (WebAudio, zero assets).
 *
 * Shared by v13-chrono-fx.js (slow-motion skill) and lab-bosses-ex.js
 * (the five new Boss Lab bosses). Every sound is built from oscillators,
 * a cached white-noise buffer, filters and envelopes, then pushed through a
 * soft compressor so stacked effects never clip.
 *
 *   BO.Synth.play('chime', { x, y, gain: 0.8, pitch: 1.2 })
 *   const h = BO.Synth.loop('chronoDrone'); ... h.stop(0.4)
 *
 * Load after audio.js (it reads game.audio.ctx + game.audio.volumes).
 * ========================================================================= */
'use strict';
(function (BO) {
  if (!BO || BO.Synth) return;

  const Synth = { enabled: true, _bus: null, _busCtx: null, _noise: null, _last: Object.create(null) };

  function audio() { const g = BO.game; return g && g.audio; }
  function getCtx() {
    const a = audio();
    const c = a && a.ctx;
    if (!c) return null;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) { /* ignore */ } }
    return c;
  }
  function volume() {
    const a = audio();
    if (!a) return 0;
    if (a.muted) return 0;
    const v = a.volumes || {};
    const m = typeof v.master === 'number' ? v.master : 1;
    const s = typeof v.sfx === 'number' ? v.sfx : 0.85;
    return Math.max(0, m * s);
  }
  function bus(c) {
    if (Synth._bus && Synth._busCtx === c) return Synth._bus;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.18;
    const out = c.createGain();
    out.gain.value = 1;
    comp.connect(out); out.connect(c.destination);
    Synth._bus = comp; Synth._busCtx = c;
    return comp;
  }
  function noiseBuf(c) {
    if (Synth._noise && Synth._noise.sampleRate === c.sampleRate) return Synth._noise;
    const len = Math.floor(c.sampleRate * 2);
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    Synth._noise = b;
    return b;
  }
  function spatial(x, y) {
    const g = BO.game, p = g && g.player;
    if (!p || x === undefined || y === undefined) return { k: 1, pan: 0 };
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    return { k: Math.max(0.25, Math.min(1, 1 - (d - 250) / 1500)), pan: Math.max(-0.7, Math.min(0.7, dx / 900)) };
  }
  function ramp(param, v, t, exp) {
    if (exp) param.exponentialRampToValueAtTime(Math.max(0.0001, v), t);
    else param.linearRampToValueAtTime(v, t);
  }

  /* ---- voice builders -------------------------------------------------
   * tone:  { type, f, f2, t0, dur, a, g, exp, filt:{type,f,f2,q}, trem:{f,d}, fm:{r,d}, det }
   * noise: { t0, dur, a, g, filt:{type,f,f2,q} }
   * --------------------------------------------------------------------- */
  function envGain(c, start, a, dur, peak) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + Math.max(0.002, a));
    g.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(a + 0.01, dur));
    return g;
  }
  function filterOf(c, f, start, dur) {
    const n = c.createBiquadFilter();
    n.type = f.type || 'lowpass';
    n.frequency.setValueAtTime(f.f || 1000, start);
    if (f.f2) ramp(n.frequency, f.f2, start + dur, true);
    n.Q.value = f.q === undefined ? 0.8 : f.q;
    return n;
  }
  function tone(c, out, o, base, pitch) {
    const start = base + (o.t0 || 0), dur = o.dur || 0.2;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f * pitch, start);
    if (o.f2) ramp(osc.frequency, o.f2 * pitch, start + dur, o.exp !== false);
    if (o.det) osc.detune.value = o.det;
    let node = osc;
    if (o.fm) {
      const mod = c.createOscillator(), mg = c.createGain();
      mod.frequency.value = o.f * pitch * o.fm.r;
      mg.gain.value = o.f * pitch * o.fm.d;
      mod.connect(mg); mg.connect(osc.frequency);
      mod.start(start); mod.stop(start + dur + 0.05);
    }
    if (o.filt) { const f = filterOf(c, o.filt, start, dur); node.connect(f); node = f; }
    const g = envGain(c, start, o.a || 0.005, dur, o.g || 0.3);
    node.connect(g);
    if (o.trem) {
      const lfo = c.createOscillator(), lg = c.createGain(), tg = c.createGain();
      lfo.frequency.value = o.trem.f; lg.gain.value = o.trem.d; tg.gain.value = 1 - o.trem.d;
      lfo.connect(lg); lg.connect(tg.gain);
      g.connect(tg); tg.connect(out);
      lfo.start(start); lfo.stop(start + dur + 0.05);
    } else g.connect(out);
    osc.start(start); osc.stop(start + dur + 0.05);
  }
  function noise(c, out, o, base) {
    const start = base + (o.t0 || 0), dur = o.dur || 0.2;
    const src = c.createBufferSource();
    src.buffer = noiseBuf(c);
    src.loop = true;
    let node = src;
    if (o.filt) { const f = filterOf(c, o.filt, start, dur); node.connect(f); node = f; }
    if (o.filt2) { const f = filterOf(c, o.filt2, start, dur); node.connect(f); node = f; }
    const g = envGain(c, start, o.a || 0.004, dur, o.g || 0.25);
    node.connect(g); g.connect(out);
    src.start(start, Math.random() * 1.5); src.stop(start + dur + 0.05);
  }

  /* ----------------------------- Recipes ------------------------------ */
  const R = (fn, minGap) => ({ fn, gap: minGap === undefined ? 0.03 : minGap });
  const RECIPES = {
    // --- generic ---
    boom: R(() => [
      { k: 't', type: 'sine', f: 90, f2: 28, dur: 0.9, g: 0.75, a: 0.004 },
      { k: 'n', dur: 0.7, g: 0.45, filt: { type: 'lowpass', f: 1400, f2: 120 } }
    ], 0.05),
    thud: R(() => [{ k: 't', type: 'sine', f: 120, f2: 40, dur: 0.25, g: 0.6 }, { k: 'n', dur: 0.12, g: 0.25, filt: { type: 'lowpass', f: 600 } }]),
    whoosh: R(() => [{ k: 'n', dur: 0.45, a: 0.12, g: 0.3, filt: { type: 'bandpass', f: 400, f2: 2400, q: 1.2 } }]),
    rise: R(() => [{ k: 't', type: 'sawtooth', f: 120, f2: 900, dur: 0.6, a: 0.3, g: 0.12, filt: { type: 'lowpass', f: 600, f2: 4000 } }]),
    zapS: R(() => [{ k: 't', type: 'square', f: 1600, f2: 200, dur: 0.12, g: 0.12 }, { k: 'n', dur: 0.1, g: 0.15, filt: { type: 'highpass', f: 2500 } }]),
    shockwave: R(() => [
      { k: 't', type: 'sine', f: 70, f2: 35, dur: 0.6, g: 0.55 },
      { k: 'n', dur: 0.55, a: 0.01, g: 0.35, filt: { type: 'lowpass', f: 900, f2: 200 } }
    ]),
    // --- slow motion ---
    chronoIn: R(() => [
      { k: 'n', dur: 0.5, a: 0.42, g: 0.32, filt: { type: 'bandpass', f: 300, f2: 5200, q: 0.9 } },   // reverse swell
      { k: 't', t0: 0.42, type: 'sine', f: 220, f2: 38, dur: 1.4, g: 0.8, a: 0.004 },                  // deep drop
      { k: 't', t0: 0.42, type: 'triangle', f: 440, f2: 70, dur: 1.0, g: 0.18 },
      { k: 'n', t0: 0.42, dur: 1.2, g: 0.28, filt: { type: 'lowpass', f: 2600, f2: 90 } },             // air pressure
      { k: 't', t0: 0.44, type: 'sine', f: 1320, dur: 2.2, g: 0.07, a: 0.01, fm: { r: 2.76, d: 0.4 } } // glassy tail
    ], 0.3),
    chronoOut: R(() => [
      { k: 't', type: 'sine', f: 45, f2: 260, dur: 0.38, a: 0.3, g: 0.55, exp: true },
      { k: 'n', dur: 0.38, a: 0.33, g: 0.32, filt: { type: 'bandpass', f: 180, f2: 4200, q: 0.8 } },
      { k: 't', t0: 0.38, type: 'sine', f: 1760, dur: 0.6, g: 0.1, fm: { r: 3.1, d: 0.3 } },
      { k: 't', t0: 0.38, type: 'square', f: 880, f2: 1760, dur: 0.08, g: 0.06 },
      { k: 'n', t0: 0.38, dur: 0.25, g: 0.2, filt: { type: 'highpass', f: 3000 } }
    ], 0.3),
    heartbeat: R(() => [
      { k: 't', type: 'sine', f: 62, f2: 40, dur: 0.18, g: 0.55 },
      { k: 't', t0: 0.2, type: 'sine', f: 55, f2: 36, dur: 0.22, g: 0.4 }
    ], 0.3),
    tock: R(p => [{ k: 't', type: 'triangle', f: 520 * (p || 1), f2: 300, dur: 0.07, g: 0.18 }, { k: 'n', dur: 0.03, g: 0.12, filt: { type: 'bandpass', f: 2400 * (p || 1), q: 4 } }], 0.05),
    timeWarn: R(() => [{ k: 't', type: 'sine', f: 1980, dur: 0.12, g: 0.08 }, { k: 't', t0: 0.12, type: 'sine', f: 1480, dur: 0.12, g: 0.07 }], 0.2),
    killPing: R(() => [{ k: 't', type: 'sine', f: 1046, dur: 0.6, g: 0.12, fm: { r: 2.01, d: 0.6 } }, { k: 't', type: 'sine', f: 1568, t0: 0.05, dur: 0.5, g: 0.07 }], 0.06),
    // --- Chronophage ---
    tick: R(() => [{ k: 't', type: 'square', f: 2600, dur: 0.018, g: 0.08 }, { k: 't', type: 'sine', f: 900, dur: 0.05, g: 0.14 }], 0.05),
    chime: R(p => [
      { k: 't', type: 'sine', f: 660 * (p || 1), dur: 1.8, g: 0.22, a: 0.003 },
      { k: 't', type: 'sine', f: 660 * 2.76 * (p || 1), dur: 1.1, g: 0.08 },
      { k: 't', type: 'sine', f: 660 * 5.4 * (p || 1), dur: 0.5, g: 0.04 }
    ], 0.06),
    gong: R(() => [
      { k: 't', type: 'sine', f: 98, dur: 3.2, g: 0.55, a: 0.004 },
      { k: 't', type: 'sine', f: 98 * 2.41, dur: 2.2, g: 0.2 },
      { k: 't', type: 'sine', f: 98 * 3.9, dur: 1.4, g: 0.12, fm: { r: 1.5, d: 0.2 } },
      { k: 'n', dur: 0.3, g: 0.18, filt: { type: 'bandpass', f: 600, q: 2 } }
    ], 0.4),
    rewind: R(() => [
      { k: 't', type: 'sawtooth', f: 900, f2: 90, dur: 0.6, a: 0.02, g: 0.09, filt: { type: 'bandpass', f: 2200, f2: 300, q: 3 } },
      { k: 'n', dur: 0.6, a: 0.5, g: 0.22, filt: { type: 'bandpass', f: 500, f2: 3500, q: 1.5 } }
    ], 0.2),
    stasis: R(() => [{ k: 't', type: 'sine', f: 300, f2: 120, dur: 1.2, g: 0.2, trem: { f: 14, d: 0.6 } }, { k: 't', type: 'triangle', f: 1200, f2: 600, dur: 0.8, g: 0.05 }], 0.15),
    // --- Hive Matriarch ---
    buzz: R(() => [{ k: 't', type: 'sawtooth', f: 150, f2: 170, dur: 0.7, a: 0.08, g: 0.11, trem: { f: 38, d: 0.7 }, filt: { type: 'bandpass', f: 900, q: 1.4 } }], 0.4),
    screech: R(() => [
      { k: 't', type: 'sawtooth', f: 980, f2: 260, dur: 0.9, a: 0.03, g: 0.16, trem: { f: 46, d: 0.5 }, filt: { type: 'bandpass', f: 1800, f2: 700, q: 1.6 } },
      { k: 't', type: 'square', f: 1310, f2: 340, dur: 0.8, g: 0.05, det: 30 },
      { k: 'n', dur: 0.9, g: 0.18, filt: { type: 'highpass', f: 1800 } }
    ], 0.5),
    splat: R(() => [{ k: 'n', dur: 0.22, g: 0.32, filt: { type: 'lowpass', f: 1500, f2: 220 } }, { k: 't', type: 'sine', f: 260, f2: 70, dur: 0.18, g: 0.25 }], 0.04),
    rumble: R(() => [{ k: 'n', dur: 1.4, a: 0.2, g: 0.45, filt: { type: 'lowpass', f: 160, q: 2 } }, { k: 't', type: 'sine', f: 42, dur: 1.4, a: 0.2, g: 0.35, trem: { f: 9, d: 0.5 } }], 0.6),
    erupt: R(() => [
      { k: 't', type: 'sine', f: 110, f2: 30, dur: 0.7, g: 0.7 },
      { k: 'n', dur: 0.6, g: 0.45, filt: { type: 'lowpass', f: 3000, f2: 200 } },
      { k: 'n', t0: 0.03, dur: 0.3, g: 0.2, filt: { type: 'highpass', f: 2200 } }
    ], 0.2),
    // --- Prism Archon ---
    glass: R(p => [
      { k: 't', type: 'sine', f: 2093 * (p || 1), dur: 0.7, g: 0.09, fm: { r: 3.5, d: 0.25 } },
      { k: 't', type: 'sine', f: 3136 * (p || 1), t0: 0.01, dur: 0.45, g: 0.05 }
    ], 0.02),
    shatter: R(() => {
      const v = [{ k: 'n', dur: 0.5, g: 0.3, filt: { type: 'highpass', f: 2600, f2: 6000 } }];
      for (let i = 0; i < 7; i++) v.push({ k: 't', type: 'sine', t0: i * 0.035, f: 1800 + Math.random() * 3200, dur: 0.35, g: 0.06 });
      return v;
    }, 0.2),
    beamCharge: R(() => [{ k: 't', type: 'sine', f: 180, f2: 1400, dur: 0.85, a: 0.6, g: 0.14, fm: { r: 0.5, d: 0.3 } }, { k: 'n', dur: 0.85, a: 0.7, g: 0.08, filt: { type: 'bandpass', f: 800, f2: 5000, q: 6 } }], 0.2),
    laser: R(() => [
      { k: 't', type: 'sawtooth', f: 110, dur: 0.55, a: 0.01, g: 0.2, filt: { type: 'lowpass', f: 3200, f2: 400 } },
      { k: 't', type: 'sine', f: 880, f2: 660, dur: 0.55, g: 0.12, fm: { r: 1.01, d: 0.8 } },
      { k: 'n', dur: 0.2, g: 0.22, filt: { type: 'highpass', f: 1800 } }
    ], 0.1),
    // --- Abyssal Maw ---
    growl: R(() => [
      { k: 't', type: 'sawtooth', f: 58, f2: 44, dur: 1.5, a: 0.12, g: 0.4, trem: { f: 11, d: 0.45 }, filt: { type: 'lowpass', f: 420, q: 4 } },
      { k: 't', type: 'square', f: 87, f2: 60, dur: 1.3, a: 0.2, g: 0.08, filt: { type: 'lowpass', f: 300 } },
      { k: 'n', dur: 1.4, a: 0.3, g: 0.18, filt: { type: 'bandpass', f: 260, q: 3 } }
    ], 0.5),
    splash: R(() => [{ k: 'n', dur: 1.1, a: 0.04, g: 0.4, filt: { type: 'lowpass', f: 4200, f2: 300 } }, { k: 'n', t0: 0.05, dur: 0.6, g: 0.15, filt: { type: 'highpass', f: 3000 } }], 0.25),
    bloop: R(() => [{ k: 't', type: 'sine', f: 380, f2: 70, dur: 0.3, g: 0.35 }, { k: 't', type: 'sine', t0: 0.08, f: 520, f2: 140, dur: 0.2, g: 0.12 }], 0.05),
    chomp: R(() => [{ k: 'n', dur: 0.12, g: 0.35, filt: { type: 'lowpass', f: 1800 } }, { k: 't', type: 'square', f: 160, f2: 60, dur: 0.12, g: 0.18 }], 0.08),
    // --- Null Herald ---
    bitcrush: R(() => {
      const v = [], notes = [523, 784, 659, 1046, 392, 880];
      for (let i = 0; i < 6; i++) v.push({ k: 't', type: 'square', t0: i * 0.035, f: notes[(Math.random() * notes.length) | 0], dur: 0.032, g: 0.07 });
      return v;
    }, 0.06),
    glitch: R(() => {
      const v = [];
      for (let i = 0; i < 4; i++) {
        v.push({ k: 'n', t0: i * 0.05 + Math.random() * 0.02, dur: 0.03, g: 0.18, filt: { type: 'bandpass', f: 500 + Math.random() * 5000, q: 8 } });
        v.push({ k: 't', type: 'square', t0: i * 0.05, f: 80 + Math.random() * 1600, dur: 0.025, g: 0.06 });
      }
      return v;
    }, 0.05),
    corrupt: R(() => [{ k: 't', type: 'square', f: 55, f2: 220, dur: 0.4, g: 0.12, trem: { f: 30, d: 0.9 } }, { k: 'n', dur: 0.4, g: 0.12, filt: { type: 'bandpass', f: 1200, f2: 300, q: 5 } }], 0.12),
    packet: R(() => [{ k: 't', type: 'square', f: 1200, f2: 2400, dur: 0.06, g: 0.06 }, { k: 't', type: 'square', t0: 0.06, f: 2400, f2: 1800, dur: 0.05, g: 0.05 }], 0.05),
    // --- boss lifecycle ---
    roar: R(p => [
      { k: 't', type: 'sawtooth', f: 140 * (p || 1), f2: 60 * (p || 1), dur: 1.3, a: 0.08, g: 0.32, trem: { f: 13, d: 0.35 }, filt: { type: 'lowpass', f: 1400, f2: 300, q: 2 } },
      { k: 't', type: 'square', f: 210 * (p || 1), f2: 80 * (p || 1), dur: 1.1, g: 0.06, det: 25 },
      { k: 'n', dur: 1.2, a: 0.1, g: 0.2, filt: { type: 'bandpass', f: 700, f2: 250, q: 1.2 } }
    ], 0.6),
    phase: R(() => [
      { k: 't', type: 'sine', f: 55, dur: 1.4, g: 0.5, a: 0.02 },
      { k: 't', type: 'sawtooth', f: 110, f2: 440, dur: 0.9, a: 0.4, g: 0.1, filt: { type: 'lowpass', f: 500, f2: 3000 } },
      { k: 'n', t0: 0.85, dur: 0.6, g: 0.35, filt: { type: 'lowpass', f: 2400, f2: 180 } }
    ], 0.8),
    death: R(() => [
      { k: 't', type: 'sine', f: 140, f2: 20, dur: 2.6, g: 0.7 },
      { k: 'n', dur: 2.2, g: 0.45, filt: { type: 'lowpass', f: 3200, f2: 60 } },
      { k: 't', type: 'sawtooth', f: 400, f2: 40, dur: 2.0, g: 0.1, filt: { type: 'lowpass', f: 1200, f2: 100 } }
    ], 1)
  };
  Synth.RECIPES = RECIPES;

  Synth.play = function (name, opts) {
    if (!Synth.enabled) return false;
    const rec = RECIPES[name];
    if (!rec) return false;
    const c = getCtx();
    if (!c) return false;
    const now = c.currentTime;
    const last = Synth._last[name];
    if (last !== undefined && now - last < rec.gap) return false;
    Synth._last[name] = now;
    const o = opts || {};
    const sp = spatial(o.x, o.y);
    const v = volume() * (o.gain === undefined ? 1 : o.gain) * sp.k;
    if (v <= 0.001) return false;
    try {
      const master = c.createGain();
      master.gain.value = v;
      let out = master;
      if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = sp.pan; master.connect(pn); pn.connect(bus(c)); }
      else master.connect(bus(c));
      const pitch = o.pitch || 1;
      const voices = rec.fn(o.param);
      const base = now + 0.005;
      voices.forEach(vc => (vc.k === 'n' ? noise(c, out, vc, base) : tone(c, out, vc, base, pitch)));
      return true;
    } catch (e) { return false; }
  };

  /** Sustained ambience. Returns { stop(fade), set(gain) }. */
  const LOOPS = {
    chronoDrone(c, out) {
      const nodes = [];
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 6;
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 0.35; lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency);
      [[55, 'sine', 0.5], [82.4, 'triangle', 0.22], [110.6, 'sawtooth', 0.05]].forEach(([f, t, g]) => {
        const o = c.createOscillator(), gg = c.createGain();
        o.type = t; o.frequency.value = f; gg.gain.value = g;
        o.connect(gg); gg.connect(lp); o.start(); nodes.push(o);
      });
      const n = c.createBufferSource(); n.buffer = noiseBuf(c); n.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
      const ng = c.createGain(); ng.gain.value = 0.05;
      n.connect(bp); bp.connect(ng); ng.connect(out); n.start(); nodes.push(n);
      lp.connect(out); lfo.start(); nodes.push(lfo);
      return nodes;
    }
  };
  Synth.loop = function (name, opts) {
    const c = getCtx(), mk = LOOPS[name];
    const dead = { stop() {}, set() {} };
    if (!c || !mk || !Synth.enabled) return dead;
    try {
      const o = opts || {};
      const g = c.createGain();
      const target = volume() * (o.gain === undefined ? 0.5 : o.gain);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, target), c.currentTime + (o.fade || 0.6));
      g.connect(bus(c));
      const nodes = mk(c, g);
      let stopped = false;
      return {
        set(k) { if (!stopped) g.gain.setTargetAtTime(Math.max(0.0001, volume() * k), c.currentTime, 0.08); },
        stop(fade) {
          if (stopped) return; stopped = true;
          const t = c.currentTime, f = fade === undefined ? 0.4 : fade;
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + f);
          nodes.forEach(nd => { try { nd.stop(t + f + 0.05); } catch (e) { /* ignore */ } });
        }
      };
    } catch (e) { return dead; }
  };

  BO.Synth = Synth;
})(window.BO);
