/* =========================================================================
 * BLACKOUT :: particles.js
 * Pooled particle system (sparks, smoke, debris, explosions, casings...),
 * persistent floor decals (bullet holes, scorch marks) and pooled floating
 * damage numbers / combat text.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const SHAPE = { DOT: 0, SPARK: 1, SHARD: 2, SMOKE: 3, RING: 4, CASING: 5, GLOW: 6 };
  const LAYER = { FLOOR: 0, AIR: 1 };
  const QUALITY = { low: { mult: 0.35, max: 450 }, medium: { mult: 0.7, max: 1000 }, high: { mult: 1, max: 2000 } };

  /** Cached soft radial sprites per colour, so smoke/glow never builds gradients per frame. */
  const spriteCache = Object.create(null);
  function softSprite(color) {
    let s = spriteCache[color];
    if (s) return s;
    s = document.createElement('canvas');
    s.width = s.height = 64;
    const g = s.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, U.rgba(color, 1));
    grad.addColorStop(0.4, U.rgba(color, 0.45));
    grad.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    spriteCache[color] = s;
    return s;
  }

  function makeParticle() {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, size1: 1, color: '#fff',
      alpha: 1, grav: 0, drag: 0, rot: 0, vrot: 0, shape: 0, additive: false, layer: 1 };
  }

  class ParticleSystem {
    constructor() {
      this.pool = new BO.Pool(makeParticle, 600, QUALITY.high.max);
      this.quality = QUALITY.high;
      this.decals = new Array(BO.CONFIG.MAX_DECALS);
      this.decalHead = 0;
      for (let i = 0; i < this.decals.length; i++) this.decals[i] = { active: false, x: 0, y: 0, type: 0, size: 0, rot: 0, alpha: 0 };
    }

    setQuality(level) {
      this.quality = QUALITY[level] || QUALITY.high;
      this.pool.setMaxSize(this.quality.max);
    }

    clear() {
      this.pool.releaseAll();
      for (let i = 0; i < this.decals.length; i++) this.decals[i].active = false;
    }

    count(n) { return Math.max(1, Math.round(n * this.quality.mult)); }

    spawn(x, y, vx, vy, life, size, size1, color, shape, opts) {
      const p = this.pool.acquire();
      if (!p) return null;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = p.max = life;
      p.size = size; p.size1 = size1;
      p.color = color; p.shape = shape;
      p.alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
      p.grav = opts && opts.grav ? opts.grav : 0;
      p.drag = opts && opts.drag !== undefined ? opts.drag : 2;
      p.rot = opts && opts.rot !== undefined ? opts.rot : Math.random() * U.TAU;
      p.vrot = opts && opts.vrot ? opts.vrot : 0;
      p.additive = !!(opts && opts.additive);
      p.layer = opts && opts.layer !== undefined ? opts.layer : LAYER.AIR;
      return p;
    }

    /* ----------------------------- Emitters ----------------------------- */
    muzzleFlash(x, y, angle, scale, color) {
      const n = this.count(5 * scale);
      for (let i = 0; i < n; i++) {
        const a = angle + U.randSpread() * 0.45;
        const sp = U.rand(250, 650) * scale;
        this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.05, 0.12), U.rand(1.5, 3) * scale, 0.5, color, SHAPE.SPARK, { additive: true, drag: 8 });
      }
      this.spawn(x, y, 0, 0, 0.06, 20 * scale, 6, color, SHAPE.GLOW, { additive: true, drag: 0 });
      this.spawn(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, Math.cos(angle) * 40, Math.sin(angle) * 40, 0.5, 5 * scale, 16 * scale, '#5a5d70', SHAPE.SMOKE, { alpha: 0.22, drag: 2 });
    }

    sparks(x, y, normalAngle, n, color, speed) {
      const c = this.count(n);
      for (let i = 0; i < c; i++) {
        const a = normalAngle + U.randSpread() * 1.1;
        const sp = U.rand(120, speed || 520);
        this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.12, 0.35), U.rand(1, 2.2), 0.3, color, SHAPE.SPARK, { additive: true, drag: 5, grav: 260 });
      }
    }

    impactDust(x, y, normalAngle, color) {
      const c = this.count(3);
      for (let i = 0; i < c; i++) {
        const a = normalAngle + U.randSpread() * 0.8;
        const sp = U.rand(20, 90);
        this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.35, 0.7), U.rand(3, 5), U.rand(9, 14), color || '#6b6f80', SHAPE.SMOKE, { alpha: 0.3, drag: 3 });
      }
    }

    /** Blood-free hit effect: energy shards and a bright pop. */
    hitEffect(x, y, angle, color, crit) {
      const c = this.count(crit ? 12 : 7);
      for (let i = 0; i < c; i++) {
        const a = angle + U.randSpread() * 0.9;
        const sp = U.rand(140, crit ? 520 : 380);
        this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.15, 0.32), U.rand(1.5, 3), 0.4, color, i % 3 === 0 ? SHAPE.SHARD : SHAPE.SPARK, { additive: true, drag: 6, vrot: U.rand(-12, 12) });
      }
      this.spawn(x, y, 0, 0, 0.1, crit ? 22 : 13, 2, color, SHAPE.GLOW, { additive: true });
    }

    smoke(x, y, n, color, spread) {
      const c = this.count(n);
      for (let i = 0; i < c; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(10, spread || 60);
        this.spawn(x + U.randSpread() * 10, y + U.randSpread() * 10, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.8, 1.8), U.rand(8, 14), U.rand(28, 46), color || '#3a3d4c', SHAPE.SMOKE, { alpha: 0.35, drag: 1.2 });
      }
    }

    debris(x, y, color, n, speed) {
      const c = this.count(n);
      for (let i = 0; i < c; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(80, speed || 380);
        this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.6, 1.4), U.rand(2.5, 6), U.rand(2, 4), color, SHAPE.SHARD, { drag: 3.5, vrot: U.rand(-14, 14), layer: LAYER.FLOOR });
      }
    }

    explosion(x, y, radius) {
      const k = radius / 120;
      this.spawn(x, y, 0, 0, 0.18, radius * 0.6, radius * 1.4, '#fff1c9', SHAPE.GLOW, { additive: true });
      this.spawn(x, y, 0, 0, 0.45, radius * 0.2, radius * 1.15, '#ff9a3c', SHAPE.RING, { additive: true, alpha: 0.9 });
      const fire = this.count(26 * k);
      for (let i = 0; i < fire; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(60, 340) * k;
        this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.25, 0.6), U.rand(10, 20) * k, U.rand(2, 6), U.pick(['#ffb347', '#ff7a1a', '#ffd27a']), SHAPE.GLOW, { additive: true, drag: 3.5 });
      }
      this.sparks(x, y, 0, 26 * k, '#ffcf6b', 900 * k);
      this.smoke(x, y, 16 * k, '#2c2e3a', 140 * k);
      this.debris(x, y, '#4a4c5a', 12 * k, 520 * k);
    }

    deathEffect(x, y, color) {
      const c = this.count(22);
      for (let i = 0; i < c; i++) {
        const a = Math.random() * U.TAU, sp = U.rand(60, 260);
        this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.4, 0.9), U.rand(2, 4), 0.5, i % 2 ? color : '#c9ccd8', SHAPE.SHARD, { additive: i % 2 === 1, drag: 4, vrot: U.rand(-10, 10) });
      }
      this.spawn(x, y, 0, 0, 0.4, 10, 60, color, SHAPE.RING, { additive: true });
      this.smoke(x, y, 5, '#2a2c38', 40);
    }

    pickupBurst(x, y, color) {
      this.spawn(x, y, 0, 0, 0.4, 6, 46, color, SHAPE.RING, { additive: true });
      const c = this.count(14);
      for (let i = 0; i < c; i++) {
        const a = (i / c) * U.TAU, sp = U.rand(120, 220);
        this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4, 2.5, 0.5, color, SHAPE.DOT, { additive: true, drag: 5 });
      }
    }

    shellCasing(x, y, angle, big) {
      const a = angle + Math.PI / 2 + U.randSpread() * 0.4;
      const sp = U.rand(90, 170);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 5, big ? 4 : 3, big ? 4 : 3, big ? '#c9a248' : '#d8b25a', SHAPE.CASING, { drag: 5, vrot: U.rand(-25, 25), layer: LAYER.FLOOR });
    }

    dust(x, y, n) {
      const c = this.count(n);
      for (let i = 0; i < c; i++) {
        this.spawn(x + U.randSpread() * 8, y + U.randSpread() * 8, U.randSpread() * 40, U.randSpread() * 40, U.rand(0.3, 0.6), 3, 10, '#555a6c', SHAPE.SMOKE, { alpha: 0.25, drag: 3, layer: LAYER.FLOOR });
      }
    }

    trail(x, y, color, size) {
      this.spawn(x, y, 0, 0, 0.25, size || 4, 0.5, color, SHAPE.GLOW, { additive: true, drag: 0 });
    }

    /* ------------------------------ Decals ------------------------------ */
    addDecal(x, y, type, size) {
      const d = this.decals[this.decalHead];
      this.decalHead = (this.decalHead + 1) % this.decals.length;
      d.active = true; d.x = x; d.y = y; d.type = type; d.size = size; d.rot = Math.random() * U.TAU; d.alpha = 1;
    }

    /* --------------------------- Update/Render -------------------------- */
    update(dt) {
      const items = this.pool.items;
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { this.pool.release(p); continue; }
        const damping = Math.max(0, 1 - p.drag * dt);
        p.vx *= damping; p.vy *= damping;
        p.vy += p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        if (p.vrot !== 0) p.vrot *= damping;
      }
    }

    renderDecals(ctx, rect) {
      for (let i = 0; i < this.decals.length; i++) {
        const d = this.decals[i];
        if (!d.active || d.x < rect.x0 || d.x > rect.x1 || d.y < rect.y0 || d.y > rect.y1) continue;
        if (d.type === 0) { // bullet hole
          ctx.fillStyle = 'rgba(8,8,12,0.75)';
          ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, U.TAU); ctx.fill();
          ctx.fillStyle = 'rgba(120,120,135,0.25)';
          ctx.beginPath(); ctx.arc(d.x - 0.6, d.y - 0.6, d.size * 0.5, 0, U.TAU); ctx.fill();
        } else { // scorch
          ctx.globalAlpha = 0.55;
          ctx.drawImage(softSprite('#050507'), d.x - d.size, d.y - d.size, d.size * 2, d.size * 2);
          ctx.globalAlpha = 1;
        }
      }
    }

    /** Draws one layer; additive particles are drawn in their own pass. */
    render(ctx, rect, layer, additive) {
      const items = this.pool.items;
      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        if (!p.active || p.layer !== layer || p.additive !== additive) continue;
        if (p.x < rect.x0 || p.x > rect.x1 || p.y < rect.y0 || p.y > rect.y1) continue;
        const t = 1 - p.life / p.max;
        const size = p.size + (p.size1 - p.size) * t;
        let a = p.alpha * (p.shape === SHAPE.CASING ? Math.min(1, p.life) : (1 - t));
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        switch (p.shape) {
          case SHAPE.SPARK: {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = size;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
            ctx.stroke();
            break;
          }
          case SHAPE.SHARD:
          case SHAPE.CASING: {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            if (p.shape === SHAPE.CASING) ctx.fillRect(-size * 0.5, -size * 0.25, size, size * 0.5);
            else ctx.fillRect(-size / 2, -size / 2, size, size * 0.6);
            ctx.restore();
            break;
          }
          case SHAPE.SMOKE:
          case SHAPE.GLOW: {
            ctx.drawImage(softSprite(p.color), p.x - size, p.y - size, size * 2, size * 2);
            break;
          }
          case SHAPE.RING: {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = Math.max(1, 4 * (1 - t));
            ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, U.TAU); ctx.stroke();
            break;
          }
          default: {
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, U.TAU); ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Pooled floating combat text (damage numbers, "HEADSHOT", XP...). */
  class FloatingTextSystem {
    constructor() {
      this.pool = new BO.Pool(() => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, text: '', color: '#fff', size: 16, pop: 0 }), 64, 160);
    }
    clear() { this.pool.releaseAll(); }
    spawn(x, y, text, color, size, life) {
      const f = this.pool.acquire();
      if (!f) return;
      f.x = x + U.randSpread() * 10; f.y = y;
      f.vx = U.randSpread() * 30; f.vy = -90;
      f.life = f.max = life || 0.9;
      f.text = text; f.color = color; f.size = size || 16; f.pop = 1;
    }
    update(dt) {
      const items = this.pool.items;
      for (let i = 0; i < items.length; i++) {
        const f = items[i];
        if (!f.active) continue;
        f.life -= dt;
        if (f.life <= 0) { this.pool.release(f); continue; }
        f.x += f.vx * dt; f.y += f.vy * dt;
        f.vy *= Math.max(0, 1 - 2.5 * dt);
        f.pop = Math.max(0, f.pop - dt * 6);
      }
    }
    render(ctx) {
      const items = this.pool.items;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (let i = 0; i < items.length; i++) {
        const f = items[i];
        if (!f.active) continue;
        const t = f.life / f.max;
        ctx.globalAlpha = Math.min(1, t * 2.5);
        ctx.font = BO.I18N.font(f.size * (1 + f.pop * 0.5), 700, 'display');
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(5,6,14,0.85)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  BO.PARTICLE_SHAPE = SHAPE;
  BO.PARTICLE_LAYER = LAYER;
  BO.softSprite = softSprite;
  BO.ParticleSystem = ParticleSystem;
  BO.FloatingTextSystem = FloatingTextSystem;
})(window.BO);
