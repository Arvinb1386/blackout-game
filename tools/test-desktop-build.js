'use strict';
/* =========================================================================
 * BLACKOUT :: tools/test-desktop-build.js
 * Guards the desktop-only switch: English-first boot, fullscreen on launch,
 * correct viewport sizing, and complete removal of the gamepad / touch /
 * local-co-op / phone-controller systems.
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function assert(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  -> ' + extra : ''));
  if (!cond) process.exitCode = 1;
}

/* 1. English is the default */
const save = read('js/save.js');
const i18n = read('js/i18n.js');
assert('save: default language is English', /lang:\s*'en'/.test(save), (/lang:\s*'(\w+)'/.exec(save) || [])[1]);
assert('i18n: I18N.lang defaults to English', /lang:\s*'en'/.test(i18n));
const html = read('index.html');
assert('html: document is lang="en" dir="ltr"', /<html lang="en" dir="ltr">/.test(html));

/* 2. Fullscreen on launch, with a user-gesture retry */
const main = read('js/main.js');
assert('main: requests fullscreen at boot', /requestFullscreen\(\);\s*\n\s*const save/.test(main) || /requestFullscreen/.test(main));
assert('main: uses the documentElement fullscreen API', /documentElement[\s\S]{0,200}requestFullscreen/.test(main));
assert('main: hides the navigation UI', /navigationUI:\s*'hide'/.test(main));
assert('main: retries fullscreen on the first gesture',
  /pointerdown[\s\S]{0,120}retry/.test(main) && /keydown[\s\S]{0,120}retry/.test(main));
assert('main: retry only fires once', (main.match(/\{ once: true \}/g) || []).length >= 2);
assert('main: never throws if fullscreen is blocked', /catch \(_\) \{\s*\/\* blocked \*\//.test(main));

/* 3. Viewport sizing: no fixed minimum that overflows a small fullscreen window */
const renderer = read('js/renderer.js');
const resize = /resize\(\)\s*\{([\s\S]*?)\n    \}/.exec(renderer);
assert('renderer: resize() found', !!resize);
assert('renderer: prefers visualViewport', /visualViewport/.test(resize[1]));
assert('renderer: no 320/240 floor that can overflow', !/Math\.max\(320/.test(resize[1]) && !/Math\.max\(240/.test(resize[1]));
assert('renderer: still guards against a zero size', /Math\.max\(1,/.test(resize[1]));
assert('renderer: canvas style matches the measured size',
  /style\.width\s*=\s*this\.w/.test(resize[1]) && /style\.height\s*=\s*this\.h/.test(resize[1]));

/* 4. Resize listeners cover fullscreen */
assert('main: listens to visualViewport resize', /visualViewport[\s\S]{0,160}addEventListener\('resize'/.test(main));
assert('main: listens to fullscreenchange', /addEventListener\('fullscreenchange'/.test(main));
assert('main: resizes are throttled by rAF', /requestAnimationFrame/.test(main) && /resizeQueued/.test(main));

/* 5. Input systems are gone */
const REMOVED = ['v6-core.js', 'v6-gamepad.js', 'v6-touch.js', 'v6-coop.js', 'v6-remote.js'];
REMOVED.forEach(f => assert('removed: js/' + f + ' is deleted', !fs.existsSync(path.join(ROOT, 'js', f))));
assert('removed: controller.html is deleted', !fs.existsSync(path.join(ROOT, 'controller.html')));

const loaded = [...html.matchAll(/src="js\/([^"]+)"/g)].map(m => m[1]);
REMOVED.forEach(f => assert('html: no longer loads ' + f, loaded.indexOf(f) < 0));
assert('html: no dangling script tags', loaded.every(f => fs.existsSync(path.join(ROOT, 'js', f))),
  loaded.filter(f => !fs.existsSync(path.join(ROOT, 'js', f))).join(',') || 'all present');

/* 6. Nothing left references the removed modules */
const JS = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
const stillRefs = JS.filter(f => {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  // Only live references count; commented-out prose is fine.
  return /(?:^|[^.\w])BO\.(?:V6|Gamepad|Coop|Remote|PadInput)\b/.test(src);
});
assert('no live BO.V6 / Gamepad / Coop / Remote references left', stillRefs.length === 0, stillRefs.join(',') || 'none');
assert('boss-lab.html loads no removed module',
  REMOVED.every(f => read('boss-lab.html').indexOf(f) < 0));

/* 7. Packaging metadata matches the new file list */
const pkg = JSON.parse(read('package.json'));
assert('package.json: controller.html no longer packaged', pkg.build.files.indexOf('controller.html') < 0);
assert('server.js: no controller URL advertised', !/controller\.html/.test(read('server.js')));
assert('server.js: still prints the boss lab URL', /boss-lab\.html/.test(read('server.js')));

/* 8. The magma blast now falls off with distance and cannot one-shot */
const lb = read('js/lab-bosses.js');
const magma = /magma:[\s\S]*?update\(b, e, dt, game, p\) \{([\s\S]*?)\n      \}/.exec(lb);
assert('lab: magma update found', !!magma);
assert('lab: blast damage scales with distance', /falloff/.test(magma[1]));
assert('lab: no longer calls the flat hazardBlast', !/hazardBlast/.test(magma[1]));
assert('lab: blast radius is a named constant', /const blastR = \d+/.test(magma[1]));
assert('lab: damage is scaled by the falloff', /hurt\(b, game,[\s\S]{0,80}falloff/.test(magma[1]));
assert('lab: edge of the blast deals little damage', /0\.85/.test(magma[1]) && /0\.15/.test(magma[1]));

console.log('\nDone. exitCode=' + (process.exitCode || 0));