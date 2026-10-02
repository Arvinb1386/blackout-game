/* =========================================================================
 * BLACKOUT :: renderer.js
 * High-DPI canvas, pre-rendered static map layer, dynamic props/doors and the
 * lighting pipeline: a darkness buffer is carved with a ray-cast flashlight
 * cone, ambient visibility polygon, lamps and muzzle/explosion lights, then
 * coloured light is added back with additive compositing.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const CFG = BO.CONFIG;
  const TILE = CFG.TILE;
  const T = BO.TILE_TYPE;
  const C = BO.Collision;
  const LIGHT_SCALE = 0.5;
  const MAX_DPR = 2;

  /** White radial light sprite used to cut darkness without per-frame gradients. */
  function makeLightSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return c;
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.light = document.createElement('canvas');
      this.lctx = this.light.getContext('2d');
      this.lightSprite = makeLightSprite();
      this.staticLayer = null;
      this.dpr = 1;
      this.w = 0; this.h = 0;
      this.hit = C.makeHit();
      this.visPoly = new Float32Array((CFG.FLASHLIGHT_RAYS + CFG.AMBIENT_RAYS + 4) * 2);
      this.resize();
    }

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      this.w = Math.max(320, window.innerWidth);
      this.h = Math.max(240, window.innerHeight);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.light.width = Math.ceil(this.w * LIGHT_SCALE);
      this.light.height = Math.ceil(this.h * LIGHT_SCALE);
    }

    /* -------------------------- Static map layer -------------------------- */
    buildStaticLayer(level) {
      const map = level.map, th = level.theme;
      const c = document.createElement('canvas');
      c.width = map.pixelW; c.height = map.pixelH;
      const g = c.getContext('2d');
      const rng = U.makeRng(level.seed + 99);
      g.fillStyle = '#06070b';
      g.fillRect(0, 0, c.width, c.height);
      for (let ty = 0; ty < map.h; ty++) {
        for (let tx = 0; tx < map.w; tx++) {
          const i = map.idx(tx, ty), x = tx * TILE, y = ty * TILE;
          const t = map.tiles[i];
          if (t === T.SOLID) { if (this._touchesFloor(map, tx, ty)) this._drawWall(g, map, tx, ty, th); continue; }
          const corridor = map.roomId[i] < 0;
          g.fillStyle = corridor ? th.corridor : ((tx + ty) % 2 ? th.floor : th.floorAlt);
          g.fillRect(x, y, TILE, TILE);
          g.fillStyle = 'rgba(255,255,255,0.025)';
          g.fillRect(x, y, TILE, 1); g.fillRect(x, y, 1, TILE);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x, y + TILE - 1, TILE, 1); g.fillRect(x + TILE - 1, y, 1, TILE);
          if (rng() < 0.25) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 4, y + 4, 2, 2); g.fillRect(x + TILE - 6, y + TILE - 6, 2, 2); }
          if (corridor && (tx + ty) % 3 === 0) { g.fillStyle = 'rgba(255,255,255,0.02)'; g.fillRect(x + 6, y + 6, TILE - 12, TILE - 12); }
        }
      }
      // Ambient occlusion strip on floor under walls.
      for (let ty = 1; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
        if (map.tile(tx, ty) === T.SOLID || map.tile(tx, ty - 1) !== T.SOLID) continue;
        const grd = g.createLinearGradient(0, ty * TILE, 0, ty * TILE + 14);
        grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(tx * TILE, ty * TILE, TILE, 14);
      }
      level.decor.forEach(d => this._drawDecor(g, d, th));
      level.doors.forEach(d => {
        // Hazard stripes either side of every doorway.
        d.tiles.forEach(i => {
          const tx = i % map.w, ty = (i - tx) / map.w;
          g.save();
          g.translate(tx * TILE, ty * TILE);
          g.beginPath(); g.rect(0, 0, TILE, TILE); g.clip();
          g.fillStyle = d.arena ? 'rgba(255,45,85,0.18)' : 'rgba(240,190,61,0.14)';
          for (let k = -TILE; k < TILE * 2; k += 12) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 6, 0); g.lineTo(k + 6 - TILE, TILE); g.lineTo(k - TILE, TILE); g.fill(); }
          g.restore();
        });
      });
      level.strips.forEach(s => {
        g.strokeStyle = U.rgba(s.color, 0.5);
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke();
      });
      // Extraction pad marking.
      const ex = level.extraction;
      g.strokeStyle = 'rgba(61,220,132,0.28)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(ex.x, ex.y, CFG.EXTRACTION_RADIUS, 0, U.TAU); g.stroke();
      g.font = '700 46px Khand, sans-serif';
      g.fillStyle = 'rgba(61,220,132,0.16)';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('H', ex.x, ex.y);
      this.staticLayer = c;
      return c;
    }

    _touchesFloor(map, tx, ty) {
      for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (map.isFloor(x, y)) return true;
      return false;
    }

    _drawWall(g, map, tx, ty, th) {
      const x = tx * TILE, y = ty * TILE;
      g.fillStyle = th.wall;
      g.fillRect(x, y, TILE, TILE);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      g.fillStyle = th.wallTop;
      if (map.isFloor(tx, ty + 1)) g.fillRect(x, y + TILE - 5, TILE, 5);
      if (map.isFloor(tx, ty - 1)) g.fillRect(x, y, TILE, 3);
      if (map.isFloor(tx - 1, ty)) g.fillRect(x, y, 3, TILE);
      if (map.isFloor(tx + 1, ty)) g.fillRect(x + TILE - 3, y, 3, TILE);
    }

    _drawDecor(g, d, th) {
      g.save();
      g.translate(d.x + TILE / 2, d.y + TILE / 2);
      g.rotate(d.rot);
      switch (d.type) {
        case 'grate':
          g.rotate(-d.rot);
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-18, -18, 36, 36);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          for (let k = -14; k <= 14; k += 6) g.fillRect(k, -16, 2, 32);
          break;
        case 'stain':
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.beginPath(); g.ellipse(0, 0, 18 * d.s, 10 * d.s, 0, 0, U.TAU); g.fill();
          break;
        case 'vent':
          g.fillStyle = '#0d0f14'; g.fillRect(-12, -12, 24, 24);
          g.fillStyle = 'rgba(255,255,255,0.06)'; for (let k = -9; k <= 9; k += 4) g.fillRect(-10, k, 20, 1.5);
          break;
        case 'cable':
          g.strokeStyle = 'rgba(10,10,14,0.8)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(-24, 0); g.bezierCurveTo(-8, 14 * d.s, 8, -14 * d.s, 24, 0); g.stroke();
          break;
        case 'debris':
          g.fillStyle = 'rgba(90,92,104,0.4)';
          for (let k = 0; k < 4; k++) g.fillRect(k * 5 - 8, (k % 2) * 6 - 3, 3, 3);
          break;
        case 'marking':
          g.fillStyle = U.rgba(th.trim, 0.08);
          g.fillRect(-20, -3, 40, 6);
          break;
        default: break;
      }
      g.restore();
    }

    /* ------------------------------ Frame ------------------------------ */
    begin() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#050609';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    renderWorld(game, time) {
      const ctx = this.ctx, cam = game.camera;
      const rect = cam.visibleRect(90);
      ctx.save();
      cam.apply(ctx);
      if (this.staticLayer) {
        const sx = U.clamp(Math.floor(rect.x0), 0, this.staticLayer.width), sy = U.clamp(Math.floor(rect.y0), 0, this.staticLayer.height);
        const ex = U.clamp(Math.ceil(rect.x1), 0, this.staticLayer.width), ey = U.clamp(Math.ceil(rect.y1), 0, this.staticLayer.height);
        if (ex > sx && ey > sy) ctx.drawImage(this.staticLayer, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
      }
      game.hazards.render(ctx, time);
      game.particles.renderDecals(ctx, rect);
      this._drawExtraction(ctx, game, time);
      game.particles.render(ctx, rect, BO.PARTICLE_LAYER.FLOOR, false);
      game.pickups.render(ctx, time, rect);
      this._drawProps(ctx, game, rect, time);
      this._drawDoors(ctx, game, rect);
      const list = game.enemies;
      for (let i = 0; i < list.length; i++) if (list[i].dead && this._inRect(list[i], rect)) list[i].draw(ctx, time);
      for (let i = 0; i < list.length; i++) if (!list[i].dead && this._inRect(list[i], rect)) list[i].draw(ctx, time);
      if (game.player) game.player.draw(ctx, time);
      game.projectiles.render(ctx, rect);
      game.particles.render(ctx, rect, BO.PARTICLE_LAYER.AIR, false);
      ctx.restore();

      this._renderLighting(game, time, rect);

      ctx.save();
      cam.apply(ctx);
      this._drawColoredLights(ctx, game, rect, time);
      game.particles.render(ctx, rect, BO.PARTICLE_LAYER.FLOOR, true);
      game.particles.render(ctx, rect, BO.PARTICLE_LAYER.AIR, true);
      game.pickups.renderGlow(ctx, rect);
      this._drawPropOverlays(ctx, game, rect, time);
      for (let i = 0; i < list.length; i++) if (this._inRect(list[i], rect)) list[i].drawOverlay(ctx, time, game);
      game.hazards.renderOverlay(ctx, time);
      game.floatingText.render(ctx);
      ctx.restore();
    }

    _inRect(e, rect) { return e.x > rect.x0 && e.x < rect.x1 && e.y > rect.y0 && e.y < rect.y1; }

    _drawExtraction(ctx, game, time) {
      if (!game.extractionOpen) return;
      const ex = game.level.extraction, r = CFG.EXTRACTION_RADIUS;
      ctx.save();
      ctx.translate(ex.x, ex.y);
      ctx.fillStyle = 'rgba(61,220,132,0.08)';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, U.TAU); ctx.fill();
      ctx.rotate(time * 0.8);
      ctx.strokeStyle = 'rgba(61,220,132,0.7)';
      ctx.lineWidth = 3;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(0, 0, r - 6, k * Math.PI / 2, k * Math.PI / 2 + 0.9); ctx.stroke(); }
      ctx.restore();
    }

    _drawProps(ctx, game, rect, time) {
      const props = game.level.props;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (p.dead || p.x < rect.x0 || p.x > rect.x1 || p.y < rect.y0 || p.y > rect.y1) continue;
        const x = p.tx * TILE, y = p.ty * TILE;
        const flash = p.hitFlash > 0;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x + 5, y + 7, TILE - 4, TILE - 4);
        switch (p.kind) {
          case 'crate':
            ctx.fillStyle = flash ? '#c9a77a' : p.def.color;
            ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
            ctx.strokeStyle = '#3c2e1e'; ctx.lineWidth = 3;
            ctx.strokeRect(x + 5, y + 5, TILE - 10, TILE - 10);
            ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + TILE - 6, y + TILE - 6); ctx.stroke();
            ctx.fillStyle = 'rgba(255,138,26,0.35)'; ctx.fillRect(x + 9, y + TILE - 14, 14, 4);
            break;
          case 'barrier':
            ctx.fillStyle = flash ? '#888' : p.def.color;
            ctx.fillRect(x + 1, y + 8, TILE - 2, TILE - 16);
            ctx.fillStyle = '#5c616e'; ctx.fillRect(x + 1, y + 8, TILE - 2, 4);
            ctx.fillStyle = 'rgba(240,190,61,0.55)';
            for (let k = 4; k < TILE; k += 14) ctx.fillRect(x + k, y + TILE / 2 - 2, 7, 5);
            break;
          case 'barrel':
            ctx.fillStyle = flash ? '#ffb0a0' : p.def.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, TILE * 0.36, 0, U.TAU); ctx.fill();
            ctx.strokeStyle = '#7a2018'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(p.x, p.y, TILE * 0.24, 0, U.TAU); ctx.stroke();
            ctx.fillStyle = '#ffd34d';
            ctx.beginPath(); ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x + 6, p.y + 5); ctx.lineTo(p.x - 6, p.y + 5); ctx.closePath(); ctx.fill();
            break;
          case 'computer':
            ctx.fillStyle = flash ? '#667' : p.def.color;
            ctx.fillRect(x + 4, y + 6, TILE - 8, TILE - 14);
            ctx.fillStyle = (Math.floor(time * 2 + p.tx) % 5) ? 'rgba(25,195,221,0.7)' : 'rgba(25,195,221,0.3)';
            ctx.fillRect(x + 9, y + 10, TILE - 18, 12);
            break;
          case 'pillar':
          case 'locker':
            ctx.fillStyle = p.def.color;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, TILE, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 6, y + 8, TILE - 12, TILE - 14);
            if (p.kind === 'locker') { ctx.fillStyle = '#4a5160'; ctx.fillRect(x + TILE / 2 - 1, y + 8, 2, TILE - 14); }
            break;
          case 'cache':
            ctx.fillStyle = flash ? '#a6b78a' : p.def.color;
            ctx.fillRect(x + 2, y + 6, TILE - 4, TILE - 12);
            ctx.fillStyle = '#2a3320'; ctx.fillRect(x + 2, y + TILE / 2 - 2, TILE - 4, 4);
            ctx.fillStyle = '#ff8a1a'; ctx.fillRect(x + 8, y + 10, 8, 6);
            break;
          case 'core':
            ctx.fillStyle = flash ? '#ffd0d8' : p.def.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, TILE * 0.48, 0, U.TAU); ctx.fill();
            ctx.fillStyle = U.rgba('#ff2d55', 0.6 + Math.sin(time * 6) * 0.3);
            ctx.beginPath(); ctx.arc(p.x, p.y, TILE * 0.22, 0, U.TAU); ctx.fill();
            break;
          case 'terminal':
            ctx.fillStyle = p.def.color;
            ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
            ctx.fillStyle = p.activated ? '#19c3dd' : (Math.floor(time * 3) % 2 ? '#ff3355' : '#7a1a2a');
            ctx.fillRect(x + 10, y + 10, TILE - 20, TILE - 24);
            break;
          default: break;
        }
        if (p.destructible && p.hp < p.maxHp && p.kind !== 'barrel') {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 6, y - 6, TILE - 12, 3);
          ctx.fillStyle = p.def.objective ? '#ff8a1a' : '#c9ccd8'; ctx.fillRect(x + 6, y - 6, (TILE - 12) * p.hp / p.maxHp, 3);
        }
      }
    }

    _drawPropOverlays(ctx, game, rect, time) {
      const props = game.level.props;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (p.dead || p.x < rect.x0 || p.x > rect.x1 || p.y < rect.y0 || p.y > rect.y1) continue;
        if (p.kind === 'terminal' && (p.progress > 0 || p.activated)) {
          ctx.strokeStyle = '#19c3dd'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + U.TAU * (p.activated ? 1 : p.progress)); ctx.stroke();
        }
        if (p.charge >= 0) {
          const blink = Math.floor(time * (4 + (CFG.CHARGE_FUSE - p.charge) * 4)) % 2 === 0;
          ctx.fillStyle = blink ? '#ff3355' : '#5a1220';
          ctx.beginPath(); ctx.arc(p.x, p.y - 8, 5, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 28, -Math.PI / 2, -Math.PI / 2 + U.TAU * (p.charge / CFG.CHARGE_FUSE)); ctx.stroke();
        }
      }
    }

    _drawDoors(ctx, game, rect) {
      const map = game.map;
      const doors = game.level.doors;
      for (let i = 0; i < doors.length; i++) {
        const d = doors[i];
        if (d.x < rect.x0 || d.x > rect.x1 || d.y < rect.y0 || d.y > rect.y1) continue;
        const len = d.len * TILE;
        const slide = (len / 2) * d.open;
        ctx.save();
        ctx.translate(d.x, d.y);
        if (!d.horizontal) ctx.rotate(Math.PI / 2);
        const color = d.locked ? '#5a1a26' : '#3a404e';
        ctx.fillStyle = color;
        ctx.fillRect(-len / 2 - slide, -7, len / 2, 14);
        ctx.fillRect(slide, -7, len / 2, 14);
        ctx.fillStyle = d.locked ? '#ff2d55' : '#ff8a1a';
        if (d.open < 0.95) { ctx.fillRect(-slide - 3, -7, 2, 14); ctx.fillRect(slide + 1, -7, 2, 14); }
        ctx.restore();
      }
      void map;
    }

    /* ----------------------------- Lighting ----------------------------- */
    _castPolygon(map, ox, oy, a0, a1, rays, range, out, offset) {
      let n = offset;
      for (let i = 0; i <= rays; i++) {
        const a = a0 + (a1 - a0) * (i / rays);
        const h = C.raycast(map, ox, oy, ox + Math.cos(a) * range, oy + Math.sin(a) * range, BO.COLLIDE.SIGHT, this.hit);
        // Push the end point slightly into the wall so wall faces get lit.
        out[n++] = h.x + Math.cos(a) * (h.hit ? 10 : 0);
        out[n++] = h.y + Math.sin(a) * (h.hit ? 10 : 0);
      }
      return n;
    }

    _clipPoly(ctx, ox, oy, pts, from, to, closeFromOrigin) {
      ctx.beginPath();
      if (closeFromOrigin) ctx.moveTo(ox, oy);
      else ctx.moveTo(pts[from], pts[from + 1]);
      for (let i = from; i < to; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
    }

    _renderLighting(game, time, rect) {
      const l = this.lctx, cam = game.camera, map = game.map, p = game.player;
      const darkness = game.level.theme.darkness || CFG.DARKNESS;
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.globalCompositeOperation = 'source-over';
      l.fillStyle = 'rgba(2,3,9,' + darkness + ')';
      l.fillRect(0, 0, this.light.width, this.light.height);
      l.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0);
      cam.apply(l);
      l.globalCompositeOperation = 'destination-out';
      const S = this.lightSprite;
      if (p) {
        const ox = p.x, oy = p.y;
        // Flashlight cone.
        const fr = CFG.FLASHLIGHT_RANGE, half = CFG.FLASHLIGHT_FOV / 2;
        const n1 = this._castPolygon(map, ox, oy, p.angle - half, p.angle + half, CFG.FLASHLIGHT_RAYS, fr, this.visPoly, 0);
        l.save();
        this._clipPoly(l, ox, oy, this.visPoly, 0, n1, true);
        l.clip();
        l.globalAlpha = p.dead ? 0.4 : 1;
        l.drawImage(S, ox - fr * 1.1, oy - fr * 1.1, fr * 2.2, fr * 2.2);
        l.drawImage(S, ox - fr * 0.6, oy - fr * 0.6, fr * 1.2, fr * 1.2);
        l.restore();
        // Ambient circle of awareness.
        const ar = CFG.AMBIENT_LIGHT_RADIUS;
        const n2 = this._castPolygon(map, ox, oy, 0, U.TAU, CFG.AMBIENT_RAYS, ar, this.visPoly, 0);
        l.save();
        this._clipPoly(l, ox, oy, this.visPoly, 0, n2, false);
        l.clip();
        l.globalAlpha = 0.9;
        l.drawImage(S, ox - ar, oy - ar, ar * 2, ar * 2);
        l.restore();
      }
      l.globalAlpha = 1;
      const lamps = game.level.lamps;
      for (let i = 0; i < lamps.length; i++) {
        const lp = lamps[i];
        if (lp.x + lp.radius < rect.x0 || lp.x - lp.radius > rect.x1 || lp.y + lp.radius < rect.y0 || lp.y - lp.radius > rect.y1) continue;
        l.globalAlpha = this._lampIntensity(lp, time) * 0.85;
        l.drawImage(S, lp.x - lp.radius, lp.y - lp.radius, lp.radius * 2, lp.radius * 2);
      }
      const lights = game.lights;
      for (let i = 0; i < lights.length; i++) {
        const lt = lights[i];
        l.globalAlpha = U.clamp(lt.life / lt.max, 0, 1) * lt.intensity;
        l.drawImage(S, lt.x - lt.radius, lt.y - lt.radius, lt.radius * 2, lt.radius * 2);
      }
      if (game.extractionOpen) {
        const ex = game.level.extraction;
        l.globalAlpha = 0.6 + Math.sin(time * 3) * 0.15;
        l.drawImage(S, ex.x - 170, ex.y - 170, 340, 340);
      }
      l.globalAlpha = 1;
      l.globalCompositeOperation = 'source-over';
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.light, 0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }

    _lampIntensity(lp, time) {
      let k = lp.intensity;
      if (lp.pulse) k *= 0.55 + Math.sin(time * 2.4 + lp.phase) * 0.45;
      if (lp.door && lp.door.locked) k *= 1.2;
      if (lp.flicker) {
        const f = Math.sin(time * 13 + lp.phase) + Math.sin(time * 31 + lp.phase * 2);
        if (f > 1.4 * lp.flicker) k *= 0.15;
      }
      return U.clamp(k, 0, 1);
    }

    _drawColoredLights(ctx, game, rect, time) {
      ctx.globalCompositeOperation = 'lighter';
      const lamps = game.level.lamps;
      for (let i = 0; i < lamps.length; i++) {
        const lp = lamps[i];
        if (lp.x + lp.radius < rect.x0 || lp.x - lp.radius > rect.x1 || lp.y + lp.radius < rect.y0 || lp.y - lp.radius > rect.y1) continue;
        ctx.globalAlpha = this._lampIntensity(lp, time) * (lp.pulse ? 0.35 : 0.13);
        const r = lp.radius * 0.8;
        ctx.drawImage(BO.softSprite(lp.color), lp.x - r, lp.y - r, r * 2, r * 2);
      }
      const lights = game.lights;
      for (let i = 0; i < lights.length; i++) {
        const lt = lights[i];
        ctx.globalAlpha = U.clamp(lt.life / lt.max, 0, 1) * lt.intensity * 0.35;
        ctx.drawImage(BO.softSprite(lt.color), lt.x - lt.radius * 0.7, lt.y - lt.radius * 0.7, lt.radius * 1.4, lt.radius * 1.4);
      }
      const strips = game.level.strips;
      ctx.lineCap = 'round';
      for (let i = 0; i < strips.length; i++) {
        const s = strips[i];
        if (Math.max(s.x0, s.x1) < rect.x0 || Math.min(s.x0, s.x1) > rect.x1 || s.y0 < rect.y0 || s.y0 > rect.y1) continue;
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.12;
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  BO.Renderer = Renderer;
})(window.BO);
