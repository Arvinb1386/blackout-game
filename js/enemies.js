/* =========================================================================
 * BLACKOUT :: enemies.js
 * Enemy archetype data, the Enemy entity (damage, death, knockback) and its
 * procedural rendering. Decision making lives in ai.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;

  const ENEMY_TYPES = {
    grunt: {
      hp: 100, r: 15, speed: 125, damage: 9, fireInterval: 0.12, burst: 3, burstPause: [0.85, 1.45], spread: 0.07,
      bulletSpeed: 740, range: 600, prefRange: 290, view: 540, fov: 1.95, turn: 5, xp: 25, credits: [6, 14],
      color: '#ff3355', body: '#3b2b34', knockResist: 1, retreatAt: 0.3, weaponLen: 24, sound: 'enemy', dropChance: 0.32
    },
    rusher: {
      hp: 55, r: 13, speed: 290, meleeDamage: 26, meleeRange: 34, windup: 0.24, meleeCooldown: 0.85,
      view: 470, fov: 2.3, turn: 9, xp: 20, credits: [5, 10], color: '#ff5c7a', body: '#41262f', knockResist: 1.3,
      retreatAt: 0, weaponLen: 0, dropChance: 0.25, prefRange: 0, range: 40
    },
    heavy: {
      hp: 480, r: 22, speed: 68, damage: 8, fireInterval: 0.1, sprayTime: 2.2, spinUp: 0.7, sprayCooldown: 1.5, spread: 0.13,
      bulletSpeed: 660, range: 560, prefRange: 210, view: 500, fov: 1.7, turn: 2.2, xp: 60, credits: [18, 30],
      color: '#ff4a3d', body: '#3a2f2c', knockResist: 0.2, retreatAt: 0, weaponLen: 30, sound: 'heavy', dropChance: 0.9
    },
    sniper: {
      hp: 65, r: 14, speed: 105, damage: 42, chargeTime: 1.25, lockTime: 0.22, shotCooldown: 2.6, bulletSpeed: 2600,
      spread: 0.004, range: 1300, prefRange: 650, minRange: 330, view: 1150, fov: 1.15, turn: 3.2, xp: 40,
      credits: [10, 18], color: '#ff2d55', body: '#2f2a36', knockResist: 1, retreatAt: 0.99, weaponLen: 36, sound: 'esniper', dropChance: 0.4
    }
  };

  const STATE = {
    IDLE: 'idle', PATROL: 'patrol', ALERT: 'alert', INVESTIGATE: 'investigate', CHASE: 'chase',
    ATTACK: 'attack', RETREAT: 'retreat', SEARCH: 'search', DEAD: 'dead'
  };

  let nextId = 1;

  class Enemy {
    constructor(type, x, y, difficulty) {
      const def = ENEMY_TYPES[type] || ENEMY_TYPES.grunt;
      const diff = difficulty || { hp: 1, damage: 1, accuracy: 1 };
      this.id = nextId++;
      this.type = ENEMY_TYPES[type] ? type : 'grunt';
      this.def = def;
      this.diff = diff;
      this.x = x; this.y = y; this.homeX = x; this.homeY = y;
      this.r = def.r;
      this.maxHp = Math.round(def.hp * diff.hp);
      this.hp = this.maxHp;
      this.angle = Math.random() * U.TAU;
      this.lookAngle = this.angle;
      this.vx = 0; this.vy = 0; this.kx = 0; this.ky = 0;
      this.state = STATE.IDLE;
      this.stateTime = 0;
      this.timer = U.rand(1, 3);
      this.awareness = 0;
      this.canSee = false;
      this.lastKnownX = x; this.lastKnownY = y; this.lastSeenAt = -99;
      this.perceptionTimer = Math.random() * BO.CONFIG.PERCEPTION_INTERVAL;
      this.path = null; this.pathIndex = 0; this.pathGoalX = 0; this.pathGoalY = 0; this.pathAge = 99;
      this.patrol = [];
      this.patrolIndex = 0;
      this.fireTimer = U.rand(0.3, 0.9);
      this.burstLeft = 0;
      this.charge = 0; this.lockedAngle = 0;
      this.spin = 0; this.sprayLeft = 0;
      this.windup = 0; this.lunge = 0; this.meleeCooldown = 0; this.meleeHit = false;
      this.strafeDir = U.chance(0.5) ? 1 : -1; this.strafeTimer = U.rand(1, 2);
      this.repositionTimer = U.rand(2, 4);
      this.moveTargetX = x; this.moveTargetY = y; this.hasMoveTarget = false;
      this.retreated = false;
      this.hitFlash = 0; this.barTimer = 0;
      this.dead = false; this.deathTime = 0; this.removeTimer = 6;
      this.visible = false;
      this.walk = Math.random() * 10;
      this.muzzle = 0;
      this.isWave = false;
      this.minion = false;
      this.searchPoints = 0;
      this.indicator = 0;
    }

    setState(s) {
      if (this.state === s) return;
      this.state = s;
      this.stateTime = 0;
      this.path = null;
      this.hasMoveTarget = false;
    }

    get engaged() { return this.state === STATE.CHASE || this.state === STATE.ATTACK || this.state === STATE.RETREAT; }

    /** Returns true if this hit killed the enemy. */
    takeDamage(amount, kx, ky) {
      if (this.dead) return false;
      this.hp -= amount;
      this.hitFlash = 0.09;
      this.barTimer = 2.5;
      this.kx += kx * this.def.knockResist;
      this.ky += ky * this.def.knockResist;
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.state = STATE.DEAD;
        this.deathTime = 0;
        return true;
      }
      return false;
    }

    /* ------------------------------ Render ------------------------------ */
    draw(ctx, time) {
      if (this.dead) { this._drawCorpse(ctx); return; }
      const d = this.def, r = this.r;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(this.x + 3, this.y + 6, r * 1.15, r * 0.95, 0, 0, U.TAU); ctx.fill();
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      const step = Math.sin(this.walk) * (r * 0.32);
      ctx.fillStyle = '#16141a';
      ctx.beginPath(); ctx.ellipse(step, -r * 0.45, r * 0.33, r * 0.22, 0, 0, U.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-step, r * 0.45, r * 0.33, r * 0.22, 0, 0, U.TAU); ctx.fill();
      const flash = this.hitFlash > 0;
      switch (this.type) {
        case 'rusher': this._drawRusher(ctx, flash); break;
        case 'heavy': this._drawHeavy(ctx, flash, time); break;
        case 'sniper': this._drawSniper(ctx, flash); break;
        default: this._drawGrunt(ctx, flash);
      }
      ctx.restore();
    }

    _gun(ctx, len, width, offsetY) {
      ctx.fillStyle = '#23252c';
      ctx.fillRect(2 - this.muzzle * 30, offsetY - width / 2, len, width);
    }

    _drawGrunt(ctx, flash) {
      const r = this.r;
      this._gun(ctx, this.def.weaponLen, 5, 6);
      ctx.fillStyle = flash ? '#fff' : this.def.body;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r, 0, 0, U.TAU); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#4d3a44';
      ctx.beginPath(); ctx.arc(1, 0, r * 0.55, 0, U.TAU); ctx.fill();
      ctx.fillStyle = this.def.color;
      ctx.fillRect(r * 0.2, -r * 0.32, 3, r * 0.64);
    }

    _drawRusher(ctx, flash) {
      const r = this.r;
      const ext = this.lunge > 0 ? 10 : (this.windup > 0 ? -4 : 0);
      ctx.fillStyle = '#c8cbd6';
      ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.9); ctx.lineTo(r * 1.6 + ext, -r * 0.55); ctx.lineTo(r * 0.5, -r * 0.4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.4, r * 0.9); ctx.lineTo(r * 1.6 + ext, r * 0.55); ctx.lineTo(r * 0.5, r * 0.4); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : this.def.body;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * U.TAU, rr = i % 2 ? r * 0.8 : r * 1.05;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.fill();
      ctx.fillStyle = this.windup > 0 ? '#ffffff' : this.def.color;
      ctx.beginPath(); ctx.arc(r * 0.35, 0, r * 0.3, 0, U.TAU); ctx.fill();
    }

    _drawHeavy(ctx, flash, time) {
      const r = this.r;
      ctx.fillStyle = '#1d1f25';
      ctx.fillRect(r * 0.2 - this.muzzle * 20, 4, this.def.weaponLen + 6, 11);
      ctx.fillStyle = '#3a3d47';
      const spinOff = (time * this.spin * 40) % 4;
      for (let i = 0; i < 3; i++) ctx.fillRect(r * 0.2 + this.def.weaponLen - 4, 5 + ((i * 4 + spinOff) % 10), 10, 2);
      ctx.fillStyle = flash ? '#fff' : this.def.body;
      ctx.fillRect(-r * 0.85, -r * 0.95, r * 1.6, r * 1.9);
      ctx.fillStyle = flash ? '#fff' : '#52423d';
      ctx.fillRect(-r * 0.55, -r * 1.05, r * 0.9, r * 0.45);
      ctx.fillRect(-r * 0.55, r * 0.6, r * 0.9, r * 0.45);
      ctx.fillStyle = '#5c4c48';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, U.TAU); ctx.fill();
      ctx.fillStyle = this.def.color;
      ctx.fillRect(r * 0.15, -r * 0.3, 4, r * 0.6);
    }

    _drawSniper(ctx, flash) {
      const r = this.r;
      this._gun(ctx, this.def.weaponLen, 4, 5);
      ctx.fillStyle = '#121318';
      ctx.fillRect(12, 1, 10, 3);
      ctx.fillStyle = flash ? '#fff' : this.def.body;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.75, r * 0.95, 0, 0, U.TAU); ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#3f3a48';
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.9); ctx.lineTo(r * 0.2, -r * 0.6); ctx.lineTo(r * 0.2, r * 0.6); ctx.lineTo(-r, r * 0.9); ctx.fill();
      ctx.fillStyle = this.def.color;
      ctx.beginPath(); ctx.arc(r * 0.35, 0, 2.6, 0, U.TAU); ctx.fill();
    }

    _drawCorpse(ctx) {
      const t = Math.min(1, this.deathTime / 0.35);
      const fade = this.removeTimer < 1 ? this.removeTimer : 1;
      ctx.globalAlpha = 0.85 * fade;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle + t * 0.8);
      ctx.fillStyle = '#17161b';
      ctx.beginPath(); ctx.ellipse(0, 0, this.r * (1 + t * 0.15), this.r * 0.75, 0, 0, U.TAU); ctx.fill();
      ctx.fillStyle = U.rgba(this.def.color, 0.35 * (1 - t * 0.6));
      ctx.beginPath(); ctx.arc(this.r * 0.3, 0, this.r * 0.35, 0, U.TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /** Drawn above the darkness layer: visor glow, alert icons, health bar, sniper laser. */
    drawOverlay(ctx, time, game) {
      if (this.dead) return;
      if (this.type === 'sniper' && this.charge > 0) this._drawLaser(ctx, time, game);
      if (this.type === 'rusher' && this.windup > 0) {
        ctx.strokeStyle = 'rgba(255,92,122,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.def.meleeRange + this.r + 6, this.angle - 0.8, this.angle + 0.8); ctx.stroke();
      }
      if (this.type === 'heavy' && this.spin > 0 && this.sprayLeft <= 0) {
        ctx.globalAlpha = this.spin;
        ctx.strokeStyle = '#ff4a3d';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(this.angle) * 200, this.y + Math.sin(this.angle) * 200);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (!this.visible) return;
      // Visor glow pierces the dark so lit enemies read instantly.
      const vx = this.x + Math.cos(this.angle) * this.r * 0.4, vy = this.y + Math.sin(this.angle) * this.r * 0.4;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.65;
      ctx.drawImage(BO.softSprite(this.def.color), vx - 14, vy - 14, 28, 28);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (this.barTimer > 0 || this.hp < this.maxHp) {
        const w = Math.max(28, this.r * 2.2), h = 4;
        const x = this.x - w / 2, y = this.y - this.r - 14;
        ctx.globalAlpha = Math.min(1, 0.45 + this.barTimer);
        ctx.fillStyle = 'rgba(6,7,16,0.8)';
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = this.def.color;
        ctx.fillRect(x, y, w * (this.hp / this.maxHp), h);
        ctx.globalAlpha = 1;
      }
      const S = BO.ENEMY_STATE;
      let icon = null, color = '#ffd34d';
      if (this.state === S.ALERT || this.state === S.INVESTIGATE || this.state === S.SEARCH) icon = '?';
      else if (this.engaged && this.stateTime < 1.2) { icon = '!'; color = '#ff3355'; }
      if (icon) {
        const bob = Math.sin(time * 8) * 2;
        ctx.font = '700 20px Khand, "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(5,6,14,0.9)';
        ctx.strokeText(icon, this.x, this.y - this.r - 28 + bob);
        ctx.fillStyle = color;
        ctx.fillText(icon, this.x, this.y - this.r - 28 + bob);
        if (icon === '?' && this.state === S.ALERT) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(this.x, this.y - this.r - 28, 12, -Math.PI / 2, -Math.PI / 2 + U.TAU * this.awareness); ctx.stroke();
        }
      }
    }

    _drawLaser(ctx, time, game) {
      const prog = U.clamp(this.charge / this.def.chargeTime, 0, 1);
      const locked = prog >= 1 - this.def.lockTime / this.def.chargeTime;
      const a = locked ? this.lockedAngle : this.angle;
      const sx = this.x + Math.cos(a) * 20, sy = this.y + Math.sin(a) * 20;
      const hit = BO.Collision.raycast(game.map, sx, sy, sx + Math.cos(a) * this.def.range, sy + Math.sin(a) * this.def.range, BO.COLLIDE.BULLET);
      const flicker = locked ? (Math.floor(time * 30) % 2 ? 1 : 0.4) : 0.35 + prog * 0.5;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = U.rgba('#ff2d55', flicker);
      ctx.lineWidth = locked ? 2.5 : 1 + prog;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hit.x, hit.y); ctx.stroke();
      ctx.globalAlpha = 0.6 * flicker;
      ctx.drawImage(BO.softSprite('#ff2d55'), hit.x - 10, hit.y - 10, 20, 20);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  BO.ENEMY_TYPES = ENEMY_TYPES;
  BO.ENEMY_STATE = STATE;
  BO.Enemy = Enemy;
})(window.BO);
