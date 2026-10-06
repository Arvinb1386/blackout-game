/* =========================================================================
 * BLACKOUT :: v13-chrono-fx.js
 * Cinematic presentation for the v9 Slow Motion skill [C].
 *
 * The skill logic (timers, speeds, perks) is untouched. This pack only adds
 * audio-visual feedback for the three moments of the skill:
 *
 *  ACTIVATE  reverse swell + deep time-drop, white/cyan flash, double
 *            chrono shockwave from the operator, zoom-echo blur, camera
 *            push-in, burst of frozen "time dust" around you.
 *  ACTIVE    desaturated cold grade, cyan vignette rim, slowly rotating
 *            screen-size clock dial, operator afterimages, light trails on
 *            every bullet, a clock ring around the operator that drains with
 *            the remaining time, heartbeat + slow clock tocks + time drone,
 *            kill pings with a ring at every enemy you drop.
 *  ENDING    last second: ring turns amber/red, ticks speed up, the image
 *            starts tearing (horizontal glitch bands).
 *  EXPIRE    implosion ring collapses into the operator, colour floods back,
 *            radial speed lines, snap-back whoosh + glass shimmer, camera
 *            settles with a small overshoot.
 *
 * Load after v9-skills.js (needs BO.Skills) and v13-synth.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO && BO.U, SK = BO && BO.Skills;
  if (!U || !SK || !BO.Renderer || !BO.Game) return;
  const R = BO.Renderer.prototype, G = BO.Game.prototype;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const easeIn = k => k * k * k;
  const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const S = () => BO.Synth;
  const sfx = (n, o) => { const s = S(); if (s) s.play(n, o); };

  const ENTER = 0.6, EXIT = 0.65, WARN = 1.0;
  const FX = {
    was: false, enterAt: -99, exitAt: -99, ox: 0, oy: 0,
    ghosts: [], ghostT: 0, dust: [], kills: [],
    beatT: 0, tockT: 0, warnTold: false, drone: null, zoom: 1, camPatched: null
  };
  BO.ChronoFX = FX;

  function playing(game) { return game && game.state === BO.Game.STATE.PLAYING; }

  /* ------------------------------ Lifecycle ----------------------------- */
  function onEnter(game) {
    const p = game.player;
    FX.enterAt = nowS(); FX.exitAt = -99; FX.warnTold = false;
    FX.ox = p ? p.x : 0; FX.oy = p ? p.y : 0;
    FX.ghosts.length = 0; FX.kills.length = 0;
    FX.beatT = 0.35; FX.tockT = 0.6;
    FX.dust.length = 0;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU, d = 40 + Math.random() * 520;
      FX.dust.push({ x: FX.ox + Math.cos(a) * d, y: FX.oy + Math.sin(a) * d, vx: Math.cos(a) * (4 + Math.random() * 10), vy: Math.sin(a) * (4 + Math.random() * 10) - 3,
        s: 0.8 + Math.random() * 2.2, ph: Math.random() * TAU, c: Math.random() < 0.25 ? '#ffffff' : '#7fe9ff' });
    }
    sfx('chronoIn', { gain: 0.95 });
    if (FX.drone) FX.drone.stop(0.05);
    FX.drone = S() ? S().loop('chronoDrone', { gain: 0.32, fade: 0.9 }) : null;
    if (game.addLight && p) U.safe('chrono.light', () => game.addLight(p.x, p.y, 620, '#7fe9ff', 0.9, 0.7));
    if (game.camera && game.camera.shake) U.safe('chrono.shake', () => game.camera.shake(6, 0.25));
    if (game.particles && game.particles.sparks && p) U.safe('chrono.sparks', () => game.particles.sparks(p.x, p.y, 0, 18, '#bff6ff', 380));
    patchCamera(game);
  }

  function onExit(game, silent) {
    FX.exitAt = silent ? -99 : nowS();
    const p = game && game.player;
    if (p) { FX.ox = p.x; FX.oy = p.y; }
    if (FX.drone) { FX.drone.stop(silent ? 0.05 : 0.5); FX.drone = null; }
    if (silent) return;
    sfx('chronoOut', { gain: 0.9 });
    if (game.addLight && p) U.safe('chrono.light2', () => game.addLight(p.x, p.y, 420, '#ffffff', 0.7, 0.35));
  }

  function patchCamera(game) {
    const cam = game && game.camera;
    if (!cam || FX.camPatched === cam) return;
    const orig = cam.update;
    if (typeof orig !== 'function') return;
    cam.update = function () {
      const r = orig.apply(this, arguments);
      if (FX.zoom !== 1 && U.isFiniteNumber(this.zoom)) this.zoom *= FX.zoom;
      return r;
    };
    FX.camPatched = cam;
  }

  /* Afterimage snapshots: the operator is drawn into a small offscreen canvas,
   * then tinted, so the ghost never inherits the sprite's own alpha state. */
  const SNAP = 160, pool = [];
  let poolIdx = 0;
  function snapshot(p, game) {
    if (typeof document === 'undefined') return null;
    let c = pool[poolIdx % 9];
    if (!c) { c = pool[poolIdx % 9] = document.createElement('canvas'); c.width = c.height = SNAP; }
    poolIdx++;
    const g = c.getContext('2d');
    if (!g) return null;
    const px = p.x, py = p.y;
    try {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, SNAP, SNAP);
      p.x = SNAP / 2; p.y = SNAP / 2;
      g.save(); p.draw(g, game ? game.time : 0); g.restore();
    } catch (e) { /* cosmetic only */ } finally { p.x = px; p.y = py; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(70,220,255,0.78)';
    g.fillRect(0, 0, SNAP, SNAP);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /* --------------------------- Per-frame update --------------------------- */
  const oUpdate = SK.update;
  SK.update = function (game, realDt) {
    const r = oUpdate.apply(this, arguments);
    const act = !!this.state.active;
    if (!FX.was && act && game) onEnter(game);
    else if (FX.was && !act && game) onExit(game, false);
    FX.was = act;
    U.safe('chrono.tick', () => tick(game, realDt || 0));
    return r;
  };

  function tick(game, dt) {
    const t = nowS(), st = SK.state, p = game && game.player;
    // camera push-in / settle
    let z = 1;
    if (st.active) z = 1 + 0.045 * easeOut(clamp((t - FX.enterAt) / ENTER, 0, 1));
    else if (t - FX.exitAt < EXIT) { const k = clamp((t - FX.exitAt) / EXIT, 0, 1); z = 1 + 0.045 * (1 - k) - Math.sin(k * Math.PI) * 0.02; }
    FX.zoom = z;
    if (!st.active) return;
    const live = playing(game);
    if (FX.drone) FX.drone.set(live ? 0.32 : 0.04);
    if (!live) return;
    // afterimages
    FX.ghostT -= dt;
    if (p && !p.dead && FX.ghostT <= 0) {
      FX.ghostT = 0.07;
      const last = FX.ghosts[FX.ghosts.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 6) FX.ghosts.push({ x: p.x, y: p.y, born: t, img: snapshot(p, game) });
      while (FX.ghosts.length > 7) FX.ghosts.shift();
    }
    // time dust
    FX.dust.forEach(d => { d.x += d.vx * dt * 0.25; d.y += d.vy * dt * 0.25; });
    // heartbeat + tocks
    const warn = st.durationTimer < WARN;
    FX.beatT -= dt;
    if (FX.beatT <= 0) { FX.beatT = warn ? 0.5 : 0.9; sfx('heartbeat', { gain: 0.8 }); }
    FX.tockT -= dt;
    if (FX.tockT <= 0) { FX.tockT = warn ? 0.16 : 0.5; sfx('tock', { gain: warn ? 0.9 : 0.6, param: warn ? 1.5 : 0.7 }); }
    if (warn && !FX.warnTold) { FX.warnTold = true; sfx('timeWarn', { gain: 0.9 }); }
  }

  const oStart = G.startMission;
  G.startMission = function () {
    const r = oStart.apply(this, arguments);
    FX.was = false; FX.ghosts.length = 0; FX.dust.length = 0; FX.kills.length = 0; FX.enterAt = -99; FX.exitAt = -99; FX.zoom = 1;
    if (FX.drone) { FX.drone.stop(0.05); FX.drone = null; }
    return r;
  };

  const oKill = G.onEnemyKilled;
  if (oKill) {
    G.onEnemyKilled = function (e) {
      const r = oKill.apply(this, arguments);
      if (SK.state.active && e) { FX.kills.push({ x: e.x, y: e.y, born: nowS() }); sfx('killPing', { x: e.x, y: e.y, gain: 0.8 }); }
      return r;
    };
  }

  // The v9 blips are replaced by the richer cues above.
  SK._playAudio = function () {};

  /* -------------------------------- Render -------------------------------- */
  const oWorld = R.renderWorld;
  R.renderWorld = function (game, time) {
    const r = oWorld.apply(this, arguments);
    const t = nowS();
    if (SK.state.active || t - FX.exitAt < EXIT) U.safe('chrono.render', () => draw(this, game, t));
    return r;
  };

  function glowDot(ctx, x, y, r, color, a) {
    if (!BO.softSprite) { ctx.globalAlpha = a; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU); ctx.fill(); return; }
    ctx.globalAlpha = a;
    ctx.drawImage(BO.softSprite(color), x - r, y - r, r * 2, r * 2);
  }

  function draw(rd, game, t) {
    const ctx = rd.ctx, w = rd.w, h = rd.h, dpr = rd.dpr, st = SK.state, p = game.player;
    const active = !!st.active;
    const kIn = clamp((t - FX.enterAt) / ENTER, 0, 1), kOut = clamp((t - FX.exitAt) / EXIT, 0, 1);
    const amount = active ? easeOut(kIn) : (1 - easeIn(kOut));
    const remain = active ? clamp(st.durationTimer / Math.max(0.01, st.maxDuration), 0, 1) : 0;
    const warn = active && st.durationTimer < WARN;
    const hue = warn ? (Math.floor(t * 8) % 2 ? '#ffb347' : '#ff5a6e') : '#7fe9ff';

    /* ---------- world space ---------- */
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (game.camera && game.camera.apply) game.camera.apply(ctx);
    ctx.globalCompositeOperation = 'lighter';

    // bullet light trails
    const items = game.projectiles && game.projectiles.pool && game.projectiles.pool.items;
    if (items && amount > 0.05) {
      ctx.lineCap = 'round';
      for (let i = 0; i < items.length; i++) {
        const pr = items[i];
        if (!pr.active || !U.isFiniteNumber(pr.dirX)) continue;
        const mine = pr.owner === 0;
        const len = Math.min(mine ? 90 : 70, 20 + (pr.speed || 400) * 0.06);
        ctx.strokeStyle = mine ? '#ffd9a0' : '#7fe9ff';
        ctx.globalAlpha = 0.22 * amount; ctx.lineWidth = mine ? 6 : 8;
        ctx.beginPath(); ctx.moveTo(pr.x - pr.dirX * len, pr.y - pr.dirY * len); ctx.lineTo(pr.x, pr.y); ctx.stroke();
        ctx.globalAlpha = 0.6 * amount; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(pr.x - pr.dirX * len * 0.6, pr.y - pr.dirY * len * 0.6); ctx.lineTo(pr.x, pr.y); ctx.stroke();
      }
    }

    // frozen time dust
    FX.dust.forEach(d => {
      const tw = 0.5 + Math.sin(t * 2 + d.ph) * 0.5;
      glowDot(ctx, d.x, d.y, 6 * d.s, d.c, 0.35 * amount * (0.4 + tw * 0.6));
    });

    // kill rings
    for (let i = FX.kills.length - 1; i >= 0; i--) {
      const k = FX.kills[i], a = (t - k.born) / 0.9;
      if (a >= 1) { FX.kills.splice(i, 1); continue; }
      ctx.globalAlpha = (1 - a) * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * (1 - a) + 1;
      ctx.beginPath(); ctx.arc(k.x, k.y, 14 + easeOut(a) * 70, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#7fe9ff'; ctx.lineWidth = 1.2;
      for (let s = 0; s < 4; s++) { const an = s * Math.PI / 2 + a * 2; ctx.beginPath(); ctx.moveTo(k.x + Math.cos(an) * (20 + a * 40), k.y + Math.sin(an) * (20 + a * 40)); ctx.lineTo(k.x + Math.cos(an) * (34 + a * 70), k.y + Math.sin(an) * (34 + a * 70)); ctx.stroke(); }
    }

    // operator afterimages (cyan-tinted snapshots)
    if (p && FX.ghosts.length && active) {
      for (let i = 0; i < FX.ghosts.length; i++) {
        const gh = FX.ghosts[i], age = clamp((t - gh.born) / 0.5, 0, 1);
        if (age >= 1 || Math.hypot(gh.x - p.x, gh.y - p.y) < 8) continue;
        const a = (1 - age) * 0.5 * amount;
        glowDot(ctx, gh.x, gh.y, 34, '#3fd8ff', a * 0.5);
        if (gh.img) { ctx.globalAlpha = a; ctx.drawImage(gh.img, gh.x - SNAP / 2, gh.y - SNAP / 2); }
      }
    }

    // clock ring around the operator
    if (p && !p.dead && amount > 0.02) {
      const R0 = 44 + (1 - amount) * 30;
      ctx.globalAlpha = 0.18 * amount; ctx.strokeStyle = hue; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, R0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.85 * amount; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, R0, -Math.PI / 2, -Math.PI / 2 + TAU * remain); ctx.stroke();
      const spin = t * 0.5;
      ctx.lineWidth = 1.4; ctx.globalAlpha = 0.5 * amount;
      for (let i = 0; i < 12; i++) {
        const an = spin + i / 12 * TAU, l = i % 3 === 0 ? 9 : 5;
        ctx.beginPath(); ctx.moveTo(p.x + Math.cos(an) * (R0 + 6), p.y + Math.sin(an) * (R0 + 6)); ctx.lineTo(p.x + Math.cos(an) * (R0 + 6 + l), p.y + Math.sin(an) * (R0 + 6 + l)); ctx.stroke();
      }
      const hand = -Math.PI / 2 + TAU * remain;
      ctx.globalAlpha = 0.9 * amount; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(hand) * (R0 - 10), p.y + Math.sin(hand) * (R0 - 10)); ctx.lineTo(p.x + Math.cos(hand) * (R0 + 4), p.y + Math.sin(hand) * (R0 + 4)); ctx.stroke();
      glowDot(ctx, p.x + Math.cos(hand) * R0, p.y + Math.sin(hand) * R0, 14, hue, 0.8 * amount);
    }

    // activation shockwaves (expanding)
    if (active && kIn < 1) {
      for (let s = 0; s < 3; s++) {
        const k = clamp((t - FX.enterAt - s * 0.09) / (ENTER + 0.25), 0, 1);
        if (k <= 0 || k >= 1) continue;
        const rr = easeOut(k) * (1300 - s * 250);
        ctx.globalAlpha = (1 - k) * (s === 0 ? 0.9 : 0.45);
        ctx.strokeStyle = s === 1 ? '#ffffff' : '#7fe9ff';
        ctx.lineWidth = (s === 0 ? 30 : 8) * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(FX.ox, FX.oy, rr, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = (1 - kIn) * 0.6;
      ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 2;
      for (let i = 0; i < 24; i++) {
        const an = i / 24 * TAU, r0 = 30 + easeOut(kIn) * 140, r1 = r0 + 40 + easeOut(kIn) * 160;
        ctx.beginPath(); ctx.moveTo(FX.ox + Math.cos(an) * r0, FX.oy + Math.sin(an) * r0); ctx.lineTo(FX.ox + Math.cos(an) * r1, FX.oy + Math.sin(an) * r1); ctx.stroke();
      }
    }

    // expiry implosion (collapsing)
    if (!active && kOut < 1 && p) {
      const k = easeIn(kOut), rr = (1 - k) * 900 + 10;
      ctx.globalAlpha = 0.25 + k * 0.6; ctx.strokeStyle = '#7fe9ff'; ctx.lineWidth = 3 + k * 14;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.4 * (1 - k); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr * 1.15, 0, TAU); ctx.stroke();
      if (kOut > 0.82) glowDot(ctx, p.x, p.y, 180, '#ffffff', (1 - kOut) / 0.18 * 0.9);
    }
    ctx.restore();

    /* ---------- screen space ---------- */
    const cv = rd.canvas;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // cold, desaturated grade
    if (amount > 0.01) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = 0.62 * amount; ctx.fillStyle = 'hsl(0,0%,50%)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.35 * amount; ctx.fillStyle = '#1aa8ff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.58);
      vg.addColorStop(0, 'rgba(4,10,24,0)');
      vg.addColorStop(1, 'rgba(2,8,22,' + (0.62 * amount) + ')');
      ctx.globalAlpha = 1; ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

      // giant slow clock dial
      ctx.globalCompositeOperation = 'lighter';
      const cx = w / 2, cy = h / 2, RR = Math.min(w, h) * 0.46, spin = -t * 0.06;
      ctx.strokeStyle = warn ? '#ff8a6a' : '#7fe9ff';
      ctx.globalAlpha = 0.07 * amount; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, RR, 0, TAU); ctx.stroke();
      for (let i = 0; i < 60; i++) {
        const an = spin + i / 60 * TAU, l = i % 5 === 0 ? 22 : 9;
        ctx.globalAlpha = (i % 5 === 0 ? 0.12 : 0.06) * amount;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * RR, cy + Math.sin(an) * RR); ctx.lineTo(cx + Math.cos(an) * (RR - l), cy + Math.sin(an) * (RR - l)); ctx.stroke();
      }
      const sec = -Math.PI / 2 + TAU * (1 - remain);
      ctx.globalAlpha = 0.1 * amount; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sec) * RR * 0.92, cy + Math.sin(sec) * RR * 0.92); ctx.stroke();
      // cyan rim
      ctx.globalAlpha = 0.22 * amount * (0.7 + Math.sin(t * 5) * 0.3);
      ctx.strokeStyle = warn ? '#ff6a5a' : '#3fd8ff'; ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.globalCompositeOperation = 'source-over';
    }

    // zoom-echo blur on activation
    if (active && kIn < 1) {
      const s = 1 + 0.08 * (1 - kIn);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * (1 - kIn);
      try { ctx.drawImage(cv, 0, 0, cv.width, cv.height, w / 2 - w * s / 2, h / 2 - h * s / 2, w * s, h * s); } catch (e) { /* ignore */ }
      ctx.globalCompositeOperation = 'source-over';
      if (kIn < 0.2) { ctx.globalAlpha = 0.5 * (1 - kIn / 0.2); ctx.fillStyle = '#e6fbff'; ctx.fillRect(0, 0, w, h); }
    }

    // time fracture in the last second
    if (warn) {
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const by = Math.random() * h, bh = 4 + Math.random() * 22, off = (Math.random() - 0.5) * 26;
        try { ctx.globalAlpha = 0.85; ctx.drawImage(cv, 0, by * dpr, cv.width, bh * dpr, off, by, w, bh); } catch (e) { /* ignore */ }
      }
      ctx.globalAlpha = 0.06 + Math.random() * 0.05; ctx.fillStyle = '#ff5a6e'; ctx.fillRect(0, 0, w, h);
    }

    // expiry: speed lines + colour flood flash
    if (!active && kOut < 1) {
      const k = kOut, cx = w / 2, cy = h / 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      for (let i = 0; i < 46; i++) {
        const an = i * 2.399 + i, r0 = Math.min(w, h) * (0.2 + k * 0.5), r1 = r0 + 60 + Math.sin(i * 7) * 40 + k * 260;
        ctx.globalAlpha = (1 - k) * 0.25;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (k > 0.55 && k < 0.85) { ctx.globalAlpha = 0.25 * (1 - Math.abs(k - 0.7) / 0.15); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    }
    ctx.restore();
  }

  /* ------------------------------ Strings ------------------------------ */
  if (BO.I18N && BO.I18N.extend) {
    BO.I18N.extend('en', { 'sk.slowmoActive': '// TIME DILATION ENGAGED //', 'sk.slowmoEnded': 'TIME FLOW RESTORED' });
    BO.I18N.extend('fa', { 'sk.slowmoActive': '// زمان شکست //', 'sk.slowmoEnded': 'جریان زمان برگشت' });
  }
})(window.BO);
