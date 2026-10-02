/* =========================================================================
 * BLACKOUT :: arsenal.js
 * Weapon expansion pack: six new guns plugged into the existing data-driven
 * weapon pipeline, plus their synthesized sounds, plasma bolts, railgun beam
 * and glowing weapon silhouettes.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;

  const NEW_WEAPONS = {
    mpistol: {
      slot: 'secondary', price: 700, damage: 17, pellets: 1, fireRate: 15, mag: 22, reserve: 176, reload: 1.2,
      spread: 0.07, recoil: 0.012, maxBloom: 0.1, recovery: 0.45, bulletSpeed: 1400, range: 600, auto: true,
      shake: 0.05, kick: 2, hitStop: 0, knockback: 30, moveMul: 1.05, sound: 'mpistol', tracer: '#ffe9b0', tracerWidth: 1.5,
      casing: true, lookAhead: 0.2, look: { length: 15, width: 5, color: '#2e3240' }
    },
    stinger: {
      slot: 'secondary', price: 1600, damage: 95, pellets: 1, fireRate: 1.1, mag: 3, reserve: 18, reload: 2.2,
      spread: 0.02, recoil: 0.06, maxBloom: 0.1, recovery: 0.4, bulletSpeed: 900, range: 650, auto: false, explosive: 95,
      shake: 0.2, kick: 8, hitStop: 0, knockback: 0, moveMul: 1, sound: 'stinger', tracer: '#ff7a3c', tracerWidth: 4,
      casing: false, grenade: true, lookAhead: 0.25, look: { length: 18, width: 8, color: '#45402f', glow: '#ff7a3c' }
    },
    autoshotgun: {
      slot: 'primary', price: 2400, damage: 13, pellets: 7, fireRate: 4, mag: 20, reserve: 120, reload: 2.8,
      spread: 0.26, recoil: 0.03, maxBloom: 0.1, recovery: 0.5, bulletSpeed: 1250, range: 420, auto: true,
      shake: 0.24, kick: 8, hitStop: 0.015, knockback: 90, moveMul: 0.95, sound: 'autoshotgun', tracer: '#ffb26b', tracerWidth: 1.5,
      casing: true, bigCasing: true, lookAhead: 0.18, look: { length: 30, width: 9, color: '#3a3330', drum: true }
    },
    plasma: {
      slot: 'primary', price: 3000, damage: 30, pellets: 1, fireRate: 6, mag: 40, reserve: 240, reload: 2,
      spread: 0.03, recoil: 0.015, maxBloom: 0.1, recovery: 0.4, bulletSpeed: 1050, range: 900, auto: true, pierce: 2,
      shake: 0.1, kick: 3.5, hitStop: 0, knockback: 40, moveMul: 0.97, sound: 'plasma', tracer: '#5cf2ff', tracerWidth: 3,
      casing: false, orb: true, lookAhead: 0.26, look: { length: 30, width: 9, color: '#1f2b3a', glow: '#5cf2ff' }
    },
    minigun: {
      slot: 'primary', price: 3400, damage: 16, pellets: 1, fireRate: 22, mag: 200, reserve: 400, reload: 4.2,
      spread: 0.075, recoil: 0.006, maxBloom: 0.14, recovery: 0.25, bulletSpeed: 1700, range: 950, auto: true,
      shake: 0.07, kick: 2.5, hitStop: 0, knockback: 40, moveMul: 0.74, sound: 'minigun', tracer: '#ffcf86', tracerWidth: 1.8,
      casing: true, lookAhead: 0.24, look: { length: 38, width: 11, color: '#34363a', drum: true, barrels: 3 }
    },
    railgun: {
      slot: 'primary', price: 3800, damage: 210, pellets: 1, fireRate: 0.7, mag: 4, reserve: 24, reload: 3,
      spread: 0.001, recoil: 0.1, maxBloom: 0.1, recovery: 0.4, bulletSpeed: 5200, range: 2200, auto: false, pierce: 5,
      shake: 0.42, kick: 14, hitStop: 0.05, knockback: 260, moveMul: 0.9, sound: 'railgun', tracer: '#7fe3ff', tracerWidth: 4,
      casing: false, rail: true, lookAhead: 0.5, look: { length: 42, width: 8, color: '#22303a', scope: true, glow: '#19c3dd' }
    }
  };

  Object.keys(NEW_WEAPONS).forEach(id => { NEW_WEAPONS[id].id = id; BO.WEAPONS[id] = NEW_WEAPONS[id]; });

  const ORDER = ['pistol', 'revolver', 'mpistol', 'stinger', 'smg', 'ar', 'burst', 'shotgun', 'autoshotgun', 'dmr',
    'plasma', 'lmg', 'minigun', 'sniper', 'railgun', 'launcher'];
  const merged = ORDER.filter(id => BO.WEAPONS[id]);
  BO.WEAPON_ORDER.forEach(id => { if (merged.indexOf(id) < 0) merged.push(id); });
  BO.WEAPON_ORDER.length = 0;
  merged.forEach(id => BO.WEAPON_ORDER.push(id));

  /* ------------------------------ Sounds ------------------------------ */
  const EXTRA_SHOTS = {
    mpistol:     { noiseDur: 0.06, cut0: 3600, cut1: 1300, body0: 230, body1: 100, bodyDur: 0.045, vol: 0.3 },
    stinger:     { noiseDur: 0.3,  cut0: 1100, cut1: 180,  body0: 200, body1: 50,  bodyDur: 0.25,  vol: 0.62, whoosh: true },
    autoshotgun: { noiseDur: 0.3,  cut0: 2400, cut1: 300,  body0: 100, body1: 34,  bodyDur: 0.2,   vol: 0.7 },
    minigun:     { noiseDur: 0.05, cut0: 3800, cut1: 1500, body0: 160, body1: 70,  bodyDur: 0.04,  vol: 0.3, gap: 0.02 },
    railgun:     { noiseDur: 0.4,  cut0: 7000, cut1: 500,  body0: 70,  body1: 26,  bodyDur: 0.45,  vol: 0.9, zap: [2400, 140, 0.5] },
    plasma:      { noiseDur: 0.08, cut0: 2000, cut1: 800,  body0: 620, body1: 180, bodyDur: 0.12,  vol: 0.34, wave: 'square', zap: [1400, 300, 0.14] }
  };

  const AS = BO.AudioSystem && BO.AudioSystem.prototype;
  if (AS && AS.shot) {
    const origShot = AS.shot;
    AS.shot = function (kind, x, y, pitch) {
      const p = EXTRA_SHOTS[kind];
      if (!p) return origShot.call(this, kind, x, y, pitch);
      if (!this._ready()) return;
      if (!this._throttle('shot:' + kind, p.gap || 0.028)) return;
      const s = this.spatial(x, y);
      if (s.vol <= 0.01) return;
      const k = pitch || 1;
      const out = this._out(this.sfxBus, p.vol * s.vol, s.pan);
      this.noise({ dur: p.noiseDur, freq: p.cut0 * k, freqEnd: p.cut1, vol: 1, out });
      this.tone({ type: p.wave || 'sine', freq: p.body0 * k, freqEnd: p.body1, dur: p.bodyDur, vol: 0.9, out });
      if (p.zap) this.tone({ type: 'sawtooth', freq: p.zap[0] * k, freqEnd: p.zap[1], dur: p.zap[2], vol: 0.45, out, filter: 'lowpass', filterFreq: 4200 });
      if (p.whoosh) this.noise({ dur: 0.38, filter: 'bandpass', freq: 400, freqEnd: 2600, q: 1.4, vol: 0.55, out });
      this.noise({ dur: 0.02, filter: 'highpass', freq: 5000, vol: 0.5, out });
    };
  }

  /* --------------------------- Plasma bolts --------------------------- */
  const PS = BO.ProjectileSystem && BO.ProjectileSystem.prototype;
  if (PS && PS.spawn) {
    const origSpawn = PS.spawn;
    PS.spawn = function (s) {
      const p = origSpawn.call(this, s);
      if (p && s.owner === BO.PROJECTILE_OWNER.PLAYER && s.source && s.source.weapon && s.source.weapon.def.orb &&
          s.kind !== BO.PROJECTILE_KIND.GRENADE) p.kind = BO.PROJECTILE_KIND.ORB;
      return p;
    };
  }

  /* --------------------------- Railgun beam --------------------------- */
  const G = BO.Game && BO.Game.prototype;
  if (G) {
    const origFired = G.onPlayerFired;
    G.onPlayerFired = function (player, w, mx, my, angle) {
      origFired.call(this, player, w, mx, my, angle);
      const def = w.def;
      if (def.rail) U.safe('arsenal.rail', () => {
        const hit = BO.Collision.raycast(this.map, mx, my, mx + Math.cos(angle) * def.range, my + Math.sin(angle) * def.range, BO.COLLIDE.BULLET);
        const beams = this._beams || (this._beams = []);
        beams.push({ x0: mx, y0: my, x1: hit.x, y1: hit.y, life: 0.4, max: 0.4, color: def.tracer });
        if (beams.length > 6) beams.shift();
        this.addLight(hit.x, hit.y, 240, def.tracer, 0.3, 0.9);
        this.addLight((mx + hit.x) / 2, (my + hit.y) / 2, 320, def.tracer, 0.18, 0.5);
        this.particles.sparks(hit.x, hit.y, angle + Math.PI, 16, def.tracer, 560);
      });
      if (def.orb) this.addLight(mx, my, 170, def.tracer, 0.08, 0.85);
    };
    const origLights = G._updateLights;
    G._updateLights = function (dt) {
      origLights.call(this, dt);
      const b = this._beams;
      if (!b) return;
      for (let i = b.length - 1; i >= 0; i--) { b[i].life -= dt; if (b[i].life <= 0) b.splice(i, 1); }
    };
    const origStart = G.startMission;
    G.startMission = function (id) { this._beams = []; return origStart.call(this, id); };
  }

  const R = BO.Renderer && BO.Renderer.prototype;
  if (R && R._drawColoredLights) {
    const origColored = R._drawColoredLights;
    R._drawColoredLights = function (ctx, game, rect, time) {
      origColored.call(this, ctx, game, rect, time);
      const beams = game && game._beams;
      if (!beams || !beams.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < beams.length; i++) {
        const b = beams[i], k = U.clamp(b.life / b.max, 0, 1);
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1);
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.18 * k; ctx.lineWidth = 22 * k + 2; ctx.stroke();
        ctx.globalAlpha = 0.55 * k; ctx.lineWidth = 6 * k + 1; ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = k; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
    };
  }

  /* ------------------------ Weapon silhouettes ------------------------ */
  const W = BO.Weapons;
  const origShape = W.drawWeaponShape;
  W.drawWeaponShape = function (ctx, def, scale, accent) {
    origShape(ctx, def, scale, accent);
    const look = def.look || {};
    const L = (look.length || 20) * scale, Wd = (look.width || 6) * scale;
    if (look.barrels) {
      ctx.fillStyle = '#1a1c22';
      for (let i = 0; i < look.barrels; i++) ctx.fillRect(L * 0.82, -Wd * 0.36 + i * Wd * 0.3, L * 0.42, Wd * 0.14);
    }
    if (look.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = look.glow;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(L * 0.3, -Wd * 0.12, L * 0.5, Math.max(1.2, Wd * 0.24));
      ctx.restore();
    }
  };
  const origIcon = W.drawWeaponIcon;
  W.drawWeaponIcon = function (ctx, def, cx, cy, size, color) {
    origIcon(ctx, def, cx, cy, size, color);
    const look = def.look || {};
    if (!look.glow && !look.barrels) return;
    const L = size, H = size * 0.16;
    const bodyX = def.slot === 'primary' ? L * 0.2 : L * 0.25;
    ctx.save();
    ctx.translate(cx - L / 2, cy);
    if (look.barrels) {
      ctx.fillStyle = color;
      for (let i = 0; i < look.barrels; i++) ctx.fillRect(bodyX + L * 0.55, -H * 0.42 + i * H * 0.36, L * 0.3, H * 0.16);
    }
    if (look.glow) { ctx.fillStyle = look.glow; ctx.fillRect(bodyX + L * 0.12, -H * 0.12, L * 0.4, H * 0.24); }
    ctx.restore();
  };

  /* ------------------------------ Strings ----------------------------- */
  BO.I18N.extend('en', {
    'w.mpistol': 'WASP MP', 'w.stinger': 'STINGER RL', 'w.autoshotgun': 'REAPER AUTO-12',
    'w.plasma': 'HELIX PLASMA', 'w.minigun': 'STORM ROTARY', 'w.railgun': 'LANCE RAILGUN',
    'wd.mpistol': 'Full-auto sidearm. Empties fast, hits often.',
    'wd.stinger': 'Pocket rocket launcher. Three shots that end arguments.',
    'wd.autoshotgun': 'Full-auto drum shotgun. Rooms clear themselves.',
    'wd.plasma': 'Superheated bolts that burn through two targets.',
    'wd.minigun': '22 rounds a second. You walk slow, you win.',
    'wd.railgun': 'Magnetic slug. Punches through five targets and leaves a trail of light.'
  });
  BO.I18N.extend('fa', {
    'w.mpistol': 'مسلسل کمری واسپ', 'w.stinger': 'موشک‌انداز استینگر', 'w.autoshotgun': 'شات‌گان خودکار ریپر',
    'w.plasma': 'تفنگ پلاسمای هلیکس', 'w.minigun': 'مینی‌گان طوفان', 'w.railgun': 'ریل‌گان لنس',
    'wd.mpistol': 'کمری تمام‌خودکار. زود خالی می‌شود، زیاد می‌زند.',
    'wd.stinger': 'موشک‌انداز جیبی. سه شلیک که بحث را تمام می‌کند.',
    'wd.autoshotgun': 'شات‌گان خشاب‌طبلی تمام‌خودکار. اتاق‌ها خودشان خالی می‌شوند.',
    'wd.plasma': 'گلوله‌های فوق‌داغ که از دو هدف عبور می‌کنند.',
    'wd.minigun': 'بیست‌ودو گلوله در ثانیه. آهسته راه می‌روی، ولی می‌بری.',
    'wd.railgun': 'گلوله مغناطیسی. از پنج هدف رد می‌شود و ردی از نور به جا می‌گذارد.'
  });
})(window.BO);
