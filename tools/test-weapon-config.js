'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const { startServer, server } = require(path.join(ROOT, 'server.js'));

/** Minimal DOM so the loadout weapon panel can be rendered headless. */
function makeDom() {
  const mk = tag => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(), children: [], style: {}, dataset: {},
      _text: '', _html: '', _cls: '', disabled: false, hidden: false, id: '',
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter(x => x !== c); },
      set className(v) { this._cls = String(v); this.classList._s = new Set(this._cls.split(/\s+/).filter(Boolean)); },
      get className() { return this._cls; },
    set innerHTML(v) {
      this._html = v;
      // Parse the handful of shapes ui.js injects so children() reflects reality.
      // Build a real tree so nested markup (e.g. <span class="s-bar"><i></i></span>)
      // is reachable by the recursive querySelector below.
      this.children = [];
      const re = /<(\/?)(\w+)\b([^>]*)>/g;
      const stack = [this];
      let m;
      while ((m = re.exec(v))) {
        const [, closing, tag, attrs] = m;
        if (closing) { if (stack.length > 1) stack.pop(); continue; }
        const child = mk(tag);
        const cm = /\bclass="([^"]*)"/.exec(attrs);
        if (cm) child.className = cm[1];
        const idm = /\bid="([^"]*)"/.exec(attrs);
        if (idm) child.id = idm[1];
        stack[stack.length - 1].children.push(child);
        if (!/\/>$/.test(m[0]) && !/^<(input|br|img)/i.test(tag) && v[m.index + m[0].length] !== undefined) stack.push(child);
      }
    },
    get innerHTML() { return this._html; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    // ui.js injects markup with innerHTML and then looks children back up with
    // $('i', row) / $('.s-label', row), so search the tree recursively.
    querySelector(sel) {
      const match = el => {
        if (sel === 'i') return el.tagName === 'I';
        if (sel[0] === '.') return el.classList.contains(sel.slice(1));
        if (sel[0] === '#') return el.id === sel.slice(1);
        return el.tagName === sel.toUpperCase();
      };
      const walk = el => {
        for (const c of el.children) { if (match(c)) return c; const hit = walk(c); if (hit) return hit; }
        return null;
      };
      return walk(this);
    },
    querySelectorAll() { return []; },
    getContext() { return { clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {}, measureText() { return { width: 0 }; } }; },
    addEventListener() {}, removeEventListener() {}, focus() {},
    getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0 }; }
  };
  return el;
};
  const els = {};
  ['wd-canvas', 'wd-name', 'wd-desc', 'wd-stats', 'wd-extras', 'wd-action', 'weapon-list',
    'loadout-credits', 'loadout-mission', 'loadout-deploy'].forEach(id => {
      els['#' + id] = mk(id === 'wd-canvas' ? 'canvas' : (id === 'wd-action' ? 'button' : 'div'));
    });
  const document = {
    documentElement: { lang: 'en', dir: 'ltr', style: {} },
    body: { classList: { add() {}, remove() {} }, appendChild() {} },
    fonts: null,
    getElementById: id => els['#' + id] || null,
    querySelector: sel => els[sel] || null,
    querySelectorAll: () => [],
    createElement: tag => mk(tag),
    addEventListener() {}, removeEventListener() {}
  };
  return { document, els };
}

/** Flattens a rendered .xstat row list into "key=value" strings. */
function readExtras(el) {
  return el.children.map(c => c.children[0].textContent + '=' + c.children[1].textContent);
}

function boot(mode) {
  const BO = {
    U: { TAU: Math.PI * 2, clamp: (v, a, b) => (v < a ? a : v > b ? b : v), pick: a => a[0], chance: () => false, rand: () => 0, randSpread: () => 0, safe: (k, f) => { try { return f(); } catch (e) {} } },
    I18N: { extend: () => {} }
  };
  const sb = { window: { BO }, BO, Math, JSON, Object, Array, String, Number, Boolean, Error, Promise, console: { log() {}, warn() {} }, setTimeout, clearTimeout };
  if (mode && mode.fetch) sb.fetch = mode.fetch;
  if (mode && mode.dom) {
    // Both the bare global (ui.js) and window.document must see the same DOM.
    sb.document = mode.dom;
    sb.window.document = mode.dom;
  }
  sb.globalThis = sb; vm.createContext(sb);
  // Same load order as index.html: i18n first, then the arsenal packs, so
  // extend() exists and the real string tables are exercised.
  ['js/utils.js', 'js/i18n.js', 'js/i18n-extra.js', 'js/weapons.js', 'js/arsenal.js', 'js/v4-arsenal.js', 'js/v7-arsenal.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));
  if (mode === 'generated') {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/weapons.data.js'), 'utf8'), sb, { filename: 'data/weapons.data.js' });
  }
  if (mode && mode.dom) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8'), sb, { filename: 'js/ui.js' });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/weapon-config.js'), 'utf8'), sb, { filename: 'js/weapon-config.js' });
  return BO;
}

