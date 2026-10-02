/* =========================================================================
 * BLACKOUT :: game.js
 * The Game orchestrator: owns every system, runs the fixed-order update /
 * render loop, and implements the gameplay rules that connect systems
 * (combat resolution, explosions, interactions, doors, objectives, rewards).
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const CFG = BO.CONFIG;
  const TILE = CFG.TILE;
  const S = BO.ENEMY_STATE;

  const STATE = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', COMPLETE: 'complete', DEAD: 'dead' };
  const NOISE = { shot: 760, sniper: 1050, launcher: 950, explosion: 1100, hack: 650 };
  const COMBAT_MUSIC_HOLD = 4;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.save = BO.SaveSystem;
      this.renderer = new BO.Renderer(canvas);
      this.input = new BO.InputManager(canvas);
      this.audio = new BO.AudioSystem();
      this.camera = new BO.Camera();
      this.particles = new BO.ParticleSystem();
      this.floatingText = new BO.FloatingTextSystem();
      this.projectiles = new BO.ProjectileSystem();
      this.pickups = new BO.PickupSystem();
      this.hazards = new BO.HazardSystem();
      this.ui = null;
      this.state = STATE.MENU;
      this.time = 0;
      this.realTime = 0;
      this.timeScale = 1;
      this.slowmoTimer = 0;
      this.hitStop = 0;
      this.lights = [];
      this.lightPool = new BO.Pool(() => ({ x: 0, y: 0, radius: 0, color: '#fff', life: 0, max: 1, intensity: 1 }), 40, 120);
      this.markers = [];
      this.fps = 60; this._fpsAcc = 0; this._fpsFrames = 0;
      this.lastFrame = 0;
      this.menuScene = null;
      this.level = null; this.map = null; this.player = null; this.enemies = [];
      this.camera.setViewport(this.renderer.w, this.renderer.h);
      this._loop = this._loop.bind(this);
    }

    attachUI(ui) { this.ui = ui; }

    applySettings() {
      const s = this.save.data.settings;
      this.audio.setVolumes(s);
      this.camera.shakeEnabled = s.screenShake;
      this.particles.setQuality(s.particles);
      this.input.sensitivity = s.sensitivity;
    }

    start() {
      this._buildMenuScene();
      requestAnimationFrame(this._loop);
    }

    onResize() {
      this.renderer.resize();
      this.camera.setViewport(this.renderer.w, this.renderer.h);
      this.input.clampCursor();
    }

    /* =========================== Mission flow =========================== */
    startMission(id) {
      const def = BO.MissionSystem.byId(id);
      if (!def) { U.reportError('startMission', new Error('Unknown mission ' + id)); return false; }
      this.audio.unlock();
      this.mission = def;
      this.level = BO.LevelManager.generate(def);
      this.map = this.level.map;
      this.renderer.buildStaticLayer(this.level);
      this.particles.clear();
      this.floatingText.clear();
      this.projectiles.clear();
      this.pickups.clear();
      this.hazards.clear();
      this.lights.length = 0;
      this.lightPool.releaseAll();
      this.pendingExplosions = [];
      this.enemies = [];
      this.boss = null;
      this.time = 0;
      this.timeScale = 1; this.slowmoTimer = 0; this.hitStop = 0;
      this.extractionOpen = false;
      this.playerExposure = 0;
      this.lastCombatAt = -99;
      this.endTimer = 0;
      this.bossSequence = null;
      this.interactable = null;
      this.stats = { kills: 0, shots: 0, hits: 0, headshots: 0, damageTaken: 0, credits: 0, xp: 0 };
      this.player = new BO.Player(this.save.data);
      this.player.x = this.level.spawn.x; this.player.y = this.level.spawn.y;
      this.player.angle = 0;
      this.camera.snapTo(this.player.x, this.player.y);
      this.terminals = this.level.terminals;
      this.targets = this.level.targets;
      this.level.enemies.forEach(e => {
        const en = this.spawnEnemy(e.type, e.x, e.y, {});
        if (en) en.patrol = e.patrol;
      });
      this.level.pickups.forEach(p => this.pickups.spawn(p.type, p.x, p.y, { permanent: true, value: p.value, weaponId: p.weaponId }));
      this.level.intel.forEach(p => this.pickups.spawn('intel', p.x, p.y, { permanent: true }));
      this.level.panels.forEach(p => this.hazards.addPanel(p.x, p.y, p.w, p.h, p.offset));
      if (this.level.bossSpawn) {
        this.boss = new BO.Boss(this.level.bossSpawn.x, this.level.bossSpawn.y, this.level.arena, this.mission.boss.mk2);
        this.enemies.push(this.boss);
      }
      this.ai = new BO.AISystem(this);
      this.waves = new BO.WaveDirector(this);
      this.objectives = new BO.ObjectiveSystem(this, def.objectives);
      this.state = STATE.PLAYING;
      this.input.captureGameKeys = true;
      this.ui.enterGame(def);
      this.objectives.start();
      this.audio.setMusic('explore');
      this.input.requestLock();
      if (def.tutorial && this.save.data.completedMissions.length === 0) this._queueTutorial();
      return true;
    }

    _queueTutorial() {
      const tips = ['tip.dark', 'tip.move', 'tip.shoot', 'tip.reload', 'tip.dodge'];
      tips.forEach((k, i) => this.ui.schedule(3 + i * 4.5, () => this.ui.notify(BO.t(k), '#ffb36b', 4)));
    }

    restartMission() { if (this.mission) this.startMission(this.mission.id); }

    quitToMenu() {
      if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) {
        // Leaving mid-mission keeps half the credits picked up, like a failed op.
        this._payout(Math.floor(this.stats.credits * 0.5));
        this.save.save();
      }
      this.state = STATE.MENU;
      this.input.captureGameKeys = false;
      this.input.releaseLock();
      this.audio.duck(false);
      this.audio.setMusic('menu');
      this.ui.showMenu();
    }

    pause() {
      if (this.state !== STATE.PLAYING) return;
      this.state = STATE.PAUSED;
      this.input.clear();
      this.input.releaseLock();
      this.audio.duck(true);
      this.ui.showPause();
    }

    resume() {
      if (this.state !== STATE.PAUSED) return;
      this.state = STATE.PLAYING;
      this.audio.duck(false);
      this.input.clear();
      this.ui.hidePause();
      this.input.requestLock();
    }

    /* ============================== Loop =============================== */
    _loop(ts) {
      requestAnimationFrame(this._loop);
      const now = ts / 1000;
      let dt = this.lastFrame ? now - this.lastFrame : 1 / 60;
      this.lastFrame = now;
      if (!(dt > 0)) dt = 1 / 60;
      dt = Math.min(dt, CFG.MAX_DT);
      this.realTime += dt;
      this._trackFps(dt);
      U.safe('game.frame', () => {
        if (this.state === STATE.MENU) this._menuFrame(dt);
        else this._gameFrame(dt);
      });
      this.input.endFrame();
    }

    _trackFps(dt) {
      this._fpsAcc += dt; this._fpsFrames++;
      if (this._fpsAcc >= 0.5) { this.fps = Math.round(this._fpsFrames / this._fpsAcc); this._fpsAcc = 0; this._fpsFrames = 0; }
    }

    _gameFrame(dt) {
      if (this.state === STATE.PLAYING || this.state === STATE.COMPLETE || this.state === STATE.DEAD) {
        if (this.state === STATE.PLAYING && this.input.wasPressed('Escape')) { this.pause(); }
        else this._update(dt);
      }
      this.ui.update(this.state === STATE.PAUSED ? 0 : dt);
      this._render();
    }

    _update(realDt) {
      // Slow motion (boss kill / death) runs on real time.
      if (this.slowmoTimer > 0) {
        this.slowmoTimer -= realDt;
        this.timeScale = U.damp(this.timeScale, this.slowmoTimer > 0 ? 0.25 : 1, 6, realDt);
      } else this.timeScale = U.damp(this.timeScale, 1, 6, realDt);
      if (this.hitStop > 0) { this.hitStop -= realDt; this._updateCameraOnly(realDt); return; }
      const dt = realDt * this.timeScale;
      this.time += dt;
      const p = this.player;
      this.audio.setListener(p.x, p.y);
      this.blockFire = this.state !== STATE.PLAYING;
      if (this.state === STATE.PLAYING) p.update(dt, this.input, this);
      else if (p.dead) p.deathTimer += dt;
      this._updateExposure(dt);
      U.safe('ai', () => this.ai.update(dt));
      if (this.boss) U.safe('boss', () => this.boss.update(dt, this));
      this.projectiles.update(dt, this);
      this.pickups.update(dt, this);
      this.hazards.update(dt, this);
      this._updateDoors(dt);
      this._updateProps(dt);
      this._updateExplosionQueue(dt);
      this._updateBossArena();
      this._updateBossSequence(realDt);
      if (this.state === STATE.PLAYING) {
        this._updateInteraction(dt);
        this.objectives.update(dt);
        this.waves.update(dt);
      }
      this.particles.update(dt);
      this.floatingText.update(dt);
      this._updateLights(dt);
      this._updateVisibility();
      this._cleanupEnemies();
      this._updateMusic();
      this.objectives.markers(this.markers);
      this.camera.update(realDt, p, p.aimX, p.aimY, p.weapon.def.lookAhead);
      this._updateEndStates(realDt);
    }

    _updateCameraOnly(dt) {
      const p = this.player;
      this.camera.update(dt, p, p.aimX, p.aimY, p.weapon.def.lookAhead);
    }

    _updateExposure(dt) {
      this.playerExposure = Math.max(0, this.playerExposure - dt);
      const p = this.player;
      const room = this.map.roomId[this.map.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))];
      if (room >= 0 && this.level.roomLit[room]) this.playerExposure = Math.max(this.playerExposure, 0.2);
    }

    _updateEndStates(dt) {
      if (this.state === STATE.COMPLETE) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) { this.state = STATE.MENU; this.ui.showResults(this.results); this.audio.setMusic('menu'); }
      } else if (this.state === STATE.DEAD) {
        this.endTimer -= dt;
        if (this.endTimer <= 0) { this.state = STATE.MENU; this.ui.showDeath(this.results); this.audio.setMusic('menu'); }
      }
    }

    _render() {
      const r = this.renderer;
      r.begin();
      r.renderWorld(this, this.time);
      this.ui.renderHUD(r.ctx, this, this.realTime);
    }

    /* ============================ Menu scene ============================ */
    _buildMenuScene() {
      U.safe('menuScene', () => {
        const def = BO.MISSIONS[2];
        const level = BO.LevelManager.generate(def);
        const layer = new BO.Renderer(document.createElement('canvas'));
        layer.buildStaticLayer(level);
        this.menuScene = { level, layer: layer.staticLayer, cam: new BO.Camera(), dust: new BO.ParticleSystem(), lights: [],
          fake: { x: 0, y: 0, angle: 0, dead: false } };
        this.menuScene.dust.setQuality('medium');
      });
    }

    _menuFrame(dt) {
      this.ui.update(dt);
      const r = this.renderer;
      r.begin();
      const m = this.menuScene;
      if (!m) { this.ui.renderMenuOverlay(r.ctx, this.realTime); return; }
      const t = this.realTime;
      const lv = m.level;
      const cx = lv.map.pixelW / 2 + Math.sin(t * 0.05) * lv.map.pixelW * 0.28;
      const cy = lv.map.pixelH / 2 + Math.sin(t * 0.037 + 1) * lv.map.pixelH * 0.25;
      m.cam.setViewport(r.w, r.h);
      m.cam.targetZoom = m.cam.zoom = Math.max(0.7, r.w / 1900);
      m.cam.x = cx; m.cam.y = cy;
      m.fake.x = cx + Math.cos(t * 0.3) * 160; m.fake.y = cy + Math.sin(t * 0.23) * 120;
      m.fake.angle = t * 0.45;
      if (Math.random() < dt * 30) {
        const rect = m.cam.visibleRect(0);
        m.dust.spawn(U.rand(rect.x0, rect.x1), U.rand(rect.y0, rect.y1), U.rand(-8, 8), U.rand(-14, -4), U.rand(3, 6), U.rand(1, 2.4), 0.5, U.pick(['#ffb36b', '#ffd9a0', '#7fe3ff']), BO.PARTICLE_SHAPE.DOT, { additive: true, drag: 0, alpha: 0.7 });
      }
      m.dust.update(dt);
      const ctx = r.ctx;
      const rect = m.cam.visibleRect(60);
      ctx.save();
      m.cam.apply(ctx);
      ctx.drawImage(m.layer, 0, 0);
      ctx.restore();
      const fakeGame = { camera: m.cam, map: lv.map, level: lv, lights: m.lights, extractionOpen: false, player: m.fake };
      r._renderLighting(fakeGame, t, rect);
      ctx.save();
      m.cam.apply(ctx);
      r._drawColoredLights(ctx, fakeGame, rect, t);
      m.dust.render(ctx, rect, BO.PARTICLE_LAYER.AIR, true);
      ctx.restore();
      this.ui.renderMenuOverlay(ctx, t);
    }

    /* ============================= Entities ============================= */
    spawnEnemy(type, x, y, opts) {
      if (!this.map.isCircleFree(x, y, (BO.ENEMY_TYPES[type] || BO.ENEMY_TYPES.grunt).r)) return null;
      const e = new BO.Enemy(type, x, y, this.mission.diff);
      if (opts.wave || opts.minion) {
        e.isWave = !!opts.wave;
        e.minion = !!opts.minion;
        e.lastKnownX = this.player.x; e.lastKnownY = this.player.y;
        e.lastSeenAt = this.ai ? this.ai.time : 0;
        e.awareness = 1;
        e.setState(S.CHASE);
        this.particles.pickupBurst(x, y, '#ff3355');
      }
      this.enemies.push(e);
      return e;
    }

    spawnBossMinion(type, boss) {
      const pts = this.level.minionSpawns.slice().sort((a, b) => U.dist2(b.x, b.y, this.player.x, this.player.y) - U.dist2(a.x, a.y, this.player.x, this.player.y));
      for (let i = 0; i < pts.length; i++) {
        const e = this.spawnEnemy(type, pts[i].x + U.randSpread() * 20, pts[i].y + U.randSpread() * 20, { minion: true });
        if (e) { this.addLight(e.x, e.y, 160, '#ff3355', 0.4, 0.9); return e; }
      }
      return null;
    }

    _cleanupEnemies() {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.dead && !e.isBoss && e.removeTimer <= 0) this.enemies.splice(i, 1);
      }
    }

    _updateVisibility() {
      const p = this.player, map = this.map;
      const half = CFG.FLASHLIGHT_FOV / 2 + 0.05;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.dead) continue;
        if (e.isBoss) { e.visible = true; continue; }
        const d = U.dist(p.x, p.y, e.x, e.y);
        if (d > 1250) { e.visible = false; continue; }
        const inCone = d < CFG.FLASHLIGHT_RANGE && Math.abs(U.angleDiff(p.angle, Math.atan2(e.y - p.y, e.x - p.x))) < half;
        const room = map.roomId[map.idx(Math.floor(e.x / TILE), Math.floor(e.y / TILE))];
        const lit = inCone || d < CFG.AMBIENT_LIGHT_RADIUS + e.r || e.muzzle > 0 || (room >= 0 && this.level.roomLit[room]) || e.engaged;
        e.visible = lit && BO.Collision.lineOfSight(map, p.x, p.y, e.x, e.y, BO.COLLIDE.SIGHT);
      }
    }

    _updateMusic() {
      if (this.state !== STATE.PLAYING) return;
      if (this.boss && (this.boss.mode === 'fight' || this.boss.mode === 'transition' || this.boss.mode === 'intro')) { this.audio.setMusic('boss'); return; }
      for (let i = 0; i < this.enemies.length; i++) if (!this.enemies[i].dead && this.enemies[i].engaged && !this.enemies[i].isBoss) { this.lastCombatAt = this.time; break; }
      if (this.waves.active) this.lastCombatAt = this.time;
      this.audio.setMusic(this.time - this.lastCombatAt < COMBAT_MUSIC_HOLD ? 'combat' : 'explore');
    }

    /* =============================== Lights ============================== */
    addLight(x, y, radius, color, life, intensity) {
      const l = this.lightPool.acquire();
      if (!l) return;
      l.x = x; l.y = y; l.radius = radius; l.color = color; l.life = l.max = life; l.intensity = intensity;
      this.lights.push(l);
    }

    _updateLights(dt) {
      for (let i = this.lights.length - 1; i >= 0; i--) {
        const l = this.lights[i];
        l.life -= dt;
        if (l.life <= 0) {
          this.lightPool.release(l);
          this.lights[i] = this.lights[this.lights.length - 1];
          this.lights.pop();
        }
      }
    }

    /* =============================== Doors =============================== */
    _updateDoors(dt) {
      const doors = this.level.doors, range2 = CFG.DOOR_TRIGGER_RANGE * CFG.DOOR_TRIGGER_RANGE;
      const p = this.player;
      for (let i = 0; i < doors.length; i++) {
        const d = doors[i];
        let want = false;
        if (!d.locked) {
          if (!p.dead && U.dist2(p.x, p.y, d.x, d.y) < range2) want = true;
          for (let k = 0; k < this.enemies.length && !want; k++) {
            const e = this.enemies[k];
            if (!e.dead && !e.isBoss && U.dist2(e.x, e.y, d.x, d.y) < range2) want = true;
          }
        }
        const before = d.open;
        d.open = U.approach(d.open, want ? 1 : 0, dt * 3.5);
        if ((before === 0 && d.open > 0) || (before === 1 && d.open < 1)) this.audio.door(d.x, d.y);
        // Never close a door on someone standing in it.
        if (!want && d.open < 0.7 && this._actorInDoor(d)) d.open = 0.7;
      }
    }

    _actorInDoor(d) {
      const check = (x, y, r) => d.tiles.some(i => {
        const tx = i % this.map.w, ty = (i - tx) / this.map.w;
        const px = U.clamp(x, tx * TILE, tx * TILE + TILE), py = U.clamp(y, ty * TILE, ty * TILE + TILE);
        return U.dist2(x, y, px, py) < r * r;
      });
      if (!this.player.dead && check(this.player.x, this.player.y, this.player.r)) return true;
      return this.enemies.some(e => !e.dead && check(e.x, e.y, e.r));
    }

    unlockBossArena() {
      this.level.doors.forEach(d => { if (d.arena) d.locked = false; });
      this.notify(BO.t('obj.boss'), '#ff2d55');
    }

    _updateBossArena() {
      const b = this.boss, a = this.level.arena;
      if (!b || !a || b.mode !== 'dormant') return;
      const cur = this.objectives.current;
      if (!cur || cur.type !== 'boss') return;
      const p = this.player;
      if (p.x > a.x + TILE * 1.5 && p.x < a.x + a.w && p.y > a.y && p.y < a.y + a.h) {
        b.activate(this);
        this.level.doors.forEach(d => { if (d.arena) d.locked = true; });
      }
    }

    /* ============================== Props ============================== */
    _updateProps(dt) {
      const props = this.level.props;
      for (let i = 0; i < props.length; i++) {
        const pr = props[i];
        if (pr.dead) continue;
        if (pr.hitFlash > 0) pr.hitFlash -= dt;
        if (pr.charge >= 0) {
          pr.charge += dt;
          if (Math.floor(pr.charge * 4) !== Math.floor((pr.charge - dt) * 4)) this.audio.beep(900 + pr.charge * 300, 0.05);
          if (pr.charge >= CFG.CHARGE_FUSE) { pr.charge = -1; this.destroyProp(pr, 'player'); }
        }
      }
    }

    damageProp(prop, amount, source) {
      if (!prop || prop.dead || !prop.destructible) return;
      prop.hp -= amount;
      prop.hitFlash = 0.08;
      if (prop.hp <= 0) this.destroyProp(prop, source);
    }

    destroyProp(prop, source) {
      if (prop.dead) return;
      prop.dead = true;
      prop.hp = 0;
      this.map.props[this.map.idx(prop.tx, prop.ty)] = null;
      const d = prop.def;
      this.particles.debris(prop.x, prop.y, d.debris || '#555', 14, 360);
      this.particles.smoke(prop.x, prop.y, 4, '#3a3d4c', 50);
      this.audio.impact(prop.x, prop.y, 'metal');
      if (prop.kind === 'computer') this.particles.sparks(prop.x, prop.y, -Math.PI / 2, 16, '#7fe3ff', 420);
      if (d.drop) this.pickups.rollDrop(prop.x, prop.y, d.drop, d.objective);
      if (d.explosive) this.pendingExplosions.push({ x: prop.x, y: prop.y, r: d.explosive, dmg: d.blastDamage, source, delay: source === 'chain' ? 0.12 : 0.02 });
      if (d.objective) {
        this.objectives.notify('destroy', d.objective);
        this.ui.killFeed(BO.t('feed.you'), BO.t(d.objective === 'core' ? 'obj.destroyCore' : 'obj.destroy'), false);
      }
    }

    _updateExplosionQueue(dt) {
      const q = this.pendingExplosions;
      for (let i = q.length - 1; i >= 0; i--) {
        q[i].delay -= dt;
        if (q[i].delay > 0) continue;
        const ex = q[i];
        q.splice(i, 1);
        this.explode(ex.x, ex.y, ex.r, ex.dmg, ex.source === 'enemy' ? 'enemy' : 'barrel');
      }
    }

    /**
     * Radius explosion with linear falloff. Walls block the blast (line of
     * sight check), props in range take damage and can chain-react.
     */
    explode(x, y, radius, damage, source, opts) {
      const o = opts || {};
      this.particles.explosion(x, y, radius);
      this.particles.addDecal(x, y, 1, radius * 0.55);
      this.addLight(x, y, radius * 3, '#ff9a3c', 0.5, 1);
      const p = this.player;
      const dCam = U.dist(p.x, p.y, x, y);
      this.camera.addTrauma(U.clamp(0.75 - dCam / 1400, 0.1, 0.75) * (o.small ? 0.5 : 1));
      this.audio.explosion(x, y, radius > 130);
      if (this.ai) this.ai.onNoise(x, y, NOISE.explosion, source === 'player');
      const LOS = (tx, ty) => BO.Collision.lineOfSight(this.map, x, y, tx, ty, BO.COLLIDE.SIGHT);
      if (!p.dead) {
        const d = U.dist(p.x, p.y, x, y);
        if (d < radius + p.r && LOS(p.x, p.y)) {
          const k = 1 - U.clamp(d / (radius + p.r), 0, 1);
          p.takeDamage(damage * (0.35 + 0.65 * k) * (source === 'player' ? 0.45 : 1), x, y, this);
          p.knock((p.x - x) / (d || 1) * 500 * k, (p.y - y) / (d || 1) * 500 * k);
        }
      }
      if (!o.noEnemies) {
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.dead) continue;
          const d = U.dist(e.x, e.y, x, y);
          if (d > radius + e.r || !LOS(e.x, e.y)) continue;
          const k = 1 - U.clamp(d / (radius + e.r), 0, 1);
          const push = 600 * k;
          this.damageEnemy(e, damage * (0.35 + 0.65 * k), (e.x - x) / (d || 1) * push, (e.y - y) / (d || 1) * push,
            { x: e.x, y: e.y, angle: Math.atan2(e.y - y, e.x - x), source: source === 'enemy' ? 'enemy' : 'player', explosion: true });
        }
      }
      if (!o.noProps) {
        const tr = Math.ceil(radius / TILE);
        const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
        for (let ty = cy - tr; ty <= cy + tr; ty++) for (let tx = cx - tr; tx <= cx + tr; tx++) {
          const pr = this.map.propAt(tx, ty);
          if (!pr || pr.dead || !pr.destructible) continue;
          if (U.dist(pr.x, pr.y, x, y) > radius + TILE * 0.4) continue;
          this.damageProp(pr, damage * 1.2, 'chain');
        }
      }
      this.hitStop = Math.max(this.hitStop, o.small ? 0 : 0.04);
    }

    hazardBlast(x, y, r, damage) {
      this.explode(x, y, r, damage, 'enemy', { noEnemies: true, noProps: true, small: true });
    }

    /* ============================== Combat ============================== */
    onPlayerFired(player, w, mx, my, angle) {
      const def = w.def;
      this.stats.shots += def.pellets;
      const big = def.shake > 0.3;
      this.particles.muzzleFlash(mx, my, angle, big ? 1.6 : (def.pellets > 1 ? 1.4 : 1), player.powerups.damage > 0 ? '#ff7a4d' : '#ffcf7a');
      if (def.casing) this.particles.shellCasing(player.x + Math.cos(angle) * 10, player.y + Math.sin(angle) * 10, angle, def.bigCasing);
      this.addLight(mx, my, big ? 300 : 210, '#ffb15c', 0.06, 0.9);
      this.camera.addTrauma(def.shake);
      this.camera.kick(angle, def.kick);
      this.audio.shot(def.sound, mx, my);
      this.playerExposure = 1.6;
      const radius = def.id === 'sniper' ? NOISE.sniper : (def.grenade ? NOISE.launcher : NOISE.shot);
      this.ai.onNoise(player.x, player.y, radius, true);
    }

    onEnemyEngaged(e) {
      this.lastCombatAt = this.time;
      if (e && !e.isWave && !e.minion && U.chance(0.35)) this.audio.beep(420, 0.03);
    }

    onPlayerOutOfAmmo() { this.ui.notify(BO.t('hud.noAmmo'), '#ff3355', 1.5); }

    onEnemyFired(e, x, y, angle) {
      this.particles.muzzleFlash(x, y, angle, e.type === 'sniper' ? 1.4 : 0.8, '#ff6b81');
      this.addLight(x, y, e.type === 'sniper' ? 260 : 170, '#ff3355', 0.07, 0.8);
      this.audio.shot(e.def.sound || 'enemy', x, y, U.rand(0.92, 1.08));
      if (e.type === 'sniper') this.camera.addTrauma(0.12);
    }

    onBossFired(boss, big) {
      this.audio.shot('boss', boss.x, boss.y, big ? 0.7 : 1);
      this.addLight(boss.x, boss.y, big ? 380 : 240, '#ff2d55', 0.12, 0.9);
      if (big) this.camera.addTrauma(0.2);
    }

    onBossSlam(boss) {
      this.camera.addTrauma(0.7);
      this.particles.debris(boss.x, boss.y, '#4a4c5a', 18, 500);
      this.particles.sparks(boss.x, boss.y, boss.angle + Math.PI, 20, '#ffcf6b', 600);
      this.audio.explosion(boss.x, boss.y, false);
    }

    onBulletHitWorld(p, hit) {
      const nx = hit.nx || -p.dirX, ny = hit.ny || -p.dirY;
      const normal = Math.atan2(ny, nx);
      const metal = hit.prop && (hit.prop.kind === 'barrel' || hit.prop.kind === 'locker' || hit.prop.kind === 'pillar');
      this.particles.sparks(hit.x, hit.y, normal, p.owner === 0 ? 6 : 3, p.owner === 0 ? '#ffd27a' : '#ff8aa0', 420);
      this.particles.impactDust(hit.x, hit.y, normal);
      this.particles.addDecal(hit.x - p.dirX * 2, hit.y - p.dirY * 2, 0, p.width > 2.5 ? 3 : 2);
      this.audio.impact(hit.x, hit.y, metal ? 'metal' : 'concrete');
      if (hit.prop) this.damageProp(hit.prop, p.damage, p.owner === 0 ? 'player' : 'enemy');
    }

    onBulletDodged(p) {
      if (p.owner === BO.PROJECTILE_OWNER.ENEMY && this.player.isDodging) this.floatingText.spawn(this.player.x, this.player.y - 26, BO.t('hud.dodge'), '#7fe3ff', 13, 0.6);
    }

    onEnemyHitByBullet(e, p, hx, hy) {
      let dmg = p.damage;
      // Headshot = the round's line passes close to the target's centre (top-down "head").
      const perp = Math.abs((e.x - p.x) * p.dirY - (e.y - p.y) * p.dirX);
      const headshot = !e.isBoss && p.kind !== BO.PROJECTILE_KIND.GRENADE && perp < e.r * CFG.HEADSHOT_ZONE;
      const crit = Math.random() < p.critChance;
      if (headshot) dmg *= CFG.HEADSHOT_MULT;
      if (crit) dmg *= CFG.CRIT_MULT;
      this.stats.hits++;
      if (headshot) this.stats.headshots++;
      if (p.hitStop) this.hitStop = Math.max(this.hitStop, p.hitStop);
      this.damageEnemy(e, dmg, p.dirX * p.knockback, p.dirY * p.knockback, { headshot, crit, x: hx, y: hy, angle: Math.atan2(-p.dirY, -p.dirX), source: 'player', weapon: p.source && p.source.weapon ? p.source.weapon.def.id : null });
    }

    damageEnemy(e, amount, kx, ky, info) {
      if (e.dead) return;
      if (e.isBoss && e.invulnerable) {
        e.takeDamage(0, 0, 0);
        this.particles.sparks(info.x, info.y, info.angle || 0, 6, '#7fe3ff', 300);
        return;
      }
      const killed = e.takeDamage(amount, kx, ky);
      const fromPlayer = info.source !== 'enemy' && info.source !== 'hazard';
      const color = info.headshot ? '#ff8a1a' : (info.crit ? '#ffd34d' : '#eef0f6');
      const I = BO.I18N;
      this.floatingText.spawn(info.x, info.y - 12, I.num(Math.round(amount)), color, info.headshot || info.crit ? 20 : 15, 0.8);
      if (info.headshot) this.floatingText.spawn(info.x, info.y - 34, BO.t('fx.headshot'), '#ff8a1a', 13, 0.9);
      else if (info.crit) this.floatingText.spawn(info.x, info.y - 34, BO.t('fx.crit'), '#ffd34d', 13, 0.8);
      this.particles.hitEffect(info.x, info.y, info.angle || 0, e.def.color, info.headshot || info.crit);
      this.audio.enemyHit(info.x, info.y, info.headshot || info.crit);
      if (fromPlayer) this.ui.hitmarker(killed, info.headshot);
      if (!e.isBoss && this.ai) this.ai.onEnemyDamaged(e);
      if (killed) this.onEnemyKilled(e, info);
    }

    onEnemyKilled(e, info) {
      const fromPlayer = info.source !== 'hazard';
      if (fromPlayer) this.stats.kills++;
      this.particles.deathEffect(e.x, e.y, e.def.color);
      this.audio.enemyDeath(e.x, e.y);
      this.addLight(e.x, e.y, 150, e.def.color, 0.3, 0.7);
      this.hitStop = Math.max(this.hitStop, e.isBoss ? 0 : 0.035);
      this.camera.addTrauma(0.12);
      const xp = Math.round(e.def.xp * (info.headshot ? 1.25 : 1) * (e.minion || e.isWave ? 0.6 : 1));
      this.grantXP(xp, e.x, e.y);
      const cr = e.def.credits;
      this.pickups.spawn('credits', e.x, e.y, { toss: true, value: U.randInt(cr[0], cr[1]) });
      this.pickups.rollDrop(e.x, e.y, e.def.dropChance || 0.3, e.type === 'heavy');
      this.ui.killFeed(BO.t('feed.you'), BO.t('enemy.' + e.type), info.headshot, info.weapon);
      this.objectives.notify('kill', e);
      if (e.isBoss) this._beginBossDeath(e);
    }

    grantXP(n, x, y) {
      if (n <= 0) return;
      this.stats.xp += n;
      if (x !== undefined) this.floatingText.spawn(x, y - 50, '+' + BO.I18N.num(n) + ' ' + BO.t('common.xp'), '#7fe3ff', 12, 1.1);
      const levels = BO.UpgradeSystem.addXP(this.save.data, n);
      levels.forEach(lv => {
        this.ui.levelUp(lv, CFG.LEVEL_UP_BONUS * lv);
        this.audio.levelUp();
      });
      if (levels.length) this.save.save();
    }

    addCredits(n) { this.stats.credits += n; }

    onPlayerHitByBullet(p, hx, hy) {
      const pl = this.player;
      const taken = pl.takeDamage(p.damage, p.x - p.dirX * 200, p.y - p.dirY * 200, this);
      if (taken > 0) {
        pl.knock(p.dirX * p.knockback, p.dirY * p.knockback);
        this.particles.hitEffect(hx, hy, Math.atan2(-p.dirY, -p.dirX), '#ffb36b', false);
      }
    }

    onPlayerMelee(e, dmg) {
      const pl = this.player;
      const taken = pl.takeDamage(dmg, e.x, e.y, this);
      if (taken > 0) {
        const a = Math.atan2(pl.y - e.y, pl.x - e.x);
        pl.knock(Math.cos(a) * 420, Math.sin(a) * 420);
        this.particles.hitEffect(pl.x, pl.y, a, '#ff5c7a', true);
      }
    }

    onPlayerDamaged(amount, sx, sy) {
      const p = this.player;
      this.stats.damageTaken += amount;
      this.camera.addTrauma(U.clamp(amount / 60, 0.15, 0.5));
      this.audio.playerHurt();
      this.ui.damageIndicator(Math.atan2(sy - p.y, sx - p.x), amount);
    }

    onPlayerDeath() {
      const p = this.player;
      this.particles.deathEffect(p.x, p.y, '#ff8a1a');
      this.slowmoTimer = 1.2;
      this.camera.addTrauma(0.6);
      this.input.releaseLock();
      const credits = Math.floor(this.stats.credits * 0.5);
      this._payout(credits);
      this.save.data.stats.deaths++;
      this.save.save();
      this.results = this._buildResults(false, credits);
      this.state = STATE.DEAD;
      this.endTimer = 2.4;
    }

    _payout(credits) { this.save.data.credits += Math.max(0, credits); }

    /* ============================== Pickups ============================== */
    onPickup(item, text) {
      const c = item.def.color;
      this.particles.pickupBurst(item.x, item.y, c);
      this.audio.pickup(item.def.power ? 'power' : item.type);
      this.addLight(item.x, item.y, 160, c, 0.3, 0.7);
      this.ui.notify(text, c, 2);
    }

    notify(text, color) { this.ui.notify(text, color || '#eef0f6', 2.5); }

    /* ============================ Interaction ============================ */
    _findInteractable() {
      const p = this.player;
      if (p.dead) return null;
      const range = CFG.INTERACT_RANGE + TILE * 0.4;
      for (let i = 0; i < this.terminals.length; i++) {
        const t = this.terminals[i];
        if (!t.activated && U.dist(p.x, p.y, t.x, t.y) < range) return { kind: 'hack', target: t };
      }
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (!t.dead && t.charge < 0 && U.dist(p.x, p.y, t.x, t.y) < range) return { kind: 'plant', target: t };
      }
      const w = this.pickups.nearestWeapon(p.x, p.y, 44);
      if (w) return { kind: 'swap', target: w };
      return null;
    }

    _updateInteraction(dt) {
      const p = this.player;
      const it = this._findInteractable();
      this.interactable = it;
      const holding = this.input.isDown('KeyE');
      const pressed = this.input.wasPressed('KeyE');
      for (let i = 0; i < this.terminals.length; i++) {
        const t = this.terminals[i];
        if (!t.activated && (!it || it.target !== t || !holding)) t.progress = Math.max(0, t.progress - dt * 0.15);
      }
      if (!it) return;
      if (it.kind === 'hack' && holding) {
        const t = it.target;
        const before = t.progress;
        t.progress = Math.min(1, t.progress + dt / CFG.HACK_TIME);
        if (Math.floor(before * 8) !== Math.floor(t.progress * 8)) { this.audio.beep(500 + t.progress * 700, 0.05); this.ai.onNoise(t.x, t.y, NOISE.hack, true); }
        if (t.progress >= 1) {
          t.activated = true;
          this.addLight(t.x, t.y, 260, '#19c3dd', 0.8, 1);
          this.particles.pickupBurst(t.x, t.y, '#19c3dd');
          this.notify(BO.t('note.hacked'), '#19c3dd');
          this.audio.pickup('intel');
          this.objectives.notify('activate');
        }
      } else if (it.kind === 'plant' && pressed) {
        it.target.charge = 0;
        this.notify(BO.t('note.charge'), '#ff8a1a');
        this.audio.beep(1200, 0.06);
      } else if (it.kind === 'swap' && pressed) {
        const item = it.target;
        const dropped = p.replaceCurrent(item.weaponId);
        item.collected = true;
        this.pickups.spawn('weapon', p.x + Math.cos(p.angle + Math.PI) * 30, p.y + Math.sin(p.angle + Math.PI) * 30, { weaponId: dropped, permanent: true });
        this.onPickup(item, BO.t('pick.weapon', { name: BO.t('w.' + item.weaponId) }));
      }
    }

    /* ============================ Objectives ============================= */
    onObjectiveStarted(stage, index) {
      if (index > 0) this.ui.objectiveBanner(BO.t('note.newObj'), this.objectives.label(stage));
    }

    onObjectiveProgress(stage) { this.ui.pulseObjective(); }

    onObjectiveComplete(stage) {
      this.audio.pickup('power');
      this.ui.objectiveComplete(this.objectives.label(stage));
      if (stage.type === 'collect') this.notify(BO.t('note.intel'), '#19c3dd');
    }

    openExtraction() {
      this.extractionOpen = true;
      const ex = this.level.extraction;
      this.addLight(ex.x, ex.y, 400, '#3ddc84', 1.2, 1);
      this.notify(BO.t('note.extractReady'), '#3ddc84');
    }

    onAllObjectivesComplete() {
      if (this.state !== STATE.PLAYING) return;
      this.state = STATE.COMPLETE;
      this.player.iframes = 99;
      this.input.releaseLock();
      this.audio.missionComplete();
      this.audio.setMusic('off');
      const res = this._settleRewards();
      this.results = res;
      this.endTimer = 3.2;
      this.ui.missionCompleteBanner(this.mission.finale);
    }

    _rating() {
      const s = this.stats;
      const acc = s.shots ? s.hits / s.shots : 0;
      const timeScore = U.clamp(1.4 - this.time / this.mission.parTime, 0, 1);
      const dmgScore = U.clamp(1 - s.damageTaken / (this.player.maxHp * 3), 0, 1);
      const score = acc * 0.35 + timeScore * 0.35 + dmgScore * 0.3;
      return score > 0.72 ? 'S' : score > 0.55 ? 'A' : score > 0.38 ? 'B' : score > 0.2 ? 'C' : 'D';
    }

    _settleRewards() {
      const def = this.mission, save = this.save.data;
      const rating = this._rating();
      const ratingBonus = { S: 1.5, A: 1.25, B: 1.1, C: 1, D: 1 }[rating];
      const firstClear = save.completedMissions.indexOf(def.id) < 0;
      const base = Math.round(def.rewards.credits * (firstClear ? 1 : 0.5) * ratingBonus);
      const credits = base + this.stats.credits + this.stats.kills * 5;
      this._payout(credits);
      this.grantXP(Math.round(def.rewards.xp * (firstClear ? 1 : 0.5)));
      if (firstClear) save.completedMissions.push(def.id);
      const order = 'SABCD';
      const prev = save.bestRatings[def.id];
      if (!prev || order.indexOf(rating) < order.indexOf(prev)) save.bestRatings[def.id] = rating;
      save.stats.kills += this.stats.kills;
      save.stats.missions++;
      this.save.save();
      return this._buildResults(true, credits, rating);
    }

    _buildResults(success, credits, rating) {
      const s = this.stats;
      return {
        success, mission: this.mission, rating: rating || '-', credits,
        kills: s.kills, accuracy: s.shots ? Math.round(s.hits / s.shots * 100) : 0, headshots: s.headshots,
        time: this.time, damage: Math.round(s.damageTaken), xp: s.xp
      };
    }

    /* ================================ Boss =============================== */
    onBossIntro(boss) {
      this.audio.bossWarning();
      this.audio.setMusic('boss');
      this.camera.addTrauma(0.4);
      this.ui.bossBanner(BO.t('note.bossWarning'), BO.t(boss.mk2 ? 'note.bossNameMk2' : 'note.bossName'));
    }

    onBossPhase(boss, phase) {
      this.audio.bossWarning();
      this.camera.addTrauma(0.6);
      this.particles.spawn(boss.x, boss.y, 0, 0, 0.6, 20, 320, '#ff2d55', BO.PARTICLE_SHAPE.RING, { additive: true });
      this.addLight(boss.x, boss.y, 500, '#ff2d55', 0.8, 1);
      const p = this.player;
      const d = U.dist(p.x, p.y, boss.x, boss.y);
      if (d < 320) { const a = Math.atan2(p.y - boss.y, p.x - boss.x); p.knock(Math.cos(a) * 900, Math.sin(a) * 900); }
      this.ui.bossBanner(BO.t('note.phase', { n: phase }), BO.t(boss.mk2 ? 'note.bossNameMk2' : 'note.bossName'));
    }

    _beginBossDeath(boss) {
      this.slowmoTimer = 2.6;
      this.bossSequence = { t: 0, next: 0, count: 0, boss };
      this.hazards.clearTemporary();
      this.projectiles.pool.items.forEach(pr => { if (pr.active && pr.owner === BO.PROJECTILE_OWNER.ENEMY) this.projectiles.pool.release(pr); });
      this.camera.addTrauma(1);
    }

    _updateBossSequence(realDt) {
      const seq = this.bossSequence;
      if (!seq) return;
      seq.t += realDt;
      const b = seq.boss;
      if (seq.count < 9 && seq.t >= seq.next) {
        seq.count++;
        seq.next = seq.t + 0.22;
        const x = b.x + U.randSpread() * 60, y = b.y + U.randSpread() * 60;
        this.particles.explosion(x, y, 70 + seq.count * 6);
        this.addLight(x, y, 260, '#ff9a3c', 0.4, 1);
        this.audio.explosion(x, y, false);
        this.camera.addTrauma(0.35);
      }
      if (seq.count >= 9 && !seq.final) {
        seq.final = true;
        this.particles.explosion(b.x, b.y, 220);
        this.addLight(b.x, b.y, 700, '#fff1c9', 0.9, 1);
        this.audio.explosion(b.x, b.y, true);
        this.camera.addTrauma(1);
        this.particles.addDecal(b.x, b.y, 1, 110);
        b.removeTimer = 0;
        this.enemies.forEach(e => {
          if (e.minion && !e.dead) this.damageEnemy(e, 99999, 0, 0, { x: e.x, y: e.y, source: 'hazard' });
        });
        this.level.doors.forEach(d => { if (d.arena) d.locked = false; });
        this.ui.bossBanner(BO.t('note.neutralized'), BO.t(b.mk2 ? 'note.bossNameMk2' : 'note.bossName'), '#ffd34d');
        this.objectives.notify('bossDead');
        this.bossSequence = null;
      }
    }
  }

  Game.STATE = STATE;
  BO.Game = Game;
})(window.BO);
