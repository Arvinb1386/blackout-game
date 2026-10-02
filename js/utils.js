/* =========================================================================
 * BLACKOUT :: utils.js
 * Shared math helpers, seeded RNG, object pooling and a tiny event bus.
 * All game modules attach to the single global namespace `BO`.
 * ========================================================================= */
'use strict';
window.BO = window.BO || {};

(function (BO) {
  const TAU = Math.PI * 2;

  const U = {
    TAU,
    clamp(v, min, max) { return v < min ? min : (v > max ? max : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    invLerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); },
    rand(min, max) { return min + Math.random() * (max - min); },
    randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },
    /** Triangular distribution in [-1, 1], cheap pseudo-gaussian spread. */
    randSpread() { return Math.random() + Math.random() - 1; },
    pick(list) { return list[Math.floor(Math.random() * list.length)]; },
    chance(p) { return Math.random() < p; },
    dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },
    dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
    angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },
    /** Signed shortest difference from angle a to angle b, in (-PI, PI]. */
    angleDiff(a, b) {
      let d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    },
    /** Rotate angle `from` towards `to` by at most `step` radians. */
    turnTowards(from, to, step) {
      const d = U.angleDiff(from, to);
      if (Math.abs(d) <= step) return to;
      return from + Math.sign(d) * step;
    },
    approach(value, target, step) {
      if (value < target) return Math.min(value + step, target);
      return Math.max(value - step, target);
    },
    /** Frame-rate independent exponential smoothing. */
    damp(current, target, lambda, dt) { return U.lerp(current, target, 1 - Math.exp(-lambda * dt)); },
    easeOutCubic(t) { const k = 1 - t; return 1 - k * k * k; },
    easeInCubic(t) { return t * t * t; },
    easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); },
    formatTime(seconds) {
      const s = Math.max(0, Math.floor(seconds));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + ':' + (r < 10 ? '0' : '') + r;
    },
    hexToRgb(hex) {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },
    rgba(hex, alpha) {
      const c = U.hexToRgb(hex);
      return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
    },
    /**
     * Segment vs circle intersection.
     * Returns the parametric t in [0,1] of the first contact, or -1.
     */
    segmentCircle(x0, y0, x1, y1, cx, cy, r) {
      const dx = x1 - x0, dy = y1 - y0;
      const fx = x0 - cx, fy = y0 - cy;
      const a = dx * dx + dy * dy;
      if (a < 1e-9) return (fx * fx + fy * fy <= r * r) ? 0 : -1;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - r * r;
      let disc = b * b - 4 * a * c;
      if (disc < 0) return -1;
      disc = Math.sqrt(disc);
      const t1 = (-b - disc) / (2 * a);
      const t2 = (-b + disc) / (2 * a);
      if (t1 >= 0 && t1 <= 1) return t1;
      if (t1 < 0 && t2 >= 0) return 0; // segment starts inside the circle
      return -1;
    },
    /** Mulberry32 seeded random generator, used for deterministic level layouts. */
    makeRng(seed) {
      let s = seed >>> 0;
      return function rng() {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    /** Runs fn and swallows (but reports once per label) any exception. */
    safe(label, fn) {
      try { return fn(); } catch (err) { U.reportError(label, err); return undefined; }
    },
    _reported: Object.create(null),
    reportError(label, err) {
      if (U._reported[label]) return;
      U._reported[label] = true;
      console.warn('[BLACKOUT] recovered from error in ' + label + ':', err);
    }
  };

  /**
   * Fixed-capacity object pool. Objects are created once and recycled, which
   * keeps the hot game loop allocation free.
   */
  class Pool {
    constructor(factory, initialSize, maxSize) {
      this.factory = factory;
      this.maxSize = maxSize || initialSize;
      this.items = [];
      this.free = [];
      this.activeCount = 0;
      for (let i = 0; i < initialSize; i++) this._create();
    }
    _create() {
      const item = this.factory();
      item.active = false;
      this.items.push(item);
      this.free.push(item);
      return item;
    }
    /** Returns an inactive object or null when the pool is exhausted. */
    acquire() {
      if (this.free.length === 0) {
        if (this.items.length >= this.maxSize) return null;
        this._create();
      }
      const item = this.free.pop();
      item.active = true;
      this.activeCount++;
      return item;
    }
    release(item) {
      if (!item.active) return;
      item.active = false;
      this.activeCount--;
      this.free.push(item);
    }
    releaseAll() {
      for (let i = 0; i < this.items.length; i++) this.release(this.items[i]);
    }
    setMaxSize(n) { this.maxSize = Math.max(n, 1); }
  }

  /** Minimal publish/subscribe bus so systems stay loosely coupled. */
  class EventBus {
    constructor() { this.handlers = Object.create(null); }
    on(name, fn) { (this.handlers[name] || (this.handlers[name] = [])).push(fn); return fn; }
    off(name, fn) {
      const list = this.handlers[name];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    emit(name, payload) {
      const list = this.handlers[name];
      if (!list) return;
      for (let i = 0; i < list.length; i++) U.safe('event:' + name, () => list[i](payload));
    }
  }

  BO.U = U;
  BO.Pool = Pool;
  BO.events = new EventBus();

  /** Global gameplay constants (tuning lives here, not in logic). */
  BO.CONFIG = {
    TILE: 48,
    MAX_DT: 1 / 20,
    DARKNESS: 0.9,
    FLASHLIGHT_RANGE: 560,
    FLASHLIGHT_FOV: 1.25,
    AMBIENT_LIGHT_RADIUS: 175,
    FLASHLIGHT_RAYS: 96,
    AMBIENT_RAYS: 64,
    PLAYER_RADIUS: 15,
    PLAYER_BASE_SPEED: 230,
    SPRINT_MULTIPLIER: 1.42,
    STAMINA_MAX: 100,
    STAMINA_DRAIN: 32,
    STAMINA_REGEN: 22,
    DODGE_SPEED: 660,
    DODGE_DURATION: 0.28,
    DODGE_IFRAMES: 0.4,
    DODGE_COOLDOWN: 1.05,
    ARMOR_ABSORB: 0.6,
    INTERACT_RANGE: 64,
    DOOR_TRIGGER_RANGE: 78,
    PATH_BUDGET_PER_FRAME: 5,
    PERCEPTION_INTERVAL: 0.12,
    HEADSHOT_ZONE: 0.42,
    HEADSHOT_MULT: 2,
    CRIT_MULT: 1.75,
    BASE_CRIT_CHANCE: 0.07,
    EXTRACTION_TIME: 3,
    EXTRACTION_RADIUS: 92,
    HACK_TIME: 2.4,
    CHARGE_FUSE: 2.5,
    MAX_DECALS: 260,
    LEVEL_UP_BONUS: 120
  };
})(window.BO);