function assert(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  -> ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

/* 1. defaults, no JSON at all */
let BO = boot('none');
assert('no-JSON: 30 built-in weapons', Object.keys(BO.WEAPONS).length === 30, Object.keys(BO.WEAPONS).length);
assert('no-JSON: order intact', BO.WEAPON_ORDER.length === 30, BO.WEAPON_ORDER.length);
assert('no-JSON: pistol.damage = 40', BO.WEAPONS.pistol.damage === 40, BO.WEAPONS.pistol.damage);
assert('no-JSON: railgun.pierce = 5', BO.WEAPONS.railgun.pierce === 5);
assert('no-JSON: upgrade factors default 8%',
  Math.abs(BO.Weapons.computeStats(BO.WEAPONS.ar, { damage: 5 }).damage - 25 * 1.4) < 1e-9,
  BO.Weapons.computeStats(BO.WEAPONS.ar, { damage: 5 }).damage);

/* 2. generated copy applied */
BO = boot('generated');
assert('generated: pistol.damage = 40', BO.WEAPONS.pistol.damage === 40, BO.WEAPONS.pistol.damage);
assert('generated: source is the generated copy', /weapons\.data\.js/.test(BO.WeaponConfig.CONFIG.source), BO.WeaponConfig.CONFIG.source);
assert('generated: no validation errors', BO.WeaponConfig.CONFIG.errors.length === 0, BO.WeaponConfig.CONFIG.errors.join(' | '));
assert('generated: 30 weapons', Object.keys(BO.WEAPONS).length === 30);

/* 3. live edits from JSON */
BO = boot('none');
const edited = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/weapons.json'), 'utf8'));
assert('json: all 30 guns carry a name', Object.keys(edited.weapons).every(id => edited.weapons[id].name && edited.weapons[id].name.en),
  Object.keys(edited.weapons).filter(id => !(edited.weapons[id].name || {}).en).join(','));
assert('json: names keep latin digits (M9)', edited.weapons.pistol.name.en === 'M9 SIDEARM', edited.weapons.pistol.name.en);
edited.weapons.pistol.damage = 999;
edited.order = ['ar', 'pistol'];
edited.upgradeFactors = { damage: 0.2, accuracy: 0.1, magazine: 0.1, reload: 0.08 };
edited.weapons.testcannon = {
  id: 'testcannon', slot: 'primary', price: 5000, damage: 200, pellets: 4, fireRate: 5,
  mag: 25, reserve: 200, reload: 2, spread: 0.05, recoil: 0.02, maxBloom: 0.1, recovery: 0.4,
  bulletSpeed: 2000, range: 1200, auto: true, shake: 0.3, kick: 8, hitStop: 0.02,
  knockback: 100, moveMul: 0.95, sound: 'rifle', tracer: '#00ff00', tracerWidth: 3,
  casing: true, lookAhead: 0.2, look: { length: 28, width: 7, color: '#00ff00' },
  name: { en: 'TEST CANNON', fa: 'توپ تست' }, desc: { en: 'From JSON.', fa: 'از جیسون.' }
};
edited.weapons.shotgun.fireRate = 'oops';
edited.weapons.lmg.mag = -50;
BO.WeaponConfig.apply(edited);

assert('edit: pistol.damage = 999', BO.WEAPONS.pistol.damage === 999, BO.WEAPONS.pistol.damage);
assert('edit: untouched pistol.mag stays 12', BO.WEAPONS.pistol.mag === 12, BO.WEAPONS.pistol.mag);
assert('edit: untouched pistol.tracer stays', BO.WEAPONS.pistol.tracer === '#ffd9a0', BO.WEAPONS.pistol.tracer);
assert('edit: custom order honoured', BO.WEAPON_ORDER[0] === 'ar' && BO.WEAPON_ORDER[1] === 'pistol', BO.WEAPON_ORDER.slice(0, 3).join(','));
assert('edit: rest of order preserved', BO.WEAPON_ORDER.length === 31, BO.WEAPON_ORDER.length);
assert('edit: new weapon added', !!BO.WEAPONS.testcannon && BO.WEAPONS.testcannon.damage === 200);
assert('edit: added[] reports it', BO.WeaponConfig.CONFIG.added.indexOf('testcannon') >= 0);
assert('edit: non-numeric rejected, default kept', BO.WEAPONS.shotgun.fireRate === 1.2, BO.WEAPONS.shotgun.fireRate);
assert('edit: negative mag clamped to 1', BO.WEAPONS.lmg.mag === 1, BO.WEAPONS.lmg.mag);
assert('edit: errors surfaced', BO.WeaponConfig.CONFIG.errors.length >= 2, BO.WeaponConfig.CONFIG.errors.join(' | '));
assert('edit: upgradeFactors 20% applied live',
  Math.abs(BO.Weapons.computeStats(BO.WEAPONS.ar, { damage: 5 }).damage - (BO.WEAPONS.ar.damage * 2)) < 1e-9,
  BO.Weapons.computeStats(BO.WEAPONS.ar, { damage: 5 }).damage);
assert('edit: WeaponInstance reads edited stats', new BO.WeaponInstance(BO.WEAPONS.pistol, {}).stats.damage === 999);
assert('edit: displayStats works on edited def', BO.Weapons.displayStats(BO.WEAPONS.pistol, {}).damage > 0);
assert('edit: every order id resolvable', BO.WEAPON_ORDER.every(id => !!BO.WEAPONS[id]));

/* 3b. names/descs from JSON reach the UI through the real i18n lookup */
BO.I18N.lang = 'en';   // default boot lang is fa
assert('i18n: JSON name wins for a new gun', BO.t('w.testcannon') === 'TEST CANNON', BO.t('w.testcannon'));
BO.I18N.lang = 'fa';
assert('i18n: Persian name works', BO.t('w.testcannon') === 'توپ تست', BO.t('w.testcannon'));
BO.I18N.lang = 'en';
assert('i18n: description works', BO.t('wd.testcannon') === 'From JSON.', BO.t('wd.testcannon'));
edited.weapons.railgun.name = { en: 'NEEDLE', fa: 'سوزن' };
BO.WeaponConfig.apply(edited);
assert('i18n: renaming a built-in gun works', BO.t('w.railgun') === 'NEEDLE', BO.t('w.railgun'));
edited.weapons.railgun.name = { en: 'LANCE RAILGUN', fa: 'ریل‌گان لنس' };
BO.WeaponConfig.apply(edited);

/* 3c. the loadout panel: headline bars plus the full JSON field dump */
const dom = makeDom();
BO = boot({ dom: dom.document });
BO.I18N.lang = 'en';
const ui = Object.create(BO.UIManager.prototype);
ui.loadoutTab = 'primary';
ui.selectedWeapon = 'rostam';
ui.game = { save: { data: { credits: 0, upgrades: {}, unlockedWeapons: ['rostam'], loadout: { primary: 'rostam', secondary: 'pistol' } } } };

ui._renderWeaponDetail();
const bars = dom.els['#wd-stats'].children.map(r => r.children[0].textContent + ' ' + r.children[2].textContent);
const bonuses = dom.els['#wd-stats'].children.map(r => r.children[3] ? r.children[3].textContent : '');
assert('loadout: 5 headline bars', bars.length === 5, bars.length);
assert('loadout: ROSTAM damage bar shows the JSON value at upgrade 0',
  /DAMAGE 38$/.test(bars[0]), bars[0]);
assert('loadout: no bonus badge without upgrades', bonuses.every(b => b === ''), bonuses.join('|'));

// Same gun with damage upgrades bought: the JSON value stays the headline and
// the upgrade shows as a separate "+n" badge.
ui.game.save.data.upgrades.damage = 4;
ui._renderWeaponDetail();
const barsUp = dom.els['#wd-stats'].children.map(r => r.children[0].textContent + ' ' + r.children[2].textContent);
const bonusUp = dom.els['#wd-stats'].children.map(r => r.children[3] ? r.children[3].textContent : '');
assert('loadout: damage headline stays the JSON value (38)', /DAMAGE 38$/.test(barsUp[0]), barsUp[0]);
assert('loadout: upgrade shows as +12 badge', bonusUp[0] === '+12', bonusUp[0]);
// magazine lvl 4: 80 -> 80*1.4 = 112, delta 32
ui.game.save.data.upgrades.magazine = 4;
ui._renderWeaponDetail();
const bonusMag = dom.els['#wd-stats'].children.map(r => r.children[3] ? r.children[3].textContent : '');
assert('loadout: magazine headline stays 80', /MAGAZINE 80$/.test(
  dom.els['#wd-stats'].children[3].children[0].textContent + ' ' + dom.els['#wd-stats'].children[3].children[2].textContent),
  dom.els['#wd-stats'].children[3].children[2].textContent);
assert('loadout: magazine badge is +32', bonusMag[3] === '+32', bonusMag[3]);
// reload lvl 4: 4.00 -> 4.00*(1-0.32) = 2.72, delta -1.28 => "−1.28"
ui.game.save.data.upgrades.reload = 4;
ui._renderWeaponDetail();
const bonusRel = dom.els['#wd-stats'].children.map(r => r.children[3] ? r.children[3].textContent : '');
assert('loadout: reload badge shows the reduction with a minus', bonusRel[4] === '−1.28', bonusRel[4]);
assert('loadout: reload headline stays 4.00s',
  dom.els['#wd-stats'].children[4].children[2].textContent === '4.00s',
  dom.els['#wd-stats'].children[4].children[2].textContent);
ui.game.save.data.upgrades = {};

// The whole player-facing dump.
const extras = readExtras(dom.els['#wd-extras']);
const has = k => extras.some(e => e.indexOf(k + '=') === 0);
const val = k => { const e = extras.find(x => x.indexOf(k + '=') === 0); return e ? e.slice(k.length + 1) : null; };
// ROSTAM has 5 player-facing extras: reserve, range, pierce, move speed, auto.
assert('extras: player-facing fields rendered', extras.length >= 4, extras.length);
assert('extras: RESERVE=320', val('RESERVE') === '320', val('RESERVE'));
assert('extras: RANGE=1150', val('RANGE') === '1150', val('RANGE'));
assert('extras: PIERCE=1', val('PIERCE') === '1', val('PIERCE'));
assert('extras: MOVE SPEED=0.76', val('MOVE SPEED') === '0.76', val('MOVE SPEED'));
assert('extras: FULL AUTO flag shown', has('FULL AUTO'), extras.filter(e => e.indexOf('FULL AUTO') === 0).join());
assert('extras: single-pellet guns hide PELLETS', !has('PELLETS'), val('PELLETS'));

// Internal tuning numbers must NOT be listed: no player-facing value there.
['SPREAD', 'RECOIL BLOOM', 'MAX BLOOM', 'BLOOM RECOVERY', 'MUZZLE VELOCITY',
  'CAMERA SHAKE', 'KICK', 'HIT STOP', 'KNOCKBACK', 'TRACER', 'TRACER WIDTH',
  'SILHOUETTE', 'COST'].forEach(k => {
  assert('extras: internal field hidden -> ' + k, !has(k), val(k));
});

// A JSON edit must show up in the panel. Re-read the DOM each time: val() is
// bound to a snapshot array, so it must not be reused across renders.
BO.WEAPONS.rostam.reserve = 999;
ui._renderWeaponDetail();
const valNow = k => { const e = readExtras(dom.els['#wd-extras']).find(x => x.indexOf(k + '=') === 0); return e ? e.slice(k.length + 1) : null; };
assert('extras: a JSON edit is reflected immediately', valNow('RESERVE') === '999', valNow('RESERVE'));

// Shotgun-only fields appear where they apply.
ui.selectedWeapon = 'shotgun';
ui._renderWeaponDetail();
const sg = readExtras(dom.els['#wd-extras']);
const sgVal = k => { const e = sg.find(x => x.indexOf(k + '=') === 0); return e ? e.slice(k.length + 1) : null; };
assert('extras: PELLETS shown for a shotgun', sgVal('PELLETS') === '8', sgVal('PELLETS'));
assert('extras: no PIERCE for a gun without it', sgVal('PIERCE') === null, sgVal('PIERCE'));

/* 3d. the detail panel is pinned so it follows the weapon list on scroll */
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const detailRule = /\.weapon-detail\s*\{([^}]*)\}/.exec(css);
assert('css: .weapon-detail exists', !!detailRule);
assert('css: detail panel is sticky', /position:\s*sticky/.test(detailRule[1]), detailRule[1].trim());
assert('css: sticky panel has a max-height', /max-height/.test(detailRule[1]));
assert('css: sticky panel uses align-self:start', /align-self:\s*start/.test(detailRule[1]));
assert('css: sticky disabled on narrow screens', /position:\s*static/.test(css.split('@media (max-width: 860px)')[1] || ''));

