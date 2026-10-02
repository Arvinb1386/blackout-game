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

Structure: css/ (style + embedded fonts), js/ (one module per system), assets/fonts (source font files, already embedded in css/fonts.css).
`blackout-single.html` is the original v1 bundle and does **not** include the v2 expansion. Play `index.html` for the new content.
