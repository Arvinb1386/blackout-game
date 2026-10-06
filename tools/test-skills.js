'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function pass(msg, extra) {
  passed++;
  console.log(`PASS  ${msg}` + (extra !== undefined ? `  -> ${extra}` : ''));
}
function fail(msg, err) {
  console.error(`FAIL  ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

const root = path.resolve(__dirname, '..');

// 1. Verify file content of v9-skills.js
try {
  const content = fs.readFileSync(path.join(root, 'js', 'v9-skills.js'), 'utf8');

  // Verify old skills are completely gone
  const oldSkills = ['brute', 'overcharge', 'executioner', 'blast', 'cloak', 'sonar', 'drone', 'overclock', 'barrier'];
  for (const sk of oldSkills) {
    assert(!content.includes(`'${sk}'`), `Old skill '${sk}' still present in v9-skills.js`);
  }
  pass('skills: old skill tree completely removed');

  // Verify Slow Motion parameters
  assert(content.includes('MAX_LEVEL = 10'), 'Missing MAX_LEVEL = 10');
  assert(content.includes('worldSpeed: 0.50'), 'Missing worldSpeed 0.50');
  assert(content.includes('playerSpeed: 0.80'), 'Missing playerSpeed 0.80');
  assert(content.includes("wasPressed('KeyC')"), 'Missing KeyC activation check');
  assert(content.includes('origGameUpdate.call(this, realDt * 0.5)'), 'Missing 0.5x world speed scaling in G._update');
  assert(content.includes('stats.playerSpeed / 0.5'), 'Missing player dt speed scaling in P.update');
  pass('skills: Slow Motion skill parameters (Key C, world 0.5x, player 0.8x, 10 levels) verified');

  // Verify UI and HUD
  assert(content.includes('renderHUD'), 'Missing renderHUD implementation');
  assert(content.includes('skill-card-hero'), 'Missing hero card HTML');
  assert(content.includes('skill-gauge'), 'Missing 10-level gauge HTML');
  assert(content.includes('data-action="v9upgrade"'), 'Missing v9upgrade action');
  assert(content.includes('data-action="v9respec"'), 'Missing v9respec action');
  pass('skills: UI and in-game HUD widgets implemented');
} catch (e) {
  fail('v9-skills.js content verification failed', e);
}

// 2. Behavioral test using mock window.BO environment
try {
  global.window = {};
  global.window.BO = global.BO = {
    U: {
      clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
      isFiniteNumber: (v) => typeof v === 'number' && Number.isFinite(v)
    },
    I18N: {
      extend: (lang, obj) => {
        global.BO.I18N._dict = global.BO.I18N._dict || {};
        global.BO.I18N._dict[lang] = Object.assign(global.BO.I18N._dict[lang] || {}, obj);
      },
      font: (size, weight, role) => `${weight} ${size}px sans-serif`,
      isRTL: () => false,
      num: (v) => String(v)
    },
    t: (key, params) => {
      let str = (global.BO.I18N._dict?.en && global.BO.I18N._dict.en[key]) || key;
      if (params) {
        for (const k in params) str = str.replace(`{${k}}`, params[k]);
      }
      return str;
    },
    SaveSystem: {
      data: {
        level: 1,
        credits: 1000,
        upgrades: {},
        skills: { slowmo: 1, spentPoints: 0 }
      },
      save: () => {}
    },
    CONFIG: {
      STAMINA_DRAIN: 25,
      STAMINA_REGEN: 20
    },
    UpgradeSystem: {
      list: [],
      xpForLevel: (l) => 200 * l
    },
    Game: {
      STATE: { PLAYING: 1, MENU: 0, DEAD: 2 },
      prototype: {
        _update: function(dt) { this._updatedDt = dt; },
        startMission: function() { return true; },
        onEnemyKilled: function() { return true; },
        addCredits: function(n) { return n; }
      }
    },
    Player: {
      prototype: {
        update: function(dt) { this._playerDt = dt; },
        _updateMovement: function() {},
        _startDodge: function() {}
      }
    },
    UIManager: {
      prototype: {
        renderHUD: function() {},
        notify: function(msg, color, time) { this._lastNotify = msg; }
      }
    },
    ProjectileSystem: {
      prototype: {
        spawn: function(x) { return x; },
        _step: function(p, dt) { p._steppedDt = dt; }
      }
    }
  };

  // Run v9-skills.js in this mock environment
  const scriptCode = fs.readFileSync(path.join(root, 'js', 'v9-skills.js'), 'utf8');
  eval(scriptCode);

  const Skills = global.BO.Skills;
  assert(Skills, 'BO.Skills must be exported');
  assert.strictEqual(Skills.MAX_LEVEL, 10, 'MAX_LEVEL must be 10');

  // Verify all 10 levels
  for (let i = 1; i <= 10; i++) {
    const st = Skills.getStats(i);
    assert.strictEqual(st.level, i);
    assert.strictEqual(st.worldSpeed, 0.50);
    assert(st.playerSpeed >= 0.80 && st.playerSpeed <= 0.85);
    assert(st.duration >= 2.5 && st.duration <= 5.0);
    assert(st.cooldown >= 9.0 && st.cooldown <= 18.0);
  }
  // Level 10 must cost exactly 25,000 credits
  assert.strictEqual(Skills.getStats(10).costCredits, 25000, 'Level 10 cost must be 25,000 credits');
  pass('skills: all 10 levels correctly configured and balanced, level 10 cost = 25,000 credits');

  // Test progression & upgrade logic (requires BOTH point and credits)
  const save = global.BO.SaveSystem.data;
  save.level = 1;
  save.skills = { slowmo: 1, spentPoints: 0 };
  save.credits = 1000; // Has credits for level 2, but level 1 gives 0 skill points

  assert.strictEqual(Skills.points(save), 0);
  assert.strictEqual(Skills.canUpgrade(save), false, 'Cannot upgrade without skill point');

  // Player levels up to 2 (has 1 point), but lacks credits
  save.level = 2;
  save.credits = 500; // Level 2 costs 1,000
  assert.strictEqual(Skills.points(save), 1);
  assert.strictEqual(Skills.canUpgrade(save), false, 'Cannot upgrade without sufficient credits');

  // Now player has both 1 point and 1,000 credits
  save.credits = 1000;
  assert.strictEqual(Skills.canUpgrade(save), true, 'Can upgrade with both point and credits');

  // Upgrade to level 2
  const upOk = Skills.upgrade(save);
  assert.strictEqual(upOk, true);
  assert.strictEqual(save.skills.slowmo, 2);
  assert.strictEqual(save.skills.spentPoints, 1);
  assert.strictEqual(save.credits, 0); // 1000 credits deducted
  assert.strictEqual(Skills.points(save), 0); // Point consumed

  // Player levels up to 3 and earns 2,000 credits for level 3
  save.level = 3;
  save.credits = 2000;
  assert.strictEqual(Skills.canUpgrade(save), true);
  Skills.upgrade(save);
  assert.strictEqual(save.skills.slowmo, 3);
  assert.strictEqual(save.credits, 0);

  // Test Respec
  Skills.respec(save);
  assert.strictEqual(save.skills.slowmo, 1);
  assert.strictEqual(save.skills.spentPoints, 0);
  assert.strictEqual(Skills.points(save), 2); // 2 points refunded!
  pass('skills: point & credit economy (both required, 25k max) with respec verified');

  // Test in-game Slow-Mo activation & time dilation
  const mockGame = {
    state: global.BO.Game.STATE.PLAYING,
    player: { dead: false, x: 0, y: 0 },
    ui: { notify: (m) => {} },
    audio: { ctx: null, volumes: {} }
  };

  Skills.state.active = false;
  Skills.state.cooldownTimer = 0;

  // Trigger skill
  const trigOk = Skills.trigger(mockGame);
  assert.strictEqual(trigOk, true);
  assert.strictEqual(Skills.isActive(mockGame), true);
  assert.strictEqual(Skills.state.active, true);

  // Verify G._update scales world to 0.5x
  const realDt = 0.016;
  global.BO.Game.prototype._update.call(mockGame, realDt);
  assert.strictEqual(mockGame._updatedDt, realDt * 0.5);

  // Verify P.update scales player to ~0.8x
  const dtWorld = realDt * 0.5;
  const mockPlayer = {};
  global.BO.Player.prototype.update.call(mockPlayer, dtWorld, null, mockGame);
  // dtWorld * (0.80 / 0.5) = realDt * 0.80 = 0.0128
  assert.strictEqual(Math.round(mockPlayer._playerDt * 10000), Math.round(realDt * 0.80 * 10000));

  // Verify ProjectileSystem scales player bullet to 0.8x and enemy bullet to 0.5x
  const playerBullet = { owner: 0 };
  const enemyBullet = { owner: 1 };
  global.BO.ProjectileSystem.prototype._step.call({}, playerBullet, dtWorld, mockGame);
  global.BO.ProjectileSystem.prototype._step.call({}, enemyBullet, dtWorld, mockGame);

  assert.strictEqual(Math.round(playerBullet._steppedDt * 10000), Math.round(realDt * 0.80 * 10000));
  assert.strictEqual(enemyBullet._steppedDt, dtWorld); // 0.5x

  // Advance time beyond duration to trigger deactivation
  Skills.update(mockGame, 5.0);
  assert.strictEqual(Skills.state.active, false);
  assert(Skills.state.cooldownTimer > 0);

  // Verify triggering during cooldown fails
  const reTrig = Skills.trigger(mockGame);
  assert.strictEqual(reTrig, false);

  pass('skills: active engine time dilation (0.5x world, 0.8x player) & projectile simulation verified');

} catch (e) {
  fail('Behavioral test failed', e);
}

console.log(`\nAll ${passed} skills tests passed successfully.`);
process.exit(0);
