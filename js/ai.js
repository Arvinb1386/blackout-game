/* =========================================================================
 * BLACKOUT :: ai.js
 * Enemy brains: A* pathfinding on the tile grid, perception (vision cone +
 * line of sight + hearing), memory of the last known position and a finite
 * state machine: IDLE, PATROL, ALERT, INVESTIGATE, CHASE, ATTACK, RETREAT,
 * SEARCH, DEAD. Each archetype has its own combat routine.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const CFG = BO.CONFIG;
  const TILE = CFG.TILE;
  const C = BO.Collision;
  const MODE = BO.COLLIDE;
  const S = BO.ENEMY_STATE;
  const SQRT2 = Math.SQRT2;
  const ALLY_ALERT_RADIUS = 460;
  const SEARCH_DURATION = 8;
  const LOSE_SIGHT_DELAY = 1.2;
  const WAYPOINT_REACHED = 14;

  /* --------------------------------------------------------------------- */
  /* A* pathfinder with typed arrays, a binary heap and generation stamps   */
  /* so no memory is cleared or allocated between searches.                 */
  /* --------------------------------------------------------------------- */
  class Pathfinder {
    constructor(map) {
      this.map = map;
      const n = map.w * map.h;
      this.g = new Float32Array(n);
      this.f = new Float32Array(n);
      this.parent = new Int32Array(n);
      this.seen = new Uint32Array(n);
      this.closed = new Uint32Array(n);
      this.heap = new Int32Array(n * 4);
      this.heapSize = 0;
      this.stamp = 0;
    }

    walkable(tx, ty) { return !this.map.blocks(tx, ty, MODE.PATH); }

    _push(i) {
      const h = this.heap, f = this.f;
      if (this.heapSize >= h.length) return;
      let k = this.heapSize++;
      h[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[h[p]] <= f[h[k]]) break;
        const t = h[p]; h[p] = h[k]; h[k] = t; k = p;
      }
    }

    _pop() {
      const h = this.heap, f = this.f;
      const top = h[0];
      const last = h[--this.heapSize];
      if (this.heapSize > 0) {
        h[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < this.heapSize && f[h[l]] < f[h[m]]) m = l;
          if (r < this.heapSize && f[h[r]] < f[h[m]]) m = r;
          if (m === k) break;
          const t = h[m]; h[m] = h[k]; h[k] = t; k = m;
        }
      }
      return top;
    }

    _nearestWalkable(tx, ty) {
      if (this.walkable(tx, ty)) return [tx, ty];
      for (let r = 1; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (this.walkable(tx + dx, ty + dy)) return [tx + dx, ty + dy];
        }
      }
      return null;
    }

    /** Returns an array of world-space waypoints or null. */
    find(sx, sy, gx, gy, maxExpand) {
      const map = this.map, w = map.w;
      const start = this._nearestWalkable(Math.floor(sx / TILE), Math.floor(sy / TILE));
      const goal = this._nearestWalkable(Math.floor(gx / TILE), Math.floor(gy / TILE));
      if (!start || !goal) return null;
      const si = start[1] * w + start[0], gi = goal[1] * w + goal[0];
      if (si === gi) return [{ x: gx, y: gy }];
      this.stamp++;
      const stamp = this.stamp;
      this.heapSize = 0;
      const hx = goal[0], hy = goal[1];
      const heur = (tx, ty) => { const dx = Math.abs(tx - hx), dy = Math.abs(ty - hy); return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy); };
      this.g[si] = 0; this.f[si] = heur(start[0], start[1]); this.parent[si] = -1; this.seen[si] = stamp;
      this._push(si);
      let expanded = 0;
      const limit = maxExpand || 3000;
      while (this.heapSize > 0 && expanded < limit) {
        const cur = this._pop();
        if (this.closed[cur] === stamp) continue;
        this.closed[cur] = stamp;
        expanded++;
        if (cur === gi) return this._build(gi, gx, gy);
        const cx = cur % w, cy = (cur - cx) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            if (!this.walkable(nx, ny)) continue;
            // No corner cutting: diagonal moves need both orthogonal neighbours free.
            if (dx !== 0 && dy !== 0 && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
            const ni = ny * w + nx;
            if (this.closed[ni] === stamp) continue;
            const ng = this.g[cur] + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
            if (this.seen[ni] === stamp && ng >= this.g[ni]) continue;
            this.seen[ni] = stamp;
            this.g[ni] = ng;
            this.f[ni] = ng + heur(nx, ny);
            this.parent[ni] = cur;
            this._push(ni);
          }
        }
      }
      return null;
    }

    _build(gi, gx, gy) {
      const w = this.map.w;
      const pts = [];
      let i = gi;
      let guard = 0;
      while (i !== -1 && guard++ < 4000) {
        const tx = i % w, ty = (i - tx) / w;
        pts.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
        i = this.parent[i];
      }
      pts.reverse();
      pts.shift(); // drop the start tile
      if (pts.length) { pts[pts.length - 1].x = gx; pts[pts.length - 1].y = gy; }
      return pts;
    }
  }

  /** True if a circle of radius r can travel straight between two points. */
  function clearCorridor(map, x0, y0, x1, y1, r) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len * r * 0.9, py = dx / len * r * 0.9;
    return C.lineOfSight(map, x0, y0, x1, y1, MODE.MOVE) &&
      C.lineOfSight(map, x0 + px, y0 + py, x1 + px, y1 + py, MODE.MOVE) &&
      C.lineOfSight(map, x0 - px, y0 - py, x1 - px, y1 - py, MODE.MOVE);
  }

  class AISystem {
    constructor(game) {
      this.game = game;
      this.pathfinder = new Pathfinder(game.map);
      this.pathBudget = 0;
      this.time = 0;
      this._dir = { x: 0, y: 0, arrived: false };
    }

    update(dt) {
      this.time += dt;
      this.pathBudget = CFG.PATH_BUDGET_PER_FRAME;
      const list = this.game.enemies;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.isBoss) continue;
        U.safe('ai.enemy', () => this._updateEnemy(e, dt));
        if (!e.dead && !U.isFiniteNumber(e.x + e.y)) { e.x = e.homeX; e.y = e.homeY; e.setState(S.IDLE); }
      }
      this._separate(list);
    }

    /* --------------------------- Perception --------------------------- */
    _perceive(e) {
      const p = this.game.player;
      e.canSee = false;
      e.clearShot = false;
      if (!p || p.dead) return;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      // A player hiding in the dark is harder to spot unless they just fired.
      const lit = this.game.playerExposure > 0;
      const range = e.def.view * (lit || e.engaged ? 1 : 0.72);
      if (d > range) return;
      const inFov = e.engaged || d < 110 || Math.abs(U.angleDiff(e.angle, Math.atan2(dy, dx))) < e.def.fov / 2;
      if (!inFov) return;
      if (!C.lineOfSight(this.game.map, e.x, e.y, p.x, p.y, MODE.SIGHT)) return;
      e.canSee = true;
      e.lastKnownX = p.x; e.lastKnownY = p.y; e.lastSeenAt = this.time;
      e.clearShot = C.lineOfSight(this.game.map, e.x, e.y, p.x, p.y, MODE.BULLET);
      e.playerDist = d;
    }

    _updateAwareness(e, dt) {
      if (e.canSee) {
        const d = e.playerDist || 300;
        const rate = e.engaged ? 10 : (1.1 + 3.6 * (1 - d / e.def.view)) * (e.state === S.INVESTIGATE || e.state === S.SEARCH ? 1.8 : 1);
        e.awareness = Math.min(1, e.awareness + rate * dt);
      } else if (!e.engaged) {
        e.awareness = Math.max(0, e.awareness - 0.12 * dt);
      }
    }

    /* ------------------------------ Events ----------------------------- */
    engage(e) {
      e.awareness = 1;
      if (!e.engaged) {
        e.setState(S.CHASE);
        this.game.onEnemyEngaged(e);
        this._alertAllies(e);
      }
    }

    _alertAllies(src) {
      const list = this.game.enemies;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o === src || o.dead || o.isBoss || o.engaged) continue;
        if (U.dist2(o.x, o.y, src.x, src.y) > ALLY_ALERT_RADIUS * ALLY_ALERT_RADIUS) continue;
        o.lastKnownX = src.lastKnownX; o.lastKnownY = src.lastKnownY; o.lastSeenAt = this.time - 0.5;
        o.awareness = 1;
        o.setState(S.CHASE);
      }
    }

    /** Gunshots, explosions and hacking make noise that enemies investigate. */
    onNoise(x, y, radius, fromPlayer) {
      const list = this.game.enemies;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.isBoss) continue;
        const d2 = U.dist2(e.x, e.y, x, y);
        if (d2 > radius * radius) continue;
        if (e.engaged) {
          if (fromPlayer && d2 < radius * radius * 0.3) { e.lastKnownX = x; e.lastKnownY = y; e.lastSeenAt = Math.max(e.lastSeenAt, this.time - 0.6); }
          continue;
        }
        e.awareness = Math.max(e.awareness, 0.55);
        e.lastKnownX = x; e.lastKnownY = y;
        e.setState(S.INVESTIGATE);
        e.moveTargetX = x + U.randSpread() * 60;
        e.moveTargetY = y + U.randSpread() * 60;
        e.hasMoveTarget = true;
      }
    }

    onEnemyDamaged(e) {
      if (e.dead) return;
      const p = this.game.player;
      e.lastKnownX = p.x; e.lastKnownY = p.y; e.lastSeenAt = this.time;
      this.engage(e);
    }

    /* ---------------------------- Main loop ---------------------------- */
    _updateEnemy(e, dt) {
      if (e.dead) { e.deathTime += dt; e.removeTimer -= dt; return; }
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.barTimer = Math.max(0, e.barTimer - dt);
      e.meleeCooldown = Math.max(0, e.meleeCooldown - dt);
      e.muzzle = Math.max(0, e.muzzle - dt * 8);
      e.stateTime += dt;
      e.pathAge += dt;
      e.perceptionTimer -= dt;
      if (e.perceptionTimer <= 0) { e.perceptionTimer = CFG.PERCEPTION_INTERVAL; this._perceive(e); }
      this._updateAwareness(e, dt);

      e.desiredX = 0; e.desiredY = 0; e.speedMul = 0; e.faceAngle = null;
      switch (e.state) {
        case S.IDLE: this._idle(e, dt); break;
        case S.PATROL: this._patrol(e, dt); break;
        case S.ALERT: this._alert(e, dt); break;
        case S.INVESTIGATE: this._investigate(e, dt); break;
        case S.CHASE: this._chase(e, dt); break;
        case S.ATTACK: this._attack(e, dt); break;
        case S.RETREAT: this._retreat(e, dt); break;
        case S.SEARCH: this._search(e, dt); break;
        default: e.setState(S.IDLE); // unknown state recovers safely
      }
      this._applyMovement(e, dt);
    }

    _checkSpotted(e) {
      if (!e.canSee) return false;
      if (e.awareness >= 1) { this.engage(e); return true; }
      if (e.awareness > 0.15 && e.state !== S.ALERT) { e.setState(S.ALERT); return true; }
      return false;
    }

    _idle(e, dt) {
      e.timer -= dt;
      e.faceAngle = e.lookAngle + Math.sin(e.stateTime * 0.8) * 0.9;
      if (this._checkSpotted(e)) return;
      if (e.timer <= 0) {
        e.timer = U.rand(1.5, 3.5);
        if (e.patrol.length) e.setState(S.PATROL);
        else e.lookAngle += U.rand(-1.5, 1.5);
      }
    }

    _patrol(e, dt) {
      if (this._checkSpotted(e)) return;
      const pt = e.patrol[e.patrolIndex % e.patrol.length];
      if (!pt) { e.setState(S.IDLE); return; }
      if (this._navigate(e, pt.x, pt.y, 0.45) || e.stateTime > 15) {
        e.patrolIndex = (e.patrolIndex + 1) % e.patrol.length;
        e.lookAngle = e.angle;
        e.timer = U.rand(1.2, 3);
        e.setState(S.IDLE);
      }
    }

    _alert(e, dt) {
      e.faceAngle = Math.atan2(e.lastKnownY - e.y, e.lastKnownX - e.x);
      if (e.awareness >= 1) { this.engage(e); return; }
      if ((!e.canSee && e.stateTime > 1.2) || e.stateTime > 4) {
        e.setState(S.INVESTIGATE);
        e.moveTargetX = e.lastKnownX; e.moveTargetY = e.lastKnownY; e.hasMoveTarget = true;
      }
    }

    _investigate(e, dt) {
      if (e.canSee && e.awareness > 0.5) { this.engage(e); return; }
      if (!e.hasMoveTarget) { e.moveTargetX = e.lastKnownX; e.moveTargetY = e.lastKnownY; e.hasMoveTarget = true; }
      if (this._navigate(e, e.moveTargetX, e.moveTargetY, 0.7) || e.stateTime > 12) e.setState(S.SEARCH);
    }

    _chase(e, dt) {
      const p = this.game.player;
      if (p.dead) { e.setState(S.SEARCH); return; }
      const tx = e.canSee ? p.x : e.lastKnownX, ty = e.canSee ? p.y : e.lastKnownY;
      const d = U.dist(e.x, e.y, p.x, p.y);
      if (e.canSee) {
        const attackRange = e.type === 'rusher' ? 240 : e.def.range * 0.92;
        if (d <= attackRange && (e.clearShot || e.type === 'rusher')) { this._enterAttack(e); return; }
      }
      const arrived = this._navigate(e, tx, ty, e.type === 'heavy' ? 1 : 0.95);
      if (!e.canSee && (arrived || this.time - e.lastSeenAt > 9)) { e.setState(S.SEARCH); }
    }

    _enterAttack(e) {
      e.setState(S.ATTACK);
      e.fireTimer = Math.max(e.fireTimer, e.type === 'grunt' ? 0.4 : 0.2);
      e.repositionTimer = U.rand(1.5, 3);
    }

    _attack(e, dt) {
      const p = this.game.player;
      if (p.dead) { e.setState(S.SEARCH); return; }
      if (!e.canSee && this.time - e.lastSeenAt > (e.type === 'rusher' ? 0.6 : LOSE_SIGHT_DELAY)) {
        e.charge = 0; e.spin = 0; e.sprayLeft = 0; e.windup = 0;
        e.setState(S.CHASE);
        return;
      }
      const d = U.dist(e.x, e.y, p.x, p.y);
      if (e.type === 'grunt' && !e.retreated && e.hp / e.maxHp < e.def.retreatAt) { this._startRetreat(e); return; }
      if (e.type === 'sniper' && d < e.def.minRange && e.canSee) { this._startRetreat(e); return; }
      switch (e.type) {
        case 'rusher': this._rusherCombat(e, dt, p, d); break;
        case 'heavy': this._heavyCombat(e, dt, p, d); break;
        case 'sniper': this._sniperCombat(e, dt, p, d); break;
        default: this._gruntCombat(e, dt, p, d);
      }
    }

    _startRetreat(e) {
      e.retreated = true;
      e.charge = 0;
      const pt = this._findPoint(e, 'hidden');
      e.setState(S.RETREAT);
      if (pt) { e.moveTargetX = pt.x; e.moveTargetY = pt.y; e.hasMoveTarget = true; }
    }

    _retreat(e, dt) {
      if (!e.hasMoveTarget) { e.setState(S.CHASE); return; }
      const arrived = this._navigate(e, e.moveTargetX, e.moveTargetY, 1.1);
      if (arrived) e.faceAngle = Math.atan2(e.lastKnownY - e.y, e.lastKnownX - e.x);
      if ((arrived && e.stateTime > 1.8) || e.stateTime > 5) {
        if (e.type === 'sniper') e.retreated = false;
        if (e.canSee && e.clearShot) this._enterAttack(e);
        else e.setState(S.CHASE);
      }
    }

    _search(e, dt) {
      if (e.canSee && e.awareness > 0.4) { this.engage(e); return; }
      e.awareness = Math.min(e.awareness, 0.6);
      if (!e.hasMoveTarget) {
        const pt = this._randomFloorNear(e.lastKnownX, e.lastKnownY, 5);
        if (pt) { e.moveTargetX = pt.x; e.moveTargetY = pt.y; e.hasMoveTarget = true; }
      }
      if (e.hasMoveTarget && this._navigate(e, e.moveTargetX, e.moveTargetY, 0.6)) {
        e.hasMoveTarget = false;
        e.lookAngle = e.angle;
      }
      if (!e.hasMoveTarget) e.faceAngle = e.lookAngle + Math.sin(e.stateTime * 3) * 1.2;
      if (e.stateTime > SEARCH_DURATION) {
        e.awareness = 0.1;
        e.retreated = false;
        if (e.isWave) {
          // Wave attackers keep hunting; they know roughly where the player is.
          e.lastKnownX = this.game.player.x; e.lastKnownY = this.game.player.y;
          e.setState(S.INVESTIGATE);
        } else e.setState(e.patrol.length ? S.PATROL : S.IDLE);
      }
    }

    /* --------------------------- Archetypes --------------------------- */
    _gruntCombat(e, dt, p, d) {
      e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
      e.repositionTimer -= dt;
      if (e.canSee && !e.clearShot) e.repositionTimer = Math.min(e.repositionTimer, 0.4);
      if (e.repositionTimer <= 0) {
        e.repositionTimer = U.rand(2.5, 4.5);
        const pt = this._findPoint(e, 'fight');
        if (pt) { e.moveTargetX = pt.x; e.moveTargetY = pt.y; e.hasMoveTarget = true; }
      }
      if (e.hasMoveTarget) {
        if (this._navigate(e, e.moveTargetX, e.moveTargetY, 0.75)) e.hasMoveTarget = false;
        e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
      } else {
        this._strafe(e, dt, p, d, 0.5);
      }
      this._burstFire(e, dt);
    }

    _strafe(e, dt, p, d, speed) {
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) { e.strafeTimer = U.rand(0.8, 2); e.strafeDir *= -1; }
      const ax = (p.x - e.x) / (d || 1), ay = (p.y - e.y) / (d || 1);
      const radial = U.clamp((d - e.def.prefRange) / 120, -1, 1);
      e.desiredX = -ay * e.strafeDir + ax * radial;
      e.desiredY = ax * e.strafeDir + ay * radial;
      e.speedMul = speed;
    }

    _burstFire(e, dt) {
      e.fireTimer -= dt;
      if (e.fireTimer > 0) return;
      const aimed = Math.abs(U.angleDiff(e.angle, e.faceAngle === null ? e.angle : e.faceAngle)) < 0.3;
      if (e.burstLeft > 0) {
        this._shoot(e, e.def.spread, e.def.damage, e.def.bulletSpeed, BO.PROJECTILE_KIND.TRACER, '#ff3355', 2);
        e.burstLeft--;
        e.fireTimer = e.burstLeft > 0 ? e.def.fireInterval : U.rand(e.def.burstPause[0], e.def.burstPause[1]);
      } else if (e.canSee && e.clearShot && aimed) {
        e.burstLeft = e.def.burst;
      }
    }

    _rusherCombat(e, dt, p, d) {
      const reach = e.def.meleeRange + e.r + p.r;
      if (e.lunge > 0) {
        e.lunge -= dt;
        e.desiredX = Math.cos(e.lockedAngle); e.desiredY = Math.sin(e.lockedAngle);
        e.speedMul = 1.9;
        e.faceAngle = e.lockedAngle;
        if (!e.meleeHit && d < reach) {
          e.meleeHit = true;
          this.game.onPlayerMelee(e, e.def.meleeDamage * e.diff.damage);
        }
        if (e.lunge <= 0) e.meleeCooldown = e.def.meleeCooldown;
        return;
      }
      if (e.windup > 0) {
        e.windup -= dt;
        e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
        if (e.windup <= 0) {
          e.lunge = 0.17;
          e.lockedAngle = e.angle;
          e.meleeHit = false;
          this.game.audio.melee(e.x, e.y);
        }
        return;
      }
      if (e.meleeCooldown <= 0 && d < reach + 26) { e.windup = e.def.windup; return; }
      // Zig-zag approach makes rushers harder to track.
      const zig = Math.sin(e.stateTime * 7 + e.id) * 0.55;
      const ax = (p.x - e.x) / (d || 1), ay = (p.y - e.y) / (d || 1);
      if (e.canSee && clearCorridor(this.game.map, e.x, e.y, p.x, p.y, e.r)) {
        e.desiredX = ax - ay * zig; e.desiredY = ay + ax * zig;
        e.speedMul = e.meleeCooldown > 0 ? 0.6 : 1;
        e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
      } else {
        this._navigate(e, p.x, p.y, 1);
      }
    }

    _heavyCombat(e, dt, p, d) {
      e.faceAngle = Math.atan2(p.y - e.y, p.x - e.x);
      if (d > e.def.prefRange) this._navigate(e, p.x, p.y, e.sprayLeft > 0 ? 0.55 : 1);
      else this._strafe(e, dt, p, d, 0.3);
      if (e.sprayLeft > 0) {
        e.sprayLeft -= dt;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = e.def.fireInterval;
          this._shoot(e, e.def.spread, e.def.damage, e.def.bulletSpeed, BO.PROJECTILE_KIND.TRACER, '#ff4a3d', 2.6);
        }
        if (e.sprayLeft <= 0) { e.spin = 0; e.sprayCooldown = e.def.sprayCooldown; }
        return;
      }
      if (e.sprayCooldown > 0) { e.sprayCooldown -= dt; return; }
      if (e.canSee && e.clearShot) {
        e.spin = Math.min(1, e.spin + dt / e.def.spinUp);
        if (e.spin >= 1) { e.sprayLeft = e.def.sprayTime; e.fireTimer = 0; }
      } else {
        e.spin = Math.max(0, e.spin - dt);
      }
    }

    _sniperCombat(e, dt, p, d) {
      const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
      const lockAt = e.def.chargeTime - e.def.lockTime;
      if (e.charge < lockAt) e.faceAngle = toPlayer;
      else e.faceAngle = e.lockedAngle;
      if (e.hasMoveTarget) {
        if (this._navigate(e, e.moveTargetX, e.moveTargetY, 0.9)) e.hasMoveTarget = false;
        e.charge = 0;
        return;
      }
      if (e.shotCooldown > 0) { e.shotCooldown -= dt; e.charge = 0; return; }
      if ((e.canSee && e.clearShot) || e.charge >= lockAt) {
        const before = e.charge;
        e.charge += dt;
        this.game.audio.sniperCharge(e.x, e.y, e.charge / e.def.chargeTime);
        if (before < lockAt && e.charge >= lockAt) e.lockedAngle = e.angle;
        if (e.charge >= e.def.chargeTime) {
          e.angle = e.lockedAngle;
          this._shoot(e, e.def.spread, e.def.damage, e.def.bulletSpeed, BO.PROJECTILE_KIND.SNIPER, '#ff2d55', 3);
          e.charge = 0;
          e.shotCooldown = e.def.shotCooldown;
          if (U.chance(0.45)) {
            const pt = this._findPoint(e, 'fight');
            if (pt) { e.moveTargetX = pt.x; e.moveTargetY = pt.y; e.hasMoveTarget = true; }
          }
        }
      } else {
        e.charge = Math.max(0, e.charge - dt * 2);
      }
    }

    _shoot(e, spread, damage, speed, kind, color, width) {
      const acc = e.diff.accuracy || 1;
      const a = e.angle + U.randSpread() * spread / acc;
      const S2 = BO.SHOT;
      const off = e.r + (e.def.weaponLen || 10);
      S2.x = e.x + Math.cos(e.angle) * off; S2.y = e.y + Math.sin(e.angle) * off;
      const block = C.raycast(this.game.map, e.x, e.y, S2.x, S2.y, MODE.BULLET);
      if (block.hit) { S2.x = e.x; S2.y = e.y; }
      S2.angle = a; S2.speed = speed; S2.damage = damage * e.diff.damage; S2.range = e.def.range * 1.3;
      S2.owner = BO.PROJECTILE_OWNER.ENEMY; S2.kind = kind; S2.color = color; S2.width = width;
      S2.pierce = 0; S2.explosive = 0; S2.knockback = 40; S2.hitStop = 0; S2.critChance = 0; S2.source = e; S2.radius = 2;
      this.game.projectiles.spawn(S2);
      e.muzzle = 1;
      this.game.onEnemyFired(e, S2.x, S2.y, e.angle);
    }

    /* --------------------------- Navigation --------------------------- */
    /** Steers towards a world point. Returns true once arrived. */
    _navigate(e, tx, ty, speedMul) {
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < WAYPOINT_REACHED) return true;
      e.speedMul = speedMul;
      const map = this.game.map;
      if (d < 280 && clearCorridor(map, e.x, e.y, tx, ty, e.r)) {
        e.path = null;
        e.desiredX = dx / d; e.desiredY = dy / d;
        return false;
      }
      const goalMoved = U.dist2(e.pathGoalX, e.pathGoalY, tx, ty) > (TILE * 1.5) * (TILE * 1.5);
      if ((!e.path || goalMoved || e.pathAge > 2.5) && this.pathBudget > 0) {
        this.pathBudget--;
        e.path = this.pathfinder.find(e.x, e.y, tx, ty, 2600);
        e.pathIndex = 0; e.pathAge = 0; e.pathGoalX = tx; e.pathGoalY = ty;
      }
      if (e.path && e.path.length) {
        // Skip ahead to the furthest directly reachable waypoint (cheap smoothing).
        if (e.pathIndex + 1 < e.path.length) {
          const nxt = e.path[e.pathIndex + 1];
          if (clearCorridor(map, e.x, e.y, nxt.x, nxt.y, e.r)) e.pathIndex++;
        }
        let wp = e.path[e.pathIndex];
        if (U.dist2(e.x, e.y, wp.x, wp.y) < WAYPOINT_REACHED * WAYPOINT_REACHED) {
          e.pathIndex++;
          if (e.pathIndex >= e.path.length) { e.path = null; return d < TILE; }
          wp = e.path[e.pathIndex];
        }
        const wx = wp.x - e.x, wy = wp.y - e.y;
        const wl = Math.sqrt(wx * wx + wy * wy) || 1;
        e.desiredX = wx / wl; e.desiredY = wy / wl;
        return false;
      }
      e.desiredX = dx / d; e.desiredY = dy / d;
      if (e.pathAge > 1 && e.stateTime > 6 && d < TILE * 2) return true;
      return false;
    }

    _randomFloorNear(x, y, radiusTiles) {
      const map = this.game.map;
      const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
      for (let i = 0; i < 14; i++) {
        const tx = cx + U.randInt(-radiusTiles, radiusTiles), ty = cy + U.randInt(-radiusTiles, radiusTiles);
        if (!this.pathfinder.walkable(tx, ty)) continue;
        const wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2;
        if (C.lineOfSight(map, x, y, wx, wy, MODE.SIGHT) || i > 8) return { x: wx, y: wy };
      }
      return null;
    }

    /**
     * Tactical point selection.
     * 'fight'  : near the preferred range, with a clear shot, preferably beside cover.
     * 'hidden' : out of the player's line of fire (for retreating / regrouping).
     */
    _findPoint(e, kind) {
      const map = this.game.map, p = this.game.player;
      const cx = Math.floor(e.x / TILE), cy = Math.floor(e.y / TILE);
      let best = null, bestScore = -1e9;
      for (let i = 0; i < 16; i++) {
        const rr = U.randInt(2, kind === 'hidden' ? 8 : 6);
        const a = Math.random() * U.TAU;
        const tx = cx + Math.round(Math.cos(a) * rr), ty = cy + Math.round(Math.sin(a) * rr);
        if (!this.pathfinder.walkable(tx, ty)) continue;
        const wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2;
        if (!map.isCircleFree(wx, wy, e.r)) continue;
        const dp = U.dist(wx, wy, p.x, p.y);
        const exposed = C.lineOfSight(map, p.x, p.y, wx, wy, MODE.BULLET);
        const nearCover = this._adjacentCover(tx, ty);
        let score = -U.dist(e.x, e.y, wx, wy) / 400 + Math.random() * 0.4;
        if (kind === 'hidden') score += (exposed ? 0 : 3) + dp / 400 + (nearCover ? 0.5 : 0);
        else score += (exposed ? 2.2 : 0) - Math.abs(dp - e.def.prefRange) / 140 + (nearCover ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = { x: wx, y: wy }; }
      }
      return best;
    }

    _adjacentCover(tx, ty) {
      const map = this.game.map;
      return map.blocks(tx + 1, ty, MODE.BULLET) || map.blocks(tx - 1, ty, MODE.BULLET) ||
        map.blocks(tx, ty + 1, MODE.BULLET) || map.blocks(tx, ty - 1, MODE.BULLET);
    }

    _applyMovement(e, dt) {
      const speed = e.def.speed * (e.speedMul || 0);
      e.vx = U.damp(e.vx, e.desiredX * speed, 10, dt);
      e.vy = U.damp(e.vy, e.desiredY * speed, 10, dt);
      e.kx = U.damp(e.kx, 0, 9, dt);
      e.ky = U.damp(e.ky, 0, 9, dt);
      C.moveCircle(this.game.map, e, (e.vx + e.kx) * dt, (e.vy + e.ky) * dt, e.r);
      let face = e.faceAngle;
      const mv = Math.abs(e.vx) + Math.abs(e.vy);
      if (face === null && mv > 8) face = Math.atan2(e.vy, e.vx);
      if (face !== null) e.angle = U.turnTowards(e.angle, face, e.def.turn * dt);
      e.walk += mv * dt * 0.06;
    }

    /** Soft separation so squads do not stack into one blob, and do not overlap the player. */
    _separate(list) {
      const p = this.game.player;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.dead) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (b.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = a.r + b.r + 4;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 1e-4) continue;
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const wa = a.isBoss ? 0 : 1, wb = b.isBoss ? 0 : 1;
          a.x -= dx / d * push * wa; a.y -= dy / d * push * wa;
          b.x += dx / d * push * wb; b.y += dy / d * push * wb;
        }
        if (p && !p.dead) {
          const dx = a.x - p.x, dy = a.y - p.y;
          const min = a.r + p.r;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 1e-4) {
            const d = Math.sqrt(d2), push = min - d;
            if (a.isBoss) { p.x -= dx / d * push; p.y -= dy / d * push; }
            else { a.x += dx / d * push * 0.6; a.y += dy / d * push * 0.6; p.x -= dx / d * push * 0.4; p.y -= dy / d * push * 0.4; }
          }
        }
      }
    }
  }

  BO.Pathfinder = Pathfinder;
  BO.AISystem = AISystem;
  BO.clearCorridor = clearCorridor;
})(window.BO);
