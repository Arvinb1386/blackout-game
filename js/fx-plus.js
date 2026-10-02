/* =========================================================================
 * BLACKOUT :: fx-plus.js
 * Effects overhaul (v3), layered on particles.js:
 *  - new particle shapes: star flares, glowing streak sparks, flickering
 *    embers, volumetric smoke puffs, colour-cooling fireballs, electric
 *    arcs, double-stroke shockwaves and lit debris chips
 *  - rebuilt emitters: muzzle flash, sparks, impacts, hits, deaths,
 *    explosions, pickups, footstep dust
 *  - better decals: cracked bullet holes, streaked scorch marks with embers
 *    that keep glowing through the dark for a few seconds
 *  - red damage flash on the post stack
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const PSys = BO.ParticleSystem;
  if (!PSys) return;
  const PS = PSys.prototype;
  const SH = BO.PARTICLE_SHAPE;
  const LAYER = BO.PARTICLE_LAYER;
  Object.assign(SH, { FLARE: 7, STREAK: 8, EMBER: 9, PUFF: 10, ARC: 11, FIRE: 12, SHOCK: 13, CHIP: 14 });
  const TAU = U.TAU;
  const rnd = U.rand;
  const now = () => performance.now() / 1000;

  /* ---------------------------- Sprites ---------------------------- */
  const cache = Object.create(null);

  function flareSprite(color) {
    const key = 'f' + color;
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 44);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, U.rgba(color, 0.9));
    gr.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, 44, 0, TAU); g.fill();
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate(i / 6 * TAU + (i % 2 ? 0.12 : 0));
      const len = i % 2 ? 40 : 63;
      const rg = g.createLinearGradient(0, 0, len, 0);
      rg.addColorStop(0, 'rgba(255,255,255,0.95)');
      rg.addColorStop(0.4, U.rgba(color, 0.7));
      rg.addColorStop(1, U.rgba(color, 0));
      g.fillStyle = rg;
      g.beginPath(); g.moveTo(0, -4); g.lineTo(len, 0); g.lineTo(0, 4); g.closePath(); g.fill();
      g.restore();
    }
    cache[key] = c;
    return c;
  }

  function puffBase(v) {
    const key = 'p' + v;
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    const rng = U.makeRng(v * 7919 + 13);
    for (let i = 0; i < 16; i++) {
      const a = rng() * TAU, d = Math.pow(rng(), 0.7) * 22;
      const x = 48 + Math.cos(a) * d, y = 48 + Math.sin(a) * d, r = 10 + rng() * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.24)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    cache[key] = c;
    return c;
  }

  function puffSprite(v, color) {
    const key = 'p' + v + color;
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.drawImage(puffBase(v), 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, 96, 96);
    cache[key] = c;
    return c;
  }

  const FIRE_PAL = ['#fff4d6', '#ffc061', '#ff7a1f', '#b8360f'];

  /* ------------------------ Spawn + render ------------------------ */
  const origSpawn = PS.spawn;
  PS.spawn = function (x, y, vx, vy, life, size, size1, color, shape, opts) {
    const p = origSpawn.call(this, x, y, vx, vy, life, size, size1, color, shape, opts);
    if (p) { p.stretch = 1; p.v = (Math.random() * 4) | 0; }
    return p;
  };

  PS.render = function (ctx, rect, layer, additive) {
    const items = this.pool.items;
    const tnow = now();
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active || p.layer !== layer || p.additive !== additive) continue;
      if (p.x < rect.x0 || p.x > rect.x1 || p.y < rect.y0 || p.y > rect.y1) continue;
      const t = 1 - p.life / p.max;
      const size = p.size + (p.size1 - p.size) * t;
      let a;
      if (p.shape === SH.CASING || p.shape === SH.CHIP) a = p.alpha * Math.min(1, p.life * 2);
      else if (p.shape === SH.PUFF) a = p.alpha * Math.min(1, t * 8) * Math.pow(1 - t, 1.3);
      else if (p.shape === SH.FIRE) a = p.alpha * Math.pow(1 - t, 0.8);
      else a = p.alpha * (1 - t);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      switch (p.shape) {
        case SH.SPARK: {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
          break;
        }
        case SH.STREAK: {
          const k = 0.04;
          ctx.lineCap = 'round';
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = a * 0.45;
          ctx.lineWidth = size * 2.6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k); ctx.stroke();
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#fffaf0';
          ctx.lineWidth = Math.max(0.6, size * 0.7);
          ctx.stroke();
          break;
        }
        case SH.SHARD:
        case SH.CASING: {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          if (p.shape === SH.CASING) {
            ctx.fillRect(-size * 0.5, -size * 0.25, size, size * 0.5);
            ctx.fillStyle = 'rgba(255,255,230,0.55)';
            ctx.fillRect(-size * 0.5, -size * 0.25, size, size * 0.15);
          } else ctx.fillRect(-size / 2, -size / 2, size, size * 0.6);
          ctx.restore();
          break;
        }
        case SH.CHIP: {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.moveTo(-size * 0.6, -size * 0.3); ctx.lineTo(size * 0.5, -size * 0.45); ctx.lineTo(size * 0.6, size * 0.35); ctx.lineTo(-size * 0.3, size * 0.45); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(-size * 0.5, -size * 0.35, size * 0.9, size * 0.18);
          ctx.restore();
          break;
        }
        case SH.SMOKE:
        case SH.GLOW: {
          ctx.drawImage(BO.softSprite(p.color), p.x - size, p.y - size, size * 2, size * 2);
          break;
        }
        case SH.EMBER: {
          ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(tnow * 22 + p.rot * 10));
          ctx.drawImage(BO.softSprite(p.color), p.x - size * 2, p.y - size * 2, size * 4, size * 4);
          if (size > 1.4) { ctx.fillStyle = '#fff6dc'; ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2); }
          break;
        }
        case SH.FLARE: {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.stretch || 1, 1);
          ctx.drawImage(flareSprite(p.color), -size, -size, size * 2, size * 2);
          ctx.restore();
          break;
        }
        case SH.PUFF: {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.drawImage(puffSprite(p.v || 0, p.color), -size, -size, size * 2, size * 2);
          ctx.restore();
          break;
        }
        case SH.FIRE: {
          const idx = Math.min(FIRE_PAL.length - 1, Math.floor(t * FIRE_PAL.length));
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.drawImage(puffSprite(p.v || 0, FIRE_PAL[idx]), -size, -size, size * 2, size * 2);
          ctx.restore();
          if (t < 0.35) { ctx.globalAlpha = a * (1 - t / 0.35) * 0.7; ctx.drawImage(BO.softSprite('#ffe9b8'), p.x - size * 0.6, p.y - size * 0.6, size * 1.2, size * 1.2); }
          break;
        }
        case SH.ARC: {
          const segs = 5, len = size;
          const ca = Math.cos(p.rot), sa = Math.sin(p.rot);
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          for (let s = 1; s <= segs; s++) {
            const d = len * s / segs, j = s === segs ? 0 : (Math.random() * 2 - 1) * len * 0.22;
            ctx.lineTo(p.x + ca * d - sa * j, p.y + sa * d + ca * j);
          }
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = p.color; ctx.globalAlpha = a * 0.4; ctx.lineWidth = 3.2; ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = a; ctx.lineWidth = 1; ctx.stroke();
          break;
        }
        case SH.SHOCK: {
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = a * 0.3;
          ctx.lineWidth = Math.max(1, 16 * (1 - t));
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TAU); ctx.stroke();
          ctx.globalAlpha = a;
          ctx.lineWidth = Math.max(1, 3 * (1 - t));
          ctx.stroke();
          break;
        }
        case SH.RING: {
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = a * 0.35;
          ctx.lineWidth = Math.max(1, 9 * (1 - t));
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TAU); ctx.stroke();
          ctx.globalAlpha = a;
          ctx.lineWidth = Math.max(1, 3 * (1 - t));
          ctx.stroke();
          break;
        }
        default: {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  };

  /* ---------------------------- Emitters ---------------------------- */
  PS.muzzleFlash = function (x, y, angle, scale, color) {
    const s = scale, ca = Math.cos(angle), sa = Math.sin(angle);
    let p = this.spawn(x + ca * 5 * s, y + sa * 5 * s, 0, 0, 0.055, 15 * s, 9 * s, color, SH.FLARE, { additive: true, drag: 0, rot: angle });
    if (p) p.stretch = 1.9;
    this.spawn(x, y, 0, 0, 0.04, 8 * s, 3 * s, '#fff6e0', SH.FLARE, { additive: true, drag: 0, rot: angle + Math.PI / 4 + U.randSpread() * 0.3 });
    this.spawn(x, y, 0, 0, 0.08, 26 * s, 8, color, SH.GLOW, { additive: true, drag: 0 });
    // Side vents.
    for (let k = -1; k <= 1; k += 2) {
      p = this.spawn(x + ca * 3, y + sa * 3, 0, 0, 0.04, 6 * s, 2, color, SH.FLARE, { additive: true, drag: 0, rot: angle + k * 1.3 });
      if (p) p.stretch = 1.6;
    }
    const n = this.count(6 * s);
    for (let i = 0; i < n; i++) {
      const a = angle + U.randSpread() * 0.35, sp = rnd(450, 950) * s;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.04, 0.1), rnd(0.9, 1.6), 0.4, '#ffe2a8', SH.STREAK, { additive: true, drag: 10 });
    }
    const m = this.count(3);
    for (let i = 0; i < m; i++) {
      const sp = rnd(40, 120), j = U.randSpread() * 30;
      this.spawn(x, y, ca * sp - sa * j, sa * sp + ca * j, rnd(0.5, 0.9), 4 * s, rnd(16, 26) * s, '#8a8d99', SH.PUFF, { alpha: 0.2, drag: 2.5, vrot: rnd(-1.5, 1.5) });
    }
  };

  PS.sparks = function (x, y, normalAngle, n, color, speed) {
    const c = this.count(n);
    for (let i = 0; i < c; i++) {
      const a = normalAngle + U.randSpread() * 1.1, sp = rnd(140, speed || 520);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.12, 0.4), rnd(0.8, 1.6), 0.3, color, SH.STREAK, { additive: true, drag: 4.5, grav: 380 });
    }
    const e = this.count(Math.ceil(n / 3));
    for (let i = 0; i < e; i++) {
      const a = normalAngle + U.randSpread() * 1.4, sp = rnd(40, 160);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.3, 0.8), rnd(1, 1.8), 0.4, color, SH.EMBER, { additive: true, drag: 3, grav: 120 });
    }
    this.spawn(x, y, 0, 0, 0.06, 10, 3, color, SH.GLOW, { additive: true, drag: 0 });
  };

  PS.impactDust = function (x, y, normalAngle, color) {
    const c = this.count(3);
    for (let i = 0; i < c; i++) {
      const a = normalAngle + U.randSpread() * 0.8, sp = rnd(20, 100);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.45, 0.9), rnd(3, 5), rnd(12, 18), color || '#7a7e8e', SH.PUFF, { alpha: 0.32, drag: 3, vrot: rnd(-2, 2) });
    }
    const k = this.count(3);
    for (let i = 0; i < k; i++) {
      const a = normalAngle + U.randSpread() * 1.2, sp = rnd(90, 260);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.5, 1.1), rnd(1.6, 2.8), rnd(1.4, 2.4), '#5d606c', SH.CHIP, { drag: 5, vrot: rnd(-20, 20), layer: LAYER.FLOOR });
    }
  };

  PS.hitEffect = function (x, y, angle, color, crit) {
    const c = this.count(crit ? 12 : 7);
    for (let i = 0; i < c; i++) {
      const a = angle + U.randSpread() * 0.9, sp = rnd(160, crit ? 560 : 400);
      if (i % 3 === 0) this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.18, 0.36), rnd(1.6, 3), 0.5, color, SH.SHARD, { additive: true, drag: 6, vrot: rnd(-14, 14) });
      else this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.1, 0.24), rnd(0.9, 1.5), 0.3, color, SH.STREAK, { additive: true, drag: 6 });
    }
    const arcs = crit ? 3 : 2;
    for (let i = 0; i < arcs; i++) this.spawn(x, y, 0, 0, rnd(0.06, 0.12), rnd(12, 22), rnd(8, 14), color, SH.ARC, { additive: true, drag: 0, rot: angle + U.randSpread() * 1.6 });
    this.spawn(x, y, 0, 0, 0.1, crit ? 24 : 14, 3, color, SH.GLOW, { additive: true });
    if (crit) {
      this.spawn(x, y, 0, 0, 0.09, 18, 8, '#ffffff', SH.FLARE, { additive: true, drag: 0 });
      this.spawn(x, y, 0, 0, 0.22, 4, 30, color, SH.SHOCK, { additive: true, drag: 0 });
    }
  };

  PS.smoke = function (x, y, n, color, spread) {
    const c = this.count(n);
    for (let i = 0; i < c; i++) {
      const a = Math.random() * TAU, sp = rnd(10, spread || 60);
      this.spawn(x + U.randSpread() * 10, y + U.randSpread() * 10, Math.cos(a) * sp, Math.sin(a) * sp, rnd(1.2, 2.6), rnd(10, 16), rnd(40, 60), color || '#3a3d4c', SH.PUFF, { alpha: 0.38, drag: 1.2, vrot: rnd(-0.8, 0.8) });
    }
  };

  PS.debris = function (x, y, color, n, speed) {
    const c = this.count(n);
    for (let i = 0; i < c; i++) {
      const a = Math.random() * TAU, sp = rnd(80, speed || 380);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.8, 1.8), rnd(2.5, 6), rnd(2.2, 4.5), color, SH.CHIP, { drag: 3.5, vrot: rnd(-14, 14), layer: LAYER.FLOOR });
    }
  };

  PS.explosion = function (x, y, radius) {
    const k = radius / 120;
    this.spawn(x, y, 0, 0, 0.12, radius * 0.9, radius * 1.6, '#fff1c9', SH.GLOW, { additive: true, drag: 0 });
    this.spawn(x, y, 0, 0, 0.14, radius * 0.9, radius * 1.3, '#ffd28a', SH.FLARE, { additive: true, drag: 0 });
    this.spawn(x, y, 0, 0, 0.5, radius * 0.15, radius * 1.5, '#ffd9a0', SH.SHOCK, { additive: true, drag: 0 });
    this.spawn(x, y, 0, 0, 0.25, radius * 0.1, radius * 0.95, '#ffffff', SH.SHOCK, { additive: true, drag: 0 });
    const fire = this.count(22 * k);
    for (let i = 0; i < fire; i++) {
      const a = Math.random() * TAU, sp = rnd(30, 260) * k;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.45, 0.95), rnd(14, 26) * k, rnd(30, 48) * k, '#ffb347', SH.FIRE, { additive: true, drag: 3.2, vrot: rnd(-2, 2) });
    }
    const sp1 = this.count(30 * k);
    for (let i = 0; i < sp1; i++) {
      const a = Math.random() * TAU, sp = rnd(300, 1000) * k;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.2, 0.55), rnd(1, 2), 0.3, '#ffcf6b', SH.STREAK, { additive: true, drag: 3.5, grav: 300 });
    }
    const emb = this.count(18 * k);
    for (let i = 0; i < emb; i++) {
      const a = Math.random() * TAU, sp = rnd(40, 240) * k;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(1, 2.4), rnd(1.4, 2.8), 0.6, U.pick(['#ffb347', '#ff7a1a', '#ffd27a']), SH.EMBER, { additive: true, drag: 1.4, grav: -25 });
    }
    const sm = this.count(14 * k);
    for (let i = 0; i < sm; i++) {
      const a = Math.random() * TAU, sp = rnd(20, 140) * k;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(2, 4), rnd(16, 26) * k, rnd(60, 90) * k, '#2a2c36', SH.PUFF, { alpha: 0.45, drag: 1.6, vrot: rnd(-0.6, 0.6) });
    }
    const ring = this.count(16);
    for (let i = 0; i < ring; i++) {
      const a = i / ring * TAU, sp = 300 * k;
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.6, 1), 6 * k, 24 * k, '#5a5d68', SH.PUFF, { alpha: 0.28, drag: 3.2, layer: LAYER.FLOOR, vrot: rnd(-1, 1) });
    }
    this.debris(x, y, '#4a4c5a', 14 * k, 560 * k);
  };

  PS.deathEffect = function (x, y, color) {
    const c = this.count(20);
    for (let i = 0; i < c; i++) {
      const a = Math.random() * TAU, sp = rnd(60, 280);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.4, 0.9), rnd(2, 4), 0.5, i % 2 ? color : '#c9ccd8', SH.SHARD, { additive: i % 2 === 1, drag: 4, vrot: rnd(-10, 10) });
    }
    for (let i = 0; i < 4; i++) this.spawn(x, y, 0, 0, rnd(0.1, 0.22), rnd(18, 34), rnd(10, 20), color, SH.ARC, { additive: true, drag: 0, rot: Math.random() * TAU });
    const e = this.count(10);
    for (let i = 0; i < e; i++) {
      const a = Math.random() * TAU, sp = rnd(30, 120);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.7, 1.6), rnd(1.2, 2.2), 0.5, color, SH.EMBER, { additive: true, drag: 1.8 });
    }
    this.spawn(x, y, 0, 0, 0.45, 10, 70, color, SH.SHOCK, { additive: true, drag: 0 });
    this.spawn(x, y, 0, 0, 0.12, 30, 10, color, SH.GLOW, { additive: true, drag: 0 });
    this.smoke(x, y, 4, '#2a2c38', 40);
  };

  PS.pickupBurst = function (x, y, color) {
    this.spawn(x, y, 0, 0, 0.45, 6, 50, color, SH.SHOCK, { additive: true, drag: 0 });
    this.spawn(x, y, 0, 0, 0.18, 22, 10, color, SH.FLARE, { additive: true, drag: 0, rot: Math.random() * TAU });
    const c = this.count(14);
    for (let i = 0; i < c; i++) {
      const a = (i / c) * TAU, sp = rnd(120, 240);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.4, 0.7), rnd(1.2, 2), 0.5, color, SH.EMBER, { additive: true, drag: 5 });
    }
  };

  PS.dust = function (x, y, n) {
    const c = this.count(n);
    for (let i = 0; i < c; i++) {
      this.spawn(x + U.randSpread() * 8, y + U.randSpread() * 8, U.randSpread() * 40, U.randSpread() * 40, rnd(0.4, 0.8), 3, rnd(10, 16), '#5a5f70', SH.PUFF, { alpha: 0.22, drag: 3, layer: LAYER.FLOOR, vrot: rnd(-1, 1) });
    }
  };

  /* ----------------------------- Decals ----------------------------- */
  const origDecal = PS.addDecal;
  PS.addDecal = function (x, y, type, size) {
    const d = this.decals[this.decalHead];
    origDecal.call(this, x, y, type, size);
    d.t0 = now();
  };

  PS.renderDecals = function (ctx, rect) {
    for (let i = 0; i < this.decals.length; i++) {
      const d = this.decals[i];
      if (!d.active || d.x < rect.x0 || d.x > rect.x1 || d.y < rect.y0 || d.y > rect.y1) continue;
      if (d.type === 0) {
        ctx.strokeStyle = 'rgba(8,8,12,0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = d.rot + k * 1.7, l = d.size * (1.6 + (k % 2) * 1.2);
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + Math.cos(a) * l, d.y + Math.sin(a) * l);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(150,150,165,0.18)';
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size * 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(6,6,10,0.85)';
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(120,120,135,0.3)';
        ctx.beginPath(); ctx.arc(d.x - 0.6, d.y - 0.6, d.size * 0.45, 0, TAU); ctx.fill();
      } else {
        ctx.globalAlpha = 0.6;
        ctx.drawImage(BO.softSprite('#050507'), d.x - d.size, d.y - d.size, d.size * 2, d.size * 2);
        ctx.strokeStyle = 'rgba(5,5,8,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = d.rot + k * 0.63 + Math.sin(k * 3.1 + d.rot) * 0.2;
          const r0 = d.size * 0.4, r1 = d.size * (1.05 + Math.abs(Math.sin(k * 1.9 + d.rot)) * 0.5);
          ctx.moveTo(d.x + Math.cos(a) * r0, d.y + Math.sin(a) * r0);
          ctx.lineTo(d.x + Math.cos(a) * r1, d.y + Math.sin(a) * r1);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  };

  /** Fresh scorch marks keep smouldering above the darkness. */
  function drawEmbers(ctx, ps, rect) {
    const tn = now();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ps.decals.length; i++) {
      const d = ps.decals[i];
      if (!d.active || d.type !== 1 || !d.t0) continue;
      const age = tn - d.t0;
      if (age > 6 || d.x < rect.x0 || d.x > rect.x1 || d.y < rect.y0 || d.y > rect.y1) continue;
      const k = 1 - age / 6;
      ctx.globalAlpha = k * k * 0.35;
      ctx.drawImage(BO.softSprite('#ff5a14'), d.x - d.size * 0.8, d.y - d.size * 0.8, d.size * 1.6, d.size * 1.6);
      for (let e = 0; e < 7; e++) {
        const a = d.rot + e * 0.9, r = d.size * (0.2 + ((e * 37) % 10) / 14);
        const fl = 0.5 + 0.5 * Math.sin(tn * (6 + e) + e * 2.3);
        ctx.globalAlpha = k * fl * 0.9;
        ctx.drawImage(BO.softSprite('#ff9a3c'), d.x + Math.cos(a) * r - 3, d.y + Math.sin(a) * r - 3, 6, 6);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const R = BO.Renderer && BO.Renderer.prototype;
  if (R && R._drawColoredLights) {
    const origColored = R._drawColoredLights;
    R._drawColoredLights = function (ctx, game, rect, time) {
      origColored.call(this, ctx, game, rect, time);
      if (game && game.particles && game.particles.decals) U.safe('fx+.embers', () => drawEmbers(ctx, game.particles, rect));
    };
  }

  /* ------------------------- Damage flash ------------------------- */
  const G = BO.Game && BO.Game.prototype;
  if (G && G.onPlayerDamaged) {
    const origDamaged = G.onPlayerDamaged;
    G.onPlayerDamaged = function (amount, sx, sy) {
      origDamaged.call(this, amount, sx, sy);
      U.safe('fx+.hurt', () => {
        if (!this.renderer.getPostFX) return;
        const fx = this.renderer.getPostFX();
        fx.flash = Math.max(fx.flash, U.clamp(amount / 90, 0.06, 0.22));
        fx.flashColor = '#ff2a3a';
      });
    };
  }
})(window.BO);
