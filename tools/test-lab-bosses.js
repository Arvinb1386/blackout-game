'use strict';
/* =========================================================================
 * BLACKOUT :: tools/test-lab-bosses.js
 * Guards the boss-lab wiring: js/lab-bosses.js must be loaded by
 * boss-lab.html, in the right order, and the lab must actually build the
 * variant boss instead of always falling back to the classic cog.
 * ========================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function assert(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  -> ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

/* 1. boss-lab.html loads the pack, after v12 and before profiles */
const html = fs.readFileSync(path.join(ROOT, 'boss-lab.html'), 'utf8');
const order = [...html.matchAll(/src="js\/([^"]+)"/g)].map(m => m[1]);
const iLab = order.indexOf('lab-bosses.js');
const iV12 = order.indexOf('v12-enhanced-bosses.js');
const iBoss = order.indexOf('boss.js');
assert('html: lab-bosses.js is loaded', iLab >= 0, 'index ' + iLab);
assert('html: loaded after boss.js (BO.Boss exists)', iLab > iBoss, 'boss=' + iBoss + ' lab=' + iLab);
assert('html: loaded after v12-enhanced-bosses.js', iLab > iV12, 'v12=' + iV12 + ' lab=' + iLab);

/* 2. the lab builds the variant boss rather than only the classic one */
assert('lab: uses BO.LabBosses.create()', /LB\.create\(prefs\.variant/.test(html));
assert('lab: keeps a classic fallback branch', /prefs\.variant === 'classic'/.test(html) && /new BO\.BossBase/.test(html));
assert('lab: replaces the boss the level spawned',
  /g\.enemies\.splice/.test(html) && /g\.boss = made/.test(html));
assert('lab: pushes the new boss into the enemy list', /g\.enemies\.push\(g\.boss\)/.test(html));
assert('lab: wires the freeze/dummy flags the pack reads',
  /LB\.flags\.freezeBoss/.test(html) && /LB\.flags\.dummy/.test(html));
assert('lab: guards against a missing pack', /if \(LB && prefs\.variant/.test(html));

/* 3. the pack itself registers a complete roster */
const BO = {
  U: {
    TAU: Math.PI * 2, clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    dist: (a, b, c, d) => Math.hypot(c - a, d - b), rgba: () => 'rgba(0,0,0,0)',
    makeRng: () => () => 0.5, randSpread: () => 0, chance: () => false,
    turnTowards: (a, b) => b, safe: (k, f) => { try { return f(); } catch (e) { return undefined; } }
  },
  CONFIG: { TILE: 48 },
  I18N: { extend: () => {} },
  Collision: { raycast: () => ({ x: 0, y: 0 }), moveCircle: () => {}, lineOfSight: () => true, makeHit: () => ({}) },
  Boss: function () {}
};
function Boss() {}
BO.Boss = Boss;
const sb = {
  window: { BO }, BO, Math, JSON, Object, Array, String, Number, Boolean, Error, Promise,
  console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout
};
sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/lab-bosses.js'), 'utf8'), sb, { filename: 'js/lab-bosses.js' });

const LB = BO.LabBosses;
assert('pack: BO.LabBosses exported', !!LB);
assert('pack: exposes create()', typeof LB.create === 'function');
assert('pack: exposes the roster', !!LB.ROSTER && typeof LB.describe === 'function');

const keys = Object.keys(LB.ROSTER || {});
assert('pack: roster has 10 variants', keys.length === 10, keys.length);
const looks = keys.map(k => LB.ROSTER[k].look);
assert('pack: every variant has its own body (look)',
  new Set(looks).size === looks.length, looks.join(','));
assert('pack: tiers run 1..10',
  keys.map(k => LB.ROSTER[k].tier).sort((a, b) => a - b).join(',') === '1,2,3,4,5,6,7,8,9,10');
assert('pack: unknown key returns null', LB.create('nope', 0, 0, null) === null);
assert('pack: describe() reports a tier and palette',
  LB.describe('m24') && LB.describe('m24').tier === 10, JSON.stringify(LB.describe('m24') && LB.describe('m24').title));

/* 4. every VARIANTS entry in the lab has a matching roster key */
const variantBlock = /const VARIANTS = \[([\s\S]*?)\];/.exec(html);
assert('lab: VARIANTS list found', !!variantBlock);
const labKeys = [...variantBlock[1].matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
const missing = labKeys.filter(k => k !== 'classic' && !LB.ROSTER[k]);
assert('lab: every VARIANTS key exists in the roster', missing.length === 0, missing.join(',') || 'none');
assert('lab: 11 options (10 variants + classic)', labKeys.length === 11, labKeys.length);

console.log('\nDone. exitCode=' + (process.exitCode || 0));