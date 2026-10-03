/* =========================================================================
 * BLACKOUT :: v7-world.js
 * Environment tech for the v7 operations:
 *  - themed hazard variants: the generic shock plate becomes quicksand,
 *    acid sludge, lava vents, cryo leaks, steam vents, radiation pools or
 *    spirit wards depending on the mission theme (theme.hazard)
 *  - ten new screen-space weathers: sand, ash, fireflies, bubbles, void,
 *    fallout, petals, drips, fog and storm (rain + lightning)
 *  - theme decor baked into the static map (theme.decor): dunes, jungle
 *    moss and vines, caustics + portholes, lava cracks, starfield hull,
 *    rubble and fallout puddles, shrine planks and petals, sewer channels,
 *    crypt bones and candles, oil-rig deck plating
 * Everything is data-driven from BO.THEMES and degrades gracefully.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TAU = U.TAU;
  const TILE = BO.CONFIG.TILE;
  const T = BO.TILE_TYPE;
  const SH = BO.PARTICLE_SHAPE || {};
  const shape = (name, fb) => (SH[name] !== undefined ? SH[name] : SH[fb]);
  const settings = () => (BO.SaveSystem && BO.SaveSystem.data && BO.SaveSystem.data.settings) || {};
  const qualityMul = () => { const q = settings().particles; return q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1; };

  /* ============================ Hazard variants ============================ */
  const VARIANTS = {
    sand:      { color: '#e8b866', base: '#2e2416', dps: 8,  slow: 0.5, slowAlways: true, fx: 'sand',  look: 'pool', beep: 90 },
    acid:      { color: '#8dff3a', base: '#142212', dps: 24, slow: 0.8, fx: 'bubble', look: 'pool', beep: 180 },
    fire:      { color: '#ff7a1a', base: '#1c0f08', dps: 32, burn: true, fx: 'flame', look: 'vent', beep: 110 },
    cryo:      { color: '#bfefff', base: '#121c26', dps: 12, slow: 0.45, fx: 'frost', look: 'ice', beep: 900 },
    steam:     { color: '#e8f0ff', base: '#171b20', dps: 34, fx: 'steam', look: 'vent', beep: 220, cycle: { idle: 2.6, warn: 0.9, live: 1.3 } },
    radiation: { color: '#c6ff3d', base: '#151b0c', dps: 15, fx: 'rad', look: 'pool', beep: 600, cycle: { idle: 2.2, warn: 0.8, live: 3 } },
    spirit:    { color: '#ff6bd5', base: '#1a1020', dps: 26, fx: 'zap', look: 'grate', beep: 320 }
  };
  BO.HAZARD_VARIANTS = VARIANTS;
  const PANEL_CYCLE = { idle: 3.2, warn: 1.0, live: 1.9 };

  const inRect = (z, x, y) => x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h;
  const playersOf = (game) => (game.players && game.players.length ? game.players : [game.player]);

  function slowActors(z, game, mul) {
    playersOf(game).forEach(p => {
      if (!p || p.dead || !inRect(z, p.x, p.y)) return;
      p.v7slowT = 0.15; p.v7slowMul = mul;
    });
    const list = game.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.isBoss || !inRect(z, e.x, e.y)) continue;
      e.v7chillT = Math.max(e.v7chillT || 0, 0.15);
      e.v7chillMul = Math.min(e.v7chillMul || 1, mul);
    }
  }

  function igniteEnemies(z, game) {
    const list = game.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.isBoss || !inRect(z, e.x, e.y)) continue;
      e.burnT = Math.max(e.burnT || 0, 1.6);
      e.burnDps = Math.max(e.burnDps || 0, 12);
    }
  }

  function emit(z, v, game) {
    const P = game.particles;
    const x = z.x + Math.random() * z.w, y = z.y + Math.random() * z.h;
    switch (v.fx) {
      case 'flame':
        P.spawn(x, y, U.randSpread() * 20, -U.rand(60, 140), U.rand(0.35, 0.6), U.rand(4, 7), U.rand(14, 22), '#ffb347', shape('FIRE', 'GLOW'), { additive: true, drag: 1.4 });
        break;
      case 'steam':
        P.spawn(x, y, U.randSpread() * 30, -U.rand(40, 90), U.rand(0.6, 1), U.rand(8, 12), U.rand(30, 46), '#d8e0ea', shape('PUFF', 'SMOKE'), { alpha: 0.3, drag: 1.2 });
        break;
      case 'sand':
        P.spawn(x, y, U.randSpread() * 30, U.randSpread() * 30, U.rand(0.5, 0.9), U.rand(3, 5), U.rand(12, 18), '#c9a060', shape('PUFF', 'SMOKE'), { alpha: 0.25, drag: 2 });
        break;
      case 'frost':
        P.spawn(x, y, U.randSpread() * 20, -U.rand(10, 40), U.rand(0.4, 0.8), 2.5, 0.5, '#e6f8ff', shape('GLOW', 'DOT'), { additive: true, drag: 1 });
        break;
      case 'bubble':
      case 'rad':
        P.spawn(x, y, 0, -U.rand(8, 30), U.rand(0.5, 0.9), U.rand(2, 3.5), 0.6, v.color, shape('GLOW', 'DOT'), { additive: true, drag: 0.5 });
        break;
      default:
        P.sparks(x, y, -Math.PI / 2, 2, v.color, 220);
    }
    if (Math.random() < 0.25) game.addLight(z.x + z.w / 2, z.y + z.h / 2, 120, v.color, 0.2, 0.55);
  }

  const HZ = BO.HazardSystem.prototype;
  const origPanel = HZ._updatePanel;
  HZ._updatePanel = function (z, dt, game) {
    const v = this.v7variant;
    if (!v) return origPanel.call(this, z, dt, game);
    const cyc = v.cycle || PANEL_CYCLE;
    const total = cyc.idle + cyc.warn + cyc.live;
    const c = z.t % total, prev = z.phase;
    z.phase = c < cyc.idle ? 'idle' : (c < cyc.idle + cyc.warn ? 'warn' : 'live');
    if (v.slow && (v.slowAlways || z.phase === 'live')) slowActors(z, game, v.slow);
    if (v.fx === 'sand' && Math.random() < dt * 2) emit(z, v, game);
    if (z.phase !== 'live') return;
    if (prev !== 'live' && game.audio) game.audio.beep(v.beep || 140, 0.04);
    this._damageRect(z, dt, game, true);
    if (v.burn) igniteEnemies(z, game);
    if (Math.random() < dt * 12) emit(z, v, game);
  };

  const origRender = HZ.render;
  HZ.render = function (ctx, time) {
    const v = this.v7variant;
    if (!v) return origRender.call(this, ctx, time);
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.kind === 'panel') drawBase(ctx, z, v, time);
    }
  };

  function drawBase(ctx, z, v, time) {
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    ctx.save();
    if (v.look === 'pool' || v.look === 'ice') {
      ctx.fillStyle = v.base;
      ctx.beginPath(); ctx.ellipse(cx, cy, z.w * 0.52, z.h * 0.46, 0, 0, TAU); ctx.fill();
      const gr = ctx.createRadialGradient(cx, cy, 2, cx, cy, z.w * 0.5);
      gr.addColorStop(0, U.rgba(v.color, v.look === 'ice' ? 0.16 : 0.22));
      gr.addColorStop(1, U.rgba(v.color, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(cx, cy, z.w * 0.5, z.h * 0.44, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = U.rgba(v.color, 0.18); ctx.lineWidth = 1;
      if (v.look === 'ice') {
        ctx.beginPath();
        ctx.moveTo(cx - z.w * 0.3, cy - 6); ctx.lineTo(cx - 4, cy + 3); ctx.lineTo(cx + z.w * 0.32, cy - 8);
        ctx.moveTo(cx - 4, cy + 3); ctx.lineTo(cx + 6, cy + z.h * 0.3);
        ctx.stroke();
      } else {
        const ph = time * (v.fx === 'sand' ? 0.8 : 1.6);
        for (let k = 0; k < 3; k++) {
          const rr = ((ph + k / 3) % 1) * z.w * 0.45;
          ctx.globalAlpha = 1 - rr / (z.w * 0.45);
          ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.85, 0, 0, TAU); ctx.stroke();
        }
      }
    } else if (v.look === 'vent') {
      ctx.fillStyle = v.base;
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = U.rgba(v.color, 0.14 + Math.sin(time * 3 + z.x) * 0.05);
      for (let gy = z.y + 8; gy < z.y + z.h - 6; gy += 12) ctx.fillRect(z.x + 6, gy, z.w - 12, 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
      ctx.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2);
    } else {
      ctx.fillStyle = v.base;
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = U.rgba(v.color, 0.16); ctx.lineWidth = 1;
      for (let gx = z.x + 8; gx < z.x + z.w; gx += 12) { ctx.beginPath(); ctx.moveTo(gx, z.y + 3); ctx.lineTo(gx, z.y + z.h - 3); ctx.stroke(); }
    }
    ctx.restore();
  }

  HZ.renderOverlay = function (ctx, time) {
    const v = this.v7variant;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.kind === 'strike') {
        const k = U.clamp(z.t / z.warn, 0, 1);
        ctx.fillStyle = U.rgba('#ff3355', 0.12 + k * 0.18);
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgba('#ff3355', 0.55 + Math.sin(time * 20) * 0.25);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(z.x - 8, z.y); ctx.lineTo(z.x + 8, z.y); ctx.moveTo(z.x, z.y - 8); ctx.lineTo(z.x, z.y + 8); ctx.stroke();
        continue;
      }
      const isPanel = z.kind === 'panel';
      const pv = isPanel ? v : null;
      const color = isPanel ? (pv ? pv.color : '#7fe3ff') : '#ff6b81';
      const round = pv && (pv.look === 'pool' || pv.look === 'ice');
      const area = () => {
        ctx.beginPath();
        if (round) ctx.ellipse(z.x + z.w / 2, z.y + z.h / 2, z.w * 0.52, z.h * 0.46, 0, 0, TAU);
        else ctx.rect(z.x, z.y, z.w, z.h);
      };
      if (z.phase === 'warn') {
        const blink = Math.floor(time * 10) % 2 === 0;
        ctx.strokeStyle = U.rgba(color, blink ? 0.9 : 0.35);
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        if (round) { area(); ctx.stroke(); } else ctx.strokeRect(z.x + 2, z.y + 2, z.w - 4, z.h - 4);
        ctx.setLineDash([]);
        ctx.fillStyle = U.rgba(color, 0.08);
        area(); ctx.fill();
      } else if (z.phase === 'live') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = U.rgba(color, 0.2 + Math.random() * 0.1);
        area(); ctx.fill();
        if (pv && pv.fx !== 'zap') {
          ctx.fillStyle = U.rgba(color, 0.55);
          for (let k = 0; k < 4; k++) {
            const bx = z.x + z.w * (0.2 + Math.random() * 0.6), by = z.y + z.h * (0.2 + Math.random() * 0.6);
            ctx.beginPath(); ctx.arc(bx, by, 1.5 + Math.random() * 2.5, 0, TAU); ctx.fill();
          }
        } else {
          ctx.strokeStyle = U.rgba(color, 0.9);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            let x = z.x + Math.random() * z.w, y = z.y;
            ctx.moveTo(x, y);
            while (y < z.y + z.h) { y += 10; x = U.clamp(x + U.randSpread() * 14, z.x, z.x + z.w); ctx.lineTo(x, y); }
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (pv && pv.slowAlways) {
        ctx.strokeStyle = U.rgba(color, 0.25);
        ctx.lineWidth = 1;
        area(); ctx.stroke();
      }
    }
  };

  /* ---------------------- Player slow (sand / cryo) ---------------------- */
  const PP = BO.Player.prototype;
  const origMove = PP._updateMovement;
  PP._updateMovement = function (dt, input, game) {
    if (!(this.v7slowT > 0)) return origMove.call(this, dt, input, game);
    this.v7slowT -= dt;
    const keep = this.speedMul;
    this.speedMul = keep * U.clamp(this.v7slowMul || 1, 0.2, 1);
    try { return origMove.call(this, dt, input, game); } finally { this.speedMul = keep; }
  };

  /* --------------------------- Mission start --------------------------- */
  const G = BO.Game.prototype;
  const origStart = G.startMission;
  G.startMission = function (id) {
    const ok = origStart.apply(this, arguments);
    if (!ok) return ok;
    U.safe('v7.world.start', () => {
      const th = this.level && this.level.theme;
      const key = th && th.hazard;
      const v = key ? VARIANTS[key] || null : null;
      this.hazards.v7variant = v;
      const panels = this.hazards.zones.filter(z => z.kind === 'panel');
      if (v) panels.forEach(z => { z.dps = v.dps; });
      playersOf(this).forEach(p => { if (p) { p.v7slowT = 0; p.v7slowMul = 1; } });
      if (v && panels.length && this.ui && this.ui.schedule) this.ui.schedule(2.4, () => this.ui.notify(BO.t('hz.' + key), v.color, 4));
    });
    return ok;
  };

  /* =============================== Weather =============================== */
  const WEATHER = {
    sand:      { base: 190 },
    ash:       { base: 110 },
    fireflies: { base: 38 },
    bubbles:   { base: 60 },
    void:      { base: 110 },
    fallout:   { base: 90 },
    petals:    { base: 55 },
    drips:     { base: 45 },
    fog:       { base: 12 }
  };

  function spawnW(kind, W, H, d) {
    const x = Math.random() * W, y = Math.random() * H, ph = Math.random() * 6;
    switch (kind) {
      case 'sand': return { x, y, vx: U.rand(700, 1100) * d, vy: U.rand(-40, 60) * d, len: U.rand(10, 28) * d, a: U.rand(0.08, 0.24), ph };
      case 'ash': return { x, y, vx: U.rand(-20, 20) * d, vy: U.rand(25, 60) * d, s: U.rand(1.5, 3.5) * d, a: U.rand(0.25, 0.6), ph };
      case 'fallout': return { x, y, vx: U.rand(-15, 15) * d, vy: U.rand(18, 45) * d, s: U.rand(2, 4) * d, a: U.rand(0.25, 0.55), ph };
      case 'fireflies': return { x, y, vx: U.rand(-15, 15) * d, vy: U.rand(-15, 15) * d, s: U.rand(2, 4) * d, a: U.rand(0.5, 1), ph };
      case 'bubbles': return { x, y, vx: U.rand(-6, 6) * d, vy: -U.rand(40, 110) * d, s: U.rand(2, 6) * d, a: U.rand(0.15, 0.4), ph };
      case 'void': return { x, y, vx: U.rand(-6, 6) * d, vy: U.rand(-6, 6) * d, s: U.rand(0.8, 2) * d, a: U.rand(0.2, 0.7), ph };
      case 'petals': return { x, y, vx: U.rand(30, 80) * d, vy: U.rand(30, 70) * d, s: U.rand(3, 6) * d, a: U.rand(0.35, 0.75), ph, rot: Math.random() * TAU };
      case 'drips': return { x, y, vx: 0, vy: U.rand(500, 800) * d, len: U.rand(8, 14) * d, a: U.rand(0.2, 0.4), ph };
      default: return { x, y, vx: U.rand(8, 20) * d, vy: U.rand(-4, 4) * d, s: U.rand(160, 320) * d, a: U.rand(0.03, 0.07), ph };
    }
  }

  function drawW(ctx, kind, list, d, W, H, dt) {
    if (kind === 'sand' || kind === 'drips') {
      ctx.globalCompositeOperation = kind === 'sand' ? 'source-over' : 'lighter';
      ctx.strokeStyle = kind === 'sand' ? 'rgb(225,190,130)' : 'rgb(170,210,160)';
      ctx.lineWidth = (kind === 'sand' ? 1.2 : 1) * d;
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass ? 0.28 : 0.14;
        ctx.beginPath();
        for (let i = pass; i < list.length; i += 2) {
          const w = list[i];
          if (kind === 'sand') { const k = w.len / w.vx; ctx.moveTo(w.x, w.y); ctx.lineTo(w.x - w.len, w.y - w.vy * k); }
          else { ctx.moveTo(w.x, w.y); ctx.lineTo(w.x, w.y - w.len); }
        }
        ctx.stroke();
      }
      if (kind === 'drips' && dt > 0 && Math.random() < 0.5) {
        ctx.globalAlpha = 0.16; ctx.lineWidth = 1 * d;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) { const sx = Math.random() * W, sy = Math.random() * H, sr = U.rand(2, 5) * d; ctx.moveTo(sx + sr, sy); ctx.ellipse(sx, sy, sr, sr * 0.45, 0, 0, TAU); }
        ctx.stroke();
      }
      return;
    }
    if (kind === 'ash') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#9a948c';
      for (let i = 0; i < list.length; i++) { const w = list[i]; ctx.globalAlpha = w.a; ctx.fillRect(w.x, w.y, w.s, w.s * 0.7); }
      return;
    }
    if (kind === 'void') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgb(220,230,255)';
      for (let i = 0; i < list.length; i++) { const w = list[i]; ctx.globalAlpha = U.clamp(w.a * (0.6 + Math.sin(w.ph * 2.3) * 0.4), 0, 1); ctx.fillRect(w.x, w.y, w.s, w.s); }
      return;
    }
    if (kind === 'bubbles') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgb(170,240,255)';
      ctx.lineWidth = 1 * d;
      for (let i = 0; i < list.length; i++) { const w = list[i]; ctx.globalAlpha = w.a; ctx.beginPath(); ctx.arc(w.x, w.y, w.s, 0, TAU); ctx.stroke(); }
      return;
    }
    if (kind === 'petals') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ff9ec0';
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        ctx.globalAlpha = w.a;
        ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.rot + w.ph * 1.3);
        ctx.beginPath(); ctx.ellipse(0, 0, w.s, w.s * 0.45 * (0.6 + Math.abs(Math.sin(w.ph * 2)) * 0.4), 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      return;
    }
    if (kind === 'fog') {
      ctx.globalCompositeOperation = 'source-over';
      const S = BO.softSprite('#8a8f9a');
      for (let i = 0; i < list.length; i++) { const w = list[i]; ctx.globalAlpha = w.a; ctx.drawImage(S, w.x - w.s, w.y - w.s * 0.6, w.s * 2, w.s * 1.2); }
      return;
    }
    // fireflies, fallout
    const color = kind === 'fireflies' ? '#d8ff6a' : '#c6ff3d';
    const S = BO.softSprite(color);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      const fl = kind === 'fireflies' ? 0.25 + Math.max(0, Math.sin(w.ph * 3)) * 0.75 : 0.6;
      ctx.globalAlpha = U.clamp(w.a * fl, 0, 1);
      ctx.drawImage(S, w.x - w.s * 1.5, w.y - w.s * 1.5, w.s * 3, w.s * 3);
    }
  }

  function storm(fx, dt) {
    if (!(dt > 0)) return;
    fx.v7bolt = (fx.v7bolt === undefined ? U.rand(2, 5) : fx.v7bolt) - dt;
    if (fx.v7bolt <= 0) {
      fx.v7bolt = U.rand(5, 12); fx.v7strike = 0.5;
      const g = BO.game;
      if (g && g.audio && g.audio.explosion && g.player && g.state === 'playing') U.safe('v7.thunder', () => g.audio.explosion(g.player.x + U.randSpread() * 1600, g.player.y + U.randSpread() * 1600, true));
    }
    if (fx.v7strike > 0) {
      fx.v7strike -= dt;
      const s = fx.v7strike;
      if (s > 0.4 || (s > 0.2 && s < 0.27)) { fx.flash = Math.max(fx.flash, 0.32); fx.flashColor = '#d8e4ff'; }
    }
  }

  const FX = BO.PostFX && BO.PostFX.prototype;
  if (FX && FX._weather) {
    const origW = FX._weather;
    FX._weather = function (ctx, kind, dt, W, H, game) {
      if (kind === 'storm') { origW.call(this, ctx, 'rain', dt, W, H, game); storm(this, dt); return; }
      const spec = WEATHER[kind];
      if (!spec) return origW.call(this, ctx, kind, dt, W, H, game);
      const d = this.r.dpr || 1;
      const area = (W / d) * (H / d) / (1920 * 1080);
      const target = Math.round(spec.base * (kind === 'fog' ? 1 : qualityMul()) * U.clamp(area, 0.4, 1.6));
      if (this.weatherKind !== kind) { this.weather.length = 0; this.weatherKind = kind; this.lastCamX = null; }
      while (this.weather.length < target) this.weather.push(spawnW(kind, W, H, d));
      if (this.weather.length > target) this.weather.length = target;
      let dx = 0, dy = 0;
      const cam = game && game.camera;
      if (cam && U.isFiniteNumber(cam.x)) {
        const z = (cam.zoom || 1) * d;
        if (this.lastCamX !== null) { dx = (cam.x - this.lastCamX) * z; dy = (cam.y - this.lastCamY) * z; }
        this.lastCamX = cam.x; this.lastCamY = cam.y;
        if (Math.abs(dx) > W * 0.5 || Math.abs(dy) > H * 0.5) { dx = 0; dy = 0; }
      }
      const pad = (kind === 'fog' ? 340 : 40) * d;
      const list = this.weather;
      const sway = kind === 'ash' || kind === 'fallout' || kind === 'petals' || kind === 'bubbles' || kind === 'fireflies';
      const par = kind === 'fog' ? 0.6 : 1;
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        w.x += w.vx * dt - dx * par; w.y += w.vy * dt - dy * par;
        w.ph += dt;
        if (sway) w.x += Math.sin(w.ph * 1.7) * 14 * d * dt;
        if (kind === 'fireflies') w.y += Math.cos(w.ph * 1.3) * 10 * d * dt;
        if (w.x < -pad) w.x += W + pad * 2; else if (w.x > W + pad) w.x -= W + pad * 2;
        if (w.y < -pad) w.y += H + pad * 2; else if (w.y > H + pad) w.y -= H + pad * 2;
      }
      drawW(ctx, kind, list, d, W, H, dt);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
  }

  /* ============================ Static decor ============================ */
  function decorate(c, level) {
    const th = level.theme, kind = th.decor;
    const g = c.getContext('2d');
    const map = level.map;
    const rng = U.makeRng((level.seed || 1) + 7777);
    const W = map.w, H = map.h;
    const solid = (x, y) => !map.inBounds(x, y) || map.tiles[map.idx(x, y)] === T.SOLID;
    const floor = (x, y) => map.inBounds(x, y) && map.tiles[map.idx(x, y)] !== T.SOLID;
    const room = (x, y) => map.inBounds(x, y) && map.roomId[map.idx(x, y)] >= 0 && map.tiles[map.idx(x, y)] === T.FLOOR;
    const touchesFloor = (x, y) => {
      for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (floor(xx, yy)) return true;
      return false;
    };
    const R = (a, b) => a + rng() * (b - a);
    const blob = (x, y, rw, rh, color) => { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, rw, rh, rng() * Math.PI, 0, TAU); g.fill(); };
    const softBlob = (x, y, r, rgb, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    };
    const crack = (x, y, len, color, width) => {
      g.strokeStyle = color; g.lineWidth = width;
      g.beginPath(); g.moveTo(x, y);
      let a = rng() * TAU, px = x, py = y;
      for (let s = 0; s < 5; s++) { a += R(-0.8, 0.8); px += Math.cos(a) * len / 5; py += Math.sin(a) * len / 5; g.lineTo(px, py); }
      g.stroke();
    };
    g.save();

    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const x = tx * TILE, y = ty * TILE, cx = x + TILE / 2, cy = y + TILE / 2;
      const isFloor = floor(tx, ty), isRoom = room(tx, ty);
      const wallAbove = isFloor && solid(tx, ty - 1);
      if (!isFloor) {
        const edge = touchesFloor(tx, ty);
        if (kind === 'space' && !edge && map.inBounds(tx, ty)) {
          g.fillStyle = '#03040a'; g.fillRect(x, y, TILE, TILE);
          for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(220,230,255,' + R(0.2, 0.8).toFixed(2) + ')'; const s = rng() < 0.1 ? 2 : 1; g.fillRect(x + rng() * TILE, y + rng() * TILE, s, s); }
        } else if (edge && floor(tx, ty + 1)) {
          // Feature set into the wall face just above a floor tile.
          const roll = rng();
          if (kind === 'water' && roll < 0.07) {
            g.fillStyle = '#06141c'; g.beginPath(); g.arc(cx, y + TILE * 0.55, TILE * 0.26, 0, TAU); g.fill();
            g.strokeStyle = 'rgba(0,229,209,0.55)'; g.lineWidth = 2; g.stroke();
            softBlob(cx, y + TILE * 0.55, TILE * 0.22, '60,200,255', 0.25);
          } else if (kind === 'space' && roll < 0.08) {
            g.fillStyle = '#02030a'; g.fillRect(x + 6, y + 10, TILE - 12, TILE - 22);
            for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(230,236,255,0.8)'; g.fillRect(x + 8 + rng() * (TILE - 16), y + 12 + rng() * (TILE - 26), 1, 1); }
            g.strokeStyle = 'rgba(232,240,255,0.35)'; g.lineWidth = 1; g.strokeRect(x + 6.5, y + 10.5, TILE - 13, TILE - 23);
          } else if (kind === 'lava' && roll < 0.06) {
            crack(cx, y + TILE * 0.3, TILE * 0.8, 'rgba(255,110,30,0.6)', 1.6);
          } else if (kind === 'jungle' && roll < 0.35) {
            g.strokeStyle = 'rgba(70,140,50,0.55)'; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(x + rng() * TILE, y + TILE * 0.2);
            const vx = x + rng() * TILE;
            g.quadraticCurveTo(vx + R(-12, 12), y + TILE * 0.8, vx, y + TILE + R(8, 26)); g.stroke();
            g.fillStyle = 'rgba(90,170,60,0.5)';
            for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(vx + R(-8, 8), y + TILE * R(0.5, 1.4), 4, 2, rng() * TAU, 0, TAU); g.fill(); }
          } else if (kind === 'shrine' && roll < 0.06) {
            softBlob(cx, y + TILE * 0.7, TILE * 0.5, '255,77,109', 0.22);
            g.fillStyle = '#ff4d6d'; g.beginPath(); g.ellipse(cx, y + TILE * 0.7, 5, 7, 0, 0, TAU); g.fill();
          } else if (kind === 'crypt' && roll < 0.08) {
            softBlob(cx, y + TILE * 0.9, TILE * 0.55, '255,190,90', 0.18);
            g.fillStyle = '#e8dcc0'; g.fillRect(cx - 1.5, y + TILE * 0.72, 3, 7);
            g.fillStyle = '#ffcf6b'; g.beginPath(); g.arc(cx, y + TILE * 0.7, 2, 0, TAU); g.fill();
          }
        }
        continue;
      }

      switch (kind) {
        case 'sand':
          if (wallAbove) { const gr = g.createLinearGradient(0, y, 0, y + 22); gr.addColorStop(0, 'rgba(230,190,120,0.2)'); gr.addColorStop(1, 'rgba(230,190,120,0)'); g.fillStyle = gr; g.fillRect(x, y, TILE, 22); }
          if (rng() < 0.12) blob(cx, cy, R(18, 40), R(8, 16), 'rgba(230,190,120,0.08)');
          if (rng() < 0.08) { g.strokeStyle = 'rgba(255,220,160,0.07)'; g.lineWidth = 1.2; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx, cy + k * 6, 16 + k * 4, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); } }
          break;
        case 'jungle':
          if (solid(tx - 1, ty) || solid(tx + 1, ty) || wallAbove || solid(tx, ty + 1)) { if (rng() < 0.6) softBlob(cx + R(-10, 10), cy + R(-10, 10), R(16, 30), '70,140,50', 0.16); }
          else if (rng() < 0.05) blob(cx, cy, R(10, 22), R(6, 12), 'rgba(40,80,30,0.25)');
          if (isRoom && rng() < 0.03) crack(cx, cy, R(30, 60), 'rgba(60,44,28,0.45)', 2.2);
          break;
        case 'water':
          if (isRoom && rng() < 0.16) {
            g.strokeStyle = 'rgba(80,220,255,0.06)'; g.lineWidth = 1.4;
            g.beginPath(); const ox = x + rng() * TILE, oy = y + rng() * TILE;
            g.moveTo(ox, oy); g.bezierCurveTo(ox + 10, oy - 8, ox + 18, oy + 8, ox + 28, oy); g.bezierCurveTo(ox + 34, oy - 6, ox + 22, oy + 14, ox + 8, oy + 12); g.stroke();
          }
          if (rng() < 0.04) blob(cx, cy, R(14, 34), R(8, 16), 'rgba(40,160,180,0.08)');
          break;
        case 'lava':
          if (rng() < 0.06) { crack(x + rng() * TILE, y + rng() * TILE, R(20, 50), 'rgba(255,90,26,0.12)', 5); crack(x + rng() * TILE, y + rng() * TILE, R(20, 50), 'rgba(255,140,60,0.4)', 1.4); }
          if (rng() < 0.05) softBlob(cx, cy, R(18, 34), '0,0,0', 0.4);
          break;
        case 'space':
          if (isRoom) { g.strokeStyle = 'rgba(232,240,255,0.035)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1); }
          else if ((tx + ty) % 2 === 0) { g.fillStyle = 'rgba(255,211,77,0.05)'; g.fillRect(x + 4, y + 4, TILE - 8, 3); }
          if (isRoom && rng() < 0.02) { g.fillStyle = 'rgba(159,184,255,0.18)'; g.fillRect(x + 8, y + 8, TILE - 16, TILE - 16); }
          break;
        case 'fallout':
          if (rng() < 0.08) crack(x + rng() * TILE, y + rng() * TILE, R(20, 46), 'rgba(0,0,0,0.4)', 1.4);
          if (rng() < 0.06) { g.fillStyle = 'rgba(110,110,96,0.35)'; for (let k = 0; k < 4; k++) g.fillRect(x + rng() * TILE, y + rng() * TILE, R(2, 6), R(2, 5)); }
          if (rng() < 0.03) softBlob(cx, cy, R(16, 30), '170,255,60', 0.09);
          if (isRoom && rng() < 0.006) {
            g.fillStyle = 'rgba(255,211,77,0.14)'; g.beginPath(); g.arc(cx, cy, 14, 0, TAU); g.fill();
            g.fillStyle = 'rgba(20,20,10,0.35)';
            for (let k = 0; k < 3; k++) { const a = k * TAU / 3 - Math.PI / 2; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 12, a - 0.5, a + 0.5); g.closePath(); g.fill(); }
          }
          break;
        case 'shrine':
          if (isRoom) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y + TILE / 2 - 1, TILE, 2); if ((tx + ty) % 3 === 0) g.fillRect(x + TILE / 2, y, 1, TILE / 2); }
          if (rng() < 0.22) { g.fillStyle = 'rgba(255,150,190,0.3)'; g.beginPath(); g.ellipse(x + rng() * TILE, y + rng() * TILE, 3, 1.6, rng() * TAU, 0, TAU); g.fill(); }
          break;
        case 'sewer':
          if (!isRoom) { g.fillStyle = 'rgba(60,90,40,0.22)'; g.fillRect(x + TILE * 0.25, y, TILE * 0.5, TILE); g.fillStyle = 'rgba(160,220,90,0.04)'; g.fillRect(x + TILE * 0.25, y + (ty % 2) * TILE / 2, TILE * 0.5, 2); }
          if ((solid(tx - 1, ty) || solid(tx + 1, ty) || wallAbove) && rng() < 0.4) softBlob(cx + R(-12, 12), cy + R(-12, 12), R(10, 22), '120,160,60', 0.14);
          break;
        case 'crypt':
          g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          if (rng() < 0.035) {
            g.strokeStyle = 'rgba(232,220,192,0.3)'; g.lineWidth = 2.2; g.lineCap = 'round';
            const bx = x + rng() * TILE, by = y + rng() * TILE, a = rng() * Math.PI;
            g.beginPath(); g.moveTo(bx - Math.cos(a) * 7, by - Math.sin(a) * 7); g.lineTo(bx + Math.cos(a) * 7, by + Math.sin(a) * 7); g.stroke();
            if (rng() < 0.3) { g.fillStyle = 'rgba(232,220,192,0.28)'; g.beginPath(); g.arc(bx + 10, by + 4, 4, 0, TAU); g.fill(); }
          }
          if (rng() < 0.04) crack(x + rng() * TILE, y + rng() * TILE, R(16, 36), 'rgba(0,0,0,0.4)', 1);
          break;
        case 'rig':
          if (isRoom) {
            g.fillStyle = 'rgba(255,255,255,0.035)';
            for (let py = 4; py < TILE; py += 10) for (let px = (py % 20 ? 4 : 9); px < TILE; px += 10) { g.save(); g.translate(x + px, y + py); g.rotate(0.7); g.fillRect(-3, -0.8, 6, 1.6); g.restore(); }
          } else if (room(tx - 1, ty) || room(tx + 1, ty) || room(tx, ty - 1) || room(tx, ty + 1)) {
            g.save(); g.beginPath(); g.rect(x, y, TILE, TILE); g.clip();
            for (let k = -TILE; k < TILE * 2; k += 14) { g.fillStyle = 'rgba(255,211,77,0.12)'; g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + 7, y); g.lineTo(x + k + 7 - TILE, y + TILE); g.lineTo(x + k - TILE, y + TILE); g.closePath(); g.fill(); }
            g.restore();
          }
          if (rng() < 0.03) blob(cx, cy, R(12, 30), R(6, 14), 'rgba(90,130,170,0.1)');
          break;
      }
    }
    g.restore();
  }

  const RP = BO.Renderer.prototype;
  const origBuild = RP.buildStaticLayer;
  RP.buildStaticLayer = function (level) {
    const c = origBuild.call(this, level);
    if (c && level && level.theme && level.theme.decor) U.safe('v7.decor', () => decorate(c, level));
    return c;
  };

  /* ------------------------------ Strings ----------------------------- */
  BO.I18N.extend('en', {
    'hz.sand': 'QUICKSAND: SINKHOLES SLOW YOU DOWN',
    'hz.acid': 'ACID POOLS: CAUSTIC & LETHAL',
    'hz.fire': 'LAVA: BURNS & SPREADS TO FLESH',
    'hz.cryo': 'CRYO LEAKS: SLOW + CHILL',
    'hz.steam': 'STEAM VENTS: SCORCHING PRESSURE',
    'hz.radiation': 'RADIATION: UNSEEN & LETHAL',
    'hz.spirit': 'SPIRIT WARDS: SUPERNATURAL HARM'
  });
  BO.I18N.extend('fa', {
    'hz.sand': 'شن‌گرد: سینک‌هال سرعت را کم می‌کند',
    'hz.acid': 'استخر اسید: خورنده و کشنده',
    'hz.fire': 'گدازه: می‌سوزاند و منتشر می‌شود',
    'hz.cryo': 'نشتی یخ: کند و سرد می‌کند',
    'hz.steam': 'تنفس بخار: فشار حرارتی',
    'hz.radiation': 'تابش: نامرئی و کشنده',
    'hz.spirit': 'نگهبان روحانی: صدمه فراطبیعی'
  });
})(window.BO);