/* =========================================================================
 * BLACKOUT :: lab-bosses.js
 * Boss Laboratory roster. Loaded ONLY by boss-lab.html (after v12).
 *
 * Every lab variant used to be the same rotating cog with a different glow.
 * This pack gives each of the ten variants its own body, its own signature
 * abilities and a difficulty tier, escalating from T1 (The Warden) to
 * T10 (Tempest Warden MK-II):
 *
 *  T1  SENTINEL EYE      searchlight sweep that locks on and fires a burst
 *  T2  IRON RAM          frontal plating (shoot its sides) + shockwave quakes
 *  T3  SIEGE CRAWLER     walking creeping barrage + deployable sentry pods
 *  T4  EVENT HORIZON     bullet-eating orbital shards + gravity singularity
 *  T5  STALKER           optical cloak + flank pounce, snap traps
 *  T6  SOVEREIGN         armed drone halo + arena laser gridlock
 *  T7  FORGE TITAN       lava trail + magma bombs that shatter into embers
 *  T8  OSSUARY WRAITH    phantom clones + homing soul wisps
 *  T9  BINARY CORE       orbiting twin cores, sweeping tether lash, polarity rings
 *  T10 TEMPEST SOVEREIGN storm strikes, wandering tornadoes, chain lightning
 *
 * Tiers scale HP, damage, cooldowns, projectile speed, telegraph length,
 * vent windows and signature ability intensity.
 *
 * Nothing outside the lab changes: the class is only instantiated by the lab
 * through BO.LabBosses.create(); the campaign keeps using BO.Boss as before.
 * ========================================================================= */
