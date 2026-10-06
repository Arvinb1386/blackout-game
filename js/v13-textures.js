/* =========================================================================
 * BLACKOUT :: v13-textures.js
 * Texture quality pass. Runs after every other static-layer pack (postfx,
 * v4-walls, v7-world, v8) and layers real material detail on top instead of
 * repainting, so all existing decor, decals, doors and strips survive.
 *
 *  - FLOORS: 14 seamless procedural materials (poured concrete, asphalt,
 *    diamond tread plate, bar grating, access-floor panels, perforated raised
 *    floor, ceramic tile, carpet tiles, wood planks, packed snow, ice,
 *    flagstone, Persian mosaic). Rooms and corridors get different materials
 *    per theme, blended with 'overlay' so the theme colours are preserved.
 *    A macro variation layer + per-room tint break up visible tiling, and inner
 *    corners get ambient occlusion.
 *  - WALLS: micro grain on caps, chipped edges and a soft rim light on every
 *    edge that faces a room, so walls read as solid, worn material.
 *  - PROPS: wood-grain crates with steel brackets, shaded cylindrical barrels
 *    with ribs, concrete barriers, brushed-metal lockers / pillars, screen
 *    scanlines on computers. Drawn per frame on top of the base prop art.
 *  - High quality image smoothing for the world + light buffers.
 *
 * Exposes BO.V13Tex.floorAt(level, x, y) for the surface-aware footsteps in
 * v13-audio.js. Load order: after v12-enhanced-bosses.js, before profiles.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U, CFG = BO.CONFIG;
  const R = BO.Renderer && BO.Renderer.prototype;
  if (!U || !CFG || !R || !BO.TILE_TYPE) return;
  const TILE = CFG.TILE, T = BO.TILE_TYPE, TAU = Math.PI * 2;
  const S = 256; // texture size (seamless)

  const settings = () => (BO.SaveSystem && BO.SaveSystem.data && BO.SaveSystem.data.settings) || {};
  const lowQuality = () => settings().particles === 'low';

  /* --------------------------- Theme -> material --------------------------- */
  // room: floor material inside rooms, corr: corridors, a: overlay strength.
  const FLOOR = {
    outpost:    { room: 'concrete',  corr: 'asphalt',  a: 0.62 },
    industrial: { room: 'plate',     corr: 'grate',    a: 0.6 },
    blacksite:  { room: 'panel',     corr: 'plate',    a: 0.55 },
    tower:      { room: 'carpet',    corr: 'tile',     a: 0.5 },
    lastlight:  { room: 'concrete',  corr: 'asphalt',  a: 0.66 },
    harbor:     { room: 'plate',     corr: 'planks',   a: 0.6 },
    metro:      { room: 'tile',      corr: 'concrete', a: 0.58 },
    datacore:   { room: 'raised',    corr: 'panel',    a: 0.55 },
    frost:      { room: 'snow',      corr: 'ice',      a: 0.55 },
    citadel:    { room: 'flagstone', corr: 'flagstone', a: 0.62 },
    bazaar:     { room: 'mosaic',    corr: 'flagstone', a: 0.58 },
    refinery:   { room: 'plate',     corr: 'grate',    a: 0.6 },
    reactor:    { room: 'raised',    corr: 'plate',    a: 0.55 },
    skyline:    { room: 'tile',      corr: 'carpet',   a: 0.5 }
  };
  const DEFAULT_FLOOR = { room: 'concrete', corr: 'plate', a: 0.6 };
  function floorStyle(level) {
    const key = (level && level.def && level.def.theme) || 'outpost';
    return FLOOR[key] || DEFAULT_FLOOR;
  }

  /* ------------------------------ Helpers ------------------------------ */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const grey = (v, a) => 'rgba(' + v + ',' + v + ',' + v + ',' + (a === undefined ? 1 : a) + ')';
  const light = a => 'rgba(255,255,255,' + a + ')';
  const darkc = a => 'rgba(0,0,0,' + a + ')';

  /** Calls fn at (x,y) plus the wrapped copies that overlap the tile, for seamless textures. */
  function wrap(x, y, r, fn) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const px = x + ox * S, py = y + oy * S;
      if (px + r < 0 || px - r > S || py + r < 0 || py - r > S) continue;
      fn(px, py);
    }
  }
  function speckle(g, rng, n, a, size) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = rng() < 0.5 ? light(a * rng()) : darkc(a * 1.3 * rng());
      const s = size || 1;
      g.fillRect(Math.floor(rng() * S), Math.floor(rng() * S), s, s);
    }
  }
  function blobs(g, rng, n, rMin, rMax, a) {
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, r = rMin + rng() * (rMax - rMin), lit = rng() < 0.45, k = a * (0.4 + rng() * 0.6);
      wrap(x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, lit ? light(k) : darkc(k * 1.3));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
  }
  function crackLine(g, rng, x, y, len, a) {
    let px = x, py = y, ang = rng() * TAU;
    const pts = [[px, py]];
    const n = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) { ang += (rng() - 0.5) * 1.2; px += Math.cos(ang) * len / n; py += Math.sin(ang) * len / n; pts.push([px, py]); }
    [[0, darkc(a)], [0.8, light(a * 0.25)]].forEach(([o, col]) => {
      wrap(x, y, len + 4, (wx, wy) => {
        const dx = wx - x + o, dy = wy - y + o;
        g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1] + dy);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + dx, pts[i][1] + dy);
        g.strokeStyle = col; g.lineWidth = 1; g.stroke();
      });
    });
  }
  function scratches(g, rng, n, a) {
    g.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, ang = rng() * TAU, len = 6 + rng() * 26;
      wrap(x, y, len, (px, py) => {
        g.strokeStyle = rng() < 0.6 ? light(a) : darkc(a);
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); g.stroke();
      });
    }
  }
  /** Raised square inset: light top/left edge, dark bottom/right edge. */
  function bevel(g, x, y, w, h, hi, lo, inset) {
    const i = inset || 0;
    g.fillStyle = light(hi); g.fillRect(x + i, y + i, w - i * 2, 1); g.fillRect(x + i, y + i, 1, h - i * 2);
    g.fillStyle = darkc(lo); g.fillRect(x + i, y + h - i - 1, w - i * 2, 1); g.fillRect(x + w - i - 1, y + i, 1, h - i * 2);
  }
  function bolt(g, x, y, r) {
    g.fillStyle = darkc(0.55); g.beginPath(); g.arc(x + 0.6, y + 0.6, r, 0, TAU); g.fill();
    g.fillStyle = grey(175); g.beginPath(); g.arc(x, y, r * 0.8, 0, TAU); g.fill();
    g.fillStyle = light(0.5); g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); g.fill();
  }

  /* ------------------------- Material generators ------------------------- */
  // Every generator paints on a 50% grey base: under 'overlay' blending grey is
  // neutral, so only the detail shows and the theme's colours stay intact.
  const GEN = {
    concrete(g, rng) {
      blobs(g, rng, 40, 10, 46, 0.09);
      speckle(g, rng, 9000, 0.32);
      for (let i = 0; i < 260; i++) { // aggregate pebbles + air pores
        const x = rng() * S, y = rng() * S, r = 0.6 + rng() * 1.6;
        g.fillStyle = rng() < 0.55 ? darkc(0.35) : light(0.18);
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.strokeStyle = light(0.05); g.lineWidth = 2; // trowel swirls
      for (let i = 0; i < 6; i++) { const x = rng() * S, y = rng() * S, r = 20 + rng() * 40; g.beginPath(); g.arc(x, y, r, rng() * TAU, rng() * TAU + 1.4); g.stroke(); }
      // Saw-cut expansion joints every 128px.
      for (let k = 0; k < S; k += 128) {
        g.fillStyle = darkc(0.55); g.fillRect(k, 0, 2, S); g.fillRect(0, k, S, 2);
        g.fillStyle = light(0.12); g.fillRect(k + 2, 0, 1, S); g.fillRect(0, k + 2, S, 1);
      }
      for (let i = 0; i < 4; i++) crackLine(g, rng, rng() * S, rng() * S, 18 + rng() * 34, 0.45);
    },
    asphalt(g, rng) {
      blobs(g, rng, 30, 14, 60, 0.1);
      speckle(g, rng, 16000, 0.4);
      speckle(g, rng, 900, 0.45, 2);
      for (let i = 0; i < 6; i++) { // tar patches
        const x = rng() * S, y = rng() * S, w = 20 + rng() * 50, h = 10 + rng() * 30;
        wrap(x, y, Math.max(w, h), (px, py) => { g.fillStyle = darkc(0.12); g.fillRect(px, py, w, h); });
      }
      for (let i = 0; i < 6; i++) crackLine(g, rng, rng() * S, rng() * S, 30 + rng() * 50, 0.5);
    },
    plate(g, rng) {
      blobs(g, rng, 24, 12, 50, 0.07);
      // Diamond tread: alternating diagonal bumps on a 16px staggered grid.
      for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) {
        const ox = ((y / 16) % 2) * 8, cx = x + ox + 4, cy = y + 4, dir = ((x / 16 + y / 16) % 2) ? 1 : -1;
        g.save(); g.translate(cx, cy); g.rotate(dir * Math.PI / 4);
        g.fillStyle = light(0.28); g.fillRect(-5, -1.6, 10, 1.2);
        g.fillStyle = darkc(0.4); g.fillRect(-5, 0.4, 10, 1.4);
        g.restore();
      }
      scratches(g, rng, 120, 0.1);
      speckle(g, rng, 2500, 0.15);
      // Plate seams + bolts.
      for (let k = 0; k < S; k += 128) {
        g.fillStyle = darkc(0.6); g.fillRect(k, 0, 2, S); g.fillRect(0, k, S, 2);
        g.fillStyle = light(0.14); g.fillRect(k + 2, 0, 1, S); g.fillRect(0, k + 2, S, 1);
        for (let j = 0; j < S; j += 128) { bolt(g, k + 7, j + 7, 2.2); bolt(g, k + 121, j + 7, 2.2); bolt(g, k + 7, j + 121, 2.2); bolt(g, k + 121, j + 121, 2.2); }
      }
    },
    grate(g, rng) {
      g.fillStyle = grey(52); g.fillRect(0, 0, S, S); // deep shadow under the grate
      for (let x = 0; x < S; x += 8) { // bearing bars
        g.fillStyle = grey(150); g.fillRect(x, 0, 3, S);
        g.fillStyle = light(0.25); g.fillRect(x, 0, 1, S);
        g.fillStyle = darkc(0.35); g.fillRect(x + 3, 0, 1, S);
      }
      for (let y = 0; y < S; y += 32) { // cross bars
        g.fillStyle = grey(160); g.fillRect(0, y, S, 3);
        g.fillStyle = light(0.25); g.fillRect(0, y, S, 1);
        g.fillStyle = darkc(0.4); g.fillRect(0, y + 3, S, 1);
      }
      for (let k = 0; k < S; k += 128) { g.fillStyle = darkc(0.6); g.fillRect(k, 0, 2, S); g.fillRect(0, k, S, 2); }
      blobs(g, rng, 18, 10, 40, 0.1);
      speckle(g, rng, 2000, 0.2);
    },
    panel(g, rng) {
      blobs(g, rng, 20, 14, 50, 0.06);
      for (let y = 0; y < S; y++) { if (rng() < 0.5) { g.fillStyle = rng() < 0.5 ? light(0.03) : darkc(0.04); g.fillRect(0, y, S, 1); } } // brushed
      for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 64) {
        g.fillStyle = darkc(0.55); g.fillRect(x, y, 64, 1.5); g.fillRect(x, y, 1.5, 64);
        bevel(g, x + 1.5, y + 1.5, 62.5, 62.5, 0.16, 0.3, 0);
        g.fillStyle = (rng() - 0.5) > 0 ? light(0.03) : darkc(0.04); g.fillRect(x + 3, y + 3, 58, 58);
        bolt(g, x + 6, y + 6, 1.6); bolt(g, x + 58, y + 6, 1.6); bolt(g, x + 6, y + 58, 1.6); bolt(g, x + 58, y + 58, 1.6);
      }
      scratches(g, rng, 60, 0.08);
      speckle(g, rng, 1500, 0.12);
    },
    raised(g, rng) {
      blobs(g, rng, 16, 14, 50, 0.05);
      for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 64) {
        g.fillStyle = darkc(0.6); g.fillRect(x, y, 64, 2); g.fillRect(x, y, 2, 64);
        bevel(g, x + 2, y + 2, 62, 62, 0.18, 0.35, 0);
        if (rng() < 0.4) { // perforated airflow tile
          for (let py = y + 9; py < y + 58; py += 6) for (let px = x + 9; px < x + 58; px += 6) {
            g.fillStyle = darkc(0.55); g.fillRect(px, py, 2.4, 2.4);
            g.fillStyle = light(0.1); g.fillRect(px + 2.4, py + 2.4, 0.8, 0.8);
          }
        } else {
          g.fillStyle = light(0.025); g.fillRect(x + 4, y + 4, 56, 56);
          g.fillStyle = darkc(0.35); g.fillRect(x + 28, y + 30, 8, 3); // lift handle slot
        }
      }
      speckle(g, rng, 1200, 0.12);
    },
    tile(g, rng) {
      const sz = 32;
      for (let y = 0; y < S; y += sz) for (let x = 0; x < S; x += sz) {
        const v = 128 + Math.round((rng() - 0.5) * 22);
        g.fillStyle = grey(v); g.fillRect(x, y, sz, sz);
        const gl = g.createLinearGradient(x, y, x + sz, y + sz);
        gl.addColorStop(0, light(0.12)); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, darkc(0.08));
        g.fillStyle = gl; g.fillRect(x, y, sz, sz);
        g.fillStyle = grey(70); g.fillRect(x, y, sz, 2); g.fillRect(x, y, 2, sz); // grout
        g.fillStyle = light(0.2); g.fillRect(x + 2, y + 2, sz - 4, 1);
        if (rng() < 0.06) crackLine(g, rng, x + 8 + rng() * 16, y + 8 + rng() * 16, 10 + rng() * 10, 0.5);
      }
      blobs(g, rng, 26, 10, 40, 0.07);
      speckle(g, rng, 1800, 0.12);
    },
    carpet(g, rng) {
      for (let i = 0; i < 22000; i++) { // fibres
        const x = rng() * S, y = rng() * S, a = rng() * TAU;
        g.strokeStyle = rng() < 0.5 ? light(0.07) : darkc(0.09); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2); g.stroke();
      }
      for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 64) { // carpet tiles with alternating pile direction
        if (((x + y) / 64) % 2) { g.fillStyle = light(0.035); g.fillRect(x, y, 64, 64); }
        g.fillStyle = darkc(0.3); g.fillRect(x, y, 64, 1); g.fillRect(x, y, 1, 64);
      }
      blobs(g, rng, 18, 10, 30, 0.06);
    },
    planks(g, rng) {
      const bh = 32;
      for (let y = 0; y < S; y += bh) {
        let x = Math.floor(rng() * 64) - 64;
        while (x < S) {
          const len = 96 + Math.floor(rng() * 96);
          const v = 128 + Math.round((rng() - 0.5) * 30);
          const draw = (ox) => {
            g.fillStyle = grey(v); g.fillRect(x + ox, y, len, bh);
            g.strokeStyle = darkc(0.16); g.lineWidth = 1; // grain
            for (let k = 3; k < bh - 2; k += 3 + rng() * 3) {
              g.beginPath();
              for (let s = 0; s <= len; s += 8) g.lineTo(x + ox + s, y + k + Math.sin((s + v) * 0.05) * 1.2);
              g.stroke();
            }
            if (rng() < 0.4) { g.fillStyle = darkc(0.3); g.beginPath(); g.ellipse(x + ox + len * rng(), y + bh / 2, 4, 2.2, 0, 0, TAU); g.fill(); } // knot
            g.fillStyle = darkc(0.6); g.fillRect(x + ox + len - 1, y, 2, bh); // butt joint
            g.fillStyle = grey(60); g.fillRect(x + ox + 4, y + 5, 2, 2); g.fillRect(x + ox + 4, y + bh - 7, 2, 2); // nails
          };
          draw(0); if (x < 0) draw(S); if (x + len > S) draw(-S);
          x += len;
        }
        g.fillStyle = darkc(0.6); g.fillRect(0, y, S, 2);
        g.fillStyle = light(0.12); g.fillRect(0, y + 2, S, 1);
      }
      blobs(g, rng, 20, 12, 40, 0.08);
      scratches(g, rng, 40, 0.08);
    },
    snow(g, rng) {
      blobs(g, rng, 60, 8, 40, 0.12);
      g.strokeStyle = light(0.08); g.lineWidth = 2; // wind ripples
      for (let i = 0; i < 18; i++) {
        const y = rng() * S, x = rng() * S, len = 30 + rng() * 60;
        wrap(x, y, len, (px, py) => { g.beginPath(); for (let s = 0; s <= len; s += 6) g.lineTo(px + s, py + Math.sin(s * 0.12) * 3); g.stroke(); });
      }
      for (let i = 0; i < 600; i++) { g.fillStyle = light(0.25 + rng() * 0.4); g.fillRect(rng() * S, rng() * S, 1, 1); } // sparkle
      speckle(g, rng, 2500, 0.08);
    },
    ice(g, rng) {
      blobs(g, rng, 30, 20, 70, 0.08);
      for (let i = 0; i < 10; i++) { // white fracture lines
        let x = rng() * S, y = rng() * S, a = rng() * TAU;
        g.strokeStyle = light(0.22); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { a += (rng() - 0.5) * 1.4; x += Math.cos(a) * 12; y += Math.sin(a) * 12; g.lineTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 90; i++) { g.strokeStyle = light(0.18); g.beginPath(); g.arc(rng() * S, rng() * S, 0.8 + rng() * 2, 0, TAU); g.stroke(); } // bubbles
    },
    flagstone(g, rng) {
      g.fillStyle = grey(62); g.fillRect(0, 0, S, S); // mortar
      const rows = 6, rh = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = Math.floor(rng() * 30);
        const y = r * rh;
        const start = x;
        while (x < start + S) {
          const w = 30 + Math.floor(rng() * 40), v = 128 + Math.round((rng() - 0.5) * 34);
          const right = Math.min(w, start + S - x);
          const draw = (ox) => {
            const sx = (x + ox), pad = 2;
            g.fillStyle = grey(v);
            g.beginPath();
            if (g.roundRect) g.roundRect(sx + pad, y + pad, right - pad * 2, rh - pad * 2, 5); else g.rect(sx + pad, y + pad, right - pad * 2, rh - pad * 2);
            g.fill();
            g.fillStyle = light(0.14); g.fillRect(sx + pad + 2, y + pad, right - pad * 2 - 4, 1.5);
            g.fillStyle = darkc(0.3); g.fillRect(sx + pad + 2, y + rh - pad - 1.5, right - pad * 2 - 4, 1.5);
          };
          draw(0); if (x + right > S) draw(-S);
          x += right;
        }
      }
      blobs(g, rng, 40, 8, 30, 0.1);
      speckle(g, rng, 6000, 0.22);
      for (let i = 0; i < 5; i++) crackLine(g, rng, rng() * S, rng() * S, 14 + rng() * 20, 0.45);
    },
    mosaic(g, rng) {
      const sz = 32;
      for (let y = 0; y < S; y += sz) for (let x = 0; x < S; x += sz) {
        g.fillStyle = grey(124 + Math.round((rng() - 0.5) * 12)); g.fillRect(x, y, sz, sz);
        g.fillStyle = grey(70); g.fillRect(x, y, sz, 1.5); g.fillRect(x, y, 1.5, sz);
        // Eight-point star (khatam) in a lighter glaze.
        const cx = x + sz / 2, cy = y + sz / 2;
        g.save(); g.translate(cx, cy);
        g.fillStyle = light(0.16);
        for (let k = 0; k < 2; k++) { g.rotate(Math.PI / 4); g.fillRect(-8, -8, 16, 16); }
        g.restore();
        g.save(); g.translate(cx, cy);
        g.fillStyle = darkc(0.16); g.beginPath(); g.arc(0, 0, 3.2, 0, TAU); g.fill();
        g.restore();
        // Cross-shaped joints between stars.
        g.fillStyle = darkc(0.1); g.fillRect(x, y, 4, 4);
      }
      blobs(g, rng, 30, 10, 40, 0.07);
      speckle(g, rng, 2400, 0.12);
    }
  };

  const CACHE = Object.create(null);
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  /** Seamless 256px grey-centred detail texture for a material (cached). */
  function texture(mat) {
    const key = GEN[mat] ? mat : 'concrete';
    if (CACHE[key]) return CACHE[key];
    const c = canvas(S, S), g = c.getContext('2d');
    g.fillStyle = grey(128); g.fillRect(0, 0, S, S);
    const rng = U.makeRng(hashStr('v13:' + key));
    try { GEN[key](g, rng); } catch (err) { U.reportError && U.reportError('v13tex.' + key, err); }
    CACHE[key] = c;
    return c;
  }

  /** Large soft brightness variation (512px) that hides the 256px repeat. */
  let MACRO = null;
  function macro() {
    if (MACRO) return MACRO;
    const prev = S;
    const c = canvas(512, 512), g = c.getContext('2d');
    g.fillStyle = grey(128); g.fillRect(0, 0, 512, 512);
    const rng = U.makeRng(9137);
    for (let i = 0; i < 70; i++) {
      const x = rng() * 512, y = rng() * 512, r = 40 + rng() * 120, lit = rng() < 0.5, a = 0.06 + rng() * 0.08;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const px = x + ox * 512, py = y + oy * 512;
        if (px + r < 0 || px - r > 512 || py + r < 0 || py - r > 512) continue;
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, lit ? light(a) : darkc(a)); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
      }
    }
    void prev;
    MACRO = c;
    return c;
  }

  /* ------------------------------ Floor pass ------------------------------ */
  /** Adds one clip rect per horizontal run of matching floor tiles. */
  function clipRuns(g, map, test) {
    g.beginPath();
    let any = false;
    for (let ty = 0; ty < map.h; ty++) {
      let run = -1;
      for (let tx = 0; tx <= map.w; tx++) {
        const ok = tx < map.w && test(map.idx(tx, ty));
        if (ok && run < 0) run = tx;
        if (!ok && run >= 0) { g.rect(run * TILE, ty * TILE, (tx - run) * TILE, TILE); run = -1; any = true; }
      }
    }
    return any;
  }

  function floorPass(c, level) {
    const g = c.getContext('2d');
    const map = level.map;
    if (!g || !map || c.width < map.pixelW || c.height < map.pixelH) return; // fallback canvas: leave it alone
    const fs = floorStyle(level);
    const rng = U.makeRng(((level.seed || 1) * 13 + 4711) >>> 0);
    const W = map.pixelW, H = map.pixelH;
    const layers = [
      { test: i => map.tiles[i] === T.FLOOR && map.roomId[i] >= 0, mat: fs.room, a: fs.a },
      { test: i => map.tiles[i] === T.FLOOR && map.roomId[i] < 0, mat: fs.corr, a: fs.a * 0.95 }
    ];
    layers.forEach(L => {
      g.save();
      if (!clipRuns(g, map, L.test)) { g.restore(); return; }
      g.clip();
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = L.a;
      g.fillStyle = g.createPattern(texture(L.mat), 'repeat');
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = 0.5;
      g.fillStyle = g.createPattern(macro(), 'repeat');
      g.fillRect(0, 0, W, H);
      g.restore();
    });
    // Per-room tint so neighbouring rooms don't look copy-pasted.
    (level.rooms || []).forEach(r => {
      const v = (rng() - 0.5) * 0.09;
      g.fillStyle = v > 0 ? light(v) : darkc(-v * 1.4);
      g.save();
      if (!clipRuns(g, map, i => map.roomId[i] === r.index && map.tiles[i] === T.FLOOR)) { g.restore(); return; }
      g.clip();
      g.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
      g.restore();
    });
    // Ambient occlusion in inner corners (two walls meeting over a floor tile).
    const solid = (x, y) => !map.inBounds(x, y) || map.tiles[map.idx(x, y)] === T.SOLID;
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (map.tiles[map.idx(tx, ty)] !== T.FLOOR) continue;
      const n = solid(tx, ty - 1), s = solid(tx, ty + 1), w = solid(tx - 1, ty), e = solid(tx + 1, ty);
      const corners = [];
      if (n && w) corners.push([0, 0]); if (n && e) corners.push([TILE, 0]);
      if (s && w) corners.push([0, TILE]); if (s && e) corners.push([TILE, TILE]);
      corners.forEach(([cx, cy]) => {
        const x = tx * TILE + cx, y = ty * TILE + cy, r = TILE * 0.75;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, darkc(0.42)); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      });
    }
  }

  /* ------------------------------ Wall pass ------------------------------ */
  function wallPass(c, level) {
    const g = c.getContext('2d');
    const map = level.map, th = level.theme || {};
    if (!g || !map || c.width < map.pixelW || c.height < map.pixelH) return;
    const rng = U.makeRng(((level.seed || 1) * 7 + 1301) >>> 0);
    const fl = (x, y) => map.inBounds(x, y) && map.isFloor(x, y);
    const isWall = (x, y) => map.inBounds(x, y) && map.tiles[map.idx(x, y)] === T.SOLID;
    const visible = (tx, ty) => { for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (fl(x, y)) return true; return false; };
    // 1. Micro grain on every visible wall (clipped, overlay).
    g.save();
    g.beginPath();
    let any = false;
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) if (isWall(tx, ty) && visible(tx, ty)) { g.rect(tx * TILE, ty * TILE, TILE, TILE); any = true; }
    if (any) {
      g.clip();
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.38;
      g.fillStyle = g.createPattern(texture('concrete'), 'repeat');
      g.fillRect(0, 0, map.pixelW, map.pixelH);
    }
    g.restore();
    // 2. Chipped edges + rim light on room-facing edges.
    const rim = th.trim ? U.rgba(th.trim, 0.1) : light(0.06);
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (!isWall(tx, ty)) continue;
      const x = tx * TILE, y = ty * TILE;
      const edges = [];
      if (fl(tx, ty - 1)) edges.push('n'); if (fl(tx, ty + 1)) edges.push('s');
      if (fl(tx - 1, ty)) edges.push('w'); if (fl(tx + 1, ty)) edges.push('e');
      edges.forEach(side => {
        const horiz = side === 'n' || side === 's';
        // Rim light (a sliver of bounce light on the edge).
        g.fillStyle = rim;
        if (side === 'n') g.fillRect(x, y + 3, TILE, 1);
        if (side === 'w') g.fillRect(x + 3, y, 1, TILE);
        if (side === 'e') g.fillRect(x + TILE - 4, y, 1, TILE);
        // Chips: little bites out of the edge with a lit lower lip.
        const n = Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const along = 4 + rng() * (TILE - 8), size = 1.5 + rng() * 2.5;
          let cx, cy;
          if (side === 'n') { cx = x + along; cy = y + 1; }
          else if (side === 's') { cx = x + along; cy = y + TILE - 2; }
          else if (side === 'w') { cx = x + 1; cy = y + along; }
          else { cx = x + TILE - 2; cy = y + along; }
          g.fillStyle = darkc(0.55);
          g.beginPath(); g.ellipse(cx, cy, horiz ? size * 1.6 : size, horiz ? size : size * 1.6, 0, 0, TAU); g.fill();
          g.fillStyle = light(0.12);
          g.fillRect(cx - size * 0.5, cy + (side === 's' ? -size : size * 0.6), size, 0.8);
        }
      });
    }
  }

  /* ------------------------------ Hook in ------------------------------ */
  const origBuild = R.buildStaticLayer;
  R.buildStaticLayer = function (level) {
    const c = origBuild.apply(this, arguments);
    if (!c || !level || !level.map) return c;
    try { floorPass(c, level); } catch (err) { console.warn('[v13-textures] floor pass skipped:', err); }
    try { wallPass(c, level); } catch (err) { console.warn('[v13-textures] wall pass skipped:', err); }
    return c;
  };

  // Crisper scaling of the static layer and light buffer at any zoom / DPR.
  const origBegin = R.begin;
  R.begin = function () {
    const r = origBegin.apply(this, arguments);
    const ctx = this.ctx;
    if (ctx) { ctx.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high'; }
    return r;
  };

  /* ---------------------------- Prop detail ---------------------------- */
  const PROP_MAT = { crate: 'planks', cache: 'carpet', barrier: 'concrete', computer: 'panel', pillar: 'panel', locker: 'panel', terminal: 'panel', core: 'plate' };
  let PATS = null, patKey = '';
  function pats(ctx, r) {
    const key = r.canvas.width + 'x' + r.canvas.height;
    if (!PATS || patKey !== key || PATS.ctx !== ctx) {
      PATS = { ctx };
      Object.keys(PROP_MAT).forEach(k => { PATS[PROP_MAT[k]] = PATS[PROP_MAT[k]] || ctx.createPattern(texture(PROP_MAT[k]), 'repeat'); });
      patKey = key;
    }
    return PATS;
  }

  function propDetail(r, ctx, game, rect) {
    const props = game.level && game.level.props;
    if (!props) return;
    const P = pats(ctx, r);
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (p.dead || p.hitFlash > 0 || p.x < rect.x0 || p.x > rect.x1 || p.y < rect.y0 || p.y > rect.y1) continue;
      const x = p.tx * TILE, y = p.ty * TILE;
      const pat = P[PROP_MAT[p.kind]];
      ctx.save();
      switch (p.kind) {
        case 'crate': {
          ctx.beginPath(); ctx.rect(x + 3, y + 3, TILE - 6, TILE - 6); ctx.clip();
          ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.6; ctx.fillStyle = pat; ctx.fillRect(x, y, TILE, TILE);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          ctx.fillStyle = '#5d6370'; // steel corner brackets
          [[x + 3, y + 3], [x + TILE - 9, y + 3], [x + 3, y + TILE - 9], [x + TILE - 9, y + TILE - 9]].forEach(([bx, by]) => { ctx.fillRect(bx, by, 6, 6); });
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          [[x + 4.5, y + 4.5], [x + TILE - 7.5, y + 4.5], [x + 4.5, y + TILE - 7.5], [x + TILE - 7.5, y + TILE - 7.5]].forEach(([bx, by]) => { ctx.fillRect(bx, by, 1.5, 1.5); });
          ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x + 3, y + 3, TILE - 6, 1.5);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 3, y + TILE - 4.5, TILE - 6, 1.5);
          break;
        }
        case 'cache':
          ctx.beginPath(); ctx.rect(x + 2, y + 6, TILE - 4, TILE - 12); ctx.clip();
          ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.5; ctx.fillStyle = pat; ctx.fillRect(x, y, TILE, TILE);
          break;
        case 'barrier': {
          ctx.beginPath(); ctx.rect(x + 1, y + 8, TILE - 2, TILE - 16); ctx.clip();
          ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.55; ctx.fillStyle = pat; ctx.fillRect(x, y, TILE, TILE);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          const gr = ctx.createLinearGradient(0, y + 8, 0, y + TILE - 8);
          gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
          ctx.fillStyle = gr; ctx.fillRect(x + 1, y + 8, TILE - 2, TILE - 16);
          break;
        }
        case 'barrel': {
          const rr = TILE * 0.36;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.clip();
          const gr = ctx.createRadialGradient(p.x - rr * 0.35, p.y - rr * 0.4, rr * 0.1, p.x, p.y, rr);
          gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
          ctx.fillStyle = gr; ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr * 0.82, 0, TAU); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath(); ctx.arc(p.x, p.y, rr * 0.86, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
          ctx.fillStyle = 'rgba(30,30,34,0.85)'; ctx.beginPath(); ctx.arc(p.x + rr * 0.45, p.y - rr * 0.1, 2.2, 0, TAU); ctx.fill(); // bung cap
          break;
        }
        case 'computer':
          ctx.beginPath(); ctx.rect(x + 4, y + 6, TILE - 8, TILE - 14); ctx.clip();
          ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.45; ctx.fillStyle = pat; ctx.fillRect(x, y, TILE, TILE);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          for (let k = y + 10; k < y + 22; k += 2) ctx.fillRect(x + 9, k, TILE - 18, 1); // scanlines
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 9, y + 10, (TILE - 18) * 0.4, 3); // glass glare
          break;
        case 'pillar':
        case 'locker':
          ctx.beginPath(); ctx.rect(x, y, TILE, TILE); ctx.clip();
          ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.45; ctx.fillStyle = pat; ctx.fillRect(x, y, TILE, TILE);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          if (p.kind === 'locker') {
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            for (let k = 0; k < 4; k++) { ctx.fillRect(x + 8, y + 11 + k * 3, 9, 1.2); ctx.fillRect(x + TILE - 17, y + 11 + k * 3, 9, 1.2); }
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x, y, 3, TILE);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + TILE - 3, y, 3, TILE);
          }
          break;
        case 'terminal':
          ctx.beginPath(); ctx.rect(x + 4, y + 4, TILE - 8, TILE - 8); ctx.clip();
          ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.4; ctx.fillStyle = pat; ctx.fillRect(x, y, TILE, TILE);
          break;
        default: break;
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const origProps = R._drawProps;
  if (origProps) {
    R._drawProps = function (ctx, game, rect) {
      const res = origProps.apply(this, arguments);
      if (!lowQuality()) U.safe('v13.props', () => propDetail(this, ctx, game, rect));
      return res;
    };
  }

  /* ------------------------------ Public ------------------------------ */
  /** Floor material under a world position (used for surface-aware footsteps). */
  function floorAt(level, x, y) {
    if (!level || !level.map) return 'concrete';
    const m = level.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const fs = floorStyle(level);
    if (!m.inBounds(tx, ty)) return fs.corr;
    if (m.tiles[m.idx(tx, ty)] === T.DOOR) return 'plate';
    return m.roomId[m.idx(tx, ty)] >= 0 ? fs.room : fs.corr;
  }

  BO.V13Tex = { FLOOR, GEN, texture, floorAt, floorStyle, floorPass, wallPass, propDetail };
})(window.BO);
