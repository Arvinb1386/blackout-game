/* =========================================================================
 * BLACKOUT :: postfx.js
 * Graphics overhaul layered on top of renderer.js:
 *  - richer static map: grime texture, floor plates, wall panels, emissive
 *    tech lights, contact shadows and theme decor (puddles, frost, scorch)
 *  - volumetric flashlight beam with floating dust
 *  - screen-space weather per theme (rain, snow, embers, dust, data motes)
 *  - bloom, colour grading, low-health desaturation, explosion flash,
 *    vignette, film grain and scanlines
 * Toggle with Settings > POST-PROCESSING. Everything degrades gracefully.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const CFG = BO.CONFIG;
  const TILE = CFG.TILE;
  const T = BO.TILE_TYPE;
  const C = BO.Collision;
  const R = BO.Renderer.prototype;

  const settings = () => (BO.SaveSystem && BO.SaveSystem.data && BO.SaveSystem.data.settings) || {};
  const enabled = () => settings().postfx !== false;
  const qualityMul = () => { const q = settings().particles; return q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1; };

  let FILTER_OK = null;
  function filterSupported() {
    if (FILTER_OK !== null) return FILTER_OK;
    try {
      const g = document.createElement('canvas').getContext('2d');
      g.filter = 'blur(2px)';
      FILTER_OK = g.filter === 'blur(2px)';
    } catch (e) { FILTER_OK = false; }
    return FILTER_OK;
  }

  /* Noise tiles are deterministic per (size, seed) and reused across missions. */
  const NOISE_CACHE = Object.create(null);

  function noiseCanvas(size, seed) {
    // Deterministic per (size, seed), so cache it: the static pass runs on every
    // mission start and regenerating these each time was pure overhead.
    const key = size + ':' + seed;
    if (NOISE_CACHE[key]) return NOISE_CACHE[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const rng = U.makeRng(seed);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(rng() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    NOISE_CACHE[key] = c;
    return c;
  }

  /* ========================= Static map detail ========================= */
  function enhanceStatic(c, level, opts) {
    const skipNoise = !!(opts && opts.skipNoise);
    const g = c.getContext('2d');
    const map = level.map, th = level.theme;
    const rng = U.makeRng((level.seed || 1) + 4242);
    const isFloor = (x, y) => map.inBounds(x, y) && map.tiles[map.idx(x, y)] !== T.SOLID;
    const isSolid = (x, y) => !map.inBounds(x, y) || map.tiles[map.idx(x, y)] === T.SOLID;

    // Large maps (up to 92x66 tiles = 4416x3168 = ~53 MP) can exceed the
    // browser's canvas area limit. A silent failure here left the floor
    // untextured until the player retried, so wrap the whole pass.
    if (!g) return;

    // 1. Grime. The noise is TILED at its native size, never stretched: blowing a
    // 40x40 tile up to 480px turns every sample into a ~12px blob, which tiled
    // across the whole map reads as smeared, out-of-focus fog that buries the
    // floor tiles underneath it.
    if (!skipNoise) {
      const coarse = noiseCanvas(256, (level.seed || 1) + 1);
      const big = document.createElement('canvas');
      big.width = big.height = 512;
      const bg = big.getContext('2d');
      bg.fillStyle = bg.createPattern(coarse, 'repeat');
      bg.fillRect(0, 0, 512, 512);
      const fine = noiseCanvas(128, (level.seed || 1) + 2);
      g.save();
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.16;
      g.fillStyle = g.createPattern(big, 'repeat');
      g.fillRect(0, 0, c.width, c.height);
      g.globalAlpha = 0.07;
      g.fillStyle = g.createPattern(fine, 'repeat');
      g.fillRect(0, 0, c.width, c.height);
      g.restore();
    }

    // 2. Floor plates with bevels and bolts (rooms only).
    for (let ty = 0; ty < map.h - 1; ty += 2) for (let tx = 0; tx < map.w - 1; tx += 2) {
      const i = map.idx(tx, ty), room = map.roomId[i];
      if (room < 0 || map.tiles[i] === T.SOLID) continue;
      let ok = true;
      for (let y = 0; y < 2 && ok; y++) for (let x = 0; x < 2; x++) {
        const j = map.idx(tx + x, ty + y);
        if (map.tiles[j] === T.SOLID || map.roomId[j] !== room) { ok = false; break; }
      }
      if (!ok) continue;
      const x = tx * TILE, y = ty * TILE, s = TILE * 2;
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, s - 2, s - 2);
      g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 1;
      g.strokeRect(x + 3.5, y + 3.5, s - 7, s - 7);
      g.fillStyle = 'rgba(255,255,255,0.09)';
      g.fillRect(x + 7, y + 7, 2, 2); g.fillRect(x + s - 9, y + 7, 2, 2);
      g.fillRect(x + 7, y + s - 9, 2, 2); g.fillRect(x + s - 9, y + s - 9, 2, 2);
      if (rng() < 0.18) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        for (let k = 10; k < s - 10; k += 8) g.fillRect(x + 12, y + k, s - 24, 3);
      }
    }

    // 3. Corridor guide lines in the theme trim colour.
    g.fillStyle = U.rgba(th.trim, 0.05);
    for (let ty = 1; ty < map.h - 1; ty++) for (let tx = 1; tx < map.w - 1; tx++) {
      const i = map.idx(tx, ty);
      if (map.tiles[i] === T.SOLID || map.roomId[i] >= 0) continue;
      if ((tx + ty) % 2 === 0) g.fillRect(tx * TILE + TILE / 2 - 1, ty * TILE + 14, 2, TILE - 28);
    }

    // 4. Contact shadows from side / bottom walls.
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (!isFloor(tx, ty)) continue;
      const x = tx * TILE, y = ty * TILE;
      if (isSolid(tx - 1, ty)) {
        const gr = g.createLinearGradient(x, 0, x + 16, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x, y, 16, TILE);
      }
      if (isSolid(tx + 1, ty)) {
        const gr = g.createLinearGradient(x + TILE, 0, x + TILE - 10, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x + TILE - 10, y, 10, TILE);
      }
      if (isSolid(tx, ty + 1)) {
        const gr = g.createLinearGradient(0, y + TILE, 0, y + TILE - 8);
        gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x, y + TILE - 8, TILE, 8);
      }
    }

    // 5. Wall faces: panel insets, top-edge highlight, emissive tech lights.
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (!isSolid(tx, ty) || !map.inBounds(tx, ty)) continue;
      let touches = false;
      for (let y = ty - 1; y <= ty + 1 && !touches; y++) for (let x = tx - 1; x <= tx + 1; x++) if (isFloor(x, y)) { touches = true; break; }
      if (!touches) continue;
      const x = tx * TILE, y = ty * TILE;
      g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1;
      g.strokeRect(x + 6.5, y + 6.5, TILE - 13, TILE - 13);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + TILE / 2 - 1, y + 8, 2, TILE - 16);
      if (isFloor(tx, ty + 1)) {
        const gr = g.createLinearGradient(0, y + TILE - 7, 0, y + TILE);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.12)');
        g.fillStyle = gr; g.fillRect(x, y + TILE - 7, TILE, 7);
        if (rng() < 0.14) {
          g.fillStyle = th.trim;
          g.globalAlpha = 0.85;
          g.fillRect(x + 10 + Math.floor(rng() * (TILE - 26)), y + TILE - 13, 5, 3);
          g.globalAlpha = 0.18;
          g.fillRect(x + 4, y + TILE - 16, TILE - 8, 9);
          g.globalAlpha = 1;
        }
      }
    }

    // 6. Theme decor.
    const weather = th.weather;
    const floors = [];
    for (let ty = 1; ty < map.h - 1; ty++) for (let tx = 1; tx < map.w - 1; tx++) if (map.tiles[map.idx(tx, ty)] === T.FLOOR && map.roomId[map.idx(tx, ty)] >= 0) floors.push([tx, ty]);
    const count = Math.round(floors.length / 28);
    for (let k = 0; k < count && floors.length; k++) {
      const f = floors[Math.floor(rng() * floors.length)];
      const x = f[0] * TILE + rng() * TILE, y = f[1] * TILE + rng() * TILE;
      const rw = 14 + rng() * 34, rh = rw * (0.45 + rng() * 0.3), rot = rng() * Math.PI;
      g.save();
      g.translate(x, y); g.rotate(rot);
      if (weather === 'rain') {
        g.fillStyle = 'rgba(90,130,170,0.09)';
        g.beginPath(); g.ellipse(0, 0, rw, rh, 0, 0, U.TAU); g.fill();
        g.strokeStyle = 'rgba(180,220,255,0.07)'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(-rw * 0.15, -rh * 0.2, rw * 0.7, rh * 0.5, 0, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
      } else if (weather === 'snow') {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rw);
        gr.addColorStop(0, 'rgba(230,245,255,0.1)'); gr.addColorStop(1, 'rgba(230,245,255,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rw, rh * 1.4, 0, 0, U.TAU); g.fill();
      } else if (weather === 'embers') {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rw);
        gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rw, rh * 1.2, 0, 0, U.TAU); g.fill();
        if (rng() < 0.35) {
          g.strokeStyle = 'rgba(255,120,40,0.16)'; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(-rw * 0.6, 0); g.lineTo(-rw * 0.1, rh * 0.3); g.lineTo(rw * 0.3, -rh * 0.2); g.lineTo(rw * 0.7, rh * 0.1); g.stroke();
        }
      } else {
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.beginPath(); g.ellipse(0, 0, rw * 0.7, rh * 0.7, 0, 0, U.TAU); g.fill();
      }
      g.restore();
    }
    if (weather === 'snow') {
      // Frost creeping in from walls.
      for (let ty = 1; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
        if (!isFloor(tx, ty) || !isSolid(tx, ty - 1) || rng() > 0.6) continue;
        const gr = g.createLinearGradient(0, ty * TILE, 0, ty * TILE + 18);
        gr.addColorStop(0, 'rgba(220,240,255,0.14)'); gr.addColorStop(1, 'rgba(220,240,255,0)');
        g.fillStyle = gr; g.fillRect(tx * TILE, ty * TILE, TILE, 18);
      }
    }
  }

  const origBuild = R.buildStaticLayer;
  R.buildStaticLayer = function (level) {
    const c = origBuild.call(this, level);
    if (!enabled()) return c;
    // The floor-decor pass allocates several full-size canvases on top of the
    // static layer. On the biggest maps that can trip the browser's canvas
    // memory limit, and the old U.safe() call swallowed the failure - leaving a
    // flat, texture-less floor that only reappeared on a retry. Now a failure
    // is recorded and retried once at a reduced quality instead of hidden.
    try {
      enhanceStatic(c, level);
    } catch (err) {
      console.warn('[postfx] static pass failed, retrying at reduced quality:', err);
      try {
        enhanceStatic(c, level, { skipNoise: true });
      } catch (err2) {
        console.warn('[postfx] static pass failed again, floor left plain:', err2);
      }
    }
    return c;
  };

  /* ============================ Post stack ============================= */
  class PostFX {
    constructor(r) {
      this.r = r;
      this.hit = C.makeHit();
      this.rays = 40;
      this.poly = new Float32Array((this.rays + 2) * 2);
      this.motes = [];
      this.weather = [];
      this.weatherKind = null;
      this.lastCamX = null; this.lastCamY = null;
      this.flash = 0; this.flashColor = '#ffd7a8';
      this.lastT = 0; this.lastMoteT = 0;
      this.bloomA = document.createElement('canvas');
      this.bloomB = document.createElement('canvas');
      this.vig = null; this.vigKey = '';
      this.grain = [noiseCanvas(160, 11), noiseCanvas(160, 23), noiseCanvas(160, 37)];
      this.grainPats = null;
      this.scanPat = null;
      // CanvasPattern belongs to the context that created it. The canvas is
      // reallocated on resize (and patterns die with it), so remember which
      // context the cached patterns belong to and rebuild when it changes.
      this.patCtx = null;
    }

    /* ------------------- world space (camera applied) ------------------- */
    world(game, time) {
      const p = game.player;
      if (!p || p.dead || !game.map) return;
      const ctx = this.r.ctx, map = game.map;
      const range = CFG.FLASHLIGHT_RANGE * 0.95, half = CFG.FLASHLIGHT_FOV / 2, rays = this.rays;
      let n = 0;
      for (let i = 0; i <= rays; i++) {
        const a = p.angle - half + 2 * half * (i / rays);
        const h = C.raycast(map, p.x, p.y, p.x + Math.cos(a) * range, p.y + Math.sin(a) * range, BO.COLLIDE.SIGHT, this.hit);
        this.poly[n++] = h.x; this.poly[n++] = h.y;
      }
      ctx.save();
      game.camera.apply(ctx);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (let i = 0; i < n; i += 2) ctx.lineTo(this.poly[i], this.poly[i + 1]);
      ctx.closePath();
      const gr = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, range);
      gr.addColorStop(0, 'rgba(255,236,205,0.15)');
      gr.addColorStop(0.35, 'rgba(255,228,190,0.07)');
      gr.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.clip();
      this._motes(ctx, p, time, range);
      ctx.restore();
    }

    _newMote(p, range) {
      const a = Math.random() * U.TAU, d = Math.sqrt(Math.random()) * range;
      return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, vx: U.rand(-9, 9), vy: U.rand(-12, 5), s: U.rand(1.4, 3.4), ph: Math.random() * 6, f: U.rand(1, 3) };
    }

    _motes(ctx, p, time, range) {
      const dt = U.clamp(time - this.lastMoteT, 0, 0.05);
      this.lastMoteT = time;
      const count = Math.round(70 * qualityMul());
      while (this.motes.length < count) this.motes.push(this._newMote(p, range));
      if (this.motes.length > count) this.motes.length = count;
      const S = BO.softSprite('#ffe6c0');
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        m.x += m.vx * dt; m.y += m.vy * dt; m.ph += dt;
        if (U.dist2(m.x, m.y, p.x, p.y) > range * range) this.motes[i] = this._newMote(p, range);
        ctx.globalAlpha = U.clamp(0.3 + Math.sin(m.ph * m.f) * 0.25, 0, 1);
        ctx.drawImage(S, m.x - m.s * 2, m.y - m.s * 2, m.s * 4, m.s * 4);
      }
      ctx.globalAlpha = 1;
    }

    /* -------------------- screen space (device px) -------------------- */
    screen(theme, time, game) {
      const r = this.r, ctx = r.ctx, W = r.canvas.width, H = r.canvas.height;
      const dt = U.clamp(time - this.lastT, 0, 0.05);
      this.lastT = time;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      if (theme && theme.weather) U.safe('postfx.weather', () => this._weather(ctx, theme.weather, dt, W, H, game));
      if (filterSupported()) U.safe('postfx.bloom', () => this._bloom(ctx, W, H));
      if (theme && theme.grade) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = theme.grade;
        ctx.fillRect(0, 0, W, H);
      }
      const p = game && game.player;
      if (p && p.maxHp) {
        const low = p.dead ? 0.85 : U.clamp((0.45 - p.hp / p.maxHp) / 0.45, 0, 1) * 0.75;
        if (low > 0.01) {
          ctx.globalCompositeOperation = 'saturation';
          ctx.globalAlpha = low;
          ctx.fillStyle = '#808080';
          ctx.fillRect(0, 0, W, H);
        }
      }
      this.flash = Math.max(0, this.flash - dt * 3.2);
      if (this.flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.flash;
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(this._vignette(W, H), 0, 0);
      this._grain(ctx, W, H, time);
      ctx.restore();
    }

    _bloom(ctx, W, H) {
      const bw = Math.max(1, Math.round(W / 4)), bh = Math.max(1, Math.round(H / 4));
      const A = this.bloomA, B = this.bloomB;
      if (A.width !== bw || A.height !== bh) { A.width = B.width = bw; A.height = B.height = bh; }
      const a = A.getContext('2d'), b = B.getContext('2d');
      a.globalCompositeOperation = 'copy';
      a.filter = 'brightness(0.85) contrast(2.6) saturate(1.4)';
      a.drawImage(this.r.canvas, 0, 0, bw, bh);
      a.filter = 'none';
      b.globalCompositeOperation = 'copy';
      b.filter = 'blur(' + Math.max(2, Math.round(bw / 170)) + 'px)';
      b.drawImage(A, 0, 0);
      b.filter = 'none';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4;
      ctx.drawImage(B, 0, 0, W, H);
      a.filter = 'blur(' + Math.max(4, Math.round(bw / 60)) + 'px)';
      a.drawImage(B, 0, 0);
      a.filter = 'none';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(A, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    _vignette(W, H) {
      const key = W + 'x' + H;
      if (this.vig && this.vigKey === key) return this.vig;
      const c = this.vig || document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.58);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.7, 'rgba(2,3,8,0.28)');
      gr.addColorStop(1, 'rgba(2,3,8,0.68)');
      g.clearRect(0, 0, W, H);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      this.vig = c; this.vigKey = key;
      return c;
    }

    /**
     * True when every cached pattern can still be used on this context.
     * Existence is not enough: a pattern whose canvas was reallocated still
     * "exists" as a JS object, but assigning it to fillStyle is silently
     * ignored. So probe it - the cheapest reliable test is to actually set
     * fillStyle and see whether the setter took.
     */
    _patsUsable(ctx) {
      if (!this.grainPats || this.grainPats.length !== this.grain.length) return false;
      if (!this.scanPat || !this.grainPats.every(Boolean)) return false;
      const probe = this.grainPats[0];
      const before = ctx.fillStyle;
      ctx.fillStyle = probe;
      const took = ctx.fillStyle === probe;
      ctx.fillStyle = before;
      return took;
    }

    /** Builds the grain + scanline patterns against the given context. */
    _buildPatterns(ctx) {
      this.grainPats = this.grain.map(c => ctx.createPattern(c, 'repeat'));
      const s = document.createElement('canvas');
      s.width = 1; s.height = 4;
      const sg = s.getContext('2d');
      sg.fillStyle = 'rgba(0,0,0,0.07)';
      sg.fillRect(0, 0, 1, 1);
      this.scanPat = ctx.createPattern(s, 'repeat');
      this.patCtx = ctx;
    }

    _grain(ctx, W, H, time) {
      // A CanvasPattern belongs to the context that created it, and it is
      // invalidated when that canvas's backing store is reallocated (any
      // resize). Assigning a dead pattern to fillStyle is a silent no-op that
      // leaves the previous colour behind - the "striped / checkered" screen.
      // So key the cache on the context and verify the patterns before use.
      if (this.patCtx !== ctx || !this._patsUsable(ctx)) this._buildPatterns(ctx);
      const idx = Math.floor(time * 24) % this.grainPats.length;
      const ox = Math.floor(Math.random() * 160), oy = Math.floor(Math.random() * 160);
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.07;
      ctx.translate(ox, oy);
      ctx.fillStyle = this.grainPats[idx];
      ctx.fillRect(-ox, -oy, W, H);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.scanPat;
      ctx.fillRect(0, 0, W, H);
    }

    /* ----------------------------- Weather ----------------------------- */
    _spawnW(kind, W, H, anywhere) {
      const d = this.r.dpr || 1;
      const x = Math.random() * W, y = anywhere ? Math.random() * H : -20 * d;
      switch (kind) {
        case 'rain': return { x, y, vx: -140 * d, vy: U.rand(900, 1300) * d, len: U.rand(14, 26) * d, a: U.rand(0.12, 0.3) };
        case 'snow': return { x, y, vx: U.rand(-30, -10) * d, vy: U.rand(35, 80) * d, s: U.rand(1, 2.6) * d, ph: Math.random() * 6, a: U.rand(0.35, 0.8) };
        case 'embers': return { x, y: anywhere ? y : H + 20 * d, vx: U.rand(-20, 20) * d, vy: -U.rand(30, 80) * d, s: U.rand(3, 7) * d, ph: Math.random() * 6, a: U.rand(0.4, 0.9) };
        case 'motes': return { x, y, vx: U.rand(-12, 12) * d, vy: U.rand(-12, 12) * d, s: U.rand(2, 5) * d, ph: Math.random() * 6, a: U.rand(0.25, 0.6) };
        default: return { x, y, vx: U.rand(8, 22) * d, vy: U.rand(-6, 6) * d, s: U.rand(1, 2.2) * d, ph: Math.random() * 6, a: U.rand(0.08, 0.2) };
      }
    }

    _weather(ctx, kind, dt, W, H, game) {
      const d = this.r.dpr || 1;
      const area = (W / d) * (H / d) / (1920 * 1080);
      const base = { rain: 170, snow: 140, embers: 55, motes: 60, dust: 70 }[kind] || 0;
      const target = Math.round(base * qualityMul() * U.clamp(area, 0.4, 1.6));
      if (this.weatherKind !== kind) { this.weather.length = 0; this.weatherKind = kind; this.lastCamX = null; }
      while (this.weather.length < target) this.weather.push(this._spawnW(kind, W, H, true));
      if (this.weather.length > target) this.weather.length = target;
      let dx = 0, dy = 0;
      const cam = game && game.camera;
      if (cam && U.isFiniteNumber(cam.x)) {
        const z = (cam.zoom || 1) * d;
        if (this.lastCamX !== null) { dx = (cam.x - this.lastCamX) * z; dy = (cam.y - this.lastCamY) * z; }
        this.lastCamX = cam.x; this.lastCamY = cam.y;
        if (Math.abs(dx) > W * 0.5 || Math.abs(dy) > H * 0.5) { dx = 0; dy = 0; }
      }
      const pad = 40 * d;
      const list = this.weather;
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        w.x += w.vx * dt - dx; w.y += w.vy * dt - dy;
        if (w.ph !== undefined) { w.ph += dt; if (kind === 'snow' || kind === 'embers') w.x += Math.sin(w.ph * 1.7) * 12 * d * dt; }
        if (w.x < -pad) w.x += W + pad * 2; else if (w.x > W + pad) w.x -= W + pad * 2;
        if (w.y < -pad) w.y += H + pad * 2; else if (w.y > H + pad) w.y -= H + pad * 2;
      }
      if (kind === 'rain') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgb(150,185,220)';
        ctx.lineWidth = 1.1 * d;
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = pass ? 0.3 : 0.16;
          ctx.beginPath();
          for (let i = pass; i < list.length; i += 2) {
            const w = list[i], k = w.len / w.vy;
            ctx.moveTo(w.x, w.y); ctx.lineTo(w.x - w.vx * k, w.y - w.len);
          }
          ctx.stroke();
        }
        if (dt > 0 && Math.random() < 0.9) {
          ctx.globalAlpha = 0.18; ctx.lineWidth = 1 * d;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) { const sx = Math.random() * W, sy = Math.random() * H, sr = U.rand(2, 6) * d; ctx.moveTo(sx + sr, sy); ctx.ellipse(sx, sy, sr, sr * 0.45, 0, 0, U.TAU); }
          ctx.stroke();
        }
      } else if (kind === 'snow') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgb(225,240,255)';
        for (let i = 0; i < list.length; i++) { const w = list[i]; ctx.globalAlpha = w.a * 0.6; ctx.fillRect(w.x, w.y, w.s, w.s); }
      } else {
        const color = kind === 'embers' ? '#ff9a3c' : kind === 'motes' ? '#7fe3ff' : '#d9c7a8';
        const S = BO.softSprite(color);
        ctx.globalCompositeOperation = kind === 'dust' ? 'source-over' : 'lighter';
        for (let i = 0; i < list.length; i++) {
          const w = list[i];
          const fl = kind === 'dust' ? 1 : 0.55 + Math.sin(w.ph * 5) * 0.45;
          ctx.globalAlpha = U.clamp(w.a * fl, 0, 1);
          if (kind === 'dust') { ctx.fillStyle = color; ctx.fillRect(w.x, w.y, w.s, w.s); }
          else ctx.drawImage(S, w.x - w.s, w.y - w.s, w.s * 2, w.s * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  R.getPostFX = function () { return this._fx || (this._fx = new PostFX(this)); };

  const origWorld = R.renderWorld;
  R.renderWorld = function (game, time) {
    origWorld.call(this, game, time);
    if (!enabled()) return;
    U.safe('postfx.frame', () => {
      const fx = this.getPostFX();
      fx.world(game, time);
      fx.screen(game.level ? game.level.theme : null, time, game);
    });
  };

  /* --------------------------- Menu backdrop --------------------------- */
  const UIP = BO.UIManager && BO.UIManager.prototype;
  if (UIP && UIP.renderMenuOverlay) {
    const origMenu = UIP.renderMenuOverlay;
    UIP.renderMenuOverlay = function (ctx, t) {
      if (enabled()) U.safe('postfx.menu', () => {
        const m = this.game.menuScene;
        this.game.renderer.getPostFX().screen(m ? m.level.theme : null, t, { camera: m ? m.cam : null, player: null });
      });
      return origMenu.call(this, ctx, t);
    };
  }

  /* ---------------------- Bigger, punchier explosions ---------------------- */
  const G = BO.Game && BO.Game.prototype;
  if (G && G.explode) {
    const origExplode = G.explode;
    G.explode = function (x, y, radius, damage, source, opts) {
      origExplode.call(this, x, y, radius, damage, source, opts);
      if (!enabled()) return;
      U.safe('postfx.explode', () => {
        const p = this.player;
        const fx = this.renderer.getPostFX();
        const near = p ? U.clamp(1 - U.dist(p.x, p.y, x, y) / 1600, 0, 1) : 0.5;
        fx.flash = Math.max(fx.flash, 0.2 * near * U.clamp(radius / 130, 0.4, 1.4));
        fx.flashColor = '#ffcf9a';
        if (BO.PARTICLE_SHAPE && BO.PARTICLE_SHAPE.RING) {
          this.particles.spawn(x, y, 0, 0, 0.45, radius * 0.2, radius * 1.9, '#ffd9a0', BO.PARTICLE_SHAPE.RING, { additive: true });
        }
        this.addLight(x, y, radius * 1.4, '#fff1c9', 0.12, 1);
      });
    };
  }

  BO.I18N.extend('en', { 'set.postfx': 'POST-PROCESSING' });
  BO.I18N.extend('fa', { 'set.postfx': 'جلوه‌های تصویری' });
  BO.PostFX = PostFX;
})(window.BO);
