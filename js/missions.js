/* =========================================================================
 * BLACKOUT :: missions.js
 * Mission data. Everything the level generator, objective system, AI
 * difficulty and reward screen need is described here as plain data.
 * ========================================================================= */
'use strict';
(function (BO) {
  const THEMES = {
    outpost:    { floor: '#1a1c23', floorAlt: '#1e2129', corridor: '#16181e', wall: '#2c303b', wallTop: '#3b404d', trim: '#ff8a1a', lamps: ['#ffb15c', '#ffcf8a'], darkRooms: 0.3, darkness: 0.88 },
    industrial: { floor: '#1d1c1a', floorAlt: '#22201d', corridor: '#191816', wall: '#39342d', wallTop: '#4a443a', trim: '#f0be3d', lamps: ['#ffc46b', '#ff9a3c'], darkRooms: 0.35, darkness: 0.9 },
    blacksite:  { floor: '#14161d', floorAlt: '#181b24', corridor: '#111319', wall: '#252937', wallTop: '#333849', trim: '#19c3dd', lamps: ['#7fe3ff', '#ff3355'], darkRooms: 0.45, darkness: 0.92 },
    tower:      { floor: '#151a1b', floorAlt: '#192022', corridor: '#121617', wall: '#243033', wallTop: '#314145', trim: '#3ddc84', lamps: ['#9dffc9', '#ffd34d'], darkRooms: 0.35, darkness: 0.9 },
    lastlight:  { floor: '#120f14', floorAlt: '#171319', corridor: '#0f0c11', wall: '#2a1f2a', wallTop: '#3a2b3a', trim: '#ff2d55', lamps: ['#ff6b81', '#ffb15c'], darkRooms: 0.55, darkness: 0.93 }
  };

  const MISSIONS = [
    {
      id: 'm1', nameKey: 'm1.name', descKey: 'm1.desc', difficulty: 'easy', theme: 'outpost', seed: 4127,
      size: [58, 42], roomCount: 9, propDensity: 1.3, barrels: 2,
      enemies: { count: 13, types: { grunt: 0.72, rusher: 0.28 } },
      diff: { hp: 0.85, damage: 0.75, accuracy: 0.8 },
      pickups: { health: 4, ammo: 4, armor: 2, credits: 4, power: 1 }, weaponPickups: ['shotgun'],
      objectives: [{ type: 'eliminate' }, { type: 'extract' }],
      rewards: { credits: 400, xp: 250 }, parTime: 240, tutorial: true
    },
    {
      id: 'm2', nameKey: 'm2.name', descKey: 'm2.desc', difficulty: 'medium', theme: 'industrial', seed: 90210,
      size: [70, 52], roomCount: 13, propDensity: 1.1, barrels: 12,
      enemies: { count: 22, types: { grunt: 0.45, rusher: 0.2, heavy: 0.15, sniper: 0.2 } },
      diff: { hp: 1, damage: 0.9, accuracy: 0.92 },
      pickups: { health: 5, ammo: 6, armor: 3, credits: 6, power: 2 }, weaponPickups: ['dmr', 'lmg'],
      objectives: [{ type: 'destroy', target: 'cache', count: 3 }, { type: 'extract' }],
      caches: 3, rewards: { credits: 700, xp: 450 }, parTime: 360
    },
    {
      id: 'm3', nameKey: 'm3.name', descKey: 'm3.desc', difficulty: 'hard', theme: 'blacksite', seed: 31337,
      size: [80, 58], roomCount: 13, propDensity: 1.05, barrels: 8, hazards: 6,
      enemies: { count: 24, types: { grunt: 0.38, rusher: 0.22, heavy: 0.18, sniper: 0.22 } },
      diff: { hp: 1.1, damage: 1, accuracy: 1 },
      pickups: { health: 7, ammo: 7, armor: 4, credits: 6, power: 3 }, weaponPickups: ['sniper', 'launcher'],
      objectives: [{ type: 'collect', count: 3 }, { type: 'boss' }, { type: 'extract' }],
      intel: 3, boss: { mk2: false }, rewards: { credits: 1100, xp: 800 }, parTime: 540
    },
    {
      id: 'm4', nameKey: 'm4.name', descKey: 'm4.desc', difficulty: 'hard', theme: 'tower', seed: 77177,
      size: [72, 54], roomCount: 12, propDensity: 1.15, barrels: 9, hazards: 3,
      enemies: { count: 16, types: { grunt: 0.45, rusher: 0.2, heavy: 0.15, sniper: 0.2 } },
      diff: { hp: 1.15, damage: 1.05, accuracy: 1.02 },
      pickups: { health: 7, ammo: 8, armor: 4, credits: 6, power: 3 }, weaponPickups: ['burst', 'revolver'],
      objectives: [
        { type: 'activate', count: 2 },
        { type: 'survive', duration: 75, interval: 10, waveSize: 3, maxAlive: 9, types: ['grunt', 'grunt', 'rusher', 'heavy', 'sniper'] },
        { type: 'extract' }
      ],
      terminals: 2, rewards: { credits: 1200, xp: 900 }, parTime: 420
    },
    {
      id: 'm5', nameKey: 'm5.name', descKey: 'm5.desc', difficulty: 'extreme', theme: 'lastlight', seed: 5150,
      size: [84, 62], roomCount: 14, propDensity: 1.1, barrels: 10, hazards: 8,
      enemies: { count: 28, types: { grunt: 0.35, rusher: 0.25, heavy: 0.2, sniper: 0.2 } },
      diff: { hp: 1.25, damage: 1.15, accuracy: 1.08 },
      pickups: { health: 8, ammo: 9, armor: 5, credits: 8, power: 4 }, weaponPickups: ['launcher', 'lmg', 'sniper'],
      objectives: [{ type: 'collect', count: 2 }, { type: 'destroy', target: 'core', count: 2 }, { type: 'boss' }, { type: 'extract' }],
      intel: 2, cores: 2, boss: { mk2: true }, rewards: { credits: 1600, xp: 1300 }, parTime: 660, finale: true
    }
  ];

  const MissionSystem = {
    byId(id) { return MISSIONS.find(m => m.id === id) || null; },
    isUnlocked(id, save) {
      const i = MISSIONS.findIndex(m => m.id === id);
      if (i <= 0) return i === 0;
      return save.completedMissions.indexOf(MISSIONS[i - 1].id) >= 0;
    },
    /** First mission not yet completed (or the last one if everything is cleared). */
    nextMission(save) {
      const m = MISSIONS.find(x => save.completedMissions.indexOf(x.id) < 0);
      return m || MISSIONS[MISSIONS.length - 1];
    },
    after(id) {
      const i = MISSIONS.findIndex(m => m.id === id);
      return i >= 0 && i < MISSIONS.length - 1 ? MISSIONS[i + 1] : null;
    },
    allCleared(save) { return MISSIONS.every(m => save.completedMissions.indexOf(m.id) >= 0); }
  };

  BO.THEMES = THEMES;
  BO.MISSIONS = MISSIONS;
  BO.MissionSystem = MissionSystem;
})(window.BO);
