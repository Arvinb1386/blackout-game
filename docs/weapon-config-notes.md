# Weapon tuning — `data/weapons.json`

`data/weapons.json` holds the numbers for **every gun** in the game. Edit it, restart
(or reload), and the new values are live. No code changes needed.

The JSON is applied by `js/weapon-config.js`, which loads after the arsenal packs and
before `js/main.js`. `js/main.js` awaits `BO.WeaponConfig.ready` before the save is read,
so the loadout screen, unlocks and prices all see the edited values.

## Opening the game: `file://` vs `npm start`

**This is the one thing that silently breaks your edits.**

Browsers refuse `fetch()` of a local JSON when the page is opened by double-clicking
`index.html` (`file://`). The game then falls back to `data/weapons.data.js` — a
generated mirror of the JSON — and **every edit you make to `data/weapons.json` is
ignored**. The game looks completely normal; the numbers just never change.

| How you open the game | JSON behaviour |
|---|---|
| `npm start`, then `http://localhost:8080` | read live — **use this for tuning** |
| `npm run desktop` (Electron) | read live |
| double-click `index.html` (`file://`) | mirror only; edits are ignored and a console warning says so |

Over `file://` the browser blocks the fetch, so the game runs the mirror and tells you in
the console that your edits are not live. Run `npm start` (or `npm run desktop`) when
you want the JSON read directly.

## Installed build (.deb)

A Linux installer bundles `data/weapons.json` inside `app.asar`, so the game always
starts from the values that were current **when you built it**. Re-run
`npm run dist:deb` after changing weapon stats if you want the installed copy to pick
them up — or just keep tuning with `npm start` and build when the numbers are right.

## Editing

1. Open `data/weapons.json`.
2. Find the gun under `weapons`, keyed by its id (`pistol`, `railgun`, `hailstorm`, ...).
3. Change any number.
4. Reload the page.

Only the fields you write are overridden — everything you leave out keeps its built-in
default. That means you can tune one stat without restating the whole gun.

```jsonc
"railgun": {
  "damage": 500,        // was 210
  "fireRate": 0.7,
  "mag": 4
  // reload, spread, recoil, tracer, look, ... keep their defaults
}
```

## What you can change

| Field | Meaning |
|---|---|
| `slot` | `"primary"` or `"secondary"` — which loadout tab lists the gun |
| `price` | credits to unlock |
| `damage` | damage per bullet / per pellet |
| `pellets` | projectiles per shot (shotguns) |
| `fireRate` | rounds per second |
| `burst` / `burstRate` | rounds per burst, and their rate |
| `mag` / `reserve` | magazine size / max spare rounds |
| `reload` | reload seconds |
| `spread` / `recoil` / `maxBloom` / `recovery` | accuracy cone, bloom per shot, bloom cap, bloom decay |
| `bulletSpeed` / `range` | projectile speed and max travel |
| `auto` | `true` = hold to fire |
| `pierce` | extra targets a bullet passes through |
| `explosive` | blast radius |
| `shake` / `kick` / `hitStop` / `knockback` | camera trauma, player push-back, hit-stop, enemy push |
| `moveMul` | movement speed while equipped |
| `sound` | audio profile key |
| `tracer` / `tracerWidth` | bullet trail colour / thickness |
| `look` | silhouette: `length`, `width`, `color`, plus `glow`, `scope`, `drum`, `barrels`, `suppressor`, `bow` |
| `name` | `{ "en": "...", "fa": "..." }` — display name |
| `desc` | `{ "en": "...", "fa": "..." }` — loadout description |

Booleans such as `grenade`, `orb`, `rail`, `laser`, `silent`, `flame`, `cryo`, `arc`,
`casing`, `bigCasing` switch special behaviour on and off. Weapon-specific extras work
too: `chain` / `chainRange` / `chainFalloff` (arc), `burn` / `burnDps` (flame),
`chill` / `chillMul` (cryo), `homing` / `homingRange`, `cluster` / `clusterRadius` /
`clusterDamage`, `noise`.

