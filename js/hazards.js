/* =========================================================================
 * BLACKOUT :: hazards.js
 * Environmental hazards and telegraphed area attacks:
 *  - panel  : electrified floor plates that cycle idle -> warning -> live
 *  - strike : boss mortar circles that fill up, then detonate
 *  - field  : temporary electrified zones spawned in the boss arena
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TICK = 0.25;
  const PANEL_CYCLE = { idle: 3.2, warn: 1.0, live: 1.9 };

  class HazardSystem {
    constructor() { this.zones = []; this.time = 0; }

    clear() { this.zones.length = 0; }

    addPanel(x, y, w, h, offset) {
      this.zones.push({ kind: 'panel', x, y, w, h, t: offset || 0, dps: 26, tick: 0, phase: 'idle' });
    }

    addStrike(x, y, r, warn, damage) {
      this.zones.push({ kind: 'strike', x, y, r, warn, t: 0, damage, done: false });
    }

    addField(x, y, w, h, warn, live, dps) {
      this.zones.push({ kind: 'field', x, y, w, h, warn, live, t: 0, dps, tick: 0, phase: 'warn', done: false });
    }

    clearTemporary() { this.zones = this.zones.filter(z => z.kind === 'panel'); }

    update(dt, game) {
      this.time += dt;
      for (let i = this.zones.length - 1; i >= 0; i--) {
        const z = this.zones[i];
        z.t += dt;
        if (z.kind === 'panel') this._updatePanel(z, dt, game);
        else if (z.kind === 'strike') this._updateStrike(z, game);
        else this._updateField(z, dt, game);
        if (z.done) this.zones.splice(i, 1);
      }
    }

    _updatePanel(z, dt, game) {
      const total = PANEL_CYCLE.idle + PANEL_CYCLE.warn + PANEL_CYCLE.live;
      const c = z.t % total;
      const prev = z.phase;
      z.phase = c < PANEL_CYCLE.idle ? 'idle' : (c < PANEL_CYCLE.idle + PANEL_CYCLE.warn ? 'warn' : 'live');
      if (z.phase === 'live') {
        if (prev !== 'live') game.audio.beep(140, 0.04);
        this._damageRect(z, dt, game, true);
        if (Math.random() < dt * 14) game.particles.sparks(z.x + Math.random() * z.w, z.y + Math.random() * z.h, -Math.PI / 2, 2, '#7fe3ff', 220);
      }
    }

    _updateStrike(z, game) {
      if (z.t >= z.warn && !z.done) {
        z.done = true;
        game.hazardBlast(z.x, z.y, z.r, z.damage);
      }
    }

    _updateField(z, dt, game) {
      if (z.t < z.warn) { z.phase = 'warn'; return; }
      if (z.t < z.warn + z.live) {
        z.phase = 'live';
        this._damageRect(z, dt, game, false);
        if (Math.random() < dt * 18) game.particles.sparks(z.x + Math.random() * z.w, z.y + Math.random() * z.h, -Math.PI / 2, 2, '#ff6b81', 240);
        return;
      }
      z.done = true;
    }

    _damageRect(z, dt, game, hurtsEnemies) {
      z.tick -= dt;
      if (z.tick > 0) return;
      z.tick = TICK;
      const amount = z.dps * TICK;
      const p = game.player;
      if (p && !p.dead && p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h) p.takeDamage(amount, z.x + z.w / 2, z.y + z.h / 2, game);
      if (!hurtsEnemies) return;
      const list = game.enemies;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.isBoss) continue;
        if (e.x > z.x && e.x < z.x + z.w && e.y > z.y && e.y < z.y + z.h) game.damageEnemy(e, amount, 0, 0, { source: 'hazard', x: e.x, y: e.y });
      }
    }

    /** Ground layer (below actors). */
    render(ctx, time) {
      for (let i = 0; i < this.zones.length; i++) {
        const z = this.zones[i];
        if (z.kind !== 'panel') continue;
        ctx.fillStyle = '#10141c';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = '#2a3446';
        ctx.lineWidth = 1;
        for (let gx = z.x + 8; gx < z.x + z.w; gx += 12) { ctx.beginPath(); ctx.moveTo(gx, z.y + 3); ctx.lineTo(gx, z.y + z.h - 3); ctx.stroke(); }
      }
    }

    /** Above the darkness so telegraphs are always readable. */
    renderOverlay(ctx, time) {
      for (let i = 0; i < this.zones.length; i++) {
        const z = this.zones[i];
        if (z.kind === 'strike') {
          const k = U.clamp(z.t / z.warn, 0, 1);
          ctx.fillStyle = U.rgba('#ff3355', 0.12 + k * 0.18);
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r * k, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = U.rgba('#ff3355', 0.55 + Math.sin(time * 20) * 0.25);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, U.TAU); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(z.x - 8, z.y); ctx.lineTo(z.x + 8, z.y); ctx.moveTo(z.x, z.y - 8); ctx.lineTo(z.x, z.y + 8); ctx.stroke();
          continue;
        }
        const color = z.kind === 'panel' ? '#7fe3ff' : '#ff6b81';
        if (z.phase === 'warn') {
          const blink = Math.floor(time * 10) % 2 === 0;
          ctx.strokeStyle = U.rgba(color, blink ? 0.9 : 0.35);
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(z.x + 2, z.y + 2, z.w - 4, z.h - 4);
          ctx.setLineDash([]);
          ctx.fillStyle = U.rgba(color, 0.08);
          ctx.fillRect(z.x, z.y, z.w, z.h);
        } else if (z.phase === 'live') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = U.rgba(color, 0.2 + Math.random() * 0.1);
          ctx.fillRect(z.x, z.y, z.w, z.h);
          ctx.strokeStyle = U.rgba(color, 0.9);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            let x = z.x + Math.random() * z.w, y = z.y;
            ctx.moveTo(x, y);
            while (y < z.y + z.h) { y += 10; x = U.clamp(x + U.randSpread() * 14, z.x, z.x + z.w); ctx.lineTo(x, y); }
          }
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
  }

  BO.HazardSystem = HazardSystem;
})(window.BO);
