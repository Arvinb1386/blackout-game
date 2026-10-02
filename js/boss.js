/* =========================================================================
 * BLACKOUT :: boss.js
 * THE WARDEN. Three phases, six telegraphed attacks, minion spawning,
 * arena hazards, phase transitions and a cinematic death.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TILE = BO.CONFIG.TILE;
  const C = BO.Collision;
  const ORB = BO.PROJECTILE_KIND.ORB;
  const COLOR = '#ff2d55';
  const PHASE_SPEED = [0, 85, 110, 175];
  const PHASE_COOLDOWN = [0, 1.35, 1.0, 0.7];
  const PHASE_ATTACKS = [
    [],
    ['fan', 'stream', 'fan'],
    ['fan', 'stream', 'mortar', 'summon', 'mortar'],
    ['fan', 'mortar', 'nova', 'charge', 'nova', 'charge', 'summon']
  ];
  const TELEGRAPH = { fan: 0.6, stream: 0.45, mortar: 0.5, summon: 0.9, nova: 0.95, charge: 0.85 };
  const MAX_MINIONS = 4;

  class Boss {
    constructor(x, y, arena, mk2) {
      this.isBoss = true;
      this.type = 'boss';
      this.mk2 = !!mk2;
      this.def = { color: COLOR, knockResist: 0.04, xp: mk2 ? 900 : 600, credits: [160, 220], r: 40 };
      this.x = x; this.y = y;
      this.r = 40;
      this.maxHp = mk2 ? 9500 : 6500;
      this.hp = this.maxHp;
      this.arena = arena; // world rect {x, y, w, h}
      this.angle = Math.PI;
      this.phase = 1;
      this.mode = 'dormant';
      this.modeTime = 0;
      this.attack = null;
      this.cooldown = 2;
      this.lastAttack = '';
      this.moveX = x; this.moveY = y; this.moveTimer = 0;
      this.vx = 0; this.vy = 0; this.kx = 0; this.ky = 0;
      this.hitFlash = 0; this.dead = false; this.deathTime = 0; this.removeTimer = 999;
      this.fieldTimer = 4;
      this.stun = 0;
      this.ringSpin = 0;
      this.visible = true;
      this.shieldFlash = 0;
      this.minions = [];
    }

    get engaged() { return this.mode === 'fight'; }
    get invulnerable() { return this.mode !== 'fight'; }

    activate(game) {
      if (this.mode !== 'dormant') return;
      this.mode = 'intro';
      this.modeTime = 0;
      game.onBossIntro(this);
    }

    takeDamage(amount, kx, ky) {
      if (this.dead) return false;
      if (this.invulnerable) { this.shieldFlash = 0.15; return false; }
      this.hp -= amount * (this.stun > 0 ? 1.5 : 1);
      this.hitFlash = 0.06;
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.mode = 'dying';
        this.deathTime = 0;
        return true;
      }
      return false;
    }

    update(dt, game) {
      this.modeTime += dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.shieldFlash = Math.max(0, this.shieldFlash - dt);
      this.ringSpin += dt * (0.6 + this.phase * 0.5);
      if (this.dead) { this.deathTime += dt; return; }
      const p = game.player;
      if (this.mode === 'dormant') return;
      if (this.mode === 'intro') {
        this.angle = U.turnTowards(this.angle, Math.atan2(p.y - this.y, p.x - this.x), dt * 2);
        if (this.modeTime > 2.2) { this.mode = 'fight'; this.modeTime = 0; }
        return;
      }
      if (this.mode === 'transition') {
        if (this.modeTime > 1.7) { this.mode = 'fight'; this.modeTime = 0; this.cooldown = 0.6; }
        return;
      }
      this._checkPhase(game);
      if (this.mode !== 'fight') return;
      this.stun = Math.max(0, this.stun - dt);
      if (this.stun > 0) return;
      this._updateMovement(dt, game, p);
      this._updateAttacks(dt, game, p);
      if (this.phase === 3) this._updateArenaFields(dt, game);
    }

    _checkPhase(game) {
      const frac = this.hp / this.maxHp;
      const target = frac <= 0.33 ? 3 : (frac <= 0.66 ? 2 : 1);
      if (target <= this.phase) return;
      this.phase = target;
      this.mode = 'transition';
      this.modeTime = 0;
      this.attack = null;
      game.onBossPhase(this, target);
    }

    _updateMovement(dt, game, p) {
      if (this.attack && this.attack.name === 'charge' && this.attack.stage === 'dash') return;
      this.moveTimer -= dt;
      const a = this.arena;
      const margin = TILE * 2.5;
      if (this.moveTimer <= 0 || U.dist(this.x, this.y, this.moveX, this.moveY) < 20) {
        this.moveTimer = U.rand(1.6, 3.2);
        if (this.phase === 3 && U.chance(0.6)) {
          this.moveX = U.clamp(p.x + U.randSpread() * 140, a.x + margin, a.x + a.w - margin);
          this.moveY = U.clamp(p.y + U.randSpread() * 140, a.y + margin, a.y + a.h - margin);
        } else {
          this.moveX = U.rand(a.x + margin, a.x + a.w - margin);
          this.moveY = U.rand(a.y + margin, a.y + a.h - margin);
        }
      }
      const slow = this.attack && (this.attack.name === 'stream' || this.attack.stage === 'tele') ? 0.4 : 1;
      const dx = this.moveX - this.x, dy = this.moveY - this.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const sp = PHASE_SPEED[this.phase] * slow * (this.mk2 ? 1.1 : 1);
      this.vx = U.damp(this.vx, dx / d * sp, 4, dt);
      this.vy = U.damp(this.vy, dy / d * sp, 4, dt);
      this.kx = U.damp(this.kx, 0, 8, dt); this.ky = U.damp(this.ky, 0, 8, dt);
      C.moveCircle(game.map, this, (this.vx + this.kx) * dt, (this.vy + this.ky) * dt, this.r);
      if (!this.attack || this.attack.stage !== 'tele' || this.attack.name !== 'charge') {
        this.angle = U.turnTowards(this.angle, Math.atan2(p.y - this.y, p.x - this.x), dt * (1.6 + this.phase * 0.6));
      }
    }

    _updateAttacks(dt, game, p) {
      if (!this.attack) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return;
        const pool = PHASE_ATTACKS[this.phase];
        let name = U.pick(pool);
        if (name === this.lastAttack) name = U.pick(pool);
        if (name === 'summon' && this._aliveMinions() >= MAX_MINIONS) name = 'fan';
        this.lastAttack = name;
        this.attack = { name, stage: 'tele', t: 0, shots: 0, timer: 0, aim: Math.atan2(p.y - this.y, p.x - this.x) };
        game.audio.telegraph();
        return;
      }
      const atk = this.attack;
      atk.t += dt;
      if (atk.stage === 'tele') {
        if (atk.name === 'charge' || atk.name === 'fan') {
          if (atk.name === 'fan' || atk.t < TELEGRAPH.charge * 0.6) atk.aim = U.turnTowards(atk.aim, Math.atan2(p.y - this.y, p.x - this.x), dt * 3);
          if (atk.name === 'charge') this.angle = atk.aim;
        }
        if (atk.t >= TELEGRAPH[atk.name]) { atk.stage = 'run'; atk.t = 0; this._beginAttack(atk, game, p); }
        return;
      }
      switch (atk.name) {
        case 'fan': this._runFan(atk, dt, game, p); break;
        case 'stream': this._runStream(atk, dt, game, p); break;
        case 'nova': this._runNova(atk, dt, game); break;
        case 'charge': this._runCharge(atk, dt, game, p); break;
        default: if (atk.t > 0.6) this._endAttack();
      }
    }

    _beginAttack(atk, game, p) {
      if (atk.name === 'mortar') {
        const n = this.phase === 3 ? 7 : 5;
        game.hazards.addStrike(p.x + p.vx * 0.4, p.y + p.vy * 0.4, 88, 1.25, 30);
        for (let i = 1; i < n; i++) {
          const a = Math.random() * U.TAU, r = U.rand(110, 280);
          game.hazards.addStrike(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 80, 1.25 + i * 0.12, 28);
        }
      } else if (atk.name === 'summon') {
        const count = Math.min(MAX_MINIONS - this._aliveMinions(), this.phase === 3 ? 3 : 2);
        for (let i = 0; i < count; i++) {
          const type = this.phase === 3 && i === 0 ? 'heavy' : (U.chance(0.5) ? 'rusher' : 'grunt');
          const m = game.spawnBossMinion(type, this);
          if (m) this.minions.push(m);
        }
      } else if (atk.name === 'charge') {
        atk.stage = 'dash';
        atk.hit = false;
        game.audio.melee(this.x, this.y);
      } else if (atk.name === 'stream') {
        atk.aim = this.angle;
      }
    }

    _aliveMinions() {
      let n = 0;
      for (let i = 0; i < this.minions.length; i++) if (!this.minions[i].dead) n++;
      return n;
    }

    _endAttack() {
      this.attack = null;
      this.cooldown = PHASE_COOLDOWN[this.phase] * (this.mk2 ? 0.85 : 1);
    }

    _orb(game, angle, speed, damage, color) {
      const S = BO.SHOT;
      S.x = this.x + Math.cos(angle) * (this.r + 6); S.y = this.y + Math.sin(angle) * (this.r + 6);
      S.angle = angle; S.speed = speed; S.damage = damage; S.range = 1500;
      S.owner = BO.PROJECTILE_OWNER.ENEMY; S.kind = ORB; S.color = color || COLOR; S.width = 3;
      S.pierce = 0; S.explosive = 0; S.knockback = 60; S.hitStop = 0; S.critChance = 0; S.source = this; S.radius = 5;
      game.projectiles.spawn(S);
    }

    _runFan(atk, dt, game) {
      atk.timer -= dt;
      if (atk.timer > 0) return;
      const volleys = this.phase === 3 ? 4 : 3;
      const count = this.phase === 1 ? 7 : 9;
      const spreadA = 1.15;
      const speed = 420 + this.phase * 50;
      for (let i = 0; i < count; i++) {
        const a = atk.aim - spreadA / 2 + spreadA * (i / (count - 1)) + (atk.shots % 2 ? spreadA / (count - 1) / 2 : 0);
        this._orb(game, a, speed, 12);
      }
      game.onBossFired(this);
      atk.shots++;
      atk.timer = 0.28;
      if (atk.shots >= volleys) this._endAttack();
    }

    _runStream(atk, dt, game, p) {
      atk.aim = U.turnTowards(atk.aim, Math.atan2(p.y - this.y, p.x - this.x), dt * (1.3 + this.phase * 0.4));
      this.angle = atk.aim;
      atk.timer -= dt;
      if (atk.timer <= 0) {
        atk.timer = this.phase === 1 ? 1 / 11 : 1 / 15;
        this._orb(game, atk.aim + U.randSpread() * 0.06, 560, 8, '#ff6b81');
        if (atk.shots++ % 3 === 0) game.onBossFired(this);
      }
      if (atk.t > 1.9) this._endAttack();
    }

    _runNova(atk, dt, game) {
      atk.timer -= dt;
      if (atk.timer > 0) return;
      const count = 28;
      const offset = atk.shots * (Math.PI / count) + this.ringSpin;
      for (let i = 0; i < count; i++) this._orb(game, offset + i / count * U.TAU, 300, 14, '#ffd0d8');
      game.onBossFired(this, true);
      atk.shots++;
      atk.timer = 0.38;
      if (atk.shots >= 3) this._endAttack();
    }

    _runCharge(atk, dt, game, p) {
      if (atk.stage === 'dash') {
        const sp = 960;
        const hit = C.moveCircle(game.map, this, Math.cos(atk.aim) * sp * dt, Math.sin(atk.aim) * sp * dt, this.r);
        if (Math.random() < 0.6) game.particles.dust(this.x, this.y, 2);
        if (!atk.hit && U.dist(this.x, this.y, p.x, p.y) < this.r + p.r + 6) {
          atk.hit = true;
          p.takeDamage(34, this.x, this.y, game);
          p.knock(Math.cos(atk.aim) * 700, Math.sin(atk.aim) * 700);
        }
        if (hit || atk.t > 0.95) {
          atk.stage = 'recover';
          atk.t = 0;
          this.stun = 0.9;
          game.onBossSlam(this);
        }
        return;
      }
      if (atk.t > 0.1) this._endAttack();
    }

    _updateArenaFields(dt, game) {
      this.fieldTimer -= dt;
      if (this.fieldTimer > 0) return;
      this.fieldTimer = this.mk2 ? 5.5 : 7;
      const a = this.arena;
      for (let i = 0; i < 3; i++) {
        const w = TILE * 2, h = TILE * 2;
        const x = Math.floor(U.rand(a.x + TILE, a.x + a.w - w - TILE) / TILE) * TILE;
        const y = Math.floor(U.rand(a.y + TILE, a.y + a.h - h - TILE) / TILE) * TILE;
        game.hazards.addField(x, y, w, h, 1.3, 2.6, 24);
      }
    }

    /* ------------------------------ Render ------------------------------ */
    draw(ctx, time) {
      if (this.dead && this.removeTimer <= 0) return;
      const r = this.r;
      const coreColor = this.phase === 1 ? '#ff8a1a' : (this.phase === 2 ? '#ff2d55' : '#ffe0e6');
      const deathShake = this.dead ? U.randSpread() * 4 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(this.x + 6, this.y + 10, r * 1.25, r * 1.05, 0, 0, U.TAU); ctx.fill();
      ctx.save();
      ctx.translate(this.x + deathShake, this.y + deathShake);
      // Rotating armour ring.
      ctx.save();
      ctx.rotate(this.ringSpin);
      ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#2a2530';
      for (let i = 0; i < 6; i++) {
        ctx.rotate(U.TAU / 6);
        ctx.fillRect(r * 0.75, -r * 0.28, r * 0.42, r * 0.56);
      }
      ctx.restore();
      ctx.rotate(this.angle);
      // Twin cannons.
      ctx.fillStyle = '#17181e';
      ctx.fillRect(r * 0.3, -r * 0.62, r * 1.05, r * 0.3);
      ctx.fillRect(r * 0.3, r * 0.32, r * 1.05, r * 0.3);
      ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#3a3240';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i / 8 * U.TAU; ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4b4152';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, U.TAU); ctx.fill();
      const pulse = 0.6 + Math.sin(time * (4 + this.phase * 2)) * 0.4;
      ctx.fillStyle = U.rgba(coreColor, 0.5 + pulse * 0.5);
      ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.3, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(r * 0.16, 0, r * 0.1, 0, U.TAU); ctx.fill();
      ctx.restore();
    }

    drawOverlay(ctx, time, game) {
      if (this.dead) return;
      const r = this.r;
      const coreColor = this.phase === 1 ? '#ff8a1a' : (this.phase === 2 ? '#ff2d55' : '#ffe0e6');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(BO.softSprite(coreColor), this.x - r * 1.6, this.y - r * 1.6, r * 3.2, r * 3.2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (this.mode === 'transition' || this.mode === 'intro' || this.shieldFlash > 0) {
        ctx.strokeStyle = U.rgba('#7fe3ff', 0.4 + Math.sin(time * 18) * 0.3);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 14 + Math.sin(time * 6) * 3, 0, U.TAU); ctx.stroke();
      }
      if (this.stun > 0) {
        ctx.fillStyle = '#ffd34d';
        for (let i = 0; i < 3; i++) {
          const a = time * 5 + i * U.TAU / 3;
          ctx.beginPath(); ctx.arc(this.x + Math.cos(a) * 30, this.y - r - 12 + Math.sin(a) * 6, 3, 0, U.TAU); ctx.fill();
        }
      }
      const atk = this.attack;
      if (!atk || atk.stage !== 'tele') return;
      const k = U.clamp(atk.t / TELEGRAPH[atk.name], 0, 1);
      ctx.save();
      ctx.lineWidth = 2;
      if (atk.name === 'fan') {
        ctx.strokeStyle = U.rgba('#ff2d55', 0.25 + k * 0.5);
        for (let i = -1; i <= 1; i++) {
          const a = atk.aim + i * 0.57;
          ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(a) * 420, this.y + Math.sin(a) * 420); ctx.stroke();
        }
      } else if (atk.name === 'stream') {
        ctx.strokeStyle = U.rgba('#ff6b81', 0.3 + k * 0.6);
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(this.angle) * 600, this.y + Math.sin(this.angle) * 600); ctx.stroke();
        ctx.setLineDash([]);
      } else if (atk.name === 'charge') {
        const len = 900;
        ctx.translate(this.x, this.y);
        ctx.rotate(atk.aim);
        ctx.fillStyle = U.rgba('#ff2d55', 0.12);
        ctx.fillRect(0, -r, len, r * 2);
        ctx.fillStyle = U.rgba('#ff2d55', 0.3);
        ctx.fillRect(0, -r, len * k, r * 2);
        ctx.strokeStyle = U.rgba('#ff2d55', 0.8);
        ctx.strokeRect(0, -r, len, r * 2);
      } else if (atk.name === 'nova') {
        ctx.strokeStyle = U.rgba('#ffe0e6', 0.4 + k * 0.5);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 160 * (1 - k), 0, U.TAU); ctx.stroke();
      } else if (atk.name === 'summon' || atk.name === 'mortar') {
        ctx.strokeStyle = U.rgba(atk.name === 'summon' ? '#ffd34d' : '#ff3355', 0.3 + k * 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 10 + k * 40, 0, U.TAU); ctx.stroke();
      }
      ctx.restore();
    }
  }

  BO.Boss = Boss;
})(window.BO);
