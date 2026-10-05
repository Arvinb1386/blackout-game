/* =========================================================================
 * BLACKOUT :: v10-power.js
 * Power grid expansion: wall-mounted circuit breakers and alarm panels.
 *
 *  - EVERY room gets a CIRCUIT BREAKER (v13). Flip it with USE ([E] / X) to
 *    kill the room's lights. Every hostile inside is blinded and disoriented
 *    for a few seconds (stumbling, no shooting, loses track of you), then stays
 *    half-blind while the room is dark: short sight range, wild aim.
 *    Flip it again to restore power. Rooms that start without power now have a
 *    breaker too: flip it ON to light the room up.
 *  - Some rooms get an ALARM PANEL. A hostile that spots you may sprint to the
 *    nearest panel instead of fighting. If it finishes the hold, the alarm
 *    sounds for that SECTOR only: the panel's room plus every room within
 *    CONF.zoneRange of it. Red emergency lights override blackouts inside the
 *    zone, hostiles inside the zone converge on you and reinforcements arrive
 *    near the panel. The rest of the facility is not notified. Kill the runner
 *    first, or hold USE at any panel to silence the alarm early.
 *
 * Drop-in pack: wraps prototypes like the other expansion packs.
 * Load order: after v8-blackout.js and v9-skills.js, before profiles.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U, CFG = BO.CONFIG, V8 = BO.V8;
  if (!U || !CFG || !BO.Game || !BO.AISystem || !BO.Renderer || !V8) return;
  const TILE = CFG.TILE, T = BO.TILE_TYPE, S = BO.ENEMY_STATE;
  // v13 fix: maybeRun() used an undeclared `C`, which threw a ReferenceError on
  // every spot and silently disabled alarm runners.
  const C = BO.Collision;
  const G = BO.Game.prototype, AI = BO.AISystem.prototype, R = BO.Renderer.prototype;

  /* ------------------------------ Tuning ------------------------------ */
  const CONF = {
    breakerEveryRoom: true,    // v13: one breaker per room (start, extraction and arena included)
    breakerChance: 0.5, minBreakers: 2, maxBreakers: 6,   // only used when breakerEveryRoom is false
    alarmChance: 0.35, minAlarms: 1, maxAlarms: 4,
    useRange: 62, flipCooldown: 0.8, flipNoise: 200,
    daze: [3.5, 5.5],          // seconds of disorientation right after the cut
    darkSight: 140,            // how far a hostile in a dark room can see you
    darkSightLitRoom: 0.4,     // x view range when you stand in a lit room
    darkSightFiring: 0.6,      // x view range right after you fire (muzzle flash)
    darkSpread: 2.2,           // aim spread multiplier when firing from the dark
    runChance: 0.6, runRange: 1100, runHold: 1.3, runGiveUp: 12,
    alarmTime: 35,
    zoneRange: 620,            // rooms whose edge is this close to the panel join the alarm zone
    reinforceRange: 1500,      // reinforcements only spawn this close to the tripped panel
    reinforcements: 2, maxReinforcements: 4, silenceTime: 1.5
  };
  const NO_RUN = { heavy: 1, rusher: 1 }; // heavies are too slow, rushers just charge

  /* ------------------------------ Helpers ----------------------------- */
  const st = g => (g && g.v10) || null;
  function roomAt(g, x, y) {
    const m = g.map;
    if (!m) return -1;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!m.inBounds(tx, ty)) return -1;
    return m.roomId[m.idx(tx, ty)];
  }
  /** True while the alarm is up and this room is inside the alarm zone. */
  function zoned(s, room) { return !!s && s.alarm > 0 && room >= 0 && !!s.zone[room]; }
  /** A room is "dark" when its breaker is off and the zone's emergency lights are not overriding it. */
  function dark(g, room) { const s = st(g); return !!s && room >= 0 && !!s.off[room] && !zoned(s, room); }
  /** Pushes breaker/alarm state into level.roomLit, which drives exposure + enemy visibility. */
  function applyLit(g) {
    const s = st(g), lit = g.level && g.level.roomLit;
    if (!s || !lit) return;
    for (let i = 0; i < lit.length; i++) lit[i] = zoned(s, i) ? 1 : (s.off[i] ? 0 : s.base[i]);
  }
  /** True when a point is inside the active alarm zone (corridors count when close to the panel). */
  function inZone(g, x, y) {
    const s = st(g);
    if (!s || s.alarm <= 0 || !s.zonePanel) return false;
    const room = roomAt(g, x, y);
    if (room >= 0) return !!s.zone[room];
    return U.dist(x, y, s.zonePanel.ax, s.zonePanel.ay) <= CONF.zoneRange;
  }
  /** The panel's own room plus every room whose edge is within CONF.zoneRange of the panel. */
  function buildZone(g, panel) {
    const s = st(g);
    s.zone.fill(0);
    s.zonePanel = panel;
    g.level.rooms.forEach(r => {
      if (r.tag === 'arena') return;
      const nx = U.clamp(panel.ax, r.x * TILE, (r.x + r.w) * TILE), ny = U.clamp(panel.ay, r.y * TILE, (r.y + r.h) * TILE);
      if (r.index === panel.room || U.dist(panel.ax, panel.ay, nx, ny) <= CONF.zoneRange) s.zone[r.index] = 1;
    });
  }
  function clearZone(s) { s.zone.fill(0); s.zonePanel = null; }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function bark(e, key, prio) {
    const V = BO.Voice;
    if (!e || !V || !V.bark || !V.LINES || !V.LINES[key]) return false;
    try { V.bark(e, key, prio); return true; } catch (err) { return false; }
  }
  function sfx(g, kind, x, y) {
    const a = g.audio;
    if (!a) return;
    try {
      if (!a._ready || !a._ready() || !a.tone) { if (a.beep) a.beep(kind === 'siren' ? 720 : 320, 0.08); return; }
      const t = a.ctx.currentTime, o = (a._v && x !== undefined) ? a._v(x, y, 0.3, 0.12, 0.15) : null;
      if (kind === 'off') {
        if (a.noise) a.noise({ when: t, brown: true, dur: 0.12, filter: 'lowpass', freq: 900, freqEnd: 200, vol: 0.9, out: o });
        a.tone({ when: t, type: 'sawtooth', freq: 120, freqEnd: 38, dur: 0.7, vol: 0.12, out: o });
      } else if (kind === 'on') {
        if (a.noise) a.noise({ when: t, brown: true, dur: 0.1, filter: 'lowpass', freq: 1200, freqEnd: 300, vol: 0.8, out: o });
        a.tone({ when: t, type: 'sawtooth', freq: 45, freqEnd: 120, dur: 0.5, vol: 0.1, out: o });
      } else if (kind === 'siren') {
        a.tone({ when: t, type: 'sawtooth', freq: 620, freqEnd: 900, dur: 0.5, vol: 0.07, filter: 'lowpass', filterFreq: 2200, out: null });
        a.tone({ when: t + 0.5, type: 'sawtooth', freq: 900, freqEnd: 620, dur: 0.5, vol: 0.07, filter: 'lowpass', filterFreq: 2200, out: null });
      } else {
        a.tone({ when: t, type: 'square', freq: 980, freqEnd: 940, dur: 0.05, vol: 0.05, out: o });
      }
    } catch (err) { U.reportError('v10.sfx', err); }
  }

  /* ----------------------------- Level setup ---------------------------- */
  /**
   * Floor tiles hugging a wall, where a fixture can be mounted.
   * `relaxed` is the v13 fallback for cramped rooms: it accepts the room's
   * corner tiles, ignores the 3x3 spacing reservation and the free-tile-behind
   * check, so every room can still get its breaker.
   */
  function wallSlots(map, r, taken, relaxed) {
    const out = [];
    const ok = (tx, ty) => map.inBounds(tx, ty) && map.tile(tx, ty) === T.FLOOR && !map.propAt(tx, ty) && (relaxed || !taken.has(map.idx(tx, ty)));
    const inner = (tx, ty) => relaxed ? (map.inBounds(tx, ty) && map.tile(tx, ty) !== T.SOLID) : ok(tx, ty);
    const wall = (tx, ty) => map.inBounds(tx, ty) && map.tile(tx, ty) === T.SOLID;
    const x0 = relaxed ? r.x : r.x + 1, x1 = relaxed ? r.x + r.w : r.x + r.w - 1;
    const y0 = relaxed ? r.y : r.y + 1, y1 = relaxed ? r.y + r.h : r.y + r.h - 1;
    for (let x = x0; x < x1; x++) {
      const b = r.y + r.h - 1;
      if (ok(x, r.y) && wall(x, r.y - 1) && inner(x, r.y + 1)) out.push({ tx: x, ty: r.y, nx: 0, ny: -1 });
      if (ok(x, b) && wall(x, b + 1) && inner(x, b - 1)) out.push({ tx: x, ty: b, nx: 0, ny: 1 });
    }
    for (let y = y0; y < y1; y++) {
      const e = r.x + r.w - 1;
      if (ok(r.x, y) && wall(r.x - 1, y) && inner(r.x + 1, y)) out.push({ tx: r.x, ty: y, nx: -1, ny: 0 });
      if (ok(e, y) && wall(e + 1, y) && inner(e - 1, y)) out.push({ tx: e, ty: y, nx: 1, ny: 0 });
    }
    return out;
  }

  function mount(map, r, kind, list, taken, relaxed) {
    const slots = wallSlots(map, r, taken, relaxed);
    if (!slots.length) return false;
    const q = slots[Math.floor(Math.random() * slots.length)];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.inBounds(q.tx + dx, q.ty + dy)) taken.add(map.idx(q.tx + dx, q.ty + dy));
    const ax = q.tx * TILE + TILE / 2, ay = q.ty * TILE + TILE / 2;
    list.push({
      kind, room: r.index, tx: q.tx, ty: q.ty, nx: q.nx, ny: q.ny,
      ax, ay,                                                  // where an actor stands to use it
      x: ax + q.nx * (TILE / 2 - 5), y: ay + q.ny * (TILE / 2 - 5), // drawn flush against the wall
      rot: Math.atan2(q.ny, q.nx) + Math.PI / 2,
      cd: 0, flash: 0, runHold: 0, silence: 0
    });
    return true;
  }

  /**
   * v13: a room that was generated without power gets dormant ceiling lamps
   * and starts with its breaker OFF. Flipping it ON lights the room; its faint
   * emergency strobe only runs while the power is out.
   */
  function wireDarkRoom(g, s, r) {
    const lv = g.level;
    s.base[r.index] = 1;
    s.off[r.index] = 1;
    lv.lamps.forEach(lp => { if (lp.v10room === r.index && lp.pulse && !lp.v10e) lp.v10inv = true; });
    const cols = (lv.theme && lv.theme.lamps && lv.theme.lamps.length) ? lv.theme.lamps : ['#ffe2a8'];
    const count = r.w * r.h > 90 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const lx = count === 1 ? r.cx : (k === 0 ? r.x + r.w * 0.28 : r.x + r.w * 0.72);
      lv.lamps.push({
        x: lx * TILE + TILE / 2, y: r.cy * TILE + TILE / 2,
        radius: U.clamp(Math.max(r.w, r.h) * TILE * (count === 1 ? 0.62 : 0.48), 210, 460),
        color: cols[Math.floor(Math.random() * cols.length)], flicker: Math.random() < 0.3 ? U.rand(0.5, 1) : 0,
        pulse: false, intensity: U.rand(0.75, 0.95), phase: Math.random() * 10, v10room: r.index, v13lamp: true
      });
    }
  }

  let hinted = false;
  function setup(g) {
    const lv = g.level, map = g.map;
    const s = g.v10 = {
      off: new Uint8Array(lv.rooms.length), base: Uint8Array.from(lv.roomLit),
      zone: new Uint8Array(lv.rooms.length), zonePanel: null,
      breakers: [], panels: [], alarm: 0, alarms: 0, siren: 0, runner: null, near: []
    };
    const taken = new Set();
    if (CONF.breakerEveryRoom) {
      // Every room, whatever its tag, gets exactly one breaker. Strict slots
      // first; cramped rooms fall back to the relaxed slot search.
      shuffle(lv.rooms.slice()).forEach(r => {
        if (!mount(map, r, 'breaker', s.breakers, taken)) mount(map, r, 'breaker', s.breakers, taken, true);
      });
    } else {
      shuffle(lv.rooms.filter(r => r.tag === 'room')).forEach((r, i) => {
        if (s.breakers.length < CONF.maxBreakers && (i < CONF.minBreakers || Math.random() < CONF.breakerChance)) mount(map, r, 'breaker', s.breakers, taken);
      });
    }
    shuffle(lv.rooms.filter(r => r.tag === 'room')).forEach((r, i) => {
      if (s.panels.length < CONF.maxAlarms && (i < CONF.minAlarms || Math.random() < CONF.alarmChance)) mount(map, r, 'alarm', s.panels, taken);
    });
    // Tag lamps + trim strips with their room so a breaker can switch them off.
    lv.lamps.forEach(lp => { lp.v10room = lp.door ? -1 : roomAt(g, lp.x, lp.y); });
    (lv.strips || []).forEach(sp => { sp.v10room = roomAt(g, (sp.x0 + sp.x1) / 2, sp.y0); });
    // Unpowered rooms: breaker starts OFF and can bring the lights up.
    const wired = new Uint8Array(lv.rooms.length);
    s.breakers.forEach(b => { wired[b.room] = 1; });
    lv.rooms.forEach(r => { if (!s.base[r.index] && wired[r.index]) wireDarkRoom(g, s, r); });
    // Red emergency lamps, dormant until the alarm trips in their zone.
    lv.rooms.forEach(r => {
      if (r.tag === 'arena') return;
      lv.lamps.push({
        x: r.cx * TILE + TILE / 2, y: r.cy * TILE + TILE / 2, radius: U.clamp(Math.max(r.w, r.h) * TILE * 0.55, 200, 420),
        color: '#ff2d55', flicker: 0, pulse: true, intensity: 0.75, phase: Math.random() * 6, v10e: true, v10room: r.index
      });
    });
    applyLit(g);
    if (s.breakers.length && !hinted) { hinted = true; g.ui.schedule(7, () => g.ui.notify(BO.t('pw.hint'), '#ffd34d', 4.5)); }
  }

  const oldStart = G.startMission;
  G.startMission = function () {
    this.v10 = null;
    const ok = oldStart.apply(this, arguments);
    if (ok) U.safe('v10.setup', () => setup(this));
    return ok;
  };

  /* --------------------------- Power + alarm --------------------------- */
  function setPower(g, b, on) {
    const s = st(g);
    s.off[b.room] = on ? 0 : 1;
    b.cd = CONF.flipCooldown; b.flash = 1;
    applyLit(g);
    sfx(g, on ? 'on' : 'off', b.x, b.y);
    g.particles.sparks(b.x, b.y, Math.atan2(-b.ny, -b.nx), 10, '#ffd27a', 360);
    if (g.ai) g.ai.onNoise(b.x, b.y, CONF.flipNoise, true);
    if (on) { g.addLight(b.ax, b.ay, 260, '#ffe2a8', 0.25, 0.8); g.ui.notify(BO.t('pw.restored'), '#ffd34d', 1.6); return; }
    if (zoned(s, b.room)) { g.ui.notify(BO.t('pw.overridden'), '#ff2d55', 2); return; }
    blind(g, b.room);
    g.ui.notify(BO.t('pw.cut'), '#7fe3ff', 1.8);
  }

  /** Everyone inside loses their bearings: stumbles, stops shooting and loses track of you. */
  function blind(g, room) {
    const s = st(g);
    let barked = false;
    g.enemies.forEach(e => {
      if (e.dead || e.isBoss || roomAt(g, e.x, e.y) !== room) return;
      e.v10daze = U.rand(CONF.daze[0], CONF.daze[1]);
      e.burstLeft = 0; e.charge = 0; e.spin = 0; e.sprayLeft = 0; e.windup = 0; e.lunge = 0;
      if (e.v10run) { e.v10run = null; if (s.runner === e) s.runner = null; }
      if (e.engaged) e.setState(S.SEARCH);
      e.awareness = Math.min(e.awareness, 0.5);
      e.lastKnownX += U.randSpread() * 160; e.lastKnownY += U.randSpread() * 160;
      if (!barked) barked = bark(e, 'lightsOut', 2);
    });
  }

  function maybeRun(ai, e) {
    const g = ai.game, s = st(g);
    if (!s || s.alarm > 0 || !s.panels.length || e.dead || e.isBoss || e.isWave || e.minion || NO_RUN[e.type] || e.v10daze > 0) return;
    if (s.runner && !s.runner.dead && s.runner.v10run) return; // one runner at a time

    // Enemy MUST have actually spotted and visually seen a player!
    // If player is behind walls, in another room, or sneaking in darkness, enemy cannot run for alarm!
    const players = (g.coop && g.players) ? g.players : [g.player];
    const visiblePlayer = players.find(pl => {
      if (!pl || pl.dead) return false;
      const d = U.dist(e.x, e.y, pl.x, pl.y);
      const viewRange = (e.def && e.def.view) || 500;
      if (d > viewRange) return false;
      if (C && C.lineOfSight && !C.lineOfSight(g.map, e.x, e.y, pl.x, pl.y, BO.COLLIDE.SIGHT)) return false;
      const a = Math.atan2(pl.y - e.y, pl.x - e.x);
      const fov = (e.def && e.def.fov) || 1.8;
      if (Math.abs(U.angleDiff(e.angle, a)) > fov / 2) return false;
      // If player's flashlight is off and in darkness: cannot see player to run for alarm
      if (pl.flashlight === false && (g.playerExposure || 0) < 0.3 && d > 90) return false;
      return true;
    });

    if (!visiblePlayer) return;
    if (!e.canSee && (ai.time - (e.lastSeenAt || 0) > 0.4)) return;

    if (!U.chance(CONF.runChance)) return;
    const p = visiblePlayer;
    let best = null, bd = CONF.runRange;
    s.panels.forEach(q => {
      if (p && U.dist(p.x, p.y, q.ax, q.ay) < 160) return; // you're guarding that one
      const d = U.dist(e.x, e.y, q.ax, q.ay);
      if (d < bd) { bd = d; best = q; }
    });
    if (!best) return;
    e.v10run = { panel: best, t: 0, hold: 0 };
    s.runner = e;
    bark(e, 'alarmRun', 3);
    g.ui.notify(BO.t('pw.runner'), '#ff2d55', 2.4);
  }

  /** Runner behaviour; replaces chase/attack while the enemy is heading for a panel. */
  function runStep(ai, e, dt) {
    const g = ai.game, s = st(g), r = e.v10run;
    if (!r) return false;
    r.t += dt;
    // Abort if alarm already active, dazed, timed out, or enemy heavily damaged
    if (!s || s.alarm > 0 || e.v10daze > 0 || r.t > CONF.runGiveUp || (e.hp < e.maxHp * 0.35)) {
      e.v10run = null;
      if (s && s.runner === e) s.runner = null;
      return false;
    }
    // Taking bullet hits interrupts holding the alarm button
    if (e.hitFlash > 0) r.hold = Math.max(0, r.hold - dt * 2);
    const q = r.panel;
    const arrived = U.dist(e.x, e.y, q.ax, q.ay) <= 24 || ai._navigate(e, q.ax, q.ay, 1.15);
    if (!arrived) { r.hold = 0; return true; }
    e.faceAngle = Math.atan2(q.y - e.y, q.x - e.x);
    const before = r.hold;
    r.hold += dt;
    if (Math.floor(before * 5) !== Math.floor(r.hold * 5)) sfx(g, 'panel', q.x, q.y);
    if (r.hold >= CONF.runHold) {
      e.v10run = null; s.runner = null;
      triggerAlarm(g, e, q);
    }
    return true;
  }

  function triggerAlarm(g, src, panel) {
    const s = st(g);
    if (!s || s.alarm > 0) return;
    s.alarm = CONF.alarmTime; s.alarms++; s.siren = 0;
    s.panels.forEach(q => { q.silence = 0; });
    panel.flash = 1;
    buildZone(g, panel);
    applyLit(g);
    // Only hostiles inside the alarm zone get the call; everyone else keeps doing what they were doing.
    const p = g.player, ai = g.ai;
    g.enemies.forEach(e => {
      if (e.dead || e.isBoss || !inZone(g, e.x, e.y)) return;
      e.v10daze = 0;
      if (!p) return;
      e.lastKnownX = p.x; e.lastKnownY = p.y; e.lastSeenAt = ai ? ai.time - 0.5 : 0;
      e.awareness = 1;
      if (!e.engaged) e.setState(S.CHASE);
    });
    reinforce(g, s, p, panel);
    g.lastCombatAt = g.time;
    g.addLight(panel.x, panel.y, 420, '#ff2d55', 0.8, 1);
    g.camera.addTrauma(0.25);
    bark(src, 'alarmOn', 3);
    if (g.ui.bossBanner) g.ui.bossBanner(BO.t('pw.alarm'), BO.t('pw.alarmSub'), '#ff2d55');
    else g.ui.notify(BO.t('pw.alarm'), '#ff2d55', 3);
  }

  function reinforce(g, s, p, panel) {
    if (!p || (g.boss && !g.boss.dead && g.boss.mode && g.boss.mode !== 'dormant')) return;
    const n = Math.min(CONF.maxReinforcements, CONF.reinforcements + s.alarms - 1);
    const pts = (g.level.spawnPoints || [])
      .filter(q => U.dist(q.x, q.y, p.x, p.y) > 520 && U.dist(q.x, q.y, panel.x, panel.y) <= CONF.reinforceRange)
      .sort((a, b) => U.dist2(a.x, a.y, panel.x, panel.y) - U.dist2(b.x, b.y, panel.x, panel.y));
    // You're inside the zone: they come for you. Otherwise they sweep the alarm sector.
    const sweep = !inZone(g, p.x, p.y);
    let made = 0;
    for (let i = 0; i < pts.length && made < n; i++) {
      const e = g.spawnEnemy(U.chance(0.25) ? 'rusher' : 'grunt', pts[i].x, pts[i].y, { wave: true });
      if (!e) continue;
      made++;
      if (sweep) {
        e.lastKnownX = panel.ax; e.lastKnownY = panel.ay;
        e.awareness = 0.7;
        e.setState(S.INVESTIGATE);
        e.moveTargetX = panel.ax + U.randSpread() * 90; e.moveTargetY = panel.ay + U.randSpread() * 90;
        e.hasMoveTarget = true;
      }
    }
  }

  function silence(g, panel) {
    const s = st(g);
    s.alarm = 0;
    clearZone(s);
    s.panels.forEach(q => { q.silence = 0; });
    panel.flash = 1;
    applyLit(g);
    sfx(g, 'on', panel.x, panel.y);
    g.ui.notify(BO.t('pw.silenced'), '#3ddc84', 2.2);
    g.grantXP(15, panel.x, panel.y);
  }

  /* ------------------------------ AI hooks ----------------------------- */
  // Darkness: hostiles standing in a blacked-out room only see you up close,
  // unless you're lit up (lit room) or just fired. Dazed hostiles see nothing.
  const oldPerceive = AI._perceive;
  AI._perceive = function (e) {
    const g = this.game;
    if (!st(g)) return oldPerceive.apply(this, arguments);
    const lx = e.lastKnownX, ly = e.lastKnownY, ls = e.lastSeenAt;
    const r = oldPerceive.apply(this, arguments);
    if (!e.canSee || !dark(g, roomAt(g, e.x, e.y))) return r;
    const exp = g.playerExposure || 0;
    const reach = e.v10daze > 0 ? 0 : exp > 0.5 ? e.def.view * CONF.darkSightFiring : exp > 0 ? e.def.view * CONF.darkSightLitRoom : CONF.darkSight;
    if (U.dist(e.x, e.y, e.lastKnownX, e.lastKnownY) <= reach) return r;
    e.canSee = false; e.clearShot = false;
    e.lastKnownX = lx; e.lastKnownY = ly; e.lastSeenAt = ls;
    return r;
  };

  // Disorientation: slow, wobbling stumble with a random gaze; no attacks.
  const oldMove = AI._applyMovement;
  AI._applyMovement = function (e, dt) {
    if (e.v10daze > 0) {
      e.v10daze -= dt;
      const w = e.stateTime * 2.3 + e.id;
      e.speedMul = Math.min(e.speedMul || 0, 0.45) + 0.12;
      const dx = (e.desiredX || 0) + Math.cos(w) * 0.8, dy = (e.desiredY || 0) + Math.sin(w * 1.3) * 0.8, l = Math.hypot(dx, dy) || 1;
      e.desiredX = dx / l; e.desiredY = dy / l;
      e.faceAngle = e.angle + Math.sin(w * 1.7) * 2.2;
      e.burstLeft = 0; e.windup = 0; e.lunge = 0; e.charge = 0; e.sprayLeft = 0;
    }
    return oldMove.apply(this, arguments);
  };

  // Shooting blind from the dark is wildly inaccurate.
  const oldShoot = AI._shoot;
  AI._shoot = function (e, spread) {
    const g = this.game;
    if (st(g) && dark(g, roomAt(g, e.x, e.y))) {
      const a = Array.prototype.slice.call(arguments);
      a[1] = spread * CONF.darkSpread + 0.04;
      return oldShoot.apply(this, a);
    }
    return oldShoot.apply(this, arguments);
  };

  // Spotted you? Maybe sprint for the alarm instead of fighting.
  const oldEngage = AI.engage;
  AI.engage = function (e) {
    const was = e.engaged;
    const r = oldEngage.apply(this, arguments);
    if (!was) U.safe('v10.runner', () => maybeRun(this, e));
    return r;
  };
  ['_chase', '_attack'].forEach(k => {
    const old = AI[k];
    if (!old) return;
    AI[k] = function (e, dt) {
      if (e.v10run && runStep(this, e, dt)) return;
      return old.apply(this, arguments);
    };
  });

  /* ------------------------------ Per frame ---------------------------- */
  function nearestFixture(s, p) {
    let best = null, bd = CONF.useRange;
    const test = f => { const d = U.dist(p.x, p.y, f.ax, f.ay); if (d < bd) { bd = d; best = f; } };
    s.breakers.forEach(test);
    if (s.alarm > 0) s.panels.forEach(test);
    return best;
  }

  function interact(g, s, p, dt) {
    const input = V8.inputOf(g, p);
    if (!input) return;
    if (!p.isP2 && g.interactable) return; // hacking / planting / weapon swap take priority
    const f = nearestFixture(s, p);
    if (!f) return;
    s.near.push(f);
    if (f.kind === 'breaker') {
      if (f.cd <= 0 && input.wasPressed('KeyE')) setPower(g, f, !!s.off[f.room]);
      return;
    }
    const holding = input.isDown ? input.isDown('KeyE') : false;
    if (holding) {
      const before = f.silence;
      f.silence = Math.min(1, f.silence + dt / CONF.silenceTime);
      if (Math.floor(before * 6) !== Math.floor(f.silence * 6)) sfx(g, 'panel', f.x, f.y);
      if (f.silence >= 1) silence(g, f);
    }
  }

  function step(g, s, dt) {
    s.breakers.forEach(b => { b.cd = Math.max(0, b.cd - dt); b.flash = Math.max(0, b.flash - dt * 2); });
    s.panels.forEach(q => { q.flash = Math.max(0, q.flash - dt * 1.5); q.runHold = 0; });
    if (s.runner) {
      const r = s.runner.v10run;
      if (s.runner.dead || !r) s.runner = null;
      else r.panel.runHold = r.hold / CONF.runHold;
    }
    if (s.alarm > 0) {
      s.alarm -= dt; s.siren -= dt;
      if (V8.players(g).some(p => p && !p.dead && inZone(g, p.x, p.y))) g.lastCombatAt = g.time;
      if (s.siren <= 0) { s.siren = 1.05; sfx(g, 'siren'); }
      if (s.alarm <= 0) { s.alarm = 0; clearZone(s); applyLit(g); g.ui.notify(BO.t('pw.alarmEnd'), '#ffd34d', 2); }
    }
    s.near.length = 0;
    if (!V8.playing(g)) return;
    const silenceBefore = s.panels.map(q => q.silence);
    V8.players(g).forEach(p => { if (p && !p.dead) V8.withPlayer(g, p, () => interact(g, s, p, dt)); });
    // Let go of USE and the silence progress drains away.
    s.panels.forEach((q, i) => { if (q.silence > 0 && q.silence === silenceBefore[i]) q.silence = Math.max(0, q.silence - dt); });
  }

  const oldUpdate = G._update;
  G._update = function (dt) {
    oldUpdate.apply(this, arguments);
    const s = st(this);
    if (!s || !this.player) return;
    const d = dt * (this.timeScale || 1);
    U.safe('v10.update', () => step(this, s, d));
  };

  /* ----------------------------- Rendering ----------------------------- */
  // Breakers switch off their room's lamps; emergency lamps only glow inside the alarm zone.
  const oldLamp = R._lampIntensity;
  R._lampIntensity = function (lp, time) {
    if (lp.v10room === undefined) return oldLamp.apply(this, arguments);
    const s = st(BO.game);
    if (lp.v10e) return zoned(s, lp.v10room) ? U.clamp(0.5 + Math.sin(time * 5 + lp.phase) * 0.35, 0, 1) : 0;
    // v13: the emergency strobe of an unpowered room only runs while its power is out.
    if (lp.v10inv) return (s && lp.v10room >= 0 && s.off[lp.v10room]) ? oldLamp.apply(this, arguments) : 0;
    if (s && lp.v10room >= 0 && s.off[lp.v10room]) return 0;
    return oldLamp.apply(this, arguments);
  };
  const oldColored = R._drawColoredLights;
  R._drawColoredLights = function (ctx, game) {
    const s = st(game), lv = game && game.level;
    if (!s || game !== BO.game || !lv || !lv.strips || !s.off.some(Boolean)) return oldColored.apply(this, arguments);
    const all = lv.strips;
    lv.strips = all.filter(x => !(x.v10room >= 0 && s.off[x.v10room]));
    try { return oldColored.apply(this, arguments); } finally { lv.strips = all; }
  };

  function drawBreaker(ctx, b, s) {
    const off = !!s.off[b.room];
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-11, -5, 25, 15);
    ctx.fillStyle = '#2b303b'; ctx.fillRect(-12, -7, 24, 14);
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 1.5; ctx.strokeRect(-12, -7, 24, 14);
    ctx.fillStyle = '#14161c'; ctx.fillRect(-8, -3, 16, 6);
    ctx.fillStyle = off ? '#8a90a4' : '#eef0f6'; ctx.fillRect(off ? 2 : -7, -4.5, 5, 9);
    ctx.restore();
  }

  function drawPanel(ctx, q) {
    ctx.save();
    ctx.translate(q.x, q.y); ctx.rotate(q.rot);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-9, -5, 21, 15);
    ctx.fillStyle = '#3a1820'; ctx.fillRect(-10, -7, 20, 14);
    ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 1.5; ctx.strokeRect(-10, -7, 20, 14);
    ctx.fillStyle = '#7a1a2a'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, U.TAU); ctx.fill();
    ctx.restore();
  }

  function ring(ctx, x, y, r, k, c) {
    ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + U.TAU * U.clamp(k, 0, 1)); ctx.stroke();
  }

  function label(ctx, text, x, y, color, size) {
    ctx.font = '700 ' + (size || 13) + 'px Khand, "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(8,9,18,0.78)'; ctx.fillRect(x - w / 2, y - 10, w, 20);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  V8.onWorld((ctx, g) => {
    const s = st(g);
    if (!s) return;
    s.breakers.forEach(b => drawBreaker(ctx, b, s));
    s.panels.forEach(q => drawPanel(ctx, q));
  });

  V8.onGlow((ctx, g, t) => {
    const s = st(g);
    if (!s) return;
    ctx.globalCompositeOperation = 'lighter';
    s.breakers.forEach(b => {
      const r = 9 + b.flash * 18;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(BO.softSprite(s.off[b.room] ? '#ff3355' : '#3ddc84'), b.x - r, b.y - r, r * 2, r * 2);
    });
    s.panels.forEach(q => {
      const live = zoned(s, q.room), hot = live || q.runHold > 0, r = hot ? 26 : 9;
      ctx.globalAlpha = hot ? (Math.floor(t * 6) % 2 ? 1 : 0.35) : 0.35 + Math.sin(t * 2 + q.ax) * 0.1;
      ctx.drawImage(BO.softSprite('#ff2d55'), q.x - r, q.y - r, r * 2, r * 2);
      if (live) {
        // Rotating beacon.
        ctx.save();
        ctx.translate(q.x, q.y); ctx.rotate(t * 5);
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#ff2d55';
        for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 150, -0.3, 0.3); ctx.closePath(); ctx.fill(); ctx.rotate(Math.PI); }
        ctx.restore();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    s.panels.forEach(q => {
      if (q.runHold > 0) ring(ctx, q.ax, q.ay, 26, q.runHold, '#ff2d55');
      if (q.silence > 0) ring(ctx, q.ax, q.ay, 26, q.silence, '#3ddc84');
    });
    // Runner callout: dashed line to the panel it is heading for.
    const e = s.runner, p = g.player;
    if (e && !e.dead && e.v10run && p && (e.visible || U.dist(e.x, e.y, p.x, p.y) < 420)) {
      const q = e.v10run.panel;
      ctx.save();
      ctx.globalAlpha = 0.55; ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(q.ax, q.ay); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, BO.t('pw.runnerTag'), e.x, e.y - e.r - 46 + Math.sin(t * 10) * 2, '#ff2d55', 15);
      ctx.restore();
    }
    // USE prompts.
    s.near.forEach(f => {
      const key = f.kind === 'breaker' ? (s.off[f.room] ? 'pw.promptOn' : 'pw.promptOff') : 'pw.promptSilence';
      label(ctx, BO.t(key), f.ax - f.nx * 34, f.ay - f.ny * 34, f.kind === 'breaker' ? '#ffd34d' : '#3ddc84');
    });
    ctx.globalAlpha = 1;
  });

  V8.onHUD((ui, ctx, g, t) => {
    const s = st(g);
    if (!s || s.alarm <= 0) return;
    const w = g.renderer.w, h = g.renderer.h, k = 0.5 + Math.sin(t * 6) * 0.5;
    const p = g.player;
    if (p && inZone(g, p.x, p.y)) {
      // Red vignette only while you're standing inside the alarm zone.
      const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      grd.addColorStop(0, 'rgba(255,30,60,0)');
      grd.addColorStop(1, 'rgba(255,30,60,' + (0.1 + 0.08 * k).toFixed(3) + ')');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    }
    const bw = 340, x = w / 2 - bw / 2, y = 70;
    ctx.fillStyle = 'rgba(8,9,18,0.78)'; ctx.fillRect(x, y, bw, 34);
    ctx.fillStyle = '#ff2d55'; ctx.fillRect(x, y, bw * U.clamp(s.alarm / CONF.alarmTime, 0, 1), 3);
    ui._text(ctx, BO.t('pw.alarmHud', { n: BO.I18N.num(Math.ceil(s.alarm)) }), w / 2, y + 19, 13, k > 0.5 ? '#ff2d55' : '#ff8095', 'center', 700);
  });

  /* ------------------------------ Strings ------------------------------ */
  if (BO.Voice && BO.Voice.LINES) Object.assign(BO.Voice.LINES, {
    lightsOut: [['چراغ‌ها رفت!', 'Lights out!'], ['هیچی نمی‌بینم!', "I can't see a thing!"], ['برق رفت! حواستون باشه!', 'Power is down! Stay sharp!']],
    alarmRun: [['می‌رم آژیر رو بزنم!', 'Going for the alarm!'], ['آژیر رو بزنید!', 'Hit the alarm!']],
    alarmOn: [['آژیر فعال شد! همه بیان اینجا!', 'Alarm is up! Everyone converge!']]
  });

  BO.I18N.extend('en', {
    'pw.hint': 'TIP: EVERY ROOM HAS A BREAKER. PRESS [E] TO CUT OR RESTORE ITS POWER. STOP ANY HOSTILE RUNNING FOR AN ALARM.',
    'pw.cut': 'POWER CUT // HOSTILES BLINDED', 'pw.restored': 'POWER RESTORED',
    'pw.overridden': 'EMERGENCY LIGHTS OVERRIDE THE BLACKOUT',
    'pw.runner': 'HOSTILE RUNNING FOR THE ALARM. STOP THEM!', 'pw.runnerTag': 'ALARM!',
    'pw.alarm': 'ALARM TRIGGERED', 'pw.alarmSub': 'SECTOR LOCKDOWN // NEARBY HOSTILES ALERTED',
    'pw.alarmHud': 'ALARM // {n}s · HOLD [E] AT A PANEL TO SILENCE', 'pw.alarmEnd': 'ALARM RESET', 'pw.silenced': 'ALARM SILENCED',
    'pw.promptOff': '[E] CUT POWER', 'pw.promptOn': '[E] RESTORE POWER', 'pw.promptSilence': 'HOLD [E] SILENCE ALARM'
  });
  BO.I18N.extend('fa', {
    'pw.hint': 'نکته: هر اتاق یک کلید برق دارد. با [E] برق اتاق را قطع یا وصل کن. جلوی دشمنی که سمت آژیر می‌دود را بگیر.',
    'pw.cut': 'برق قطع شد // دشمن‌ها کور شدند', 'pw.restored': 'برق وصل شد',
    'pw.overridden': 'چراغ‌های اضطراری تاریکی را خنثی کردند',
    'pw.runner': 'یک دشمن به سمت آژیر می‌دود. جلویش را بگیر!', 'pw.runnerTag': 'آژیر!',
    'pw.alarm': 'آژیر به صدا درآمد', 'pw.alarmSub': 'قرنطینه بخش // دشمن‌های همین محدوده باخبر شدند',
    'pw.alarmHud': 'آژیر // {n} ثانیه · [E] را کنار پنل نگه دار تا خاموش شود', 'pw.alarmEnd': 'آژیر خاموش شد', 'pw.silenced': 'آژیر را خاموش کردی',
    'pw.promptOff': '[E] قطع برق', 'pw.promptOn': '[E] وصل برق', 'pw.promptSilence': '[E] را نگه دار: خاموش کردن آژیر'
  });

  BO.V10 = { CONF, state: st, dark, setPower, triggerAlarm, silence, inZone, roomAt };
})(window.BO);
