/* =========================================================================
 * BLACKOUT :: v4-arsenal.js
 * Six more guns for the data-driven weapon pipeline:
 *  - SIMORGH .50     hand cannon (secondary, pierces 1)
 *  - MULE SAWN-OFF   double-barrel coach gun (secondary)
 *  - HORNET PDW      18 rps personal defence weapon
 *  - KAVEH BR        full-auto battle rifle (pierces 1)
 *  - ARC CASTER      lightning gun, every hit chains to 3 nearby hostiles
 *  - INFERNO FLAMER  flamethrower: pierces, sets targets on fire, lights barrels
 * Plus their layered sounds (via audio-plus' GUN_SOUNDS table).
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TAU = U.TAU;
  const SH = BO.PARTICLE_SHAPE;

  const NEW_WEAPONS = {
    simorgh: {
      slot: 'secondary', price: 1500, damage: 92, pellets: 1, fireRate: 1.8, mag: 7, reserve: 49, reload: 1.7,
      spread: 0.012, recoil: 0.09, maxBloom: 0.14, recovery: 0.32, bulletSpeed: 2100, range: 1150, auto: false, pierce: 1,
      shake: 0.3, kick: 11, hitStop: 0.03, knockback: 180, moveMul: 1, sound: 'simorgh', tracer: '#ffd08a', tracerWidth: 3.2,
      casing: true, bigCasing: true, lookAhead: 0.27, look: { length: 21, width: 7, color: '#4a4038' }
    },
    sawnoff: {
      slot: 'secondary', price: 1300, damage: 14, pellets: 9, fireRate: 3, mag: 2, reserve: 36, reload: 1.6,
      spread: 0.4, recoil: 0.06, maxBloom: 0.1, recovery: 0.5, bulletSpeed: 1150, range: 300, auto: false,
      shake: 0.4, kick: 13, hitStop: 0.04, knockback: 170, moveMul: 1, sound: 'sawnoff', tracer: '#ffb26b', tracerWidth: 1.7,
      casing: false, lookAhead: 0.16, look: { length: 20, width: 8, color: '#4a3428', barrels: 2 }
    },
    hornet: {
      slot: 'primary', price: 1100, damage: 13, pellets: 1, fireRate: 18, mag: 45, reserve: 315, reload: 1.5,
      spread: 0.09, recoil: 0.008, maxBloom: 0.1, recovery: 0.5, bulletSpeed: 1400, range: 620, auto: true,
      shake: 0.05, kick: 2, hitStop: 0, knockback: 28, moveMul: 1.08, sound: 'hornet', tracer: '#fff0b8', tracerWidth: 1.4,
      casing: true, lookAhead: 0.2, look: { length: 24, width: 6, color: '#2c3328' }
    },
    kaveh: {
      slot: 'primary', price: 1900, damage: 46, pellets: 1, fireRate: 6, mag: 20, reserve: 160, reload: 1.9,
      spread: 0.02, recoil: 0.03, maxBloom: 0.11, recovery: 0.38, bulletSpeed: 2100, range: 1250, auto: true, pierce: 1,
      shake: 0.16, kick: 5.5, hitStop: 0.008, knockback: 90, moveMul: 0.96, sound: 'kaveh', tracer: '#ffd9a0', tracerWidth: 2.4,
      casing: true, lookAhead: 0.3, look: { length: 34, width: 7, color: '#3a3428' }
    },
    arc: {
      slot: 'primary', price: 3200, damage: 34, pellets: 1, fireRate: 3.4, mag: 18, reserve: 126, reload: 2.1,
      spread: 0.025, recoil: 0.03, maxBloom: 0.08, recovery: 0.45, bulletSpeed: 2600, range: 760, auto: true,
      shake: 0.14, kick: 4, hitStop: 0.01, knockback: 60, moveMul: 0.97, sound: 'arc', tracer: '#9fe8ff', tracerWidth: 2.6,
      casing: false, arc: true, chain: 3, chainRange: 230, chainFalloff: 0.65, lookAhead: 0.26,
      look: { length: 30, width: 9, color: '#1f2a36', glow: '#7fe3ff' }
    },
    inferno: {
      slot: 'primary', price: 2600, damage: 7, pellets: 2, fireRate: 20, mag: 120, reserve: 360, reload: 3.2,
      spread: 0.2, recoil: 0.004, maxBloom: 0.06, recovery: 0.5, bulletSpeed: 640, range: 300, auto: true, pierce: 3,
      shake: 0.04, kick: 1.2, hitStop: 0, knockback: 12, moveMul: 0.92, sound: 'inferno', tracer: '#ff7a1a', tracerWidth: 4,
      casing: false, flame: true, burn: 3, burnDps: 16, lookAhead: 0.17,
      look: { length: 30, width: 9, color: '#3a2a22', glow: '#ff7a1a', drum: true }
    }
  };
  Object.keys(NEW_WEAPONS).forEach(id => { NEW_WEAPONS[id].id = id; BO.WEAPONS[id] = NEW_WEAPONS[id]; });

  const ORDER = ['pistol', 'revolver', 'simorgh', 'mpistol', 'sawnoff', 'stinger', 'smg', 'hornet', 'ar', 'kaveh', 'burst',
    'shotgun', 'autoshotgun', 'dmr', 'plasma', 'arc', 'lmg', 'minigun', 'inferno', 'sniper', 'railgun', 'launcher'];
  const merged = ORDER.filter(id => BO.WEAPONS[id]);
  BO.WEAPON_ORDER.forEach(id => { if (merged.indexOf(id) < 0) merged.push(id); });
  BO.WEAPON_ORDER.length = 0;
  merged.forEach(id => BO.WEAPON_ORDER.push(id));

  /* ------------------------------ Sounds ------------------------------ */
  const SOUNDS = {
    simorgh:   { vol: 0.85, crack: [1900, 0.11], body: [120, 36, 0.2], sub: [62, 26, 0.3, 0.75], tail: [0.9, 1700, 180, 0.55], ring: [1700, 0.3], mech: 'heavy', wet: 0.3 },
    sawnoff:   { vol: 1.0,  crack: [1400, 0.16], body: [95, 30, 0.26], sub: [58, 24, 0.36, 1], tail: [1.0, 1500, 150, 0.65], wet: 0.3 },
    hornet:    { vol: 0.3,  crack: [3600, 0.03], body: [250, 110, 0.04], tail: [0.18, 3000, 700, 0.25], mech: 'light', wet: 0.1, gap: 0.02 },
    kaveh:     { vol: 0.62, crack: [3000, 0.08], body: [130, 40, 0.12], sub: [70, 32, 0.18, 0.55], tail: [0.7, 2200, 240, 0.5], mech: 'heavy', wet: 0.24 },
    arc:       { vol: 0.45, crack: [2400, 0.05], body: [520, 140, 0.12], tail: [0.4, 2600, 400, 0.3], energy: [3200, 180, 0.3], ring: [2600, 0.4], wet: 0.3 },
    inferno:   { vol: 0.34, crack: [700, 0.12],  body: [90, 50, 0.12], tail: [0.35, 1400, 300, 0.6], whoosh: true, wet: 0.15, gap: 0.07 },
    ebreacher: { vol: 0.62, crack: [1500, 0.12], body: [105, 34, 0.18], sub: [62, 26, 0.26, 0.6], tail: [0.7, 1500, 170, 0.5], wet: 0.26 },
    egrenade:  { vol: 0.5,  crack: [800, 0.08],  body: [180, 60, 0.14], sub: [70, 30, 0.2, 0.4], tail: [0.35, 900, 150, 0.3], wet: 0.2 }
  };
  const FALLBACK = { simorgh: 'revolver', sawnoff: 'shotgun', hornet: 'smg', kaveh: 'rifle', arc: 'plasma', inferno: 'smg', ebreacher: 'enemy', egrenade: 'enemy' };
  if (BO.GUN_SOUNDS) Object.assign(BO.GUN_SOUNDS, SOUNDS);
  else {
    Object.keys(NEW_WEAPONS).forEach(id => { NEW_WEAPONS[id].sound = FALLBACK[id] || 'rifle'; });
    ['breacher', 'grenadier'].forEach(t => { const d = BO.ENEMY_TYPES && BO.ENEMY_TYPES[t]; if (d && FALLBACK[d.sound]) d.sound = FALLBACK[d.sound]; });
  }

  /* ------------------------ Projectile tagging ------------------------ */
  const PS = BO.ProjectileSystem && BO.ProjectileSystem.prototype;
  if (PS && PS.spawn) {
    const origSpawn = PS.spawn;
    PS.spawn = function (s) {
      const p = origSpawn.call(this, s);
      if (!p) return p;
      p.v4flame = null; p.v4arc = null;
      const def = s.owner === BO.PROJECTILE_OWNER.PLAYER && s.source && s.source.weapon ? s.source.weapon.def : null;
      if (def && def.flame && s.kind !== BO.PROJECTILE_KIND.GRENADE) { p.v4flame = def; p.kind = BO.PROJECTILE_KIND.ORB; }
      if (def && def.arc) p.v4arc = def;
      return p;
    };
  }

  /* --------------------------- Game hooks --------------------------- */
  const G = BO.Game && BO.Game.prototype;
  if (G) {
    const fireShape = () => (SH.FIRE !== undefined ? SH.FIRE : SH.GLOW);

    const origFired = G.onPlayerFired;
    G.onPlayerFired = function (player, w, mx, my, angle) {
      origFired.call(this, player, w, mx, my, angle);
      const def = w.def;
      if (def.flame) U.safe('v4arsenal.flame', () => {
        for (let i = 0; i < 2; i++) {
          const a = angle + U.randSpread() * def.spread * 0.8, sp = def.bulletSpeed * U.rand(0.7, 0.95);
          this.particles.spawn(mx, my, Math.cos(a) * sp, Math.sin(a) * sp, U.rand(0.35, 0.5), U.rand(4, 7), U.rand(20, 30), '#ffb347', fireShape(), { additive: true, drag: 2.6, vrot: U.rand(-3, 3) });
        }
        if (Math.random() < 0.4) this.particles.spawn(mx, my, Math.cos(angle) * 120, Math.sin(angle) * 120, 0.9, 8, 34, '#2a2522', SH.PUFF !== undefined ? SH.PUFF : SH.SMOKE, { alpha: 0.25, drag: 1.5 });
        this.addLight(mx + Math.cos(angle) * 90, my + Math.sin(angle) * 90, 260, '#ff8a3c', 0.08, 0.9);
      });
      if (def.arc) this.addLight(mx, my, 190, '#7fe3ff', 0.08, 0.9);
    };

    const origHit = G.onEnemyHitByBullet;
    G.onEnemyHitByBullet = function (e, p, hx, hy) {
      const flame = p.v4flame, arc = p.v4arc;
      origHit.call(this, e, p, hx, hy);
      if (flame && !e.dead && !e.isBoss) { e.burnT = flame.burn; e.burnDps = flame.burnDps; }
      if (arc) U.safe('v4arsenal.arc', () => chain(this, e, p, hx, hy, arc));
    };

    const origWorld = G.onBulletHitWorld;
    G.onBulletHitWorld = function (p, hit) {
      if (!p.v4flame) return origWorld.call(this, p, hit);
      const normal = Math.atan2(hit.ny || -p.dirY, hit.nx || -p.dirX);
      this.particles.spawn(hit.x, hit.y, Math.cos(normal) * 40, Math.sin(normal) * 40, U.rand(0.3, 0.5), 6, 20, '#ffb347', fireShape(), { additive: true, drag: 3 });
      if (Math.random() < 0.15) this.particles.addDecal(hit.x - p.dirX * 4, hit.y - p.dirY * 4, 1, U.rand(7, 12));
      if (hit.prop) this.damageProp(hit.prop, p.damage * 2, 'player');
    };

    const origUpdate = G._update;
    G._update = function (realDt) {
      origUpdate.call(this, realDt);
      if (this.hitStop > 0 || !this.enemies) return;
      U.safe('v4arsenal.burn', () => tickBurn(this, realDt * this.timeScale));
    };

    const origLights = G._updateLights;
    G._updateLights = function (dt) {
      origLights.call(this, dt);
      const a = this._arcs;
      if (!a) return;
      for (let i = a.length - 1; i >= 0; i--) { a[i].life -= dt; if (a[i].life <= 0) a.splice(i, 1); }
    };

    const origStart = G.startMission;
    G.startMission = function (id) { this._arcs = []; return origStart.call(this, id); };
  }

  function tickBurn(game, dt) {
    const list = game.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!(e.burnT > 0) || e.dead) continue;
      e.burnT -= dt;
      e.burnAcc = (e.burnAcc || 0) + e.burnDps * dt;
      if (Math.random() < dt * 14) {
        game.particles.spawn(e.x + U.randSpread() * e.r, e.y + U.randSpread() * e.r, U.randSpread() * 20, -U.rand(20, 60), U.rand(0.3, 0.6), 3, 12, '#ff9a3c', SH.FIRE !== undefined ? SH.FIRE : SH.GLOW, { additive: true, drag: 1.5 });
      }
      if (Math.random() < dt * 6) game.addLight(e.x, e.y, 120, '#ff7a1a', 0.12, 0.6);
      if (e.burnAcc >= 4) {
        const dmg = e.burnAcc;
        e.burnAcc = 0;
        const killed = e.takeDamage(dmg, 0, 0);
        e.hitFlash = 0.03;
        if (killed) game.onEnemyKilled(e, { x: e.x, y: e.y, angle: -Math.PI / 2, source: 'player', weapon: 'inferno', burn: true });
      }
      if (e.burnT <= 0) { e.burnT = 0; e.burnAcc = 0; }
    }
  }

  function chain(game, first, p, hx, hy, def) {
    const arcs = game._arcs || (game._arcs = []);
    const hit = [first];
    let from = first, fx = hx, fy = hy, dmg = p.damage;
    game.particles.sparks(hx, hy, Math.random() * TAU, 8, '#9fe8ff', 420);
    for (let k = 0; k < (def.chain || 3); k++) {
      let best = null, bestD = (def.chainRange || 230) * (def.chainRange || 230);
      for (let i = 0; i < game.enemies.length; i++) {
        const e = game.enemies[i];
        if (e.dead || hit.indexOf(e) >= 0) continue;
        const d2 = U.dist2(from.x, from.y, e.x, e.y);
        if (d2 >= bestD) continue;
        if (!BO.Collision.lineOfSight(game.map, from.x, from.y, e.x, e.y, BO.COLLIDE.BULLET)) continue;
        best = e; bestD = d2;
      }
      if (!best) break;
      hit.push(best);
      dmg *= def.chainFalloff || 0.65;
      arcs.push({ x0: fx, y0: fy, x1: best.x, y1: best.y, life: 0.24, max: 0.24, seed: Math.random() * 1000 });
      if (arcs.length > 24) arcs.shift();
      const a = Math.atan2(best.y - from.y, best.x - from.x);
      game.addLight(best.x, best.y, 160, '#7fe3ff', 0.18, 0.8);
      game.damageEnemy(best, dmg, Math.cos(a) * 40, Math.sin(a) * 40, { x: best.x, y: best.y, angle: a + Math.PI, source: 'player', weapon: 'arc' });
      if (game.audio.enemyHit) game.audio.enemyHit(best.x, best.y, false);
      from = best; fx = best.x; fy = best.y;
    }
  }

  /* -------------------------- Arc rendering -------------------------- */
  const R = BO.Renderer && BO.Renderer.prototype;
  if (R && R._drawColoredLights) {
    const origColored = R._drawColoredLights;
    R._drawColoredLights = function (ctx, game, rect, time) {
      origColored.call(this, ctx, game, rect, time);
      const arcs = game && game._arcs;
      if (!arcs || !arcs.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < arcs.length; i++) {
        const a = arcs[i], k = U.clamp(a.life / a.max, 0, 1);
        const dx = a.x1 - a.x0, dy = a.y1 - a.y0, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const segs = Math.max(4, Math.round(len / 18));
        ctx.beginPath();
        ctx.moveTo(a.x0, a.y0);
        for (let s = 1; s < segs; s++) {
          const t = s / segs, j = (Math.random() * 2 - 1) * Math.min(22, len * 0.12);
          ctx.lineTo(a.x0 + dx * t + nx * j, a.y0 + dy * t + ny * j);
        }
        ctx.lineTo(a.x1, a.y1);
        ctx.strokeStyle = '#5cc8ff';
        ctx.globalAlpha = 0.35 * k; ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = k; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
    };
  }

  /* ------------------------------ Strings ----------------------------- */
  BO.I18N.extend('en', {
    'w.simorgh': 'SIMORGH .50', 'w.sawnoff': 'MULE SAWN-OFF', 'w.hornet': 'HORNET PDW',
    'w.kaveh': 'KAVEH BATTLE RIFLE', 'w.arc': 'ARC CASTER', 'w.inferno': 'INFERNO FLAMER',
    'wd.simorgh': 'Hand cannon. Seven rounds, each one a verdict. Punches through the first target.',
    'wd.sawnoff': 'Two barrels, nine pellets each. Point at problem, pull twice.',
    'wd.hornet': '18 rounds a second in a frame you can still sprint with.',
    'wd.kaveh': 'Heavy full-auto rifle named after the blacksmith who toppled a tyrant. Pierces one target.',
    'wd.arc': 'Lightning gun. Every hit jumps to three nearby hostiles.',
    'wd.inferno': 'Close-range flamethrower. Burns through three targets, sets them alight and cooks off barrels.'
  });
  BO.I18N.extend('fa', {
    'w.simorgh': 'کلت سیمرغ', 'w.sawnoff': 'دولول قاطر', 'w.hornet': 'مسلسل زنبور',
    'w.kaveh': 'تفنگ نبرد کاوه', 'w.arc': 'تفنگ آذرخش', 'w.inferno': 'شعله‌افکن دوزخ',
    'wd.simorgh': 'کلت سنگین. هفت گلوله، هر کدام یک حکم. از هدف اول رد می‌شود.',
    'wd.sawnoff': 'دو لوله، هر کدام نه ساچمه. نشانه بگیر و دو بار بکش.',
    'wd.hornet': 'هجده گلوله در ثانیه، در بدنه‌ای که هنوز می‌شود با آن دوید.',
    'wd.kaveh': 'تفنگ تمام‌خودکار سنگین به نام آهنگری که ستمگر را سرنگون کرد. از یک هدف عبور می‌کند.',
    'wd.arc': 'تفنگ صاعقه. هر برخورد به سه دشمن نزدیک می‌پرد.',
    'wd.inferno': 'شعله‌افکن برد کوتاه. از سه هدف عبور می‌کند، آتششان می‌زند و بشکه‌ها را منفجر می‌کند.'
  });
})(window.BO);
