# BLACKOUT v9: Operator Update

## Player progression
- Added a 12-node skill tree across Assault, Shadow, and Tech branches.
- Each player level grants one skill point. Tiers unlock at levels 1, 3, 5, and 8, with a prerequisite node in the previous tier.
- Added six active abilities: Overcharge, Concussion Blast, Sonar Pulse, Shadow Cloak, Sentry Drone, and Kinetic Barrier.
- Added six passive skills: Brute Force, Executioner, Soft Steps, Ambush, Field Medic, and Overclock.
- Abilities use C/V on keyboard, LT+LB / LT+RB on gamepad, and two touch buttons when touch controls are enabled.
- Ability cooldowns are reduced by 0.5 seconds on every kill. A free respec is available from the Skills screen.

## New credit upgrades
- Endurance, Reflexes, Bio-Regen, Second Wind, Precision, Scavenger, and Tactical Core.
- Existing upgrades are now grouped into Survival, Mobility, Weaponry, and Support categories.
- Save migration keeps old profiles compatible and appends new upgrade/skill data safely.

## Combat feel
- Kill streaks: Double Kill, Triple Kill, Rampage, and Unstoppable, with bonus XP.
- Precision, regen, lifesteal, stamina, dodge, credit, and cooldown upgrades have real gameplay effects.
- New ability feedback: skill rings, drone model, barrier dome, cloak afterimage, sonar reveal markers, cooldown HUD, ready flash, impact audio, and ability-specific color language.
- Shadow Cloak gives enemies an afterimage target and rewards the first shot after cloak with double damage.
- Concussion Blast stuns and knocks back nearby enemies. Sonar reveals enemies through walls. The Sentry Drone uses the existing projectile pipeline. Kinetic Barrier absorbs enemy rounds into armor.

## Start UX
- Added a redesigned Operator Dossier to the main menu: rank, XP ring, credits, operations, kills, S ratings, next operation, and rotating field tips.
- Added a dedicated Skills entry plus a purple "Skill Tree & Abilities" callout and menu badges for unspent skill points / affordable upgrades.
- Added a lighter torch cursor treatment, subtle menu glitch, staggered navigation entrance, better hierarchy, and responsive fallback that hides the dossier on compact screens.
- Added bilingual English/Persian copy for all new UI and gameplay messaging.

## Files
- `js/v9-skills.js`: drop-in feature pack, UI, persistence migration, ability runtime, combat hooks, input adapters.
- `index.html`: loads `v9-skills.js` after v8 and before profiles/main.
- `docs/v9-feature-notes.md`: complete feature and controls reference.
