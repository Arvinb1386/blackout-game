/* =========================================================================
 * BLACKOUT :: v11-tactics.js
 * Stealth + boss rework pack.
 *
 *  STEALTH
 *  - Hostiles judge how visible you are. Light (lit room / muzzle flash) and
 *    movement (still / walking / sprinting / rolling) feed a 0..1 visibility
 *    score that scales their sight range and how fast suspicion builds.
 *    Standing still in the dark makes you very hard to spot; sprinting or
 *    firing gives you away.
 *  - Engaged hostiles no longer have 360 degree vision through the whole
 *    fight. They keep tracking you for a short memory window after the last
 *    contact, then fall back to a (wider) vision cone and a shorter sight
 *    range, so breaking line of sight and relocating actually loses them.
 *  - Hostiles stop shooting as soon as they lose sight of you (no more
 *    bursts into the wall you're hiding behind) and need a short reaction
 *    time to re-acquire.
 *  - A spotter no longer alerts every ally in a circle through walls. Only
 *    allies that can see or hear the spotter react, and the ones that can't
 *    see you themselves move in to investigate instead of opening fire.
 *  - Sprinting makes footstep noise that nearby hostiles investigate.
 *
 *  BOSSES
 *  - Every boss fight gets its own variant (name, HP, attack pool per phase,
 *    arena hazards, minion types), escalating from the first to the last.
 *  - New boss attacks: spiral, cross, snipe, mines, blink.
 *  - Pacing: longer cooldowns between attacks, slower fan / stream / nova
 *    cadence and a VENT window after every few attacks (no firing, takes
 *    +30% damage).
 *  - Summons: phase 3 only, 1 minion per cast (2 on the finale), at most 2
 *    alive, 15 s between casts and a hard cap per fight.
 *
 * Drop-in pack: wraps prototypes like the other expansion packs.
 * Load order: after v10-power.js, before profiles.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U, CFG = BO.CONFIG;
  if (!U || !CFG || !BO.AISystem || !BO.Game || !BO.Boss || BO.Boss.v11) return;
  const TILE = CFG.TILE, S = BO.ENEMY_STATE, C = BO.Collision, MODE = BO.COLLIDE;
  const AI = BO.AISystem.prototype, G = BO.Game.prototype;
  const V8 = BO.V8;

  /* ============================== STEALTH ============================== */
  const CONF = {
    touchRange: 80,        // always noticed this close, whatever the facing
    trackMemory: 1.6,      // s an engaged hostile keeps 360 degree tracking after last contact
    engagedFov: 1.35,      // x vision cone for engaged hostiles that lost you
    still: 25,             // px/s under which you count as standing still
    moveStill: 0.45, moveWalk: 0.75, moveSprint: 1.15, moveDodge: 1,
    lightDark: 0.4, lightLit: 0.85, minVis: 0.12,
    awareMin: 0.25, awareMax: 1.1, extraDecay: 0.18,
    ceaseFire: 0.25,       // s without sight before a hostile stops shooting
    reacquire: 0.35,       // s reaction time before firing again after re-acquiring
    allyRadius: 460, shoutRange: 220,
    sprintNoise: 170, stepInterval: 0.4
  };

  function roomAt(g, x, y) {
    const m = g.map;
    if (!m || !m.roomId) return -1;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (m.inBounds && !m.inBounds(tx, ty)) return -1;
    const r = m.roomId[m.idx(tx, ty)];
    return r === undefined ? -1 : r;
  }

  /** 0..1: how easy the given player is to see right now. */
  function visibility(g, p) {
    if (!p) return 1;
    const exp = g.playerExposure || 0;
    const flashOn = p.flashlight !== false;
    const light = flashOn ? 1.0 : (exp >= 0.5 ? 1 : exp > 0 ? CONF.lightLit : CONF.lightDark);
    const sp = Math.hypot(p.vx || 0, p.vy || 0);
    let move = sp < CONF.still ? CONF.moveStill : p.sprinting ? CONF.moveSprint : CONF.moveWalk;
    if (p.isDodging) move = Math.max(move, CONF.moveDodge);
    if (exp >= 0.5 || flashOn) move = Math.max(move, 1); // flashlight or muzzle flash gives you away
    return U.clamp(light * move, CONF.minVis, 1);
  }

  // Perception: narrows what the base / v10 perception already accepted.
  const oldPerceive = AI._perceive;
  AI._perceive = function (e) {
    const g = this.game, p = g.player;
    const lx = e.lastKnownX, ly = e.lastKnownY, ls = e.lastSeenAt;
    const r = oldPerceive.apply(this, arguments);
    if (!e.canSee || !p || e.isBoss) return r;
    const vis = visibility(g, p);
    e.v11vis = vis;
    const d = U.dist(e.x, e.y, p.x, p.y);
    const ambientR = (BO.CONFIG && BO.CONFIG.AMBIENT_LIGHT_RADIUS) || 175;
    if (d <= ambientR + (e.r || 16)) return r;
    const recent = this.time - (ls || -99) < CONF.trackMemory;
    let range, fov;
    if (e.engaged) {
      range = e.def.view * (recent ? 1 : 0.6 + 0.4 * vis);
      fov = recent ? 0 : e.def.fov * CONF.engagedFov;
    } else {
      range = e.def.view * (0.5 + 0.5 * vis);
      fov = e.def.fov;
    }
    let ok = d <= range;
    if (ok && fov > 0) ok = Math.abs(U.angleDiff(e.angle, Math.atan2(p.y - e.y, p.x - e.x))) < fov / 2;
    if (ok) return r;
    e.canSee = false; e.clearShot = false;
    e.lastKnownX = lx; e.lastKnownY = ly; e.lastSeenAt = ls;
    return r;
  };

  // Suspicion builds slower when you're hard to see and fades faster once you vanish.
  const oldAware = AI._updateAwareness;
  AI._updateAwareness = function (e, dt) {
    const before = e.awareness;
    const r = oldAware.apply(this, arguments);
    if (e.engaged || e.isBoss) return r;
    if (e.canSee) {
      if (e.awareness > before) {
        const k = U.clamp(0.2 + (e.v11vis === undefined ? 1 : e.v11vis), CONF.awareMin, CONF.awareMax);
        e.awareness = Math.min(1, before + (e.awareness - before) * k);
      }
    } else {
      e.awareness = Math.max(0, e.awareness - CONF.extraDecay * dt);
    }
    return r;
  };

  // No more firing at a target they can't see.
  const oldBurst = AI._burstFire;
  AI._burstFire = function (e, dt) {
    if (!e.canSee && this.time - e.lastSeenAt > CONF.ceaseFire) {
      e.burstLeft = 0;
      e.fireTimer = Math.max(e.fireTimer, CONF.reacquire);
      return;
    }
    return oldBurst.apply(this, arguments);
  };

  const oldAttack = AI._attack;
  AI._attack = function (e, dt) {
    if (!e.canSee && !e.v10run && this.time - e.lastSeenAt > CONF.ceaseFire) {
      e.burstLeft = 0;
      if (e.sprayLeft > 0) { e.sprayLeft = 0; e.spin = 0; e.sprayCooldown = Math.max(e.sprayCooldown || 0, 0.6); }
      if (e.type !== 'sniper' && e.windup > 0 && !(e.lunge > 0)) e.windup = 0;
    }
    return oldAttack.apply(this, arguments);
  };

  // Ally alerts need line of sight or earshot; allies that can't see you investigate.
  AI._alertAllies = function (src) {
    const g = this.game, map = g.map, list = g.enemies, p = g.player;
    const R2 = CONF.allyRadius * CONF.allyRadius, H2 = CONF.shoutRange * CONF.shoutRange;
    const srcRoom = roomAt(g, src.x, src.y);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === src || o.dead || o.isBoss || o.engaged) continue;
      const d2 = U.dist2(o.x, o.y, src.x, src.y);
      if (d2 > R2) continue;
      const heard = d2 < H2 || (srcRoom >= 0 && roomAt(g, o.x, o.y) === srcRoom) || C.lineOfSight(map, o.x, o.y, src.x, src.y, MODE.SIGHT);
      if (!heard) continue;
      o.lastKnownX = src.lastKnownX; o.lastKnownY = src.lastKnownY;
      const seesYou = p && !p.dead && U.dist(o.x, o.y, p.x, p.y) < o.def.view && C.lineOfSight(map, o.x, o.y, p.x, p.y, MODE.SIGHT);
      if (seesYou) {
        o.lastSeenAt = this.time - 0.5;
        o.awareness = 1;
        o.setState(S.CHASE);
      } else {
        o.awareness = Math.max(o.awareness, 0.75);
        o.setState(S.INVESTIGATE);
        o.moveTargetX = src.lastKnownX + U.randSpread() * 70;
        o.moveTargetY = src.lastKnownY + U.randSpread() * 70;
        o.hasMoveTarget = true;
      }
    }
  };

  function playersOf(g) {
    if (V8 && V8.players) { try { return V8.players(g) || [g.player]; } catch (err) { return [g.player]; } }
    return [g.player];
  }

  function footsteps(g, dt) {
    if (!g.ai || !g.player) return;
    if (V8 && V8.playing && !V8.playing(g)) return;
    playersOf(g).forEach(p => {
      if (!p || p.dead) return;
      p.v11step = (p.v11step || 0) - dt;
      if (!p.sprinting || Math.hypot(p.vx || 0, p.vy || 0) < 60 || p.v11step > 0) return;
      p.v11step = CONF.stepInterval;
      g.ai.onNoise(p.x, p.y, CONF.sprintNoise, true);
    });
  }

  /* =============================== BOSSES ============================== */
  const Base = BO.Boss;
  const BASE_HP = 6500;
  const VENT_BONUS = 1.3;
  const TELE = { fan: 0.6, stream: 0.45, mortar: 0.5, summon: 0.9, nova: 0.95, charge: 0.85, spiral: 0.65, cross: 0.7, snipe: 0.9, mines: 0.7, blink: 0.75 };
  const BASE_ATTACKS = { fan: 1, stream: 1, mortar: 1, summon: 1, nova: 1, charge: 1 };
  const SUMMON = { phase: 3, maxAlive: 2, perCast: 1, cooldown: 15, total: 4 };
  const DEFAULTS = { hp: 1, tempest: false, cooldown: [0, 1.9, 1.6, 1.35], chain: [0, 2, 3, 3], vent: 2.2, fields: 3, minions: ['grunt', 'rusher'] };

  // One variant per boss fight, in campaign order. Pools are per phase (index 1..3).
  const VARIANTS = {
    m3:  { name: 'warden', hp: 1.35, fields: 2, vent: 1.5, cooldown: [0, 1.4, 1.1, 0.85], chain: [0, 3, 3, 4], minions: ['grunt', 'shield', 'rusher'], summon: { maxAlive: 2, total: 6, perCast: 2 },
           pools: [null, ['fan', 'searchlight', 'stream'], ['fan', 'searchlight', 'mortar', 'snipe', 'stream'], ['searchlight', 'spiral', 'mortar', 'charge', 'nova', 'summon']] },
    m5:  { name: 'iron', hp: 1, fields: 0, vent: 2.4, cooldown: [0, 2, 1.7, 1.45], minions: ['rusher'],
           pools: [null, ['charge', 'fan'], ['charge', 'mortar', 'fan'], ['charge', 'nova', 'charge', 'summon']] },
    m8:  { name: 'siege', hp: 1.05, fields: 3, minions: ['grenadier', 'grunt'],
           pools: [null, ['mortar', 'fan'], ['mortar', 'mines', 'stream'], ['mortar', 'mines', 'nova', 'summon']] },
    m10: { name: 'vortex', hp: 1.15, fields: 0, minions: ['drone', 'grunt'],
           pools: [null, ['spiral', 'fan'], ['spiral', 'cross', 'stream'], ['spiral', 'cross', 'nova', 'summon']] },
    m13: { name: 'hunter', hp: 1.2, fields: 0, minions: ['rusher', 'grunt'],
           pools: [null, ['snipe', 'fan'], ['snipe', 'blink', 'stream'], ['blink', 'snipe', 'charge', 'summon']] },
    m14: { name: 'prime', hp: 1.3, fields: 3, cooldown: [0, 1.8, 1.5, 1.3], minions: ['grunt', 'shield'],
           pools: [null, ['fan', 'stream', 'snipe'], ['mortar', 'cross', 'charge'], ['nova', 'blink', 'spiral', 'summon']] },
    m18: { name: 'forge', hp: 1.3, fields: 2, cooldown: [0, 1.8, 1.5, 1.3], minions: ['breacher', 'grunt'],
           pools: [null, ['mines', 'fan'], ['mines', 'charge', 'mortar'], ['charge', 'mines', 'nova', 'summon']] },
    m23: { name: 'wraith', hp: 1.4, fields: 0, cooldown: [0, 1.7, 1.45, 1.25], minions: ['rusher'],
           pools: [null, ['blink', 'fan'], ['blink', 'spiral', 'snipe'], ['blink', 'spiral', 'cross', 'summon']] },
    m24: { name: 'tempest', hp: 1.5, tempest: true, fields: 3, vent: 2, cooldown: [0, 1.7, 1.45, 1.25], chain: [0, 3, 3, 4],
           minions: ['grunt', 'rusher', 'shield'], summon: { perCast: 2, total: 6 },
           pools: [null, ['fan', 'stream', 'snipe', 'spiral'], ['mortar', 'cross', 'charge', 'blink', 'mines'], ['nova', 'spiral', 'charge', 'blink', 'snipe', 'summon']] },
    c3:  { name: 'twin', hp: 1.3, fields: 3, minions: ['grunt', 'rusher'],
           pools: [null, ['fan', 'cross'], ['cross', 'mortar', 'stream'], ['cross', 'nova', 'charge', 'summon']] },
    m19: { name: 'twin', hp: 1.35, fields: 3, minions: ['grunt', 'rusher', 'drone'],
           pools: [null, ['fan', 'cross'], ['cross', 'mortar', 'stream'], ['cross', 'nova', 'charge', 'summon']] }
  };

  function resolve(v) {
    const o = Object.assign({}, DEFAULTS, v);
    o.summon = Object.assign({}, SUMMON, v.summon || {});
    const types = BO.ENEMY_TYPES || {};
    o.minions = (o.minions || []).filter(t => types[t]);
    if (!o.minions.length) o.minions = ['grunt'];
    return o;
  }

  function withBossName(boss, fn) {
    if (!boss || !boss.v11 || typeof BO.t !== 'function') return fn();
    const t0 = BO.t, key = 'boss.v11.' + boss.v11.name;
    BO.t = function (k) {
      if (k === 'note.bossName' || k === 'note.bossNameMk2') return t0.call(this, key);
      return t0.apply(this, arguments);
    };
    try { return fn(); } finally { BO.t = t0; }
  }

  class VariantBoss extends Base {
    constructor(x, y, arena, mk2) {
      super(x, y, arena, mk2);
      const g = BO.game, id = g && g.mission && g.mission.id;
      const key = VARIANTS[id] ? id : (mk2 ? 'm14' : 'm8');
      this.v11id = key;
      this.v11 = resolve(VARIANTS[key]);
      // mk2 drives the v8 storm overlay; keep that for the finale only so every fight feels different.
      this.mk2 = !!this.v11.tempest;
      this.maxHp = Math.round(BASE_HP * this.v11.hp);
      this.hp = this.maxHp;
      this.cooldown = 2.2;
      this.v11chain = 0; this.v11vent = 0; this.v11ventTold = false;
      this.v11summoned = 0; this.v11lastSummon = -99;
    }

    update(dt, game) {
      const r = super.update(dt, game);
      // Variants with early arena hazards (the base only runs them in phase 3).
      if (this.v11.fields === 2 && this.phase === 2 && this.mode === 'fight' && !this.dead && !(this.stun > 0)) this._updateArenaFields(dt, game);
      return r;
    }

    takeDamage(amount, kx, ky) {
      const bonus = this.v11vent > 0 && !this.invulnerable ? VENT_BONUS : 1;
      return super.takeDamage(amount * bonus, kx, ky);
    }

    _updateArenaFields(dt, game) {
      const f = this.v11.fields;
      if (!f || this.phase < f) return;
      return super._updateArenaFields(dt, game);
    }

    _v11canSummon(game) {
      const s = this.v11.summon;
      return this.phase >= s.phase && this._aliveMinions() < s.maxAlive && this.v11summoned < s.total &&
        game.time - this.v11lastSummon >= s.cooldown;
    }

    _v11pick(game) {
      const pool = this.v11.pools[this.phase] || this.v11.pools[3] || ['fan'];
      let name = U.pick(pool);
      for (let i = 0; i < 3 && name === this.lastAttack && pool.length > 1; i++) name = U.pick(pool);
      if (name === 'summon' && !this._v11canSummon(game)) {
        const alt = pool.filter(n => n !== 'summon');
        name = alt.length ? U.pick(alt) : 'fan';
      }
      return name;
    }

    _v11blinkTarget(atk, game, p) {
      const a = this.arena, m = TILE * 2.5;
      if (!a) return false;
      for (let i = 0; i < 10; i++) {
        const x = U.rand(a.x + m, a.x + a.w - m), y = U.rand(a.y + m, a.y + a.h - m);
        if (U.dist(x, y, p.x, p.y) < 260) continue;
        if (game.map.isCircleFree && !game.map.isCircleFree(x, y, this.r)) continue;
        atk.bx = x; atk.by = y;
        return true;
      }
      return false;
    }

    _updateAttacks(dt, game, p) {
      if (this.v11vent > 0) {
        if (!this.v11ventTold) { this.v11ventTold = true; if (game.ui && game.ui.notify) game.ui.notify(BO.t('boss.v11.vent'), '#7fe3ff', 2); }
        this.v11vent -= dt;
        if (game.particles && game.particles.smoke && Math.random() < dt * 8) game.particles.smoke(this.x + U.randSpread() * this.r, this.y + U.randSpread() * this.r, 1, '#5a5f70', 40);
        return;
      }
      if (!this.attack) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return;
        const name = this._v11pick(game);
        this.lastAttack = name;
        const atk = this.attack = { name, stage: 'tele', t: 0, shots: 0, timer: 0, aim: Math.atan2(p.y - this.y, p.x - this.x), spin: this.ringSpin };
        if (name === 'blink' && !this._v11blinkTarget(atk, game, p)) atk.name = 'fan';
        game.audio.telegraph();
        return;
      }
      const atk = this.attack;
      atk.t += dt;
      if (atk.stage === 'tele') {
        const want = Math.atan2(p.y - this.y, p.x - this.x);
        if (atk.name === 'fan' || atk.name === 'cross') atk.aim = U.turnTowards(atk.aim, want, dt * 3);
        else if (atk.name === 'charge') { if (atk.t < TELE.charge * 0.6) atk.aim = U.turnTowards(atk.aim, want, dt * 3); this.angle = atk.aim; }
        else if (atk.name === 'snipe') { if (atk.t < TELE.snipe - 0.25) atk.aim = U.turnTowards(atk.aim, want, dt * 3); this.angle = atk.aim; }
        if (atk.t >= TELE[atk.name]) { atk.stage = 'run'; atk.t = 0; this._beginAttack(atk, game, p); }
        return;
      }
      switch (atk.name) {
        case 'fan': this._runFan(atk, dt, game, p); break;
        case 'stream': this._runStream(atk, dt, game, p); break;
        case 'nova': this._runNova(atk, dt, game); break;
        case 'charge': this._runCharge(atk, dt, game, p); break;
        case 'spiral': this._runSpiral(atk, dt, game); break;
        case 'cross': this._runCross(atk, dt, game); break;
        case 'snipe': this._runSnipe(atk, dt, game, p); break;
        case 'blink': this._runBlink(atk, dt, game, p); break;
        default: if (atk.t > 0.6) this._endAttack();
      }
    }

    _beginAttack(atk, game, p) {
      if (atk.name === 'summon') {
        const v = this.v11, s = v.summon;
        const n = Math.max(0, Math.min(s.perCast, s.maxAlive - this._aliveMinions(), s.total - this.v11summoned));
        for (let i = 0; i < n; i++) {
          const m = game.spawnBossMinion(U.pick(v.minions), this);
          if (m) { this.minions.push(m); this.v11summoned++; }
        }
        this.v11lastSummon = game.time;
        return;
      }
      if (atk.name === 'mines') {
        const n = this.phase === 3 ? 8 : 6;
        for (let i = 0; i < n; i++) {
          const a = i / n * U.TAU + U.randSpread() * 0.3, r = U.rand(130, 280);
          game.hazards.addStrike(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r, 70, 1.3 + i * 0.08, 24);
        }
        game.hazards.addStrike(p.x, p.y, 80, 1.6, 26);
        return;
      }
      if (atk.name === 'spiral') { atk.spin = this.ringSpin; return; }
      if (atk.name === 'snipe') { atk.timer = 0; return; }
      if (atk.name === 'cross' || atk.name === 'blink') return;
      return super._beginAttack(atk, game, p);
    }

    _endAttack() {
      this.attack = null;
      const v = this.v11;
      this.cooldown = (v.cooldown[this.phase] || 1.5) * U.rand(0.9, 1.15);
      this.v11chain++;
      if (this.v11chain >= (v.chain[this.phase] || 3)) { this.v11chain = 0; this.v11vent = v.vent; }
    }

    _runFan(atk, dt, game) {
      atk.timer -= dt;
      if (atk.timer > 0) return;
      const volleys = this.phase === 3 ? 3 : 2;
      const count = this.phase === 1 ? 7 : 9;
      const spreadA = 1.15;
      const speed = 400 + this.phase * 40;
      for (let i = 0; i < count; i++) {
        const a = atk.aim - spreadA / 2 + spreadA * (i / (count - 1)) + (atk.shots % 2 ? spreadA / (count - 1) / 2 : 0);
        this._orb(game, a, speed, 12);
      }
      game.onBossFired(this);
      atk.shots++;
      atk.timer = 0.5;
      if (atk.shots >= volleys) this._endAttack();
    }

    _runStream(atk, dt, game, p) {
      atk.aim = U.turnTowards(atk.aim, Math.atan2(p.y - this.y, p.x - this.x), dt * (1.1 + this.phase * 0.3));
      this.angle = atk.aim;
      atk.timer -= dt;
      if (atk.timer > 0) return;
      const perBurst = 5, bursts = this.phase === 3 ? 3 : 2;
      this._orb(game, atk.aim + U.randSpread() * 0.06, 540, 8, '#ff6b81');
      atk.shots++;
      if (atk.shots % 3 === 1) game.onBossFired(this);
      if (atk.shots >= perBurst * bursts) { this._endAttack(); return; }
      atk.timer = atk.shots % perBurst === 0 ? 0.55 : 1 / 9;
    }

    _runNova(atk, dt, game) {
      atk.timer -= dt;
      if (atk.timer > 0) return;
      const count = 24;
      const offset = atk.shots * (Math.PI / count) + this.ringSpin;
      for (let i = 0; i < count; i++) this._orb(game, offset + i / count * U.TAU, 290, 14, '#ffd0d8');
      game.onBossFired(this, true);
      atk.shots++;
      atk.timer = 0.65;
      if (atk.shots >= (this.phase === 3 ? 3 : 2)) this._endAttack();
    }

    _runSpiral(atk, dt, game) {
      const arms = this.phase === 3 ? 3 : 2;
      atk.timer -= dt;
      if (atk.timer <= 0) {
        atk.timer = 0.13;
        for (let k = 0; k < arms; k++) this._orb(game, atk.spin + k * U.TAU / arms, 290, 9, '#ffb36b');
        atk.spin += 0.34;
        if (atk.shots++ % 4 === 0) game.onBossFired(this);
      }
      if (atk.t > 1.5) this._endAttack();
    }

    _runCross(atk, dt, game) {
      atk.timer -= dt;
      if (atk.timer > 0) return;
      for (let k = 0; k < 4; k++) {
        const a = atk.aim + k * Math.PI / 2;
        this._orb(game, a, 330, 11, '#b07cff');
        this._orb(game, a, 420, 11, '#b07cff');
      }
      game.onBossFired(this);
      atk.aim += 0.39;
      atk.shots++;
      atk.timer = 0.55;
      if (atk.shots >= (this.phase === 3 ? 4 : 3)) this._endAttack();
    }

    _runSnipe(atk, dt, game, p) {
      atk.timer -= dt;
      if (atk.timer > 0.25) atk.aim = U.turnTowards(atk.aim, Math.atan2(p.y - this.y, p.x - this.x), dt * 2.6);
      this.angle = atk.aim;
      if (atk.timer > 0) return;
      this._orb(game, atk.aim, 950, 20, '#7fe3ff');
      game.onBossFired(this);
      atk.shots++;
      if (atk.shots >= (this.phase === 3 ? 3 : 2)) { this._endAttack(); return; }
      atk.timer = 0.85;
    }

    _runBlink(atk, dt, game, p) {
      if (!atk.moved) {
        atk.moved = true;
        if (game.particles && game.particles.pickupBurst) game.particles.pickupBurst(this.x, this.y, '#b07cff');
        this.x = atk.bx; this.y = atk.by;
        this.vx = 0; this.vy = 0; this.moveX = this.x; this.moveY = this.y;
        if (game.particles && game.particles.pickupBurst) game.particles.pickupBurst(this.x, this.y, '#b07cff');
        game.addLight(this.x, this.y, 300, '#b07cff', 0.4, 0.9);
        atk.timer = 0.35;
        return;
      }
      atk.timer -= dt;
      if (atk.timer > 0) return;
      const aim = Math.atan2(p.y - this.y, p.x - this.x);
      for (let i = 0; i < 5; i++) this._orb(game, aim - 0.35 + 0.7 * (i / 4), 420, 11, '#b07cff');
      game.onBossFired(this);
      this._endAttack();
    }

    drawOverlay(ctx, time, game) {
      super.drawOverlay(ctx, time, game);
      if (this.dead) return;
      const r = this.r, atk = this.attack;
      ctx.save();
      if (this.v11vent > 0) {
        ctx.strokeStyle = U.rgba('#7fe3ff', 0.35 + Math.sin(time * 10) * 0.2);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 18, 0, U.TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (atk && !BASE_ATTACKS[atk.name]) {
        const k = atk.stage === 'tele' ? U.clamp(atk.t / TELE[atk.name], 0, 1) : 1;
        ctx.lineWidth = 2;
        if (atk.name === 'snipe' && (atk.stage === 'tele' || atk.timer > 0)) {
          ctx.strokeStyle = U.rgba('#7fe3ff', atk.stage === 'tele' ? 0.2 + k * 0.6 : 0.55);
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(atk.aim) * 1100, this.y + Math.sin(atk.aim) * 1100); ctx.stroke();
        } else if (atk.stage === 'tele') {
          if (atk.name === 'cross') {
            ctx.strokeStyle = U.rgba('#b07cff', 0.25 + k * 0.5);
            for (let i = 0; i < 4; i++) {
              const a = atk.aim + i * Math.PI / 2;
              ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(a) * 380, this.y + Math.sin(a) * 380); ctx.stroke();
            }
          } else if (atk.name === 'spiral') {
            ctx.strokeStyle = U.rgba('#ffb36b', 0.3 + k * 0.5);
            ctx.lineWidth = 3;
            for (let i = 0; i < 3; i++) {
              const a = this.ringSpin * 2 + i * U.TAU / 3;
              ctx.beginPath(); ctx.arc(this.x, this.y, r + 16 + k * 30, a, a + 1.1); ctx.stroke();
            }
          } else if (atk.name === 'mines') {
            ctx.strokeStyle = U.rgba('#ff8a1a', 0.3 + k * 0.5);
            ctx.setLineDash([8, 8]);
            ctx.beginPath(); ctx.arc(this.x, this.y, 130 + 150 * k, 0, U.TAU); ctx.stroke();
            ctx.setLineDash([]);
          } else if (atk.name === 'blink' && atk.bx !== undefined) {
            ctx.strokeStyle = U.rgba('#b07cff', 0.35 + k * 0.55);
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(atk.bx, atk.by, r * (1.6 - 0.6 * k), 0, U.TAU); ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }
  VariantBoss.v11 = true;
  BO.Boss = VariantBoss;
  BO.BossBase = Base;

  /* ============================ Game hooks ============================= */
  ['onBossIntro', 'onBossPhase'].forEach(k => {
    const old = G[k];
    if (!old) return;
    G[k] = function (boss) { return withBossName(boss, () => old.apply(this, arguments)); };
  });
  const oldSeq = G._updateBossSequence;
  G._updateBossSequence = function () {
    const seq = this.bossSequence;
    return withBossName(seq && seq.boss, () => oldSeq.apply(this, arguments));
  };
  const oldRender = G._render;
  G._render = function () { return withBossName(this.boss, () => oldRender.apply(this, arguments)); };

  const oldUpdate = G._update;
  G._update = function (dt) {
    oldUpdate.apply(this, arguments);
    if (!this.player) return;
    const d = dt * (this.timeScale || 1);
    U.safe('v11.footsteps', () => footsteps(this, d));
  };

  /* ============================== Strings ============================== */
  BO.I18N.extend('en', {
    'boss.v11.warden': 'THE WARDEN', 'boss.v11.iron': 'IRON WARDEN', 'boss.v11.siege': 'SIEGE WARDEN',
    'boss.v11.vortex': 'VORTEX WARDEN', 'boss.v11.hunter': 'HUNTER WARDEN', 'boss.v11.prime': 'WARDEN PRIME',
    'boss.v11.forge': 'FORGE TITAN', 'boss.v11.wraith': 'OSSUARY WRAITH', 'boss.v11.tempest': 'TEMPEST WARDEN',
    'boss.v11.twin': 'TWIN-CORE WARDEN',
    'boss.v11.vent': 'BOSS IS VENTING // HIT IT NOW'
  });
  BO.I18N.extend('fa', {
    'boss.v11.warden': 'نگهبان', 'boss.v11.iron': 'نگهبان آهنین', 'boss.v11.siege': 'نگهبان محاصره',
    'boss.v11.vortex': 'نگهبان گرداب', 'boss.v11.hunter': 'نگهبان شکارچی', 'boss.v11.prime': 'نگهبان اعظم',
    'boss.v11.forge': 'غول کوره', 'boss.v11.wraith': 'شبح استخوان‌دان', 'boss.v11.tempest': 'نگهبان طوفان',
    'boss.v11.twin': 'نگهبان دوهسته',
    'boss.v11.vent': 'باس در حال تخلیه حرارت است // الان بزنش'
  });

  BO.V11 = { CONF, VARIANTS, visibility };
})(window.BO);
