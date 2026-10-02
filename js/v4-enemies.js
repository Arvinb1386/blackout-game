/* =========================================================================
 * BLACKOUT :: v4-enemies.js
 * Four new hostile archetypes plugged into the existing AI / render / combat
 * pipeline:
 *  - Breacher   : close-quarters pump shotgunner that pushes into rooms
 *  - Grenadier  : keeps its distance and lobs telegraphed grenades
 *  - Riot Shield: frontal ballistic shield that blocks bullets until it
 *                 breaks (flank it, blow it up or overpower it), shield bash
 *  - Kamikaze Drone: fast quadcopter that arms a fuse and detonates on you;
 *                 shooting one down makes it pop where it is
 * They are mixed into the existing operations and the v4 campaign.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TAU = U.TAU;
  const S = BO.ENEMY_STATE;
  const C = BO.Collision;
  const MODE = BO.COLLIDE;

  const NEW_TYPES = {
    breacher: {
      hp: 150, r: 16, speed: 150, damage: 11, pellets: 6, spread: 0.3, fireCooldown: [1.15, 1.7], bulletSpeed: 900,
      range: 380, prefRange: 150, view: 500, fov: 2.0, turn: 6, xp: 35, credits: [8, 16], color: '#ff7a3c', body: '#3b2c26',
      knockResist: 0.7, retreatAt: 0, weaponLen: 26, sound: 'ebreacher', dropChance: 0.45, voicePitch: 0.75
    },
    grenadier: {
      hp: 110, r: 15, speed: 115, damage: 55, blast: 100, throwCooldown: [2.8, 3.8], windupTime: 0.65, bulletSpeed: 540,
      range: 640, prefRange: 420, minRange: 190, view: 620, fov: 1.9, turn: 4.5, xp: 40, credits: [10, 18], color: '#ffb020',
      body: '#33302a', knockResist: 1, retreatAt: 0, weaponLen: 18, sound: 'egrenade', dropChance: 0.5, voicePitch: 0.95
    },
    shield: {
      hp: 170, r: 18, speed: 96, damage: 10, fireInterval: 0.4, burst: 2, burstPause: [1.0, 1.6], spread: 0.08, bulletSpeed: 760,
      range: 480, prefRange: 110, view: 520, fov: 1.8, turn: 3.2, shieldHp: 420, shieldArc: 1.1, bashDamage: 22, bashRange: 30,
      bashCooldown: 1.5, xp: 50, credits: [12, 22], color: '#7fb2ff', body: '#2b3040', knockResist: 0.25, retreatAt: 0,
      weaponLen: 14, sound: 'enemy', dropChance: 0.55, voicePitch: 0.6
    },
    drone: {
      hp: 38, r: 11, speed: 330, blast: 95, blastDamage: 46, fuse: 0.5, view: 640, fov: 3.4, turn: 10, xp: 18, credits: [3, 8],
      color: '#ff2d55', body: '#2a2c34', knockResist: 1.6, retreatAt: 0, weaponLen: 0, dropChance: 0.1, range: 40, prefRange: 0,
      noBlood: true, mute: true
    }
  };
  Object.keys(NEW_TYPES).forEach(k => { BO.ENEMY_TYPES[k] = NEW_TYPES[k]; });
  const IS_NEW = (t) => Object.prototype.hasOwnProperty.call(NEW_TYPES, t);
  BO.V4_ENEMY_TYPES = Object.keys(NEW_TYPES);

  /** Lazily attaches per-archetype runtime state (Enemy's constructor is left untouched). */
  function prep(e) {
    if (e._v4) return;
    e._v4 = true;
    e.bash = 0; e.bashCd = 0; e.pump = 0;
    if (e.type === 'shield') { e.shieldMax = Math.round(e.def.shieldHp * ((e.diff && e.diff.hp) || 1)); e.shieldHp = e.shieldMax; e.shieldFlash = 0; }
    if (e.type === 'drone') { e.fuse = -1; e.hover = Math.random() * TAU; e.beepT = 0; }
    if (e.type === 'grenadier') { e.throwT = U.rand(1, 2); e.windup = 0; e.nade = null; }
  }
  BO.v4PrepEnemy = prep;

  /** Fires one enemy round without the per-shot muzzle/audio hook (callers notify once per volley). */
  function fire(ai, e, angle, dmg, speed, kind, color, width, opts) {
    const o = opts || {};
    const SH = BO.SHOT;
    const off = e.r + (e.def.weaponLen || 10);
    SH.x = e.x + Math.cos(e.angle) * off; SH.y = e.y + Math.sin(e.angle) * off;
    const block = C.raycast(ai.game.map, e.x, e.y, SH.x, SH.y, MODE.BULLET);
    if (block.hit) { SH.x = e.x; SH.y = e.y; }
    SH.angle = angle; SH.speed = speed; SH.damage = dmg; SH.range = o.range || e.def.range * 1.3;
    SH.owner = BO.PROJECTILE_OWNER.ENEMY; SH.kind = kind; SH.color = color; SH.width = width;
    SH.pierce = 0; SH.explosive = o.explosive || 0; SH.knockback = o.knockback === undefined ? 40 : o.knockback;
    SH.hitStop = 0; SH.critChance = 0; SH.source = e; SH.radius = o.radius || 2;
    return ai.game.projectiles.spawn(SH);
  }

  function bark(e, cat, prio) { if (BO.Voice) BO.Voice.bark(e, cat, prio); }

  /* ------------------------------ Combat ------------------------------ */
  function breacherCombat(ai, e, dt, p, d) {
    const def = e.def;
    e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
    if (d > def.prefRange + 40 || !e.clearShot) ai._navigate(e, p.x, p.y, d > def.prefRange * 2 ? 1 : 0.75);
    else ai._strafe(e, dt, p, d, 0.55);
    e.fireTimer -= dt;
    const aimed = Math.abs(U.angleDiff(e.angle, e.faceAngle)) < 0.28;
    if (e.fireTimer <= 0 && e.canSee && e.clearShot && aimed && d < def.range) {
      e.fireTimer = U.rand(def.fireCooldown[0], def.fireCooldown[1]);
      e.pump = 0.38;
      const acc = (e.diff && e.diff.accuracy) || 1;
      for (let i = 0; i < def.pellets; i++) {
        fire(ai, e, e.angle + U.randSpread() * def.spread / acc, def.damage * e.diff.damage, def.bulletSpeed * U.rand(0.88, 1.1),
          BO.PROJECTILE_KIND.TRACER, '#ff8a4a', 1.7, { knockback: 70 });
      }
      e.muzzle = 1;
      ai.game.onEnemyFired(e, BO.SHOT.x, BO.SHOT.y, e.angle);
    } else if (e.fireTimer <= 0) e.fireTimer = 0.15;
  }

  function lob(ai, e, p) {
    const def = e.def, map = ai.game.map;
    let tx = p.x + (p.vx || 0) * 0.45, ty = p.y + (p.vy || 0) * 0.45;
    if (!C.lineOfSight(map, e.x, e.y, tx, ty, MODE.BULLET)) { tx = p.x; ty = p.y; }
    const a = Math.atan2(ty - e.y, tx - e.x) + U.randSpread() * 0.05 / ((e.diff && e.diff.accuracy) || 1);
    e.angle = a;
    const dist = U.dist(e.x, e.y, tx, ty);
    const off = e.r + def.weaponLen;
    const pr = fire(ai, e, a, def.damage * e.diff.damage, def.bulletSpeed, BO.PROJECTILE_KIND.GRENADE, '#ffb020', 4,
      { range: Math.max(60, dist - off), explosive: def.blast, radius: 5, knockback: 0 });
    if (pr) { e.nade = pr; e.nadeX = e.x + Math.cos(a) * dist; e.nadeY = e.y + Math.sin(a) * dist; }
    e.muzzle = 1;
    ai.game.onEnemyFired(e, BO.SHOT.x, BO.SHOT.y, e.angle);
  }

  function grenadierCombat(ai, e, dt, p, d) {
    const def = e.def;
    e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.windup > 0) {
      e.windup -= dt;
      e.speedMul = 0;
      if (e.windup <= 0) { e.windup = 0; lob(ai, e, p); }
      return;
    }
    if (d < def.minRange && e.canSee) {
      e.desiredX = (e.x - p.x) / (d || 1); e.desiredY = (e.y - p.y) / (d || 1); e.speedMul = 0.85;
    } else if (d > def.prefRange + 100 || !e.canSee) ai._navigate(e, p.x, p.y, 0.9);
    else ai._strafe(e, dt, p, d, 0.45);
    e.throwT -= dt;
    if (e.throwT <= 0 && e.canSee && d < def.range && d > 90) {
      if (C.lineOfSight(ai.game.map, e.x, e.y, p.x, p.y, MODE.BULLET)) {
        e.windup = def.windupTime;
        e.throwT = U.rand(def.throwCooldown[0], def.throwCooldown[1]);
        bark(e, 'grenade', 3);
      } else e.throwT = 0.4;
    }
  }

  function shieldCombat(ai, e, dt, p, d) {
    const def = e.def;
    e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
    const reach = def.bashRange + e.r + p.r;
    if (e.bash > 0) {
      e.bash -= dt;
      e.speedMul = 0;
      if (e.bash <= 0) {
        e.bash = 0;
        e.bashCd = def.bashCooldown;
        e.kx += Math.cos(e.angle) * 380; e.ky += Math.sin(e.angle) * 380;
        if (d < reach + 16) {
          ai.game.onPlayerMelee(e, def.bashDamage * e.diff.damage);
          ai.game.audio.impact(e.x, e.y, 'metal');
        }
      }
      return;
    }
    if (d < reach + 8 && e.bashCd <= 0) { e.bash = 0.32; ai.game.audio.melee(e.x, e.y); return; }
    if (d > def.prefRange || !e.clearShot) ai._navigate(e, p.x, p.y, e.shieldHp > 0 ? 0.85 : 1.05);
    else ai._strafe(e, dt, p, d, 0.35);
    ai._burstFire(e, dt);
  }

  function droneCombat(ai, e, dt, p, d) {
    const reach = e.r + p.r + 26;
    e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.fuse < 0 && d < reach) { e.fuse = 0; bark(e, 'drone', 1); }
    const ax = (p.x - e.x) / (d || 1), ay = (p.y - e.y) / (d || 1);
    if (e.canSee && BO.clearCorridor(ai.game.map, e.x, e.y, p.x, p.y, e.r)) {
      const wob = Math.sin(e.stateTime * 9 + e.id) * 0.35;
      e.desiredX = ax - ay * wob; e.desiredY = ay + ax * wob;
      e.speedMul = e.fuse >= 0 ? 0.55 : 1;
    } else ai._navigate(e, p.x, p.y, 1);
  }

  function detonate(game, e) {
    if (e.dead) return;
    const x = e.x, y = e.y, def = e.def;
    e.takeDamage(e.hp + 1, 0, 0);
    game.onEnemyKilled(e, { x, y, source: 'hazard', selfDestruct: true });
    game.explode(x, y, def.blast, def.blastDamage * ((e.diff && e.diff.damage) || 1), 'enemy');
  }

  /* ------------------------------ AI hooks ------------------------------ */
  const AI = BO.AISystem && BO.AISystem.prototype;
  if (AI) {
    const origAttack = AI._attack;
    AI._attack = function (e, dt) {
      if (!IS_NEW(e.type)) return origAttack.call(this, e, dt);
      prep(e);
      const p = this.game.player;
      if (p.dead) { e.setState(S.SEARCH); return; }
      if (!e.canSee && this.time - e.lastSeenAt > (e.type === 'drone' ? 0.9 : 1.3)) {
        if (e.type === 'grenadier') e.windup = 0;
        e.bash = 0;
        e.setState(S.CHASE);
        return;
      }
      const d = U.dist(e.x, e.y, p.x, p.y);
      switch (e.type) {
        case 'breacher': breacherCombat(this, e, dt, p, d); break;
        case 'grenadier': grenadierCombat(this, e, dt, p, d); break;
        case 'shield': shieldCombat(this, e, dt, p, d); break;
        case 'drone': droneCombat(this, e, dt, p, d); break;
        default: break;
      }
    };

    const origChase = AI._chase;
    AI._chase = function (e, dt) {
      if (e.type === 'drone') {
        const p = this.game.player;
        if (!p.dead && e.canSee && U.dist(e.x, e.y, p.x, p.y) < 280) { this._enterAttack(e); return; }
      }
      return origChase.call(this, e, dt);
    };

    const origUpd = AI._updateEnemy;
    AI._updateEnemy = function (e, dt) {
      origUpd.call(this, e, dt);
      if (e.dead || !IS_NEW(e.type)) return;
      prep(e);
      if (e.shieldFlash > 0) e.shieldFlash -= dt;
      if (e.bashCd > 0) e.bashCd -= dt;
      if (e.pump > 0) e.pump -= dt;
      if (e.type === 'drone') {
        e.hover += dt * 5;
        if (e.fuse >= 0) {
          e.fuse += dt;
          e.beepT -= dt;
          if (e.beepT <= 0) {
            e.beepT = Math.max(0.05, 0.16 - e.fuse * 0.2);
            const p = this.game.player;
            if (p && U.dist(p.x, p.y, e.x, e.y) < 700) this.game.audio.beep(1500 + e.fuse * 900, 0.035);
          }
          if (e.fuse >= e.def.fuse) detonate(this.game, e);
        }
      }
    };
  }

  /* ---------------------------- Combat hooks ---------------------------- */
  const G = BO.Game && BO.Game.prototype;
  if (G) {
    const origHit = G.onEnemyHitByBullet;
    G.onEnemyHitByBullet = function (e, p, hx, hy) {
      if (e.type === 'shield' && !e.dead) {
        prep(e);
        if (e.shieldHp > 0 && p.kind !== BO.PROJECTILE_KIND.GRENADE) {
          const from = Math.atan2(-p.dirY, -p.dirX);
          if (Math.abs(U.angleDiff(e.angle, from)) < e.def.shieldArc) {
            U.safe('v4.shieldBlock', () => blockShot(this, e, p, hx, hy, from));
            return;
          }
        }
      }
      return origHit.call(this, e, p, hx, hy);
    };

    const origKilled = G.onEnemyKilled;
    G.onEnemyKilled = function (e, info) {
      origKilled.call(this, e, info);
      if (e.type !== 'drone') return;
      U.safe('v4.droneDeath', () => {
        e.removeTimer = 0;
        this.particles.debris(e.x, e.y, '#3a3d48', 10, 420);
        this.particles.sparks(e.x, e.y, Math.random() * TAU, 14, '#ffcf6b', 520);
        if (!info || !info.selfDestruct) {
          this.pendingExplosions.push({ x: e.x, y: e.y, r: e.def.blast * 0.75, dmg: e.def.blastDamage * 0.5, source: 'player', delay: 0.06 });
        }
      });
    };
  }

  function blockShot(game, e, p, hx, hy, from) {
    e.shieldHp -= p.damage;
    e.shieldFlash = 0.08;
    game.stats.hits++;
    game.particles.sparks(hx, hy, from, 7, '#9fd0ff', 460);
    game.audio.impact(hx, hy, 'metal');
    e.kx += p.dirX * p.knockback * 0.3; e.ky += p.dirY * p.knockback * 0.3;
    if (game.ai) game.ai.onEnemyDamaged(e);
    if (e.shieldHp <= 0) {
      e.shieldHp = 0;
      game.particles.debris(hx, hy, '#5a6a8a', 14, 420);
      game.particles.sparks(hx, hy, from, 18, '#bfe0ff', 620);
      game.addLight(hx, hy, 180, '#9fd0ff', 0.25, 0.8);
      game.floatingText.spawn(e.x, e.y - 40, BO.t('fx.shieldBroken'), '#9fd0ff', 15, 1.1);
      game.audio.explosion(hx, hy, false);
      if (game.camera.punch) game.camera.punch(Math.atan2(game.player.y - e.y, game.player.x - e.x), 4);
      bark(e, 'shieldBreak', 3);
    } else if (U.chance(0.25)) game.floatingText.spawn(hx, hy - 14, BO.t('fx.blocked'), '#9fd0ff', 12, 0.5);
  }

  /* ------------------------------ Drawing ------------------------------ */
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillRR(ctx, x, y, w, h, r, color) { ctx.fillStyle = color; rrect(ctx, x, y, w, h, r); ctx.fill(); }
  function ell(ctx, x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  function limb(ctx, x0, y0, x1, y1, w, color) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  function arm(ctx, sx, sy, hx, hy, bend, w, sleeve, glove) {
    const mx = (sx + hx) / 2, my = (sy + hy) / 2;
    const dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 1;
    const ex = mx - dy / d * bend, ey = my + dx / d * bend;
    ctx.strokeStyle = sleeve; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ell(ctx, hx, hy, w * 0.62, w * 0.62, glove);
  }
  function legs(ctx, walk, r, pants, boot, amp) {
    const s = Math.sin(walk) * r * amp, hy = r * 0.36;
    limb(ctx, -1, -hy, s * 0.8, -hy - 1, r * 0.36, pants);
    limb(ctx, -1, hy, -s * 0.8, hy + 1, r * 0.36, pants);
    ell(ctx, s + r * 0.12, -hy - 1, r * 0.36, r * 0.23, boot);
    ell(ctx, -s + r * 0.12, hy + 1, r * 0.36, r * 0.23, boot);
  }
  function softShadow(ctx, x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.drawImage(BO.softSprite('#000000'), x - r * 1.6 + 3, y - r * 1.4 + 6, r * 3.2, r * 2.8);
    ctx.globalAlpha = 1;
  }
  function glow(ctx, color, x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(BO.softSprite(color), x - size / 2, y - size / 2, size, size);
  }

  function drawBreacher(e, ctx, F, time, amp) {
    const r = e.r, d = e.def;
    const pumpK = e.pump > 0 ? Math.sin((0.38 - e.pump) / 0.38 * Math.PI) : 0;
    const rec = e.muzzle * 16;
    legs(ctx, e.walk, r, '#2a221e', '#110e0c', amp);
    fillRR(ctx, -r - 4, -8, 9, 16, 2.5, F('#3a2e26'));
    ctx.fillStyle = '#ff7a3c'; ctx.fillRect(-r - 2.5, -5, 5, 3); ctx.fillRect(-r - 2.5, 2, 5, 3);
    ctx.save();
    ctx.translate(2 - rec * 0.6, 6);
    fillRR(ctx, -2, -3.2, 20, 6.4, 1.5, '#1d1e23');
    ctx.fillStyle = '#141418'; ctx.fillRect(16, -2.4, 14, 4.8);
    ctx.fillStyle = '#0c0c0f'; ctx.fillRect(29, -1.6, 2, 3.2);
    fillRR(ctx, 8 - pumpK * 4, 2.2, 9, 3.6, 1, '#4a3a2c');
    ctx.restore();
    ell(ctx, 0, 0, r * 0.9, r, F(d.body));
    fillRR(ctx, -r * 0.6, -r * 0.78, r * 1.3, r * 1.56, 5, F('#4a382e'));
    fillRR(ctx, -r * 0.5, -r * 0.7, r * 1.1, r * 0.3, 3, 'rgba(255,255,255,0.06)');
    ctx.strokeStyle = '#c9a248'; ctx.lineWidth = 2.4; ctx.setLineDash([1.6, 1.4]);
    ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.7); ctx.lineTo(r * 0.45, r * 0.72); ctx.stroke();
    ctx.setLineDash([]);
    for (let side = -1; side <= 1; side += 2) {
      ell(ctx, 1, side * r * 0.82, 5.8, 4.8, F('#5a463a'));
      ctx.fillStyle = d.color; ctx.globalAlpha = 0.8;
      ctx.fillRect(-2.5, side * r * 0.82 - 0.8, 5, 1.6);
      ctx.globalAlpha = 1;
    }
    arm(ctx, 1, r * 0.74, 4 - rec * 0.6, 6.5, 2.5, 4.8, F('#3a2e28'), '#141210');
    arm(ctx, 1, -r * 0.74, 13 - rec * 0.6 - pumpK * 4, 8.2, -3.5, 4.8, F('#3a2e28'), '#141210');
    ell(ctx, 1, 0, r * 0.56, r * 0.56, F('#3d332d'));
    ell(ctx, r * 0.4, -3.6, 2.6, 2.6, '#1a1716');
    ell(ctx, r * 0.4, 3.6, 2.6, 2.6, '#1a1716');
    ell(ctx, r * 0.4, -3.6, 1.2, 1.2, '#4a4038');
    ell(ctx, r * 0.4, 3.6, 1.2, 1.2, '#4a4038');
    ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(1, 0, r * 0.34, -0.55, 0.55); ctx.stroke();
  }

  function drawGrenadier(e, ctx, F, time, amp) {
    const r = e.r, d = e.def, rec = e.muzzle * 20;
    legs(ctx, e.walk, r, '#26231e', '#100f0c', amp);
    fillRR(ctx, -r - 6, -9, 11, 18, 3, F('#34302a'));
    for (let k = 0; k < 3; k++) {
      ell(ctx, -r - 0.5, -5.5 + k * 5.5, 2.5, 2.5, '#6a5f22');
      ctx.fillStyle = '#ffb020'; ctx.fillRect(-r - 1.2, -6.2 + k * 5.5, 1.4, 1.4);
    }
    ctx.save();
    ctx.translate(2 - rec, 6);
    fillRR(ctx, -2, -3.5, 22, 7, 2, '#2a2d27');
    ell(ctx, 8, 3.8, 4.6, 4.6, '#3a3d33');
    ell(ctx, 8, 3.8, 2, 2, '#22241f');
    ctx.fillStyle = '#16171a'; ctx.fillRect(18, -3.2, 7, 6.4);
    ctx.restore();
    ell(ctx, 0, 0, r * 0.86, r, F(d.body));
    fillRR(ctx, -r * 0.55, -r * 0.74, r * 1.2, r * 1.48, 4, F('#4a4434'));
    ctx.strokeStyle = d.color; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.5); ctx.lineTo(r * 0.1, 0); ctx.lineTo(-r * 0.3, r * 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let side = -1; side <= 1; side += 2) ell(ctx, 0, side * r * 0.8, 5, 4, F('#5a5240'));
    const w = e.windup > 0 ? 1 - e.windup / d.windupTime : 0;
    arm(ctx, 1, r * 0.72, 4 - rec, 6.5, 2.5, 4.2, F('#3a352a'), '#141310');
    if (e.windup > 0) {
      const hx = -r * 0.1 - w * 7, hy = -r * 1.25 - w * 2;
      arm(ctx, 1, -r * 0.72, hx, hy, 3, 4.2, F('#3a352a'), '#141310');
      ell(ctx, hx, hy, 3.6, 3.6, '#5a5020');
      ell(ctx, hx, hy, 1.6, 1.6, Math.floor(time * 16) % 2 ? '#ff3b1a' : '#ffb020');
    } else arm(ctx, 1, -r * 0.72, 16 - rec, 5.5, -3.5, 4.2, F('#3a352a'), '#141310');
    ell(ctx, 1, 0, r * 0.55, r * 0.55, F('#4a4436'));
    ell(ctx, r * 0.36, -2.8, 2.2, 2.2, '#121212');
    ell(ctx, r * 0.36, 2.8, 2.2, 2.2, '#121212');
    ell(ctx, r * 0.4, -2.8, 1, 1, d.color);
    ell(ctx, r * 0.4, 2.8, 1, 1, d.color);
  }

  function drawShield(e, ctx, F, time, amp) {
    const r = e.r, d = e.def, rec = e.muzzle * 20;
    const bashK = e.bash > 0 ? 1 - e.bash / 0.32 : 0;
    legs(ctx, e.walk, r, '#1f2330', '#0e0f14', amp * 0.8);
    ctx.save();
    ctx.translate(4 - rec, 10);
    fillRR(ctx, -2, -2.2, 15, 4.4, 1.2, '#1c1e24');
    ctx.fillStyle = '#111216'; ctx.fillRect(11, -1.2, 5, 2.4);
    ctx.restore();
    ell(ctx, 0, 0, r * 0.84, r * 0.98, F(d.body));
    fillRR(ctx, -r * 0.55, -r * 0.72, r * 1.15, r * 1.44, 5, F('#363d52'));
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(-r * 0.45, -r * 0.64, r * 0.95, 2);
    for (let side = -1; side <= 1; side += 2) ell(ctx, 0, side * r * 0.8, 6, 4.8, F('#454e68'));
    arm(ctx, 1, r * 0.74, 7 - rec, 9.5, 2.5, 4.6, F('#2c3242'), '#121318');
    arm(ctx, 1, -r * 0.74, r * 0.75 + bashK * 6, -2, -2, 4.6, F('#2c3242'), '#121318');
    const hg = ctx.createRadialGradient(-1, -3, 1, 1, 0, r * 0.6);
    hg.addColorStop(0, F('#5a6688')); hg.addColorStop(1, F('#2e3548'));
    ell(ctx, 1, 0, r * 0.55, r * 0.55, hg);
    ctx.strokeStyle = U.rgba(d.color, 0.9); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(1, 0, r * 0.42, -0.6, 0.6); ctx.stroke();

    ctx.save();
    ctx.translate(bashK * 7, 0);
    const R0 = r * 1.5, cx = -r * 0.9;
    if (e.shieldHp > 0) {
      const flash = e.shieldFlash > 0;
      const k = e.shieldHp / (e.shieldMax || 1);
      ctx.fillStyle = flash ? '#e8f4ff' : F('#23324a');
      ctx.beginPath();
      ctx.arc(cx + r * 0.95, 0, R0, -0.95, 0.95);
      ctx.arc(cx + r * 0.95, 0, R0 - 6.5, 0.95, -0.95, true);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = flash ? '#ffffff' : '#7fb2ff'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(cx + r * 0.95, 0, R0, -0.95, 0.95); ctx.stroke();
      ctx.strokeStyle = U.rgba('#9fd0ff', 0.7); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx + r * 0.95, 0, R0 - 3.2, -0.32, 0.32); ctx.stroke();
      ctx.fillStyle = '#e8eef8'; ctx.globalAlpha = 0.6;
      for (let s = -1; s <= 1; s += 2) {
        const a = s * 0.62, px = cx + r * 0.95 + Math.cos(a) * (R0 - 3.2), py = Math.sin(a) * (R0 - 3.2);
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      if (k < 0.7) {
        const rng = U.makeRng(e.id * 977 + 3);
        ctx.strokeStyle = 'rgba(200,225,255,0.7)'; ctx.lineWidth = 0.9;
        const cracks = k < 0.35 ? 5 : 2;
        ctx.beginPath();
        for (let i = 0; i < cracks; i++) {
          let a = (rng() * 1.6 - 0.8), rr = R0 - 3;
          ctx.moveTo(cx + r * 0.95 + Math.cos(a) * rr, Math.sin(a) * rr);
          for (let s = 0; s < 3; s++) {
            a += (rng() - 0.5) * 0.35; rr += (rng() - 0.5) * 4;
            ctx.lineTo(cx + r * 0.95 + Math.cos(a) * rr, Math.sin(a) * rr);
          }
        }
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#3a4258'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx + r * 0.95, 0, R0 - 3, -0.35, 0.2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawDrone(e, ctx, time) {
    const r = e.r, flash = e.hitFlash > 0;
    const F = (c) => (flash ? '#ffffff' : c);
    const lift = 11 + Math.sin(e.hover || 0) * 2.5;
    ctx.globalAlpha = 0.32;
    ctx.drawImage(BO.softSprite('#000000'), e.x - r * 1.5 + 6, e.y - r * 1.2 + lift, r * 3, r * 2.4);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(e.x, e.y - lift * 0.35);
    ctx.rotate(e.angle);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const ax = Math.cos(a) * r * 1.25, ay = Math.sin(a) * r * 1.25;
      limb(ctx, 0, 0, ax, ay, 2.6, F('#30333c'));
      ctx.globalAlpha = 0.28; ell(ctx, ax, ay, r * 0.66, r * 0.66, '#9aa0b4'); ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(time * 55 + k * 1.3);
      ctx.fillStyle = 'rgba(210,214,226,0.85)'; ctx.fillRect(-r * 0.62, -0.8, r * 1.24, 1.6);
      ctx.restore();
      ell(ctx, ax, ay, 1.7, 1.7, '#16171c');
    }
    fillRR(ctx, -r * 0.62, -r * 0.5, r * 1.24, r * 1.0, 3, F('#2a2c34'));
    fillRR(ctx, -r * 0.36, -r * 0.33, r * 0.72, r * 0.66, 2, F('#5a1a20'));
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(-r * 0.36, -0.9, r * 0.72, 1.8);
    const armed = e.fuse >= 0;
    const blink = armed ? Math.floor(time * (12 + e.fuse * 40)) % 2 : Math.floor(time * 2) % 2;
    ell(ctx, r * 0.52, 0, 2.5, 2.5, blink ? '#ff2d55' : '#5a1020');
    ctx.restore();
    ctx.lineCap = 'butt';
  }

  const E = BO.Enemy && BO.Enemy.prototype;
  if (E) {
    const origDraw = E.draw;
    E.draw = function (ctx, time) {
      if (!IS_NEW(this.type)) return origDraw.call(this, ctx, time);
      if (this.dead) { if (this.type !== 'drone') this._drawCorpse(ctx, time); return; }
      prep(this);
      if (this.type === 'drone') { drawDrone(this, ctx, time); return; }
      const r = this.r, d = this.def;
      softShadow(ctx, this.x, this.y, r, 0.6);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      const flash = this.hitFlash > 0;
      const F = (c) => (flash ? '#ffffff' : c);
      const spd = Math.hypot(this.vx || 0, this.vy || 0);
      const amp = U.clamp(spd / (d.speed || 120), 0, 1.2) * 0.4 + 0.06;
      if (this.type === 'breacher') drawBreacher(this, ctx, F, time, amp);
      else if (this.type === 'grenadier') drawGrenadier(this, ctx, F, time, amp);
      else drawShield(this, ctx, F, time, amp);
      ctx.restore();
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    };

    const origOverlay = E.drawOverlay;
    E.drawOverlay = function (ctx, time, game) {
      origOverlay.call(this, ctx, time, game);
      if (!IS_NEW(this.type) || this.dead) return;
      U.safe('v4.enemyOverlay', () => {
        prep(this);
        const d = this.def;
        if (this.type === 'grenadier' && this.nade && this.nade.active && this.nade.source === this && this.nade.explosive) {
          const pulse = 0.55 + 0.45 * Math.sin(time * 18);
          ctx.strokeStyle = U.rgba('#ff3b1a', 0.75 * pulse); ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.arc(this.nadeX, this.nadeY, d.blast * 0.85, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, '#ff3b1a', this.nadeX, this.nadeY, 46, 0.35 * pulse);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        if (!this.visible) return;
        ctx.globalCompositeOperation = 'lighter';
        if (this.type === 'drone') {
          const armed = this.fuse >= 0;
          glow(ctx, '#ff2d55', this.x + Math.cos(this.angle) * this.r * 0.5, this.y - 4 + Math.sin(this.angle) * this.r * 0.5, armed ? 44 : 18, armed ? 0.9 : 0.45);
          if (armed) {
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(this.x, this.y, d.blast * U.clamp(this.fuse / d.fuse, 0, 1), 0, TAU); ctx.stroke();
          }
        } else if (this.type === 'grenadier' && this.windup > 0) {
          glow(ctx, '#ffb020', this.x, this.y - this.r, 30, 0.6);
        } else if (this.type === 'breacher' && this.muzzle > 0.5) {
          glow(ctx, '#ff8a4a', this.x + Math.cos(this.angle) * 34, this.y + Math.sin(this.angle) * 34, 50, 0.4);
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        if (this.type === 'shield' && this.shieldHp > 0 && this.shieldHp < this.shieldMax) {
          const w = Math.max(28, this.r * 2.2), x = this.x - w / 2, y = this.y - this.r - 8;
          ctx.fillStyle = 'rgba(6,7,16,0.8)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
          ctx.fillStyle = '#7fb2ff'; ctx.fillRect(x, y, w * this.shieldHp / this.shieldMax, 3);
        }
      });
    };
  }

  /* ------------------- Mix into the existing operations ------------------- */
  const MIX = {
    m2: { breacher: 0.08 },
    m3: { breacher: 0.08, grenadier: 0.06 },
    m4: { breacher: 0.08, shield: 0.08 },
    m5: { grenadier: 0.08, shield: 0.06, drone: 0.06 },
    m6: { breacher: 0.1, drone: 0.08 },
    m7: { shield: 0.08, drone: 0.1 },
    m8: { grenadier: 0.08, drone: 0.1 },
    m9: { breacher: 0.08, shield: 0.08, grenadier: 0.06 },
    m10: { breacher: 0.06, grenadier: 0.06, shield: 0.06, drone: 0.08 }
  };
  const WAVE_MIX = { m4: ['breacher'], m7: ['drone', 'breacher'], m10: ['drone', 'shield', 'grenadier'] };
  Object.keys(MIX).forEach(id => {
    const m = BO.MissionSystem.byId(id);
    if (!m || !m.enemies || !m.enemies.types) return;
    const add = MIX[id];
    let total = 0;
    for (const k in add) total += add[k];
    const types = m.enemies.types;
    let base = 0;
    for (const k in types) base += types[k];
    const scale = base > 0 ? (1 - total) / base : 0;
    for (const k in types) types[k] = types[k] * scale;
    Object.assign(types, add);
  });
  Object.keys(WAVE_MIX).forEach(id => {
    const m = BO.MissionSystem.byId(id);
    if (!m) return;
    m.objectives.forEach(o => { if (o.type === 'survive' && Array.isArray(o.types)) WAVE_MIX[id].forEach(t => o.types.push(t)); });
  });

  BO.I18N.extend('en', {
    'enemy.breacher': 'BREACHER', 'enemy.grenadier': 'GRENADIER', 'enemy.shield': 'RIOT SHIELD', 'enemy.drone': 'KAMIKAZE DRONE',
    'fx.blocked': 'BLOCKED', 'fx.shieldBroken': 'SHIELD BROKEN'
  });
  BO.I18N.extend('fa', {
    'enemy.breacher': 'یورشگر', 'enemy.grenadier': 'نارنجک‌انداز', 'enemy.shield': 'سپردار', 'enemy.drone': 'پهپاد انتحاری',
    'fx.blocked': 'دفع شد', 'fx.shieldBroken': 'سپر شکست'
  });
})(window.BO);
