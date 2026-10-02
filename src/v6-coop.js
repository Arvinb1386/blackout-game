/* =========================================================================
 * BLACKOUT :: v6-coop.js
 * Local co-op for two operators on one screen.
 *  - P1: keyboard + mouse (or the first gamepad when two are connected)
 *  - P2: a gamepad (see v6-gamepad.js), own flashlight, HUD panel and reticle
 *  - shared camera that frames both players and zooms out as they split up,
 *    with a soft leash so nobody walks off-screen
 *  - enemies pick the closest / most visible operator, bullets and blasts can
 *    hit either, doors / pickups / terminals / hazards work for both
 *  - a downed operator can be revived by holding USE next to them; the mission
 *    only fails when both are down. Extraction needs every standing operator.
 *  - three dedicated co-op operations + an option to play the campaign in co-op
 *
 * Implementation note: most core systems read `game.player`. Rather than
 * rewriting them, each system is wrapped and run "as" the relevant operator
 * via withPlayer(), which temporarily points game.player at P2.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const V6 = BO.V6;
  if (!V6) return;
  const CFG = BO.CONFIG;
  const C = BO.Collision;
  const P1_COLOR = '#ff8a1a', P2_COLOR = '#19c3dd';
  const REVIVE_TIME = 3, REVIVE_RANGE = 72;
  const ENEMY_HP_SCALE = 1.3, BOSS_HP_SCALE = 1.5;
  const ZOOM_MIN = 0.72;

  /* =============================== Missions ============================== */
  const COOP_MISSIONS = [
    {
      id: 'c1', coop: true, nameKey: 'c1.name', descKey: 'c1.desc', difficulty: 'hard', theme: 'blacksite', seed: 6061,
      size: [78, 56], roomCount: 14, propDensity: 1.1, barrels: 8, hazards: 4,
      enemies: { count: 30, types: { grunt: 0.34, rusher: 0.2, heavy: 0.14, sniper: 0.14, breacher: 0.1, shield: 0.08 } },
      diff: { hp: 1.2, damage: 1.05, accuracy: 1.02 },
      pickups: { health: 9, ammo: 10, armor: 6, credits: 8, power: 4 }, weaponPickups: ['shotgun', 'dmr', 'lmg'],
      objectives: [
        { type: 'activate', count: 4 },
        { type: 'survive', duration: 70, interval: 9, waveSize: 4, maxAlive: 12, types: ['grunt', 'grunt', 'rusher', 'breacher', 'heavy', 'sniper'] },
        { type: 'extract' }
      ],
      terminals: 4, rewards: { credits: 1800, xp: 1500 }, parTime: 600
    },
    {
      id: 'c2', coop: true, nameKey: 'c2.name', descKey: 'c2.desc', difficulty: 'extreme', theme: 'refinery', seed: 8118,
      size: [84, 60], roomCount: 15, propDensity: 1.15, barrels: 18, hazards: 6,
      enemies: { count: 34, types: { grunt: 0.26, rusher: 0.16, heavy: 0.14, grenadier: 0.14, drone: 0.12, sniper: 0.1, breacher: 0.08 } },
      diff: { hp: 1.45, damage: 1.2, accuracy: 1.1 },
      pickups: { health: 11, ammo: 12, armor: 7, credits: 10, power: 5 }, weaponPickups: ['kaveh', 'inferno', 'launcher'],
      objectives: [{ type: 'destroy', target: 'cache', count: 5 }, { type: 'eliminate' }, { type: 'extract' }],
      caches: 5, rewards: { credits: 2800, xp: 2400 }, parTime: 780
    },
    {
      id: 'c3', coop: true, nameKey: 'c3.name', descKey: 'c3.desc', difficulty: 'extreme', theme: 'reactor', seed: 4242,
      size: [88, 62], roomCount: 15, propDensity: 1.1, barrels: 10, hazards: 10,
      enemies: { count: 32, types: { grunt: 0.24, rusher: 0.16, heavy: 0.14, shield: 0.14, drone: 0.12, sniper: 0.1, breacher: 0.1 } },
      diff: { hp: 1.7, damage: 1.35, accuracy: 1.16 },
      pickups: { health: 13, ammo: 14, armor: 8, credits: 11, power: 6 }, weaponPickups: ['arc', 'plasma', 'railgun'],
      objectives: [{ type: 'collect', count: 3 }, { type: 'destroy', target: 'core', count: 2 }, { type: 'boss' }, { type: 'extract' }],
      intel: 3, cores: 2, boss: { mk2: true }, rewards: { credits: 4200, xp: 3800 }, parTime: 960
    }
  ];
  // Only keep weapon pickups that actually exist in this build.
  COOP_MISSIONS.forEach(m => { m.weaponPickups = m.weaponPickups.filter(id => BO.WEAPONS && BO.WEAPONS[id]); });
  BO.COOP_MISSIONS = COOP_MISSIONS;

  const MS = BO.MissionSystem;
  const coopIndex = (id) => COOP_MISSIONS.findIndex(m => m.id === id);
  const origById = MS.byId, origUnlocked = MS.isUnlocked, origAfter = MS.after;
  MS.byId = function (id) { return origById.call(this, id) || COOP_MISSIONS.find(m => m.id === id) || null; };
  MS.isUnlocked = function (id, save) {
    const i = coopIndex(id);
    if (i < 0) return origUnlocked.call(this, id, save);
    return i === 0 || save.completedMissions.indexOf(COOP_MISSIONS[i - 1].id) >= 0;
  };
  MS.after = function (id) {
    const i = coopIndex(id);
    if (i < 0) return origAfter.call(this, id);
    return COOP_MISSIONS[i + 1] || null;
  };

  /* ================================ Helpers ============================== */
  const isCoop = (g) => !!(g && g.coop && g.player2 && g.players);

  /** Runs fn with game.player temporarily pointing at `p`. */
  function withPlayer(g, p, fn) {
    if (!p || g.player === p) return fn();
    const prev = g.player;
    g.player = p;
    try { return fn(); } finally { g.player = prev; }
  }

  function freeSpot(g, x, y, r) {
    for (let ring = 1; ring <= 4; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * U.TAU + ring;
        const px = x + Math.cos(a) * r * ring, py = y + Math.sin(a) * r * ring;
        if (g.map.isCircleFree(px, py, CFG.PLAYER_RADIUS + 2) && C.lineOfSight(g.map, x, y, px, py, BO.COLLIDE.MOVE)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  const holdingUse = (g, p) => (p.isP2 ? !!(p.v6in && p.v6in.isDown('KeyE')) : g.input.isDown('KeyE'));

  /* ============================ Mission start ============================ */
  const G = BO.Game.prototype;

  const origStart = G.startMission;
  G.startMission = function (id) {
    const def = BO.MissionSystem.byId(id);
    const pads = V6.pads ? V6.pads.list().length : 0;
    const want = !!def && (!!def.coop || (V6.setting('coop') === true && pads > 0));
    this.coop = false; this.player2 = null; this.players = null;
    this._v6coopScale = want;
    let ok;
    try { ok = origStart.call(this, id); } finally { this._v6coopScale = false; }
    if (!ok) return ok;
    this.players = [this.player];
    if (!want) return ok;
    const p2 = new BO.Player(this.save.data);
    p2.isP2 = true;
    p2.v6in = BO.PadInput ? new BO.PadInput() : null;
    const spot = freeSpot(this, this.player.x, this.player.y, 40);
    p2.x = spot.x; p2.y = spot.y; p2.angle = 0;
    p2.v6revive = 0; this.player.v6revive = 0;
    this.player2 = p2;
    this.players = [this.player, p2];
    this.coop = true;
    if (this.boss) { this.boss.hp *= BOSS_HP_SCALE; this.boss.maxHp *= BOSS_HP_SCALE; }
    this.ui.schedule(1.2, () => this.ui.notify(BO.t('coop.start'), P2_COLOR, 4));
    if (!pads) this.ui.schedule(2, () => this.ui.notify(BO.t('coop.noPad'), '#ffd34d', 5));
    return ok;
  };

  const origSpawn = G.spawnEnemy;
  G.spawnEnemy = function () {
    const e = origSpawn.apply(this, arguments);
    if (e && (this._v6coopScale || isCoop(this))) { e.hp *= ENEMY_HP_SCALE; e.maxHp *= ENEMY_HP_SCALE; }
    return e;
  };

  /* ============================ Per-frame step =========================== */
  const origExposure = G._updateExposure;
  G._updateExposure = function (dt) {
    if (isCoop(this)) U.safe('coop.step', () => coopStep(this, dt));
    return origExposure.call(this, dt);
  };

  function coopStep(g, dt) {
    const p2 = g.player2;
    const playing = g.state === BO.Game.STATE.PLAYING;
    if (playing && p2.v6in) withPlayer(g, p2, () => p2.update(dt, p2.v6in, g));
    else if (p2.dead) p2.deathTimer += dt;
    if (!playing) return;
    updateRevive(g, dt);
    separatePlayers(g);
    leash(g);
  }

  const P = BO.Player.prototype;
  const origAim = P._updateAim;
  P._updateAim = function (game) {
    const inp = this.v6in;
    if (!this.isP2 || !inp) return origAim.call(this, game);
    if (inp.aimReq !== null && inp.aimReq !== undefined) this.angle = inp.aimReq;
    this.aimX = this.x + Math.cos(this.angle) * 260;
    this.aimY = this.y + Math.sin(this.angle) * 260;
  };

  function separatePlayers(g) {
    const a = g.players[0], b = g.players[1];
    if (a.dead || b.dead) return;
    const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-4) return;
    const d = Math.sqrt(d2), push = (min - d) / 2;
    C.moveCircle(g.map, a, -dx / d * push, -dy / d * push, a.r);
    C.moveCircle(g.map, b, dx / d * push, dy / d * push, b.r);
  }

  function leash(g) {
    const a = g.players[0], b = g.players[1], cam = g.camera;
    const base = cam.v6base || cam.targetZoom || 1;
    const minZ = base * ZOOM_MIN;
    const maxDX = Math.max(300, cam.viewW / minZ - 220), maxDY = Math.max(240, cam.viewH / minZ - 300);
    const dx = b.x - a.x, dy = b.y - a.y;
    const ox = Math.max(0, Math.abs(dx) - maxDX), oy = Math.max(0, Math.abs(dy) - maxDY);
    if (!ox && !oy) return;
    const sx = Math.sign(dx) * ox, sy = Math.sign(dy) * oy;
    if (a.dead && b.dead) return;
    if (a.dead) { C.moveCircle(g.map, b, -sx, -sy, b.r); return; }
    if (b.dead) { C.moveCircle(g.map, a, sx, sy, a.r); return; }
    C.moveCircle(g.map, a, sx / 2, sy / 2, a.r);
    C.moveCircle(g.map, b, -sx / 2, -sy / 2, b.r);
  }

  /* ============================ Down & revive ============================ */
  function updateRevive(g, dt) {
    g.players.forEach(d => {
      if (!d.v6downed) return;
      let helper = null;
      g.players.forEach(h => { if (h !== d && !h.dead && U.dist(h.x, h.y, d.x, d.y) < REVIVE_RANGE && holdingUse(g, h)) helper = h; });
      const before = d.v6revive || 0;
      d.v6revive = helper ? before + dt : Math.max(0, before - dt * 0.5);
      if (helper && Math.floor(before * 4) !== Math.floor(d.v6revive * 4)) g.audio.beep(520 + d.v6revive * 220, 0.04);
      if (d.v6revive >= REVIVE_TIME) revive(g, d);
    });
  }

  function revive(g, p) {
    p.dead = false; p.v6downed = false; p.v6revive = 0; p.deathTimer = 0;
    p.hp = Math.max(1, Math.round(p.maxHp * 0.4));
    p.iframes = 2; p.hurtFlash = 0;
    g.particles.pickupBurst(p.x, p.y, '#3ddc84');
    g.addLight(p.x, p.y, 220, '#3ddc84', 0.6, 1);
    g.audio.pickup('power');
    g.notify(BO.t('coop.revived', { n: BO.I18N.num(p.isP2 ? 2 : 1) }), '#3ddc84');
  }
  BO.V6.revive = revive;

  const origDeath = G.onPlayerDeath;
  G.onPlayerDeath = function () {
    if (!isCoop(this)) return origDeath.apply(this, arguments);
    let downed = null;
    this.players.forEach(p => { if (p.dead && !p.v6downed) { p.v6downed = true; p.v6revive = 0; downed = p; } });
    if (this.players.some(p => !p.dead)) {
      if (downed) {
        this.particles.deathEffect(downed.x, downed.y, downed.isP2 ? P2_COLOR : P1_COLOR);
        this.camera.addTrauma(0.45);
        this.ui.banner(BO.t('coop.down', { n: BO.I18N.num(downed.isP2 ? 2 : 1) }), BO.t('coop.downSub'), '#ff3355', 2.4);
      }
      return;
    }
    const prev = this.player;
    this.player = this.players[0];
    try { return origDeath.apply(this, arguments); } finally { this.player = prev; }
  };

  const origAllDone = G.onAllObjectivesComplete;
  G.onAllObjectivesComplete = function () {
    const res = origAllDone.apply(this, arguments);
    if (isCoop(this)) this.players.forEach(p => { p.iframes = 99; });
    return res;
  };

  /* ================================== AI ================================= */
  const AI = BO.AISystem.prototype;

  function pickFocus(g, e, time) {
    const cur = e.v6focus;
    if (cur && !cur.dead && time < (e.v6focusT || 0)) return cur;
    let best = null, bestS = Infinity;
    const view = (e.def && e.def.view) || 700;
    for (let i = 0; i < g.players.length; i++) {
      const p = g.players[i];
      if (p.dead) continue;
      const d = U.dist(e.x, e.y, p.x, p.y);
      const seen = d < view && C.lineOfSight(g.map, e.x, e.y, p.x, p.y, BO.COLLIDE.SIGHT);
      const s = d - (seen ? 600 : 0) - (p === cur ? 120 : 0);
      if (s < bestS) { bestS = s; best = p; }
    }
    e.v6focus = best || g.players[0];
    e.v6focusT = time + 0.7;
    return e.v6focus;
  }

  const origUE = AI._updateEnemy;
  AI._updateEnemy = function (e, dt) {
    const g = this.game;
    if (!isCoop(g) || e.dead) return origUE.call(this, e, dt);
    const f = pickFocus(g, e, this.time);
    return withPlayer(g, f, () => origUE.call(this, e, dt));
  };

  const origDamaged = AI.onEnemyDamaged;
  AI.onEnemyDamaged = function (e) {
    const g = this.game;
    if (isCoop(g) && e && !e.dead && g.player && !g.player.dead) { e.v6focus = g.player; e.v6focusT = this.time + 1.6; }
    return origDamaged.apply(this, arguments);
  };

  const origSep = AI._separate;
  AI._separate = function (list) {
    origSep.call(this, list);
    const g = this.game;
    if (isCoop(g) && !g.player2.dead) withPlayer(g, g.player2, () => origSep.call(this, list));
  };

  const BP = BO.Boss && BO.Boss.prototype;
  if (BP && BP.update) {
    const origBU = BP.update;
    BP.update = function (dt, game) {
      if (!isCoop(game)) return origBU.call(this, dt, game);
      const t = game.time;
      if (!this.v6focus || this.v6focus.dead || t > (this.v6focusT || 0)) {
        const alive = game.players.filter(p => !p.dead);
        alive.sort((a, b) => U.dist2(a.x, a.y, this.x, this.y) - U.dist2(b.x, b.y, this.x, this.y));
        this.v6focus = alive[0] || game.players[0];
        this.v6focusT = t + 2.5;
      }
      return withPlayer(game, this.v6focus, () => origBU.call(this, dt, game));
    };
  }

  /* =============================== Combat ================================ */
  const PS = BO.ProjectileSystem.prototype;
  const origStep = PS._step;
  PS._step = function (p, dt, game) {
    if (!isCoop(game) || p.owner === BO.PROJECTILE_OWNER.PLAYER) return origStep.call(this, p, dt, game);
    let stepLen = p.speed * dt;
    if (stepLen > p.rangeLeft) stepLen = p.rangeLeft;
    const ex = p.x + p.dirX * stepLen, ey = p.y + p.dirY * stepLen;
    let best = null, bestT = Infinity;
    for (let i = 0; i < game.players.length; i++) {
      const pl = game.players[i];
      if (pl.dead) continue;
      const t = U.segmentCircle(p.x, p.y, ex, ey, pl.x, pl.y, pl.r + (p.radius || 0));
      if (t >= 0 && t < bestT) { bestT = t; best = pl; }
    }
    if (!best) best = game.players.find(pl => !pl.dead) || game.player;
    return withPlayer(game, best, () => origStep.call(this, p, dt, game));
  };

  const origExplode = G.explode;
  G.explode = function (x, y, radius, damage, source) {
    const res = origExplode.apply(this, arguments);
    if (!isCoop(this)) return res;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p === this.player || p.dead) continue;
      const d = U.dist(p.x, p.y, x, y);
      if (d >= radius + p.r) continue;
      if (!C.lineOfSight(this.map, x, y, p.x, p.y, BO.COLLIDE.SIGHT)) continue;
      const k = 1 - U.clamp(d / (radius + p.r), 0, 1);
      withPlayer(this, p, () => {
        p.takeDamage(damage * (0.35 + 0.65 * k) * (source === 'player' ? 0.45 : 1), x, y, this);
        p.knock((p.x - x) / (d || 1) * 500 * k, (p.y - y) / (d || 1) * 500 * k);
      });
    }
    return res;
  };

  const origHit = G.onEnemyHitByBullet;
  G.onEnemyHitByBullet = function (e, p) {
    const src = p && p.source;
    if (isCoop(this) && src instanceof BO.Player && src !== this.player) {
      const args = arguments;
      return withPlayer(this, src, () => origHit.apply(this, args));
    }
    return origHit.apply(this, arguments);
  };

  const HZ = BO.HazardSystem.prototype;
  const origRect = HZ._damageRect;
  HZ._damageRect = function (z, dt, game) {
    const ticked = z.tick - dt <= 0;
    const res = origRect.apply(this, arguments);
    if (!ticked || !isCoop(game)) return res;
    const amount = z.dps * 0.25;
    game.players.forEach(p => {
      if (p === game.player || p.dead) return;
      if (p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h) withPlayer(game, p, () => p.takeDamage(amount, z.x + z.w / 2, z.y + z.h / 2, game));
    });
    return res;
  };

  /* ============================ World systems ============================ */
  const origVis = G._updateVisibility;
  G._updateVisibility = function () {
    if (!isCoop(this)) return origVis.call(this);
    origVis.call(this);
    const list = this.enemies;
    const seen = this._v6seen || (this._v6seen = []);
    seen.length = list.length;
    for (let i = 0; i < list.length; i++) seen[i] = list[i].visible;
    withPlayer(this, this.player2, () => origVis.call(this));
    for (let i = 0; i < list.length; i++) list[i].visible = list[i].visible || seen[i];
  };

  const origDoors = G._updateDoors;
  G._updateDoors = function (dt) {
    if (!isCoop(this)) return origDoors.call(this, dt);
    const n = this.enemies.length;
    this.players.forEach(p => { if (p !== this.player && !p.dead) this.enemies.push({ x: p.x, y: p.y, r: p.r, dead: false, isBoss: false }); });
    try { return origDoors.call(this, dt); } finally { this.enemies.length = n; }
  };

  const PU = BO.PickupSystem.prototype;
  const origPU = PU.update;
  PU.update = function (dt, game) {
    origPU.call(this, dt, game);
    if (!isCoop(game) || game.player2.dead) return;
    withPlayer(game, game.player2, () => origPU.call(this, 0, game));
  };

  const origInter = G._updateInteraction;
  G._updateInteraction = function (dt) {
    if (!isCoop(this)) return origInter.call(this, dt);
    const p2 = this.player2;
    origInter.call(this, dt);
    const it1 = this.interactable;
    let it2 = null;
    if (!p2.dead && p2.v6in) {
      const prevIn = this.input;
      this.input = p2.v6in;
      try { withPlayer(this, p2, () => origInter.call(this, dt)); } finally { this.input = prevIn; }
      it2 = this.interactable;
    }
    p2.v6interact = it2;
    this.interactable = it1;
    [[it1, this.input], [it2, p2.v6in]].forEach(pair => {
      const it = pair[0], inp = pair[1];
      if (it && it.kind === 'hack' && !it.target.activated && inp && inp.isDown('KeyE')) it.target.progress = Math.min(1, it.target.progress + dt * 0.15);
    });
  };

  const origArena = G._updateBossArena;
  G._updateBossArena = function () {
    if (!isCoop(this)) return origArena.call(this);
    const b = this.boss;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.dead || !b || b.mode !== 'dormant') continue;
      withPlayer(this, p, () => origArena.call(this));
      if (b.mode !== 'dormant') { pullIntoArena(this, p); break; }
    }
  };

  function pullIntoArena(g, trigger) {
    const a = g.level.arena;
    g.players.forEach(o => {
      if (o === trigger) return;
      const inside = a && o.x > a.x + CFG.TILE * 1.5 && o.x < a.x + a.w && o.y > a.y && o.y < a.y + a.h;
      if (inside) return;
      const s = freeSpot(g, trigger.x, trigger.y, 44);
      o.x = s.x; o.y = s.y; o.vx = 0; o.vy = 0;
      g.particles.pickupBurst(o.x, o.y, o.isP2 ? P2_COLOR : P1_COLOR);
    });
  }

  const OS = BO.ObjectiveSystem.prototype;
  const origOU = OS.update;
  OS.update = function (dt) {
    const g = this.game, s = this.current;
    if (!isCoop(g) || !s || s.done || s.type !== 'extract') return origOU.call(this, dt);
    const ex = g.level.extraction;
    const alive = g.players.filter(p => !p.dead);
    const inZone = (p) => U.dist(p.x, p.y, ex.x, ex.y) < CFG.EXTRACTION_RADIUS;
    const inside = alive.length > 0 && alive.every(inZone);
    s.extractTime = inside ? s.extractTime + dt : Math.max(0, s.extractTime - dt * 2);
    s.v6waiting = !inside && alive.some(inZone);
    if (s.extractTime >= CFG.EXTRACTION_TIME) this._complete(s);
  };

  /* ================================ Camera =============================== */
  const Cam = BO.Camera.prototype;
  const origVP = Cam.setViewport;
  Cam.setViewport = function (w, h) { origVP.call(this, w, h); this.v6base = this.targetZoom; };
  const mid = { x: 0, y: 0 };
  const origCam = Cam.update;
  Cam.update = function (dt, target, aimX, aimY, lookAhead) {
    const g = BO.game;
    if (g && this === g.camera && isCoop(g)) {
      const a = g.players[0], b = g.players[1];
      mid.x = (a.x + b.x) / 2; mid.y = (a.y + b.y) / 2;
      const base = this.v6base || this.targetZoom;
      const fit = Math.min(this.viewW / (Math.abs(a.x - b.x) + 440), this.viewH / (Math.abs(a.y - b.y) + 420));
      this.targetZoom = U.clamp(Math.min(base, fit), base * ZOOM_MIN, base);
      this._v6zoomed = true;
      return origCam.call(this, dt, mid, mid.x, mid.y, lookAhead);
    }
    if (this._v6zoomed) { this._v6zoomed = false; if (this.v6base) this.targetZoom = this.v6base; }
    return origCam.call(this, dt, target, aimX, aimY, lookAhead);
  };

  /* =============================== Rendering ============================= */
  const origPR = PS.render;
  PS.render = function (ctx, rect) {
    const g = BO.game;
    if (isCoop(g) && g.renderer && ctx === g.renderer.ctx) U.safe('coop.drawP2', () => drawOperators(ctx, g));
    return origPR.call(this, ctx, rect);
  };

  function drawOperators(ctx, g) {
    g.players.forEach((p, i) => {
      if (p.dead) return;
      ctx.strokeStyle = U.rgba(i ? P2_COLOR : P1_COLOR, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y + 2, p.r + 7, 0, U.TAU); ctx.stroke();
    });
    g.player2.draw(ctx, g.time);
  }

  const R = BO.Renderer.prototype;
  const origLight = R._renderLighting;
  R._renderLighting = function (game, time, rect) {
    if (!isCoop(game) || !game.map) return origLight.call(this, game, time, rect);
    const r = this;
    let done = false;
    const proxy = Object.create(game);
    Object.defineProperty(proxy, 'lights', {
      get() {
        if (!done) { done = true; U.safe('coop.light', () => carve(r, game, game.player2)); }
        return game.lights;
      }
    });
    return origLight.call(this, proxy, time, rect);
  };

  function carve(r, game, p) {
    const l = r.lctx, map = game.map, S = r.lightSprite;
    const ox = p.x, oy = p.y;
    const fr = CFG.FLASHLIGHT_RANGE, half = CFG.FLASHLIGHT_FOV / 2;
    const n1 = r._castPolygon(map, ox, oy, p.angle - half, p.angle + half, CFG.FLASHLIGHT_RAYS, fr, r.visPoly, 0);
    l.save();
    r._clipPoly(l, ox, oy, r.visPoly, 0, n1, true);
    l.clip();
    l.globalAlpha = p.dead ? 0.4 : 1;
    l.drawImage(S, ox - fr * 1.1, oy - fr * 1.1, fr * 2.2, fr * 2.2);
    l.drawImage(S, ox - fr * 0.6, oy - fr * 0.6, fr * 1.2, fr * 1.2);
    l.restore();
    const ar = CFG.AMBIENT_LIGHT_RADIUS;
    const n2 = r._castPolygon(map, ox, oy, 0, U.TAU, CFG.AMBIENT_RAYS, ar, r.visPoly, 0);
    l.save();
    r._clipPoly(l, ox, oy, r.visPoly, 0, n2, false);
    l.clip();
    l.globalAlpha = 0.9;
    l.drawImage(S, ox - ar, oy - ar, ar * 2, ar * 2);
    l.restore();
    l.globalAlpha = 1;
  }

  /* ================================== HUD ================================ */
  const UI = BO.UIManager.prototype;
  const I = BO.I18N;

  const origEnter = UI.enterGame;
  UI.enterGame = function (def) {
    origEnter.call(this, def);
    if (def && def.coop && this.intro) this.intro.idx = coopIndex(def.id) + 1;
  };

  const origFeed = UI.killFeed;
  UI.killFeed = function (actor) {
    const g = this.game;
    if (isCoop(g) && actor === BO.t('feed.you')) {
      const args = Array.prototype.slice.call(arguments);
      args[0] = g.player === g.player2 ? 'P2' : 'P1';
      return origFeed.apply(this, args);
    }
    return origFeed.apply(this, arguments);
  };

  const origHUD = UI.renderHUD;
  UI.renderHUD = function (ctx, game, time) {
    origHUD.call(this, ctx, game, time);
    if (!isCoop(game) || this.current === 'results' || this.current === 'death') return;
    ctx.save();
    ctx.setTransform(game.renderer.dpr, 0, 0, game.renderer.dpr, 0, 0);
    ctx.direction = I.isRTL() ? 'rtl' : 'ltr';
    U.safe('coop.hud', () => coopHUD(this, ctx, game, time));
    ctx.restore();
  };

  function promptText(it) {
    if (!it) return '';
    if (it.kind === 'hack') return it.target.progress > 0 ? BO.t('prompt.hacking') + ' ' + I.num(Math.round(it.target.progress * 100)) + I.digits('%') : BO.t('prompt.hack');
    if (it.kind === 'plant') return BO.t('prompt.plant');
    if (it.kind === 'swap') return BO.t('prompt.swap', { name: BO.t('w.' + it.target.weaponId) });
    return '';
  }

  function coopHUD(ui, ctx, g, time) {
    const w = g.renderer.w, h = g.renderer.h, cam = g.camera;
    const playing = g.state === BO.Game.STATE.PLAYING;
    const sx = (x) => cam.worldToScreenX(x), sy = (y) => cam.worldToScreenY(y);
    g.players.forEach((p, i) => {
      const col = i ? P2_COLOR : P1_COLOR;
      const x = sx(p.x), y = sy(p.y);
      const tagY = y - (p.r + 22) * cam.zoom - 4;
      ui._text(ctx, 'P' + I.num(i + 1), x, tagY, 12, col, 'center', 700, 'display');
      if (!p.v6downed) return;
      const k = (p.v6revive || 0) / REVIVE_TIME;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,51,85,' + (0.45 + Math.sin(time * 6) * 0.3) + ')';
      ctx.beginPath(); ctx.arc(x, y, 30, 0, U.TAU); ctx.stroke();
      if (k > 0) {
        ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + U.TAU * k); ctx.stroke();
      }
      ui._text(ctx, BO.t('coop.downTag'), x, tagY - 16, 12, '#ff3355', 'center', 700);
      const partner = g.players[1 - i];
      if (partner && !partner.dead && playing) ui._text(ctx, BO.t(partner.isP2 ? 'coop.reviveP2' : 'coop.reviveP1'), x, y + 46, 12, '#eef0f6', 'center', 600);
    });

    const p2 = g.player2;
    if (!p2.dead && playing) {
      const ax = sx(p2.x + Math.cos(p2.angle) * 150), ay = sy(p2.y + Math.sin(p2.angle) * 150);
      ctx.strokeStyle = 'rgba(5,6,14,0.8)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(ax, ay, 9, 0, U.TAU); ctx.stroke();
      ctx.strokeStyle = P2_COLOR; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ax, ay, 9, 0, U.TAU); ctx.stroke();
      ctx.fillStyle = P2_COLOR; ctx.fillRect(ax - 1.5, ay - 1.5, 3, 3);
      const txt = promptText(p2.v6interact);
      if (txt) ui._text(ctx, '(X) ' + txt, sx(p2.x), sy(p2.y) + 48, 13, '#eef0f6', 'center', 600);
    }

    p2Panel(ui, ctx, g, p2, h, time);

    const obj = g.objectives && g.objectives.current;
    if (obj && obj.type === 'extract' && obj.v6waiting && playing) ui._text(ctx, BO.t('coop.waitExtract'), w / 2, 128, 13, '#3ddc84', 'center', 700);
    if (playing && V6.pads && !V6.pads.p2Pad(g)) ui._text(ctx, BO.t('coop.noPad'), 152, h - 136, 12, '#ffd34d', 'center', 700);
  }

  function p2Panel(ui, ctx, g, p, h, time) {
    const x = 22, y = h - 118, pw = 260;
    ctx.fillStyle = 'rgba(8,9,18,0.72)'; ctx.fillRect(x, y, pw, 96);
    ctx.fillStyle = P2_COLOR; ctx.fillRect(x, y, 3, 96);
    const wpn = p.weapon;
    ui._text(ctx, 'P2', x + 16, y + 16, 15, P2_COLOR, 'left', 700, 'display');
    if (wpn) ui._text(ctx, BO.t('w.' + wpn.def.id), x + pw - 12, y + 16, 13, '#eef0f6', 'right', 700);
    if (p.v6downed) {
      ui._text(ctx, BO.t('coop.downTag'), x + pw / 2, y + 52, 22, Math.floor(time * 3) % 2 ? '#ff3355' : '#ff8095', 'center', 700, 'display');
      ui._bar(ctx, x + 16, y + 74, pw - 28, 6, (p.v6revive || 0) / REVIVE_TIME, '#3ddc84', 0);
      return;
    }
    const hpFrac = p.hp / p.maxHp;
    ui._bar(ctx, x + 16, y + 32, pw - 28, 9, hpFrac, hpFrac < 0.3 ? '#ff3355' : P2_COLOR, Math.round(p.maxHp / 25));
    ui._bar(ctx, x + 16, y + 46, pw - 28, 4, p.armor / p.maxArmor, '#7fe3ff', 0);
    ui._bar(ctx, x + 16, y + 54, (pw - 28) * 0.6, 3, p.stamina / CFG.STAMINA_MAX, '#c9ccd8', 0);
    ui._text(ctx, BO.t('hud.hp') + ' ' + I.num(Math.ceil(p.hp)), x + 16, y + 76, 13, hpFrac < 0.3 ? '#ff3355' : '#eef0f6', 'left', 700);
    if (wpn) {
      ctx.save();
      ctx.direction = 'ltr';
      ui._text(ctx, I.num(wpn.mag) + ' / ' + I.num(wpn.reserve), x + pw - 12, y + 76, 20, wpn.mag === 0 ? '#ff3355' : '#eef0f6', 'right', 700, 'display');
      ctx.restore();
      if (wpn.reloading) ui._bar(ctx, x + 100, y + 86, 60, 3, wpn.reloadProgress, P2_COLOR, 0);
    }
  }

  const frag = V6.frag;
  const menuNav = document.querySelector('[data-screen="menu"] .menu-nav');
  const playBtn = menuNav && menuNav.querySelector('[data-action="play"]');
  if (playBtn) playBtn.insertAdjacentElement('afterend', frag('<button class="nav" data-action="v6-coop" data-i18n="menu.coop"></button>'));
  const after = document.querySelector('[data-screen="missions"]');
  const screen = frag(
    '<section class="screen panel-screen" data-screen="coop">' +
      '<div class="panel wide">' +
        '<header class="panel-head"><h2 data-i18n="coop.title"></h2></header>' +
        '<div class="mission-list" id="coop-list"></div>' +
        '<footer class="panel-foot"><button class="btn" data-action="back" data-i18n="common.back"></button></footer>' +
      '</div>' +
    '</section>'
  );
  if (after) after.parentNode.insertBefore(screen, after.nextSibling);
  const list = document.getElementById('coop-list');
  COOP_MISSIONS.forEach(m => {
    const li = frag('<div class="mission-item"><div class="info"><h4 data-i18n="' + m.nameKey + '"></h4></div></div>');
    li.querySelector('.mission-item').appendChild(frag('<button class="btn play" data-action="mission" data-id="' + m.id + '" data-i18n="mission.play"></button>'));
    list.appendChild(li);
  });
  document.addEventListener('action:v6-coop', () => V6.showScreen('coop'));

}(window.BO));