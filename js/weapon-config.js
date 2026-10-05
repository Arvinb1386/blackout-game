/* =========================================================================
 * BLACKOUT :: weapon-config.js
 * Loads data/weapons.json (the editable source of truth for every gun) and
 * applies it on top of the built-in definitions from weapons.js / arsenal.js
 * / v4-arsenal.js / v7-arsenal.js.
 *
 * Rules
 *  - Every field present in the JSON for a weapon overrides the built-in one.
 *  - Fields you leave out keep their built-in default, so partial edits are safe.
 *  - Weapons that only exist in the JSON are added to the arsenal.
 *  - Weapons removed from the JSON keep the built-in definition (nothing breaks).
 *  - `order` controls the order guns appear in the loadout screen.
 *  - `upgradeFactors` retunes the damage/accuracy/magazine/reload upgrades.
 *  - Optional per-weapon strings: name.en, name.fa, desc.en, desc.fa.
 *
 * Loading never throws: on failure the game runs on the built-in numbers and
 * prints a console warning. Must load AFTER the arsenal packs, BEFORE js/main.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  /* Values that must stay finite numbers or the gun can lock up mid-fire. */
  const NUMERIC = {
    price: [0, 1e9], damage: [0, 1e6], pellets: [1, 64], fireRate: [0.05, 120],
    burst: [0, 32], burstRate: [0.05, 120], mag: [1, 9999], reserve: [0, 99999],
    reload: [0.05, 60], spread: [0, 3.14159], recoil: [0, 3.14159],
    maxBloom: [0, 3.14159], recovery: [0, 10], bulletSpeed: [50, 20000],
    range: [10, 20000], pierce: [0, 99], explosive: [0, 4000], shake: [0, 3],
    kick: [0, 200], hitStop: [0, 1], knockback: [0, 2000], moveMul: [0.1, 3],
    tracerWidth: [0.1, 40], lookAhead: [0, 3], noise: [0, 4000], burn: [0, 60],
    burnDps: [0, 500], chill: [0, 60], chillMul: [0.05, 2], chain: [0, 32],
    chainRange: [0, 4000], chainFalloff: [0, 1], homing: [0, 40],
    homingRange: [0, 4000], cluster: [0, 64], clusterRadius: [0, 2000],
    clusterDamage: [0, 1e6]
  };
  const BOOLEAN = ['auto', 'casing', 'bigCasing', 'grenade', 'orb', 'rail', 'laser',
    'silent', 'flame', 'cryo', 'arc'];
  const LOOK_NUMERIC = { length: [1, 500], width: [0.5, 200], barrels: [0, 12] };
  const LOOK_BOOLEAN = ['scope', 'drum', 'suppressor', 'bow'];

  function clampNum(key, value, where, errors) {
    const range = NUMERIC[key];
    let v = Number(value);
    if (!isFinite(v)) { errors.push(where + '.' + key + ' is not a number'); return null; }
    if (range && (v < range[0] || v > range[1])) {
      errors.push(where + '.' + key + ' = ' + v + ' clamped to ' + range[0] + '..' + range[1]);
      v = Math.min(range[1], Math.max(range[0], v));
    }
    return v;
  }

  /** Validates one weapon object and returns the cleaned copy. */
  function sanitize(src, id, errors) {
    const where = 'weapons.' + id;
    const def = {};
    Object.keys(src).forEach(key => {
      if (key === 'id' || key === 'name' || key === 'desc') return;
      const v = src[key];
      if (key === 'slot') {
        const s = String(v);
        if (s !== 'primary' && s !== 'secondary') { errors.push(where + '.slot must be primary or secondary'); return; }
        def.slot = s;
        return;
      }
      if (key === 'sound' || key === 'tracer') { def[key] = String(v); return; }
      if (key === 'look') {
        const lk = {};
        Object.keys(v || {}).forEach(k2 => {
          if (LOOK_NUMERIC[k2]) {
            const n = clampNum(k2, v[k2], where + '.look', errors);
            if (n !== null) lk[k2] = n;
          } else if (LOOK_BOOLEAN.indexOf(k2) >= 0) lk[k2] = !!v[k2];
          else lk[k2] = v[k2];
        });
        if (lk.length !== undefined) lk.length = Math.max(LOOK_NUMERIC.length[0], lk.length);
        if (lk.width !== undefined) lk.width = Math.max(LOOK_NUMERIC.width[0], lk.width);
        def.look = lk;
        return;
      }
      if (BOOLEAN.indexOf(key) >= 0) { def[key] = !!v; return; }
      if (NUMERIC[key]) {
        const n = clampNum(key, v, where, errors);
        if (n !== null) def[key] = n;
        return;
      }
      // Unknown key: pass through so modded weapons can carry extra fields.
      def[key] = v;
    });
    if (!def.look || def.look.length === undefined) {
      errors.push(where + '.look.length is required (weapon silhouettes need it)');
    }
    ['damage', 'fireRate', 'mag'].forEach(k => {
      if (def[k] === undefined) errors.push(where + '.' + k + ' is required');
    });
    return def;
  }

  /** Registers the optional name/desc tables into the i18n pack system. */
  function registerStrings(weapons) {
    if (!BO.I18N || !BO.I18N.extend) return;
    ['en', 'fa'].forEach(lang => {
      const table = {};
      Object.keys(weapons).forEach(id => {
        const w = weapons[id];
        if (w.name && w.name[lang]) table['w.' + id] = String(w.name[lang]);
        if (w.desc && w.desc[lang]) table['wd.' + id] = String(w.desc[lang]);
      });
      if (Object.keys(table).length) BO.I18N.extend(lang, table);
    });
  }
  const CONFIG = {
    data: null, loaded: false, source: null, errors: [], added: [], modified: []
  };

  /** Applies a parsed config object. Safe to call more than once. */
  function apply(cfg) {
    if (!cfg || typeof cfg !== 'object' || !cfg.weapons || typeof cfg.weapons !== 'object') {
      throw new Error('data/weapons.json must be an object with a "weapons" table');
    }
    const errors = [];
    if (!BO.WEAPONS) BO.WEAPONS = {};
    const base = BO.WEAPONS;
    const cleaned = {};
    const added = [];
    const modified = [];

    Object.keys(cfg.weapons).forEach(id => {
      const src = cfg.weapons[id];
      if (!src || typeof src !== 'object') { errors.push('weapons.' + id + ' is not an object'); return; }
      const def = sanitize(src, id, errors);
      def.id = id;
      // sanitize() skips the string tables; carry them for i18n registration.
      if (src.name) def.name = src.name;
      if (src.desc) def.desc = src.desc;
      const had = !!base[id];
      const merged = had ? Object.assign({}, base[id], def) : def;
      const changed = had && Object.keys(def).some(k => JSON.stringify(def[k]) !== JSON.stringify(base[id][k]));
      base[id] = merged;
      cleaned[id] = merged;
      if (!had) added.push(id);
      else if (changed) modified.push(id);
    });

    // Rebuild the loadout order: explicit `order` first, then anything left over.
    const explicit = Array.isArray(cfg.order) ? cfg.order : [];
    const order = [];
    explicit.forEach(id => { if (BO.WEAPONS[id] && order.indexOf(id) < 0) order.push(id); });
    (BO.WEAPON_ORDER || []).forEach(id => { if (BO.WEAPONS[id] && order.indexOf(id) < 0) order.push(id); });
    Object.keys(BO.WEAPONS).forEach(id => { if (order.indexOf(id) < 0) order.push(id); });

    // Mutate the existing array in place: other modules captured a reference.
    if (!Array.isArray(BO.WEAPON_ORDER)) BO.WEAPON_ORDER = [];
    BO.WEAPON_ORDER.length = 0;
    order.forEach(id => BO.WEAPON_ORDER.push(id));

    if (cfg.upgradeFactors) {
      const f = {};
      Object.keys(cfg.upgradeFactors).forEach(k => {
        const v = Number(cfg.upgradeFactors[k]);
        if (isFinite(v) && v >= 0 && v <= 1) f[k] = v;
        else errors.push('upgradeFactors.' + k + ' must be a number between 0 and 1');
      });
      if (Object.keys(f).length) BO.WEAPON_UPGRADE_FACTORS = f;
    }

    registerStrings(cleaned);
    CONFIG.data = cfg;
    CONFIG.loaded = true;
    CONFIG.errors = errors;
    CONFIG.added = added;
    CONFIG.modified = modified;
    errors.forEach(e => console.warn('[weapon-config] ' + e));
    if (added.length) console.log('[weapon-config] added from JSON: ' + added.join(', '));
    if (modified.length) console.log('[weapon-config] tuned from JSON: ' + modified.join(', '));
    return CONFIG;
  }

  /** Fetches data/weapons.json; falls back to the generated JS copy on file://. */
  async function load(url) {
    const path = url || 'data/weapons.json';
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      apply(await res.json());
      CONFIG.source = path;
      return CONFIG;
    } catch (err) {
      if (window.BO_WEPONS_DATA) {
        apply(window.BO_WEPONS_DATA);
        CONFIG.source = 'data/weapons.data.js (generated mirror)';
        warnFileMode(err);
        return CONFIG;
      }
      console.warn('[weapon-config] could not load ' + path + ' (' + err.message +
        '); using built-in weapon stats.');
      return CONFIG;
    }
  }

  /**
   * file:// blocks fetch(), so the game falls back to data/weapons.data.js - a
   * generated mirror of data/weapons.json. That mirror only updates when you
   * run "npm run weapons:extract", which is a trap: the game looks fine and the
   * JSON edits simply never apply. Say so loudly.
   */
  function warnFileMode(err) {
    const proto = (typeof location !== 'undefined' && location && location.protocol) || '';
    if (proto && proto !== 'file:') return;
    CONFIG.fileMode = true;
    console.warn('[weapon-config] ' +
      'Opened over file://, so data/weapons.json could not be read (' + (err && err.message) + ').\n' +
      '  Falling back to data/weapons.data.js, a generated mirror of the JSON.\n' +
      '  Any edit you make to data/weapons.json is IGNORED in this mode.\n' +
      '  Run "npm start" and open http://localhost:8080, or "npm run desktop",\n' +
      '  to load the JSON directly.');
  }

  BO.WeaponConfig = {
    CONFIG: CONFIG, load: load, apply: apply,
    /** Promise resolved once the JSON has been applied (or failed). */
    ready: load(),
    /** Re-reads the JSON without a full page reload. */
    reload: load
  };
})(window.BO);