`fieldDocs` and `lookFieldDocs` at the top of the file describe every field in the same
table form.

### Adding a gun

Add a new key under `weapons` and its id to `order`. A gun defined only in the JSON is
added to the arsenal — `look.length`, `damage`, `fireRate` and `mag` are the only
required fields. Give it a `name`/`desc` in both languages so the loadout screen can
show it.

### Removing a gun

Delete its key. The built-in definition stays in effect, so nothing breaks. To actually
hide it, edit the source pack in `js/` and re-run `npm run weapons:extract`.

### Upgrades

`upgradeFactors` retunes the credit upgrades: how much each level adds. `damage: 0.08`
means every damage level is +8%. Values are 0..1 fractions. `js/weapons.js` reads these
lazily on every shot, so a change applies without reloading.

## Reading the values in-game

The loadout panel shows the same numbers, so you never have to guess:

- The five headline bars show the **JSON value** — that is the number you tune. When an
  upgrade changes it, the delta appears as a separate accent badge: `38  +12` means "38
  from the JSON, +12 from four damage upgrades". Reload inverts the sign: `4.00s  −1.28`
  because less time is better. Without upgrades no badge is drawn at all.
- Below them, only the stats a player can act on are listed: pellets, burst, reserve,
  range, pierce, blast radius, move speed, full-auto, suppressed, burn, chill, chain,
  homing, cluster and noise radius. Fields the gun doesn't use are omitted (a pistol has
  no `PIERCE` row, a shotgun shows `PELLETS 8`).
- Pure tuning numbers stay in `data/weapons.json` and are deliberately **not** listed:
  recoil bloom, max bloom, bloom recovery, muzzle velocity, camera shake, kick, hit-stop,
  knockback, tracer colour and width, silhouette size and cost.

Both read the same `BO.WEAPONS` object the shooting code uses, so what you see is what
the gun fires.

The panel is sticky: select a gun, then scroll the list — the details follow you down.

## Safety

Values are validated at load. A non-numeric field is ignored (the default stays) and an
out-of-range number is clamped, both logged to the browser console with a
`[weapon-config]` prefix. A broken JSON file never crashes the game — it falls back to
the built-in stats. Read the result in the console:

```js
BO.WeaponConfig.CONFIG.source    // which file was used
BO.WeaponConfig.CONFIG.errors    // validation warnings
BO.WeaponConfig.CONFIG.added     // guns added from the JSON
BO.WeaponConfig.CONFIG.modified  // guns whose stats changed
await BO.WeaponConfig.reload()   // re-read the file without refreshing
```

## Regenerating from code

The JSON was generated from the definitions in `js/weapons.js`, `js/arsenal.js`,
`js/v4-arsenal.js` and `js/v7-arsenal.js`:

```
npm run weapons:extract   # refresh data/weapons.data.js from weapons.json (SAFE, keeps edits)
npm run weapons:resync    # rebuild weapons.json from js/ (DESTROYS your edits)
npm run weapons:test      # 83 assertions: load, overrides, validation, HTTP, i18n, loadout panel
npm run dist:deb          # build a Linux .deb installer into dist/
```

`npm run weapons:extract` reads your current `data/weapons.json` and only rewrites the
generated mirror, so it never touches your edits. Run it after every JSON change if you
intend to open the game by double-clicking `index.html`.

`npm run weapons:resync` (the old `extract --js` behaviour) rebuilds the JSON from the
definitions in `js/weapons.js`, `js/arsenal.js`, `js/v4-arsenal.js` and `js/v7-arsenal.js`,
**discarding every hand edit**. Only run it when you want to resync from the source packs.

`data/weapons.data.js` exists solely so `file://` has something to load. Over HTTP
(`npm start`, the Electron app) the JSON is read directly and the mirror is ignored.

## Not covered

`blackout-single.html` is the bundled single-file build and is **not** regenerated from
`index.html` + `js/` + `data/`. It still carries the old hardcoded weapon numbers until
you rebuild it.