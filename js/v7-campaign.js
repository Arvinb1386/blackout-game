/* =========================================================================
 * BLACKOUT :: v7-campaign.js
 * Ten new operations (m15-m24), each in a completely different environment
 * with its own palette, weather, floor decor and hazard type (see
 * v7-world.js): desert, jungle, deep sea, volcano, orbit, fallout zone,
 * neon shrine, sewers, catacombs and an offshore rig in a lightning storm.
 * EYE OF THE STORM (m24) becomes the new finale.
 * ========================================================================= */
'use strict';
(function (BO) {
  const THEMES = BO.THEMES;

  Object.assign(THEMES, {
    dunes:   { floor: '#2a2116', floorAlt: '#30261a', corridor: '#241c13', wall: '#5a4430', wallTop: '#735737', trim: '#ffb347', lamps: ['#ffd39a', '#ff9e4a'], darkRooms: 0.3,  darkness: 0.86, weather: 'sand',      grade: '#c09a60', hazard: 'sand',      decor: 'sand' },
    jungle:  { floor: '#141c12', floorAlt: '#182214', corridor: '#10170e', wall: '#2a3a22', wallTop: '#3a502e', trim: '#7dff6a', lamps: ['#d8ffb0', '#ffd34d'], darkRooms: 0.45, darkness: 0.91, weather: 'fireflies', grade: '#6a9a5a', hazard: 'acid',      decor: 'jungle' },
    abyss:   { floor: '#0c161c', floorAlt: '#0f1b22', corridor: '#0a1217', wall: '#163038', wallTop: '#1f424d', trim: '#00e5d1', lamps: ['#7ff7ff', '#3fb8ff'], darkRooms: 0.55, darkness: 0.94, weather: 'bubbles',   grade: '#3a8aa0', hazard: 'steam',     decor: 'water' },
    magma:   { floor: '#1a100c', floorAlt: '#20140e', corridor: '#160d09', wall: '#3a2018', wallTop: '#552c1e', trim: '#ff5a1a', lamps: ['#ff8a3c', '#ffcf6b'], darkRooms: 0.35, darkness: 0.9,  weather: 'ash',       grade: '#c0704a', hazard: 'fire',      decor: 'lava' },
    orbital: { floor: '#14161c', floorAlt: '#181b22', corridor: '#111317', wall: '#2a2f3a', wallTop: '#3a4150', trim: '#e8f0ff', lamps: ['#ffffff', '#9fb8ff'], darkRooms: 0.4,  darkness: 0.92, weather: 'void',      grade: '#8090b8', hazard: 'cryo',      decor: 'space' },
    fallout: { floor: '#1a1a14', floorAlt: '#1f1f17', corridor: '#161611', wall: '#3a3a2c', wallTop: '#4c4c3a', trim: '#c6ff3d', lamps: ['#e8ff9a', '#ffcf6b'], darkRooms: 0.5,  darkness: 0.92, weather: 'fallout',   grade: '#9aa860', hazard: 'radiation', decor: 'fallout' },
    shrine:  { floor: '#1a1214', floorAlt: '#1f1518', corridor: '#160f11', wall: '#3a1e24', wallTop: '#552a32', trim: '#ff4d6d', lamps: ['#ffb0c8', '#ffcf6b'], darkRooms: 0.4,  darkness: 0.9,  weather: 'petals',    grade: '#c07a90', hazard: 'spirit',    decor: 'shrine' },
    sewer:   { floor: '#151810', floorAlt: '#191c13', corridor: '#11140d', wall: '#2c3022', wallTop: '#3b402d', trim: '#a8e05a', lamps: ['#d8e8a0', '#ffb15c'], darkRooms: 0.55, darkness: 0.93, weather: 'drips',     grade: '#7a8a50', hazard: 'acid',      decor: 'sewer' },
    crypt:   { floor: '#16151a', floorAlt: '#1a191f', corridor: '#121116', wall: '#2e2b33', wallTop: '#403c47', trim: '#ffcf6b', lamps: ['#ffb15c', '#ffdf9a'], darkRooms: 0.6,  darkness: 0.94, weather: 'fog',       grade: '#9a8a70', hazard: 'fire',      decor: 'crypt' },
    rig:     { floor: '#15181b', floorAlt: '#191c20', corridor: '#121417', wall: '#30353b', wallTop: '#424950', trim: '#ffd34d', lamps: ['#fff1c9', '#ff3355'], darkRooms: 0.45, darkness: 0.91, weather: 'storm',     grade: '#7088a0', hazard: 'steam',     decor: 'rig' }
  });

  const NEW_MISSIONS = [
    {
      id: 'm15', nameKey: 'm15.name', descKey: 'm15.desc', difficulty: 'extreme', theme: 'dunes', seed: 1515,
      size: [82, 58], roomCount: 15, propDensity: 1.1, barrels: 8, hazards: 9,
      enemies: { count: 30, types: { grunt: 0.3, rusher: 0.22, sniper: 0.18, grenadier: 0.12, drone: 0.1, heavy: 0.08 } },
      diff: { hp: 2.2, damage: 1.65, accuracy: 1.3 },
      pickups: { health: 12, ammo: 13, armor: 7, credits: 12, power: 6 }, weaponPickups: ['arash', 'rostam', 'kaveh'],
      objectives: [{ type: 'collect', count: 3 }, { type: 'activate', count: 2 }, { type: 'extract' }],
      intel: 3, terminals: 2, rewards: { credits: 5800, xp: 5200 }, parTime: 900
    },
    {
      id: 'm16', nameKey: 'm16.name', descKey: 'm16.desc', difficulty: 'extreme', theme: 'jungle', seed: 1616,
      size: [84, 60], roomCount: 16, propDensity: 1.4, barrels: 6, hazards: 10,
      enemies: { count: 32, types: { grunt: 0.28, rusher: 0.26, breacher: 0.16, shield: 0.1, grenadier: 0.1, sniper: 0.1 } },
      diff: { hp: 2.3, damage: 1.7, accuracy: 1.3 },
      pickups: { health: 12, ammo: 13, armor: 7, credits: 12, power: 6 }, weaponPickups: ['seeker', 'shredder', 'inferno'],
      objectives: [{ type: 'eliminate' }, { type: 'destroy', target: 'cache', count: 4 }, { type: 'extract' }],
      caches: 4, rewards: { credits: 6100, xp: 5500 }, parTime: 960
    },
    {
      id: 'm17', nameKey: 'm17.name', descKey: 'm17.desc', difficulty: 'extreme', theme: 'abyss', seed: 1717,
      size: [86, 60], roomCount: 15, propDensity: 1.1, barrels: 6, hazards: 10,
      enemies: { count: 30, types: { grunt: 0.26, shield: 0.16, drone: 0.16, heavy: 0.14, rusher: 0.14, sniper: 0.14 } },
      diff: { hp: 2.4, damage: 1.75, accuracy: 1.32 },
      pickups: { health: 13, ammo: 14, armor: 8, credits: 12, power: 6 }, weaponPickups: ['frostbite', 'arc', 'rivet'],
      objectives: [
        { type: 'activate', count: 3 },
        { type: 'survive', duration: 75, interval: 8, waveSize: 4, maxAlive: 13, types: ['drone', 'drone', 'grunt', 'shield', 'heavy', 'rusher'] },
        { type: 'extract' }
      ],
      terminals: 3, rewards: { credits: 6400, xp: 5800 }, parTime: 960
    },
    {
      id: 'm18', nameKey: 'm18.name', descKey: 'm18.desc', difficulty: 'extreme', theme: 'magma', seed: 1818,
      size: [88, 62], roomCount: 15, propDensity: 1.1, barrels: 16, hazards: 14,
      enemies: { count: 32, types: { grunt: 0.24, heavy: 0.18, grenadier: 0.16, breacher: 0.14, rusher: 0.14, drone: 0.14 } },
      diff: { hp: 2.5, damage: 1.8, accuracy: 1.34 },
      pickups: { health: 13, ammo: 14, armor: 8, credits: 12, power: 7 }, weaponPickups: ['hailstorm', 'frostbite', 'rostam'],
      objectives: [{ type: 'destroy', target: 'core', count: 3 }, { type: 'boss' }, { type: 'extract' }],
      cores: 3, boss: { mk2: false }, rewards: { credits: 6800, xp: 6200 }, parTime: 1020
    },
    {
      id: 'm19', nameKey: 'm19.name', descKey: 'm19.desc', difficulty: 'extreme', theme: 'orbital', seed: 1919,
      size: [86, 62], roomCount: 16, propDensity: 1, barrels: 6, hazards: 12,
      enemies: { count: 32, types: { grunt: 0.26, sniper: 0.16, shield: 0.14, drone: 0.16, rusher: 0.14, breacher: 0.14 } },
      diff: { hp: 2.6, damage: 1.85, accuracy: 1.36 },
      pickups: { health: 13, ammo: 14, armor: 8, credits: 13, power: 7 }, weaponPickups: ['railgun', 'seeker', 'whisper'],
      objectives: [{ type: 'collect', count: 3 }, { type: 'activate', count: 2 }, { type: 'destroy', target: 'core', count: 2 }, { type: 'boss' }, { type: 'extract' }],
      intel: 3, terminals: 2, cores: 2, boss: { mk2: false }, rewards: { credits: 7200, xp: 6600 }, parTime: 1080
    },
    {
      id: 'm20', nameKey: 'm20.name', descKey: 'm20.desc', difficulty: 'extreme', theme: 'fallout', seed: 2020,
      size: [90, 64], roomCount: 16, propDensity: 1.3, barrels: 12, hazards: 12,
      enemies: { count: 36, types: { grunt: 0.3, rusher: 0.24, heavy: 0.14, grenadier: 0.12, sniper: 0.1, breacher: 0.1 } },
      diff: { hp: 2.7, damage: 1.9, accuracy: 1.38 },
      pickups: { health: 14, ammo: 15, armor: 8, credits: 13, power: 7 }, weaponPickups: ['rostam', 'hailstorm', 'shredder'],
      objectives: [{ type: 'collect', count: 2 }, { type: 'eliminate' }, { type: 'extract' }],
      intel: 2, rewards: { credits: 7600, xp: 7000 }, parTime: 1080
    },
    {
      id: 'm21', nameKey: 'm21.name', descKey: 'm21.desc', difficulty: 'extreme', theme: 'shrine', seed: 2121,
      size: [86, 60], roomCount: 15, propDensity: 1.2, barrels: 6, hazards: 10,
      enemies: { count: 32, types: { rusher: 0.24, grunt: 0.2, breacher: 0.18, shield: 0.14, sniper: 0.12, drone: 0.12 } },
      diff: { hp: 2.8, damage: 1.95, accuracy: 1.4 },
      pickups: { health: 14, ammo: 15, armor: 9, credits: 13, power: 7 }, weaponPickups: ['arash', 'whisper', 'arc'],
      objectives: [
        { type: 'activate', count: 3 },
        { type: 'survive', duration: 70, interval: 7, waveSize: 5, maxAlive: 14, types: ['rusher', 'rusher', 'breacher', 'shield', 'drone', 'grunt', 'sniper'] },
        { type: 'extract' }
      ],
      terminals: 3, rewards: { credits: 8000, xp: 7400 }, parTime: 1020
    },
    {
      id: 'm22', nameKey: 'm22.name', descKey: 'm22.desc', difficulty: 'extreme', theme: 'sewer', seed: 2222,
      size: [92, 64], roomCount: 17, propDensity: 1.15, barrels: 10, hazards: 14,
      enemies: { count: 36, types: { grunt: 0.26, rusher: 0.22, breacher: 0.16, grenadier: 0.12, shield: 0.12, heavy: 0.12 } },
      diff: { hp: 2.9, damage: 2, accuracy: 1.42 },
      pickups: { health: 15, ammo: 16, armor: 9, credits: 14, power: 8 }, weaponPickups: ['shredder', 'rivet', 'inferno', 'seeker'],
      objectives: [{ type: 'destroy', target: 'cache', count: 5 }, { type: 'collect', count: 3 }, { type: 'extract' }],
      caches: 5, intel: 3, rewards: { credits: 8400, xp: 7800 }, parTime: 1140
    },
    {
      id: 'm23', nameKey: 'm23.name', descKey: 'm23.desc', difficulty: 'extreme', theme: 'crypt', seed: 2323,
      size: [90, 64], roomCount: 16, propDensity: 1.1, barrels: 8, hazards: 12,
      enemies: { count: 34, types: { grunt: 0.22, rusher: 0.2, shield: 0.16, heavy: 0.14, sniper: 0.14, breacher: 0.14 } },
      diff: { hp: 3, damage: 2.05, accuracy: 1.44 },
      pickups: { health: 15, ammo: 16, armor: 9, credits: 14, power: 8 }, weaponPickups: ['frostbite', 'hailstorm', 'simorgh'],
      objectives: [{ type: 'collect', count: 3 }, { type: 'destroy', target: 'core', count: 2 }, { type: 'boss' }, { type: 'extract' }],
      intel: 3, cores: 2, boss: { mk2: true }, rewards: { credits: 8800, xp: 8200 }, parTime: 1200
    },
    {
      id: 'm24', nameKey: 'm24.name', descKey: 'm24.desc', difficulty: 'extreme', theme: 'rig', seed: 2424,
      size: [94, 68], roomCount: 17, propDensity: 1.15, barrels: 16, hazards: 14,
      enemies: { count: 38, types: { grunt: 0.2, rusher: 0.14, heavy: 0.14, sniper: 0.1, breacher: 0.12, grenadier: 0.1, shield: 0.1, drone: 0.1 } },
      diff: { hp: 3.2, damage: 2.15, accuracy: 1.48 },
      pickups: { health: 16, ammo: 17, armor: 10, credits: 15, power: 9 }, weaponPickups: ['rostam', 'hailstorm', 'railgun', 'arash', 'seeker'],
      objectives: [
        { type: 'activate', count: 2 },
        { type: 'destroy', target: 'cache', count: 3 },
        { type: 'survive', duration: 60, interval: 7, waveSize: 5, maxAlive: 15, types: ['grunt', 'breacher', 'shield', 'grenadier', 'drone', 'heavy', 'rusher', 'sniper'] },
        { type: 'boss' },
        { type: 'extract' }
      ],
      terminals: 2, caches: 3, boss: { mk2: true }, rewards: { credits: 10000, xp: 9500 }, parTime: 1320, finale: true
    }
  ];

  // Never reference a gun this build doesn't have.
  NEW_MISSIONS.forEach(m => { m.weaponPickups = m.weaponPickups.filter(id => BO.WEAPONS && BO.WEAPONS[id]); });
  BO.MISSIONS.forEach(m => { m.finale = false; });
  NEW_MISSIONS.forEach(m => { if (!BO.MissionSystem.byId(m.id)) BO.MISSIONS.push(m); });

  BO.I18N.extend('en', {
    'm14.desc': 'The tallest tower in the city, where the blackout began. Grab the intel, take the transmitters and face the Warden. If he falls here, his echoes scatter across the world.',
    'm15.name': 'DUNE SIGNAL', 'm15.desc': 'One echo of the Warden is broadcasting from a buried listening post in the desert. Pull the logs and hijack both dishes. Mind the sinkholes.',
    'm16.name': 'GREEN HELL', 'm16.desc': 'A jungle research station has gone dark under the canopy. Clear every hostile, then torch their bio-caches. The bog water eats boots.',
    'm17.name': 'ABYSSAL LAB', 'm17.desc': 'A pressure lab four hundred metres under the sea. Reroute three pumps and hold out while the hull groans and the drones swarm.',
    'm18.name': 'MAGMA FORGE', 'm18.desc': 'They forge new Warden shells inside a living volcano. Crack the three furnace cores and melt whatever crawls out.',
    'm19.name': 'ORBITAL DECAY', 'm19.desc': 'The relay satellite is falling. Recover the flight data, seize the controls and eliminate the Twin-Core Warden before it burns up in orbit.',
    'm20.name': 'RED ZONE', 'm20.desc': 'An irradiated ghost city that nobody was supposed to enter again. Find the black boxes and leave nothing standing. Do not linger in the green.',
    'm21.name': 'NEON SHRINE', 'm21.desc': 'A mountain shrine wired with neon and old seals. Light three lantern relays and survive the night as they come up the steps.',
    'm22.name': 'UNDERCITY', 'm22.desc': 'The grid\'s couriers move through the sewers. Burn five supply caches, grab their routes and get out before the tide comes in.',
    'm23.name': 'OSSUARY', 'm23.desc': 'Bones line the walls of the catacombs where the last Warden is kept. Pull the crypt records, break both cores and end him in the dark.',
    'm24.name': 'EYE OF THE STORM', 'm24.desc': 'The final echo hides on an offshore rig in a lightning storm. Seize the uplinks, sink the fuel, hold the deck and finish the Warden for good.'
  });
  BO.I18N.extend('fa', {
    'm14.desc': 'بلندترین برج شهر، جایی که خاموشی آغاز شد. اسناد را بردار، فرستنده‌ها را بگیر و با نگهبان روبه‌رو شو. اگر این‌جا بیفتد، پژواک‌هایش در سراسر جهان پخش می‌شوند.',
    'm15.name': 'سیگنال تپه‌ها', 'm15.desc': 'یکی از پژواک‌های نگهبان از یک پایگاه شنود مدفون در صحرا پخش می‌شود. گزارش‌ها را بردار و هر دو دیش را تصرف کن. مراقب گودال‌های شن باش.',
    'm16.name': 'دوزخ سبز', 'm16.desc': 'یک ایستگاه تحقیقاتی زیر سایه جنگل خاموش شده. همه دشمن‌ها را پاک کن و انبارهای زیستی‌شان را بسوزان. آب مرداب چکمه را می‌خورد.',
    'm17.name': 'آزمایشگاه ژرفا', 'm17.desc': 'آزمایشگاهی چهارصد متر زیر دریا. سه پمپ را دوباره راه بینداز و تا وقتی بدنه ناله می‌کند و پهپادها هجوم می‌آورند، دوام بیاور.',
    'm18.name': 'کوره گدازه', 'm18.desc': 'آن‌ها پوسته‌های تازه نگهبان را درون یک آتشفشان زنده می‌سازند. سه هسته کوره را بشکن و هر چه بیرون خزید را ذوب کن.',
    'm19.name': 'سقوط مداری', 'm19.desc': 'ماهواره رله در حال سقوط است. داده‌های پرواز را بردار، پایانه‌ها را بگیر و نگهبان دوهسته را پیش از سوختن در مدار نابود کن.',
    'm20.name': 'منطقه سرخ', 'm20.desc': 'شهر ارواحِ آلوده به تشعشع که قرار نبود کسی دوباره واردش شود. جعبه‌سیاه‌ها را پیدا کن و هیچ چیز را سرپا نگذار. در سبزی‌ها معطل نکن.',
    'm21.name': 'معبد نئون', 'm21.desc': 'معبدی کوهستانی پر از نئون و طلسم‌های کهنه. سه رله فانوس را روشن کن و تا صبح، وقتی از پله‌ها بالا می‌آیند، زنده بمان.',
    'm22.name': 'شهر زیرین', 'm22.desc': 'پیک‌های شبکه از راه فاضلاب جابه‌جا می‌شوند. پنج انبار تدارکات را بسوزان، مسیرهایشان را بردار و پیش از بالا آمدن آب بیرون بزن.',
    'm23.name': 'استخوان‌دان', 'm23.desc': 'دیوارهای دخمه‌ها از استخوان پوشیده شده و آخرین نگهبان آن‌جا نگه داشته می‌شود. اسناد سردابه را بردار، هر دو هسته را بشکن و در تاریکی تمامش کن.',
    'm24.name': 'چشم طوفان', 'm24.desc': 'آخرین پژواک روی یک سکوی نفتی وسط طوفان رعد و برق پنهان شده. پایانه‌ها را بگیر، سوخت را غرق کن، عرشه را نگه دار و کار نگهبان را برای همیشه تمام کن.'
  });
})(window.BO);