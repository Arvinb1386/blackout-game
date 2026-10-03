/* =========================================================================
 * BLACKOUT :: v7-arsenal.js
 * Eight more guns for the data-driven weapon pipeline:
 *  - WHISPER .22     suppressed pistol (secondary, silent)
 *  - RIVET DRIVER    full-auto nail gun (secondary, pierces 2)
 *  - ARASH BOW       compound bow: silent, huge damage, pierces 2
 *  - SEEKER SMG      smart rounds that curve into visible hostiles
 *  - SHREDDER        flechette shotgun, every dart pierces 1
 *  - FROSTBITE       cryo rifle: hits chill and slow hostiles
 *  - ROSTAM HMG      heavy machine gun (pierces 1)
 *  - HAILSTORM       cluster launcher: the shell splits into bomblets
 * Silent guns barely make noise, so stealth play is finally a real option.
 * Also hosts the shared "chill" slow (used by Frostbite and cryo hazards).
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TAU = U.TAU;
  const SH = BO.PARTICLE_SHAPE || {};
  const glow = () => (SH.GLOW !== undefined ? SH.GLOW : SH.DOT);
  const OWNER = BO.PROJECTILE_OWNER;

  const NEW_WEAPONS = {
    whisper: {
      slot: 'secondary', price: 1000, damage: 48, pellets: 1, fireRate: 3.5, mag: 10, reserve: 80, reload: 1.3,
      spread: 0.014, recoil: 0.025, maxBloom: 0.07, recovery: 0.38, bulletSpeed: 1700, range: 950, auto: false,
      shake: 0.05, kick: 2.5, hitStop: 0, knockback: 60, moveMul: 1, sound: 'whisper', tracer: '#c8d8e8', tracerWidth: 1.6,
      casing: true, silent: true, noise: 150, lookAhead: 0.22, look: { length: 24, width: 5, color: '#2a2e36', suppressor: true }
    },
    rivet: {
      slot: 'secondary', price: 1200, damage: 22, pellets: 1, fireRate: 8, mag: 30, reserve: 240, reload: 1.6,
      spread: 0.04, recoil: 0.012, maxBloom: 0.07, recovery: 0.45, bulletSpeed: 1500, range: 700, auto: true, pierce: 2,
      shake: 0.05, kick: 2, hitStop: 0, knockback: 40, moveMul: 1, sound: 'rivet', tracer: '#d0d4dc', tracerWidth: 1.4,
      casing: false, lookAhead: 0.2, look: { length: 18, width: 8, color: '#5a5236' }
    },
    arash: {
      slot: 'primary', price: 2200, damage: 125, pellets: 1, fireRate: 1.4, mag: 1, reserve: 40, reload: 0.55,
      spread: 0.006, recoil: 0.02, maxBloom: 0.05, recovery: 0.5, bulletSpeed: 1500, range: 1300, auto: false, pierce: 2,
      shake: 0.08, kick: 3, hitStop: 0.02, knockback: 150, moveMul: 1.02, sound: 'arash', tracer: '#efe2c4', tracerWidth: 2.2,
      casing: false, silent: true, noise: 120, lookAhead: 0.32, look: { length: 26, width: 4, color: '#5a4430', bow: true }
    },
    seeker: {
      slot: 'primary', price: 2900, damage: 17, pellets: 1, fireRate: 12, mag: 40, reserve: 320, reload: 1.7,
      spread: 0.12, recoil: 0.008, maxBloom: 0.08, recovery: 0.45, bulletSpeed: 1000, range: 800, auto: true,
      shake: 0.05, kick: 2, hitStop: 0, knockback: 25, moveMul: 1.02, sound: 'seeker', tracer: '#ff6bd5', tracerWidth: 1.8,
      casing: false, homing: 7, homingRange: 420, lookAhead: 0.22, look: { length: 26, width: 7, color: '#2a2236', glow: '#ff6bd5' }
    },
    shredder: {
      slot: 'primary', price: 2700, damage: 16, pellets: 10, fireRate: 1.6, mag: 10, reserve: 70, reload: 2.4,
      spread: 0.22, recoil: 0.04, maxBloom: 0.08, recovery: 0.5, bulletSpeed: 1700, range: 560, auto: false, pierce: 1,
      shake: 0.3, kick: 11, hitStop: 0.03, knockback: 110, moveMul: 0.96, sound: 'shredder', tracer: '#e0f0ff', tracerWidth: 1.3,
      casing: true, bigCasing: true, lookAhead: 0.2, look: { length: 30, width: 8, color: '#30343c' }
    },
    frostbite: {
      slot: 'primary', price: 3300, damage: 26, pellets: 1, fireRate: 7, mag: 36, reserve: 216, reload: 2,
      spread: 0.03, recoil: 0.014, maxBloom: 0.09, recovery: 0.42, bulletSpeed: 1300, range: 820, auto: true,
      shake: 0.07, kick: 2.6, hitStop: 0, knockback: 20, moveMul: 0.97, sound: 'frostbite', tracer: '#bfefff', tracerWidth: 2.6,
      casing: false, orb: true, cryo: true, chill: 2.2, chillMul: 0.45, lookAhead: 0.24,
      look: { length: 30, width: 9, color: '#22303a', glow: '#9fe8ff' }
    },
    rostam: {
      slot: 'primary', price: 4200, damage: 38, pellets: 1, fireRate: 9, mag: 80, reserve: 320, reload: 4,
      spread: 0.05, recoil: 0.012, maxBloom: 0.15, recovery: 0.24, bulletSpeed: 1900, range: 1150, auto: true, pierce: 1,
      shake: 0.16, kick: 5, hitStop: 0.004, knockback: 95, moveMul: 0.76, sound: 'rostam', tracer: '#ffb870', tracerWidth: 2.8,
      casing: true, bigCasing: true, lookAhead: 0.27, look: { length: 40, width: 10, color: '#3a3a30', drum: true }
    },
    hailstorm: {
      slot: 'primary', price: 3900, damage: 90, pellets: 1, fireRate: 0.9, mag: 4, reserve: 20, reload: 2.8,
      spread: 0.02, recoil: 0.05, maxBloom: 0.08, recovery: 0.4, bulletSpeed: 720, range: 680, auto: false, explosive: 110,
      shake: 0.26, kick: 10, hitStop: 0, knockback: 0, moveMul: 0.92, sound: 'hailstorm', tracer: '#ffcf6b', tracerWidth: 5,
      casing: false, grenade: true, cluster: 5, clusterRadius: 72, clusterDamage: 46, lookAhead: 0.28,
      look: { length: 28, width: 12, color: '#3a4030', drum: true }
    }
  };
  Object.keys(NEW_WEAPONS).forEach(id => { NEW_WEAPONS[id].id = id; BO.WEAPONS[id] = NEW_WEAPONS[id]; });

  // Slot each new gun in next to its closest relative in the loadout list.
  const AFTER = { whisper: 'pistol', rivet: 'mpistol', arash: 'dmr', seeker: 'hornet', shredder: 'autoshotgun', frostbite: 'plasma', rostam: 'minigun', hailstorm: 'launcher' };
  Object.keys(AFTER).forEach(id => {
    const order = BO.WEAPON_ORDER;
    if (order.indexOf(id) >= 0) return;
    const at = order.indexOf(AFTER[id]);
    if (at >= 0) order.splice(at + 1, 0, id); else order.push(id);
  });

  /* ------------------------------ Sounds ------------------------------ */
  const SOUNDS = {
    whisper:   { vol: 0.22, crack: [5200, 0.025], body: [420, 160, 0.04], tail: [0.12, 2600, 600, 0.12], mech: 'light', wet: 0.05 },
    rivet:     { vol: 0.32, crack: [4200, 0.03], body: [300, 140, 0.05], tail: [0.15, 2200, 500, 0.18], mech: 'light', wet: 0.08, gap: 0.03 },
    arash:     { vol: 0.3,  crack: [900, 0.06], body: [180, 70, 0.1], tail: [0.2, 1400, 300, 0.15], whoosh: true, wet: 0.05 },
    seeker:    { vol: 0.3,  crack: [3400, 0.035], body: [480, 180, 0.06], tail: [0.2, 2600, 600, 0.22], energy: [2600, 900, 0.08], wet: 0.12, gap: 0.025 },
    shredder:  { vol: 0.95, crack: [2200, 0.13], body: [110, 36, 0.22], sub: [60, 26, 0.3, 0.8], tail: [0.9, 1700, 180, 0.55], wet: 0.28 },
    frostbite: { vol: 0.36, crack: [2800, 0.04], body: [700, 260, 0.1], tail: [0.3, 3000, 500, 0.25], energy: [3600, 1200, 0.16], ring: [3000, 0.25], wet: 0.25 },
    rostam:    { vol: 0.66, crack: [2600, 0.08], body: [115, 38, 0.14], sub: [60, 28, 0.2, 0.6], tail: [0.75, 2000, 220, 0.5], mech: 'heavy', wet: 0.24, gap: 0.03 },
    hailstorm: { vol: 0.7,  crack: [900, 0.1], body: [150, 45, 0.22], sub: [55, 24, 0.3, 0.7], tail: [0.6, 1000, 160, 0.4], whoosh: true, wet: 0.22 }
  };
  const FALLBACK = { whisper: 'pistol', rivet: 'mpistol', arash: 'dmr', seeker: 'smg', shredder: 'shotgun', frostbite: 'plasma', rostam: 'lmg', hailstorm: 'launcher' };
  if (BO.GUN_SOUNDS) Object.assign(BO.GUN_SOUNDS, SOUNDS);
  else Object.keys(NEW_WEAPONS).forEach(id => { NEW_WEAPONS[id].sound = FALLBACK[id] || 'rifle'; });

  /* ------------------------ Projectile tagging ------------------------ */
  const PS = BO.ProjectileSystem && BO.ProjectileSystem.prototype;
  if (PS && PS.spawn) {
    const origSpawn = PS.spawn;
    PS.spawn = function (s) {
      const p = origSpawn.call(this, s);
      if (!p) return p;
      p.v7def = null;
      const def = s.owner === OWNER.PLAYER && s.source && s.source.weapon ? s.source.weapon.def : null;
      if (def && (def.cryo || def.homing || def.cluster)) p.v7def = def;
      return p;
    };
  }

  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function steer(p, def, dt, game) {
    const list = game.enemies;
    if (!list || !list.length) return;
    const range = def.homingRange || 420, r2 = range * range;
    const ang = Math.atan2(p.dirY, p.dirX);
    let best = null, bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e === p.lastHit || !e.visible) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const da = Math.abs(wrapAngle(Math.atan2(dy, dx) - ang));
      if (da > 1) continue;
      const score = d2 * (1 + da * 2);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (!best) return;
    const diff = wrapAngle(Math.atan2(best.y - p.y, best.x - p.x) - ang);
    const turn = (def.homing || 6) * dt;
    const na = ang + U.clamp(diff, -turn, turn);
    p.dirX = Math.cos(na); p.dirY = Math.sin(na);
    p.vx = p.dirX * p.speed; p.vy = p.dirY * p.speed;
  }

  if (PS && PS._step) {
    const origStep = PS._step;
    PS._step = function (p, dt, game) {
      const def = p.v7def;
      if (!def || p.owner !== OWNER.PLAYER) return origStep.call(this, p, dt, game);
      if (def.homing) U.safe('v7.homing', () => steer(p, def, dt, game));
      if (!def.cluster) return origStep.call(this, p, dt, game);
      game._v7cluster = p;
      try { return origStep.call(this, p, dt, game); } finally { game._v7cluster = null; }
    };
  }

  /* --------------------------- Game hooks --------------------------- */
  const G = BO.Game && BO.Game.prototype;
  if (G) {
    const origFired = G.onPlayerFired;
    G.onPlayerFired = function (player, w, mx, my, angle) {
      const def = w.def;
      const ai = this.ai;
      if (!def.silent || !ai || !ai.onNoise) {
        origFired.call(this, player, w, mx, my, angle);
      } else {
        // Silent guns: clamp the noise radius for this shot only.
        const own = Object.prototype.hasOwnProperty.call(ai, 'onNoise');
        const prev = ai.onNoise;
        const cap = def.noise || 150;
        ai.onNoise = function (x, y, radius, fromPlayer) { return prev.call(this, x, y, Math.min(radius, cap), fromPlayer); };
        try { origFired.call(this, player, w, mx, my, angle); } finally { if (own) ai.onNoise = prev; else delete ai.onNoise; }
        this.playerExposure = Math.min(this.playerExposure, 0.35);
      }
      if (def.cryo) this.addLight(mx, my, 150, '#9fe8ff', 0.08, 0.8);
      if (def.homing) this.addLight(mx, my, 130, '#ff6bd5', 0.06, 0.7);
    };

    const origHit = G.onEnemyHitByBullet;
    G.onEnemyHitByBullet = function (e, p, hx, hy) {
      const def = p && p.v7def;
      const res = origHit.apply(this, arguments);
      if (def && def.cryo && e && !e.dead && !e.isBoss) U.safe('v7.cryo', () => {
        e.v7chillT = Math.max(e.v7chillT || 0, def.chill || 2);
        e.v7chillMul = Math.min(e.v7chillMul || 1, def.chillMul || 0.5);
        this.particles.sparks(hx, hy, Math.random() * TAU, 5, '#dff6ff', 260);
      });
      return res;
    };

    const origExplode = G.explode;
    G.explode = function (x, y, radius, damage, source) {
      const src = this._v7cluster;
      if (src) this._v7cluster = null;
      const res = origExplode.apply(this, arguments);
      if (src && src.v7def && src.v7def.cluster && source === 'player') U.safe('v7.cluster', () => queueBomblets(this, x, y, src.v7def));
      return res;
    };

    const origUpdate = G._update;
    G._update = function (realDt) {
      origUpdate.call(this, realDt);
      const b = this._v7bomblets;
      if (!b || !b.length || this.hitStop > 0) return;
      const dt = realDt * this.timeScale;
      U.safe('v7.bomblets', () => {
        for (let i = b.length - 1; i >= 0; i--) {
          b[i].t -= dt;
          if (b[i].t > 0) continue;
          const q = b[i];
          b.splice(i, 1);
          this.explode(q.x, q.y, q.r, q.dmg, 'player', { small: true });
        }
      });
    };

    const origStart = G.startMission;
    G.startMission = function (id) { this._v7bomblets = []; this._v7cluster = null; return origStart.apply(this, arguments); };
  }

  function queueBomblets(game, x, y, def) {
    const list = game._v7bomblets || (game._v7bomblets = []);
    const n = def.cluster || 5;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + U.rand(-0.3, 0.3), d = U.rand(55, 125);
      let bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d;
      const hit = BO.Collision.raycast(game.map, x, y, bx, by, BO.COLLIDE.BULLET);
      if (hit && hit.hit) { bx = x + (hit.x - x) * 0.75; by = y + (hit.y - y) * 0.75; }
      list.push({ x: bx, y: by, t: 0.2 + i * 0.07 + U.rand(0, 0.05), r: def.clusterRadius || 70, dmg: def.clusterDamage || 45 });
      game.particles.spawn(x, y, Math.cos(a) * d * 3, Math.sin(a) * d * 3, 0.28, 3.5, 1, '#ffcf6b', glow(), { additive: true, drag: 4 });
    }
    if (list.length > 40) list.splice(0, list.length - 40);
  }

  /* ------------------------ Chill (shared slow) ------------------------ */
  // Chilled hostiles think and move on a slowed clock. Used by FROSTBITE and
  // by cryo / quicksand hazards (v7-world.js).
  const AIP = BO.AISystem && BO.AISystem.prototype;
  if (AIP && AIP._updateEnemy) {
    const origUE = AIP._updateEnemy;
    AIP._updateEnemy = function (e, dt) {
      if (!e || e.dead || !(e.v7chillT > 0)) return origUE.call(this, e, dt);
      const mul = U.clamp(e.v7chillMul || 0.5, 0.2, 1);
      e.v7chillT -= dt;
      if (e.v7chillT <= 0) { e.v7chillT = 0; e.v7chillMul = 1; }
      const g = this.game;
      if (g && g.particles && Math.random() < dt * 8) {
        g.particles.spawn(e.x + U.randSpread() * e.r, e.y + U.randSpread() * e.r, 0, -U.rand(10, 30), U.rand(0.4, 0.7), 2.5, 0.5, '#bfefff', glow(), { additive: true, drag: 1 });
      }
      return origUE.call(this, e, dt * mul);
    };
  }

  /* ------------------------ Weapon silhouettes ------------------------ */
  const W = BO.Weapons;
  const origShape = W.drawWeaponShape;
  W.drawWeaponShape = function (ctx, def, scale, accent) {
    origShape(ctx, def, scale, accent);
    const look = def.look || {};
    const L = (look.length || 20) * scale, Wd = (look.width || 6) * scale;
    if (look.bow) {
      // Top-down bow: curved limbs across the grip and a taut string.
      const cx = L * 0.35, r = L * 0.55;
      ctx.save();
      ctx.strokeStyle = '#7a5c3a'; ctx.lineWidth = Math.max(1.5, 2.4 * scale); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx - r * 0.55, 0, r, -1.05, 1.05); ctx.stroke();
      const ex = cx - r * 0.55 + Math.cos(1.05) * r, ey = Math.sin(1.05) * r;
      ctx.strokeStyle = 'rgba(230,220,200,0.7)'; ctx.lineWidth = Math.max(0.6, 0.8 * scale);
      ctx.beginPath(); ctx.moveTo(ex, -ey); ctx.lineTo(L * 0.05, 0); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = '#efe2c4'; ctx.fillRect(L * 0.05, -0.6 * scale, L * 1.05, 1.2 * scale);
      ctx.restore();
    }
    if (look.suppressor) { ctx.fillStyle = '#14161c'; ctx.fillRect(L * 0.95, -Wd * 0.36, L * 0.42, Wd * 0.72); }
  };
  const origIcon = W.drawWeaponIcon;
  W.drawWeaponIcon = function (ctx, def, cx, cy, size, color) {
    const look = def.look || {};
    if (!look.bow) {
      origIcon(ctx, def, cx, cy, size, color);
      if (look.suppressor) {
        const L = size, H = size * 0.16, bodyX = L * 0.25;
        ctx.fillStyle = color; ctx.fillRect(cx - L / 2 + bodyX + L * 0.68, cy - H * 0.3, L * 0.22, H * 0.6);
      }
      return;
    }
    // Side-profile recurve bow.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, size * 0.05); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-size * 0.08, -size * 0.42);
    ctx.quadraticCurveTo(size * 0.22, -size * 0.2, size * 0.04, 0);
    ctx.quadraticCurveTo(size * 0.22, size * 0.2, -size * 0.08, size * 0.42);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-size * 0.08, -size * 0.42); ctx.lineTo(-size * 0.2, 0); ctx.lineTo(-size * 0.08, size * 0.42); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, size * 0.025);
    ctx.beginPath(); ctx.moveTo(-size * 0.2, 0); ctx.lineTo(size * 0.45, 0); ctx.stroke();
    ctx.restore();
  };

  /* ------------------------------ Strings ----------------------------- */
  BO.I18N.extend('en', {
    'w.whisper': 'WHISPER .22', 'w.rivet': 'RIVET DRIVER', 'w.arash': 'ARASH BOW', 'w.seeker': 'SEEKER SMG',
    'w.shredder': 'SHREDDER', 'w.frostbite': 'FROSTBITE CRYO', 'w.rostam': 'ROSTAM HMG', 'w.hailstorm': 'HAILSTORM',
    'wd.whisper': 'Integrally suppressed pistol. Guards a few rooms away will never hear it.',
    'wd.rivet': 'Industrial nail gun turned sidearm. Full-auto rivets that punch through two targets.',
    'wd.arash': 'Silent compound bow named after the legendary archer. One arrow at a time, through two targets.',
    'wd.seeker': 'Smart rounds that curve into the nearest hostile you can see. Spray, and let them find the way.',
    'wd.shredder': 'Ten flechettes per shell, every dart passes through its first target.',
    'wd.frostbite': 'Cryo bolts that chill hostiles to half speed. Freeze the rush, then finish it.',
    'wd.rostam': 'Heavy machine gun for heroes only. Big rounds, pierces one, but you move like a tank.',
    'wd.hailstorm': 'Cluster launcher. The shell bursts and scatters five bomblets around the impact.'
  });
  BO.I18N.extend('fa', {
    'w.whisper': 'کلت نجوا', 'w.rivet': 'میخ‌کوب پرچ', 'w.arash': 'کمان آرش', 'w.seeker': 'مسلسل جوینده',
    'w.shredder': 'شات‌گان دَرنده', 'w.frostbite': 'تفنگ یخ‌زن', 'w.rostam': 'تیربار رستم', 'w.hailstorm': 'تگرگ‌افکن',
    'wd.whisper': 'کلت صداخفه‌کن‌دار. نگهبان‌های چند اتاق آن‌طرف‌تر هرگز صدایش را نمی‌شنوند.',
    'wd.rivet': 'میخ‌کوب صنعتی که اسلحه کمری شده. پرچ‌های تمام‌خودکار که از دو هدف رد می‌شوند.',
    'wd.arash': 'کمان بی‌صدا به نام کمانگیر افسانه‌ای. هر بار یک تیر، که از دو هدف می‌گذرد.',
    'wd.seeker': 'گلوله‌های هوشمند که به سمت نزدیک‌ترین دشمنِ در دید می‌پیچند. شلیک کن، خودشان راه را پیدا می‌کنند.',
    'wd.shredder': 'ده تیرک در هر فشنگ، هر کدام از هدف اول عبور می‌کند.',
    'wd.frostbite': 'گلوله‌های یخی که سرعت دشمن را نصف می‌کنند. هجوم را منجمد کن، بعد کارش را تمام کن.',
    'wd.rostam': 'تیربار سنگین، فقط برای پهلوان‌ها. گلوله‌های درشت، از یک هدف رد می‌شود، ولی مثل تانک راه می‌روی.',
    'wd.hailstorm': 'نارنجک‌انداز خوشه‌ای. گلوله منفجر می‌شود و پنج بمبک دور نقطه برخورد می‌پاشد.'
  });
})(window.BO);