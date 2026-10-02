/* =========================================================================
 * BLACKOUT :: v4-voice.js
 * Persian enemy voice barks. Hostiles now shout in Persian when they spot
 * you, hear something, lose you, get hit, lose a squadmate, throw a grenade,
 * fall back or get reinforced, with a subtitle bubble above the speaker
 * (English translation underneath when the UI is in English).
 *
 * Audio: uses a real Persian text-to-speech voice through the Web Speech API
 * when the browser has one (e.g. Microsoft Edge "Farid"/"Dilara" online
 * voices, Android, some Linux/macOS setups). Otherwise falls back to a
 * procedural "military radio" voice: formant-synthesised syllables shaped
 * from the line (pitch per archetype, rising on questions) run through a
 * band-limited, overdriven radio chain with squelch clicks.
 * Toggle in Settings > ENEMY VOICES.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const ST = BO.ENEMY_STATE;
  const MAX_DIST = 1150;

  const LINES = {
    spot: [['اونجاست!', 'There he is!'], ['دیدمش!', 'I see him!'], ['هدف رو دیدم!', 'Target spotted!'], ['ایست! تکون نخور!', 'Freeze! Don\'t move!'],
      ['نفوذی! نفوذی!', 'Intruder! Intruder!'], ['بزنیدش!', 'Take him down!'], ['اینجاست، همه بیاید!', 'He\'s here, everyone on me!']],
    charge: [['حمله!', 'Attack!'], ['بریم جلو!', 'Push forward!'], ['یورش!', 'Charge!'], ['خودم می‌گیرمش!', 'I\'ve got him!']],
    suspicious: [['صدای چی بود؟', 'What was that?'], ['کی اونجاست؟', 'Who\'s there?'], ['یه چیزی تکون خورد...', 'Something moved...'],
      ['مواظب باشید...', 'Stay sharp...'], ['کسی اونجاست؟', 'Anyone there?']],
    search: [['کجا رفت؟', 'Where did he go?'], ['گمش کردیم!', 'We lost him!'], ['پخش بشید، پیداش کنید!', 'Spread out, find him!'],
      ['قایم شده...', 'He\'s hiding...'], ['همین دور و برهاست.', 'He\'s close.']],
    hurt: [['زخمی شدم!', 'I\'m hit!'], ['آخ! خوردم!', 'Argh! I\'m hit!'], ['کمک! تیر خوردم!', 'Help! I\'ve been shot!'], ['لعنتی!', 'Damn it!']],
    allyDown: [['یکی رو زدن!', 'Man down!'], ['نفرمون افتاد!', 'We lost one!'], ['کشتش! مواظب باشید!', 'He killed him! Watch out!'], ['یه نفر کم شدیم!', 'We\'re one short!']],
    grenade: [['نارنجک!', 'Grenade out!'], ['بخور اینو!', 'Eat this!'], ['پرتاب!', 'Throwing!']],
    retreat: [['عقب‌نشینی!', 'Fall back!'], ['پوشش بدید!', 'Cover me!'], ['دارم عقب می‌کشم!', 'I\'m pulling back!']],
    shieldBreak: [['سپرم شکست!', 'My shield\'s broken!'], ['سپر از دست رفت!', 'Shield\'s gone!']],
    wave: [['نیروی کمکی رسید!', 'Reinforcements are here!'], ['محاصره‌ش کنید!', 'Surround him!'], ['از همه طرف بزنید!', 'Hit him from all sides!']],
    drone: []
  };

  // speechSynthesis pitch (0..2) and fallback-synth fundamental (Hz) per archetype.
  const VOICE = {
    grunt: [1.0, 125], rusher: [1.3, 155], heavy: [0.5, 88], sniper: [0.85, 112],
    breacher: [0.72, 100], grenadier: [0.95, 120], shield: [0.62, 94]
  };
  const VOWELS = [[750, 1250], [500, 1800], [300, 2250], [520, 900], [340, 800], [680, 1100]];

  const settings = () => (BO.V4 ? BO.V4.settings() : {});
  const voiceOn = () => !BO.V4 || BO.V4.setting('voice');
  const playing = (g) => g && g.player && BO.Game && g.state === BO.Game.STATE.PLAYING;

  function driveCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    return c;
  }
  let CURVE = null;

  function noiseBuf(ctx, audio) {
    if (audio && audio.noiseBuffer) return audio.noiseBuffer;
    if (noiseBuf._b && noiseBuf._b.sampleRate === ctx.sampleRate) return noiseBuf._b;
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf._b = b;
    return b;
  }

  /** Procedural radio voice. Returns the number of seconds scheduled. */
  function radioVoice(ctx, out, text, opts) {
    const o = opts || {};
    const t0 = Math.max(0.05, o.when !== undefined ? o.when : ctx.currentTime) + 0.02;
    const vol = o.vol === undefined ? 0.5 : o.vol;
    const f0 = (o.f0 || 120) * (o.jitter || 1);
    const letters = text.replace(/[^\u0600-\u06FF]/g, '').length;
    const words = text.trim().split(/\s+/).length;
    const syl = U.clamp(Math.round(letters / 2.1), 2, 11);
    const exclaim = /!/.test(text), question = /[?؟]/.test(text);
    const rng = U.makeRng(o.seed || (text.length * 7919 + 17));

    const master = ctx.createGain(); master.gain.value = vol;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3100; lp.Q.value = 0.9;
    const shaper = ctx.createWaveShaper(); shaper.curve = CURVE || (CURVE = driveCurve(4)); shaper.oversample = '2x';
    master.connect(hp); hp.connect(lp); lp.connect(shaper);
    let tail = shaper;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = U.clamp(o.pan, -1, 1); shaper.connect(p); tail = p; }
    tail.connect(out);

    // Glottal source -> two formant band-passes -> syllable envelope.
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const sub = ctx.createOscillator(); sub.type = 'square';
    const subG = ctx.createGain(); subG.gain.value = 0.18;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8;
    const f2g = ctx.createGain(); f2g.gain.value = 0.7;
    const env = ctx.createGain(); env.gain.value = 0;
    osc.connect(f1); osc.connect(f2); sub.connect(subG); subG.connect(f1);
    f1.connect(env); f2.connect(f2g); f2g.connect(env); env.connect(master);

    // Consonant hiss bursts.
    const nz = ctx.createBufferSource(); nz.buffer = noiseBuf(ctx, o.audio); nz.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3600; nf.Q.value = 1.4;
    const nenv = ctx.createGain(); nenv.gain.value = 0;
    nz.connect(nf); nf.connect(nenv); nenv.connect(master);

    // Squelch open.
    const sq = ctx.createGain(); sq.gain.value = 0;
    const sqn = ctx.createBufferSource(); sqn.buffer = noiseBuf(ctx, o.audio); sqn.loop = true;
    const sqf = ctx.createBiquadFilter(); sqf.type = 'highpass'; sqf.frequency.value = 1800;
    sqn.connect(sqf); sqf.connect(sq); sq.connect(master);
    sq.gain.setValueAtTime(0.0001, t0 - 0.02);
    sq.gain.linearRampToValueAtTime(0.32, t0 - 0.01);
    sq.gain.linearRampToValueAtTime(0.0001, t0 + 0.05);

    let t = t0;
    const wordBreaks = Math.max(0, words - 1);
    let breaksLeft = wordBreaks;
    for (let i = 0; i < syl; i++) {
      const k = i / Math.max(1, syl - 1);
      let contour = exclaim ? 1.22 - 0.3 * k : 1.05 - 0.18 * k;
      if (question && k > 0.7) contour += (k - 0.7) * 1.4;
      const pitch = f0 * contour * (0.94 + rng() * 0.12);
      const v = VOWELS[Math.floor(rng() * VOWELS.length)];
      const dur = (exclaim ? 0.085 : 0.1) + rng() * 0.05;
      if (rng() < 0.55) {
        nenv.gain.setValueAtTime(0.0001, t);
        nenv.gain.linearRampToValueAtTime(0.22 + rng() * 0.2, t + 0.012);
        nenv.gain.linearRampToValueAtTime(0.0001, t + 0.04);
        nf.frequency.setValueAtTime(2500 + rng() * 2500, t);
        t += 0.03;
      }
      osc.frequency.setValueAtTime(pitch, t);
      osc.frequency.linearRampToValueAtTime(pitch * (0.97 + rng() * 0.06), t + dur);
      sub.frequency.setValueAtTime(pitch / 2, t);
      f1.frequency.setValueAtTime(v[0] * (0.9 + rng() * 0.2), t);
      f2.frequency.setValueAtTime(v[1] * (0.9 + rng() * 0.2), t);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(exclaim ? 1.0 : 0.8, t + 0.018);
      env.gain.setValueAtTime(exclaim ? 0.9 : 0.7, t + dur * 0.7);
      env.gain.linearRampToValueAtTime(0.0001, t + dur);
      t += dur + 0.012 + rng() * 0.03;
      if (breaksLeft > 0 && rng() < breaksLeft / Math.max(1, syl - i)) { t += 0.07 + rng() * 0.05; breaksLeft--; }
    }
    // Squelch close.
    sq.gain.setValueAtTime(0.0001, t + 0.02);
    sq.gain.linearRampToValueAtTime(0.4, t + 0.035);
    sq.gain.linearRampToValueAtTime(0.0001, t + 0.16);
    const end = t + 0.25;
    [osc, sub, nz, sqn].forEach(n => { n.start(t0 - 0.03); n.stop(end); });
    return end - t0;
  }

  function pickPersian(list) {
    const fa = (list || []).filter(v => /^fa(\b|[-_])/i.test(v.lang || '') || /persian|farsi/i.test(v.name || ''));
    if (!fa.length) return null;
    fa.sort((a, b) => score(b) - score(a));
    return fa[0];
    function score(v) { return (/natural|online|neural/i.test(v.name) ? 2 : 0) + (/^fa-ir/i.test(v.lang) ? 1 : 0); }
  }

  const Voice = {
    voice: null,
    last: -99,
    lastWave: -99,
    queue: [],
    lastIdx: {},
    LINES,
    radioVoice,

    init() {
      if (!('speechSynthesis' in window)) return;
      const load = () => { try { this.voice = pickPersian(window.speechSynthesis.getVoices()); } catch (e) { this.voice = null; } };
      load();
      try { window.speechSynthesis.addEventListener('voiceschanged', load); } catch (e) { window.speechSynthesis.onvoiceschanged = load; }
    },

    hasTTS() { return !!this.voice; },

    /** Ask an enemy to say a line from a category. prio: 0..3 (3 = urgent, cuts the global cooldown). */
    bark(e, cat, prio) {
      const g = BO.game;
      if (!playing(g) || !e || e.dead || e.isBoss || (e.def && e.def.mute)) return false;
      const list = LINES[cat];
      if (!list || !list.length) return false;
      const pr = prio || 0;
      const now = g.realTime;
      if (now - this.last < (pr >= 3 ? 0.35 : pr >= 2 ? 0.9 : 1.5)) return false;
      if (e._barkAt !== undefined && now - e._barkAt < (pr >= 3 ? 1 : 5)) return false;
      const p = g.player;
      const d = U.dist(p.x, p.y, e.x, e.y);
      if (d > MAX_DIST) return false;
      let idx = Math.floor(Math.random() * list.length);
      if (this.lastIdx[cat] === idx && list.length > 1) idx = (idx + 1) % list.length;
      this.lastIdx[cat] = idx;
      const line = list[idx];
      this.last = now;
      e._barkAt = now;
      e._bark = { fa: line[0], en: line[1], t: 0, life: 1.5 + line[0].length * 0.06, cat };
      if (voiceOn()) U.safe('voice.play', () => this._play(g, e, line[0], d, cat, pr));
      return true;
    },

    later(e, cat, prio, delay) { this.queue.push({ e, cat, prio, t: delay }); if (this.queue.length > 8) this.queue.shift(); },

    _play(g, e, text, d, cat, prio) {
      const s = settings();
      const near = U.clamp(1 - d / MAX_DIST, 0, 1);
      const vt = VOICE[e.type] || VOICE.grunt;
      if (e._vj === undefined) e._vj = 0.9 + Math.random() * 0.2;
      const synth = window.speechSynthesis;
      if (this.voice && synth) {
        const busy = synth.speaking || synth.pending;
        if (!busy || prio >= 3) {
          if (busy) synth.cancel();
          const u = new window.SpeechSynthesisUtterance(text);
          u.voice = this.voice;
          u.lang = this.voice.lang || 'fa-IR';
          u.pitch = U.clamp(vt[0] * e._vj, 0.1, 2);
          u.rate = cat === 'grenade' || cat === 'spot' || cat === 'charge' ? 1.25 : 1.1;
          u.volume = U.clamp((s.master === undefined ? 0.8 : s.master) * (s.sfx === undefined ? 0.85 : s.sfx) * (0.3 + 0.7 * near), 0, 1);
          synth.speak(u);
          return;
        }
      }
      const a = g.audio;
      if (!a || !a.ctx || (a._ready && !a._ready())) return;
      const out = a.sfxBus || a.master || a.ctx.destination;
      const sp = a.spatial ? a.spatial(e.x, e.y) : { vol: 1, pan: 0 };
      radioVoice(a.ctx, out, text, { vol: 0.5 * (0.35 + 0.65 * near), f0: vt[1], jitter: e._vj, pan: sp.pan, audio: a, seed: (e.id * 131 + text.length * 7) | 0 });
    },

    update(g, dt) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const q = this.queue[i];
        q.t -= dt;
        if (q.t > 0) continue;
        this.queue.splice(i, 1);
        if (!q.e.dead) this.bark(q.e, q.cat, q.prio);
      }
      const list = g.enemies;
      for (let i = 0; i < list.length; i++) {
        const b = list[i]._bark;
        if (!b) continue;
        b.t += dt;
        if (b.t > b.life || list[i].dead) list[i]._bark = null;
      }
    },

    stop() {
      this.queue.length = 0;
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  };
  BO.Voice = Voice;
  Voice.init();

  /* ------------------------------- Hooks ------------------------------- */
  const E = BO.Enemy && BO.Enemy.prototype;
  if (E) {
    const origSet = E.setState;
    E.setState = function (s) {
      const prev = this.state;
      origSet.call(this, s);
      if (prev === s || this.dead || this.isBoss) return;
      if (s === ST.ALERT && (prev === ST.IDLE || prev === ST.PATROL)) { if (Math.random() < 0.7) Voice.bark(this, 'suspicious', 0); }
      else if (s === ST.SEARCH && (prev === ST.CHASE || prev === ST.ATTACK)) { if (Math.random() < 0.6) Voice.bark(this, 'search', 0); }
      else if (s === ST.RETREAT) Voice.bark(this, 'retreat', 2);
    };

    const origOverlay = E.drawOverlay;
    E.drawOverlay = function (ctx, time, game) {
      origOverlay.call(this, ctx, time, game);
      const b = this._bark;
      if (!b || this.dead || !this.visible) return;
      U.safe('voice.bubble', () => drawBubble(ctx, this, b));
    };
  }

  function drawBubble(ctx, e, b) {
    const a = U.clamp(Math.min(b.t / 0.12, (b.life - b.t) / 0.3), 0, 1);
    if (a <= 0.01) return;
    const en = BO.I18N && BO.I18N.lang === 'en';
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px Vazirmatn, Tahoma, sans-serif';
    ctx.direction = 'rtl';
    const w1 = ctx.measureText(b.fa).width;
    let w2 = 0;
    if (en) { ctx.font = '600 11px "Chakra Petch", Khand, sans-serif'; ctx.direction = 'ltr'; w2 = ctx.measureText(b.en).width; }
    const bw = Math.max(w1, w2) + 20, bh = en ? 40 : 26;
    const pop = 1 + Math.max(0, 0.12 - b.t) * 2;
    const x = e.x, y = e.y - e.r - 44 - (en ? 8 : 0);
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.fillStyle = 'rgba(8,9,18,0.85)';
    ctx.beginPath();
    const r = 7, l = -bw / 2, t = -bh / 2;
    ctx.moveTo(l + r, t);
    ctx.arcTo(l + bw, t, l + bw, t + bh, r);
    ctx.arcTo(l + bw, t + bh, l, t + bh, r);
    ctx.lineTo(6, t + bh); ctx.lineTo(0, t + bh + 7); ctx.lineTo(-6, t + bh);
    ctx.arcTo(l, t + bh, l, t, r);
    ctx.arcTo(l, t, l + bw, t, r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = U.rgba((e.def && e.def.color) || '#ff3355', 0.85);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.font = '700 15px Vazirmatn, Tahoma, sans-serif';
    ctx.direction = 'rtl';
    ctx.fillStyle = b.cat === 'grenade' || b.cat === 'spot' ? '#ffd0d8' : '#eef0f6';
    ctx.fillText(b.fa, 0, en ? -7 : 1);
    if (en) {
      ctx.font = '600 11px "Chakra Petch", Khand, sans-serif';
      ctx.direction = 'ltr';
      ctx.fillStyle = '#9aa0b4';
      ctx.fillText(b.en, 0, 10);
    }
    ctx.restore();
  }

  const G = BO.Game && BO.Game.prototype;
  if (G) {
    const origEngaged = G.onEnemyEngaged;
    G.onEnemyEngaged = function (e) {
      origEngaged.call(this, e);
      if (e && !e.isWave && !e.minion) Voice.bark(e, e.type === 'rusher' || e.type === 'breacher' ? 'charge' : 'spot', 1);
    };

    const origDamage = G.damageEnemy;
    G.damageEnemy = function (e, amount, kx, ky, info) {
      const hp0 = e.hp;
      origDamage.call(this, e, amount, kx, ky, info);
      if (!e.dead && !e.isBoss && e.hp < hp0 && e.hp / e.maxHp < 0.55 && !e._hurtBarked) {
        e._hurtBarked = true;
        if (Math.random() < 0.75) Voice.bark(e, 'hurt', 2);
      }
    };

    const origKilled = G.onEnemyKilled;
    G.onEnemyKilled = function (e, info) {
      origKilled.call(this, e, info);
      U.safe('voice.allyDown', () => {
        if (e.isBoss || Math.random() > 0.65) return;
        let best = null, bd = 650 * 650;
        for (let i = 0; i < this.enemies.length; i++) {
          const o = this.enemies[i];
          if (o === e || o.dead || o.isBoss || (o.def && o.def.mute)) continue;
          const d2 = U.dist2(o.x, o.y, e.x, e.y);
          if (d2 < bd) { bd = d2; best = o; }
        }
        if (best) Voice.later(best, 'allyDown', 1, 0.45 + Math.random() * 0.3);
      });
    };

    const origSpawn = G.spawnEnemy;
    G.spawnEnemy = function (type, x, y, opts) {
      const e = origSpawn.call(this, type, x, y, opts);
      if (e && opts && opts.wave && this.realTime - Voice.lastWave > 7 && !(e.def && e.def.mute)) {
        Voice.lastWave = this.realTime;
        Voice.later(e, 'wave', 2, 0.8);
      }
      return e;
    };

    const origUpdate = G._update;
    G._update = function (realDt) {
      origUpdate.call(this, realDt);
      U.safe('voice.update', () => Voice.update(this, realDt));
    };

    ['pause', 'quitToMenu', 'onPlayerDeath', 'onAllObjectivesComplete'].forEach(name => {
      const orig = G[name];
      if (typeof orig !== 'function') return;
      G[name] = function () { Voice.stop(); return orig.apply(this, arguments); };
    });
    const origStart = G.startMission;
    G.startMission = function (id) { Voice.stop(); Voice.last = -99; Voice.lastWave = -99; return origStart.call(this, id); };
  }
})(window.BO);
