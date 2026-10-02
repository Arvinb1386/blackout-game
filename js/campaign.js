/* =========================================================================
 * BLACKOUT :: campaign.js
 * Campaign expansion: five new operations (m6-m10) with their own visual
 * themes, plus weather + colour-grade data for every theme (used by
 * postfx.js). The true finale moves to m10.
 * ========================================================================= */
'use strict';
(function (BO) {
  const THEMES = BO.THEMES;

  // Atmosphere for the original themes.
  const ATMOS = {
    outpost:    { weather: 'dust',   grade: '#9a8060' },
    industrial: { weather: 'embers', grade: '#a08a5a' },
    blacksite:  { weather: 'motes',  grade: '#6a8aa8' },
    tower:      { weather: 'rain',   grade: '#6aa08a' },
    lastlight:  { weather: 'embers', grade: '#a8707a' }
  };
  Object.keys(ATMOS).forEach(k => { if (THEMES[k]) Object.assign(THEMES[k], ATMOS[k]); });

  Object.assign(THEMES, {
    harbor:   { floor: '#141a1e', floorAlt: '#172025', corridor: '#11161a', wall: '#26323a', wallTop: '#33444f', trim: '#2ec4b6', lamps: ['#ffd08a', '#7fe3ff'], darkRooms: 0.4,  darkness: 0.9,  weather: 'rain',   grade: '#6a96a6' },
    metro:    { floor: '#18181a', floorAlt: '#1c1c1f', corridor: '#141416', wall: '#2e2b26', wallTop: '#403b33', trim: '#c6ff3d', lamps: ['#f4f1d0', '#c6ff3d'], darkRooms: 0.45, darkness: 0.91, weather: 'dust',   grade: '#8aa060' },
    datacore: { floor: '#10131c', floorAlt: '#131826', corridor: '#0e1018', wall: '#1f2436', wallTop: '#2b3350', trim: '#8b5cff', lamps: ['#a98bff', '#5cf2ff'], darkRooms: 0.5,  darkness: 0.93, weather: 'motes',  grade: '#8a70b0' },
    frost:    { floor: '#1a1f26', floorAlt: '#1e242c', corridor: '#161a20', wall: '#323c48', wallTop: '#46546a', trim: '#9fe8ff', lamps: ['#dff6ff', '#9fe8ff'], darkRooms: 0.35, darkness: 0.88, weather: 'snow',   grade: '#80a0c0' },
    citadel:  { floor: '#16110f', floorAlt: '#1b1512', corridor: '#120e0c', wall: '#33241c', wallTop: '#4a3326', trim: '#ffc53d', lamps: ['#ffb15c', '#ff2d55'], darkRooms: 0.5,  darkness: 0.93, weather: 'embers', grade: '#b08858' }
  });

  const NEW_MISSIONS = [
    {
      id: 'm6', nameKey: 'm6.name', descKey: 'm6.desc', difficulty: 'hard', theme: 'harbor', seed: 24601,
      size: [76, 54], roomCount: 13, propDensity: 1.2, barrels: 14, hazards: 2,
      enemies: { count: 26, types: { grunt: 0.4, rusher: 0.25, heavy: 0.15, sniper: 0.2 } },
      diff: { hp: 1.3, damage: 1.15, accuracy: 1.08 },
      pickups: { health: 8, ammo: 9, armor: 5, credits: 8, power: 4 }, weaponPickups: ['autoshotgun', 'mpistol'],
      objectives: [{ type: 'collect', count: 3 }, { type: 'destroy', target: 'cache', count: 4 }, { type: 'extract' }],
      intel: 3, caches: 4, rewards: { credits: 1800, xp: 1500 }, parTime: 600
    },
    {
      id: 'm7', nameKey: 'm7.name', descKey: 'm7.desc', difficulty: 'hard', theme: 'metro', seed: 8086,
      size: [78, 50], roomCount: 13, propDensity: 1.15, barrels: 8, hazards: 5,
      enemies: { count: 22, types: { grunt: 0.42, rusher: 0.28, heavy: 0.14, sniper: 0.16 } },
      diff: { hp: 1.35, damage: 1.2, accuracy: 1.1 },
      pickups: { health: 8, ammo: 10, armor: 5, credits: 7, power: 4 }, weaponPickups: ['minigun', 'stinger'],
      objectives: [
        { type: 'activate', count: 3 },
        { type: 'survive', duration: 90, interval: 9, waveSize: 4, maxAlive: 11, types: ['grunt', 'grunt', 'rusher', 'rusher', 'heavy', 'sniper'] },
        { type: 'extract' }
      ],
      terminals: 3, rewards: { credits: 2000, xp: 1700 }, parTime: 600
    },
    {
      id: 'm8', nameKey: 'm8.name', descKey: 'm8.desc', difficulty: 'extreme', theme: 'datacore', seed: 1337,
      size: [84, 60], roomCount: 14, propDensity: 1.1, barrels: 8, hazards: 8,
      enemies: { count: 26, types: { grunt: 0.36, rusher: 0.24, heavy: 0.18, sniper: 0.22 } },
      diff: { hp: 1.45, damage: 1.25, accuracy: 1.12 },
      pickups: { health: 9, ammo: 10, armor: 6, credits: 8, power: 5 }, weaponPickups: ['plasma', 'railgun'],
      objectives: [{ type: 'collect', count: 3 }, { type: 'destroy', target: 'core', count: 2 }, { type: 'boss' }, { type: 'extract' }],
      intel: 3, cores: 2, boss: { mk2: false }, rewards: { credits: 2400, xp: 2000 }, parTime: 720
    },
    {
      id: 'm9', nameKey: 'm9.name', descKey: 'm9.desc', difficulty: 'extreme', theme: 'frost', seed: 4040,
      size: [82, 58], roomCount: 15, propDensity: 1.25, barrels: 10, hazards: 4,
      enemies: { count: 34, types: { grunt: 0.38, rusher: 0.26, heavy: 0.16, sniper: 0.2 } },
      diff: { hp: 1.55, damage: 1.3, accuracy: 1.15 },
      pickups: { health: 10, ammo: 12, armor: 6, credits: 9, power: 5 }, weaponPickups: ['railgun', 'minigun', 'autoshotgun'],
      objectives: [{ type: 'eliminate' }, { type: 'destroy', target: 'cache', count: 3 }, { type: 'extract' }],
      caches: 3, rewards: { credits: 2800, xp: 2400 }, parTime: 780
    },
    {
      id: 'm10', nameKey: 'm10.name', descKey: 'm10.desc', difficulty: 'extreme', theme: 'citadel', seed: 9999,
      size: [90, 64], roomCount: 15, propDensity: 1.15, barrels: 12, hazards: 10,
      enemies: { count: 32, types: { grunt: 0.34, rusher: 0.26, heavy: 0.2, sniper: 0.2 } },
      diff: { hp: 1.7, damage: 1.4, accuracy: 1.2 },
      pickups: { health: 11, ammo: 12, armor: 7, credits: 10, power: 6 }, weaponPickups: ['plasma', 'stinger', 'minigun', 'railgun'],
      objectives: [
        { type: 'activate', count: 2 },
        { type: 'survive', duration: 60, interval: 8, waveSize: 4, maxAlive: 12, types: ['grunt', 'rusher', 'rusher', 'heavy', 'heavy', 'sniper'] },
        { type: 'destroy', target: 'core', count: 2 },
        { type: 'boss' },
        { type: 'extract' }
      ],
      terminals: 2, cores: 2, boss: { mk2: true }, rewards: { credits: 3500, xp: 3200 }, parTime: 900, finale: true
    }
  ];

  BO.MISSIONS.forEach(m => { m.finale = false; });
  NEW_MISSIONS.forEach(m => { if (!BO.MissionSystem.byId(m.id)) BO.MISSIONS.push(m); });

  BO.I18N.extend('en', {
    'm5.desc': 'The Warden rebuilt himself. Gut the reactor and put him down. Again.',
    'm6.name': 'DROWNED HARBOR', 'm6.desc': 'The grid\'s backup fuel ships out through the docks. Grab the manifests and sink every cache.',
    'm7.name': 'GHOST LINE', 'm7.desc': 'A dead metro line still carries their signal. Hijack three relays and hold the platform.',
    'm8.name': 'DATA CORE', 'm8.desc': 'The Warden left a copy of himself in the servers. Pull the data, crack the cores, delete him.',
    'm9.name': 'WHITEOUT', 'm9.desc': 'A frozen relay base in the middle of a storm. No backup, no lights. Clear it and burn their supplies.',
    'm10.name': 'CITADEL', 'm10.desc': 'Their command fortress. Seize the uplinks, survive the counterattack and end the Warden for good.'
  });
  BO.I18N.extend('fa', {
    'm5.desc': 'نگهبان خودش را از نو ساخته. رآکتور را نابود کن و دوباره زمینش بزن.',
    'm6.name': 'بندر غرق‌شده', 'm6.desc': 'سوخت پشتیبان شبکه از اسکله‌ها بیرون می‌رود. اسناد بار را بردار و همه انبارها را غرق کن.',
    'm7.name': 'خط ارواح', 'm7.desc': 'یک خط متروی مرده هنوز سیگنال آن‌ها را منتقل می‌کند. سه رله را تصرف کن و از سکو دفاع کن.',
    'm8.name': 'هسته داده', 'm8.desc': 'نگهبان نسخه‌ای از خودش را در سرورها جا گذاشته. داده‌ها را بیرون بکش، هسته‌ها را بشکن و پاکش کن.',
    'm9.name': 'کولاک', 'm9.desc': 'یک پایگاه رله یخ‌زده وسط طوفان. نه پشتیبانی، نه نور. پاک‌سازی‌اش کن و تدارکاتشان را بسوزان.',
    'm10.name': 'ارگ', 'm10.desc': 'دژ فرماندهی آن‌ها. پایانه‌ها را بگیر، از پاتک جان سالم به در ببر و کار نگهبان را برای همیشه تمام کن.'
  });
})(window.BO);
