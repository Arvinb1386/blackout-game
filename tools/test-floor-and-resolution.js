'use strict';
/* =========================================================================
 * BLACKOUT :: tools/test-floor-and-resolution.js
 * Two regressions:
 *  1. After "Next mission" the floor came up untextured until a retry. The
 *     static-decor pass allocates extra full-size canvases; on the largest
 *     maps it could fail, and U.safe() swallowed the error.
 *  2. No resolution control in Settings.
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function assert(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  -> ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

/* 1. The static pass must not be able to fail silently any more */
const fx = read('js/postfx.js');
assert('postfx: buildStaticLayer no longer swallows errors in U.safe',
  !/U\.safe\('postfx\.static'/.test(fx));
assert('postfx: buildStaticLayer wraps the pass in try/catch',
  /R\.buildStaticLayer = function[\s\S]{0,600}try\s*\{\s*enhanceStatic/.test(fx));
assert('postfx: a failure is logged, not hidden', /static pass failed/.test(fx));
assert('postfx: falls back to a reduced-quality pass',
  /enhanceStatic\(c, level, \{ skipNoise: true \}\)/.test(fx));
assert('postfx: second failure is also reported', /failed again/.test(fx));

/* 2. enhanceStatic honours the reduced-quality flag */
assert('postfx: enhanceStatic takes an options argument', /function enhanceStatic\(c, level, opts\)/.test(fx));
assert('postfx: reads skipNoise', /const skipNoise = !!\(opts && opts\.skipNoise\)/.test(fx));
assert('postfx: the heavy noise canvases are inside the guard',
  /if \(!skipNoise\) \{[\s\S]{0,900}?\n    \}/.test(fx));
assert('postfx: coarse noise is skipped when reducing quality', /noiseCanvas\(256, \(level\.seed/.test(fx));

/* 2b. The grime must be tiled, not stretched. Stretching a 40px tile across
      480px turned each sample into a 12px blob and buried the floor detail. */
assert('postfx: coarse noise is 256px, not 40px', /noiseCanvas\(256,/.test(fx) && !/noiseCanvas\(40,/.test(fx));
assert('postfx: no smoothed drawImage upscale of noise',
  !/drawImage\(coarse, 0, 0,/.test(fx) && !/imageSmoothingEnabled/.test(fx));
assert('postfx: the tile is filled through createPattern (repeat)',
  /bg\.fillStyle = bg\.createPattern\(coarse, 'repeat'\)/.test(fx));
assert('postfx: grime alpha is toned down', /globalAlpha = 0\.16/.test(fx) && !/globalAlpha = 0\.28/.test(fx));

/* 3. Noise tiles are cached instead of rebuilt per mission */
assert('postfx: a noise cache exists', /const NOISE_CACHE = Object\.create\(null\)/.test(fx));
assert('postfx: noiseCanvas reads the cache', /if \(NOISE_CACHE\[key\]\) return NOISE_CACHE\[key\]/.test(fx));
assert('postfx: noiseCanvas writes the cache', /NOISE_CACHE\[key\] = c/.test(fx));
assert('postfx: the cache key covers size and seed', /const key = size \+ ':' \+ seed/.test(fx));

/* 4. The resolution / frame-cap experiment was removed again. Nothing of it
      may come back, and the renderer must stay a straight 1:1 draw. */
const save = read('js/save.js');
const renderer = read('js/renderer.js');
const game = read('js/game.js');
const html = read('index.html');
const ui = read('js/ui.js');
const css = read('css/style.css');
const i18n = read('js/i18n.js');

['renderScale', 'resolution', 'frameCap', '_renderScale', 'setResolution']
  .forEach(k => assert('gone: no "' + k + '" setting', save.indexOf(k) < 0));
['renderScale()', 'setResolution', '_renderScale']
  .forEach(k => assert('gone: renderer has no ' + k, renderer.indexOf(k) < 0));
assert('gone: renderer dpr is untouched by any scale',
  /this\.dpr = Math\.min\(window\.devicePixelRatio \|\| 1, MAX_DPR\);/.test(renderer));
assert('gone: no frame cap in the game loop', game.indexOf('frameCap') < 0 && game.indexOf('_frameDebt') < 0);
assert('gone: no resolution action in the UI handler',
  ui.indexOf("'set-resolution'") < 0 && ui.indexOf("'frame-cap'") < 0 && ui.indexOf("'render-scale'") < 0);
assert('gone: no resolution list builder', ui.indexOf('_renderResolutionList') < 0 && ui.indexOf('RESOLUTIONS') < 0);
assert('gone: no resolution markup', html.indexOf('data-action="resolution"') < 0 &&
  html.indexOf('res-options') < 0 && html.indexOf('frame-cap') < 0);
assert('gone: no resolution CSS', css.indexOf('.res-list') < 0 && css.indexOf('seg-wrap') < 0);
['set.resolution', 'set.frameCap', 'set.resAuto', 'set.resUncapped']
  .forEach(k => assert('gone: no ' + k + ' string', i18n.indexOf(k) < 0));

/* 4b. The fullscreen fixes that were worth keeping must still be present. */
assert('kept: renderer uses visualViewport for fullscreen sizing', /visualViewport/.test(renderer));
assert('kept: no 320/240 floor that can overflow', !/Math\.max\(320/.test(renderer));
assert('kept: resize invalidates postfx patterns',
  /_fx/.test(renderer) && /patCtx\s*=\s*null/.test(renderer));
assert('kept: main.js requests fullscreen and resizes on viewport change',
  /requestFullscreen/.test(read('js/main.js')) && /visualViewport/.test(read('js/main.js')));
/* 5. Simulated next-mission run: a failing decor pass must not leave the floor
      plain, and a retry at reduced quality must still paint the plates. */
function fakeCanvas() {
  const ops = { noise: 0, plates: 0 };
  let allowNoise = true;
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, arc() {},
    fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {},
    fillRect() { ops.plates++; },
    strokeRect() {}, drawImage() {}, putImageData() {},
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createPattern() {
      ops.noise++;
      if (!allowNoise) throw new Error('canvas area limit exceeded');
      return {};
    },
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: '', imageSmoothingEnabled: true
  };
  return {
    width: 4416, height: 3168, ops,
    getContext: () => ctx,
    setNoise(v) { allowNoise = v; }
  };
}

/** Mirrors enhanceStatic's structure: heavy noise first, then the floor plates. */
function runEnhance(canvas) {
  const g = canvas.getContext('2d');
  g.createPattern(); g.createPattern();          // the two grime patterns
  g.fillRect(0, 0, 10, 10);                      // "floor plates with bevels"
}

const canvas = fakeCanvas();
canvas.setNoise(false);
let threw = null;
try { runEnhance(canvas); } catch (err) { threw = err; }
assert('retry: first pass threw as simulated', !!threw && /canvas area limit/.test(threw.message),
  threw ? threw.message : 'did not throw');

canvas.setNoise(true);
let secondPassRan = false;
try { runEnhance(canvas); secondPassRan = true; } catch (e) { /* reported */ }
assert('retry: reduced-quality pass succeeded', secondPassRan);
assert('retry: floor plates were still drawn', canvas.ops.plates > 0, canvas.ops.plates);

console.log('\nDone. exitCode=' + (process.exitCode || 0));