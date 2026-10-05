/* =========================================================================
 * BLACKOUT :: tools/extract-weapons.js
 * Node helper: reads the live weapon definitions out of js/*.js inside a
 * sandboxed VM (no DOM required) and writes data/weapons.json.
 *
 *   node tools/extract-weapons.js          # regenerate data/weapons.json
 *   node tools/extract-weapons.js --js     # also regenerate data/weapons.data.js
 *
 * data/weapons.json is the editable source of truth; js/weapon-config.js
 * applies it at boot.
 * ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCES = [
  'js/utils.js', 'js/i18n.js', 'js/i18n-extra.js',
  'js/weapons.js', 'js/arsenal.js', 'js/v4-arsenal.js', 'js/v7-arsenal.js'
];

const BO = {
  U: {
    TAU: Math.PI * 2,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    pick: arr => arr[0],
    chance: () => false,
    rand: () => 0,
    randSpread: () => 0,
    safe: (k, f) => { try { return f(); } catch (_) { return undefined; } }
  },
  I18N: { extend: () => {} },
  AUDIO_GUN_FALLBACK: {}
};

const sandbox = {
  window: { BO },
  BO,
  Math, JSON, Object, Array, String, Number, Boolean, Error, Promise,
  console: { log: () => {}, warn: () => {}, error: () => {} },
  setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const rel of SOURCES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
}

/* ------------------------- localised names --------------------------- */
// i18n.js exposes t() with a documented fallback chain, so ask it in both
// languages. Persian digit conversion would mangle values like "M9", so read
// the raw tables through the same lookup with digits disabled.
function lookup(key, lang) {
  const I18N = BO.I18N;
  if (!I18N || typeof I18N.t !== 'function') return null;
  const prevLang = I18N.lang;
  const prevDigits = I18N.digits;
  I18N.digits = v => v;
  I18N.lang = lang;
  let out;
  try { out = I18N.t(key); } catch (_) { out = null; }
  I18N.lang = prevLang;
  I18N.digits = prevDigits;
  return out === key ? null : out;
}

const WEAPONS = BO.WEAPONS;
const ORDER = BO.WEAPON_ORDER.slice();

/* ---------------------------- field metadata ---------------------------- */
const FIELDS = [
  ['slot', 'string', 'primary | secondary - which loadout tab shows the gun'],
  ['price', 'number', 'credits cost to unlock in the loadout screen'],
  ['damage', 'number', 'damage per bullet / per pellet (before upgrades)'],
  ['pellets', 'number', 'projectiles fired per trigger pull'],
  ['fireRate', 'number', 'rounds per second'],
  ['burst', 'number', 'rounds per burst (omit for normal weapons)'],
  ['burstRate', 'number', 'extra rounds per second inside a burst'],
  ['mag', 'number', 'rounds in the magazine'],
  ['reserve', 'number', 'maximum spare rounds carried'],
  ['reload', 'number', 'seconds for a full reload'],
  ['spread', 'radian', 'base cone of fire, lower = more accurate'],
  ['recoil', 'radian', 'bloom added to the cone per shot'],
  ['maxBloom', 'radian', 'hard cap on accumulated bloom'],
  ['recovery', 'perSec', 'how fast bloom decays (radians per second)'],
  ['bulletSpeed', 'px/s', 'projectile travel speed in pixels per second'],
  ['range', 'pixel', 'maximum travel distance in pixels'],
  ['auto', 'bool', 'true = hold to fire, false = one shot per click'],
  ['pierce', 'number', 'extra targets a bullet passes through'],
  ['explosive', 'pixel', 'blast radius on impact'],
  ['shake', 'number', 'camera trauma per shot (0..1)'],
  ['kick', 'pixel', 'player push-back per shot'],
  ['hitStop', 'second', 'global hit-stop freeze on impact'],
  ['knockback', 'force', 'how hard the shot pushes enemies'],
  ['moveMul', 'number', 'movement speed multiplier while equipped'],
  ['sound', 'string', 'audio profile key'],
  ['tracer', 'color', 'bullet trail colour'],
  ['tracerWidth', 'pixel', 'bullet trail thickness'],
  ['lookAhead', 'second', 'how far ahead the muzzle flash is drawn'],
  ['casing', 'bool', 'eject a brass shell'],
  ['bigCasing', 'bool', 'use the large shell sprite'],
  ['grenade', 'bool', 'bullet detonates as a grenade'],
  ['orb', 'bool', 'plasma / orb projectile visuals'],
  ['rail', 'bool', 'draws a continuous rail beam'],
  ['laser', 'bool', 'draws a targeting laser'],
  ['silent', 'bool', 'suppressed, very quiet'],
  ['noise', 'pixel', 'noise radius produced when firing'],
  ['flame', 'bool', 'flame projectile visuals'],
  ['burn', 'second', 'burn duration applied on hit'],
  ['burnDps', 'hp/s', 'damage per second while burning'],
  ['cryo', 'bool', 'freezing projectile visuals'],
  ['chill', 'second', 'slow duration applied on hit'],
  ['chillMul', 'number', 'enemy speed multiplier while chilled'],
  ['arc', 'bool', 'lightning visuals'],
  ['chain', 'number', 'extra hostiles a hit arcs to'],
  ['chainRange', 'pixel', 'search radius for chained targets'],
  ['chainFalloff', 'number', 'damage multiplier for each chained jump'],
  ['homing', 'number', 'turn rate that steers the round toward enemies'],
  ['homingRange', 'pixel', 'acquisition radius for homing rounds'],
  ['cluster', 'number', 'bomblets spawned by a cluster shell'],
  ['clusterRadius', 'pixel', 'spawn radius of the bomblets'],
  ['clusterDamage', 'number', 'damage of each bomblet']
];

