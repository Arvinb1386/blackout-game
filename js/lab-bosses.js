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
      hp: Math.round((0.8 + k * 0.13) * 100) / 100, // 0.80 .. 1.97 x 6500
      dmg: 1 + k * 0.07,     // 1.00 .. 1.63
      cd: 1 - k * 0.035,     // 1.00 .. 0.685 (attack cooldown multiplier)
      shot: 1 + k * 0.045,   // 1.00 .. 1.405 (projectile speed)
      move: 1 + k * 0.05,    // 1.00 .. 1.45
      tele: 1 - k * 0.025,   // 1.00 .. 0.775 (telegraph length)
      vent: 1 - k * 0.045,   // 1.00 .. 0.595 (vent window)
      sig: 1 + k * 0.08      // 1.00 .. 1.72 (signature intensity)
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