/* 3e. file:// mode must warn clearly (no in-game picker: use npm start) */
const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/weapon-config.js'), 'utf8');
assert('config: file:// fallback uses the mirror', /BO_WEPONS_DATA/.test(cfgSrc));
assert('config: file:// mode sets CONFIG.fileMode', /CONFIG\.fileMode\s*=\s*true/.test(cfgSrc));
assert('config: file:// warning points at npm start / desktop',
  /npm start/.test(cfgSrc) && /npm run desktop/.test(cfgSrc));
assert('config: no in-game file picker (removed)', !/input\.type\s*=\s*'file'/.test(cfgSrc) && !/pickFile/.test(cfgSrc));
assert('ui: no load-file action', !/load-weapons-file/.test(fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8')));
assert('ui: no file-mode notice renderer', !/_renderFileModeNotice/.test(fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8')));
assert('html: no load-file button', !fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('wd-loadfile'));

/* 4. removing a weapon from JSON keeps the built-in one */
BO = boot('none');
const shrunk = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/weapons.json'), 'utf8'));
delete shrunk.weapons.sniper;
delete shrunk.order;
BO.WeaponConfig.apply(shrunk);
assert('removal: sniper survives with built-in stats', !!BO.WEAPONS.sniper && BO.WEAPONS.sniper.damage === 150,
  BO.WEAPONS.sniper && BO.WEAPONS.sniper.damage);

/* 5. malformed config must not throw */
try { BO.WeaponConfig.apply(null); assert('bad config throws', false); }
catch (e) { assert('bad config throws a clear error', /weapons/.test(e.message), e.message); }

/* 6. real HTTP fetch against the game's own server (the npm start / Electron path) */
startServer(0, () => {
  const port = server.address().port;
  const realFetch = (p, o) => fetch('http://127.0.0.1:' + port + '/' + String(p).replace(/^\/+/, ''), o);
  BO = boot({ fetch: realFetch });
  BO.WeaponConfig.ready.then(() => {
    const c = BO.WeaponConfig.CONFIG;
    assert('http: CONFIG.loaded is true', c.loaded === true);
    assert('http: fetched data/weapons.json', c.source === 'data/weapons.json', c.source);
    assert('http: no errors', c.errors.length === 0, c.errors.join(' | '));
    assert('http: 30 weapons applied', Object.keys(BO.WEAPONS).length === 30);
    assert('http: values match the file', BO.WEAPONS.sniper.damage === 150 && BO.WEAPONS.minigun.fireRate === 22,
      BO.WEAPONS.sniper.damage + '/' + BO.WEAPONS.minigun.fireRate);
    assert('http: order matches the file', BO.WEAPON_ORDER[0] === 'pistol' && BO.WEAPON_ORDER.length === 30);

    /* 7. a live edit on disk is picked up by reload() without a page refresh */
    const jsonPath = path.join(ROOT, 'data', 'weapons.json');
    const original = fs.readFileSync(jsonPath, 'utf8');
    const patch = JSON.parse(original);
    patch.weapons.railgun.damage = 777;
    fs.writeFileSync(jsonPath, JSON.stringify(patch, null, 2));
    BO.WeaponConfig.reload('data/weapons.json').then(() => {
      assert('reload: railgun.damage = 777', BO.WEAPONS.railgun.damage === 777, BO.WEAPONS.railgun.damage);
      fs.writeFileSync(jsonPath, original);
      return BO.WeaponConfig.reload('data/weapons.json');
    }).then(() => {
      assert('reload: file restored -> damage 210', BO.WEAPONS.railgun.damage === 210, BO.WEAPONS.railgun.damage);
      console.log('\nDone. exitCode=' + (process.exitCode || 0));
      server.close();
      process.exit(process.exitCode || 0);
    });
  });
});