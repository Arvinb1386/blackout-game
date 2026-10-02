/* =========================================================================
 * BLACKOUT :: upgrades.js
 * Persistent progression: XP levels and credit-purchased upgrades.
 * Effects are applied in player.js (hp/armor/speed) and weapons.js
 * (damage/accuracy/magazine/reload).
 * ========================================================================= */
'use strict';
(function (BO) {
  const MAX_LEVEL = 5;
  const UPGRADES = [
    { id: 'maxHp', base: 300, icon: 'health' },
    { id: 'armor', base: 260, icon: 'armor' },
    { id: 'speed', base: 350, icon: 'speed' },
    { id: 'reload', base: 300, icon: 'reload' },
    { id: 'damage', base: 450, icon: 'damage' },
    { id: 'accuracy', base: 320, icon: 'accuracy' },
    { id: 'magazine', base: 280, icon: 'magazine' }
  ];

  const UpgradeSystem = {
    list: UPGRADES,
    maxLevel: MAX_LEVEL,
    level(save, id) { return save.upgrades[id] || 0; },
    cost(save, id) {
      const u = UPGRADES.find(x => x.id === id);
      if (!u) return Infinity;
      const lvl = this.level(save, id);
      return Math.round(u.base * Math.pow(lvl + 1, 1.45) / 10) * 10;
    },
    canBuy(save, id) {
      return this.level(save, id) < MAX_LEVEL && save.credits >= this.cost(save, id);
    },
    buy(save, id) {
      if (!this.canBuy(save, id)) return false;
      save.credits -= this.cost(save, id);
      save.upgrades[id] = this.level(save, id) + 1;
      return true;
    },
    /** XP needed to go from `level` to `level + 1`. */
    xpForLevel(level) { return Math.round(200 * Math.pow(level, 1.35)); },
    /** Adds XP and returns the list of levels gained (for notifications). */
    addXP(save, amount) {
      const gained = [];
      save.xp += Math.max(0, Math.round(amount));
      let guard = 0;
      while (save.xp >= this.xpForLevel(save.level) && guard++ < 50) {
        save.xp -= this.xpForLevel(save.level);
        save.level++;
        save.credits += BO.CONFIG.LEVEL_UP_BONUS * save.level;
        gained.push(save.level);
      }
      return gained;
    },
    unlockWeapon(save, id) {
      const w = BO.WEAPONS[id];
      if (!w || save.unlockedWeapons.indexOf(id) >= 0 || save.credits < w.price) return false;
      save.credits -= w.price;
      save.unlockedWeapons.push(id);
      return true;
    }
  };

  BO.UpgradeSystem = UpgradeSystem;
})(window.BO);