const LOOK_FIELDS = [
  ['length', 'pixel', 'silhouette length in pixels'],
  ['width', 'pixel', 'silhouette thickness in pixels'],
  ['color', 'color', 'silhouette body colour'],
  ['glow', 'color', 'adds a glowing strip along the body'],
  ['scope', 'bool', 'draws a scope'],
  ['drum', 'bool', 'draws a drum magazine'],
  ['barrels', 'number', 'number of drawn barrels'],
  ['suppressor', 'bool', 'draws a suppressor'],
  ['bow', 'bool', 'drawn as a bow instead of a gun']
];

/* BUILD_MARKS */
const weapons = {};
const order = [];
const seen = new Set();
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

ORDER.forEach(id => { if (WEAPONS[id] && !seen.has(id)) { seen.add(id); order.push(id); } });
Object.keys(WEAPONS).forEach(id => { if (!seen.has(id)) { seen.add(id); order.push(id); } });

for (const id of order) {
  const src = WEAPONS[id];
  const def = { id };
  FIELDS.forEach(([key]) => { if (has(src, key)) def[key] = src[key]; });
  if (src.look) {
    const look = {};
    LOOK_FIELDS.forEach(([key]) => { if (has(src.look, key)) look[key] = src.look[key]; });
    def.look = look;
  }
  const name = { en: lookup('w.' + id, 'en'), fa: lookup('w.' + id, 'fa') };
  const desc = { en: lookup('wd.' + id, 'en'), fa: lookup('wd.' + id, 'fa') };
  if (name.en || name.fa) def.name = Object.keys(name).reduce((a, k) => (name[k] ? (a[k] = name[k], a) : a), {});
  if (desc.en || desc.fa) def.desc = Object.keys(desc).reduce((a, k) => (desc[k] ? (a[k] = desc[k], a) : a), {});
  weapons[id] = def;
}

const meta = {
  version: 1,
  order,
  upgradeFactors: { damage: 0.08, accuracy: 0.1, magazine: 0.1, reload: 0.08 },
  fieldDocs: FIELDS.map(([key, type, description]) => ({ key, type, description })),
  lookFieldDocs: LOOK_FIELDS.map(([key, type, description]) => ({ key, type, description })),
  weapons
};

/* Mirror mode: without --js the existing data/weapons.json is read back and
 * only weapons.data.js is refreshed, so hand edits are never overwritten. */
const REBUILD_JSON = process.argv.includes('--js');
if (REBUILD_JSON) {
  const jsonPath = path.join(ROOT, 'data', 'weapons.json');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  console.log('Wrote ' + path.relative(ROOT, jsonPath) + ' (' + order.length + ' weapons)');
}

const jsonPath = path.join(ROOT, 'data', 'weapons.json');
const mirror = REBUILD_JSON ? meta : JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const stamp = fs.statSync(jsonPath).mtimeMs;

// Stamped so weapon-config.js can tell, on file://, that the mirror is older
// than the JSON the user just edited.
fs.writeFileSync(path.join(ROOT, 'data', 'weapons.data.js'),
  '/* AUTO-GENERATED from data/weapons.json by tools/extract-weapons.js\n' +
  ' * Do not edit by hand: it exists so the game still loads over file:// where\n' +
  ' * fetch() of a local JSON is blocked. Edit data/weapons.json instead, then run\n' +
  ' * "npm run weapons:extract" to refresh this mirror. */\n' +
  "'use strict';\nwindow.BO_WEPONS_MTIME = " + stamp + ';\n' +
  'window.BO_WEPONS_DATA = ' + JSON.stringify(mirror) + ';\n', 'utf8');
console.log('Wrote data/weapons.data.js (mirror of ' + order.length + ' weapons)');