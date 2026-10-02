/* =========================================================================
 * BLACKOUT :: characters-plus.js
 * Character redesign (v3). Replaces the procedural sprites of the operator
 * and every enemy archetype with fully articulated top-down models:
 *  - soft contact shadows, two-bone arms gripping the weapon, striding legs
 *  - Operator: plate carrier with mag pouches, pauldrons, helmet with NVG
 *    mount + ear cups, radio pack with antenna, weapon light, and a scarf
 *    with rope physics; visor, LED and weapon light glow through the dark
 *  - Grunt: armoured rifleman with chevron pauldrons and visor slit
 *  - Rusher: hunched blade-runner with twin arm blades that cock back on
 *    wind-up and lunge forward, plus an energy ribbon trail
 *  - Heavy: juggernaut with shoulder plates, back drum, ammo belt and a
 *    six-barrel rotary that actually spins; vents glow while spinning
 *  - Sniper: tattered ghillie cloak, hood with tri-lens goggles, long rifle
 *    with scope glint that pulses while charging
 *  - Sprawled corpses with a dying visor flicker
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TAU = U.TAU;

  /* ---------------------------- Helpers ---------------------------- */
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillRR(ctx, x, y, w, h, r, color) { ctx.fillStyle = color; rrect(ctx, x, y, w, h, r); ctx.fill(); }
  function ell(ctx, x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
  function limb(ctx, x0, y0, x1, y1, w, color) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  /** Two-bone arm: shoulder -> elbow (bent sideways by `bend`) -> gloved hand. */
  function arm(ctx, sx, sy, hx, hy, bend, w, sleeve, glove) {
    const mx = (sx + hx) / 2, my = (sy + hy) / 2;
    const dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 1;
    const ex = mx - dy / d * bend, ey = my + dx / d * bend;
    ctx.strokeStyle = sleeve; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ell(ctx, hx, hy, w * 0.62, w * 0.62, glove);
  }
  function softShadow(ctx, x, y, r, a) {
    ctx.globalAlpha = a;
    ctx.drawImage(BO.softSprite('#000000'), x - r * 1.6 + 3, y - r * 1.4 + 6, r * 3.2, r * 2.8);
    ctx.globalAlpha = 1;
  }
  /** Striding legs; walk is a phase, amp scales stride length. */
  function legs(ctx, walk, r, pants, boot, amp) {
    const s = Math.sin(walk) * r * amp;
    const hy = r * 0.36;
    limb(ctx, -1, -hy, s * 0.8, -hy - 1, r * 0.36, pants);
    limb(ctx, -1, hy, -s * 0.8, hy + 1, r * 0.36, pants);
    ell(ctx, s + r * 0.12, -hy - 1, r * 0.36, r * 0.23, boot);
    ell(ctx, -s + r * 0.12, hy + 1, r * 0.36, r * 0.23, boot);
  }
  /** Rope chain anchored at (ax, ay) that trails behind (bx, by direction). */
  function chain(st, n, ax, ay, bx, by, seg, time, dt, wob) {
    if (!st.pts || Math.hypot(st.pts[0].x - ax, st.pts[0].y - ay) > 120) {
      st.pts = [];
      for (let i = 0; i < n; i++) st.pts.push({ x: ax + bx * seg * i, y: ay + by * seg * i });
    }
    const pts = st.pts;
    pts[0].x = ax; pts[0].y = ay;
    for (let i = 1; i < n; i++) {
      const p = pts[i], q = pts[i - 1];
      p.x += bx * dt * 40 + Math.sin(time * 6 + i * 1.4) * wob * dt * 22;
      p.y += by * dt * 40 + Math.cos(time * 5 + i * 1.1) * wob * dt * 22;
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
      p.x = q.x + dx / d * seg; p.y = q.y + dy / d * seg;
    }
    return pts;
  }
  function ribbon(ctx, pts, w0, w1, c0, c1, alpha) {
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    for (let i = 1; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      ctx.strokeStyle = i % 2 ? c0 : c1;
      ctx.lineWidth = w0 + (w1 - w0) * t;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function glow(ctx, color, x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(BO.softSprite(color), x - size / 2, y - size / 2, size, size);
  }
  function frameDt(o, time) {
    const dt = U.clamp(time - (o._fxT === undefined ? time : o._fxT), 0, 0.05);
    o._fxT = time;
    return dt;
  }

  /* ============================ Operator ============================ */
  const ACC = '#ff8a1a';
  const PAL = {
    cloth: '#262b37', vest: '#353d50', plate: '#424b62', pouch: '#2a3141', helmet: '#3d4558', dark: '#15171e',
    sleeve: '#2c3242', glove: '#181a21', pants: '#22262f', boot: '#121318', strap: '#1b1e27'
  };
  const P = BO.Player && BO.Player.prototype;

  if (P) {
    const weaponLen = (w) => (w && w.def && w.def.look && w.def.look.length) || 20;

    P.draw = function (ctx, time) {
      const r = this.r;
      const dt = frameDt(this, time);
      for (let i = 0; i < this.afterimages.length; i++) {
        const a = this.afterimages[i];
        if (a.life <= 0) continue;
        ctx.save();
        ctx.translate(a.x, a.y); ctx.rotate(a.a);
        ctx.globalAlpha = Math.min(1, a.life * 2.6) * 0.5;
        ell(ctx, 0, 0, r * 0.9, r, ACC);
        ell(ctx, 1, 0, r * 0.56, r * 0.56, '#ffb36b');
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (this.dead) { this._drawDead(ctx, time); return; }

      softShadow(ctx, this.x, this.y, r, 0.65);
      const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
      // Scarf (world space, under the body).
      const scarf = this._scarf || (this._scarf = {});
      const pts = chain(scarf, 6, this.x - ca * r * 0.3 + sa * 3, this.y - sa * r * 0.3 - ca * 3, -ca, -sa, 4.6, time, dt, 1);
      ribbon(ctx, pts, 4.4, 1.4, '#b9520e', ACC);

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      // Facing chevron.
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = ACC; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r + 16, -5); ctx.lineTo(r + 21, 0); ctx.lineTo(r + 16, 5); ctx.stroke();
      ctx.globalAlpha = 1;

      const roll = this.isDodging ? (1 - this.dodgeTimer / BO.CONFIG.DODGE_DURATION) : 0;
      const squash = this.isDodging ? 0.82 : 1;
      ctx.scale(squash, 1 / squash);
      const hf = this.hurtFlash > 0;
      const H = (c) => (hf ? '#ffffff' : c);

      const spd = Math.hypot(this.vx, this.vy);
      legs(ctx, this.walkCycle, r, PAL.pants, PAL.boot, U.clamp(spd / 230, 0, 1.3) * 0.45);

      // Radio pack.
      fillRR(ctx, -r - 5, -8.5, 11, 17, 3, H(PAL.cloth));
      ctx.fillStyle = PAL.strap; ctx.fillRect(-r - 2.5, -8.5, 2, 17);
      fillRR(ctx, -r - 6.5, -5, 4, 10, 1.5, '#323849');
      limb(ctx, -r - 4.5, -5.5, -r - 13, -10 + Math.sin(time * 3 + spd * 0.01) * 1.2, 1.1, '#4a5164');
      ell(ctx, -r - 13, -10 + Math.sin(time * 3 + spd * 0.01) * 1.2, 1.3, 1.3, '#5a6278');

      // Weapon + light.
      const w = this.weapon, L = weaponLen(w), rec = this.recoilAnim * 6;
      const reloadTilt = w.reloading ? Math.sin(w.reloadProgress * Math.PI) * 0.7 : 0;
      ctx.save();
      ctx.translate(2 - rec, 6);
      ctx.rotate(reloadTilt + (this.switchTimer > 0 ? this.switchTimer * 3 : 0));
      BO.Weapons.drawWeaponShape(ctx, w.def, 1, ACC);
      ctx.fillStyle = '#1e2129'; ctx.fillRect(L * 0.45, 2.6, 6, 3);
      ctx.fillStyle = '#fff4dc'; ctx.fillRect(L * 0.45 + 5.2, 2.8, 1.3, 2.6);
      ctx.restore();

      // Torso + plate carrier.
      ell(ctx, 0, 0, r * 0.86, r, H(PAL.cloth));
      fillRR(ctx, -r * 0.6, -r * 0.78, r * 1.3, r * 1.56, 4, hf ? '#ffe0e0' : PAL.vest);
      fillRR(ctx, -r * 0.5, -r * 0.7, r * 1.1, r * 0.32, 3, 'rgba(255,255,255,0.07)');
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-r * 0.55, -0.6, r * 1.2, 1.2);
      for (let k = 0; k < 3; k++) fillRR(ctx, r * 0.38, -r * 0.62 + k * r * 0.42, 4.2, r * 0.34, 1.2, H(PAL.pouch));
      ctx.fillStyle = ACC; ctx.globalAlpha = 0.85;
      ctx.fillRect(-r * 0.5, -r * 0.56, 2, r * 1.12);
      ctx.globalAlpha = 1;

      // Pauldrons with accent trim.
      for (let side = -1; side <= 1; side += 2) {
        ell(ctx, 1, side * r * 0.8, 5.8, 4.6, H(PAL.plate));
        ctx.strokeStyle = ACC; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(1, side * r * 0.8, 5.8, 4.6, 0, side > 0 ? 0.25 : Math.PI + 0.25, side > 0 ? Math.PI - 0.25 : TAU - 0.25);
        ctx.stroke();
      }

      // Arms: trigger hand + support hand (goes to the mag while reloading).
      const gx = U.clamp(L * 0.62, 12, 30) - rec;
      const rl = w.reloading ? Math.sin(w.reloadProgress * Math.PI) : 0;
      arm(ctx, 1, r * 0.74, 5 - rec, 6.5, 2.5, 4.6, H(PAL.sleeve), PAL.glove);
      arm(ctx, 1, -r * 0.74, gx - (gx - L * 0.3) * rl, 5 + rl * 6, -4, 4.6, H(PAL.sleeve), PAL.glove);

      // Helmet.
      const hg = ctx.createRadialGradient(-1, -3, 1, 1, 0, r * 0.62);
      hg.addColorStop(0, hf ? '#ffffff' : '#5c6680');
      hg.addColorStop(1, hf ? '#ffd0d0' : PAL.helmet);
      ell(ctx, 1, 0, r * 0.57, r * 0.57, hg);
      ell(ctx, -0.5, -r * 0.52, 2.5, 3, PAL.dark);
      ell(ctx, -0.5, r * 0.52, 2.5, 3, PAL.dark);
      ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(1, 0, r * 0.44, -0.75, 0.75); ctx.stroke();
      fillRR(ctx, -1.5, -1.8, 4.5, 3.6, 1, PAL.dark);
      ell(ctx, -1.5, -3, 1.8, 1.4, 'rgba(255,255,255,0.18)');

      if (roll > 0) {
        ctx.strokeStyle = 'rgba(255,138,26,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r + 3, roll * TAU, roll * TAU + 2.2); ctx.stroke();
      }
      ctx.restore();
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';

      if (this.powerups.invuln > 0) {
        const pulse = 0.5 + Math.sin(time * 10) * 0.2;
        ctx.strokeStyle = 'rgba(25,195,221,' + pulse + ')';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 9, 0, TAU); ctx.stroke();
      }
      if (this.iframes > 0 && !this.isDodging && Math.floor(time * 20) % 2 === 0) {
        ctx.globalAlpha = 0.25;
        ell(ctx, this.x, this.y, r, r, '#ffffff');
        ctx.globalAlpha = 1;
      }
    };

    P._drawDead = function (ctx) {
      const r = this.r, t = Math.min(1, this.deathTimer / 0.6);
      softShadow(ctx, this.x, this.y, r * 1.2, 0.5);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle + t * 1.4);
      ctx.globalAlpha = 1 - t * 0.25;
      limb(ctx, -2, -4, -r * 0.9 - t * 4, -r * 0.6 - t * 2, 5, PAL.pants);
      limb(ctx, -2, 4, -r * 0.85 - t * 3, r * 0.7 + t * 2, 5, PAL.pants);
      limb(ctx, 2, -r * 0.7, r * 0.6, -r * 1.05 - t * 3, 4.4, PAL.sleeve);
      limb(ctx, 2, r * 0.7, r * 0.8, r * 1.0 + t * 3, 4.4, PAL.sleeve);
      ell(ctx, 0, 0, r * (0.9 + t * 0.1), r * 0.8, PAL.cloth);
      fillRR(ctx, -r * 0.55, -r * 0.6, r * 1.15, r * 1.2, 4, PAL.vest);
      ell(ctx, r * 0.75, r * 0.15, r * 0.48, r * 0.48, PAL.helmet);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    };
  }

  /* ============================= Enemies ============================= */
  const E = BO.Enemy && BO.Enemy.prototype;

  function drawGrunt(e, ctx, F, time, amp) {
    const r = e.r, d = e.def, rec = e.muzzle * 30, L = d.weaponLen;
    legs(ctx, e.walk, r, '#231d22', '#121014', amp);
    fillRR(ctx, -r - 3, -6.5, 8, 13, 2.5, F('#2c2328'));
    ctx.save();
    ctx.translate(2 - rec, 6);
    fillRR(ctx, -2, -2.6, L * 0.62, 5.2, 1.5, '#1e2026');
    ctx.fillStyle = '#15161a'; ctx.fillRect(L * 0.55, -1.2, L * 0.5, 2.4);
    ctx.fillStyle = '#2a2c33'; ctx.fillRect(L * 0.25, 1.8, 3.5, 4.5);
    ctx.fillStyle = d.color; ctx.fillRect(L * 0.4, -3.4, 2.5, 1.4);
    ctx.restore();
    ell(ctx, 0, 0, r * 0.86, r, F(d.body));
    fillRR(ctx, -r * 0.55, -r * 0.72, r * 1.2, r * 1.44, 4, F('#4a3842'));
    fillRR(ctx, -r * 0.45, -r * 0.65, r * 1.0, r * 0.3, 3, 'rgba(255,255,255,0.06)');
    for (let side = -1; side <= 1; side += 2) {
      ell(ctx, 0, side * r * 0.8, 5, 4, F('#5a4550'));
      ctx.fillStyle = d.color; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(-2.5, side * r * 0.8 - 1); ctx.lineTo(0, side * r * 0.8 + 0.6); ctx.lineTo(2.5, side * r * 0.8 - 1); ctx.lineTo(2.5, side * r * 0.8 + 0.6); ctx.lineTo(0, side * r * 0.8 + 2.2); ctx.lineTo(-2.5, side * r * 0.8 + 0.6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    arm(ctx, 1, r * 0.72, 4 - rec, 6.5, 2.5, 4.2, F('#3a2e35'), '#141216');
    arm(ctx, 1, -r * 0.72, Math.min(L * 0.7, 20) - rec, 5.5, -3.5, 4.2, F('#3a2e35'), '#141216');
    ell(ctx, 1, 0, r * 0.55, r * 0.55, F('#4d3a44'));
    fillRR(ctx, -r * 0.4, -1.4, r * 0.7, 2.8, 1.2, F('#5d4853'));
    ctx.strokeStyle = d.color; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(1, 0, r * 0.44, -0.7, 0.7); ctx.stroke();
    ell(ctx, -1.5, -3, 1.6, 1.2, 'rgba(255,255,255,0.12)');
  }

  function drawRusher(e, ctx, F, time, amp) {
    const r = e.r, d = e.def;
    const wind = e.windup > 0 ? 1 : 0, lunge = e.lunge > 0 ? 1 : 0;
    legs(ctx, e.walk * 1.3, r, '#2b1a20', '#120c0f', amp * 1.3);
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(r * 0.2, side * r * 0.78);
      ctx.rotate(side * (lunge ? 0.12 : wind ? 1.25 : 0.55));
      limb(ctx, 0, 0, r * 0.6, 0, 4, F('#3a242c'));
      ctx.fillStyle = F('#cfd3de');
      ctx.beginPath();
      ctx.moveTo(r * 0.4, -side * 1.5);
      ctx.quadraticCurveTo(r * 1.3, -side * 2.6, r * 1.9 + lunge * 8, side * 1.5);
      ctx.quadraticCurveTo(r * 1.2, side * 2.2, r * 0.4, side * 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = wind ? '#ffffff' : d.color; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(r * 0.5, -side * 1.2); ctx.quadraticCurveTo(r * 1.3, -side * 2.4, r * 1.9 + lunge * 8, side * 1.5); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = F(d.body);
    ctx.beginPath();
    ctx.moveTo(r * 0.7, 0); ctx.lineTo(r * 0.3, -r * 0.85); ctx.lineTo(-r * 0.6, -r * 0.72);
    ctx.lineTo(-r * 1.0, 0); ctx.lineTo(-r * 0.6, r * 0.72); ctx.lineTo(r * 0.3, r * 0.85);
    ctx.closePath(); ctx.fill();
    for (let k = 0; k < 4; k++) fillRR(ctx, -r * 0.85 + k * r * 0.3, -2, r * 0.2, 4, 1, F('#5a3340'));
    ctx.strokeStyle = 'rgba(255,92,122,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r * 0.25, -r * 0.7); ctx.lineTo(-r * 0.5, -r * 0.6); ctx.moveTo(r * 0.25, r * 0.7); ctx.lineTo(-r * 0.5, r * 0.6); ctx.stroke();
    ell(ctx, r * 0.35, 0, r * 0.36, r * 0.32, F('#4a2a35'));
    ell(ctx, r * 0.52, 0, r * 0.16, r * 0.16, wind ? '#ffffff' : d.color);
  }

  function drawHeavy(e, ctx, F, time, amp) {
    const r = e.r, d = e.def, rec = e.muzzle * 20;
    legs(ctx, e.walk, r, '#26211f', '#100e0d', amp * 0.8);
    ell(ctx, -r * 0.95, -r * 0.1, r * 0.42, r * 0.5, F('#3b3430'));
    ell(ctx, -r * 0.95, -r * 0.1, r * 0.22, r * 0.28, '#2a2522');
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2.6; ctx.setLineDash([2, 1.4]);
    ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.2); ctx.quadraticCurveTo(-r * 0.1, r * 1.2, r * 0.5 - rec, r * 0.62); ctx.stroke();
    ctx.setLineDash([]);
    const gx = r * 0.15 - rec, gy = r * 0.55, L = d.weaponLen + 8;
    fillRR(ctx, gx, gy - 6, L * 0.55, 12, 3, '#1b1d22');
    fillRR(ctx, gx + L * 0.1, gy - 4, L * 0.3, 8, 2, '#2d3038');
    const ph0 = time * (e.spin || 0) * 30;
    for (let i = 0; i < 6; i++) {
      const ph = ph0 + i * TAU / 6;
      ctx.fillStyle = Math.cos(ph) > 0 ? '#4c505a' : '#2a2d34';
      ctx.fillRect(gx + L * 0.5, gy + Math.sin(ph) * 3.6 - 0.9, L * 0.55, 1.8);
    }
    ctx.fillStyle = '#222429'; ctx.fillRect(gx + L * 0.98, gy - 4.5, 3, 9);
    fillRR(ctx, -r * 0.85, -r * 0.95, r * 1.6, r * 1.9, 6, F(d.body));
    fillRR(ctx, -r * 0.5, -r * 0.65, r * 1.15, r * 1.3, 5, F('#4d403b'));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 3; k++) ctx.fillRect(-r * 0.35 + k * 6, -r * 0.55, 1.5, r * 1.1);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let k = 0; k < 4; k++) { ctx.fillRect(-r * 0.45 + (k % 2) * r * 1.0, -r * 0.58 + (k >> 1) * r * 1.05, 1.6, 1.6); }
    for (let side = -1; side <= 1; side += 2) {
      fillRR(ctx, -r * 0.6, side > 0 ? r * 0.55 : -r * 1.15, r * 1.0, r * 0.6, 4, F('#5f4f49'));
      ctx.fillStyle = d.color; ctx.globalAlpha = 0.7;
      ctx.fillRect(-r * 0.5, side > 0 ? r * 0.95 : -r * 0.75, r * 0.8, 1.6);
      ctx.globalAlpha = 1;
    }
    arm(ctx, r * 0.2, -r * 0.75, gx + L * 0.25, gy - 5, -3, 6, F('#3f3532'), '#151312');
    ctx.fillStyle = '#16130f';
    for (let k = 0; k < 3; k++) ctx.fillRect(-r * 0.82, -6 + k * 5, 3, 3);
    ell(ctx, r * 0.15, 0, r * 0.38, r * 0.38, F('#5c4c48'));
    ctx.fillStyle = d.color;
    ctx.fillRect(r * 0.32, -r * 0.25, 2.4, r * 0.5);
    ctx.fillRect(r * 0.12, -1.2, r * 0.36, 2.4);
  }

  function drawSniper(e, ctx, F, time, amp) {
    const r = e.r, d = e.def, rec = e.muzzle * 30, L = d.weaponLen;
    legs(ctx, e.walk, r, '#1f1c25', '#0f0e12', amp);
    // Tattered cloak.
    ctx.fillStyle = F('#24212b');
    ctx.beginPath();
    ctx.moveTo(r * 0.3, -r * 0.9);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = -Math.PI / 2 - t * Math.PI;
      const rr = r * (1.12 + (i % 2 ? 0.28 : 0)) + Math.sin(time * 5 + i * 1.7) * 1.2;
      ctx.lineTo(Math.cos(a) * rr - r * 0.1, Math.sin(a) * rr);
    }
    ctx.lineTo(r * 0.3, r * 0.9);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(86,96,72,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 - (i + 0.5) / 7 * Math.PI, r0 = r * 0.6, r1 = r * 1.2;
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a + 0.15) * r1, Math.sin(a + 0.15) * r1);
    }
    ctx.stroke();
    // Long rifle.
    ctx.save();
    ctx.translate(2 - rec, 5);
    fillRR(ctx, -4, -2.2, L * 0.55, 4.4, 1.5, '#1c1d22');
    ctx.fillStyle = '#121317'; ctx.fillRect(L * 0.5, -1, L * 0.75, 2);
    ctx.fillStyle = '#0d0e11'; ctx.fillRect(L * 1.2, -1.6, 4, 3.2);
    fillRR(ctx, L * 0.15, -4.6, L * 0.32, 3, 1.2, '#2b2d35');
    ctx.fillStyle = d.color; ctx.fillRect(L * 0.47, -4.4, 1.4, 2.6);
    ctx.restore();
    arm(ctx, 0, r * 0.62, 4 - rec, 5.5, 2, 3.8, F('#332d3b'), '#121116');
    arm(ctx, 0, -r * 0.62, L * 0.75 - rec, 4.5, -3, 3.8, F('#332d3b'), '#121116');
    // Hood + goggles.
    ctx.fillStyle = F('#2f2a38');
    ctx.beginPath();
    ctx.moveTo(r * 0.75, 0);
    ctx.quadraticCurveTo(r * 0.4, -r * 0.72, -r * 0.4, -r * 0.5);
    ctx.quadraticCurveTo(-r * 0.75, 0, -r * 0.4, r * 0.5);
    ctx.quadraticCurveTo(r * 0.4, r * 0.72, r * 0.75, 0);
    ctx.fill();
    ell(ctx, r * 0.38, 0, r * 0.22, r * 0.3, '#0b0a0e');
    ell(ctx, r * 0.47, 0, 1.6, 1.6, d.color);
    ell(ctx, r * 0.42, -2.6, 1.1, 1.1, d.color);
    ell(ctx, r * 0.42, 2.6, 1.1, 1.1, d.color);
  }

  if (E) {
    E.draw = function (ctx, time) {
      if (this.dead) { this._drawCorpse(ctx, time); return; }
      const r = this.r, d = this.def;
      const dt = frameDt(this, time);
      softShadow(ctx, this.x, this.y, r, 0.6);
      const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
      if (this.type === 'rusher') {
        const st = this._trail || (this._trail = {});
        const pts = chain(st, 6, this.x - ca * r * 0.9, this.y - sa * r * 0.9, -ca, -sa, 5, time, dt, 1.4);
        ribbon(ctx, pts, 3.4, 0.8, d.color, '#ff9db0', 0.55);
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      const flash = this.hitFlash > 0;
      const F = (c) => (flash ? '#ffffff' : c);
      const spd = Math.hypot(this.vx || 0, this.vy || 0);
      const amp = U.clamp(spd / (d.speed || 120), 0, 1.2) * 0.4 + 0.06;
      switch (this.type) {
        case 'rusher': drawRusher(this, ctx, F, time, amp); break;
        case 'heavy': drawHeavy(this, ctx, F, time, amp); break;
        case 'sniper': drawSniper(this, ctx, F, time, amp); break;
        default: drawGrunt(this, ctx, F, time, amp);
      }
      ctx.restore();
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    };

    E._drawCorpse = function (ctx, time) {
      const r = this.r, t = Math.min(1, this.deathTime / 0.35);
      const fade = this.removeTimer < 1 ? Math.max(0, this.removeTimer) : 1;
      softShadow(ctx, this.x, this.y, r * 1.1, 0.45 * fade);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle + t * 0.8);
      ctx.globalAlpha = 0.92 * fade;
      const limbW = r * 0.3;
      limb(ctx, -r * 0.2, -r * 0.4, -r * 1.1, -r * 0.85, limbW, '#1a171c');
      limb(ctx, -r * 0.2, r * 0.4, -r * 1.0, r * 0.95, limbW, '#1a171c');
      limb(ctx, r * 0.2, -r * 0.7, r * 0.9, -r * 1.1, limbW * 0.9, '#221d23');
      limb(ctx, r * 0.2, r * 0.7, r * 0.8, r * 1.2, limbW * 0.9, '#221d23');
      ell(ctx, 0, 0, r * (0.9 + t * 0.1), r * 0.78, '#1d1a20');
      ctx.globalAlpha = 0.55 * fade;
      ell(ctx, 0, 0, r * 0.7, r * 0.6, this.def.body);
      ctx.globalAlpha = 0.92 * fade;
      ell(ctx, r * 0.75, r * 0.15, r * 0.4, r * 0.38, '#2a2429');
      if (this.deathTime < 1.4) {
        const flick = Math.floor((time || 0) * 30) % 3 ? 1 : 0.3;
        ctx.strokeStyle = U.rgba(this.def.color, (1 - this.deathTime / 1.4) * 0.9 * flick);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r * 0.75, r * 0.15, r * 0.3, -0.7, 0.7); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    };

    const origOverlay = E.drawOverlay;
    E.drawOverlay = function (ctx, time, game) {
      origOverlay.call(this, ctx, time, game);
      if (this.dead || !this.visible) return;
      U.safe('chars+.enemyGlow', () => {
        const r = this.r, d = this.def, ca = Math.cos(this.angle), sa = Math.sin(this.angle);
        const wx = (fx, fy) => this.x + ca * fx - sa * fy, wy = (fx, fy) => this.y + sa * fx + ca * fy;
        ctx.globalCompositeOperation = 'lighter';
        if (this.type === 'rusher') {
          const k = this.windup > 0 ? 0.9 : 0.3;
          for (let side = -1; side <= 1; side += 2) glow(ctx, d.color, wx(r * 1.3, side * r * 1.2), wy(r * 1.3, side * r * 1.2), 18, k);
        } else if (this.type === 'heavy') {
          const s = this.spin || 0;
          if (s > 0) {
            glow(ctx, '#ff7a1a', wx(-r * 0.8, 0), wy(-r * 0.8, 0), 26, s * 0.7);
            glow(ctx, '#ff5a1a', wx(r * 0.15 + d.weaponLen + 6, r * 0.55), wy(r * 0.15 + d.weaponLen + 6, r * 0.55), 16, s * 0.5);
          }
        } else if (this.type === 'sniper') {
          const k = this.charge > 0 ? 0.55 + 0.45 * Math.sin(time * 14) : 0.25;
          const gx = d.weaponLen * 0.47 + 2.5, gy = 5 - 3.1;
          glow(ctx, '#ffffff', wx(gx, gy), wy(gx, gy), 9, k);
          glow(ctx, d.color, wx(gx, gy), wy(gx, gy), 20, k * 0.6);
        } else {
          glow(ctx, d.color, wx(r * 0.5, -r * 0.42), wy(r * 0.5, -r * 0.42), 9, 0.4);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      });
    };
  }

  /* -------------------- Operator glow above the dark -------------------- */
  const R = BO.Renderer && BO.Renderer.prototype;
  if (R && R._drawColoredLights && P) {
    const origColored = R._drawColoredLights;
    R._drawColoredLights = function (ctx, game, rect, time) {
      origColored.call(this, ctx, game, rect, time);
      const p = game && game.player;
      if (!p || !(p instanceof BO.Player) || p.dead) return;
      U.safe('chars+.playerGlow', () => {
        const r = p.r, ca = Math.cos(p.angle), sa = Math.sin(p.angle);
        const wx = (fx, fy) => p.x + ca * fx - sa * fy, wy = (fx, fy) => p.y + sa * fx + ca * fy;
        const L = (p.weapon && p.weapon.def.look && p.weapon.def.look.length) || 20;
        const fx = 2 - p.recoilAnim * 6 + L * 0.45 + 6, fy = 6 + 4.1;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, '#ffb36b', wx(r * 0.5 + 1, 0), wy(r * 0.5 + 1, 0), 20, 0.5);
        glow(ctx, '#3ddc84', wx(-r - 4.5, -2), wy(-r - 4.5, -2), 10, Math.floor(time * 2) % 2 ? 0.8 : 0.2);
        glow(ctx, '#fff4dc', wx(fx, fy), wy(fx, fy), 14, 0.9);
        ctx.restore();
      });
    };
  }
})(window.BO);
