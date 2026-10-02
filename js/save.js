/* =========================================================================
 * BLACKOUT :: save.js
 * localStorage persistence with strict sanitisation. Any malformed field is
 * replaced by its default so a corrupted save can never crash the game.
 * ========================================================================= */
'use strict';
(function (BO) {
  const SAVE_KEY = 'blackout.save.v1';
  const VERSION = 1;
  const UPGRADE_IDS = ['maxHp', 'armor', 'speed', 'reload', 'damage', 'accuracy', 'magazine'];
  const PARTICLE_LEVELS = ['low', 'medium', 'high'];

  /** In-memory fallback for sandboxed contexts where localStorage throws. */
  const memoryStore = Object.create(null);
  const storage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (e) { return memoryStore[key] || null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); return true; } catch (e) { memoryStore[key] = value; return false; }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
      delete memoryStore[key];
    }
  };

  function defaultSettings() {
    return {
      master: 0.8, music: 0.55, sfx: 0.85, sensitivity: 1, screenShake: true,
      particles: 'high', fps: false, lang: 'fa', postfx: true
    };
  }

  function defaults() {
    const upgrades = {};
    UPGRADE_IDS.forEach(id => { upgrades[id] = 0; });
    return {
      version: VERSION, xp: 0, level: 1, credits: 250,
      unlockedWeapons: ['pistol', 'ar', 'smg'],
      upgrades,
      completedMissions: [],
      bestRatings: {},
      loadout: { primary: 'ar', secondary: 'pistol' },
      settings: defaultSettings(),
      stats: { kills: 0, deaths: 0, missions: 0 }
    };
  }

  const num = (v, fallback, min, max) => (BO.U.isFiniteNumber(v) ? BO.U.clamp(v, min, max) : fallback);

  /** Validates every field of an untrusted object against the schema. */
  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const weaponIds = BO.WEAPONS ? Object.keys(BO.WEAPONS) : d.unlockedWeapons;
    const missionIds = BO.MISSIONS ? BO.MISSIONS.map(m => m.id) : [];
    const out = d;
    out.xp = Math.floor(num(raw.xp, 0, 0, 1e9));
    out.level = Math.floor(num(raw.level, 1, 1, 999));
    out.credits = Math.floor(num(raw.credits, d.credits, 0, 1e9));
    if (Array.isArray(raw.unlockedWeapons)) {
      const list = raw.unlockedWeapons.filter(id => typeof id === 'string' && weaponIds.indexOf(id) >= 0);
      d.unlockedWeapons.forEach(id => { if (list.indexOf(id) < 0) list.push(id); });
      out.unlockedWeapons = Array.from(new Set(list));
    }
    if (raw.upgrades && typeof raw.upgrades === 'object') {
      UPGRADE_IDS.forEach(id => { out.upgrades[id] = Math.floor(num(raw.upgrades[id], 0, 0, 5)); });
    }
    if (Array.isArray(raw.completedMissions)) {
      out.completedMissions = Array.from(new Set(raw.completedMissions.filter(id => typeof id === 'string' && (missionIds.length === 0 || missionIds.indexOf(id) >= 0))));
    }
    if (raw.bestRatings && typeof raw.bestRatings === 'object') {
      for (const k in raw.bestRatings) {
        if (typeof raw.bestRatings[k] === 'string' && /^[SABCD]$/.test(raw.bestRatings[k])) out.bestRatings[k] = raw.bestRatings[k];
      }
    }
    if (raw.loadout && typeof raw.loadout === 'object') {
      const p = raw.loadout.primary, s = raw.loadout.secondary;
      if (out.unlockedWeapons.indexOf(p) >= 0) out.loadout.primary = p;
      if (out.unlockedWeapons.indexOf(s) >= 0 && s !== out.loadout.primary) out.loadout.secondary = s;
    }
    if (raw.settings && typeof raw.settings === 'object') {
      const s = raw.settings;
      out.settings.master = num(s.master, out.settings.master, 0, 1);
      out.settings.music = num(s.music, out.settings.music, 0, 1);
      out.settings.sfx = num(s.sfx, out.settings.sfx, 0, 1);
      out.settings.sensitivity = num(s.sensitivity, 1, 0.2, 3);
      out.settings.screenShake = typeof s.screenShake === 'boolean' ? s.screenShake : true;
      out.settings.particles = PARTICLE_LEVELS.indexOf(s.particles) >= 0 ? s.particles : 'high';
      out.settings.fps = typeof s.fps === 'boolean' ? s.fps : false;
      out.settings.lang = (s.lang === 'fa' || s.lang === 'en') ? s.lang : out.settings.lang;
      out.settings.postfx = typeof s.postfx === 'boolean' ? s.postfx : true;
    }
    if (raw.stats && typeof raw.stats === 'object') {
      out.stats.kills = Math.floor(num(raw.stats.kills, 0, 0, 1e9));
      out.stats.deaths = Math.floor(num(raw.stats.deaths, 0, 0, 1e9));
      out.stats.missions = Math.floor(num(raw.stats.missions, 0, 0, 1e9));
    }
    return out;
  }

  const SaveSystem = {
    data: defaults(),
    wasCorrupted: false,
    load() {
      const raw = storage.get(SAVE_KEY);
      if (!raw) { this.data = defaults(); return this.data; }
      try {
        this.data = sanitize(JSON.parse(raw));
      } catch (err) {
        this.wasCorrupted = true;
        storage.set(SAVE_KEY + '.corrupt', raw);
        this.data = defaults();
        this.save();
      }
      return this.data;
    },
    save() {
      try {
        storage.set(SAVE_KEY, JSON.stringify(this.data));
      } catch (err) { BO.U.reportError('save', err); }
    },
    reset() {
      const keepSettings = this.data.settings;
      storage.remove(SAVE_KEY);
      this.data = defaults();
      this.data.settings = keepSettings;
      this.save();
    },
    sanitize,
    defaults
  };

  BO.SaveSystem = SaveSystem;
  BO.UPGRADE_IDS = UPGRADE_IDS;
})(window.BO);
