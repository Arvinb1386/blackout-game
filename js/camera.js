/* =========================================================================
 * BLACKOUT :: camera.js
 * Smooth follow camera with aim look-ahead, trauma-based screen shake and
 * directional recoil kick.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const FOLLOW_LAMBDA = 7;
  const SHAKE_MAX_OFFSET = 22;
  const SHAKE_MAX_ROT = 0.025;
  const TRAUMA_DECAY = 1.6;
  const KICK_RECOVERY = 14;

  class Camera {
    constructor() {
      this.x = 0; this.y = 0;
      this.viewW = 800; this.viewH = 600;
      this.zoom = 1;
      this.targetZoom = 1;
      this.trauma = 0;
      this.shakeX = 0; this.shakeY = 0; this.shakeRot = 0;
      this.kickX = 0; this.kickY = 0;
      this.time = 0;
      this.shakeEnabled = true;
      this.bounds = null;
    }

    setViewport(w, h) {
      this.viewW = w; this.viewH = h;
      // Keep a consistent field of view across resolutions: ~1500 world px wide.
      this.targetZoom = U.clamp(Math.min(w / 1500, h / 900), 0.62, 1.35);
      this.zoom = this.targetZoom;
    }

    snapTo(x, y) { this.x = x; this.y = y; this.kickX = this.kickY = 0; this.trauma = 0; }

    addTrauma(amount) {
      if (!this.shakeEnabled) return;
      this.trauma = Math.min(1, this.trauma + amount);
    }

    kick(angle, amount) {
      if (!this.shakeEnabled) return;
      this.kickX -= Math.cos(angle) * amount;
      this.kickY -= Math.sin(angle) * amount;
    }

    /**
     * @param target  entity with x,y
     * @param aimX/aimY world-space cursor
     * @param lookAhead fraction of cursor offset the camera leans towards
     */
    update(dt, target, aimX, aimY, lookAhead) {
      this.time += dt;
      const lead = lookAhead || 0.22;
      const maxLead = 260 + lead * 300;
      let ox = (aimX - target.x) * lead, oy = (aimY - target.y) * lead;
      const ol = Math.sqrt(ox * ox + oy * oy);
      if (ol > maxLead) { ox = ox / ol * maxLead; oy = oy / ol * maxLead; }
      this.x = U.damp(this.x, target.x + ox, FOLLOW_LAMBDA, dt);
      this.y = U.damp(this.y, target.y + oy, FOLLOW_LAMBDA, dt);
      this.kickX = U.damp(this.kickX, 0, KICK_RECOVERY, dt);
      this.kickY = U.damp(this.kickY, 0, KICK_RECOVERY, dt);
      this.zoom = U.damp(this.zoom, this.targetZoom, 4, dt);

      this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
      const shake = this.shakeEnabled ? this.trauma * this.trauma : 0;
      // Layered sines give smooth, non-repeating pseudo-noise without allocations.
      const t = this.time * 38;
      this.shakeX = SHAKE_MAX_OFFSET * shake * (Math.sin(t * 1.13) * 0.6 + Math.sin(t * 2.71) * 0.4);
      this.shakeY = SHAKE_MAX_OFFSET * shake * (Math.sin(t * 1.37 + 3) * 0.6 + Math.sin(t * 2.33 + 1) * 0.4);
      this.shakeRot = SHAKE_MAX_ROT * shake * Math.sin(t * 0.91 + 7);
    }

    /** Render-space center (includes shake and kick). */
    get renderX() { return this.x + this.shakeX + this.kickX; }
    get renderY() { return this.y + this.shakeY + this.kickY; }

    worldToScreenX(x) { return (x - this.renderX) * this.zoom + this.viewW / 2; }
    worldToScreenY(y) { return (y - this.renderY) * this.zoom + this.viewH / 2; }
    screenToWorldX(sx) { return (sx - this.viewW / 2) / this.zoom + this.x; }
    screenToWorldY(sy) { return (sy - this.viewH / 2) / this.zoom + this.y; }

    /** Applies the world transform to a 2D context (assumes identity * dpr base). */
    apply(ctx) {
      ctx.translate(this.viewW / 2, this.viewH / 2);
      ctx.rotate(this.shakeRot);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.renderX, -this.renderY);
    }

    /** World-space visible rectangle with a margin, for culling. */
    visibleRect(margin) {
      const m = margin || 0;
      const hw = this.viewW / 2 / this.zoom + m, hh = this.viewH / 2 / this.zoom + m;
      return { x0: this.renderX - hw, y0: this.renderY - hh, x1: this.renderX + hw, y1: this.renderY + hh };
    }
  }

  BO.Camera = Camera;
})(window.BO);
