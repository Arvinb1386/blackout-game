# BLACKOUT // خاموشی
2D top-down tactical shooter. Pure HTML5 Canvas + Vanilla JS + Web Audio. No server, no npm, no build.

Open `index.html` in a modern desktop browser (Chrome / Edge / Firefox).

Controls: WASD move · Mouse aim · LMB fire · R reload · 1-5 weapons (or wheel) · SPACE dodge · SHIFT sprint · E interact (hold on terminals) · TAB mission intel · ESC pause

Language: Persian (default, RTL, embedded Vazirmatn) or English. Toggle in the main menu or Settings.
Progress is saved in localStorage.

## Expansion (v2)
- **10 operations**: five new missions (Drowned Harbor, Ghost Line, Data Core, Whiteout, Citadel), each with its own visual theme. Citadel is the new finale.
- **16 weapons**: six new guns: Wasp MP (auto sidearm), Stinger RL (rocket pistol), Reaper Auto-12 (auto shotgun), Helix Plasma (piercing plasma bolts), Storm Rotary (minigun), Lance Railgun (5-target pierce + light beam).
- **Graphics overhaul** (`js/postfx.js`): bloom, per-theme colour grading and weather (rain, snow, embers, dust, data motes), volumetric flashlight beam with floating dust, richer floors and walls (grime, plates, bolts, emissive tech lights, contact shadows), explosion flash + shockwave, low-health desaturation, vignette, film grain. Toggle in Settings > POST-PROCESSING if your machine struggles.

Expansion code lives in separate modules that plug into the original systems: `js/i18n-extra.js`, `js/arsenal.js`, `js/campaign.js`, `js/postfx.js`.

## Overhaul (v3)
- **Sound** (`js/audio-plus.js`): new mixer with convolution reverb, bus saturation + EQ and a tighter limiter. Distance now muffles and wets sounds instead of just turning them down. Every gun (all 16 + enemy + boss) is rebuilt from 5 layers (transient, crack, body, sub, brown-noise tail) with per-shot variation, plus mechanical actions (clacks, pump, bolt). New: footsteps, bullet whiz-bys from enemy fire, brass tinkle, ricochets, armour hit thuds, suit power-down deaths, multi-layer explosions with debris rattle, pneumatic doors, low-HP muffle.
- **Effects** (`js/fx-plus.js`): star-flare muzzle flashes with side vents, glowing streak sparks, flickering embers, volumetric smoke puffs, fireballs that cool from white to deep red, electric arcs on hits and deaths, double-stroke shockwaves, lit debris chips, cracked bullet holes, streaked scorch marks that keep smouldering through the dark, red damage flash.
- **Characters** (`js/characters-plus.js`): fully articulated operator (plate carrier, mag pouches, pauldrons, helmet with NVG mount, radio pack + antenna, weapon light, physics scarf, glowing visor/LED) and redesigned enemies: armoured Grunt, twin-blade Rusher with energy trail, Heavy with spinning six-barrel rotary + ammo belt, cloaked Sniper with scope glint. Two-bone arms grip the weapon, legs stride with speed, corpses sprawl with a dying visor flicker.

All v3 modules monkey-patch the originals at load time; delete the three script tags in `index.html` to get v2 back.

Structure: css/ (style + embedded fonts), js/ (one module per system), assets/fonts (source font files, already embedded in css/fonts.css).
`blackout-single.html` is the original v1 bundle and does **not** include the v2 expansion or the v3 overhaul. Play `index.html` for the new content.
