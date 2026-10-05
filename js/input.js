/* =========================================================================
 * BLACKOUT :: input.js
 * Keyboard + mouse input. Uses physical key codes (KeyW etc.) so controls
 * work on Persian keyboard layouts. When pointer lock is active the cursor is
 * virtual and scaled by the mouse sensitivity setting.
 * ========================================================================= */
'use strict';
(function (BO) {
  const GAME_KEYS = ['Escape', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  class InputManager {
    constructor(canvas) {
      this.canvas = canvas;
      this.keys = new Set();
      this.pressed = new Set();
      this.mouseDown = false;
      this.mousePressed = false;
      this.rightDown = false;
      this.cursorX = window.innerWidth / 2;
      this.cursorY = window.innerHeight / 2;
      this.inside = true;
      this.locked = false;
      this.sensitivity = 1;
      this.wheel = 0;
      this.captureGameKeys = false;
      this._bind();
    }

    _bind() {
      window.addEventListener('keydown', (e) => {
        if ((this.captureGameKeys || (document.fullscreenElement && e.code === 'Escape')) && GAME_KEYS.indexOf(e.code) >= 0) {
          e.preventDefault();
        }
        if (!this.keys.has(e.code)) this.pressed.add(e.code);
        this.keys.add(e.code);
        BO.events.emit('input:key', e.code);
      });
      window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
      window.addEventListener('mousedown', (e) => {
        if (e.button === 0) { this.mouseDown = true; this.mousePressed = true; }
        if (e.button === 2) this.rightDown = true;
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouseDown = false;
        if (e.button === 2) this.rightDown = false;
      });
      window.addEventListener('mousemove', (e) => this._onMove(e));
      window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('mouseleave', () => { this.inside = false; });
      document.addEventListener('mouseenter', () => { this.inside = true; });
      window.addEventListener('blur', () => this.clear());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
      document.addEventListener('pointerlockchange', () => {
        const wasLocked = this.locked;
        this.locked = document.pointerLockElement === this.canvas;
        if (wasLocked && !this.locked) BO.events.emit('input:lockLost');
      });
    }

    _onMove(e) {
      this.inside = true;
      if (this.locked) {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        this.cursorX = BO.U.clamp(this.cursorX + e.movementX * this.sensitivity, 0, w);
        this.cursorY = BO.U.clamp(this.cursorY + e.movementY * this.sensitivity, 0, h);
      } else {
        const r = this.canvas.getBoundingClientRect();
        this.cursorX = e.clientX - r.left;
        this.cursorY = e.clientY - r.top;
      }
    }

    requestLock() {
      try {
        if (this.canvas.requestPointerLock && !this.locked) {
          const result = this.canvas.requestPointerLock();
          if (result && typeof result.catch === 'function') result.catch(() => { /* lock refused: absolute aiming fallback */ });
        }
      } catch (err) { /* pointer lock unavailable (e.g. sandboxed frame) */ }
    }

    releaseLock() {
      try { if (document.exitPointerLock && this.locked) document.exitPointerLock(); } catch (err) { /* ignore */ }
    }

    clampCursor() {
      this.cursorX = BO.U.clamp(this.cursorX, 0, this.canvas.clientWidth);
      this.cursorY = BO.U.clamp(this.cursorY, 0, this.canvas.clientHeight);
    }

    isDown(code) { return this.keys.has(code); }
    wasPressed(code) { return this.pressed.has(code); }
    consume(code) { this.pressed.delete(code); }

    /** Movement vector from WASD / arrows, normalised for smooth diagonals. */
    moveVector(out) {
      let x = 0, y = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      const len = Math.sqrt(x * x + y * y);
      out.x = len > 0 ? x / len : 0;
      out.y = len > 0 ? y / len : 0;
      return out;
    }

    endFrame() {
      this.pressed.clear();
      this.mousePressed = false;
      this.wheel = 0;
    }

    clear() {
      this.keys.clear();
      this.pressed.clear();
      this.mouseDown = false;
      this.mousePressed = false;
      this.rightDown = false;
      BO.events.emit('input:blur');
    }
  }

  BO.InputManager = InputManager;
})(window.BO);
