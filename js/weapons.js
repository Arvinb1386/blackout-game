/* =========================================================================
 * BLACKOUT :: weapons.js
 * Data-driven weapon definitions and one reusable WeaponInstance class.
 * Every gun runs through the same fire / reload / recoil / burst pipeline;
 * guns differ only by their data.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;

  /**
   * Field reference:
   *  damage, pellets, fireRate (shots/s), mag, reserve (max reserve), reload (s)
   *  spread (rad, base cone), recoil (bloom added per shot), maxBloom, recovery (bloom/s)
   *  bulletSpeed (px/s), range (px), auto, burst/burstRate, pierce, explosive (radius)
   *  shake (camera trauma per shot), kick (px), hitStop (s), knockback, moveMul
   *  sound (audio profile), tracer colour/width, look (procedural silhouette)
   */
  const WEAPONS = {
    pistol: {
      slot: 'secondary', price: 0, damage: 40, pellets: 1, fireRate: 4, mag: 12, reserve: 96, reload: 1.1,
      spread: 0.018, recoil: 0.03, maxBloom: 0.08, recovery: 0.35, bulletSpeed: 1600, range: 950, auto: false,
      shake: 0.11, kick: 4, hitStop: 0, knockback: 70, moveMul: 1, sound: 'pistol', tracer: '#ffd9a0', tracerWidth: 2,
      casing: true, lookAhead: 0.22, look: { length: 16, width: 5, color: '#3b3f4d' }
    },
    revolver: {
      slot: 'secondary', price: 900, damage: 78, pellets: 1, fireRate: 2, mag: 6, reserve: 48, reload: 1.9,
      spread: 0.01, recoil: 0.07, maxBloom: 0.12, recovery: 0.3, bulletSpeed: 1900, range: 1050, auto: false, pierce: 1,
      shake: 0.22, kick: 9, hitStop: 0.025, knockback: 140, moveMul: 1, sound: 'revolver', tracer: '#ffc070', tracerWidth: 3,
      casing: false, lookAhead: 0.25, look: { length: 20, width: 6, color: '#5b4b3d' }
    },
    smg: {
      slot: 'primary', price: 0, damage: 15, pellets: 1, fireRate: 14, mag: 35, reserve: 280, reload: 1.4,
      spread: 0.085, recoil: 0.01, maxBloom: 0.09, recovery: 0.4, bulletSpeed: 1350, range: 650, auto: true,
      shake: 0.06, kick: 2.5, hitStop: 0, knockback: 35, moveMul: 1.05, sound: 'smg', tracer: '#ffe2a8', tracerWidth: 1.6,
      casing: true, lookAhead: 0.2, look: { length: 22, width: 6, color: '#33384a' }
    },
    ar: {
      slot: 'primary', price: 0, damage: 25, pellets: 1, fireRate: 10, mag: 30, reserve: 240, reload: 1.6,
      spread: 0.032, recoil: 0.018, maxBloom: 0.12, recovery: 0.32, bulletSpeed: 1750, range: 1050, auto: true,
      shake: 0.09, kick: 3.5, hitStop: 0, knockback: 55, moveMul: 1, sound: 'rifle', tracer: '#ffcf86', tracerWidth: 2,
      casing: true, lookAhead: 0.25, look: { length: 30, width: 6, color: '#2f3442' }
    },
    burst: {
      slot: 'primary', price: 1200, damage: 30, pellets: 1, fireRate: 3.2, burst: 3, burstRate: 16, mag: 30, reserve: 210, reload: 1.7,
      spread: 0.02, recoil: 0.012, maxBloom: 0.06, recovery: 0.45, bulletSpeed: 1900, range: 1100, auto: true,
      shake: 0.09, kick: 3.5, hitStop: 0, knockback: 60, moveMul: 1, sound: 'burst', tracer: '#9fe8ff', tracerWidth: 2,
      casing: true, lookAhead: 0.27, look: { length: 32, width: 7, color: '#2b3a46' }
    },
    shotgun: {
      slot: 'primary', price: 800, damage: 15, pellets: 8, fireRate: 1.2, mag: 8, reserve: 56, reload: 2.3,
      spread: 0.3, recoil: 0.04, maxBloom: 0.08, recovery: 0.5, bulletSpeed: 1250, range: 430, auto: false,
      shake: 0.34, kick: 12, hitStop: 0.035, knockback: 120, moveMul: 0.97, sound: 'shotgun', tracer: '#ffb26b', tracerWidth: 1.6,
      casing: true, bigCasing: true, lookAhead: 0.18, look: { length: 28, width: 8, color: '#4a3a32' }
    },
    dmr: {
      slot: 'primary', price: 1500, damage: 72, pellets: 1, fireRate: 3, mag: 15, reserve: 105, reload: 1.9,
      spread: 0.008, recoil: 0.045, maxBloom: 0.1, recovery: 0.4, bulletSpeed: 2400, range: 1400, auto: false, pierce: 1,
      shake: 0.18, kick: 7, hitStop: 0.015, knockback: 110, moveMul: 0.96, sound: 'dmr', tracer: '#d8f4ff', tracerWidth: 2.4,
      casing: true, lookAhead: 0.36, look: { length: 36, width: 6, color: '#3a3f37', scope: true }
    },
    lmg: {
      slot: 'primary', price: 2200, damage: 22, pellets: 1, fireRate: 12, mag: 100, reserve: 300, reload: 3.6,
      spread: 0.055, recoil: 0.009, maxBloom: 0.16, recovery: 0.22, bulletSpeed: 1650, range: 1050, auto: true,
      shake: 0.11, kick: 4, hitStop: 0, knockback: 60, moveMul: 0.82, sound: 'lmg', tracer: '#ffc27a', tracerWidth: 2.2,
      casing: true, lookAhead: 0.25, look: { length: 34, width: 9, color: '#3d3a2f', drum: true }
    },
    sniper: {
      slot: 'primary', price: 2000, damage: 150, pellets: 1, fireRate: 0.8, mag: 5, reserve: 35, reload: 2.8,
      spread: 0.002, recoil: 0.12, maxBloom: 0.14, recovery: 0.35, bulletSpeed: 3400, range: 1900, auto: false, pierce: 2,
      shake: 0.48, kick: 16, hitStop: 0.06, knockback: 220, moveMul: 0.9, sound: 'sniper', tracer: '#ffffff', tracerWidth: 3,
      casing: true, bigCasing: true, lookAhead: 0.5, laser: true, look: { length: 44, width: 6, color: '#26302c', scope: true }
    },
    launcher: {
      slot: 'primary', price: 2800, damage: 130, pellets: 1, fireRate: 1, mag: 6, reserve: 24, reload: 2.6,
      spread: 0.02, recoil: 0.05, maxBloom: 0.08, recovery: 0.4, bulletSpeed: 760, range: 720, auto: false, explosive: 140,
      shake: 0.25, kick: 10, hitStop: 0, knockback: 0, moveMul: 0.93, sound: 'launcher', tracer: '#ff9a3c', tracerWidth: 5,
      casing: false, grenade: true, lookAhead: 0.28, look: { length: 26, width: 11, color: '#3f4436', drum: true }
    }
  };
  Object.keys(WEAPONS).forEach(id => { WEAPONS[id].id = id; });

  const WEAPON_ORDER = ['pistol', 'revolver', 'smg', 'ar', 'burst', 'shotgun', 'dmr', 'lmg', 'sniper', 'launcher'];

  // Defaults; data/weapons.json may replace them at boot (js/weapon-config.js),
  // so they are read lazily instead of captured at load time.
  const UPGRADE_DEFAULTS = { damage: 0.08, accuracy: 0.1, magazine: 0.1, reload: 0.08 };
  const upgradeFactors = () => Object.assign({}, UPGRADE_DEFAULTS, BO.WEAPON_UPGRADE_FACTORS || null);

  /** Applies persistent upgrades to a definition, producing effective stats. */
  function computeStats(def, upgrades) {
    const up = upgrades || {};
    const F = upgradeFactors();
    return {
      damage: def.damage * (1 + F.damage * (up.damage || 0)),
      spread: def.spread * (1 - F.accuracy * (up.accuracy || 0)),
      mag: Math.round(def.mag * (1 + F.magazine * (up.magazine || 0))),
      reload: def.reload * (1 - F.reload * (up.reload || 0)),
      reserve: Math.round(def.reserve * (1 + F.magazine * (up.magazine || 0)))
    };
  }

  /** Normalised 0..100 display stats for loadout bars. */
  function displayStats(def, upgrades) {
    const s = computeStats(def, upgrades);
    return {
      damage: U.clamp((s.damage * def.pellets) / 1.6, 4, 100),
      fireRate: U.clamp(def.fireRate * (def.burst || 1) * 6.5, 4, 100),
      accuracy: U.clamp(100 - s.spread * 330, 4, 100),
      magazine: U.clamp(s.mag, 1, 100),
      reload: U.clamp(110 - s.reload * 28, 4, 100),
      raw: s
    };
  }

  class WeaponInstance {
    constructor(def, upgrades) {
      this.def = def;
      this.stats = computeStats(def, upgrades);
      this.mag = this.stats.mag;
      this.reserve = this.stats.reserve;
      this.cooldown = 0;
      this.reloading = false;
      this.reloadTimer = 0;
      this.burstLeft = 0;
      this.burstTimer = 0;
      this.bloom = 0;
    }

    get reloadProgress() { return this.reloading ? 1 - this.reloadTimer / this.stats.reload : 0; }
    get isEmpty() { return this.mag <= 0; }
    get outOfAmmo() { return this.mag <= 0 && this.reserve <= 0; }

    update(dt, audio) {
      if (this.cooldown > 0) this.cooldown -= dt;
      if (this.burstTimer > 0) this.burstTimer -= dt;
      this.bloom = Math.max(0, this.bloom - this.def.recovery * dt);
      if (this.reloading) {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) this._finishReload(audio);
      }
      // Guard against invalid state (e.g. corrupted numbers) so a weapon can never lock up.
      if (!U.isFiniteNumber(this.mag) || this.mag < 0) this.mag = 0;
      if (!U.isFiniteNumber(this.reserve) || this.reserve < 0) this.reserve = 0;
    }

    startReload(audio) {
      if (this.reloading || this.mag >= this.stats.mag || this.reserve <= 0) return false;
      this.reloading = true;
      this.burstLeft = 0;
      this.reloadTimer = this.stats.reload;
      if (audio) audio.reloadStart();
      return true;
    }

    _finishReload(audio) {
      const take = Math.min(this.stats.mag - this.mag, this.reserve);
      this.mag += take;
      this.reserve -= take;
      this.reloading = false;
      if (audio) audio.reloadEnd();
    }

    cancelReload() { this.reloading = false; this.reloadTimer = 0; this.burstLeft = 0; }

    addAmmo(fraction) {
      const before = this.reserve;
      this.reserve = Math.min(this.stats.reserve, this.reserve + Math.ceil(this.stats.reserve * fraction));
      return this.reserve > before;
    }

    /**
     * Trigger handling. Returns the number of shots that should be fired this
     * frame (0 or 1; burst weapons emit their rounds across frames).
     */
    pullTrigger(held, pressed, rateMul) {
      if (this.reloading) return 0;
      const def = this.def;
      if (def.burst) {
        if (this.burstLeft > 0) {
          if (this.burstTimer <= 0 && this.mag > 0) {
            this.burstLeft--;
            this.burstTimer = 1 / (def.burstRate * rateMul);
            if (this.burstLeft === 0) this.cooldown = 1 / (def.fireRate * rateMul);
            return 1;
          }
          if (this.mag <= 0) this.burstLeft = 0;
          return 0;
        }
        if ((pressed || held) && this.cooldown <= 0 && this.mag > 0) {
          this.burstLeft = def.burst - 1;
          this.burstTimer = 1 / (def.burstRate * rateMul);
          if (this.burstLeft === 0) this.cooldown = 1 / (def.fireRate * rateMul);
          return 1;
        }
        return 0;
      }
      const wants = def.auto ? held : pressed;
      if (wants && this.cooldown <= 0 && this.mag > 0) {
        this.cooldown = 1 / (def.fireRate * rateMul);
        return 1;
      }
      return 0;
    }

    /** Current total spread including recoil bloom. */
    currentSpread(extra) { return this.stats.spread + this.bloom + (extra || 0); }

    consumeRound() {
      this.mag = Math.max(0, this.mag - 1);
      this.bloom = Math.min(this.def.maxBloom, this.bloom + this.def.recoil);
    }
  }

  /** Procedural top-down weapon silhouette used by the player sprite, pickups and UI. */
  function drawWeaponShape(ctx, def, scale, accent) {
    const L = def.look.length * scale, W = def.look.width * scale;
    ctx.fillStyle = def.look.color;
    ctx.fillRect(0, -W / 2, L, W);
    ctx.fillStyle = '#151820';
    ctx.fillRect(L * 0.72, -W * 0.28, L * 0.36, W * 0.56);
    if (def.look.scope) { ctx.fillStyle = '#10131a'; ctx.fillRect(L * 0.25, -W * 0.85, L * 0.4, W * 0.5); }
    if (def.look.drum) { ctx.fillStyle = '#2a2d22'; ctx.beginPath(); ctx.arc(L * 0.4, W * 0.75, W * 0.6, 0, U.TAU); ctx.fill(); }
    if (accent) { ctx.fillStyle = accent; ctx.fillRect(L * 0.1, -W / 2, L * 0.18, Math.max(1.5, W * 0.22)); }
  }

  /** Side-profile weapon icon for HUD and menus. */
  function drawWeaponIcon(ctx, def, cx, cy, size, color) {
    const L = size, H = size * 0.16;
    const long = def.look.length > 30;
    ctx.save();
    ctx.translate(cx - L / 2, cy);
    ctx.fillStyle = color;
    const bodyX = def.slot === 'primary' ? L * 0.2 : L * 0.25;
    ctx.fillRect(bodyX, -H / 2, L * 0.55, H);                                   // receiver
    ctx.fillRect(bodyX + L * 0.55, -H * 0.22, L * (long ? 0.25 : 0.16), H * 0.44); // barrel
    if (def.slot === 'primary') {                                                // stock
      ctx.beginPath(); ctx.moveTo(0, -H * 0.3); ctx.lineTo(bodyX, -H / 2); ctx.lineTo(bodyX, H / 2); ctx.lineTo(0, H * 0.9); ctx.closePath(); ctx.fill();
    }
    ctx.save(); ctx.translate(bodyX + L * 0.1, H / 2); ctx.rotate(0.25); ctx.fillRect(0, 0, H * 0.7, H * 1.5); ctx.restore(); // grip
    if (def.look.drum) { ctx.beginPath(); ctx.arc(bodyX + L * 0.32, H * 0.95, H * 0.85, 0, U.TAU); ctx.fill(); }
    else if (def.id === 'shotgun') ctx.fillRect(bodyX + L * 0.38, H * 0.5, L * 0.26, H * 0.5);           // pump
    else if (def.id !== 'revolver') { ctx.save(); ctx.translate(bodyX + L * 0.3, H / 2); ctx.rotate(0.12); ctx.fillRect(0, 0, H * 0.6, H * (def.mag > 30 ? 2 : 1.5)); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(bodyX + L * 0.3, 0, H * 0.75, 0, U.TAU); ctx.fill(); }
    if (def.look.scope) ctx.fillRect(bodyX + L * 0.15, -H * 1.35, L * 0.28, H * 0.6);
    ctx.restore();
  }

  BO.WEAPONS = WEAPONS;
  BO.WEAPON_ORDER = WEAPON_ORDER;
  BO.WeaponInstance = WeaponInstance;
  BO.Weapons = { computeStats, displayStats, drawWeaponShape, drawWeaponIcon };
})(window.BO);
