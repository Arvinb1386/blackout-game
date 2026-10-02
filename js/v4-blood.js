/* =========================================================================
 * BLACKOUT :: v4-blood.js
 * Blood & gore layer:
 *  - ballistic droplets with pseudo height that arc, land and splat on the
 *    floor (round drops when slow, stretched sprays when fast)
 *  - exit-wound sprays along the bullet path and back-spatter toward you
 *  - wall splatter: blood that reaches a wall paints it, with drips that
 *    slowly run down south-facing wall faces
 *  - blood pools that spread under corpses, gibs on explosive kills
 *  - wounded enemies (and you) leave a drip trail
 *  - wet blood glistens, then dries darker over ~25 s
 * Toggle in Settings > BLOOD & GORE.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TAU = U.TAU;
  const TILE = BO.CONFIG.TILE;
  const T = BO.TILE_TYPE;
  const SH = BO.PARTICLE_SHAPE;
  const MAX_DROPS = 600;
  const MAX_SPLATS = 900;
  const VARIANTS = 8;
  const DRY_TIME = 25;
  const GRAVITY = 900;

  const on = () => !BO.V4 || BO.V4.setting('blood');

  /* ------------------------------ Sprites ------------------------------ */
  let SPRITES = null;

  function blobMask(seed, kind) {
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const rng = U.makeRng(seed);
    const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5;
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    if (kind === 0) {
      // Round splat: lumpy core + radiating satellites.
      for (let i = 0; i < 11; i++) {
        g.beginPath(); g.arc(64 + gauss() * 13, 64 + gauss() * 13, 7 + rng() * 15, 0, TAU); g.fill();
      }
      const n = 10 + Math.floor(rng() * 8);
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d0 = 18 + rng() * 10, d1 = 30 + rng() * 28, r = 1 + rng() * 3.6;
        g.lineWidth = r * 0.9;
        g.beginPath(); g.moveTo(64 + Math.cos(a) * d0, 64 + Math.sin(a) * d0); g.lineTo(64 + Math.cos(a) * d1, 64 + Math.sin(a) * d1); g.stroke();
        g.beginPath(); g.arc(64 + Math.cos(a) * d1, 64 + Math.sin(a) * d1, r, 0, TAU); g.fill();
      }
    } else {
      // Directional spray along +x (kind 1 floor spray, kind 2 wall splatter = wider + denser).
      const wide = kind === 2 ? 0.75 : 0.42;
      for (let i = 0; i < 7; i++) {
        g.beginPath(); g.arc(30 + rng() * 18, 64 + gauss() * 7, 5 + rng() * 9, 0, TAU); g.fill();
      }
      const n = kind === 2 ? 34 : 24;
      for (let i = 0; i < n; i++) {
        const a = gauss() * wide, d = 22 + Math.pow(rng(), 0.8) * 70, r = Math.max(0.7, (1 - d / 100) * (1.2 + rng() * 3.4));
        const x = 26 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
        g.lineWidth = r * 0.8;
        g.beginPath(); g.moveTo(26 + Math.cos(a) * d * 0.55, 64 + Math.sin(a) * d * 0.55); g.lineTo(x, y); g.stroke();
        g.beginPath(); g.ellipse(x, y, r * 1.6, r, a, 0, TAU); g.fill();
      }
    }
    return c;
  }

  function colourise(mask, wet) {
    const S = mask.width, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'source-in';
    const gr = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    if (wet) {
      gr.addColorStop(0, '#8e0f18'); gr.addColorStop(0.45, '#740a12'); gr.addColorStop(1, '#4f060b');
    } else {
      gr.addColorStop(0, '#4a070c'); gr.addColorStop(0.5, '#3a0509'); gr.addColorStop(1, '#260306');
    }
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    // Darker rim where blood pools at the edges.
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.5;
    g.filter = 'none';
    const rim = document.createElement('canvas');
    rim.width = rim.height = S;
    const rg = rim.getContext('2d');
    rg.drawImage(mask, 0, 0);
    rg.globalCompositeOperation = 'source-out';
    rg.fillStyle = '#000'; rg.fillRect(0, 0, S, S);
    g.shadowColor = 'rgba(10,0,0,0.9)'; g.shadowBlur = 5;
    g.drawImage(rim, 0, 0);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
    if (wet) {
      // Specular glint.
      g.globalCompositeOperation = 'source-atop';
      const hl = g.createRadialGradient(S * 0.42, S * 0.4, 0, S * 0.42, S * 0.4, S * 0.16);
      hl.addColorStop(0, 'rgba(255,190,190,0.35)'); hl.addColorStop(1, 'rgba(255,190,190,0)');
      g.fillStyle = hl; g.fillRect(0, 0, S, S);
    }
    return c;
  }

  function sprites() {
    if (SPRITES) return SPRITES;
    SPRITES = [[], [], []];
    for (let k = 0; k < 3; k++) for (let v = 0; v < VARIANTS; v++) {
      const m = blobMask(1000 + k * 97 + v * 31, k);
      SPRITES[k].push({ wet: colourise(m, true), dry: colourise(m, false) });
    }
    return SPRITES;
  }

  /* ------------------------------ System ------------------------------ */
  class BloodSystem {
    constructor(ps) {
      this.ps = ps;
      this.map = null;
      this.t = 0;
      this.hit = BO.Collision.makeHit();
      this.drops = [];
      for (let i = 0; i < MAX_DROPS; i++) this.drops.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 });
      this.dropHead = 0;
      this.splats = [];
      for (let i = 0; i < MAX_SPLATS; i++) this.splats.push({ active: false, x: 0, y: 0, size: 0, rot: 0, kind: 0, v: 0, born: 0, grow: 0, alpha: 1, sx: 1, drips: null });
      this.head = 0;
      this.activeDrops = 0;
    }

    clear() {
      for (let i = 0; i < this.drops.length; i++) this.drops[i].active = false;
      for (let i = 0; i < this.splats.length; i++) this.splats[i].active = false;
      this.activeDrops = 0;
    }

    count(n) { return this.ps && this.ps.count ? this.ps.count(n) : Math.round(n); }

    _drop() {
      for (let k = 0; k < this.drops.length; k++) {
        const d = this.drops[this.dropHead];
        this.dropHead = (this.dropHead + 1) % this.drops.length;
        if (!d.active) return d;
      }
      return null;
    }

    spray(x, y, angle, n, spread, sp0, sp1, z0) {
      const c = this.count(n);
      for (let i = 0; i < c; i++) {
        const d = this._drop();
        if (!d) return;
        const a = angle + U.randSpread() * spread, sp = U.rand(sp0, sp1);
        d.active = true;
        d.x = x; d.y = y; d.z = z0 === undefined ? U.rand(8, 16) : z0;
        d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp; d.vz = U.rand(20, 200);
        d.s = U.rand(1, 3.2);
      }
    }

    splat(x, y, size, rot, kind, opts) {
      const s = this.splats[this.head];
      this.head = (this.head + 1) % this.splats.length;
      s.active = true; s.x = x; s.y = y; s.size = size; s.rot = rot; s.kind = kind || 0;
      s.v = Math.floor(Math.random() * VARIANTS); s.born = this.t;
      s.grow = (opts && opts.grow) || 0; s.alpha = (opts && opts.alpha) || 0.95; s.sx = (opts && opts.sx) || 1;
      s.drips = (opts && opts.drips) || null;
      return s;
    }

    /** nx/ny is the wall normal (pointing out of the wall, into the room). */
    wallSplat(x, y, nx, ny, size) {
      const into = Math.atan2(-ny, -nx);
      let drips = null;
      if (ny > 0.5) {
        // South-facing wall face: blood runs down toward the floor.
        drips = [];
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) drips.push({ dx: U.randSpread() * size * 0.55, len: U.rand(6, 15), w: U.rand(1.2, 2.6), speed: U.rand(1.5, 4) });
      }
      this.splat(x - nx * 2 - Math.cos(into) * size * 0.25, y - ny * 2 - Math.sin(into) * size * 0.25, size, into + Math.PI, 2, { alpha: 0.95, drips });
    }

    update(dt) {
      this.t += dt;
      if (!this.activeDrops && !this._anyDrop()) return;
      const map = this.map;
      let n = 0;
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i];
        if (!d.active) continue;
        n++;
        d.vz -= GRAVITY * dt;
        d.z += d.vz * dt;
        const damp = Math.max(0, 1 - 0.8 * dt);
        d.vx *= damp; d.vy *= damp;
        const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
        if (map) {
          const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
          if (map.tile(tx, ty) === T.SOLID) {
            const ox = Math.floor(d.x / TILE), oy = Math.floor(d.y / TILE);
            let wnx = 0, wny = 0;
            if (tx !== ox && map.tile(tx, oy) === T.SOLID) wnx = tx > ox ? -1 : 1;
            else wny = ty > oy ? -1 : 1;
            const wx = wnx ? (wnx < 0 ? tx * TILE : (tx + 1) * TILE) : d.x;
            const wy = wny ? (wny < 0 ? ty * TILE : (ty + 1) * TILE) : d.y;
            if (Math.random() < 0.6) this.wallSplat(wx, wy, wnx, wny, d.s * U.rand(4, 7));
            d.active = false;
            continue;
          }
        }
        d.x = nx; d.y = ny;
        if (d.z <= 0) {
          const sp = Math.hypot(d.vx, d.vy);
          if (sp > 200) this.splat(d.x, d.y, d.s * U.rand(4.5, 7), Math.atan2(d.vy, d.vx), 1, { sx: 1 });
          else this.splat(d.x, d.y, d.s * U.rand(3, 5), Math.random() * TAU, 0);
          d.active = false;
        }
      }
      this.activeDrops = n;
    }

    _anyDrop() { for (let i = 0; i < this.drops.length; i++) if (this.drops[i].active) return true; return false; }

    render(ctx, rect) {
      const SP = sprites();
      const t = this.t;
      for (let i = 0; i < this.splats.length; i++) {
        const s = this.splats[i];
        if (!s.active) continue;
        const m = s.size * 1.2 + 20;
        if (s.x + m < rect.x0 || s.x - m > rect.x1 || s.y + m < rect.y0 || s.y - m > rect.y1) continue;
        const age = t - s.born;
        let size = s.size;
        if (s.grow) size *= U.easeOutCubic(U.clamp(age / s.grow, 0, 1));
        if (size < 0.8) continue;
        const spr = SP[s.kind][s.v];
        const wet = U.clamp(1 - age / DRY_TIME, 0, 1);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        if (s.sx !== 1) ctx.scale(s.sx, 1);
        ctx.globalAlpha = s.alpha;
        ctx.drawImage(spr.dry, -size, -size, size * 2, size * 2);
        if (wet > 0) { ctx.globalAlpha = s.alpha * wet; ctx.drawImage(spr.wet, -size, -size, size * 2, size * 2); }
        ctx.restore();
        if (s.drips) {
          ctx.globalAlpha = s.alpha * (0.6 + 0.4 * wet);
          ctx.strokeStyle = wet > 0.3 ? '#6a0910' : '#3a0509';
          ctx.lineCap = 'round';
          for (let k = 0; k < s.drips.length; k++) {
            const dr = s.drips[k];
            const len = Math.min(dr.len, age * dr.speed + 2);
            const x0 = s.x + dr.dx;
            ctx.lineWidth = dr.w;
            ctx.beginPath(); ctx.moveTo(x0, s.y - 4); ctx.lineTo(x0, s.y - 4 + len); ctx.stroke();
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath(); ctx.arc(x0, s.y - 4 + len, dr.w * 0.85, 0, TAU); ctx.fill();
          }
          ctx.lineCap = 'butt';
        }
      }
      ctx.globalAlpha = 1;
      // Airborne droplets (lifted by their height for a bit of depth).
      ctx.strokeStyle = '#7a0b12';
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass ? 3 : 1.8;
        ctx.beginPath();
        for (let i = 0; i < this.drops.length; i++) {
          const d = this.drops[i];
          if (!d.active || (d.s > 2.1) !== !!pass) continue;
          if (d.x < rect.x0 || d.x > rect.x1 || d.y < rect.y0 || d.y > rect.y1) continue;
          const y = d.y - d.z * 0.6;
          ctx.moveTo(d.x, y);
          ctx.lineTo(d.x - d.vx * 0.018, y - d.vy * 0.018 + d.vz * 0.01);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
  }
  BO.BloodSystem = BloodSystem;

  const PS = BO.ParticleSystem && BO.ParticleSystem.prototype;
  if (!PS) return;
  const bloodOf = (ps) => ps._blood || (ps._blood = new BloodSystem(ps));

  const origPSUpdate = PS.update;
  PS.update = function (dt) {
    origPSUpdate.call(this, dt);
    if (this._blood) U.safe('blood.update', () => this._blood.update(dt));
  };
  const origPSClear = PS.clear;
  PS.clear = function () {
    origPSClear.call(this);
    if (this._blood) this._blood.clear();
  };
  const origDecals = PS.renderDecals;
  PS.renderDecals = function (ctx, rect) {
    origDecals.call(this, ctx, rect);
    if (this._blood && on()) U.safe('blood.render', () => this._blood.render(ctx, rect));
  };

  /* ------------------------------- Hooks ------------------------------- */
  const G = BO.Game && BO.Game.prototype;
  if (!G) return;
  const bleeds = (e) => e && !e.isBoss && !(e.def && e.def.noBlood);
  const bulletDir = (info) => (info.explosion ? (info.angle || 0) : (info.angle || 0) + Math.PI);

  const origStart = G.startMission;
  G.startMission = function (id) {
    const res = origStart.call(this, id);
    if (this.particles) { const b = bloodOf(this.particles); b.map = this.map; b.clear(); }
    return res;
  };

  function hitBlood(game, e, amount, info) {
    const b = bloodOf(game.particles);
    b.map = game.map;
    const x = U.isFiniteNumber(info.x) ? info.x : e.x, y = U.isFiniteNumber(info.y) ? info.y : e.y;
    const dir = bulletDir(info);
    const big = info.headshot || info.crit;
    const n = U.clamp(Math.round(amount / 7), 3, 14) * (big ? 1.6 : 1);
    b.spray(x, y, dir, n, 0.45, 120, 380 + Math.min(300, amount * 2));
    b.spray(x, y, dir + Math.PI, Math.ceil(n * 0.25), 0.8, 40, 140);
    if (Math.random() < 0.7) b.splat(x + Math.cos(dir) * U.rand(6, 16), y + Math.sin(dir) * U.rand(6, 16), U.rand(9, 16), dir, 1);
    const hit = BO.Collision.raycast(game.map, x, y, x + Math.cos(dir) * 130, y + Math.sin(dir) * 130, BO.COLLIDE.SIGHT, b.hit);
    if (hit.hit && game.map.tile(hit.tx, hit.ty) === T.SOLID) b.wallSplat(hit.x, hit.y, hit.nx, hit.ny, U.rand(16, 26) * (big ? 1.4 : 1) * (1 - hit.t * 0.5));
    game.particles.spawn(x, y, Math.cos(dir) * 70, Math.sin(dir) * 70, 0.35, 4, big ? 22 : 15, '#5a0a10', SH.SMOKE, { alpha: big ? 0.45 : 0.3, drag: 3 });
  }

  function deathBlood(game, e, info) {
    const b = bloodOf(game.particles);
    b.map = game.map;
    const dir = bulletDir(info || {});
    b.spray(e.x, e.y, dir, 20, 0.9, 80, 480);
    b.spray(e.x, e.y, Math.random() * TAU, 10, Math.PI, 40, 200);
    b.splat(e.x + Math.cos(dir) * 5, e.y + Math.sin(dir) * 5, e.r * 2.4, Math.random() * TAU, 0, { grow: 3.5 });
    b.splat(e.x + Math.cos(dir) * 14, e.y + Math.sin(dir) * 14, e.r * 1.6, Math.random() * TAU, 0, { grow: 5 });
    if (info && info.explosion) {
      const chip = SH.CHIP !== undefined ? SH.CHIP : SH.SHARD;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * TAU, sp = U.rand(120, 420);
        game.particles.spawn(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(1.5, 3), U.rand(3, 6), U.rand(3, 5), i % 2 ? '#5e0d12' : '#3a1418', chip, { drag: 4, vrot: U.rand(-12, 12), layer: BO.PARTICLE_LAYER.FLOOR });
      }
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * TAU, r = U.rand(10, 60);
        b.splat(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, U.rand(10, 22), a, 1);
      }
      b.spray(e.x, e.y, 0, 24, Math.PI, 150, 600);
    }
  }

  const origDamage = G.damageEnemy;
  G.damageEnemy = function (e, amount, kx, ky, info) {
    const wasDead = e.dead, hp0 = e.hp;
    origDamage.call(this, e, amount, kx, ky, info);
    if (wasDead || !on() || !bleeds(e) || !(e.hp < hp0)) return;
    U.safe('blood.hit', () => hitBlood(this, e, Math.min(amount, hp0), info || {}));
  };

  const origKilled = G.onEnemyKilled;
  G.onEnemyKilled = function (e, info) {
    origKilled.call(this, e, info);
    if (!on() || !bleeds(e)) return;
    U.safe('blood.death', () => deathBlood(this, e, info));
  };

  const playerBleed = (game, hp0, dir) => {
    const p = game.player;
    if (!p || !on() || !(p.hp < hp0)) return;
    const b = bloodOf(game.particles);
    b.map = game.map;
    b.spray(p.x, p.y, dir, U.clamp(Math.round((hp0 - p.hp) / 5), 3, 10), 0.6, 80, 300);
  };
  const origPHit = G.onPlayerHitByBullet;
  G.onPlayerHitByBullet = function (pr, hx, hy) {
    const hp0 = this.player.hp;
    origPHit.call(this, pr, hx, hy);
    U.safe('blood.player', () => playerBleed(this, hp0, Math.atan2(pr.dirY, pr.dirX)));
  };
  const origMelee = G.onPlayerMelee;
  G.onPlayerMelee = function (e, dmg) {
    const hp0 = this.player.hp;
    origMelee.call(this, e, dmg);
    U.safe('blood.melee', () => playerBleed(this, hp0, Math.atan2(this.player.y - e.y, this.player.x - e.x)));
  };

  // Drip trails from the wounded.
  const origUpdate = G._update;
  G._update = function (realDt) {
    origUpdate.call(this, realDt);
    if (!on() || !this.particles || !this.enemies) return;
    U.safe('blood.trail', () => {
      const b = bloodOf(this.particles);
      const dt = realDt * this.timeScale;
      const drip = (ent, frac) => {
        ent._bt = (ent._bt === undefined ? Math.random() * 0.4 : ent._bt) - dt;
        if (ent._bt > 0) return;
        ent._bt = U.rand(0.1, 0.35) * (0.4 + frac * 2);
        if (Math.hypot(ent.vx || 0, ent.vy || 0) < 25 && Math.random() < 0.7) return;
        b.splat(ent.x + U.randSpread() * ent.r * 0.6, ent.y + U.randSpread() * ent.r * 0.6, U.rand(3, 7), Math.random() * TAU, 0, { alpha: 0.85 });
      };
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead || !bleeds(e) || !e.maxHp) continue;
        const f = e.hp / e.maxHp;
        if (f < 0.45) drip(e, f);
      }
      const p = this.player;
      if (p && !p.dead && p.maxHp && p.hp / p.maxHp < 0.35) drip(p, p.hp / p.maxHp);
    });
  };
})(window.BO);
