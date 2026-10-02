/* =========================================================================
 * BLACKOUT :: v4-walls.js
 * Wall quality overhaul. After the static map (and postfx detail) is built,
 * every wall that borders a walkable tile is repainted with:
 *  - a per-theme material: poured concrete, brick, riveted steel, glass
 *    curtain wall, corrugated sheet, subway tile, circuit panels, frosted
 *    concrete, cut stone (seamless, world-aligned procedural textures)
 *  - fake height: a lit cap on top and a shaded front face on south-facing
 *    walls with a bright lip, contact shadow and skirting
 *  - bevels, crisp outlines and corner depth
 *  - theme wear: cracks, bullet scars, water/rust streaks, soot, moss,
 *    snow + icicles, Persian tilework bands, spray-painted Persian
 *    graffiti, pipes with flanges, cables, signage, hazard stripes by doors,
 *    emissive strips and wall lights (which also glow in the dark)
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TAU = U.TAU;
  const TILE = BO.CONFIG.TILE;
  const T = BO.TILE_TYPE;
  const R = BO.Renderer && BO.Renderer.prototype;
  if (!R) return;

  const FACE = 15;
  const TEX = 192;

  const STYLE = {
    outpost:    { mat: 'concrete', moss: 0.3, stains: 0.4, cracks: 0.3, scars: 0.25, graffiti: 0.05 },
    industrial: { mat: 'brick', tint: '#7a3a26', soot: 0.9, pipes: true, stains: 0.35, scars: 0.2 },
    blacksite:  { mat: 'metal', lights: 0.12, signs: 0.06, hazard: true, stains: 0.12 },
    tower:      { mat: 'glass', lights: 0.1, strip: true, stains: 0.1 },
    lastlight:  { mat: 'concrete', soot: 0.8, cracks: 0.45, scars: 0.35, lights: 0.05, stains: 0.4 },
    harbor:     { mat: 'corrugated', rust: 1, pipes: true, stains: 0.5 },
    metro:      { mat: 'tile', graffiti: 0.08, cables: true, stains: 0.55, cracks: 0.2, scars: 0.15 },
    datacore:   { mat: 'circuit', lights: 0.18, strip: true, signs: 0.05 },
    frost:      { mat: 'ice', snow: true, icicles: 0.5, cracks: 0.3 },
    citadel:    { mat: 'stone', soot: 0.6, lights: 0.05, cracks: 0.3, scars: 0.3 },
    bazaar:     { mat: 'brick', tint: '#9a6a3c', tilework: true, graffiti: 0.04, stains: 0.3, cracks: 0.2 },
    refinery:   { mat: 'metal', rust: 0.6, pipes: true, hazard: true, lights: 0.05, stains: 0.3 },
    reactor:    { mat: 'circuit', lights: 0.16, strip: true, hazard: true, stains: 0.15 },
    skyline:    { mat: 'glass', lights: 0.14, strip: true, signs: 0.04 }
  };
  const GRAFFITI = ['خاموشی', 'مقاومت', 'بیدار شو', 'ما هستیم', 'نور برمی‌گردد', 'BLACKOUT', 'تسلیم نشو'];

  /* ------------------------------ Colour ------------------------------ */
  function hex2(n) { const s = Math.round(U.clamp(n, 0, 255)).toString(16); return s.length < 2 ? '0' + s : s; }
  function mix(a, b, t) {
    const A = U.hexToRgb(a), B = U.hexToRgb(b);
    return '#' + hex2(A.r + (B.r - A.r) * t) + hex2(A.g + (B.g - A.g) * t) + hex2(A.b + (B.b - A.b) * t);
  }
  function shade(h, k) { return k >= 0 ? mix(h, '#ffffff', k) : mix(h, '#000000', -k); }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ----------------------------- Textures ----------------------------- */
  const CACHE = Object.create(null);

  /** Draws fn at (x,y) plus wrapped copies so the texture tiles seamlessly. */
  function wrapped(W, H, x, y, r, fn) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const px = x + ox * W, py = y + oy * H;
      if (px + r < 0 || px - r > W || py + r < 0 || py - r > H) continue;
      fn(px, py);
    }
  }

  function blotches(g, W, H, y0, y1, rng, n, strength) {
    for (let i = 0; i < n; i++) {
      const x = rng() * W, y = y0 + rng() * (y1 - y0), r = 8 + rng() * 34;
      const light = rng() < 0.45;
      const a = (0.04 + rng() * 0.07) * (strength || 1);
      wrapped(W, H, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, light ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a * 1.4 + ')');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
  }

  function grit(g, W, y0, y1, rng, n, a) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,' + a * rng() + ')' : 'rgba(0,0,0,' + a * 1.5 * rng() + ')';
      g.fillRect(Math.floor(rng() * W), Math.floor(y0 + rng() * (y1 - y0)), 1, 1);
    }
  }

  function bricks(g, W, y0, y1, bw, bh, base, tint, rng) {
    const mortar = shade(base, -0.5);
    g.fillStyle = mortar;
    g.fillRect(0, y0, W, y1 - y0);
    const per = Math.round(W / bw);
    let row = 0;
    for (let y = y0; y < y1; y += bh, row++) {
      const off = (row % 2) * bw / 2;
      const cols = [];
      for (let k = 0; k < per; k++) cols.push(shade(mix(base, tint, 0.35 + rng() * 0.25), (rng() - 0.55) * 0.24));
      for (let k = -1; k <= per; k++) {
        const x = k * bw + off;
        const col = cols[((k % per) + per) % per];
        const h = Math.min(bh - 1, y1 - y - 1);
        if (h <= 0) continue;
        g.fillStyle = col;
        g.fillRect(x + 1, y + 1, bw - 2, h);
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 1, y + 1, bw - 2, 1);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + 1, y + h, bw - 2, 1);
        if (rng() < 0.1) { g.fillStyle = mortar; g.beginPath(); g.moveTo(x + bw - 1, y + 1); g.lineTo(x + bw - 5, y + 1); g.lineTo(x + bw - 1, y + 4); g.fill(); }
      }
    }
  }

  function stones(g, W, y0, y1, rowH, minW, maxW, base, rng) {
    const mortar = shade(base, -0.55);
    g.fillStyle = mortar;
    g.fillRect(0, y0, W, y1 - y0);
    for (let y = y0; y < y1; y += rowH) {
      const ws = [];
      let sum = 0;
      while (sum < W - maxW) { const w = Math.round(minW + rng() * (maxW - minW)); ws.push(w); sum += w; }
      ws.push(W - sum);
      let x = Math.floor(rng() * minW);
      const h = Math.min(rowH, y1 - y) - 2;
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        const col = shade(base, (rng() - 0.5) * 0.28);
        for (let ox = -W; ox <= 0; ox += W) {
          const sx = x + ox;
          if (sx + w < 0 || sx > W) continue;
          g.fillStyle = col; g.fillRect(sx + 1, y + 1, w - 2, h);
          g.fillStyle = 'rgba(255,255,255,0.09)'; g.fillRect(sx + 1, y + 1, w - 2, 1.5); g.fillRect(sx + 1, y + 1, 1.5, h);
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(sx + 1, y + h - 0.5, w - 2, 1.5); g.fillRect(sx + w - 2.5, y + 1, 1.5, h);
        }
        x += w;
        if (x >= W) x -= W;
      }
    }
  }

  function traces(g, W, y0, y1, color, rng, n, a) {
    g.strokeStyle = U.rgba(color, a);
    g.fillStyle = U.rgba(color, a * 1.4);
    g.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      let x = Math.floor(rng() * W / 4) * 4 + 0.5, y = Math.floor(y0 + rng() * (y1 - y0) / 4) * 4 + 0.5;
      g.beginPath(); g.moveTo(x, y);
      const segs = 2 + Math.floor(rng() * 3);
      for (let s = 0; s < segs; s++) {
        if (s % 2 === 0) x = U.clamp(x + (rng() < 0.5 ? -1 : 1) * (6 + Math.floor(rng() * 5) * 4), 1, W - 1);
        else y = U.clamp(y + (rng() < 0.5 ? -1 : 1) * (4 + Math.floor(rng() * 4) * 4), y0 + 1, y1 - 1);
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  function texture(st, th, face) {
    const key = st.mat + '|' + th.wall + '|' + th.wallTop + '|' + th.trim + '|' + (st.tint || '') + '|' + (face ? 'f' : 'c');
    if (CACHE[key]) return CACHE[key];
    const W = TEX, H = face ? TILE : TEX;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rng = U.makeRng(hashStr(key));
    const y0 = face ? TILE - FACE : 0, y1 = H;
    const capBase = mix(th.wall, th.wallTop, 0.65);
    const faceBase = shade(th.wall, -0.12);
    const base = face ? faceBase : capBase;
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    switch (st.mat) {
      case 'brick':
        if (face) bricks(g, W, y0, y1, 16, 5, faceBase, st.tint || '#6a3a2a', rng);
        else { bricks(g, W, 0, H, 24, 12, capBase, st.tint || '#6a3a2a', rng); blotches(g, W, H, 0, H, rng, 24, 0.8); }
        break;
      case 'stone':
        if (face) stones(g, W, y0, y1, 7.5, 14, 30, faceBase, rng);
        else stones(g, W, 0, H, 24, 20, 44, capBase, rng);
        blotches(g, W, H, y0, y1, rng, face ? 10 : 30, 0.8);
        break;
      case 'metal': {
        blotches(g, W, H, y0, y1, rng, face ? 8 : 26, 0.6);
        g.fillStyle = 'rgba(255,255,255,0.025)';
        for (let i = 0; i < (face ? 14 : 60); i++) g.fillRect(0, Math.floor(y0 + rng() * (y1 - y0)), W, 1);
        const pw = 48;
        for (let x = 24; x < W + pw; x += pw) {
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x - 1, y0, 2, y1 - y0);
          g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 1, y0, 1, y1 - y0);
        }
        if (!face) for (let y = 24; y < H; y += 48) {
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y - 1, W, 2);
          g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, y + 1, W, 1);
        }
        const rivY = face ? [y0 + 3, y1 - 4] : [];
        if (!face) for (let y = 24; y < H; y += 48) rivY.push(y + 5, y + 43);
        for (let x = 24; x < W + 48; x += 48) rivY.forEach(y => {
          [x + 5, x + 43].forEach(rx => {
            g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(rx % W + 0.6, y + 0.6, 1.5, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.arc(rx % W - 0.3, y - 0.3, 1.1, 0, TAU); g.fill();
          });
        });
        break;
      }
      case 'glass':
        if (face) {
          const glass = mix(th.wall, '#05080f', 0.45);
          g.fillStyle = glass; g.fillRect(0, y0, W, FACE);
          g.fillStyle = 'rgba(160,200,255,0.06)';
          for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x + 4, y0); g.lineTo(x + 10, y0); g.lineTo(x + 6, y1); g.lineTo(x, y1); g.fill(); }
          g.fillStyle = shade(th.wallTop, 0.08);
          for (let x = 0; x < W; x += 24) g.fillRect(x, y0, 2, FACE);
          g.fillRect(0, y0 + 7, W, 1);
          if (th.trim) { g.fillStyle = U.rgba(th.trim, 0.12); for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rng() * 8) * 24 + 3, y0 + 2, 19, 4); }
        } else {
          blotches(g, W, H, 0, H, rng, 22, 0.6);
          g.fillStyle = 'rgba(0,0,0,0.3)';
          for (let y = 24; y < H; y += 48) g.fillRect(0, y, W, 1);
          for (let x = 24; x < W; x += 48) g.fillRect(x, 0, 1, H);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          for (let y = 25; y < H; y += 48) g.fillRect(0, y, W, 1);
        }
        break;
      case 'corrugated':
        if (face) {
          for (let x = 0; x < W; x += 4) {
            g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x, y0, 1, FACE);
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 2, y0, 2, FACE);
          }
        } else {
          for (let y = 0; y < H; y += 6) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y, W, 2); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y + 3, W, 2); }
        }
        blotches(g, W, H, y0, y1, rng, face ? 10 : 30, 0.9);
        break;
      case 'tile':
        if (face) {
          const ceramic = mix(th.wall, '#d8d2c0', 0.42), grout = shade(th.wall, -0.4);
          g.fillStyle = grout; g.fillRect(0, y0, W, FACE);
          let row = 0;
          for (let y = y0; y < y1; y += 5, row++) {
            const off = (row % 2) * 6;
            for (let x = -12; x < W + 12; x += 12) {
              g.fillStyle = shade(ceramic, (rng() - 0.5) * 0.12);
              g.fillRect(x + off + 0.5, y + 0.5, 11, Math.min(4, y1 - y - 0.5));
              g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + off + 1, y + 0.5, 10, 1);
            }
          }
          const gr = g.createLinearGradient(0, y0, 0, y1);
          gr.addColorStop(0, 'rgba(20,16,10,0.05)'); gr.addColorStop(1, 'rgba(20,16,10,0.45)');
          g.fillStyle = gr; g.fillRect(0, y0, W, FACE);
        } else blotches(g, W, H, 0, H, rng, 34, 1);
        break;
      case 'circuit':
        blotches(g, W, H, y0, y1, rng, face ? 6 : 18, 0.5);
        if (face) {
          for (let x = 0; x < W; x += 48) {
            g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 23, y0, 2, FACE);
            g.fillStyle = 'rgba(0,0,0,0.35)';
            for (let k = 0; k < 4; k++) g.fillRect(x + 4 + k * 4, y0 + 4, 2, 7);
          }
          traces(g, W, y0 + 2, y1 - 2, th.trim, rng, 10, 0.3);
        } else {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          for (let y = 24; y < H; y += 48) g.fillRect(0, y, W, 1);
          for (let x = 24; x < W; x += 48) g.fillRect(x, 0, 1, H);
          traces(g, W, 0, H, th.trim, rng, 26, 0.18);
          g.fillStyle = 'rgba(0,0,0,0.4)';
          for (let i = 0; i < 10; i++) g.fillRect(Math.floor(rng() * W), Math.floor(rng() * H), 6, 4);
        }
        break;
      case 'ice':
      case 'concrete':
      default:
        blotches(g, W, H, y0, y1, rng, face ? 14 : 46, 1);
        if (face) {
          g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, y0 + 9, W, 1);
          g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y0 + 10, W, 1);
          for (let x = 12; x < W; x += 24) {
            g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x, y0 + 4.5, 1.3, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.arc(x - 0.4, y0 + 4, 0.7, 0, TAU); g.fill();
          }
        }
        if (st.mat === 'ice') {
          g.fillStyle = 'rgba(200,230,255,0.08)'; g.fillRect(0, y0, W, y1 - y0);
          for (let i = 0; i < (face ? 6 : 20); i++) {
            const x = rng() * W, y = y0 + rng() * (y1 - y0), r = 6 + rng() * 20;
            wrapped(W, H, x, y, r, (px, py) => {
              const gr = g.createRadialGradient(px, py, 0, px, py, r);
              gr.addColorStop(0, 'rgba(235,248,255,0.22)'); gr.addColorStop(1, 'rgba(235,248,255,0)');
              g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
            });
          }
        }
        break;
    }
    grit(g, W, y0, y1, rng, face ? 500 : 2200, 0.22);
    CACHE[key] = c;
    return c;
  }

  /* ---------------------------- Wall pass ---------------------------- */
  function crack(g, x, y, len, rng, a) {
    let px = x, py = y, ang = rng() * TAU;
    g.beginPath(); g.moveTo(px, py);
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) { ang += (rng() - 0.5) * 1.3; px += Math.cos(ang) * len / n; py += Math.sin(ang) * len / n; g.lineTo(px, py); }
    g.strokeStyle = 'rgba(0,0,0,' + (a || 0.5) + ')'; g.lineWidth = 1; g.stroke();
    g.translate(0.8, 0.8);
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.stroke();
    g.translate(-0.8, -0.8);
  }

  function streaks(g, x, y, h, rng, color, n) {
    for (let i = 0; i < n; i++) {
      const sx = x + 3 + rng() * (TILE - 6), w = 1 + rng() * 3, len = h * (0.4 + rng() * 0.6);
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(sx, y, w, len);
    }
  }

  function drawWalls(c, level) {
    const g = c.getContext('2d');
    const map = level.map, th = level.theme;
    const key = (level.def && level.def.theme) || 'outpost';
    const st = STYLE[key] || { mat: 'concrete', stains: 0.3, cracks: 0.2 };
    const rng = U.makeRng(((level.seed || 1) * 31 + 777) >>> 0);
    const capPat = g.createPattern(texture(st, th, false), 'repeat');
    const facePat = g.createPattern(texture(st, th, true), 'repeat');
    const solid = (x, y) => !map.inBounds(x, y) || map.tiles[map.idx(x, y)] === T.SOLID;
    const fl = (x, y) => map.inBounds(x, y) && map.isFloor(x, y);
    const isFace = (x, y) => solid(x, y) && map.inBounds(x, y) && fl(x, y + 1);
    const lip = shade(th.wallTop, 0.3);
    const post = [];
    const lights = [];
    const glowSpr = BO.softSprite ? BO.softSprite(th.trim) : null;

    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
      if (!solid(tx, ty)) continue;
      let touches = false;
      for (let y = ty - 1; y <= ty + 1 && !touches; y++) for (let x = tx - 1; x <= tx + 1; x++) if (fl(x, y)) { touches = true; break; }
      if (!touches) continue;
      const x = tx * TILE, y = ty * TILE;
      const fN = fl(tx, ty - 1), fS = fl(tx, ty + 1), fW = fl(tx - 1, ty), fE = fl(tx + 1, ty);
      const r = () => rng();

      // 1. Cap.
      g.fillStyle = capPat;
      g.fillRect(x, y, TILE, TILE);
      const lg = g.createLinearGradient(x, y, x + TILE, y + TILE);
      lg.addColorStop(0, 'rgba(255,255,255,0.05)'); lg.addColorStop(1, 'rgba(0,0,0,0.14)');
      g.fillStyle = lg; g.fillRect(x, y, TILE, TILE);
      const v = (r() - 0.5) * 0.08;
      g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v * 1.5) + ')';
      g.fillRect(x, y, TILE, TILE);
      if (!fN && !fS && !fW && !fE) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y, TILE, TILE); }

      // 2. Cap wear.
      if (st.cracks && r() < st.cracks) crack(g, x + 8 + r() * 32, y + 6 + r() * (fS ? 18 : 34), 12 + r() * 16, rng, 0.45);
      if (st.rust && r() < 0.35 * st.rust) {
        const rx = x + r() * TILE, ry = y + r() * (TILE - FACE), rr = 6 + r() * 12;
        const gr = g.createRadialGradient(rx, ry, 0, rx, ry, rr);
        gr.addColorStop(0, 'rgba(140,66,24,0.35)'); gr.addColorStop(1, 'rgba(140,66,24,0)');
        g.fillStyle = gr; g.fillRect(rx - rr, ry - rr, rr * 2, rr * 2);
      }
      if (st.soot && r() < 0.25 * st.soot) {
        const rx = x + r() * TILE, ry = y + r() * TILE, rr = 10 + r() * 14;
        const gr = g.createRadialGradient(rx, ry, 0, rx, ry, rr);
        gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(rx - rr, ry - rr, rr * 2, rr * 2);
      }
      if (st.snow) {
        const capH = fS ? TILE - FACE : TILE;
        g.fillStyle = 'rgba(230,244,255,0.16)'; g.fillRect(x, y, TILE, capH);
        for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(245,252,255,' + (0.15 + r() * 0.35) + ')'; g.fillRect(x + r() * TILE, y + r() * capH, 1 + r() * 2, 1 + r() * 2); }
        if (fS) { g.fillStyle = 'rgba(240,250,255,0.55)'; g.beginPath(); g.moveTo(x, y + capH); for (let k = 0; k <= 6; k++) g.lineTo(x + k * TILE / 6, y + capH - 2 - r() * 3); g.lineTo(x + TILE, y + capH); g.fill(); }
      }

      // 3. Bevels + outlines on edges that face a room.
      if (fN) {
        g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x, y + 1, TILE, 2);
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y, TILE, 1);
      }
      if (fW) {
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 1, y, 2, TILE);
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y, 1, TILE);
      }
      if (fE) {
        const gr = g.createLinearGradient(x + TILE - 5, 0, x + TILE, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)');
        g.fillStyle = gr; g.fillRect(x + TILE - 5, y, 5, TILE);
        g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x + TILE - 1, y, 1, TILE);
      }

      // 4. Front face on walls that look down into a room.
      if (fS) {
        const fy = y + TILE - FACE;
        g.fillStyle = facePat;
        g.fillRect(x, fy, TILE, FACE);
        if (st.tilework && ((tx >> 2) * 7 + ty * 3) % 5 < 2) drawTilework(g, x, fy, tx);
        const gr = g.createLinearGradient(0, fy, 0, y + TILE);
        gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(0.2, 'rgba(0,0,0,0.04)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
        g.fillStyle = gr; g.fillRect(x, fy, TILE, FACE);
        if (st.soot) {
          const sg = g.createLinearGradient(0, fy, 0, fy + FACE * 0.7);
          sg.addColorStop(0, 'rgba(0,0,0,' + 0.35 * st.soot + ')'); sg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = sg; g.fillRect(x, fy, TILE, FACE);
        }
        if (st.stains && r() < st.stains) streaks(g, x, fy + 1, FACE, rng, 'rgba(0,0,0,0.3)', 1 + Math.floor(r() * 3));
        if (st.rust && r() < 0.6 * st.rust) streaks(g, x, fy + 1, FACE, rng, 'rgba(150,70,25,0.4)', 1 + Math.floor(r() * 3));
        if (st.moss && r() < st.moss) {
          for (let k = 0; k < 5; k++) { const mx = x + r() * TILE, my = y + TILE - 2 - r() * 6, mr = 2 + r() * 5; g.fillStyle = 'rgba(70,104,48,0.28)'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill(); }
        }
        if (st.scars && r() < st.scars) {
          const n = 2 + Math.floor(r() * 4);
          for (let k = 0; k < n; k++) {
            const sx = x + 4 + r() * (TILE - 8), sy = fy + 3 + r() * (FACE - 6), sr = 0.8 + r() * 1.4;
            g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(sx, sy, sr + 1, 0, TAU); g.fill();
            g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
          }
        }
        if (st.cracks && r() < st.cracks * 0.5) crack(g, x + r() * TILE, fy + 2, 10 + r() * 8, rng, 0.5);
        if (st.pipes) {
          const py = fy + 3;
          const pg = g.createLinearGradient(0, py, 0, py + 4.5);
          const pc = shade(th.wallTop, 0.15);
          pg.addColorStop(0, shade(pc, 0.35)); pg.addColorStop(0.5, pc); pg.addColorStop(1, shade(pc, -0.5));
          g.fillStyle = pg; g.fillRect(x, py, TILE, 4.5);
          if (tx % 5 === 0) { g.fillStyle = shade(pc, -0.2); g.fillRect(x + 20, py - 1, 4, 6.5); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 20, py - 1, 4, 1); }
          if (r() < 0.04) { g.fillStyle = '#a8302a'; g.beginPath(); g.arc(x + 34, py + 2.2, 3.2, 0, TAU); g.fill(); g.fillStyle = '#1a1010'; g.fillRect(x + 33.4, py - 0.5, 1.2, 5.5); }
        }
        if (st.signs && r() < st.signs) {
          const sx = x + 10 + r() * 18, sy = fy + 3;
          g.fillStyle = '#d8d8d0'; g.fillRect(sx, sy, 14, 8);
          g.fillStyle = th.trim; g.fillRect(sx, sy, 14, 2.5);
          g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(sx + 2, sy + 4, 7, 1); g.fillRect(sx + 2, sy + 6, 10, 1);
        }
        if (st.hazard && (map.tile(tx - 1, ty) === T.DOOR || map.tile(tx + 1, ty) === T.DOOR || map.tile(tx, ty + 1) === T.DOOR)) {
          g.save();
          g.beginPath(); g.rect(x, fy + 1, TILE, FACE - 3); g.clip();
          g.fillStyle = 'rgba(240,190,61,0.75)'; g.fillRect(x, fy + 1, TILE, FACE - 3);
          g.fillStyle = 'rgba(15,15,18,0.85)';
          for (let k = -FACE; k < TILE + FACE; k += 10) { g.beginPath(); g.moveTo(x + k, fy + 1); g.lineTo(x + k + 5, fy + 1); g.lineTo(x + k + 5 - FACE, fy + FACE); g.lineTo(x + k - FACE, fy + FACE); g.fill(); }
          g.restore();
        }
        if (st.strip) {
          g.fillStyle = U.rgba(th.trim, 0.55); g.fillRect(x, y + TILE - 5, TILE, 1.5);
          g.fillStyle = U.rgba(th.trim, 0.15); g.fillRect(x, y + TILE - 7, TILE, 5);
          if (tx % 7 === 0 && lights.length < 70) lights.push({ x: x + TILE / 2, y: y + TILE - 4, r: 46, k: 0.28 });
        }
        if (st.lights && r() < st.lights) {
          const lx = x + 12 + r() * 24, ly = fy + 4;
          g.fillStyle = '#0c0d12'; g.fillRect(lx - 4, ly - 1, 10, 7);
          g.fillStyle = th.trim; g.fillRect(lx - 2.5, ly, 7, 4);
          g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(lx - 1, ly + 1, 4, 1);
          if (glowSpr) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.drawImage(glowSpr, lx - 15, ly - 13, 32, 32); g.restore(); }
          if (lights.length < 70) lights.push({ x: lx + 1, y: ly + 6, r: 70, k: 0.4 });
        }
        // Lip on top of the face, contact shadow + skirting at the bottom.
        g.fillStyle = lip; g.globalAlpha = 0.65; g.fillRect(x, fy - 2, TILE, 2); g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, fy, TILE, 1);
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y + TILE - 2, TILE, 2);
        // Ends of a face run.
        if (!isFace(tx - 1, ty)) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, fy, 2, FACE); }
        if (!isFace(tx + 1, ty)) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + TILE - 3, fy, 3, FACE); }

        // Multi-tile details are drawn after every tile so neighbours cannot paint over them.
        if (st.graffiti && r() < st.graffiti && isFace(tx + 1, ty) && isFace(tx + 2, ty)) post.push({ kind: 'graffiti', x, y: fy, seed: r() });
        if (st.cables && r() < 0.06 && isFace(tx + 1, ty) && isFace(tx + 2, ty)) post.push({ kind: 'cable', x, y: fy, seed: r() });
        if (st.icicles && r() < st.icicles) post.push({ kind: 'icicles', x, y: y + TILE, seed: r() });
      } else if (fN || fW || fE) {
        if (st.stains && r() < st.stains * 0.3) streaks(g, x, y + 2, TILE * 0.5, rng, 'rgba(0,0,0,0.18)', 1);
      }
    }

    post.forEach(p => {
      const pr = U.makeRng(Math.floor(p.seed * 1e9) + 11);
      if (p.kind === 'graffiti') {
        const word = GRAFFITI[Math.floor(pr() * GRAFFITI.length)];
        const col = [th.trim, '#e8e2d0', '#ff3355', '#3ddc84'][Math.floor(pr() * 4)];
        g.save();
        g.translate(p.x + TILE * 1.5, p.y + FACE / 2 + 0.5);
        g.rotate((pr() - 0.5) * 0.08);
        g.font = '700 ' + (word === 'BLACKOUT' ? 12 : 13) + 'px Vazirmatn, Khand, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.direction = word === 'BLACKOUT' ? 'ltr' : 'rtl';
        g.shadowColor = U.rgba(col, 0.6); g.shadowBlur = 3;
        g.globalAlpha = 0.62;
        g.fillStyle = col;
        g.fillText(word, 0, 0);
        g.shadowBlur = 0;
        g.globalAlpha = 0.35;
        for (let k = 0; k < 4; k++) g.fillRect((pr() - 0.5) * 50, 3, 1, 2 + pr() * 4);
        g.restore();
      } else if (p.kind === 'cable') {
        g.strokeStyle = 'rgba(8,8,10,0.85)'; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(p.x + 4, p.y + 2); g.bezierCurveTo(p.x + 40, p.y + 12, p.x + 100, p.y + 12, p.x + TILE * 3 - 4, p.y + 2); g.stroke();
        g.fillStyle = '#2a2c34'; g.fillRect(p.x + 2, p.y, 4, 3); g.fillRect(p.x + TILE * 3 - 6, p.y, 4, 3);
      } else if (p.kind === 'icicles') {
        const n = 2 + Math.floor(pr() * 4);
        for (let k = 0; k < n; k++) {
          const ix = p.x + 4 + pr() * (TILE - 8), len = 4 + pr() * 9, w = 1.5 + pr() * 2;
          const gr = g.createLinearGradient(0, p.y, 0, p.y + len);
          gr.addColorStop(0, 'rgba(230,246,255,0.85)'); gr.addColorStop(1, 'rgba(180,220,255,0.2)');
          g.fillStyle = gr;
          g.beginPath(); g.moveTo(ix - w, p.y - 1); g.lineTo(ix + w, p.y - 1); g.lineTo(ix, p.y + len); g.closePath(); g.fill();
        }
      }
    });

    // Emissive wall details cut small holes in the darkness.
    if (!level._v4WallLights && Array.isArray(level.lamps)) {
      level._v4WallLights = true;
      lights.forEach(l => level.lamps.push({ x: l.x, y: l.y, radius: l.r, color: th.trim, flicker: 0, pulse: false, intensity: l.k, phase: rng() * 6 }));
    }
  }

  function drawTilework(g, x, fy, tx) {
    const cols = ['#2ec4b6', '#1d3a6a', '#e8dcc0'];
    const s = 7.5;
    for (let row = 0; row < 2; row++) for (let k = 0; k < TILE / s; k++) {
      const cx = x + k * s, cy = fy + row * s;
      const ci = ((tx * 7 + k) + row) % 3;
      g.fillStyle = cols[ci]; g.globalAlpha = 0.8;
      g.fillRect(cx + 0.5, cy + 0.5, s - 1, s - 1);
      g.fillStyle = ci === 2 ? '#1d3a6a' : '#e8dcc0'; g.globalAlpha = 0.75;
      g.beginPath(); g.moveTo(cx + s / 2, cy + 1.5); g.lineTo(cx + s - 1.5, cy + s / 2); g.lineTo(cx + s / 2, cy + s - 1.5); g.lineTo(cx + 1.5, cy + s / 2); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }

  const origBuild = R.buildStaticLayer;
  R.buildStaticLayer = function (level) {
    const c = origBuild.call(this, level);
    U.safe('v4walls.build', () => drawWalls(c, level));
    return c;
  };
  BO.V4Walls = { STYLE, texture, drawWalls };
})(window.BO);
