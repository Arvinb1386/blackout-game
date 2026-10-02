/* =========================================================================
 * BLACKOUT :: objectives.js
 * Sequential mission objectives that update dynamically, plus the wave
 * director used by "survive" objectives.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const CFG = BO.CONFIG;

  const LABELS = {
    eliminate: 'obj.eliminate', destroy: 'obj.destroy', collect: 'obj.collect', activate: 'obj.activate',
    survive: 'obj.survive', boss: 'obj.boss', extract: 'obj.extract'
  };

  class ObjectiveSystem {
    constructor(game, defs) {
      this.game = game;
      this.stages = (defs || []).map(d => Object.assign({ progress: 0, total: 1, done: false, timeLeft: 0, extractTime: 0 }, d));
      this.index = -1;
      this.finished = false;
    }

    get current() { return this.stages[this.index] || null; }

    start() { this._next(); }

    _next() {
      this.index++;
      const s = this.current;
      if (!s) { this.finished = true; this.game.onAllObjectivesComplete(); return; }
      U.safe('objective.begin', () => this._begin(s));
      this.game.onObjectiveStarted(s, this.index);
      const autoDone = ((s.type === 'eliminate' || s.type === 'destroy') && s.total <= 0) ||
        (s.type !== 'survive' && s.type !== 'extract' && s.progress >= s.total);
      if (autoDone) this._complete(s);
    }

    _begin(s) {
      const g = this.game;
      switch (s.type) {
        case 'eliminate': s.total = g.enemies.filter(e => !e.dead && !e.isBoss && !e.isWave && !e.minion).length; break;
        case 'destroy': s.total = g.targets.filter(t => t.kind === s.target && !t.dead).length; break;
        case 'collect': s.total = s.count; break;
        case 'activate': s.total = s.count; break;
        case 'survive': s.timeLeft = s.duration; s.total = s.duration; g.waves.start(s); break;
        case 'boss': s.total = 1; g.unlockBossArena(); break;
        case 'extract': s.total = 1; g.openExtraction(); break;
        default: s.total = 1; s.progress = 1; // unknown objective type: auto-complete instead of soft-locking
      }
    }

    _complete(s) {
      if (s.done) return;
      s.done = true;
      this.game.onObjectiveComplete(s);
      this._next();
    }

    /** Gameplay events feed progress into the active objective only. */
    notify(event, data) {
      const s = this.current;
      if (!s || s.done) return;
      let match = false;
      if (event === 'kill' && s.type === 'eliminate' && data && !data.isWave && !data.minion && !data.isBoss) match = true;
      else if (event === 'destroy' && s.type === 'destroy' && data === s.target) match = true;
      else if (event === 'collect' && s.type === 'collect') match = true;
      else if (event === 'activate' && s.type === 'activate') match = true;
      else if (event === 'bossDead' && s.type === 'boss') match = true;
      if (!match) return;
      s.progress = Math.min(s.total, s.progress + 1);
      this.game.onObjectiveProgress(s);
      if (s.progress >= s.total) this._complete(s);
    }

    update(dt) {
      const s = this.current;
      if (!s || s.done) return;
      if (s.type === 'survive') {
        s.timeLeft -= dt;
        s.progress = s.duration - Math.max(0, s.timeLeft);
        if (s.timeLeft <= 0) { this.game.waves.stop(); this._complete(s); }
      } else if (s.type === 'extract') {
        const g = this.game, p = g.player, ex = g.level.extraction;
        const inside = p && !p.dead && U.dist(p.x, p.y, ex.x, ex.y) < CFG.EXTRACTION_RADIUS;
        s.extractTime = inside ? s.extractTime + dt : Math.max(0, s.extractTime - dt * 2);
        if (s.extractTime >= CFG.EXTRACTION_TIME) this._complete(s);
      }
    }

    label(s) {
      const stage = s || this.current;
      if (!stage) return '';
      let text = BO.t(stage.type === 'destroy' && stage.target === 'core' ? 'obj.destroyCore' : LABELS[stage.type] || 'obj.extract');
      const I = BO.I18N;
      if (stage.type === 'eliminate' || stage.type === 'destroy' || stage.type === 'collect' || stage.type === 'activate') {
        text += '  ' + I.num(stage.progress) + '/' + I.num(stage.total);
      } else if (stage.type === 'survive') {
        text += '  ' + I.num(U.formatTime(Math.max(0, stage.timeLeft)));
      }
      return text;
    }

    /** World positions the HUD should point at for the current objective. */
    markers(out) {
      out.length = 0;
      const s = this.current, g = this.game;
      if (!s) return out;
      switch (s.type) {
        case 'destroy': g.targets.forEach(t => { if (t.kind === s.target && !t.dead) out.push(t); }); break;
        case 'collect': g.pickups.items.forEach(it => { if (it.type === 'intel') out.push(it); }); break;
        case 'activate': g.terminals.forEach(t => { if (!t.activated) out.push(t); }); break;
        case 'boss': if (g.boss && !g.boss.dead) out.push(g.boss); else if (g.level.arenaCenter) out.push(g.level.arenaCenter); break;
        case 'extract': out.push(g.level.extraction); break;
        case 'survive': if (g.level.uplink) out.push(g.level.uplink); break;
        case 'eliminate': {
          const alive = g.enemies.filter(e => !e.dead && !e.isBoss && !e.isWave);
          if (alive.length <= 4) alive.forEach(e => out.push(e));
          break;
        }
        default: break;
      }
      return out;
    }
  }

  /** Spawns timed waves of hostiles out of the player's sight during "survive". */
  class WaveDirector {
    constructor(game) {
      this.game = game;
      this.active = false;
      this.timer = 0;
      this.wave = 0;
      this.stage = null;
    }

    start(stage) {
      this.active = true;
      this.stage = stage;
      this.timer = 2;
      this.wave = 0;
    }

    stop() { this.active = false; }

    update(dt) {
      if (!this.active) return;
      this.timer -= dt;
      if (this.timer > 0) return;
      const g = this.game;
      const alive = g.enemies.filter(e => !e.dead && e.isWave).length;
      this.timer = this.stage.interval || 11;
      if (alive >= (this.stage.maxAlive || 9)) return;
      this.wave++;
      const size = Math.min((this.stage.waveSize || 3) + Math.floor(this.wave / 2), 6);
      const types = this.stage.types || ['grunt', 'rusher'];
      let spawned = 0;
      for (let i = 0; i < size; i++) {
        const pt = this._spawnPoint();
        if (!pt) continue;
        const e = g.spawnEnemy(U.pick(types), pt.x, pt.y, { wave: true });
        if (e) spawned++;
      }
      if (spawned) g.notify(BO.t('note.waveIncoming'), '#ff3355');
    }

    _spawnPoint() {
      const g = this.game, p = g.player;
      const pts = g.level.spawnPoints;
      for (let tries = 0; tries < 20; tries++) {
        const pt = U.pick(pts);
        if (!pt) return null;
        const d = U.dist(pt.x, pt.y, p.x, p.y);
        if (d < 520 || d > 1800) continue;
        if (BO.Collision.lineOfSight(g.map, pt.x, pt.y, p.x, p.y, BO.COLLIDE.SIGHT)) continue;
        if (!g.map.isCircleFree(pt.x, pt.y, 16)) continue;
        return pt;
      }
      return null;
    }
  }

  BO.ObjectiveSystem = ObjectiveSystem;
  BO.WaveDirector = WaveDirector;
})(window.BO);