'use strict';
(function (BO) {
  if (!BO || !BO.U || !BO.Boss || !BO.CONFIG) return;
  const U = BO.U, TAU = U.TAU, TILE = BO.CONFIG.TILE;
  const C = BO.Collision;
  const Parent = BO.Boss; // v11 VariantBoss (falls back to the base boss)

  const LB = BO.LabBosses = BO.LabBosses || {};
  LB.flags = LB.flags || {}; // the lab points this at its prefs (freezeBoss / dummy)

  /* ------------------------------ Tiers ------------------------------ */
  function tierScale(t) {
    const k = U.clamp(t, 1, 10) - 1;
    return {
      hp: t === 1 ? 1.35 : Math.round((0.8 + k * 0.13) * 100) / 100, // 1.35 for Warden buff, 0.93..1.97 for others
      dmg: t === 1 ? 1.25 : (1 + k * 0.07),
      cd: t === 1 ? 0.75 : (1 - k * 0.035),
      shot: t === 1 ? 1.15 : (1 + k * 0.045),
      move: t === 1 ? 1.15 : (1 + k * 0.05),
      tele: t === 1 ? 0.85 : (1 - k * 0.025),
      vent: t === 1 ? 0.75 : (1 - k * 0.045),
      sig: t === 1 ? 1.35 : (1 + k * 0.08)
    };
  }
  LB.tierScale = tierScale;

  /* ----------------------------- Helpers ----------------------------- */
  function solidAt(game, x, y) {
    const m = game.map;
    if (!m || !m.tiles) return false;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true;
    return m.tiles[m.idx(tx, ty)] === (BO.TILE_TYPE ? BO.TILE_TYPE.SOLID : 1);
  }
  function canHurt(p) { return !!p && !p.dead && !(p.isInvulnerable && p.isInvulnerable()); }
  function suppressed() { const f = LB.flags || {}; return !!(f.dummy || f.freezeBoss); }
  function hurt(b, game, base, sx, sy, key, cd) {
    const p = game.player;
    if (!canHurt(p)) return false;
    if (key) {
      const now = b.labClock;
      if ((b.labHit[key] || -99) + (cd || 0.5) > now) return false;
      b.labHit[key] = now;
    }
    p.takeDamage(base * b.labS.dmg, sx, sy, game);
    return true;
  }
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
    return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
  }
  /** Calls fn(bullet) for every live player bullet; returning true absorbs it. */
  function eachPlayerBullet(game, fn) {
    const ps = game.projectiles;
    if (!ps || !ps.pool) return;
    const own = BO.PROJECTILE_OWNER ? BO.PROJECTILE_OWNER.PLAYER : 0;
    const items = ps.pool.items;
    for (let i = 0; i < items.length; i++) {
      const pr = items[i];
      if (!pr.active || pr.owner !== own) continue;
      if (fn(pr)) ps.pool.release(pr);
    }
  }
  function shove(game, o, dx, dy) {
    if (C && C.moveCircle && game.map) C.moveCircle(game.map, o, dx, dy, o.r || 15);
    else { o.x += dx; o.y += dy; }
  }
  function light(game, x, y, r, c, i, life) { if (game.addLight) game.addLight(x, y, r, c, i, life); }
  function sparks(game, x, y, a, n, c, s) { if (game.particles && game.particles.sparks) game.particles.sparks(x, y, a, n, c, s); }
  function puff(game, x, y, c) { if (game.particles && game.particles.pickupBurst) game.particles.pickupBurst(x, y, c); }
  function smoke(game, x, y, c, s) { if (game.particles && game.particles.smoke) game.particles.smoke(x, y, 1, c, s); }
  function inArena(b, x, y, m) {
    const a = b.arena; m = m || TILE * 1.5;
    if (!a) return { x, y };
    return { x: U.clamp(x, a.x + m, a.x + a.w - m), y: U.clamp(y, a.y + m, a.y + a.h - m) };
  }
  function los(game, x0, y0, x1, y1) {
    if (C && C.lineOfSight && BO.COLLIDE) return C.lineOfSight(game.map, x0, y0, x1, y1, BO.COLLIDE.SIGHT);
    return true;
  }
  function glow(ctx, x, y, r, color, a) {
    if (!BO.softSprite) return;
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.drawImage(BO.softSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
    ctx.globalCompositeOperation = op;
  }
  function polyPath(ctx, n, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
  }
  function starPath(ctx, n, r1, r2, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * TAU, r = i % 2 ? r2 : r1; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
  }
  function jagged(ctx, x0, y0, x1, y1, segs, amp) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    ctx.moveTo(x0, y0);
    for (let i = 1; i < segs; i++) {
      const t = i / segs, o = U.randSpread() * amp;
      ctx.lineTo(x0 + dx * t + nx * o, y0 + dy * t + ny * o);
    }
    ctx.lineTo(x1, y1);
  }
  /** Enemy orb fired from an arbitrary point (pods, phantoms, cores...). */
  function shotFrom(b, game, x, y, angle, speed, damage, color, radius) {
    const S = BO.SHOT;
    if (!S || !game.projectiles) return;
    S.x = x; S.y = y; S.angle = angle; S.speed = speed * b.labS.shot; S.damage = damage * b.labS.dmg; S.range = 1500;
    S.owner = BO.PROJECTILE_OWNER.ENEMY; S.kind = BO.PROJECTILE_KIND.ORB; S.color = color || b.lab.pal.orb; S.width = 3;
    S.pierce = 0; S.explosive = 0; S.knockback = 50; S.hitStop = 0; S.critChance = 0; S.source = b; S.radius = radius || 5;
    game.projectiles.spawn(S);
  }

  /* ---------------------------- Entities ----------------------------- */
  // Small self-managed effects owned by the boss (rings, pods, traps...).
  // update() returns false to remove the entity.
  const ENT = {
    ring: {
      update(b, e, dt, game, p) {
        e.r += e.speed * dt;
        if (!e.hit && p && Math.abs(U.dist(e.x, e.y, p.x, p.y) - e.r) < e.w / 2 + (p.r || 15)) {
          if (hurt(b, game, e.dmg, e.x, e.y)) { e.hit = true; if (p.knock) { const a = Math.atan2(p.y - e.y, p.x - e.x); p.knock(Math.cos(a) * 420, Math.sin(a) * 420); } }
        }
        return e.r < e.max;
      },
      draw(b, e, ctx) {
        const k = 1 - e.r / e.max;
        ctx.strokeStyle = U.rgba(e.color, 0.25 + k * 0.6);
        ctx.lineWidth = e.w;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = U.rgba('#ffffff', 0.5 * k);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.stroke();
      }
    },
    pod: { // Siege sentry: destructible, fires slow aimed orbs.
      update(b, e, dt, game, p) {
        e.t += dt; e.fire -= dt;
        e.aim = p ? U.turnTowards(e.aim, Math.atan2(p.y - e.y, p.x - e.x), dt * 3) : e.aim;
        eachPlayerBullet(game, pr => {
          if (U.dist(pr.x, pr.y, e.x, e.y) > 18) return false;
          e.hp--; e.flash = 0.08; sparks(game, pr.x, pr.y, Math.atan2(pr.y - e.y, pr.x - e.x), 4, '#ffd34d', 200);
          return true;
        });
        e.flash = Math.max(0, (e.flash || 0) - dt);
        if (e.hp <= 0) { puff(game, e.x, e.y, '#ffb347'); light(game, e.x, e.y, 200, '#ffb347', 0.6, 0.4); if (game.audio && game.audio.explosion) U.safe('lab.podboom', () => game.audio.explosion(e.x, e.y, 0.4)); return false; }
        if (e.t > 0.7 && e.fire <= 0 && !suppressed() && b.mode === 'fight') {
          e.fire = e.rate;
          shotFrom(b, game, e.x + Math.cos(e.aim) * 18, e.y + Math.sin(e.aim) * 18, e.aim, 360, 10, '#ffb347');
          if (b.phase === 3) { shotFrom(b, game, e.x, e.y, e.aim + 0.22, 340, 9, '#ffb347'); shotFrom(b, game, e.x, e.y, e.aim - 0.22, 340, 9, '#ffb347'); }
        }
        return e.t < e.life;
      },
      draw(b, e, ctx, time) {
        const dep = U.clamp(e.t / 0.7, 0, 1), fade = U.clamp(e.life - e.t, 0, 1);
        ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(3, 5, 18, 14, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#3b3528';
        for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5; ctx.save(); ctx.rotate(a); ctx.fillRect(6, -2.5, 12 * dep, 5); ctx.restore(); }
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#5a5040'; polyPath(ctx, 6, 12 * dep, 0); ctx.fill();
        ctx.rotate(e.aim);
        ctx.fillStyle = '#1d1a14'; ctx.fillRect(4, -3, 16 * dep, 6);
        ctx.fillStyle = U.rgba('#ffb347', 0.6 + Math.sin(time * 9 + e.x) * 0.4);
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
        ctx.restore();
      }
    },
    trap: { // Stalker snap trap.
      update(b, e, dt, game, p) {
        e.t += dt;
        if (e.snap >= 0) { e.snap += dt; return e.snap < 0.45; }
        if (e.t > e.arm && p && U.dist(p.x, p.y, e.x, e.y) < e.r + (p.r || 15)) {
          e.snap = 0;
          if (hurt(b, game, e.dmg, e.x, e.y)) { p.vx = 0; p.vy = 0; if (p.stamina !== undefined) p.stamina = Math.max(0, p.stamina - 35); }
          sparks(game, e.x, e.y, -Math.PI / 2, 8, '#ffd34d', 260);
          if (game.audio && game.audio.melee) U.safe('lab.trap', () => game.audio.melee(e.x, e.y));
        }
        return e.t < e.life;
      },
      draw(b, e, ctx, time) {
        const armed = e.t > e.arm, close = e.snap >= 0 ? Math.min(1, e.snap * 6) : 0;
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.globalAlpha = U.clamp((e.life - e.t) * 2, 0, 1) * (armed ? 0.85 : 0.45);
        ctx.strokeStyle = '#6d6a55'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#9a9478';
        for (let s = -1; s <= 1; s += 2) {
          ctx.save(); ctx.scale(1, s); ctx.translate(0, -2 + close * 2);
          ctx.beginPath(); ctx.moveTo(-15, 0);
          for (let i = 0; i <= 6; i++) ctx.lineTo(-15 + i * 5, i % 2 ? -7 + close * 4 : -1);
          ctx.lineTo(15, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = armed && Math.floor(time * 6) % 2 ? '#ff3355' : '#3a2020';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
        ctx.restore();
      }
    },
    beam: { // Sovereign gridlock laser line.
      update(b, e, dt, game, p) {
        e.t += dt;
        if (e.t >= e.warn && !e.fired) { e.fired = true; light(game, (e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, 380, b.lab.pal.glow, 0.45, 0.35); }
        if (e.fired && e.t < e.warn + e.live && p && segDist(p.x, p.y, e.x0, e.y0, e.x1, e.y1) < e.w / 2 + (p.r || 15)) hurt(b, game, e.dmg, p.x, p.y, 'beam', 0.6);
        return e.t < e.warn + e.live + 0.15;
      },
      draw(b, e, ctx, time) {
        const c = b.lab.pal.glow;
        if (e.t < e.warn) {
          const k = e.t / e.warn;
          ctx.strokeStyle = U.rgba(c, 0.15 + k * 0.45 + (Math.floor(time * 14) % 2) * 0.15);
          ctx.lineWidth = 1 + k * 2; ctx.setLineDash([14, 10]);
          ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke(); ctx.setLineDash([]);
          return;
        }
        const k = U.clamp(1 - (e.t - e.warn) / (e.live + 0.15), 0, 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgba(c, 0.35 * k); ctx.lineWidth = e.w * 1.8;
        ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke();
        ctx.strokeStyle = U.rgba('#ffffff', 0.9 * k); ctx.lineWidth = e.w * 0.35;
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    lava: { // Forge lava pool (damage over time).
      update(b, e, dt, game, p) {
        e.t += dt;
        if (p && U.dist(p.x, p.y, e.x, e.y) < e.r * 0.8) hurt(b, game, e.dps * 0.3, e.x, e.y, 'lava', 0.3);
        return e.t < e.life;
      },
      draw(b, e, ctx, time) {
        const k = U.clamp(Math.min(e.t * 4, (e.life - e.t) / 1.2), 0, 1);
        ctx.fillStyle = U.rgba('#2a0d05', 0.7 * k);
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r, e.r * 0.82, e.rot, 0, TAU); ctx.fill();
        glow(ctx, e.x, e.y, e.r * 1.3, '#ff5a1a', 0.5 * k * (0.8 + Math.sin(time * 5 + e.x) * 0.2));
        ctx.fillStyle = U.rgba('#ffb03a', 0.55 * k);
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 0.55, e.r * 0.42, e.rot, 0, TAU); ctx.fill();
      }
    },
    magma: { // Forge lobbed bomb: arcs to a target, bursts into embers + lava.
      update(b, e, dt, game, p) {
        e.t += dt;
        if (e.t < e.dur) return true;
        const blastR = 62;
        // Radial damage, scaled down with distance from the centre. The flat
        // falloff used to let a full-strength hit land even at the very edge
        // of the blast, which killed the player outright.
        const px = p ? p.x : e.tx, py = p ? p.y : e.ty;
        const d = U.dist(px, py, e.tx, e.ty);
        const falloff = d >= blastR ? 0 : (1 - Math.pow(d / blastR, 2)) * 0.85 + 0.15;
        if (p && falloff > 0) hurt(b, game, 20 * b.labS.dmg * falloff, e.tx, e.ty, 'magma' + e.id, 0.35);
        game.explode(e.tx, e.ty, blastR, 20 * b.labS.dmg * (p ? falloff : 1), 'enemy', { noEnemies: true, noProps: true, small: true });
        const n = b.phase === 3 ? 8 : 6;
        for (let i = 0; i < n; i++) shotFrom(b, game, e.tx, e.ty, i / n * TAU + e.rot, 230, 9, '#ff7a2a', 4);
        b._labSpawn({ type: 'lava', x: e.tx, y: e.ty, r: 42, life: 4, dps: 22, t: 0, rot: e.rot });
        light(game, e.tx, e.ty, 260, '#ff6a1a', 0.7, 0.5);
        return false;
      },
      draw(b, e, ctx, time) {
        const k = e.t / e.dur, x = U.lerp(e.sx, e.tx, k), y = U.lerp(e.sy, e.ty, k) - Math.sin(k * Math.PI) * 170;
        ctx.strokeStyle = U.rgba('#ff5a1a', 0.35 + k * 0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.tx, e.ty, 70, 0, TAU); ctx.stroke();
        ctx.fillStyle = U.rgba('#ff5a1a', 0.08 + k * 0.15);
        ctx.beginPath(); ctx.arc(e.tx, e.ty, 70 * k, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(U.lerp(e.sx, e.tx, k), U.lerp(e.sy, e.ty, k), 12, 7, 0, 0, TAU); ctx.fill();
        glow(ctx, x, y, 34, '#ff7a2a', 0.8);
        ctx.fillStyle = '#3a1a0e'; ctx.save(); ctx.translate(x, y); polyPath(ctx, 7, 11, time * 6); ctx.fill();
        ctx.fillStyle = '#ffc04a'; ctx.beginPath(); ctx.arc(2, -2, 4, 0, TAU); ctx.fill(); ctx.restore();
      }
    },
    phantom: { // Wraith clone: circles the player and fires fans.
      update(b, e, dt, game, p) {
        e.t += dt; e.fire -= dt;
        if (p) {
          e.ang += dt * e.spin;
          const tx = p.x + Math.cos(e.ang) * e.dist, ty = p.y + Math.sin(e.ang) * e.dist;
          const q = inArena(b, tx, ty);
          e.x = U.damp(e.x, q.x, 3, dt); e.y = U.damp(e.y, q.y, 3, dt);
        }
        eachPlayerBullet(game, pr => {
          if (U.dist(pr.x, pr.y, e.x, e.y) > 24) return false;
          e.hp--; e.flash = 0.1; return true;
        });
        e.flash = Math.max(0, (e.flash || 0) - dt);
        if (e.hp <= 0) { puff(game, e.x, e.y, '#9dffb0'); light(game, e.x, e.y, 180, '#9dffb0', 0.5, 0.35); return false; }
        if (e.t > 0.6 && e.fire <= 0 && p && !suppressed() && b.mode === 'fight') {
          e.fire = e.rate;
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          for (let i = -1; i <= 1; i++) shotFrom(b, game, e.x, e.y, a + i * 0.2, 330, 10, '#9dffb0');
        }
        return e.t < e.life;
      },
      draw(b, e, ctx, time) {
        const a = U.clamp(Math.min(e.t * 2, e.life - e.t), 0, 1) * (0.35 + Math.sin(time * 11 + e.ang) * 0.08);
        ctx.save(); ctx.globalAlpha = e.flash > 0 ? 0.9 : a;
        DRAW.wraithBody(ctx, b, e.x, e.y, 0.8, time + e.ang, true);
        ctx.restore();
      }
    },
    soul: { // Wraith homing wisp (shootable).
      update(b, e, dt, game, p) {
        e.t += dt;
        if (p) e.a = U.turnTowards(e.a, Math.atan2(p.y - e.y, p.x - e.x), dt * e.turn);
        e.x += Math.cos(e.a) * e.speed * dt; e.y += Math.sin(e.a) * e.speed * dt;
        if (solidAt(game, e.x, e.y)) return false;
        let dead = false;
        eachPlayerBullet(game, pr => { if (!dead && U.dist(pr.x, pr.y, e.x, e.y) < 14) { dead = true; return true; } return false; });
        if (dead) { puff(game, e.x, e.y, '#9dffb0'); return false; }
        if (p && U.dist(p.x, p.y, e.x, e.y) < (p.r || 15) + 8) { if (hurt(b, game, e.dmg, e.x, e.y)) return false; }
        return e.t < e.life;
      },
      draw(b, e, ctx, time) {
        glow(ctx, e.x, e.y, 22, '#5dffa0', 0.7);
        ctx.fillStyle = '#e8fff0'; ctx.beginPath(); ctx.arc(e.x, e.y, 4.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgba('#9dffb0', 0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(e.x, e.y);
        for (let i = 1; i < 5; i++) ctx.lineTo(e.x - Math.cos(e.a) * i * 6 + Math.sin(time * 14 + i) * 2, e.y - Math.sin(e.a) * i * 6 + Math.cos(time * 14 + i) * 2);
        ctx.stroke();
      }
    },
    thunder: { // Tempest lightning strike from the sky.
      update(b, e, dt, game, p) {
        e.t += dt;
        if (e.t >= e.warn && !e.done) {
          e.done = true;
          if (p && U.dist(p.x, p.y, e.x, e.y) < e.r + (p.r || 15) * 0.5) hurt(b, game, e.dmg, e.x, e.y);
          light(game, e.x, e.y, 340, '#bfefff', 0.9, 0.3);
          sparks(game, e.x, e.y, -Math.PI / 2, 10, '#bfefff', 320);
          if (game.camera && game.camera.shake) U.safe('lab.shake', () => game.camera.shake(4, 0.15));
        }
        return e.t < e.warn + 0.28;
      },
      draw(b, e, ctx, time) {
        if (e.t < e.warn) {
          const k = e.t / e.warn;
          ctx.strokeStyle = U.rgba('#bfefff', 0.4 + Math.sin(time * 22) * 0.25); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.stroke();
          ctx.fillStyle = U.rgba('#7fd4ff', 0.08 + k * 0.2);
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r * k, 0, TAU); ctx.fill();
          return;
        }
        const k = 1 - (e.t - e.warn) / 0.28;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgba('#dff6ff', k); ctx.lineWidth = 4;
        ctx.beginPath(); jagged(ctx, e.x + U.randSpread() * 30, e.y - 520, e.x, e.y, 9, 26); ctx.stroke();
        ctx.strokeStyle = U.rgba('#7fd4ff', 0.5 * k); ctx.lineWidth = 10; ctx.stroke();
        glow(ctx, e.x, e.y, e.r * 1.6, '#7fd4ff', k);
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    zap: { // Tempest chain lightning segment.
      update(b, e, dt, game, p) {
        e.t += dt;
        if (e.t >= e.warn && e.t < e.warn + 0.25 && p && segDist(p.x, p.y, e.x0, e.y0, e.x1, e.y1) < 16 + (p.r || 15)) hurt(b, game, e.dmg, p.x, p.y, 'zap', 0.5);
        if (e.t >= e.warn && !e.lit) { e.lit = true; light(game, e.x1, e.y1, 220, '#bfefff', 0.7, 0.25); }
        return e.t < e.warn + 0.3;
      },
      draw(b, e, ctx, time) {
        if (e.t < e.warn) {
          ctx.strokeStyle = U.rgba('#7fd4ff', 0.25 + (e.t / e.warn) * 0.5); ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
          ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(e.x1, e.y1, 10, 0, TAU); ctx.stroke();
          return;
        }
        const k = 1 - (e.t - e.warn) / 0.3;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgba('#e8fbff', k); ctx.lineWidth = 3;
        ctx.beginPath(); jagged(ctx, e.x0, e.y0, e.x1, e.y1, 8, 18); ctx.stroke();
        ctx.strokeStyle = U.rgba('#59c8ff', 0.5 * k); ctx.lineWidth = 9; ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    tornado: { // Tempest twister: hunts the player, swirls and shreds.
      update(b, e, dt, game, p) {
        e.t += dt;
        if (p) {
          const want = Math.atan2(p.y - e.y, p.x - e.x);
          e.a = U.turnTowards(e.a, want, dt * e.turn);
        }
        e.x += Math.cos(e.a) * e.speed * dt; e.y += Math.sin(e.a) * e.speed * dt;
        const q = inArena(b, e.x, e.y, TILE * 1.2); e.x = q.x; e.y = q.y;
        if (p && !p.dead) {
          const d = U.dist(p.x, p.y, e.x, e.y);
          if (d < e.r * 2.2) {
            const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2;
            const f = (1 - d / (e.r * 2.2)) * 170 * dt;
            shove(game, p, Math.cos(a) * f, Math.sin(a) * f);
          }
          if (d < e.r) hurt(b, game, 8, e.x, e.y, 'tornado' + e.id, 0.35);
        }
        if (Math.random() < dt * 10) smoke(game, e.x + U.randSpread() * e.r, e.y + U.randSpread() * e.r, '#6f7c8c', 30);
        return e.t < e.life;
      },
      draw(b, e, ctx, time) {
        const k = U.clamp(Math.min(e.t * 2, e.life - e.t), 0, 1);
        ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = k;
        for (let i = 0; i < 6; i++) {
          const rr = e.r * (1 - i * 0.14), sp = time * (5 + i) + i;
          ctx.strokeStyle = U.rgba(i % 2 ? '#9fb4c8' : '#dfe9f2', 0.25 + i * 0.07);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(Math.sin(sp * 0.7) * 4, -i * 5, rr, rr * 0.55, 0, sp, sp + 4.4); ctx.stroke();
        }
        ctx.restore();
        glow(ctx, e.x, e.y, e.r * 1.4, '#7fd4ff', 0.25 * k);
      }
    }
  };

  /* ------------------------------ Bodies ----------------------------- */
  const DRAW = {
    shadow(ctx, b, sx, sy) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(b.x + 6, b.y + 10, b.r * (sx || 1.2), b.r * (sy || 1.0), 0, 0, TAU); ctx.fill();
    },
    sentinel(ctx, b, time, F) {
      const r = b.r, pal = b.lab.pal;
      DRAW.shadow(ctx, b);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      // rear antenna fins
      ctx.fillStyle = F('#232a35');
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.5); ctx.lineTo(-r * 1.35, -r * 0.85); ctx.lineTo(-r * 0.9, -r * 0.25); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.5); ctx.lineTo(-r * 1.35, r * 0.85); ctx.lineTo(-r * 0.9, r * 0.25); ctx.closePath(); ctx.fill();
      // carapace: six riot-shield plates hugging the hull (no teeth)
      for (let i = 0; i < 6; i++) {
        const a0 = i / 6 * TAU + 0.06, a1 = (i + 1) / 6 * TAU - 0.06;
        ctx.fillStyle = F(i % 2 ? '#3a4452' : '#2f3845');
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.02, a0, a1); ctx.arc(0, 0, r * 0.7, a1, a0, true); ctx.closePath(); ctx.fill();
        const am = (a0 + a1) / 2;
        ctx.fillStyle = '#7d8796';
        ctx.beginPath(); ctx.arc(Math.cos(am) * r * 0.88, Math.sin(am) * r * 0.88, 2, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = F('#1c222b'); ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.fill();
      // giant eye with an iris that tracks the operator
      ctx.fillStyle = '#0b0e13'; ctx.beginPath(); ctx.ellipse(r * 0.12, 0, r * 0.56, r * 0.46, 0, 0, TAU); ctx.fill();
      const look = b.labLook || 0;
      const ix = r * 0.2 + Math.cos(look) * r * 0.12, iy = Math.sin(look) * r * 0.12;
      ctx.fillStyle = pal.eye[b.phase - 1];
      ctx.beginPath(); ctx.arc(ix, iy, r * 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#05070a';
      ctx.beginPath(); ctx.ellipse(ix, iy, r * 0.07, r * (b.phase === 3 ? 0.08 : 0.2), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ix - r * 0.1, iy - r * 0.1, r * 0.06, 0, TAU); ctx.fill();
      // eyelids (shutter plates)
      const blink = (Math.sin(time * 0.9) > 0.985) ? 1 : 0;
      ctx.fillStyle = F('#3a4452');
      ctx.fillRect(-r * 0.45, -r * 0.5, r * 1.15, r * (0.12 + blink * 0.36));
      ctx.fillRect(-r * 0.45, r * (0.38 - blink * 0.36), r * 1.15, r * (0.12 + blink * 0.36));
      ctx.restore();
    },
    ram(ctx, b, time, F) {
      const r = b.r;
      DRAW.shadow(ctx, b, 1.35, 1.05);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      // treads
      for (let s = -1; s <= 1; s += 2) {
        ctx.fillStyle = F('#16181d');
        ctx.fillRect(-r * 1.05, s * r * 0.62 - r * 0.22, r * 1.8, r * 0.44);
        ctx.fillStyle = '#2d3038';
        const off = (b.labTread || 0) % 10;
        for (let x = -r * 1.05 + off; x < r * 0.75; x += 10) ctx.fillRect(x, s * r * 0.62 - r * 0.22, 3, r * 0.44);
      }
      // hull: arrowhead
      ctx.fillStyle = F('#4a525e');
      ctx.beginPath(); ctx.moveTo(r * 0.85, 0); ctx.lineTo(r * 0.2, -r * 0.62); ctx.lineTo(-r * 0.95, -r * 0.5);
      ctx.lineTo(-r * 0.95, r * 0.5); ctx.lineTo(r * 0.2, r * 0.62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = F('#5d6673');
      ctx.beginPath(); ctx.moveTo(r * 0.55, 0); ctx.lineTo(r * 0.05, -r * 0.38); ctx.lineTo(-r * 0.7, -r * 0.3);
      ctx.lineTo(-r * 0.7, r * 0.3); ctx.lineTo(r * 0.05, r * 0.38); ctx.closePath(); ctx.fill();
      // bolts
      ctx.fillStyle = '#2a2f37';
      [[-0.5, -0.38], [-0.5, 0.38], [0.1, -0.48], [0.1, 0.48], [-0.2, 0]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * r, y * r, 2.2, 0, TAU); ctx.fill(); });
      // exhaust stacks
      ctx.fillStyle = '#22252b'; ctx.fillRect(-r * 1.15, -r * 0.3, r * 0.3, r * 0.18); ctx.fillRect(-r * 1.15, r * 0.12, r * 0.3, r * 0.18);
      // plow blade with hazard stripes
      ctx.save();
      ctx.beginPath(); ctx.arc(r * 0.2, 0, r * 1.02, -1.05, 1.05); ctx.arc(r * 0.2, 0, r * 0.78, 1.05, -1.05, true); ctx.closePath();
      ctx.fillStyle = F(b.labPlate > 0 ? '#e8edf5' : '#8a929e'); ctx.fill(); ctx.clip();
      ctx.fillStyle = 'rgba(240,190,61,0.75)';
      for (let k = -r * 1.2; k < r * 1.2; k += 12) { ctx.beginPath(); ctx.moveTo(r * 0.9, k); ctx.lineTo(r * 1.3, k + 6); ctx.lineTo(r * 1.3, k + 12); ctx.lineTo(r * 0.9, k + 6); ctx.fill(); }
      ctx.restore();
      ctx.restore();
    },
    crawler(ctx, b, time, F) {
      const r = b.r;
      DRAW.shadow(ctx, b, 1.4, 1.2);
      ctx.save(); ctx.translate(b.x, b.y);
      const heading = b.labHeading || 0, gait = b.labGait || 0;
      ctx.rotate(heading);
      // four articulated legs
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const sx = i < 2 ? 1 : -1, sy = i % 2 ? 1 : -1;
        const swing = Math.sin(gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35;
        const hx = sx * r * 0.5, hy = sy * r * 0.5;
        const kx = hx + sx * r * 0.55, ky = hy + sy * r * 0.55;
        const fx = kx + sx * r * (0.35 + swing * 0.5), fy = ky + sy * r * 0.45;
        ctx.strokeStyle = F('#1f2126'); ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.strokeStyle = '#4b4f58'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.arc(kx, ky, 3, 0, TAU); ctx.fill();
      }
      // chamfered chassis
      ctx.fillStyle = F('#4d4636');
      ctx.beginPath();
      const c = r * 0.72, ch = r * 0.28;
      ctx.moveTo(-c + ch, -c); ctx.lineTo(c - ch, -c); ctx.lineTo(c, -c + ch); ctx.lineTo(c, c - ch); ctx.lineTo(c - ch, c); ctx.lineTo(-c + ch, c); ctx.lineTo(-c, c - ch); ctx.lineTo(-c, -c + ch); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(-c * 0.7, -c * 0.7, c * 1.4, c * 1.4);
      ctx.fillStyle = 'rgba(240,190,61,0.6)'; ctx.fillRect(-c * 0.9, -c * 0.95, c * 0.5, 4); ctx.fillRect(c * 0.4, c * 0.9, c * 0.5, 4);
      ctx.restore();
      // turret (independent from the walking heading)
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.fillStyle = F('#2b2820'); ctx.fillRect(r * 0.1, -r * 0.16, r * 1.25, r * 0.32);
      ctx.fillStyle = F('#3c372b'); ctx.fillRect(r * 1.15, -r * 0.24, r * 0.25, r * 0.48);
      ctx.fillStyle = F('#6a604a'); ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2820'; ctx.beginPath(); ctx.arc(-r * 0.12, 0, r * 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = U.rgba('#ff9f43', 0.6 + Math.sin(time * 6) * 0.3); ctx.fillRect(-r * 0.4, -r * 0.05, r * 0.14, r * 0.1);
      ctx.restore();
    },
    horizon(ctx, b, time, F) {
      const r = b.r, spin = b.ringSpin * 1.6;
      DRAW.shadow(ctx, b, 1.1, 0.9);
      ctx.save(); ctx.translate(b.x, b.y);
      // tilted accretion disk, back half
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = U.rgba(i % 2 ? '#7b5cff' : '#3fd0ff', 0.55 - i * 0.08);
        ctx.lineWidth = 5 - i;
        ctx.beginPath(); ctx.ellipse(0, 0, r * (1.25 + i * 0.16), r * (0.42 + i * 0.05), -0.35, Math.PI + spin * (i % 2 ? -1 : 1), TAU + spin * (i % 2 ? -1 : 1)); ctx.stroke();
      }
      // core
      ctx.fillStyle = F('#04030a'); ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.fill();
      ctx.strokeStyle = F('#c9b8ff'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, TAU); ctx.stroke();
      // lensing arcs
      ctx.strokeStyle = 'rgba(160,140,255,0.45)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const a = spin * 0.7 + i * TAU / 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.86, a, a + 0.9); ctx.stroke(); }
      // front half of the disk
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = U.rgba(i % 2 ? '#a68bff' : '#7fe3ff', 0.75 - i * 0.12);
        ctx.lineWidth = 5 - i;
        ctx.beginPath(); ctx.ellipse(0, 0, r * (1.25 + i * 0.16), r * (0.42 + i * 0.05), -0.35, spin * (i % 2 ? -1 : 1), Math.PI + spin * (i % 2 ? -1 : 1)); ctx.stroke();
      }
      ctx.restore();
      // orbital shards
      (b.labShards || []).forEach(s => {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a * 2);
        ctx.fillStyle = F('#b9a8ff'); ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(0, -5); ctx.lineTo(-9, 0); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#efeaff'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(0, -5); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      });
    },
    stalker(ctx, b, time, F) {
      const r = b.r;
      ctx.save();
      ctx.globalAlpha *= b.labAlpha === undefined ? 1 : b.labAlpha;
      DRAW.shadow(ctx, b, 1.3, 0.8);
      ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      // segmented abdomen
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = F(i % 2 ? '#262e22' : '#1d241a');
        ctx.beginPath(); ctx.ellipse(-r * (0.55 + i * 0.38), Math.sin(time * 4 + i) * 2, r * (0.42 - i * 0.08), r * (0.34 - i * 0.07), 0, 0, TAU); ctx.fill();
      }
      // scythe arms
      for (let s = -1; s <= 1; s += 2) {
        const sway = Math.sin(time * 3 + s) * 0.12 + (b.labPounce > 0 ? -0.5 : 0);
        ctx.save(); ctx.translate(r * 0.2, s * r * 0.42); ctx.rotate(s * (0.5 + sway));
        ctx.fillStyle = F('#323c2c'); ctx.fillRect(0, -3, r * 0.75, 6);
        ctx.translate(r * 0.75, 0);
        ctx.fillStyle = F('#c9cdb8');
        ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(r * 0.55, -s * r * 0.1, r * 0.75, s * r * 0.45); ctx.quadraticCurveTo(r * 0.35, s * r * 0.05, 0, 3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // thorax diamond + head
      ctx.fillStyle = F('#39432f');
      ctx.beginPath(); ctx.moveTo(r * 0.95, 0); ctx.lineTo(r * 0.1, -r * 0.48); ctx.lineTo(-r * 0.45, 0); ctx.lineTo(r * 0.1, r * 0.48); ctx.closePath(); ctx.fill();
      ctx.fillStyle = F('#4d5a3f');
      ctx.beginPath(); ctx.moveTo(r * 0.75, 0); ctx.lineTo(r * 0.15, -r * 0.24); ctx.lineTo(-r * 0.2, 0); ctx.lineTo(r * 0.15, r * 0.24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0a0d08'; ctx.fillRect(r * 0.45, -r * 0.2, r * 0.3, r * 0.4);
      ctx.restore();
    },
    sovereign(ctx, b, time, F) {
      const r = b.r, pal = b.lab.pal;
      DRAW.shadow(ctx, b, 1.3, 1.1);
      ctx.save(); ctx.translate(b.x, b.y);
      // rotating crown of spikes
      ctx.save(); ctx.rotate(b.ringSpin * 0.4);
      ctx.fillStyle = F('#b8902e');
      starPath(ctx, 10, r * 1.18, r * 0.86, 0); ctx.fill();
      ctx.restore();
      // layered octagon
      ctx.fillStyle = F('#2c2537'); polyPath(ctx, 8, r * 0.95, Math.PI / 8); ctx.fill();
      ctx.strokeStyle = F('#e2bd55'); ctx.lineWidth = 2.5; polyPath(ctx, 8, r * 0.95, Math.PI / 8); ctx.stroke();
      ctx.fillStyle = F('#3e3450'); polyPath(ctx, 8, r * 0.7, 0); ctx.fill();
      ctx.rotate(b.angle);
      // emblem: royal triangle with eye
      ctx.fillStyle = F('#1a1422');
      ctx.beginPath(); ctx.moveTo(r * 0.55, 0); ctx.lineTo(-r * 0.3, -r * 0.48); ctx.lineTo(-r * 0.3, r * 0.48); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e2bd55'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = pal.eye[b.phase - 1]; ctx.beginPath(); ctx.arc(r * 0.02, 0, r * 0.15, 0, TAU); ctx.fill();
      // twin scepter cannons
      ctx.fillStyle = '#17141d'; ctx.fillRect(r * 0.6, -r * 0.5, r * 0.6, r * 0.16); ctx.fillRect(r * 0.6, r * 0.34, r * 0.6, r * 0.16);
      ctx.fillStyle = '#e2bd55'; ctx.fillRect(r * 1.12, -r * 0.54, r * 0.1, r * 0.24); ctx.fillRect(r * 1.12, r * 0.3, r * 0.1, r * 0.24);
      ctx.restore();
      // drones
      (b.labDrones || []).forEach(d => {
        if (!d.alive) return;
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.aim);
        ctx.fillStyle = F(d.flash > 0 ? '#ffffff' : '#3a3046');
        ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#e2bd55'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(-2, 0, 11, time * 20, time * 20 + 1.2); ctx.stroke();
        ctx.restore();
      });
    },
    forge(ctx, b, time, F) {
      const r = b.r;
      DRAW.shadow(ctx, b, 1.35, 1.15);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      // fists swing with stride
      const sw = Math.sin(b.labGait || 0) * r * 0.18;
      for (let s = -1; s <= 1; s += 2) {
        ctx.save(); ctx.translate(r * 0.35 + s * sw, s * r * 0.95);
        ctx.fillStyle = F('#2e2420'); polyPath(ctx, 6, r * 0.36, 0.3 * s); ctx.fill();
        ctx.strokeStyle = U.rgba('#ff7a2a', 0.7); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.1); ctx.lineTo(r * 0.05, r * 0.02); ctx.lineTo(r * 0.18, -r * 0.12); ctx.stroke();
        ctx.restore();
      }
      // jagged basalt body
      const v = b.labRock;
      ctx.fillStyle = F('#2a201c');
      ctx.beginPath(); for (let i = 0; i < v.length; i++) { const a = i / v.length * TAU; ctx.lineTo(Math.cos(a) * r * v[i], Math.sin(a) * r * v[i]); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = F('#3a2c25');
      ctx.beginPath(); for (let i = 0; i < v.length; i++) { const a = i / v.length * TAU + 0.2; ctx.lineTo(Math.cos(a) * r * v[i] * 0.72, Math.sin(a) * r * v[i] * 0.72); } ctx.closePath(); ctx.fill();
      // molten rift
      const heat = 0.6 + Math.sin(time * 3.4) * 0.25 + (b.phase - 1) * 0.1;
      ctx.fillStyle = U.rgba('#ff6a1a', U.clamp(heat, 0, 1));
      ctx.beginPath(); ctx.ellipse(r * 0.12, 0, r * 0.32, r * 0.18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.ellipse(r * 0.16, 0, r * 0.14, r * 0.07, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
    wraithBody(ctx, b, x, y, scale, time, ghost) {
      const r = b.r * scale;
      ctx.save(); ctx.translate(x, y);
      // trailing tendrils
      ctx.strokeStyle = ghost ? 'rgba(157,255,176,0.6)' : 'rgba(40,52,60,0.9)'; ctx.lineWidth = 3 * scale; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + (i - 2) * 0.32, len = r * (1.2 + (i % 2) * 0.35);
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        ctx.bezierCurveTo(Math.cos(a) * len * 0.6 + Math.sin(time * 3 + i) * 8, Math.sin(a) * len * 0.6,
          Math.cos(a) * len * 0.9 + Math.sin(time * 2.4 + i * 2) * 12, Math.sin(a) * len * 0.9,
          Math.cos(a) * len + Math.sin(time * 2 + i) * 14, Math.sin(a) * len);
        ctx.stroke();
      }
      // tattered cloak
      ctx.fillStyle = ghost ? 'rgba(120,230,160,0.55)' : '#161b24';
      ctx.beginPath(); ctx.moveTo(0, -r * 1.05);
      ctx.quadraticCurveTo(r * 0.95, -r * 0.6, r * 0.85, r * 0.35);
      for (let i = 0; i <= 6; i++) { const t = i / 6, xx = U.lerp(r * 0.85, -r * 0.85, t); ctx.lineTo(xx, r * (0.55 + (i % 2 ? 0.35 : 0) + Math.sin(time * 5 + i) * 0.08)); }
      ctx.quadraticCurveTo(-r * 0.95, -r * 0.6, 0, -r * 1.05); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ghost ? 'rgba(20,40,30,0.5)' : '#0a0d12'; ctx.beginPath(); ctx.ellipse(0, -r * 0.3, r * 0.52, r * 0.6, 0, 0, TAU); ctx.fill();
      // bone mask
      ctx.fillStyle = ghost ? 'rgba(230,255,235,0.8)' : '#d8d2c0';
      ctx.beginPath(); ctx.moveTo(-r * 0.32, -r * 0.55); ctx.quadraticCurveTo(0, -r * 0.78, r * 0.32, -r * 0.55); ctx.lineTo(r * 0.24, -r * 0.05); ctx.quadraticCurveTo(0, r * 0.12, -r * 0.24, -r * 0.05); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0a0d12';
      ctx.beginPath(); ctx.ellipse(-r * 0.13, -r * 0.38, r * 0.08, r * 0.11, 0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.13, -r * 0.38, r * 0.08, r * 0.11, -0.2, 0, TAU); ctx.fill();
      ctx.fillRect(-r * 0.12, -r * 0.12, r * 0.24, r * 0.04);
      for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.05 - 1, -r * 0.13, 1.2, r * 0.08);
      ctx.restore();
    },
    wraith(ctx, b, time, F) {
      const bob = Math.sin(time * 2.2) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(b.x + 4, b.y + b.r * 0.9, b.r * 0.9, b.r * 0.35, 0, 0, TAU); ctx.fill();
      ctx.save();
      ctx.globalAlpha *= 0.86 + Math.sin(time * 17) * 0.06;
      if (b.hitFlash > 0) { DRAW.wraithBody(ctx, b, b.x, b.y + bob, 1, time, true); }
      else DRAW.wraithBody(ctx, b, b.x, b.y + bob, 1, time, false);
      ctx.restore();
    },
    binary(ctx, b, time, F) {
      const r = b.r, cores = b._labCores();
      DRAW.shadow(ctx, b, 1, 0.8);
      ctx.save(); ctx.translate(b.x, b.y);
      // gyroscope frame
      ctx.strokeStyle = F('#3a3f4c'); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke();
      ctx.save(); ctx.rotate(b.labTwinA); ctx.scale(1, 0.35);
      ctx.strokeStyle = F('#545b6b'); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke(); ctx.restore();
      ctx.fillStyle = F('#1b1e26'); ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();
      ctx.restore();
      cores.forEach((c, i) => {
        ctx.save(); ctx.translate(c.x, c.y);
        ctx.fillStyle = F('#20232c'); ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, TAU); ctx.fill();
        ctx.strokeStyle = F(i ? '#ff3b5c' : '#3fd8ff'); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.42, time * (i ? -3 : 3), time * (i ? -3 : 3) + 4.2); ctx.stroke();
        ctx.fillStyle = i ? '#ff6b81' : '#7fe3ff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill();
        ctx.restore();
      });
    },
    tempest(ctx, b, time, F) {
      const r = b.r;
      DRAW.shadow(ctx, b, 1.2, 1);
      ctx.save(); ctx.translate(b.x, b.y);
      // storm clouds
      for (let i = 0; i < 7; i++) {
        const a = -b.ringSpin * 0.6 + i / 7 * TAU, d = r * 1.15 + Math.sin(time * 2 + i) * 4;
        ctx.fillStyle = 'rgba(70,82,100,0.55)';
        ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.32 + (i % 3) * 3, 0, TAU); ctx.fill();
      }
      // faceted crystal star
      ctx.rotate(b.ringSpin * 0.5);
      for (let i = 0; i < 16; i++) {
        const a0 = i / 16 * TAU, a1 = (i + 1) / 16 * TAU, rr = i % 2 ? r * 0.62 : r * 1.12;
        const rr2 = (i + 1) % 2 ? r * 0.62 : r * 1.12;
        ctx.fillStyle = F(i % 2 ? '#8fb8d8' : '#cfeaff');
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr); ctx.lineTo(Math.cos(a1) * rr2, Math.sin(a1) * rr2); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = F('#22324a'); polyPath(ctx, 8, r * 0.46, 0); ctx.fill();
      ctx.rotate(-b.ringSpin * 0.5 + b.angle);
      ctx.fillStyle = '#eaf8ff'; ctx.beginPath(); ctx.ellipse(r * 0.08, 0, r * 0.24, r * 0.16, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#123'; ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.08, 0, TAU); ctx.fill();
      ctx.restore();
    }
  };

  /* ------------------------ Signature attacks ------------------------ */
  // tele: telegraph seconds (scaled by tier), begin(b, atk, game, p), run(...) must call b._endAttack().
  const SIG = {
    searchlight: {
      tele: 0.55, color: '#ffe27a', label: 'Searchlight sweep → locks on & bursts',
      begin(b, atk, game, p) {
        atk.dir = U.chance(0.5) ? 1 : -1;
        atk.half = (b.phase === 3 ? 0.27 : 0.21) * Math.min(1.3, b.labS.sig);
        atk.from = atk.aim - atk.dir * 1.15; atk.cone = atk.from; atk.sweeps = b.phase === 3 ? 2 : 1; atk.done = 0;
      },
      run(b, atk, dt, game, p) {
        if (atk.locked) {
          b.angle = atk.cone = U.turnTowards(atk.cone, Math.atan2(p.y - b.y, p.x - b.x), dt * 5);
          atk.timer -= dt;
          if (atk.timer > 0) return;
          b._orb(game, atk.cone + U.randSpread() * 0.05, 720, 16, '#ffe27a');
          game.onBossFired(b);
          atk.timer = 0.09; atk.shots++;
          if (atk.shots >= 5 + b.phase * 2) b._endAttack();
          return;
        }
        atk.cone += atk.dir * dt * 1.65 * b.labS.sig;
        b.angle = atk.cone;
        const d = U.dist(b.x, b.y, p.x, p.y);
        if (p && !p.dead && d < 650 && Math.abs(U.angleDiff(atk.cone, Math.atan2(p.y - b.y, p.x - b.x))) < atk.half && los(game, b.x, b.y, p.x, p.y)) {
          atk.locked = true; atk.timer = 0.12; atk.shots = 0;
          if (game.audio && game.audio.telegraph) game.audio.telegraph();
          return;
        }
        if (Math.abs(U.angleDiff(atk.from, atk.cone)) > 2.3) {
          if (++atk.done >= atk.sweeps) { b._endAttack(); return; }
          atk.dir *= -1; atk.from = atk.cone;
        }
      },
      overlay(b, atk, ctx, time, k) {
        const a = atk.stage === 'tele' ? atk.aim : atk.cone, half = atk.half || 0.21;
        ctx.fillStyle = U.rgba(atk.locked ? '#ff3355' : '#ffe27a', atk.stage === 'tele' ? 0.06 + k * 0.1 : 0.16);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, 600, a - half, a + half); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = U.rgba(atk.locked ? '#ff3355' : '#ffe27a', 0.5); ctx.lineWidth = 1.5; ctx.stroke();
      }
    },
    quake: {
      tele: 0.7, color: '#c9d1dc', label: 'Ground slam → expanding shockwave rings (roll through)',
      begin(b, atk) { atk.n = b.phase === 3 ? 3 : 2; atk.timer = 0; atk.shots = 0; },
      run(b, atk, dt, game) {
        atk.timer -= dt;
        if (atk.timer > 0) return;
        b._labRing(game, 300 + b.phase * 25, b.phase === 3 ? 24 : 20);
        game.onBossFired(b, true);
        atk.shots++; atk.timer = 0.42;
        if (atk.shots >= atk.n) b._endAttack();
      },
      overlay(b, atk, ctx, time, k) {
        if (atk.stage !== 'tele') return;
        ctx.strokeStyle = U.rgba('#c9d1dc', 0.3 + k * 0.6); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 8 + (1 - k) * 60, 0, TAU); ctx.stroke();
      }
    },
    barrage: {
      tele: 0.6, color: '#ff9f43', label: 'Creeping barrage walking through your position',
      begin(b, atk, game, p) {
        const a = Math.atan2(p.y - b.y, p.x - b.x), n = Math.round((7 + b.phase * 2) * Math.min(1.25, b.labS.sig));
        const lines = b.phase === 3 ? [-70, 70] : [0];
        lines.forEach((off, li) => {
          for (let i = 0; i < n; i++) {
            const d = 90 + i * 72, x = b.x + Math.cos(a) * d - Math.sin(a) * off, y = b.y + Math.sin(a) * d + Math.cos(a) * off;
            if (solidAt(game, x, y)) continue;
            game.hazards.addStrike(x, y, 58, (0.55 + i * 0.1 + li * 0.05) * b.labS.tele, 26);
          }
        });
        game.onBossFired(b, true);
      },
      run(b, atk) { if (atk.t > 0.4) b._endAttack(); },
      overlay(b, atk, ctx, time, k) {
        if (atk.stage !== 'tele') return;
        ctx.strokeStyle = U.rgba('#ff9f43', 0.3 + k * 0.5); ctx.lineWidth = 6; ctx.setLineDash([4, 10]);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(atk.aim) * 300 * k, b.y + Math.sin(atk.aim) * 300 * k); ctx.stroke(); ctx.setLineDash([]);
      }
    },
    sentry: {
      tele: 0.8, color: '#ffb347', label: 'Deploys sentry pods (shoot them down, 5 hits)',
      begin(b, atk, game, p) {
        const alive = b.labEnts.filter(e => e.type === 'pod').length;
        const n = Math.max(0, Math.min((b.phase === 3 ? 3 : 2), 3 - alive));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, q = inArena(b, p.x + Math.cos(a) * 240, p.y + Math.sin(a) * 240);
          if (solidAt(game, q.x, q.y)) continue;
          b._labSpawn({ type: 'pod', x: q.x, y: q.y, t: 0, life: 10, hp: 5, fire: 0.6 + i * 0.4, rate: 1.4 / b.labS.sig, aim: a + Math.PI });
          puff(game, q.x, q.y, '#ffb347');
        }
        game.onBossFired(b);
      },
      run(b, atk) { if (atk.t > 0.35) b._endAttack(); },
      overlay(b, atk, ctx, time, k) {
        if (atk.stage !== 'tele') return;
        ctx.strokeStyle = U.rgba('#ffb347', 0.3 + k * 0.6); ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) { const a = time * 3 + i * TAU / 3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 20, a, a + 0.8); ctx.stroke(); }
      }
    },
    singularity: {
      tele: 0.8, color: '#a68bff', label: 'Gravity well pulls you in while the spiral fires',
      begin(b, atk) { atk.spin = b.ringSpin; atk.timer = 0; },
      run(b, atk, dt, game, p) {
        if (p && !p.dead) {
          const d = U.dist(p.x, p.y, b.x, b.y);
          if (d > b.r + 10 && d < 900) {
            const pull = Math.min(195, (110 + b.phase * 30) * b.labS.sig) * dt, a = Math.atan2(b.y - p.y, b.x - p.x);
            shove(game, p, Math.cos(a) * pull, Math.sin(a) * pull);
          }
        }
        atk.timer -= dt;
        if (atk.timer <= 0) {
          atk.timer = 0.17;
          for (let k = 0; k < 2; k++) b._orb(game, atk.spin + k * Math.PI, 250, 9, '#a68bff');
          atk.spin += 0.38;
          if (atk.shots++ % 4 === 0) game.onBossFired(b);
        }
        if (atk.t > 2.3) {
          const n = 18 + b.phase * 2;
          for (let i = 0; i < n; i++) b._orb(game, i / n * TAU + atk.spin, 270, 12, '#d6c9ff');
          game.onBossFired(b, true);
          light(game, b.x, b.y, 320, '#a68bff', 0.7, 0.4);
          b._endAttack();
        }
      },
      overlay(b, atk, ctx, time, k) {
        const prog = atk.stage === 'tele' ? k : 1;
        ctx.strokeStyle = U.rgba('#a68bff', 0.25 + prog * 0.35); ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const rr = ((time * 220 + i * 140) % 420) + b.r;
          ctx.beginPath(); ctx.arc(b.x, b.y, 460 - rr, 0, TAU); ctx.stroke();
        }
      }
    },
    stalk: {
      tele: 0.45, color: '#c7ff5a', label: 'Optical cloak → flanks behind you → pounce',
      begin(b, atk) { atk.phaseT = 0; atk.mode = 'cloak'; },
      run(b, atk, dt, game, p) {
        if (atk.mode === 'cloak') {
          b.labAlpha = Math.max(0.07, (b.labAlpha === undefined ? 1 : b.labAlpha) - dt * 3);
          const back = Math.atan2(p.y - b.y, p.x - b.x);
          const pa = p.angle !== undefined ? p.angle : back;
          const q = inArena(b, p.x - Math.cos(pa) * 190, p.y - Math.sin(pa) * 190);
          const a = Math.atan2(q.y - b.y, q.x - b.x), sp = 430 * b.labS.move;
          if (U.dist(b.x, b.y, q.x, q.y) > 12) shove(game, b, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
          b.moveX = b.x; b.moveY = b.y;
          if (atk.t > 2.0) { atk.mode = 'wind'; atk.t = 0; b.labAlpha = 1; puff(game, b.x, b.y, '#c7ff5a'); atk.aim = Math.atan2(p.y - b.y, p.x - b.x); }
          return;
        }
        if (atk.mode === 'wind') {
          atk.aim = U.turnTowards(atk.aim, Math.atan2(p.y - b.y, p.x - b.x), dt * 3); b.angle = atk.aim;
          if (atk.t > 0.38 * b.labS.tele) { atk.mode = 'pounce'; atk.t = 0; atk.hit = false; if (game.audio && game.audio.melee) game.audio.melee(b.x, b.y); }
          return;
        }
        b.labPounce = 0.2;
        const hitWall = C && C.moveCircle ? C.moveCircle(game.map, b, Math.cos(atk.aim) * 980 * dt, Math.sin(atk.aim) * 980 * dt, b.r) : false;
        if (!atk.hit && U.dist(b.x, b.y, p.x, p.y) < b.r + (p.r || 15) + 8) {
          atk.hit = true;
          if (hurt(b, game, 28, b.x, b.y) && p.knock) p.knock(Math.cos(atk.aim) * 600, Math.sin(atk.aim) * 600);
        }
        if (hitWall || atk.t > 0.36) { b.moveX = b.x; b.moveY = b.y; game.onBossFired(b); b._endAttack(); }
      },
      overlay(b, atk, ctx, time) {
        if (atk.mode === 'wind') {
          ctx.strokeStyle = U.rgba('#c7ff5a', 0.75); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(atk.aim) * 360, b.y + Math.sin(atk.aim) * 360); ctx.stroke();
        } else if (atk.mode === 'cloak') {
          ctx.strokeStyle = U.rgba('#c7ff5a', 0.18 + Math.sin(time * 20) * 0.08); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.1, 0, TAU); ctx.stroke();
        }
      }
    },
    traps: {
      tele: 0.5, color: '#9a9478', label: 'Scatters snap traps on your path',
      begin(b, atk, game, p) {
        const n = b.phase === 3 ? 4 : 3, vx = p.vx || 0, vy = p.vy || 0;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, d = U.rand(60, 170), q = inArena(b, p.x + vx * 0.6 + Math.cos(a) * d, p.y + vy * 0.6 + Math.sin(a) * d);
          if (solidAt(game, q.x, q.y)) continue;
          b._labSpawn({ type: 'trap', x: q.x, y: q.y, t: 0, arm: 0.8, life: 12, r: 26, snap: -1, dmg: 22 });
        }
        game.onBossFired(b);
      },
      run(b, atk) { if (atk.t > 0.3) b._endAttack(); }
    },
    gridlock: {
      tele: 0.3, color: '#e2bd55', label: 'Laser gridlock across the arena (one beam is aimed at you)',
      begin(b, atk, game, p) {
        const a = b.arena, n = 2 + b.phase + (b.labS.sig > 1.35 ? 1 : 0), warn = 1.15 * b.labS.tele;
        for (let i = 0; i < n; i++) {
          const horiz = i % 2 === 0;
          const pos = i === 0 ? (horiz ? p.y : p.x) : (horiz ? U.rand(a.y + 40, a.y + a.h - 40) : U.rand(a.x + 40, a.x + a.w - 40));
          b._labSpawn(horiz
            ? { type: 'beam', x0: a.x, y0: pos, x1: a.x + a.w, y1: pos, w: 16, t: -i * 0.12, warn, live: 0.4, dmg: 30 }
            : { type: 'beam', x0: pos, y0: a.y, x1: pos, y1: a.y + a.h, w: 16, t: -i * 0.12, warn, live: 0.4, dmg: 30 });
        }
        game.onBossFired(b, true);
      },
      run(b, atk) { if (atk.t > 0.5) b._endAttack(); },
      overlay(b, atk, ctx, time, k) {
        if (atk.stage !== 'tele') return;
        ctx.strokeStyle = U.rgba('#e2bd55', 0.4 + k * 0.5); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.3 + k * 18, 0, TAU); ctx.stroke();
      }
    },
    eruption: {
      tele: 0.7, color: '#ff6a1a', label: 'Lobs magma bombs that burst into embers + lava',
      begin(b, atk, game, p) {
        const n = b.phase === 3 ? 5 : (b.phase === 2 ? 4 : 3);
        for (let i = 0; i < n; i++) {
          const lead = i === 0 ? 0.5 : 0, a = Math.random() * TAU, d = i === 0 ? 0 : U.rand(70, 210);
          const q = inArena(b, p.x + (p.vx || 0) * lead + Math.cos(a) * d, p.y + (p.vy || 0) * lead + Math.sin(a) * d);
          b._labSpawn({ type: 'magma', sx: b.x, sy: b.y, tx: q.x, ty: q.y, t: -i * 0.14, dur: 0.95 * b.labS.tele, rot: Math.random() * TAU });
        }
        game.onBossFired(b, true);
      },
      run(b, atk) { if (atk.t > 0.4) b._endAttack(); },
      overlay(b, atk, ctx, time, k) {
        if (atk.stage !== 'tele') return;
        glow(ctx, b.x, b.y, b.r * (1.4 + k), '#ff6a1a', 0.3 + k * 0.4);
      }
    },
    phantoms: {
      tele: 0.6, color: '#9dffb0', label: 'Summons phantom clones that circle and fire',
      begin(b, atk, game, p) {
        const alive = b.labEnts.filter(e => e.type === 'phantom').length;
        const n = Math.max(0, Math.min(b.phase === 3 ? 3 : 2, 3 - alive)), base = Math.random() * TAU;
        for (let i = 0; i < n; i++) {
          const ang = base + i / n * TAU;
          b._labSpawn({ type: 'phantom', x: b.x, y: b.y, ang, dist: 270, spin: (i % 2 ? -0.5 : 0.5), t: 0, life: 7.5, hp: 3, fire: 0.9 + i * 0.5, rate: 1.7 / b.labS.sig });
        }
        game.onBossFired(b);
      },
      run(b, atk) { if (atk.t > 0.35) b._endAttack(); },
      overlay(b, atk, ctx, time, k) {
        if (atk.stage !== 'tele') return;
        ctx.strokeStyle = U.rgba('#9dffb0', 0.3 + k * 0.5); ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { const a = time * 4 + i * TAU / 4; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * 40 * k, b.y + Math.sin(a) * 40 * k, 8, 0, TAU); ctx.stroke(); }
      }
    },
    souls: {
      tele: 0.5, color: '#5dffa0', label: 'Releases homing soul wisps (shoot them)',
      begin(b, atk, game, p) {
        const n = b.phase === 3 ? 7 : 5, a0 = Math.atan2(p.y - b.y, p.x - b.x) + Math.PI;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i - (n - 1) / 2) * 0.45;
          b._labSpawn({ type: 'soul', x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, a, speed: 165 * b.labS.shot, turn: 1.7 + b.phase * 0.25, t: 0, life: 5, dmg: 15 });
        }
        game.onBossFired(b);
      },
      run(b, atk) { if (atk.t > 0.3) b._endAttack(); }
    },
    lash: {
      tele: 0.7, color: '#7fe3ff', label: 'Cores split wide and sweep the arena with their tether',
      begin(b, atk) { atk.dir = U.chance(0.5) ? 1 : -1; },
      run(b, atk, dt, game, p) {
        const dur = 2.6, k = atk.t;
        b.labSpread = k < 0.5 ? k / 0.5 : (k > dur - 0.4 ? Math.max(0, (dur - k) / 0.4) : 1);
        b.labTwinSpeed = atk.dir * (2.2 + b.phase * 0.25) * Math.min(1.25, b.labS.sig);
        if (Math.random() < dt * 4) game.onBossFired(b);
        if (k > dur) { b.labSpread = 0; b.labTwinSpeed = 1.2; b._endAttack(); }
      },
      overlay(b, atk, ctx, time, k) {
        if (atk.stage !== 'tele') return;
        ctx.strokeStyle = U.rgba('#ff6b81', 0.2 + k * 0.35); ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
        ctx.beginPath(); ctx.arc(b.x, b.y, 30 + 190 + b.r * 0.42, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
    },
    polarity: {
      tele: 0.5, color: '#ff6b81', label: 'Alternating cyan / crimson rings from each core',
      begin(b, atk) { atk.timer = 0; },
      run(b, atk, dt, game) {
        atk.timer -= dt;
        if (atk.timer > 0) return;
        const cores = b._labCores(), n = 10 + b.phase;
        cores.forEach((c, i) => {
          if ((atk.shots + i) % 2) return;
          for (let j = 0; j < n; j++) shotFrom(b, game, c.x, c.y, j / n * TAU + atk.shots * 0.3, 250, 11, i ? '#ff6b81' : '#7fe3ff');
        });
        game.onBossFired(b, true);
        atk.shots++; atk.timer = 0.42;
        if (atk.shots >= 4) b._endAttack();
      }
    },
    tornado: {
      tele: 0.7, color: '#9fb4c8', label: 'Spawns hunting tornadoes that drag and shred',
      begin(b, atk, game) {
        const alive = b.labEnts.filter(e => e.type === 'tornado').length;
        const n = Math.max(0, Math.min(b.phase === 3 ? 3 : 2, 3 - alive));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          b._labSpawn({ type: 'tornado', id: (b.labTid = (b.labTid || 0) + 1), x: b.x + Math.cos(a) * 60, y: b.y + Math.sin(a) * 60, a, speed: 120 * b.labS.move, turn: 0.9, r: 40, t: 0, life: 7 });
        }
        game.onBossFired(b);
      },
      run(b, atk) { if (atk.t > 0.4) b._endAttack(); }
    },
    chain: {
      tele: 0.35, color: '#bfefff', label: 'Chain lightning that hops through your position',
      begin(b, atk, game, p) {
        let x = b.x, y = b.y;
        const hops = 3 + (b.phase === 3 ? 1 : 0), warn = 0.85 * b.labS.tele;
        for (let i = 0; i < hops; i++) {
          let tx, ty;
          if (i === 0) { tx = p.x + (p.vx || 0) * 0.3; ty = p.y + (p.vy || 0) * 0.3; }
          else { const a = Math.random() * TAU; const q = inArena(b, x + Math.cos(a) * 200, y + Math.sin(a) * 200); tx = q.x; ty = q.y; }
          b._labSpawn({ type: 'zap', x0: x, y0: y, x1: tx, y1: ty, t: -i * 0.18, warn, dmg: 24 });
          x = tx; y = ty;
        }
        game.onBossFired(b, true);
      },
      run(b, atk) { if (atk.t > 0.5) b._endAttack(); }
    }
  };

  /* ----------------------------- Passives ---------------------------- */
  const PASSIVE = {
    sentinel(b, dt, game, p) {
      if (p) b.labLook = Math.atan2(p.y - b.y, p.x - b.x) - b.angle;
      b.labScan = (b.labScan || 0) + dt;
      if (b.labScan >= 3.0 && p && !p.dead) {
        b.labScan = 0;
        if (U.dist(b.x, b.y, p.x, p.y) < 700 && los(game, b.x, b.y, p.x, p.y)) {
          b.angle = U.turnTowards(b.angle, Math.atan2(p.y - b.y, p.x - b.x), 1.2);
          if (game.particles && game.particles.spark) game.particles.spark(b.x, b.y, 6, '#ffd27a');
        }
      }
    },
    ram(b, dt, game) {
      b.labTread = (b.labTread || 0) + Math.hypot(b.vx, b.vy) * dt * 0.5;
      b.labPlate = Math.max(0, (b.labPlate || 0) - dt);
      if (Math.random() < dt * 4) smoke(game, b.x - Math.cos(b.angle) * b.r, b.y - Math.sin(b.angle) * b.r, '#3a3d44', 24);
    },
    crawler(b, dt) {
      const sp = Math.hypot(b.vx, b.vy);
      b.labGait = (b.labGait || 0) + dt * (2 + sp * 0.06);
      if (sp > 20) b.labHeading = U.turnTowards(b.labHeading || 0, Math.atan2(b.vy, b.vx), dt * 2.5);
    },
    horizon(b, dt, game, p, active) {
      const n = 3 + b.phase, sh = b.labShards || (b.labShards = []);
      while (sh.length < n) sh.push({ a: sh.length / n * TAU, x: b.x, y: b.y });
      const spd = (1.4 + b.phase * 0.35) * b.labS.sig;
      sh.forEach((s, i) => {
        s.a += dt * spd;
        const rad = b.r + 30 + Math.sin(b.labClock * 2 + i) * 6;
        s.x = b.x + Math.cos(s.a) * rad; s.y = b.y + Math.sin(s.a) * rad;
      });
      // shards eat bullets and slice the operator
      eachPlayerBullet(game, pr => sh.some(s => U.dist(pr.x, pr.y, s.x, s.y) < 13) ? (sparks(game, pr.x, pr.y, 0, 2, '#b9a8ff', 160), true) : false);
      if (active && p) {
        for (const s of sh) if (U.dist(p.x, p.y, s.x, s.y) < (p.r || 15) + 8) { hurt(b, game, 14, s.x, s.y, 'shard', 0.6); break; }
        if (U.dist(p.x, p.y, b.x, b.y) < b.r + (p.r || 15)) hurt(b, game, 18, b.x, b.y, 'core', 0.6);
      }
    },
    stalker(b, dt) {
      b.labPounce = Math.max(0, (b.labPounce || 0) - dt);
      if (!b.attack || b.attack.name !== 'stalk') b.labAlpha = Math.min(1, (b.labAlpha === undefined ? 1 : b.labAlpha) + dt * 3);
    },
    sovereign(b, dt, game, p, active) {
      const n = b.phase === 3 ? 4 : 3, ds = b.labDrones || (b.labDrones = []);
      while (ds.length < n) ds.push({ alive: true, hp: 6, fire: 1.2 + ds.length * 0.8, respawn: 0, x: b.x, y: b.y, aim: 0, flash: 0 });
      ds.forEach((d, i) => {
        const a = b.labClock * 0.9 + i / ds.length * TAU;
        d.x = b.x + Math.cos(a) * (b.r + 58); d.y = b.y + Math.sin(a) * (b.r + 58);
        d.flash = Math.max(0, d.flash - dt);
        if (!d.alive) { d.respawn -= dt; if (d.respawn <= 0) { d.alive = true; d.hp = 6; puff(game, d.x, d.y, '#e2bd55'); } return; }
        if (p) d.aim = Math.atan2(p.y - d.y, p.x - d.x);
        eachPlayerBullet(game, pr => {
          if (!d.alive || U.dist(pr.x, pr.y, d.x, d.y) > 15) return false;
          d.hp--; d.flash = 0.08;
          if (d.hp <= 0) { d.alive = false; d.respawn = 14 / b.labS.sig; puff(game, d.x, d.y, '#e2bd55'); light(game, d.x, d.y, 180, '#e2bd55', 0.6, 0.3); }
          return true;
        });
        if (!active || !p) return;
        d.fire -= dt;
        if (d.fire <= 0) { d.fire = 2.6 / b.labS.sig; shotFrom(b, game, d.x, d.y, d.aim, 380, 10, '#ffe08a'); }
      });
    },
    forge(b, dt, game, p, active) {
      const sp = Math.hypot(b.vx, b.vy);
      b.labGait = (b.labGait || 0) + dt * (1.5 + sp * 0.05);
      if (Math.random() < dt * 6) sparks(game, b.x + U.randSpread() * b.r, b.y + U.randSpread() * b.r, -Math.PI / 2, 1, '#ff7a2a', 120);
      if (!active || b.phase < 2) return;
      b.labTrail = (b.labTrail || 0) - dt;
      if (b.labTrail <= 0 && sp > 25) {
        b.labTrail = b.phase === 3 ? 0.4 : 0.6;
        b._labSpawn({ type: 'lava', x: b.x - Math.cos(b.angle) * b.r * 0.6, y: b.y - Math.sin(b.angle) * b.r * 0.6, r: 30, life: 4.5, dps: 18, t: 0, rot: Math.random() * TAU });
      }
    },
    wraith(b, dt, game) {
      if (Math.random() < dt * 5) smoke(game, b.x + U.randSpread() * b.r * 0.6, b.y + b.r * 0.6, '#2c4a3a', 26);
    },
    binary(b, dt, game, p, active) {
      if (b.labSpread === undefined) b.labSpread = 0;
      const lashing = b.attack && b.attack.name === 'lash' && b.attack.stage === 'run';
      if (!lashing) { b.labSpread = U.approach(b.labSpread, 0, dt * 2.5); b.labTwinSpeed = 1.2; } // interrupted by a phase change / stun
      b.labTwinA = (b.labTwinA || 0) + dt * (b.labTwinSpeed || 1.2);
      if (!active || !p) return;
      const cs = b._labCores();
      if (b.labSpread > 0.15 && segDist(p.x, p.y, cs[0].x, cs[0].y, cs[1].x, cs[1].y) < 12 + (p.r || 15)) hurt(b, game, 26, p.x, p.y, 'tether', 0.5);
    },
    tempest(b, dt, game, p, active) {
      if (!active || !p) return;
      b.labStorm = (b.labStorm === undefined ? 2.5 : b.labStorm) - dt;
      if (b.labStorm > 0) return;
      b.labStorm = (b.phase === 3 ? 2.2 : 3.2) / b.labS.sig;
      const n = b.phase === 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const lead = i === 0 ? 0.55 : 0;
        const q = inArena(b, p.x + (p.vx || 0) * lead + U.randSpread() * 70, p.y + (p.vy || 0) * lead + U.randSpread() * 70);
        b._labSpawn({ type: 'thunder', x: q.x, y: q.y, r: 62, warn: 0.95 * b.labS.tele, t: -i * 0.3, dmg: 26 });
      }
    }
  };

  /* --------------------------- Overlays (glow) ------------------------ */
  const GLOW = {
    sentinel(ctx, b, time) {
      const c = b.lab.pal.eye[b.phase - 1];
      const ex = b.x + Math.cos(b.angle) * b.r * 0.2, ey = b.y + Math.sin(b.angle) * b.r * 0.2;
      glow(ctx, ex, ey, b.r * 1.3, c, 0.55 + Math.sin(time * 5) * 0.15);
    },
    ram(ctx, b, time) {
      for (let s = -1; s <= 1; s += 2) {
        const x = b.x + Math.cos(b.angle) * -b.r * 1.15 - Math.sin(b.angle) * s * b.r * 0.2;
        const y = b.y + Math.sin(b.angle) * -b.r * 1.15 + Math.cos(b.angle) * s * b.r * 0.2;
        glow(ctx, x, y, 18, '#ff8a1a', 0.5 + Math.random() * 0.3);
      }
    },
    crawler(ctx, b, time) {
      const mx = b.x + Math.cos(b.angle) * b.r * 1.35, my = b.y + Math.sin(b.angle) * b.r * 1.35;
      glow(ctx, mx, my, 14, '#ff9f43', 0.5 + Math.sin(time * 8) * 0.2);
    },
    horizon(ctx, b, time) {
      glow(ctx, b.x, b.y, b.r * 2.4, '#6a4cff', 0.35);
      (b.labShards || []).forEach(s => glow(ctx, s.x, s.y, 16, '#b9a8ff', 0.6));
    },
    stalker(ctx, b, time) {
      const a = b.labAlpha === undefined ? 1 : b.labAlpha;
      for (let i = -1; i <= 1; i++) {
        const x = b.x + Math.cos(b.angle) * b.r * 0.62 - Math.sin(b.angle) * i * 5, y = b.y + Math.sin(b.angle) * b.r * 0.62 + Math.cos(b.angle) * i * 5;
        glow(ctx, x, y, 9, '#ff3355', (0.5 + 0.5 * a) * (0.8 + Math.sin(time * 7 + i) * 0.2));
      }
    },
    sovereign(ctx, b, time) {
      glow(ctx, b.x, b.y, b.r * 1.8, '#e2bd55', 0.25);
      (b.labDrones || []).forEach(d => { if (d.alive) glow(ctx, d.x, d.y, 16, '#ffe08a', 0.45); });
      ctx.strokeStyle = U.rgba('#e2bd55', 0.35); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.35, b.labClock, b.labClock + 4.6); ctx.stroke();
    },
    forge(ctx, b, time) {
      glow(ctx, b.x, b.y, b.r * 1.9, '#ff5a1a', 0.3 + Math.sin(time * 3.4) * 0.08 + b.phase * 0.05);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = U.rgba('#ff8a3a', 0.55 + Math.sin(time * 3.4) * 0.25); ctx.lineWidth = 2;
      b.labCracks.forEach(cr => { ctx.beginPath(); ctx.moveTo(cr[0] * b.r, cr[1] * b.r); for (let i = 2; i < cr.length; i += 2) ctx.lineTo(cr[i] * b.r, cr[i + 1] * b.r); ctx.stroke(); });
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    },
    wraith(ctx, b, time) {
      const bob = Math.sin(time * 2.2) * 4, y = b.y + bob - b.r * 0.38;
      glow(ctx, b.x - b.r * 0.13, y, 14, '#5dffa0', 0.85);
      glow(ctx, b.x + b.r * 0.13, y, 14, '#5dffa0', 0.85);
      ctx.fillStyle = U.rgba('#b6ffc8', 0.9);
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath(); ctx.moveTo(b.x + s * b.r * 0.13 - 4, y + 3); ctx.quadraticCurveTo(b.x + s * b.r * 0.13, y - 12 - Math.sin(time * 12 + s) * 4, b.x + s * b.r * 0.13 + 4, y + 3); ctx.fill();
      }
      glow(ctx, b.x, b.y, b.r * 2, '#2fbf6a', 0.18);
    },
    binary(ctx, b, time) {
      const cs = b._labCores();
      glow(ctx, cs[0].x, cs[0].y, b.r * 0.9, '#3fd8ff', 0.6);
      glow(ctx, cs[1].x, cs[1].y, b.r * 0.9, '#ff3b5c', 0.6);
      ctx.globalCompositeOperation = 'lighter';
      const live = b.labSpread > 0.15;
      ctx.strokeStyle = U.rgba('#e8f6ff', live ? 0.95 : 0.55); ctx.lineWidth = live ? 3 : 1.5;
      ctx.beginPath(); jagged(ctx, cs[0].x, cs[0].y, cs[1].x, cs[1].y, live ? 14 : 5, live ? 9 : 4); ctx.stroke();
      if (live) { ctx.strokeStyle = U.rgba('#7fe3ff', 0.35); ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(cs[0].x, cs[0].y); ctx.lineTo(cs[1].x, cs[1].y); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    },
    tempest(ctx, b, time) {
      glow(ctx, b.x, b.y, b.r * 2.1, '#7fd4ff', 0.3);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = U.rgba('#dff6ff', 0.8); ctx.lineWidth = 1.5;
      const arcs = 2 + b.phase;
      for (let i = 0; i < arcs; i++) {
        if (Math.random() < 0.45) continue;
        const a = Math.random() * TAU, a2 = a + U.rand(0.5, 1.4);
        ctx.beginPath(); jagged(ctx, b.x + Math.cos(a) * b.r * 0.9, b.y + Math.sin(a) * b.r * 0.9, b.x + Math.cos(a2) * b.r * 1.3, b.y + Math.sin(a2) * b.r * 1.3, 5, 7); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  /* ------------------------------ Roster ----------------------------- */
  // Campaign order -> tier. Pools keep the v11 classics and add signatures.
  const ROSTER = {
    m3:  { tier: 1, look: 'sentinel', title: 'THE WARDEN', epithet: 'Sentinel Eye', fa: 'چشم نگهبان: رصد مداوم آرنا، نورافکن با قفل سریع و شلیک‌های رگباری سنگین.', r: 42,
           pal: { glow: '#ffd27a', orb: '#ffcf6b', eye: ['#ffb02e', '#ff4d3a', '#fff2c7'] },
           sigs: ['searchlight'], pools: [null, ['fan', 'searchlight', 'stream'], ['fan', 'searchlight', 'mortar', 'snipe', 'stream'], ['searchlight', 'spiral', 'mortar', 'charge', 'nova', 'summon']] },
    m5:  { tier: 2, look: 'ram', title: 'IRON WARDEN', epithet: 'Iron Ram', fa: 'قوچ آهنین: از جلو زره داره (پهلو و پشتش رو بزن)، با کوبیدن زمین موج ضربه می‌فرسته.', r: 44,
           pal: { glow: '#c9d1dc', orb: '#d7dee8' }, frontArmor: 0.35,
           sigs: ['quake'], pools: [null, ['charge', 'fan', 'quake'], ['charge', 'quake', 'mortar', 'fan'], ['charge', 'quake', 'nova', 'charge', 'summon']] },
    m8:  { tier: 3, look: 'crawler', title: 'SIEGE WARDEN', epithet: 'Siege Crawler', fa: 'خزنده محاصره: بمباران خزنده که از روت رد میشه + برجک‌های نگهبان که باید نابودشون کنی.', r: 42,
           pal: { glow: '#ff9f43', orb: '#ffb347' },
           sigs: ['barrage', 'sentry'], pools: [null, ['barrage', 'fan', 'mortar'], ['barrage', 'sentry', 'mines', 'stream'], ['barrage', 'sentry', 'mortar', 'nova', 'summon']] },
    m10: { tier: 4, look: 'horizon', title: 'VORTEX WARDEN', epithet: 'Event Horizon', fa: 'افق رویداد: ترکش‌های مداری گلوله‌هات رو می‌بلعن، سیاه‌چاله تو رو به سمت خودش می‌کشه.', r: 40,
           pal: { glow: '#a68bff', orb: '#b9a8ff' },
           sigs: ['singularity'], pools: [null, ['spiral', 'fan', 'singularity'], ['singularity', 'spiral', 'cross', 'stream'], ['singularity', 'spiral', 'cross', 'nova', 'summon']] },
    m13: { tier: 5, look: 'stalker', title: 'HUNTER WARDEN', epithet: 'Stalker', fa: 'شکارچی: نامرئی میشه، از پشت دورت می‌زنه و می‌پره رو سرت؛ تله‌ی آرواره‌ای هم می‌کاره.', r: 36,
           pal: { glow: '#c7ff5a', orb: '#d8ff7a' },
           sigs: ['stalk', 'traps'], pools: [null, ['snipe', 'traps', 'stalk'], ['stalk', 'snipe', 'traps', 'blink'], ['stalk', 'traps', 'snipe', 'blink', 'summon']] },
    m14: { tier: 6, look: 'sovereign', title: 'WARDEN PRIME', epithet: 'Sovereign', fa: 'فرمانروا: هاله‌ای از پهپادهای مسلح دورشه + شبکه‌ی لیزری که کل آرنا رو قفل می‌کنه.', r: 46,
           pal: { glow: '#e2bd55', orb: '#ffe08a', eye: ['#e2bd55', '#ff6b35', '#ffffff'] },
           sigs: ['gridlock'], pools: [null, ['fan', 'gridlock', 'snipe'], ['gridlock', 'cross', 'charge', 'mortar'], ['gridlock', 'nova', 'blink', 'spiral', 'summon']] },
    m18: { tier: 7, look: 'forge', title: 'FORGE TITAN', epithet: 'Molten Colossus', fa: 'تایتان کوره: پشت سرش گدازه جا می‌مونه، بمب ماگما پرت می‌کنه که به اخگر تبدیل میشه.', r: 46,
           pal: { glow: '#ff6a1a', orb: '#ff7a2a' },
           sigs: ['eruption'], pools: [null, ['eruption', 'fan', 'mines'], ['eruption', 'charge', 'mines', 'mortar'], ['eruption', 'charge', 'nova', 'mines', 'summon']] },
    c3:  { tier: 8, look: 'binary', title: 'TWIN-CORE WARDEN', epithet: 'Binary Star', fa: 'ستاره دوتایی: دو هسته دور هم می‌چرخن، شلاق برقی بینشون کل آرنا رو جارو می‌کنه.', r: 40,
           pal: { glow: '#7fe3ff', orb: '#ff6b81' },
           sigs: ['lash', 'polarity'], pools: [null, ['polarity', 'cross', 'lash'], ['lash', 'polarity', 'cross', 'mortar'], ['lash', 'polarity', 'nova', 'charge', 'summon']] },
    m23: { tier: 9, look: 'wraith', title: 'OSSUARY WRAITH', epithet: 'Bone Choir', fa: 'شبح استخوان‌دان: کلون‌های شبحی می‌سازه که دورت می‌چرخن و شلیک می‌کنن + ارواح تعقیب‌کننده.', r: 38,
           pal: { glow: '#5dffa0', orb: '#9dffb0' },
           sigs: ['phantoms', 'souls'], pools: [null, ['souls', 'blink', 'fan'], ['phantoms', 'souls', 'blink', 'spiral'], ['phantoms', 'souls', 'blink', 'cross', 'snipe']] },
    m24: { tier: 10, look: 'tempest', title: 'TEMPEST WARDEN MK-II', epithet: 'Storm Sovereign', fa: 'فرمانروای طوفان: صاعقه‌ی دائمی، گردبادهای شکارچی و رعد زنجیره‌ای. سخت‌ترین باس.', r: 44,
           pal: { glow: '#7fd4ff', orb: '#bfefff' },
           sigs: ['chain', 'tornado'], pools: [null, ['chain', 'fan', 'snipe', 'spiral'], ['chain', 'tornado', 'cross', 'blink', 'mines'], ['chain', 'tornado', 'nova', 'blink', 'spiral', 'summon']] }
  };
  LB.ROSTER = ROSTER;
  LB.SIG = SIG;
  LB.ORDER = Object.keys(ROSTER).sort((a, b) => ROSTER[a].tier - ROSTER[b].tier);

  function rockShape(seed) {
    const rng = U.makeRng(seed), v = [];
    for (let i = 0; i < 13; i++) v.push(0.82 + rng() * 0.26);
    const cracks = [];
    for (let k = 0; k < 5; k++) {
      let a = rng() * TAU, d = 0.25; const c = [Math.cos(a) * d, Math.sin(a) * d];
      for (let s = 0; s < 3; s++) { a += (rng() - 0.5) * 0.9; d += 0.22; c.push(Math.cos(a) * d, Math.sin(a) * d); }
      cracks.push(c);
    }
    return { v, cracks };
  }

  /* ---------------------------- LabBoss ----------------------------- */
  class LabBoss extends Parent {
    constructor(x, y, arena, mk2, key) {
      super(x, y, arena, mk2);
      const g = BO.game;
      const mId = (g && g.mission && g.mission.id) || this.v11id;
      let id = key || (mId === 'm19' ? 'c3' : mId) || 'm3';
      if (id === 'm19') id = 'c3';
      const def = ROSTER[id] || ROSTER.m3;
      this.isLabBoss = true;
      this.lab = def;
      this.labKey = ROSTER[id] ? id : 'm3';
      this.labS = tierScale(def.tier);
      this.labEnts = [];
      this.labHit = Object.create(null);
      this.labClock = 0;
      this.r = def.r; this.def.r = def.r;
      if (this.v11) {
        this.v11.hp = this.labS.hp;
        this.v11.pools = def.pools.map(p => (p ? p.slice() : p));
        this.v11.tier = def.tier;
        this.v11.name = def.look;
      }
      this.maxHp = Math.round(6500 * this.labS.hp);
      this.hp = this.maxHp;
      if (def.look === 'forge') { const rs = rockShape(1818); this.labRock = rs.v; this.labCracks = rs.cracks; }
      this.labHeading = this.angle;
    }

    _labSpawn(e) { if (this.labEnts.length < 80) this.labEnts.push(e); return e; }

    _labRing(game, speed, w) {
      this._labSpawn({ type: 'ring', x: this.x, y: this.y, r: this.r, speed: speed * this.labS.shot, w, max: 640, dmg: 22, color: this.lab.pal.glow, hit: false });
      if (game.particles && game.particles.dust) game.particles.dust(this.x, this.y, 8);
      if (game.camera && game.camera.shake) U.safe('lab.shake', () => game.camera.shake(5, 0.2));
    }

    _labCores() {
      const d = 30 + (this.labSpread || 0) * 190, a = this.labTwinA || 0;
      return [{ x: this.x + Math.cos(a) * d, y: this.y + Math.sin(a) * d }, { x: this.x - Math.cos(a) * d, y: this.y - Math.sin(a) * d }];
    }

    update(dt, game) {
      if (LB.flags.freezeBoss) return;
      this.labClock += dt;
      const r = super.update(dt, game);
      const p = game.player;
      if (this.dead) { if (this.labEnts.length) this.labEnts.length = 0; return r; }
      const active = this.mode === 'fight' && !(this.stun > 0) && !suppressed();
      const pas = PASSIVE[this.lab.look];
      if (pas) U.safe('lab.passive.' + this.lab.look, () => pas(this, dt, game, p, active));
      for (let i = this.labEnts.length - 1; i >= 0; i--) {
        const e = this.labEnts[i], h = ENT[e.type];
        if (e.t !== undefined && e.t < 0) { e.t += dt; continue; } // staggered start
        let keep = false;
        U.safe('lab.ent.' + e.type, () => { keep = h ? h.update(this, e, dt, game, p) : false; });
        if (!keep) this.labEnts.splice(i, 1);
      }
      return r;
    }

    _updateMovement(dt, game, p) {
      const atk = this.attack;
      if (atk && atk.name === 'stalk' && atk.stage === 'run') return; // stalk drives its own motion
      if (atk && atk.name === 'lash' && atk.stage === 'run') { this.vx *= 0.9; this.vy *= 0.9; }
      const x0 = this.x, y0 = this.y;
      super._updateMovement(dt, game, p);
      const m = this.labS.move - 1;
      if (m > 0.001) shove(game, this, (this.x - x0) * m, (this.y - y0) * m);
    }

    _updateAttacks(dt, game, p) {
      const atk = this.attack;
      if (this.v11vent > 0 || !atk || !SIG[atk.name]) return super._updateAttacks(dt, game, p);
      const sig = SIG[atk.name];
      atk.t += dt;
      if (atk.stage === 'tele') {
        if (p) { atk.aim = U.turnTowards(atk.aim, Math.atan2(p.y - this.y, p.x - this.x), dt * 3); }
        if (atk.t >= sig.tele * this.labS.tele) { atk.stage = 'run'; atk.t = 0; if (sig.begin) sig.begin(this, atk, game, p); }
        return;
      }
      sig.run(this, atk, dt, game, p);
    }

    _v11pick(game) {
      let name = super._v11pick(game);
      // avoid stacking the same signature entity type past its cap
      if ((name === 'sentry' || name === 'phantoms' || name === 'tornado') && this.labEnts.filter(e => e.type === (name === 'sentry' ? 'pod' : name === 'phantoms' ? 'phantom' : 'tornado')).length >= 3) {
        const alt = (this.v11.pools[this.phase] || []).filter(n => n !== name && n !== 'summon');
        if (alt.length) name = U.pick(alt);
      }
      return name;
    }

    _endAttack() {
      super._endAttack();
      this.cooldown *= this.labS.cd;
      if (this.v11vent > 0 && this.v11 && this.v11vent === this.v11.vent) this.v11vent *= this.labS.vent;
    }

    _runCharge(atk, dt, game, p) {
      const was = atk.stage;
      super._runCharge(atk, dt, game, p);
      if (was === 'dash' && atk.stage === 'recover' && this.lab.look === 'ram' && this.phase >= 2) this._labRing(game, 320, 20);
    }

    _orb(game, angle, speed, damage, color) {
      return super._orb(game, angle, speed * this.labS.shot, damage * this.labS.dmg, color || this.lab.pal.orb);
    }

    takeDamage(amount, kx, ky) {
      let k = 1;
      const g = BO.game, p = g && g.player;
      if (this.lab.frontArmor && p && !this.invulnerable) {
        if (Math.abs(U.angleDiff(this.angle, Math.atan2(p.y - this.y, p.x - this.x))) < 0.62) { k = this.lab.frontArmor; this.labPlate = 0.08; }
      }
      if (this.lab.look === 'stalker' && this.labAlpha !== undefined && this.labAlpha < 0.5) k *= 1.35; // reward spotting it
      return super.takeDamage(amount * k, kx, ky);
    }

    draw(ctx, time) {
      if (this.dead && this.removeTimer <= 0) return;
      const t = U.isFiniteNumber(time) ? time : this.labClock;
      const flash = this.hitFlash > 0;
      const F = c => (flash ? '#ffffff' : c);
      ctx.save();
      if (this.dead) { ctx.globalAlpha = U.clamp(1 - this.deathTime * 0.35, 0.25, 1); ctx.translate(U.randSpread() * 4, U.randSpread() * 4); }
      const fn = DRAW[this.lab.look];
      U.safe('lab.draw.' + this.lab.look, () => fn(ctx, this, t, F));
      ctx.restore();
      // ground-level entities (pools, traps, pods) sit with the world layer
      this.labEnts.forEach(e => { if (e.type === 'lava' || e.type === 'trap' || e.type === 'pod') U.safe('lab.edraw.' + e.type, () => { ctx.save(); ENT[e.type].draw(this, e, ctx, t); ctx.restore(); }); });
    }

    drawOverlay(ctx, time, game) {
      const t = U.isFiniteNumber(time) ? time : this.labClock;
      // base + v11 overlay (telegraphs, vent ring, stun), recoloured glow
      const ss = BO.softSprite, mine = this.lab.pal.glow;
      if (ss) BO.softSprite = function () { return ss(mine); };
      try { super.drawOverlay(ctx, t, game); } finally { if (ss) BO.softSprite = ss; }
      this.labEnts.forEach(e => {
        if (e.t !== undefined && e.t < 0 && e.type !== 'beam') return;
        if (e.type === 'lava' || e.type === 'trap' || e.type === 'pod') return;
        U.safe('lab.edraw.' + e.type, () => { ctx.save(); ENT[e.type].draw(this, e, ctx, t); ctx.restore(); });
      });
      if (this.dead) return;
      const gl = GLOW[this.lab.look];
      if (gl) U.safe('lab.glow', () => { ctx.save(); gl(ctx, this, t); ctx.restore(); });
      const atk = this.attack;
      if (atk && SIG[atk.name] && SIG[atk.name].overlay) {
        const k = atk.stage === 'tele' ? U.clamp(atk.t / (SIG[atk.name].tele * this.labS.tele), 0, 1) : 1;
        U.safe('lab.sigov', () => { ctx.save(); SIG[atk.name].overlay(this, atk, ctx, t, k); ctx.restore(); });
      }
    }
  }
  LabBoss.isLab = true;

  /** Builds the lab boss for a roster key (or null for unknown keys). */
  LB.create = function (key, x, y, arena) {
    const k = key === 'm19' ? 'c3' : key;
    if (!ROSTER[k]) return null;
    return new LabBoss(x, y, arena, k === 'm24', k);
  };
  LB.LabBoss = LabBoss;
  BO.Boss = LabBoss;
  LB.describe = function (key) {
    const k = key === 'm19' ? 'c3' : key;
    const d = ROSTER[k];
    if (!d) return null;
    const s = tierScale(d.tier);
    return { key: k, tier: d.tier, title: d.title, epithet: d.epithet, fa: d.fa, color: d.pal.glow, hp: Math.round(6500 * s.hp), scale: s,
      signatures: d.sigs.map(n => ({ name: n, label: SIG[n].label, color: SIG[n].color })) };
  };

  if (BO.I18N && BO.I18N.extend) {
    BO.I18N.extend('en', {
      'lab.boss.tier': 'TIER',
      'boss.v11.sentinel': 'THE WARDEN // SENTINEL EYE',
      'boss.v11.ram': 'IRON WARDEN // RAM',
      'boss.v11.crawler': 'SIEGE WARDEN // CRAWLER',
      'boss.v11.horizon': 'VORTEX WARDEN // EVENT HORIZON',
      'boss.v11.stalker': 'HUNTER WARDEN // STALKER',
      'boss.v11.sovereign': 'WARDEN PRIME // SOVEREIGN',
      'boss.v11.forge': 'FORGE TITAN',
      'boss.v11.binary': 'TWIN-CORE WARDEN // BINARY STAR',
      'boss.v11.wraith': 'OSSUARY WRAITH',
      'boss.v11.tempest': 'TEMPEST WARDEN MK-II'
    });
    BO.I18N.extend('fa', {
      'lab.boss.tier': 'رده',
      'boss.v11.sentinel': 'چشم نگهبان',
      'boss.v11.ram': 'قوچ آهنین',
      'boss.v11.crawler': 'نگهبان محاصره',
      'boss.v11.horizon': 'نگهبان افق رویداد',
      'boss.v11.stalker': 'نگهبان شکارچی',
      'boss.v11.sovereign': 'فرمانروا',
      'boss.v11.forge': 'تایتان کوره',
      'boss.v11.binary': 'ستاره دوتایی',
      'boss.v11.wraith': 'شبح استخوان‌دان',
      'boss.v11.tempest': 'فرمانروای طوفان نسخه ۲'
    });
  }
})(window.BO);
