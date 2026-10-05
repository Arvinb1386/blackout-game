'use strict';
/* =========================================================================
 * BLACKOUT :: tools/test-texture-cache.js
 * Reproduces the "textures turn striped / checkered after replaying missions"
 * bug and guards the fix.
 *
 * Root cause: a CanvasPattern belongs to the context that created it, and it
 * is invalidated when that canvas's backing store is reallocated (renderer
 * resize). postfx.js cached its grain/scanline patterns forever, so after a
 * resize the dead pattern was assigned to fillStyle - a silent no-op that left
 * the previous colour behind.
 * ========================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function assert(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  -> ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

/**
 * Fake canvas modelling the real rule: a pattern is only valid for the context
 * that made it, and setting canvas.width kills every pattern from it.
 */
function makeCtx() {
  const ctx = {
    _fillStyle: '#000', patterns: 0, _deadAssign: 0,
    createPattern() { ctx.patterns++; return { owner: ctx, valid: true }; },
    set fillStyle(v) {
      // Assigning a dead pattern is silently ignored, like a real browser.
      if (v && v.owner && !v.valid) { ctx._deadAssign++; return; }
      ctx._fillStyle = v;
    },
    get fillStyle() { return ctx._fillStyle; },
    save() {}, restore() {}, translate() {}, beginPath() {}, arc() {}, fill() {},
    moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, fillRect() {}, clearRect() {},
    fillText() {}, measureText() { return { width: 10 }; },
    globalAlpha: 1, globalCompositeOperation: 'source-over'
  };
  return ctx;
}

function bootPostFX() {
  const document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
    documentElement: { lang: 'en', dir: 'ltr', style: {} },
    body: { classList: { add() {}, remove() {} }, appendChild() {} }
  };
  const BO = {
    U: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v), dist: (a, b, c, d) => Math.hypot(c - a, d - b), safe: (k, f) => { try { return f(); } catch (e) { return undefined; } }, makeRng: () => () => 0.5 },
    CONFIG: { FLASHLIGHT_RANGE: 400, FLASHLIGHT_FOV: 1, POSTFX: true },
    COLLIDE: { SIGHT: 1, BULLET: 2 },
    PROJECTILE_OWNER: { PLAYER: 0, ENEMY: 1 },
    // postfx.js patches these prototypes at load; only their existence matters.
    Renderer: function () {},
    Game: function () {},
    Collision: { raycast: () => ({ x: 0, y: 0 }), makeHit: () => ({}) },
    ParticleSystem: function () {},
    I18N: { extend: () => {} },
    events: { on: () => {}, emit: () => {} }
  };
  BO.Renderer.prototype = { ctx: null, dpr: 1 };
  const sb = { window: { BO }, BO, document, Math, JSON, Object, Array, String, Number, Boolean, Error, Promise, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/postfx.js'), 'utf8'), sb, { filename: 'js/postfx.js' });
  return BO;
}
const BO = bootPostFX();
const PostFX = BO.PostFX;

/** Builds an FX object without running the DOM-heavy constructor. */
function makeFx() {
  const fx = Object.create(PostFX.prototype);
  fx.grain = [{ id: 1 }, { id: 2 }, { id: 3 }];
  fx.grainPats = null;
  fx.scanPat = null;
  fx.patCtx = null;
  return fx;
}

/* 1. patterns are built once for a stable context */
const fx = makeFx();
const ctxA = makeCtx();
fx._grain(ctxA, 800, 600, 0.1);
assert('grain: patterns built on first frame', !!fx.grainPats && fx.grainPats.length === 3 && !!fx.scanPat);
assert('grain: cached against its context', fx.patCtx === ctxA);
const built = ctxA.patterns;
fx._grain(ctxA, 800, 600, 0.2);
fx._grain(ctxA, 800, 600, 0.3);
assert('grain: reused while the context is unchanged', ctxA.patterns === built, ctxA.patterns);

/* 2. THE BUG: a new context must force a rebuild */
const ctxB = makeCtx();
fx._grain(ctxB, 800, 600, 0.4);
assert('grain: rebuilt when the context changes', ctxB.patterns === 4, ctxB.patterns);
assert('grain: patterns now belong to the new context', fx.patCtx === ctxB);
assert('grain: no dead pattern was ever assigned', !ctxB._deadAssign);

/* 3. THE BUG: patterns killed by a canvas resize are rebuilt */
fx.grainPats.forEach(p => { p.valid = false; });
fx.scanPat.valid = false;
const ctxC = makeCtx();
fx._grain(ctxC, 800, 600, 0.5);
assert('grain: rebuilt after the backing store was reallocated', ctxC.patterns === 4, ctxC.patterns);
assert('grain: patterns report usable after rebuild', fx._patsUsable(ctxC) === true);

/* 4. a dead pattern must never reach fillStyle */
const fx2 = makeFx();
const ctxD = makeCtx();
fx2._grain(ctxD, 800, 600, 0.1);
fx2.grainPats.forEach(p => { p.valid = false; });
fx2.scanPat.valid = false;
fx2.patCtx = ctxD;                  // same context, but the patterns died
fx2._grain(ctxD, 800, 600, 0.2);
assert('grain: dead patterns rebuilt even on the same context', ctxD.patterns === 8, ctxD.patterns);
assert('grain: nothing dead reached fillStyle', ctxD._deadAssign === 2, ctxD._deadAssign + ' (2 = the probe itself)');

/* 5. renderer.resize() invalidates the FX pattern cache */
const rSrc = fs.readFileSync(path.join(ROOT, 'js/renderer.js'), 'utf8');
const resizeBody = /resize\(\)\s*\{([\s\S]*?)\n    \}/.exec(rSrc);
assert('renderer: resize() found', !!resizeBody);
assert('renderer: resize() clears the postfx pattern cache',
  /_fx/.test(resizeBody[1]) && /patCtx\s*=\s*null/.test(resizeBody[1]) && /grainPats\s*=\s*null/.test(resizeBody[1]));
assert('renderer: cache cleared BEFORE the canvas is resized',
  resizeBody[1].indexOf('patCtx') < resizeBody[1].indexOf('canvas.width'));

/* 6. the wall texture cache is bounded */
const wSrc = fs.readFileSync(path.join(ROOT, 'js/v4-walls.js'), 'utf8');
assert('walls: texture cache is capped', /CACHE_MAX\s*=/.test(wSrc));
assert('walls: eviction implemented', /cachePut/.test(wSrc) && /delete CACHE\[/.test(wSrc));
assert('walls: texture() uses the bounded writer', /cachePut\(key,\s*c\)/.test(wSrc));
// Only cachePut may write; a direct assignment would bypass the cap.
assert('walls: no unbounded direct writes remain',
  (wSrc.match(/CACHE\[key\] = /g) || []).length === 1 &&
  /function cachePut[\s\S]*?CACHE\[key\] = canvas/.test(wSrc),
  (wSrc.match(/CACHE\[key\] = /g) || []).length + ' direct write(s)');

console.log('\nDone. exitCode=' + (process.exitCode || 0));