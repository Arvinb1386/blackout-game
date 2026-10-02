/* =========================================================================
 * BLACKOUT :: player.js
 * The operator: movement with acceleration, sprint/stamina, dodge roll with
 * i-frames, 5-slot weapon inventory, armor, power-ups and procedural sprite.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const CFG = BO.CONFIG;
  const C = BO.Collision;
  const ACCEL_LAMBDA = 16;
  const SLOT_COUNT = 5;
  const SWITCH_DELAY = 0.22;
  const FIRE_BUFFER = 0.14;
  const AFTERIMAGES = 5;
  const POWERUP_DURATION = { damage: 12, rate: 12, speed: 10, invuln: 6 };
  const POWERUP_EFFECT = { damage: 1.5, rate: 1.4, speed: 1.3 };
  const ACCENT = '#ff8a1a';

  class Player {
    constructor(save) {
      const up = save.upgrades;
      this.upgrades = up;
      this.r = CFG.PLAYER_RADIUS;
      this.maxHp = 100 + 15 * up.maxHp;
      this.maxArmor = 50 + 15 * up.armor;
      this.speedMul = 1 + 0.05 * up.speed;
      this.hp = this.maxHp;
      this.armor = Math.round(this.maxArmor * 0.5);
      this.stamina = CFG.STAMINA_MAX;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.angle = 0; this.aimX = 0; this.aimY = 0;
      this.dodgeTimer = 0; this.dodgeCooldown = 0; this.dodgeDirX = 1; this.dodgeDirY = 0;
      this.iframes = 0; this.hurtFlash = 0; this.dead = false; this.deathTimer = 0;
      this.sprinting = false;
      this.slots = new Array(SLOT_COUNT).fill(null);
      this.current = 0;
      this.switchTimer = 0;
      this.fireBuffer = 0;
      this.powerups = { damage: 0, rate: 0, speed: 0, invuln: 0 };
      this.walkCycle = 0; this.recoilAnim = 0; this.muzzleTimer = 0;
      this.afterimages = [];
      for (let i = 0; i < AFTERIMAGES; i++) this.afterimages.push({ x: 0, y: 0, a: 0, life: 0 });
      this.afterHead = 0;
      this.afterTimer = 0;
      this._move = { x: 0, y: 0 };
      this.lowHpBeat = 0;
      this.slots[0] = new BO.WeaponInstance(BO.WEAPONS[save.loadout.primary] || BO.WEAPONS.ar, up);
      this.slots[1] = new BO.WeaponInstance(BO.WEAPONS[save.loadout.secondary] || BO.WEAPONS.pistol, up);
    }

    get weapon() { return this.slots[this.current] || this.slots[0]; }
    get isDodging() { return this.dodgeTimer > 0; }
    get dodgeReady() { return 1 - U.clamp(this.dodgeCooldown / CFG.DODGE_COOLDOWN, 0, 1); }
    isInvulnerable() { return this.iframes > 0 || this.powerups.invuln > 0; }
    damageMul() { return this.powerups.damage > 0 ? POWERUP_EFFECT.damage : 1; }
    rateMul() { return this.powerups.rate > 0 ? POWERUP_EFFECT.rate : 1; }

    equip(index, audio) {
      if (index < 0 || index >= SLOT_COUNT || !this.slots[index] || index === this.current) return false;
      this.weapon.cancelReload();
      this.current = index;
      this.switchTimer = SWITCH_DELAY;
      if (audio) audio.reloadStart();
      return true;
    }

    cycleWeapon(dir, audio) {
      for (let i = 1; i < SLOT_COUNT; i++) {
        const idx = (this.current + dir * i + SLOT_COUNT) % SLOT_COUNT;
        if (this.slots[idx]) return this.equip(idx, audio);
      }
      return false;
    }

    /** Returns 'ammo' if the weapon was already owned, the slot index if added, or -1 if inventory is full. */
    giveWeapon(id) {
      for (let i = 0; i < SLOT_COUNT; i++) {
        if (this.slots[i] && this.slots[i].def.id === id) { this.slots[i].addAmmo(0.6); return 'ammo'; }
      }
      for (let i = 2; i < SLOT_COUNT; i++) {
        if (!this.slots[i]) { this.slots[i] = new BO.WeaponInstance(BO.WEAPONS[id], this.upgrades); return i; }
      }
      return -1;
    }

    replaceCurrent(id) {
      const dropped = this.weapon.def.id;
      this.slots[this.current] = new BO.WeaponInstance(BO.WEAPONS[id], this.upgrades);
      this.switchTimer = SWITCH_DELAY;
      return dropped;
    }

    addAmmoAll(fraction) {
      let any = false;
      for (let i = 0; i < SLOT_COUNT; i++) if (this.slots[i] && this.slots[i].addAmmo(fraction)) any = true;
      return any;
    }

    heal(n) { const before = this.hp; this.hp = Math.min(this.maxHp, this.hp + n); return this.hp - before; }
    addArmor(n) { const before = this.armor; this.armor = Math.min(this.maxArmor, this.armor + n); return this.armor - before; }

    activatePowerup(kind) {
      if (POWERUP_DURATION[kind] === undefined) return;
      this.powerups[kind] = POWERUP_DURATION[kind];
    }

    update(dt, input, game) {
      if (this.dead) { this.deathTimer += dt; return; }
      this._updateTimers(dt);
      this._updateAim(game);
      this._updateMovement(dt, input, game);
      this._updateWeapons(dt, input, game);
      this._updateAfterimages(dt);
      if (this.hp < this.maxHp * 0.3) {
        this.lowHpBeat -= dt;
        if (this.lowHpBeat <= 0) { this.lowHpBeat = 0.85; game.audio.heartbeat(); }
      }
    }

    _updateTimers(dt) {
      this.iframes = Math.max(0, this.iframes - dt);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
      this.switchTimer = Math.max(0, this.switchTimer - dt);
      this.fireBuffer = Math.max(0, this.fireBuffer - dt);
      this.recoilAnim = Math.max(0, this.recoilAnim - dt * 9);
      this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
      for (const k in this.powerups) if (this.powerups[k] > 0) this.powerups[k] = Math.max(0, this.powerups[k] - dt);
    }

    _updateAim(game) {
      this.aimX = game.camera.screenToWorldX(game.input.cursorX);
      this.aimY = game.camera.screenToWorldY(game.input.cursorY);
      const dx = this.aimX - this.x, dy = this.aimY - this.y;
      if (dx * dx + dy * dy > 4) this.angle = Math.atan2(dy, dx);
    }

    _updateMovement(dt, input, game) {
      const mv = input.moveVector(this._move);
      const moving = mv.x !== 0 || mv.y !== 0;
      const wantsSprint = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && moving && !input.mouseDown;
      this.sprinting = wantsSprint && this.stamina > 1 && !this.weapon.reloading;
      if (this.sprinting) this.stamina = Math.max(0, this.stamina - CFG.STAMINA_DRAIN * dt);
      else this.stamina = Math.min(CFG.STAMINA_MAX, this.stamina + CFG.STAMINA_REGEN * dt);

      if (input.wasPressed('Space') && this.dodgeCooldown <= 0 && !this.isDodging) this._startDodge(mv, game);

      if (this.isDodging) {
        this.dodgeTimer -= dt;
        const t = 1 - this.dodgeTimer / CFG.DODGE_DURATION;
        const speed = CFG.DODGE_SPEED * (1 - 0.55 * t * t);
        this.vx = this.dodgeDirX * speed;
        this.vy = this.dodgeDirY * speed;
      } else {
        let speed = CFG.PLAYER_BASE_SPEED * this.speedMul * this.weapon.def.moveMul;
        if (this.sprinting) speed *= CFG.SPRINT_MULTIPLIER;
        if (this.powerups.speed > 0) speed *= POWERUP_EFFECT.speed;
        if (this.weapon.reloading) speed *= 0.9;
        this.vx = U.damp(this.vx, mv.x * speed, ACCEL_LAMBDA, dt);
        this.vy = U.damp(this.vy, mv.y * speed, ACCEL_LAMBDA, dt);
      }
      C.moveCircle(game.map, this, this.vx * dt, this.vy * dt, this.r);
      const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      this.walkCycle += spd * dt * 0.055;
      if (this.sprinting && Math.random() < dt * 10) game.particles.dust(this.x, this.y + 6, 1);
    }

    _startDodge(mv, game) {
      let dx = mv.x, dy = mv.y;
      if (dx === 0 && dy === 0) { dx = Math.cos(this.angle); dy = Math.sin(this.angle); }
      this.dodgeDirX = dx; this.dodgeDirY = dy;
      this.dodgeTimer = CFG.DODGE_DURATION;
      this.iframes = CFG.DODGE_IFRAMES;
      this.dodgeCooldown = CFG.DODGE_COOLDOWN;
      game.audio.dodge();
      game.particles.dust(this.x, this.y, 6);
    }

    _updateWeapons(dt, input, game) {
      for (let i = 0; i < SLOT_COUNT; i++) if (this.slots[i]) this.slots[i].update(i === this.current ? dt : dt * 0.5, i === this.current ? game.audio : null);
      for (let i = 0; i < SLOT_COUNT; i++) if (input.wasPressed('Digit' + (i + 1)) || input.wasPressed('Numpad' + (i + 1))) this.equip(i, game.audio);
      if (input.wheel !== 0) this.cycleWeapon(input.wheel > 0 ? 1 : -1, game.audio);
      const w = this.weapon;
      if (input.wasPressed('KeyR')) w.startReload(game.audio);
      if (input.mousePressed) this.fireBuffer = FIRE_BUFFER;
      if (this.isDodging || this.switchTimer > 0 || game.blockFire) return;
      const pressed = this.fireBuffer > 0;
      if ((input.mouseDown || pressed) && w.mag <= 0 && !w.reloading) {
        if (input.mousePressed) game.audio.empty();
        if (!w.startReload(game.audio) && input.mousePressed) game.onPlayerOutOfAmmo();
        return;
      }
      if (w.pullTrigger(input.mouseDown, pressed, this.rateMul()) > 0) {
        this.fireBuffer = 0;
        this._fire(game, w);
        if (w.mag <= 0) w.startReload(game.audio);
      }
    }

    _fire(game, w) {
      const def = w.def;
      const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
      const handX = this.x - sa * 6, handY = this.y + ca * 6;
      const barrel = this.r + def.look.length * 0.9;
      let mx = handX + ca * barrel, my = handY + sa * barrel;
      // Never spawn the round on the far side of a wall we are hugging.
      const block = C.raycast(game.map, this.x, this.y, mx, my, BO.COLLIDE.BULLET);
      if (block.hit) { mx = this.x + (block.x - this.x) * 0.8; my = this.y + (block.y - this.y) * 0.8; }
      const speedFrac = Math.sqrt(this.vx * this.vx + this.vy * this.vy) / CFG.PLAYER_BASE_SPEED;
      const moveSpread = speedFrac * (def.id === 'sniper' ? 0.09 : 0.03) + (this.sprinting ? 0.06 : 0);
      const spread = w.currentSpread(moveSpread);
      const S = BO.SHOT;
      for (let i = 0; i < def.pellets; i++) {
        S.x = mx; S.y = my;
        S.angle = this.angle + U.randSpread() * spread;
        S.speed = def.bulletSpeed * (def.pellets > 1 ? U.rand(0.85, 1.1) : 1);
        S.damage = w.stats.damage * this.damageMul();
        S.range = def.range * (def.pellets > 1 ? U.rand(0.85, 1.05) : 1);
        S.owner = BO.PROJECTILE_OWNER.PLAYER;
        S.kind = def.grenade ? BO.PROJECTILE_KIND.GRENADE : BO.PROJECTILE_KIND.TRACER;
        S.color = this.powerups.damage > 0 ? '#ff6a3d' : def.tracer;
        S.width = def.tracerWidth;
        S.pierce = def.pierce || 0;
        S.explosive = def.explosive || 0;
        S.knockback = def.knockback;
        S.hitStop = def.hitStop;
        S.critChance = CFG.BASE_CRIT_CHANCE;
        S.source = this;
        S.radius = def.grenade ? 4 : 0;
        game.projectiles.spawn(S);
      }
      w.consumeRound();
      this.recoilAnim = 1;
      this.muzzleTimer = 0.05;
      game.onPlayerFired(this, w, mx, my, this.angle);
    }

    _updateAfterimages(dt) {
      for (let i = 0; i < AFTERIMAGES; i++) this.afterimages[i].life = Math.max(0, this.afterimages[i].life - dt);
      if (!this.isDodging) return;
      this.afterTimer -= dt;
      if (this.afterTimer > 0) return;
      this.afterTimer = 0.04;
      const a = this.afterimages[this.afterHead];
      this.afterHead = (this.afterHead + 1) % AFTERIMAGES;
      a.x = this.x; a.y = this.y; a.a = this.angle; a.life = 0.22;
    }

    /** Applies damage after armor. Returns the damage actually taken. */
    takeDamage(amount, srcX, srcY, game) {
      if (this.dead || this.isInvulnerable() || !(amount > 0)) return 0;
      let dmg = amount;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, dmg * CFG.ARMOR_ABSORB);
        this.armor -= absorbed;
        dmg -= absorbed;
      }
      this.hp -= dmg;
      this.hurtFlash = 0.18;
      game.onPlayerDamaged(amount, srcX, srcY);
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.deathTimer = 0;
        game.onPlayerDeath();
      }
      return dmg;
    }

    knock(fx, fy) { if (!this.isDodging) { this.vx += fx; this.vy += fy; } }

    /* ------------------------------ Render ------------------------------ */
    draw(ctx, time) {
      const r = this.r;
      for (let i = 0; i < AFTERIMAGES; i++) {
        const a = this.afterimages[i];
        if (a.life <= 0) continue;
        ctx.globalAlpha = a.life * 2;
        ctx.fillStyle = ACCENT;
        ctx.beginPath(); ctx.arc(a.x, a.y, r * 0.9, 0, U.TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (this.dead) { this._drawDead(ctx); return; }

      // Ground shadow + facing chevron (direction indicator).
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(this.x + 3, this.y + 6, r * 1.15, r * 0.95, 0, 0, U.TAU); ctx.fill();
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(r + 14, -6); ctx.lineTo(r + 20, 0); ctx.lineTo(r + 14, 6); ctx.stroke();
      ctx.globalAlpha = 1;

      const roll = this.isDodging ? (1 - this.dodgeTimer / BO.CONFIG.DODGE_DURATION) : 0;
      const squash = this.isDodging ? 0.82 : 1;
      ctx.scale(squash, 1 / squash);

      // Feet: alternate with walk cycle for a stepping animation.
      const step = Math.sin(this.walkCycle) * 5;
      ctx.fillStyle = '#1b1e27';
      ctx.beginPath(); ctx.ellipse(step, -7, 5, 3.4, 0, 0, U.TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-step, 7, 5, 3.4, 0, 0, U.TAU); ctx.fill();

      // Weapon, held on the right side with recoil and reload animation.
      const w = this.weapon;
      ctx.save();
      const reloadTilt = w.reloading ? Math.sin(w.reloadProgress * Math.PI) * 0.7 : 0;
      ctx.translate(2 - this.recoilAnim * 6, 6);
      ctx.rotate(reloadTilt + (this.switchTimer > 0 ? this.switchTimer * 3 : 0));
      BO.Weapons.drawWeaponShape(ctx, w.def, 1, ACCENT);
      ctx.restore();

      // Torso, pack and shoulder pads.
      ctx.fillStyle = '#20242f';
      ctx.fillRect(-r - 3, -8, 8, 16);
      ctx.fillStyle = this.hurtFlash > 0 ? '#ffffff' : '#2d3343';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r, 0, 0, U.TAU); ctx.fill();
      ctx.fillStyle = this.hurtFlash > 0 ? '#ffd3d3' : ACCENT;
      ctx.beginPath(); ctx.arc(1, -r * 0.78, 4.2, 0, U.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(1, r * 0.78, 4.2, 0, U.TAU); ctx.fill();
      // Arms reaching to the weapon.
      ctx.strokeStyle = '#3a4152';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(2, r * 0.7); ctx.lineTo(12 - this.recoilAnim * 5, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -r * 0.7); ctx.lineTo(20 - this.recoilAnim * 5, 5); ctx.stroke();
      // Helmet + visor.
      ctx.fillStyle = '#3c4354';
      ctx.beginPath(); ctx.arc(1, 0, r * 0.56, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#ffb36b';
      ctx.fillRect(r * 0.18, -r * 0.3, 3.2, r * 0.6);
      if (roll > 0) {
        ctx.strokeStyle = 'rgba(255,138,26,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r + 3, roll * U.TAU, roll * U.TAU + 2.2); ctx.stroke();
      }
      ctx.restore();

      if (this.powerups.invuln > 0) {
        const pulse = 0.5 + Math.sin(time * 10) * 0.2;
        ctx.strokeStyle = 'rgba(25,195,221,' + pulse + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 9, 0, U.TAU); ctx.stroke();
      }
      if (this.iframes > 0 && !this.isDodging && Math.floor(time * 20) % 2 === 0) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    _drawDead(ctx) {
      const t = Math.min(1, this.deathTimer / 0.6);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle + t * 1.4);
      ctx.globalAlpha = 1 - t * 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(4, 4, this.r * 1.5, this.r, 0, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#2d3343';
      ctx.beginPath(); ctx.ellipse(0, 0, this.r * (1 + t * 0.2), this.r * 0.8, 0, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#7a4a24';
      ctx.beginPath(); ctx.arc(this.r * 0.6, 0, this.r * 0.5, 0, U.TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  Player.ACCENT = ACCENT;
  Player.POWERUP_DURATION = POWERUP_DURATION;
  BO.Player = Player;
})(window.BO);
