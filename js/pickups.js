/* =========================================================================
 * BLACKOUT :: pickups.js
 * Health, armor, ammo, credits, weapons, power-ups and objective intel.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const COLLECT_RADIUS = 26;
  const MAGNET_RADIUS = 110;
  const DROP_LIFETIME = 40;

  const PICKUP_TYPES = {
    health:  { color: '#3ddc84', value: 35 },
    armor:   { color: '#19c3dd', value: 40 },
    ammo:    { color: '#f0be3d', value: 0.35 },
    credits: { color: '#ffd34d', value: 20 },
    weapon:  { color: '#ff8a1a' },
    damage:  { color: '#ff6a3d', power: true },
    rate:    { color: '#ffd34d', power: true },
    speed:   { color: '#7cff6b', power: true },
    invuln:  { color: '#19c3dd', power: true },
    intel:   { color: '#19c3dd', objective: true }
  };
  const POWER_TYPES = ['damage', 'rate', 'speed', 'invuln'];

  class PickupSystem {
    constructor() { this.items = []; }

    clear() { this.items.length = 0; }

    spawn(type, x, y, opts) {
      const def = PICKUP_TYPES[type];
      if (!def) return null;
      const item = {
        type, x, y, def,
        value: opts && opts.value !== undefined ? opts.value : def.value,
        weaponId: opts && opts.weaponId,
        bob: Math.random() * U.TAU,
        life: opts && opts.permanent ? Infinity : DROP_LIFETIME,
        vx: opts && opts.toss ? U.randSpread() * 140 : 0,
        vy: opts && opts.toss ? U.randSpread() * 140 : 0,
        collected: false,
        delay: opts && opts.toss ? 0.35 : 0
      };
      this.items.push(item);
      return item;
    }

    /** Randomised loot roll used by enemies and destructible props. */
    rollDrop(x, y, chance, generous) {
      if (!U.chance(chance)) return;
      const r = Math.random();
      let type;
      if (r < 0.06 || (generous && r < 0.12)) type = U.pick(POWER_TYPES);
      else if (r < 0.4) type = 'ammo';
      else if (r < 0.62) type = 'health';
      else if (r < 0.78) type = 'armor';
      else type = 'credits';
      this.spawn(type, x, y, { toss: true, value: type === 'credits' ? U.randInt(12, 30) : undefined });
    }

    nearestWeapon(x, y, range) {
      let best = null, bestD = range * range;
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (it.type !== 'weapon' || it.collected) continue;
        const d = U.dist2(x, y, it.x, it.y);
        if (d < bestD) { bestD = d; best = it; }
      }
      return best;
    }

    update(dt, game) {
      const p = game.player;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.bob += dt * 3;
        it.life -= dt;
        it.delay = Math.max(0, it.delay - dt);
        if (it.vx || it.vy) {
          BO.Collision.moveCircle(game.map, it, it.vx * dt, it.vy * dt, 8);
          it.vx *= Math.max(0, 1 - 5 * dt); it.vy *= Math.max(0, 1 - 5 * dt);
          if (Math.abs(it.vx) + Math.abs(it.vy) < 2) { it.vx = 0; it.vy = 0; }
        }
        if (it.life <= 0 || it.collected) { this.items.splice(i, 1); continue; }
        if (!p || p.dead || it.delay > 0) continue;
        const d2 = U.dist2(p.x, p.y, it.x, it.y);
        if (it.type === 'credits' && d2 < MAGNET_RADIUS * MAGNET_RADIUS) {
          const d = Math.sqrt(d2) || 1;
          it.x += (p.x - it.x) / d * 420 * dt;
          it.y += (p.y - it.y) / d * 420 * dt;
        }
        if (d2 < COLLECT_RADIUS * COLLECT_RADIUS && this._tryCollect(it, game)) {
          it.collected = true;
          this.items.splice(i, 1);
        }
      }
    }

    _tryCollect(it, game) {
      const p = game.player;
      switch (it.type) {
        case 'health': {
          if (p.hp >= p.maxHp) return false;
          const n = Math.round(p.heal(it.value));
          game.onPickup(it, BO.t('pick.health', { n }));
          return true;
        }
        case 'armor': {
          if (p.armor >= p.maxArmor) return false;
          const n = Math.round(p.addArmor(it.value));
          game.onPickup(it, BO.t('pick.armor', { n }));
          return true;
        }
        case 'ammo':
          if (!p.addAmmoAll(it.value)) return false;
          game.onPickup(it, BO.t('pick.ammo'));
          return true;
        case 'credits':
          game.addCredits(it.value);
          game.onPickup(it, BO.t('pick.credits', { n: it.value }));
          return true;
        case 'weapon': {
          const res = p.giveWeapon(it.weaponId);
          if (res === -1) return false; // full inventory: needs [E] to swap
          game.onPickup(it, BO.t('pick.weapon', { name: BO.t('w.' + it.weaponId) }));
          return true;
        }
        case 'intel':
          game.onPickup(it, BO.t('pick.intel'));
          game.objectives.notify('collect');
          return true;
        default:
          if (it.def.power) {
            p.activatePowerup(it.type);
            game.onPickup(it, BO.t('pick.' + it.type));
            return true;
          }
          return false;
      }
    }

    render(ctx, time, rect) {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (it.x < rect.x0 || it.x > rect.x1 || it.y < rect.y0 || it.y > rect.y1) continue;
        const blink = it.life < 6 && Math.floor(time * 8) % 2 === 0;
        if (blink) continue;
        const bob = Math.sin(it.bob) * 3;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(it.x, it.y + 9, 10, 4, 0, 0, U.TAU); ctx.fill();
        this._icon(ctx, it, it.x, it.y - 4 + bob, time);
      }
    }

    /** Glow drawn above darkness so loot is readable in the blackout. */
    renderGlow(ctx, rect) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (it.x < rect.x0 || it.x > rect.x1 || it.y < rect.y0 || it.y > rect.y1) continue;
        const s = it.type === 'intel' || it.type === 'weapon' || it.def.power ? 34 : 22;
        ctx.globalAlpha = 0.5 + Math.sin(it.bob * 1.4) * 0.15;
        ctx.drawImage(BO.softSprite(it.def.color), it.x - s, it.y - 4 - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    _icon(ctx, it, x, y, time) {
      const c = it.def.color;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#12141c';
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      if (it.type === 'weapon') {
        ctx.rotate(Math.sin(time * 2) * 0.15);
        ctx.fillRect(-18, -8, 36, 16);
        ctx.strokeRect(-18, -8, 36, 16);
        BO.Weapons.drawWeaponIcon(ctx, BO.WEAPONS[it.weaponId], 0, -1, 28, c);
        ctx.restore();
        return;
      }
      ctx.beginPath();
      if (it.def.power) { for (let k = 0; k < 6; k++) { const a = k / 6 * U.TAU + time; ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); } ctx.closePath(); }
      else ctx.rect(-9, -9, 18, 18);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = c;
      switch (it.type) {
        case 'health': ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4); break;
        case 'armor': ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, -3); ctx.lineTo(5, 3); ctx.lineTo(0, 7); ctx.lineTo(-5, 3); ctx.lineTo(-6, -3); ctx.closePath(); ctx.fill(); break;
        case 'ammo': for (let k = -1; k <= 1; k++) ctx.fillRect(k * 4 - 1.2, -5, 2.6, 10); break;
        case 'credits': ctx.beginPath(); ctx.arc(0, 0, 5, 0, U.TAU); ctx.fill(); ctx.fillStyle = '#12141c'; ctx.fillRect(-1, -3, 2, 6); break;
        case 'intel': ctx.fillRect(-5, -6, 10, 12); ctx.fillStyle = '#12141c'; ctx.fillRect(-3, -3, 6, 1.5); ctx.fillRect(-3, 0, 6, 1.5); break;
        case 'damage': ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); break;
        case 'rate': ctx.beginPath(); ctx.moveTo(2, -7); ctx.lineTo(-4, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 7); ctx.lineTo(4, -1); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill(); break;
        case 'speed': ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(1, 0); ctx.lineTo(-5, 5); ctx.moveTo(0, -5); ctx.lineTo(6, 0); ctx.lineTo(0, 5); ctx.stroke(); break;
        case 'invuln': ctx.beginPath(); ctx.arc(0, 0, 5, 0, U.TAU); ctx.stroke(); break;
        default: break;
      }
      ctx.restore();
    }
  }

  BO.PICKUP_TYPES = PICKUP_TYPES;
  BO.PickupSystem = PickupSystem;
})(window.BO);
