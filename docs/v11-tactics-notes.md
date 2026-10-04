# v11 tactics pack: stealth, zoned alarms, boss variants

Files: `js/v11-tactics.js` (new, loads after `v10-power.js`), `js/v10-power.js` (alarm zones), `index.html` (script tag).

## Stealth

The old perception gave engaged hostiles 360 degree vision at full range for the whole fight, and allies within 460 px were force-alerted through walls. A player standing still behind cover kept getting shot.

- **Visibility score** (`BO.V11.visibility`): `light x movement`, clamped to `0.12..1`.
  - light: dark `0.4`, lit room `0.85`, just fired `1`
  - movement: still (<25 px/s) `0.45`, walking `0.75`, sprinting `1.15`, rolling `1`
- **Unengaged sight range** = `view x (0.3 + 0.7 x vis)`; suspicion builds at `0.2 + vis` of the old rate and decays faster when you're out of sight.
- **Engaged tracking**: 360 degree tracking only for `trackMemory` (1.6 s) after the last real sighting. After that it's a cone (`fov x 1.35`) and `view x (0.55 + 0.45 x vis)`.
- **Cease fire**: no shots once sight is lost for 0.25 s; 0.35 s reaction time to re-acquire. Heavy sprays and wind-ups are cancelled too.
- **Ally alerts**: only allies with line of sight to the spotter, in the same room, or within 220 px react. If they can't see you themselves they INVESTIGATE instead of opening fire.
- **Footsteps**: sprinting emits a 170 px noise every 0.4 s (the v9 `silent` skill still shrinks it).
- Anything closer than 80 px is always noticed.

Tuning lives in `BO.V11.CONF`.

## Alarm zones (v10-power.js)

The alarm used to alert every hostile within 1800 px and light up every room on the map. Now a tripped panel builds a **zone**: the panel's own room plus every room whose edge is within `CONF.zoneRange` (620 px) of the panel. Arenas are excluded.

- Only hostiles inside the zone (or in corridors within range of the panel) are alerted.
- Emergency lights only override blackouts inside the zone; breakers elsewhere still work normally.
- Reinforcements spawn within `reinforceRange` (1500 px) of the panel. If you're outside the zone they sweep the sector instead of homing in on you.
- The red vignette only shows while you're standing in the zone; the countdown bar is always visible.

## Boss variants

`BO.Boss` is now a subclass (`VariantBoss`) of the original Warden; existing prototype wrappers (v6 co-op, v8 tempest) still apply through the prototype chain.

| Mission | Variant | HP | Signature |
|---|---|---|---|
| m3 | The Warden | 5200 | fan / stream, intro fight, 1 minion max |
| m5 | Iron Warden | 6500 | charge-heavy brute |
| m8 | Siege Warden | 6825 | mortar + mines artillery |
| m10 | Vortex Warden | 7475 | spiral + cross bullet patterns |
| m13 | Hunter Warden | 7800 | snipe + blink |
| m14 | Warden Prime | 8450 | mixes everything learned so far |
| m18 | Forge Titan | 8450 | mines + charge, arena fields from phase 2 |
| m23 | Ossuary Wraith | 9100 | blink-heavy, spiral, cross |
| m24 | Tempest Warden | 9750 | full kit + the v8 storm (finale only) |
| c3 | Twin-Core Warden | 8450 | cross-focused co-op boss |

New attacks: `spiral`, `cross`, `snipe` (telegraphed laser, 2-3 heavy shots), `mines` (delayed ring of blasts), `blink` (telegraphed teleport + short fan).

**Pacing**: cooldowns between attacks went from 1.35 / 1.0 / 0.7 s (x0.85 on mk2) to about 1.9 / 1.6 / 1.35 s. Fan volleys are 0.5 s apart (was 0.28), the stream fires in bursts of 5 with 0.55 s gaps instead of a 1.9 s hose, and nova rings are 0.65 s apart. After every 2-4 attacks the boss **vents** for about 2.2 s: no firing, takes +30% damage.

**Summons**: phase 3 only (was phase 2 + 3), 1 per cast (2 on the finale), max 2 alive (was 4), 15 s between casts, 3-6 total per fight. Heavies are no longer summoned.

The v8 storm overlay keys off `boss.mk2`, so the variant sets `mk2` only for the finale. Every other fight now plays differently instead of all mk2 bosses sharing the storm.

## Not updated

`blackout-single.html` is a bundled build and does **not** include these changes. Regenerate it from `index.html` + `js/` before shipping the single-file version.
