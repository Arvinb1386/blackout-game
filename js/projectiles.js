/* =========================================================================
 * BLACKOUT :: projectiles.js
 * Pooled bullets with continuous (swept) collision against tiles, props and
 * actors so fast rounds never tunnel through walls or enemies.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const C = BO.Collision;
  const OWNER = { PLAYER: 0, ENEMY: 1 };
  const KIND = { TRACER: 0, ORB: 1, GRENADE: 2, SNIPER: 3 };
  const MAX_PROJECTILES = 700;

  function makeProjectile() {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, dirX: 0, dirY: 0, speed: 0, damage: 0, rangeLeft: 0, traveled: 0,
      owner: 0, kind: 0, color: '#fff', width: 2, pierce: 0, explosive: 0, knockback: 0, hitStop: 0, critChance: 0,
      lastHit: null, source: null, radius: 0 };
  }

  /** Reusable spawn descriptor: fill it and pass it to spawn() to avoid per-shot allocations. */
  const SHOT = { x: 0, y: 0, angle: 0, speed: 0, damage: 0, range: 0, owner: 0, kind: 0, color: '#fff', width: 2,
    pierce: 0, explosive: 0, knockback: 0, hitStop: 0, critChance: 0, source: null, radius: 0 };

  class ProjectileSystem {
    constructor() {
      this.pool = new BO.Pool(makeProjectile, 200, MAX_PROJECTILES);
      this.hit = C.makeHit();
    }

    clear() { this.pool.releaseAll(); }

    spawn(s) {
      const p = this.pool.acquire();
      if (!p) return null;
      p.x = s.x; p.y = s.y;
      p.dirX = Math.cos(s.angle); p.dirY = Math.sin(s.angle);
      p.speed = s.speed;
      p.vx = p.dirX * s.speed; p.vy = p.dirY * s.speed;
      p.damage = s.damage; p.rangeLeft = s.range; p.traveled = 0;
      p.owner = s.owner; p.kind = s.kind; p.color = s.color; p.width = s.width;
      p.pierce = s.pierce || 0; p.explosive = s.explosive || 0; p.knockback = s.knockback || 0;
      p.hitStop = s.hitStop || 0; p.critChance = s.critChance || 0; p.source = s.source || null;
      p.radius = s.radius || 0; p.lastHit = null;
      return p;
    }

    update(dt, game) {
      const items = this.pool.items;
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        if (!p.active) continue;
        U.safe('projectile.update', () => this._step(p, dt, game));
      }
    }

    _step(p, dt, game) {
      let stepLen = p.speed * dt;
      if (stepLen > p.rangeLeft) stepLen = p.rangeLeft;
      const ex = p.x + p.dirX * stepLen, ey = p.y + p.dirY * stepLen;
      const wall = C.raycast(game.map, p.x, p.y, ex, ey, BO.COLLIDE.BULLET, this.hit);
      const wallT = wall.hit ? wall.t : 1;
      const pad = p.radius;

      // Find the earliest actor intersection along the swept segment.
      let bestT = wallT, target = null;
      if (p.owner === OWNER.PLAYER) {
        const list = game.enemies;
        for (let k = 0; k < list.length; k++) {
          const e = list[k];
          if (e.dead || e === p.lastHit) continue;
          const reach = stepLen + e.r + pad;
          if (Math.abs(e.x - p.x) > reach || Math.abs(e.y - p.y) > reach) continue;
          const t = U.segmentCircle(p.x, p.y, ex, ey, e.x, e.y, e.r + pad);
          if (t >= 0 && t < bestT) { bestT = t; target = e; }
        }
      } else if (game.player && !game.player.dead) {
        const pl = game.player;
        const t = U.segmentCircle(p.x, p.y, ex, ey, pl.x, pl.y, pl.r + pad);
        if (t >= 0 && t < bestT) {
          if (pl.isInvulnerable()) {
            if (!p.lastHit) game.onBulletDodged(p);
            p.lastHit = pl; // graze: the round passes through during i-frames
          } else { bestT = t; target = pl; }
        }
      }

      const hx = p.x + (ex - p.x) * bestT, hy = p.y + (ey - p.y) * bestT;
      if (target) {
        p.traveled += stepLen * bestT;
        if (p.explosive) { game.explode(hx, hy, p.explosive, p.damage, p.owner === OWNER.PLAYER ? 'player' : 'enemy'); this.pool.release(p); return; }
        if (p.owner === OWNER.PLAYER) game.onEnemyHitByBullet(target, p, hx, hy);
        else game.onPlayerHitByBullet(p, hx, hy);
        if (p.pierce > 0 && p.owner === OWNER.PLAYER) {
          p.pierce--;
          p.lastHit = target;
          p.damage *= 0.75;
          p.x = hx; p.y = hy;
          p.rangeLeft -= stepLen * bestT;
          if (p.rangeLeft <= 1) this.pool.release(p);
        } else {
          this.pool.release(p);
        }
        return;
      }
      if (wall.hit) {
        p.traveled += stepLen * wallT;
        p.x = wall.x; p.y = wall.y;
        if (p.explosive) game.explode(wall.x - p.dirX * 6, wall.y - p.dirY * 6, p.explosive, p.damage, p.owner === OWNER.PLAYER ? 'player' : 'enemy');
        else game.onBulletHitWorld(p, wall);
        this.pool.release(p);
        return;
      }
      p.x = ex; p.y = ey;
      p.traveled += stepLen;
      p.rangeLeft -= stepLen;
      if (p.kind === KIND.GRENADE && game.particles) game.particles.trail(p.x, p.y, '#ff9a3c', 5);
      if (p.rangeLeft <= 0.5) {
        if (p.explosive) game.explode(p.x, p.y, p.explosive, p.damage, p.owner === OWNER.PLAYER ? 'player' : 'enemy');
        this.pool.release(p);
      }
    }

    render(ctx, rect) {
      const items = this.pool.items;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        if (!p.active || p.x < rect.x0 || p.x > rect.x1 || p.y < rect.y0 || p.y > rect.y1) continue;
        if (p.kind === KIND.ORB || p.kind === KIND.GRENADE) {
          const r = p.kind === KIND.ORB ? 6 : 5;
          ctx.globalAlpha = 0.45;
          ctx.drawImage(BO.softSprite(p.color), p.x - r * 3, p.y - r * 3, r * 6, r * 6);
          ctx.globalAlpha = 1;
          ctx.fillStyle = p.kind === KIND.ORB ? '#ffe0e6' : '#ffd29a';
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.6, 0, U.TAU); ctx.fill();
          continue;
        }
        const tail = Math.min(p.traveled, p.owner === OWNER.PLAYER ? p.speed * 0.028 : p.speed * 0.045);
        const tx = p.x - p.dirX * tail, ty = p.y - p.dirY * tail;
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = p.width * 3.2;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = p.width;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (p.owner === OWNER.ENEMY) {
          ctx.fillStyle = '#ffd0d8';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.width * 0.9, 0, U.TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  BO.PROJECTILE_OWNER = OWNER;
  BO.PROJECTILE_KIND = KIND;
  BO.SHOT = SHOT;
  BO.ProjectileSystem = ProjectileSystem;
})(window.BO);
