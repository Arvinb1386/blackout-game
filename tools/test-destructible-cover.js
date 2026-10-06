/**
 * Verification test for destructible cover blocks
 */
const fs = require('fs');
const path = require('path');

// Mock browser globals
global.window = global;
global.document = {
  createElement: () => ({
    getContext: () => ({
      fillRect: () => {},
      beginPath: () => {},
      rect: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} })
    }),
    style: {}
  })
};

const BO = {
  CONFIG: { TILE: 64 },
  U: {
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    dist2: (x1, y1, x2, y2) => (x2 - x1)**2 + (y2 - y1)**2,
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (min, max) => min + Math.random() * (max - min),
    chance: (p) => Math.random() < p,
    makeRng: () => () => Math.random(),
    TAU: Math.PI * 2,
    safe: (tag, fn) => { try { return fn(); } catch(e) {} }
  },
  TILE_TYPE: { SOLID: 0, FLOOR: 1, DOOR: 2 },
  PROJECTILE_OWNER: { PLAYER: 0, ENEMY: 1 },
  PROJECTILE_KIND: { BULLET: 0, GRENADE: 1 }
};
global.BO = BO;

// Load collision, level
require('../js/collision.js');
require('../js/level.js');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
  console.log('PASS: ' + msg);
}

// 1. Check PROP_DEFS in LevelManager
const pillar = BO.LevelManager.makeProp('pillar', 5, 5);
assert(pillar.destructible === true, 'pillar is destructible');
assert(pillar.hp === 220, 'pillar hp is 220');

const barrier = BO.LevelManager.makeProp('barrier', 6, 6);
assert(barrier.destructible === true, 'barrier is destructible');
assert(barrier.hp === 140, 'barrier hp is 140');

// 2. Test TileMap & collision blocking
const map = new BO.TileMap(20, 20);
for (let y = 0; y < 20; y++) {
  for (let x = 0; x < 20; x++) {
    map.tiles[map.idx(x, y)] = BO.TILE_TYPE.FLOOR;
  }
}

// Place cover pillar on floor
map.props[map.idx(5, 5)] = pillar;
assert(map.blocks(5, 5, 0) === true, 'alive pillar blocks movement');
assert(map.blocks(5, 5, 1) === true, 'alive pillar blocks bullets');
assert(map.blocks(5, 5, 2) === true, 'tall alive pillar blocks sight');

// Raycast before destruction
const ray1 = BO.Collision.raycast(map, 1 * 64, 5.5 * 64, 10 * 64, 5.5 * 64, 1);
assert(ray1.hit === true, 'bullet ray hits the pillar');
assert(ray1.prop === pillar, 'hit.prop is the pillar');

// 3. Mock Game damage & destroyProp logic
const game = {
  map,
  level: { theme: { floor: '#111' }, props: [pillar] },
  renderer: {
    staticLayer: { getContext: () => ({ fillRect: () => {} }) },
    _drawWall: () => {}
  },
  particles: { debris: () => {}, smoke: () => {} },
  audio: { impact: () => {} },
  camera: { addTrauma: () => {} },
  pendingExplosions: []
};

// Copy damageProp and destroyProp methods from game.js
game.damageProp = function(prop, amount, source) {
  if (!prop || prop.dead || !prop.destructible) return;
  prop.hp -= amount;
  prop.hitFlash = 0.08;
  if (prop.hp <= 0) this.destroyProp(prop, source);
};

game.destroyProp = function(prop, source) {
  if (prop.dead) return;
  prop.dead = true;
  prop.hp = 0;
  const idx = this.map.idx(prop.tx, prop.ty);
  this.map.props[idx] = null;
  if (this.map.tiles[idx] === BO.TILE_TYPE.SOLID) {
    this.map.tiles[idx] = BO.TILE_TYPE.FLOOR;
    if (this.map.roomId) this.map.roomId[idx] = 0;
  }
};

// Deal partial damage
game.damageProp(pillar, 50, 'player');
assert(pillar.hp === 170, 'pillar took 50 damage, hp is now 170');
assert(pillar.hitFlash === 0.08, 'pillar hitFlash is set');
assert(pillar.dead === false, 'pillar is not dead yet');

// Deal killing blow
game.damageProp(pillar, 200, 'player');
assert(pillar.dead === true, 'pillar is dead after taking lethal damage');
assert(pillar.hp === 0, 'pillar hp is 0');
assert(map.propAt(5, 5) === null, 'map.propAt is cleared');
assert(map.blocks(5, 5, 0) === false, 'tile no longer blocks movement');
assert(map.blocks(5, 5, 1) === false, 'tile no longer blocks bullets');

// Raycast after destruction
const ray2 = BO.Collision.raycast(map, 1 * 64, 5.5 * 64, 10 * 64, 5.5 * 64, 1);
assert(ray2.hit === false || ray2.tx > 5, 'bullet ray passes through destroyed pillar tile');

// 4. Test solid-tile cover block (as used in arenas)
const coverPillar = BO.LevelManager.makeProp('pillar', 8, 8);
coverPillar.coverBlock = true;
const idxCover = map.idx(8, 8);
map.tiles[idxCover] = BO.TILE_TYPE.SOLID;
map.props[idxCover] = coverPillar;

assert(map.blocks(8, 8, 0) === true, 'solid cover block blocks movement');
const ray3 = BO.Collision.raycast(map, 1 * 64, 8.5 * 64, 10 * 64, 8.5 * 64, 1);
assert(ray3.hit === true && ray3.prop === coverPillar, 'ray hits solid cover block and returns prop');

// Destroy solid cover block
game.damageProp(coverPillar, 300, 'player');
assert(coverPillar.dead === true, 'solid cover block destroyed');
assert(map.tiles[idxCover] === BO.TILE_TYPE.FLOOR, 'map.tiles[idxCover] converted to FLOOR');
assert(map.propAt(8, 8) === null, 'map.props cleared');
assert(map.blocks(8, 8, 0) === false, 'formerly solid tile no longer blocks');

console.log('ALL COVER BLOCK DESTRUCTION CHECKS PASSED!');
