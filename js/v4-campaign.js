/* =========================================================================
 * BLACKOUT :: v4-campaign.js
 * Four new operations (m11-m14) with their own visual themes, built around
 * the v4 enemies and guns. BLACK SPIRE (m14) becomes the new finale.
 * ========================================================================= */
'use strict';
(function (BO) {
  const THEMES = BO.THEMES;

  Object.assign(THEMES, {
    bazaar:   { floor: '#1c1712', floorAlt: '#211a14', corridor: '#17130f', wall: '#4a3426', wallTop: '#5e4430', trim: '#2ec4b6', lamps: ['#ffc46b', '#ffdf9a'], darkRooms: 0.4,  darkness: 0.9,  weather: 'dust',   grade: '#a8885a' },
    refinery: { floor: '#15171a', floorAlt: '#191b1f', corridor: '#121416', wall: '#2c3034', wallTop: '#3b4046', trim: '#ffd34d', lamps: ['#ffb15c', '#ff7a1a'], darkRooms: 0.4,  darkness: 0.91, weather: 'embers', grade: '#a08060' },
    reactor:  { floor: '#0f1512', floorAlt: '#121a16', corridor: '#0c110f', wall: '#1e2a24', wallTop: '#2a3a32', trim: '#7dff6a', lamps: ['#9dffc9', '#7dff6a'], darkRooms: 0.5,  darkness: 0.93, weather: 'motes',  grade: '#70a080' },
    skyline:  { floor: '#12121a', floorAlt: '#15151f', corridor: '#0f0f16', wall: '#22223a', wallTop: '#30304e', trim: '#ff3df2', lamps: ['#ff6bd5', '#5cf2ff'], darkRooms: 0.45, darkness: 0.92, weather: 'rain',   grade: '#8a70b0' }
  });

  const NEW_MISSIONS = [
    {
      id: 'm11', nameKey: 'm11.name', descKey: 'm11.desc', difficulty: 'extreme', theme: 'bazaar', seed: 1404,
      size: [80, 56], roomCount: 15, propDensity: 1.35, barrels: 8, hazards: 2,
      enemies: { count: 30, types: { grunt: 0.3, rusher: 0.18, breacher: 0.2, shield: 0.12, sniper: 0.1, grenadier: 0.1 } },
      diff: { hp: 1.75, damage: 1.4, accuracy: 1.18 },
      pickups: { health: 10, ammo: 12, armor: 6, credits: 12, power: 5 }, weaponPickups: ['kaveh', 'sawnoff', 'hornet'],
      objectives: [{ type: 'collect', count: 3 }, { type: 'eliminate' }, { type: 'extract' }],
      intel: 3, rewards: { credits: 3800, xp: 3400 }, parTime: 840
    },
    {
      id: 'm12', nameKey: 'm12.name', descKey: 'm12.desc', difficulty: 'extreme', theme: 'refinery', seed: 7070,
      size: [86, 60], roomCount: 15, propDensity: 1.2, barrels: 22, hazards: 6,
      enemies: { count: 28, types: { grunt: 0.28, rusher: 0.14, heavy: 0.14, grenadier: 0.16, drone: 0.16, sniper: 0.12 } },
      diff: { hp: 1.85, damage: 1.45, accuracy: 1.2 },
      pickups: { health: 11, ammo: 13, armor: 7, credits: 11, power: 6 }, weaponPickups: ['inferno', 'kaveh', 'stinger'],
      objectives: [
        { type: 'destroy', target: 'cache', count: 4 },
        { type: 'survive', duration: 75, interval: 8, waveSize: 4, maxAlive: 12, types: ['drone', 'drone', 'grenadier', 'breacher', 'grunt', 'heavy'] },
        { type: 'extract' }
      ],
      caches: 4, rewards: { credits: 4200, xp: 3800 }, parTime: 900
    },
    {
      id: 'm13', nameKey: 'm13.name', descKey: 'm13.desc', difficulty: 'extreme', theme: 'reactor', seed: 23523,
      size: [88, 62], roomCount: 15, propDensity: 1.1, barrels: 8, hazards: 12,
      enemies: { count: 30, types: { grunt: 0.26, rusher: 0.16, heavy: 0.14, shield: 0.14, drone: 0.12, sniper: 0.1, breacher: 0.08 } },
      diff: { hp: 1.95, damage: 1.5, accuracy: 1.22 },
      pickups: { health: 12, ammo: 13, armor: 7, credits: 11, power: 6 }, weaponPickups: ['arc', 'plasma', 'railgun'],
      objectives: [{ type: 'activate', count: 3 }, { type: 'destroy', target: 'core', count: 2 }, { type: 'boss' }, { type: 'extract' }],
      terminals: 3, cores: 2, boss: { mk2: true }, rewards: { credits: 4600, xp: 4200 }, parTime: 960
    },
    {
      id: 'm14', nameKey: 'm14.name', descKey: 'm14.desc', difficulty: 'extreme', theme: 'skyline', seed: 31415,
      size: [92, 66], roomCount: 16, propDensity: 1.15, barrels: 12, hazards: 10,
      enemies: { count: 34, types: { grunt: 0.22, rusher: 0.14, heavy: 0.14, sniper: 0.12, breacher: 0.12, grenadier: 0.1, shield: 0.08, drone: 0.08 } },
      diff: { hp: 2.1, damage: 1.6, accuracy: 1.28 },
      pickups: { health: 13, ammo: 14, armor: 8, credits: 12, power: 7 }, weaponPickups: ['arc', 'inferno', 'simorgh', 'minigun', 'railgun'],
      objectives: [
        { type: 'collect', count: 2 },
        { type: 'activate', count: 2 },
        { type: 'survive', duration: 60, interval: 7, waveSize: 5, maxAlive: 14, types: ['grunt', 'breacher', 'shield', 'grenadier', 'drone', 'drone', 'heavy', 'rusher'] },
        { type: 'boss' },
        { type: 'extract' }
      ],
      intel: 2, terminals: 2, boss: { mk2: true }, rewards: { credits: 5500, xp: 5000 }, parTime: 1080, finale: true
    }
  ];

  BO.MISSIONS.forEach(m => { m.finale = false; });
  NEW_MISSIONS.forEach(m => { if (!BO.MissionSystem.byId(m.id)) BO.MISSIONS.push(m); });

  BO.I18N.extend('en', {
    'm10.desc': 'Their command fortress. Seize the uplinks, survive the counterattack and break the Warden. Whatever is left of him will run.',
    'm11.name': 'GRAND BAZAAR', 'm11.desc': 'The grid takes orders from deep inside the old bazaar. Pull the ledgers out of the stalls and clear the arcades.',
    'm12.name': 'BLACK GOLD', 'm12.desc': 'This refinery fuels their generators. Blow the tanks and hold out against the drone swarm.',
    'm13.name': 'DEEP CORE', 'm13.desc': 'The underground reactor is the Warden\'s last power source. Seize control, crack the cores and bury him in the dark.',
    'm14.name': 'BLACK SPIRE', 'm14.desc': 'The tallest tower in the city, where the blackout began. Grab the intel, take the transmitters and face the Warden one last time.'
  });
  BO.I18N.extend('fa', {
    'm10.desc': 'دژ فرماندهی آن‌ها. پایانه‌ها را بگیر، از پاتک جان سالم به در ببر و نگهبان را درهم بشکن. هر چه از او مانده فرار خواهد کرد.',
    'm11.name': 'بازار بزرگ', 'm11.desc': 'شبکه از دل بازار قدیمی فرمان می‌گیرد. دفترها را از حجره‌ها بیرون بکش و راسته‌ها را پاک‌سازی کن.',
    'm12.name': 'طلای سیاه', 'm12.desc': 'این پالایشگاه سوخت ژنراتورهای آن‌ها را تأمین می‌کند. مخزن‌ها را منفجر کن و زیر حمله پهپادها دوام بیاور.',
    'm13.name': 'هسته عمیق', 'm13.desc': 'رآکتور زیرزمینی آخرین منبع نیروی نگهبان است. کنترل را بگیر، هسته‌ها را بشکن و او را در تاریکی دفن کن.',
    'm14.name': 'برج سیاه', 'm14.desc': 'بلندترین برج شهر، جایی که خاموشی آغاز شد. اسناد را بردار، فرستنده‌ها را بگیر و برای آخرین بار با نگهبان روبه‌رو شو.'
  });
})(window.BO);
