/* =========================================================================
 * BLACKOUT :: lab-arenas.js
 * Signature arenas for the Boss Laboratory. Loaded ONLY by boss-lab.html.
 *
 * Every lab boss used to fight in the same 36x26 box with four pillars.
 * Each boss now gets an arena built around its kit, with its own outline,
 * cover layout, palette, lighting, painted floor art, emissive details and
 * animated ambience:
 *
 *   m3  PANOPTICON        elliptical watch hall, pillar ring to break the searchlight
 *   m5  CRASH YARD        long lanes for the ram, concrete barriers, oil + skid marks
 *   m8  NO MAN'S LAND     trench lines, craters, distant artillery flashes
 *   m10 EVENT HORIZON     octagon over a starfield, accretion spiral pulling to the core
 *   m13 HUNTING GROUND    overgrown cave, scattered trees, fireflies
 *   m14 THRONE HALL       colonnade, red carpet, braziers, throne dais
 *   m18 CALDERA           cross-shaped basalt island in a lava lake, rising embers
 *   c3  TWIN REACTOR      two reactor lobes (cyan / crimson) joined by a bridge
 *   m23 OSSUARY CRYPT     alcoves, sarcophagi, ritual circle, drifting fog
 *   m24 STORM SPIRE       diamond rooftop above the clouds, rods, puddles, rain
 *   x1  CLOCKTOWER        giant clock face with turning hands under the floor
 *   x2  BROOD NEST        organic hive, honeycomb, glowing egg clusters, spores
 *   x3  CRYSTAL GALLERY   hexagonal mirror hall, crystal formations, caustics
 *   x4  FLOODED CISTERN   pillared reservoir, shallow channels with live ripples
 *   x5  CORRUPTED CORE    neon grid with missing tiles over a binary void
 *
 * Art is pre-rendered once into two offscreen layers (an "under" layer that
 * the darkness covers and an emissive layer added after lighting), so the
 * per-frame cost is two clipped drawImage calls plus a little ambience.
 * ========================================================================= */
'use strict';
(function (BO) {
  if (!BO || !BO.U || !BO.TileMap || !BO.CONFIG) return;
  const U = BO.U, TAU = Math.PI * 2, TILE = BO.CONFIG.TILE || 64, T = BO.TILE_TYPE;
  const LA = BO.LabArenas = BO.LabArenas || {};
  const P = v => v * TILE;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hasDoc = typeof document !== 'undefined';

  /* ------------------------------ Shapes ------------------------------ */
  const ell = (x, y, cx, cy, rx, ry) => { const dx = (x - cx) / rx, dy = (y - cy) / ry; return dx * dx + dy * dy <= 1; };
  const circ = (x, y, cx, cy, r) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
  const oct = (x, y, cx, cy, r) => { const dx = Math.abs(x - cx), dy = Math.abs(y - cy); return dx <= r && dy <= r && dx + dy <= r * 1.42; };
  const diamond = (x, y, cx, cy, r) => Math.abs(x - cx) + Math.abs(y - cy) <= r;
  const hexF = (x, y, cx, cy, r) => { const dx = Math.abs(x - cx), dy = Math.abs(y - cy); return dy <= r * 0.866 && dx + dy * 0.577 <= r; };
  const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const rrect = (x, y, x0, y0, x1, y1, r) => {
    if (!rect(x, y, x0, y0, x1, y1)) return false;
    const cx = clamp(x, x0 + r, x1 - r), cy = clamp(y, y0 + r, y1 - r);
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
  };
  function makeNoise(seed, cell) {
    const rng = U.makeRng(seed), G = 64, v = new Float32Array(G * G);
    for (let i = 0; i < v.length; i++) v[i] = rng();
    const at = (i, j) => v[((j % G + G) % G) * G + ((i % G + G) % G)];
    const sm = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), tx = sm(fx - i), ty = sm(fy - j);
      const a = U.lerp(at(i, j), at(i + 1, j), tx), b = U.lerp(at(i, j + 1), at(i + 1, j + 1), tx);
      return U.lerp(a, b, ty);
    };
  }
  const hash = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + (s || 0) * 74.7) * 43758.5453; return h - Math.floor(h); };

  /* --------------------------- Build context --------------------------- */
  function ctxFor(W, H, seed) {
    const map = new BO.TileMap(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) map.tiles[map.idx(x, y)] = T.SOLID;
    const rng = U.makeRng(seed);
    const A = {
      W, H, map, rng, seed, props: [], eggs: [], marks: {},
      R: (a, b) => a + rng() * (b - a),
      RI: (a, b) => Math.floor(a + rng() * (b - a + 1)),
      inside: (x, y) => x >= 2 && y >= 2 && x <= W - 3 && y <= H - 3,
      isF: (x, y) => x >= 0 && y >= 0 && x < W && y < H && map.tiles[map.idx(x, y)] !== T.SOLID,
      setF(x, y) {
        if (A.inside(x, y)) {
          const i = map.idx(x, y);
          map.tiles[i] = T.FLOOR;
          map.roomId[i] = 0;
          if (map.props && map.props[i] && map.props[i].coverBlock) {
            map.props[i].dead = true;
            map.props[i] = null;
          }
        }
      },
      setS(x, y) {
        if (x >= 0 && y >= 0 && x < W && y < H) {
          const i = map.idx(x, y);
          map.tiles[i] = T.SOLID;
          if (map.props && map.props[i] && !map.props[i].coverBlock) map.props[i] = null;
        }
      },
      carve(fn) { for (let y = 2; y <= H - 3; y++) for (let x = 2; x <= W - 3; x++) if (fn(x + 0.5, y + 0.5, x, y)) A.setF(x, y); },
      block(x, y, w, h, kind) {
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const bx = x + i, by = y + j;
            if (bx >= 0 && by >= 0 && bx < W && by < H) {
              const idx = map.idx(bx, by);
              map.tiles[idx] = T.SOLID;
              if (A.inside(bx, by) && BO.LevelManager && BO.LevelManager.makeProp) {
                const existing = map.props && map.props[idx];
                if (existing) existing.dead = true;
                const p = BO.LevelManager.makeProp(kind || 'pillar', bx, by);
                p.coverBlock = true;
                if (map.props) map.props[idx] = p;
                A.props.push(p);
              } else if (map.props) {
                map.props[idx] = null;
              }
            }
          }
        }
      },
      clear(cx, cy, r) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (circ(x + 0.5, y + 0.5, cx + 0.5, cy + 0.5, r + 0.01)) A.setF(x, y); },
      prop(kind, x, y) {
        if (!A.isF(x, y) || !BO.LevelManager || !BO.LevelManager.makeProp) return null;
        const i = map.idx(x, y);
        if (map.props && map.props[i]) return null;
        const p = BO.LevelManager.makeProp(kind, x, y);
        if (map.props) map.props[i] = p;
        A.props.push(p);
        return p;
      }
    };
    return A;
  }

  function nearestFloor(A, tx, ty) {
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(tx) + dx, y = Math.round(ty) + dy;
      if (A.isF(x, y) && !(A.map.props && A.map.props[A.map.idx(x, y)])) return [x, y];
    }
    return [Math.round(tx), Math.round(ty)];
  }

  function floodFix(A, sx, sy) {
    const { W, H, map } = A, seen = new Uint8Array(W * H), st = [map.idx(sx, sy)];
    seen[st[0]] = 1;
    while (st.length) {
      const i = st.pop(), x = i % W, y = (i - x) / W;
      [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        const n = map.idx(nx, ny);
        if (seen[n] || map.tiles[n] === T.SOLID) return;
        const pr = map.props && map.props[n];
        if (pr && !pr.destructible && pr.kind !== 'barrel') { seen[n] = 2; return; } // props are passable for the check
        seen[n] = 1; st.push(n);
      });
    }
    for (let i = 0; i < W * H; i++) if (map.tiles[i] !== T.SOLID && !seen[i]) A.setS(i % W, (i - (i % W)) / W);
  }

  /* --------------------------- Paint helpers --------------------------- */
  const D = {
    ring(g, x, y, r, c, a, w, dash) { g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = w || 2; if (dash) g.setLineDash(dash); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.setLineDash([]); },
    ticks(g, x, y, r0, r1, n, c, a, w, rot) {
      g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = w || 2; g.beginPath();
      for (let i = 0; i < n; i++) { const an = (rot || 0) + i / n * TAU; g.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); g.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); }
      g.stroke();
    },
    blot(g, x, y, r, c, a) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, U.rgba(c, a)); gr.addColorStop(1, U.rgba(c, 0));
      g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    },
    grime(g, A, n, c, a, r0, r1) { for (let i = 0; i < n; i++) D.blot(g, A.R(P(2), P(A.W - 2)), A.R(P(2), P(A.H - 2)), A.R(r0, r1), c, a * A.R(0.4, 1)); },
    cracks(g, A, n, c, a, w, len) {
      g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = w || 1.5; g.lineCap = 'round';
      for (let k = 0; k < n; k++) {
        let x = A.R(P(2), P(A.W - 2)), y = A.R(P(2), P(A.H - 2)), an = A.R(0, TAU);
        g.beginPath(); g.moveTo(x, y);
        const segs = A.RI(3, 7);
        for (let s = 0; s < segs; s++) {
          an += A.R(-0.7, 0.7); const l = A.R(10, len || 34); x += Math.cos(an) * l; y += Math.sin(an) * l; g.lineTo(x, y);
          if (A.rng() < 0.3) { const b = an + A.R(-1.4, 1.4); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * l * 0.6, y + Math.sin(b) * l * 0.6); g.moveTo(x, y); }
        }
        g.stroke();
      }
    },
    edgeStripes(g, A, c1, a) {
      const { map } = A;
      g.globalAlpha = a; g.fillStyle = c1;
      for (let y = 1; y < A.H - 1; y++) for (let x = 1; x < A.W - 1; x++) {
        if (!A.isF(x, y)) continue;
        const n = !A.isF(x, y - 1), s = !A.isF(x, y + 1), w = !A.isF(x - 1, y), e = !A.isF(x + 1, y);
        if (!(n || s || w || e)) continue;
        g.save(); g.beginPath(); g.rect(P(x), P(y), TILE, TILE); g.clip();
        for (let k = -TILE; k < TILE * 2; k += 16) { g.beginPath(); g.moveTo(P(x) + k, P(y)); g.lineTo(P(x) + k + 8, P(y)); g.lineTo(P(x) + k + 8 - TILE, P(y) + TILE); g.lineTo(P(x) + k - TILE, P(y) + TILE); g.fill(); }
        g.restore();
      }
      void map;
    },
    text(g, s, x, y, size, c, a, rot, font) {
      g.save(); g.translate(x, y); if (rot) g.rotate(rot);
      g.globalAlpha = a; g.fillStyle = c; g.font = (font || '700 ') + size + 'px "Chakra Petch", "Courier New", monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, 0, 0); g.restore();
    },
    gear(g, x, y, r, teeth, c, a, w, rot) {
      g.save(); g.translate(x, y); g.rotate(rot || 0); g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = w || 3;
      g.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a0 = i / (teeth * 2) * TAU, a1 = (i + 1) / (teeth * 2) * TAU, rr = i % 2 ? r : r * 1.14;
        g.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr); g.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
      }
      g.closePath(); g.stroke();
      g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, r * 0.18, 0, TAU); g.stroke();
      for (let i = 0; i < 5; i++) { const an = i / 5 * TAU; g.beginPath(); g.moveTo(Math.cos(an) * r * 0.18, Math.sin(an) * r * 0.18); g.lineTo(Math.cos(an) * r * 0.62, Math.sin(an) * r * 0.62); g.stroke(); }
      g.restore();
    },
    floorClip(g, A) { g.beginPath(); for (let y = 0; y < A.H; y++) for (let x = 0; x < A.W; x++) if (A.isF(x, y)) g.rect(P(x), P(y), TILE, TILE); g.clip(); },
    deepClip(g, A) {
      g.beginPath();
      for (let y = 0; y < A.H; y++) for (let x = 0; x < A.W; x++) {
        if (A.isF(x, y)) continue;
        let near = false;
        for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1 && !near; i++) if (A.isF(x + i, y + j)) near = true;
        if (!near) g.rect(P(x), P(y), TILE, TILE);
      }
      g.clip();
    },
    floorTiles(A, fn) { for (let y = 0; y < A.H; y++) for (let x = 0; x < A.W; x++) if (A.isF(x, y)) fn(x, y); },
    solidNear(A, x, y) { return !A.isF(x - 1, y) || !A.isF(x + 1, y) || !A.isF(x, y - 1) || !A.isF(x, y + 1); }
  };
  LA.D = D;

  function glowSprite(ctx, x, y, r, c, a) {
    if (a <= 0.003) return;
    ctx.globalAlpha = Math.min(1, a);
    if (BO.softSprite) ctx.drawImage(BO.softSprite(c), x - r, y - r, r * 2, r * 2);
    else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill(); }
  }
  LA.glowSprite = glowSprite;
  const lamp = (x, y, color, radius, intensity, o) => Object.assign({ x: P(x), y: P(y), color, radius, intensity, pulse: false, flicker: 0, phase: (x * 7 + y * 3) % 6 }, o || {});

  /* ------------------------------ Styles ------------------------------ */
  const STYLES = {
    m3: {
      name: 'Panopticon', fa: 'سراچه‌ی رصد', base: 'blacksite', size: [36, 28], spawn: [6, 14], boss: [27, 14],
      theme: { floor: '#15181e', floorAlt: '#181c23', corridor: '#15181e', wall: '#222832', wallTop: '#46505f', trim: '#ffd27a', darkness: 0.9 },
      shape(A) {
        A.carve((x, y) => ell(x, y, 18, 14, 15.8, 11.8));
        for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + Math.PI / 8; A.block(Math.round(18 + Math.cos(an) * 9.6 - 1), Math.round(14 + Math.sin(an) * 6.6 - 1), 2, 2); }
      },
      lamps: () => [lamp(18, 14, '#fff2c7', 470, 0.9), lamp(11, 9, '#ffd27a', 280, 0.7), lamp(25, 9, '#ffd27a', 280, 0.7), lamp(11, 19, '#ffd27a', 280, 0.7), lamp(25, 19, '#ffd27a', 280, 0.7)],
      art(g, A) {
        const cx = P(18), cy = P(14);
        D.grime(g, A, 30, '#000000', 0.35, 30, 120);
        [1.5, 3, 5.4, 8.4].forEach((r, i) => D.ring(g, cx, cy, P(r), '#ffd27a', 0.1 + i * 0.02, i % 2 ? 3 : 1.5, i === 3 ? [18, 12] : null));
        D.ticks(g, cx, cy, P(3.1), P(3.5), 48, '#ffd27a', 0.18, 2);
        D.ticks(g, cx, cy, P(1.6), P(12), 16, '#ffd27a', 0.035, 2, Math.PI / 16);
        D.text(g, 'OBSERVATION // SECTOR 03', cx, P(23.3), 22, '#ffd27a', 0.12);
        D.text(g, 'EYES UP', cx, P(4.8), 18, '#ffd27a', 0.1);
        D.edgeStripes(g, A, '#ffd27a', 0.07);
        D.cracks(g, A, 18, '#000000', 0.4, 1.4);
      },
      glow(g, A) {
        const cx = P(18), cy = P(14);
        D.ring(g, cx, cy, P(1.2), '#ffd27a', 0.55, 3);
        for (let i = 0; i < 8; i++) { const an = i / 8 * TAU; glowSprite(g, cx + Math.cos(an) * P(5.4), cy + Math.sin(an) * P(5.4), 18, '#ffd27a', 0.6); }
      },
      over(ctx, A, t) {
        const cx = P(18), cy = P(14), a = t * 0.35;
        ctx.globalAlpha = 0.05; ctx.fillStyle = '#fff2c7';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, P(11), a - 0.16, a + 0.16); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, P(11), a + Math.PI - 0.16, a + Math.PI + 0.16); ctx.closePath(); ctx.fill();
        glowSprite(ctx, cx, cy, 60, '#ffd27a', 0.35 + Math.sin(t * 3) * 0.1);
      }
    },

    m5: {
      name: 'Crash Yard', fa: 'محوطه‌ی تصادف', base: 'industrial', size: [40, 24], spawn: [5, 12], boss: [33, 12],
      theme: { floor: '#1b1b1e', floorAlt: '#1e1e22', corridor: '#1b1b1e', wall: '#2b2d33', wallTop: '#5a5f6a', trim: '#f0be3d', darkness: 0.88 },
      shape(A) {
        A.carve((x, y) => rect(x, y, 2, 2, 38, 22) && (x - 2) + (y - 2) > 3 && (38 - x) + (y - 2) > 3 && (x - 2) + (22 - y) > 3 && (38 - x) + (22 - y) > 3);
        [[10, 6], [10, 16], [28, 6], [28, 16]].forEach(([x, y]) => A.block(x, y, 2, 2));
        for (let x = 18; x <= 21; x++) { A.prop('barrier', x, 4); A.prop('barrier', x, 19); }
        A.prop('barrel', 19, 8); A.prop('barrel', 20, 15);
      },
      lamps: () => [lamp(13, 12, '#ffb347', 420, 0.85), lamp(27, 12, '#ffb347', 420, 0.85), lamp(5, 4, '#f0be3d', 200, 0.6, { pulse: true }), lamp(34, 19, '#f0be3d', 200, 0.6, { pulse: true })],
      art(g, A) {
        D.grime(g, A, 40, '#000000', 0.4, 30, 140);
        g.globalAlpha = 0.14; g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.setLineDash([40, 30]);
        [8, 16].forEach(y => { g.beginPath(); g.moveTo(P(3), P(y)); g.lineTo(P(37), P(y)); g.stroke(); });
        g.setLineDash([]);
        for (let i = 0; i < 5; i++) {
          const x = P(8 + i * 6), y = P(12);
          g.globalAlpha = 0.07; g.fillStyle = '#f0be3d';
          g.beginPath(); g.moveTo(x - 30, y - 50); g.lineTo(x + 20, y); g.lineTo(x - 30, y + 50); g.lineTo(x - 10, y + 50); g.lineTo(x + 40, y); g.lineTo(x - 10, y - 50); g.closePath(); g.fill();
        }
        g.lineCap = 'round';
        for (let i = 0; i < 12; i++) {
          const x0 = A.R(P(4), P(34)), y0 = A.R(P(4), P(20)), an = A.R(-0.6, 0.6) + (A.rng() < 0.5 ? 0 : Math.PI), l = A.R(160, 380), bend = A.R(-90, 90);
          for (let s = -1; s <= 1; s += 2) {
            const ox = -Math.sin(an) * 14 * s, oy = Math.cos(an) * 14 * s;
            g.globalAlpha = 0.35; g.strokeStyle = '#050506'; g.lineWidth = 9;
            g.beginPath(); g.moveTo(x0 + ox, y0 + oy);
            g.quadraticCurveTo(x0 + Math.cos(an) * l / 2 + ox + bend, y0 + Math.sin(an) * l / 2 + oy + bend, x0 + Math.cos(an) * l + ox, y0 + Math.sin(an) * l + oy); g.stroke();
          }
        }
        for (let i = 0; i < 8; i++) D.blot(g, A.R(P(4), P(36)), A.R(P(4), P(20)), A.R(30, 70), '#0a0806', 0.7);
        ['BAY 01', 'BAY 02', 'BAY 03'].forEach((s, i) => D.text(g, s, P(10 + i * 10), P(3.4), 22, '#f0be3d', 0.14));
        D.edgeStripes(g, A, '#f0be3d', 0.12);
        D.cracks(g, A, 26, '#000000', 0.5, 1.6);
      },
      glow(g, A) { for (let x = 4; x <= 36; x += 2) { glowSprite(g, P(x), P(2.15), 12, '#ffb347', 0.5); glowSprite(g, P(x), P(21.85), 12, '#ffb347', 0.5); } },
      over(ctx, A, t) {
        [[4.2, 4.2], [35.8, 4.2], [4.2, 19.8], [35.8, 19.8]].forEach(([x, y], i) => {
          const a = t * 4 + i * 1.7, cx = P(x), cy = P(y);
          glowSprite(ctx, cx, cy, 30, '#ff8a1a', 0.7);
          ctx.globalAlpha = 0.08; ctx.fillStyle = '#ff8a1a';
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 260, a - 0.25, a + 0.25); ctx.closePath(); ctx.fill();
        });
      }
    },

    m8: {
      name: "No Man's Land", fa: 'سرزمین بی‌صاحب', base: 'outpost', size: [38, 26], spawn: [5, 13], boss: [31, 13],
      theme: { floor: '#1d1c17', floorAlt: '#201f19', corridor: '#1d1c17', wall: '#2d2a20', wallTop: '#5b5440', trim: '#ff9f43', darkness: 0.9 },
      shape(A) {
        const n = makeNoise(A.seed + 8, 3);
        A.carve((x, y, tx, ty) => rect(tx, ty, 2, 2, 35, 23) && !((tx === 2 || tx === 35 || ty === 2 || ty === 23) && n(tx, ty) > 0.62));
        [[13, 4], [13, 10], [13, 17]].forEach(([x, y]) => { for (let k = 0; k < 4; k++) A.prop('barrier', x, y + k); });
        [[24, 3], [24, 9], [24, 15], [24, 20]].forEach(([x, y]) => { for (let k = 0; k < 3; k++) A.prop('barrier', x, y + k); });
        [[18, 6], [19, 19], [9, 7], [29, 18]].forEach(([x, y]) => A.prop('crate', x, y));
      },
      lamps: () => [lamp(10, 7, '#ff9f43', 360, 0.75, { flicker: 0.5 }), lamp(10, 19, '#ff9f43', 360, 0.75), lamp(27, 7, '#ff9f43', 360, 0.75), lamp(27, 19, '#ff9f43', 360, 0.75, { flicker: 0.6 }), lamp(19, 13, '#e8e0c8', 300, 0.5)],
      art(g, A) {
        D.grime(g, A, 45, '#0b0904', 0.45, 40, 150);
        A.marks.craters = [];
        for (let i = 0; i < 10; i++) {
          const x = A.R(P(4), P(34)), y = A.R(P(4), P(22)), r = A.R(40, 95);
          A.marks.craters.push([x, y, r]);
          D.blot(g, x, y, r, '#000000', 0.75);
          D.ring(g, x, y, r * 0.85, '#5b5440', 0.35, 6);
          for (let k = 0; k < 10; k++) { const an = k / 10 * TAU + A.R(-0.2, 0.2); g.globalAlpha = 0.3; g.fillStyle = '#3a3628'; g.beginPath(); g.arc(x + Math.cos(an) * r * 1.05, y + Math.sin(an) * r * 1.05, A.R(3, 8), 0, TAU); g.fill(); }
        }
        g.globalAlpha = 0.35; g.strokeStyle = '#5c584a'; g.lineWidth = 1.5;
        [11.6, 22.4, 26.4].forEach(x => { g.beginPath(); for (let y = P(3); y < P(23); y += 12) g.lineTo(P(x) + ((y / 12) % 2 ? 8 : -8), y); g.stroke(); });
        for (let i = 0; i < 60; i++) { g.globalAlpha = 0.5; g.fillStyle = '#b8902e'; g.fillRect(A.R(P(3), P(35)), A.R(P(3), P(23)), 4, 1.6); }
        D.cracks(g, A, 30, '#000000', 0.45, 1.5);
      },
      glow(g, A) { (A.marks.craters || []).forEach(([x, y, r]) => { for (let k = 0; k < 3; k++) glowSprite(g, x + A.R(-r, r) * 0.4, y + A.R(-r, r) * 0.4, 14, '#ff6a1a', 0.5); }); },
      over(ctx, A, t) {
        const slot = Math.floor(t / 2.3), k = (t / 2.3) - slot;
        if (k < 0.4) {
          const h = hash(slot, 3), side = Math.floor(hash(slot, 9) * 4);
          const x = side < 2 ? P(2 + h * 34) : (side === 2 ? P(1) : P(37)), y = side >= 2 ? P(2 + h * 22) : (side === 0 ? P(1) : P(25));
          glowSprite(ctx, x, y, 520, '#ff9f43', (1 - k / 0.4) * 0.35);
        }
      }
    },

    m10: {
      name: 'Event Horizon', fa: 'افق رویداد', base: 'orbital', size: [34, 34], spawn: [5, 17], boss: [24, 17],
      theme: { floor: '#0f0d1a', floorAlt: '#120f1f', corridor: '#0f0d1a', wall: '#1d1930', wallTop: '#4b3f7a', trim: '#a68bff', darkness: 0.92 },
      shape(A) {
        A.carve((x, y) => oct(x, y, 17, 17, 14.6));
        [[9, 9], [23, 9], [9, 23], [23, 23]].forEach(([x, y]) => A.block(x, y, 2, 2));
      },
      lamps: () => [lamp(17, 17, '#a68bff', 470, 0.85, { pulse: true }), lamp(10, 10, '#3fd0ff', 240, 0.6), lamp(24, 10, '#3fd0ff', 240, 0.6), lamp(10, 24, '#3fd0ff', 240, 0.6), lamp(24, 24, '#3fd0ff', 240, 0.6)],
      deep(g, A) {
        g.globalAlpha = 1; g.fillStyle = '#030208'; g.fillRect(0, 0, P(A.W), P(A.H));
        for (let i = 0; i < 9; i++) D.blot(g, A.R(0, P(A.W)), A.R(0, P(A.H)), A.R(120, 320), i % 2 ? '#3a1d7a' : '#0d3a5a', 0.35);
        for (let i = 0; i < 420; i++) { g.globalAlpha = A.R(0.2, 0.9); g.fillStyle = A.rng() < 0.15 ? '#bfe7ff' : '#ffffff'; const s = A.rng() < 0.08 ? 2.4 : 1.2; g.fillRect(A.R(0, P(A.W)), A.R(0, P(A.H)), s, s); }
      },
      art(g, A) {
        const cx = P(17), cy = P(17);
        for (let arm = 0; arm < 3; arm++) {
          g.beginPath();
          for (let th = 0; th < 9; th += 0.05) { const r = P(1.4) * Math.exp(0.21 * th), an = th + arm * TAU / 3; if (r > P(14)) break; g.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
          g.globalAlpha = 0.16; g.strokeStyle = '#7b5cff'; g.lineWidth = 26; g.stroke();
          g.globalAlpha = 0.25; g.strokeStyle = '#3fd0ff'; g.lineWidth = 2; g.stroke();
        }
        [3, 6, 9.5, 12.5].forEach((r, i) => D.ring(g, cx, cy, P(r), '#a68bff', 0.1, 1.5, i % 2 ? [6, 14] : null));
        D.blot(g, cx, cy, P(2.2), '#000000', 1);
        g.globalAlpha = 1; g.fillStyle = '#000000'; g.beginPath(); g.arc(cx, cy, P(1.3), 0, TAU); g.fill();
        for (let i = 0; i < 160; i++) { g.globalAlpha = A.R(0.15, 0.5); g.fillStyle = '#d6c9ff'; g.fillRect(A.R(P(3), P(31)), A.R(P(3), P(31)), 1.5, 1.5); }
      },
      glow(g, A) {
        const cx = P(17), cy = P(17);
        for (let arm = 0; arm < 3; arm++) {
          g.beginPath();
          for (let th = 0; th < 9; th += 0.05) { const r = P(1.4) * Math.exp(0.21 * th), an = th + arm * TAU / 3; if (r > P(14)) break; g.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
          g.globalAlpha = 0.3; g.strokeStyle = '#3fd0ff'; g.lineWidth = 1.5; g.stroke();
        }
        D.ring(g, cx, cy, P(1.35), '#c9b8ff', 0.8, 3);
      },
      over(ctx, A, t) {
        const cx = P(17), cy = P(17);
        for (let i = 0; i < 46; i++) {
          const ph = (t * 0.12 + i / 46 + hash(i, 1) * 0.3) % 1, r = P(13.5) * (1 - ph) + P(1.3), an = i * 2.39 + ph * 5.5;
          glowSprite(ctx, cx + Math.cos(an) * r, cy + Math.sin(an) * r, 9, i % 3 ? '#a68bff' : '#7fe3ff', 0.55 * Math.sin(ph * Math.PI));
        }
      }
    },

    m13: {
      name: 'Hunting Ground', fa: 'شکارگاه', base: 'jungle', size: [40, 28], spawn: [6, 14], boss: [33, 14],
      theme: { floor: '#141a12', floorAlt: '#161d14', corridor: '#141a12', wall: '#1c2617', wallTop: '#3d5230', trim: '#c7ff5a', darkness: 0.93 },
      shape(A) {
        const n = makeNoise(A.seed + 13, 4);
        A.carve((x, y) => { const dx = (x - 20) / 17.8, dy = (y - 14) / 12.2; return Math.sqrt(dx * dx + dy * dy) + (n(x, y) - 0.5) * 0.42 < 0.97; });
        A.marks.trees = [];
        for (let i = 0; i < 70; i++) {
          const x = A.RI(4, 35), y = A.RI(3, 24);
          if (circ(x, y, 6, 14, 3.5) || circ(x, y, 33, 14, 3.5) || circ(x, y, 20, 14, 4.5) || !A.isF(x, y)) continue;
          if (A.marks.trees.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 3)) continue;
          A.block(x, y, 1, 1); A.marks.trees.push([x, y]);
          if (A.marks.trees.length >= 26) break;
        }
      },
      lamps: () => [lamp(20, 14, '#9fd0ff', 520, 0.45), lamp(12, 8, '#7dff9a', 160, 0.6, { pulse: true }), lamp(28, 20, '#7dff9a', 160, 0.6, { pulse: true }), lamp(27, 7, '#5ae0ff', 160, 0.55, { pulse: true })],
      art(g, A) {
        for (let i = 0; i < 40; i++) D.blot(g, A.R(P(3), P(37)), A.R(P(3), P(25)), A.R(50, 150), i % 3 ? '#2e4a1e' : '#3b5a24', 0.3);
        g.lineCap = 'round';
        (A.marks.trees || []).forEach(([tx, ty]) => {
          const cx = P(tx + 0.5), cy = P(ty + 0.5);
          for (let k = 0; k < 5; k++) {
            const an = A.R(0, TAU), l = A.R(50, 120);
            g.globalAlpha = 0.45; g.strokeStyle = '#2a1e12'; g.lineWidth = A.R(3, 7);
            g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(an + 0.5) * l * 0.5, cy + Math.sin(an + 0.5) * l * 0.5, cx + Math.cos(an) * l, cy + Math.sin(an) * l); g.stroke();
          }
          D.blot(g, cx, cy, 70, '#0a1206', 0.6);
        });
        for (let i = 0; i < 500; i++) { g.globalAlpha = A.R(0.2, 0.5); g.fillStyle = A.rng() < 0.5 ? '#4a5a22' : '#5a4422'; g.save(); g.translate(A.R(P(3), P(37)), A.R(P(3), P(25))); g.rotate(A.R(0, TAU)); g.fillRect(-3, -1.2, 6, 2.4); g.restore(); }
        for (let i = 0; i < 6; i++) {
          const x = A.R(P(14), P(26)), y = A.R(P(8), P(20)), an = A.R(0, TAU);
          g.globalAlpha = 0.35; g.strokeStyle = '#0c0f08'; g.lineWidth = 3;
          for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + Math.cos(an + 1.57) * k * 10, y + Math.sin(an + 1.57) * k * 10); g.lineTo(x + Math.cos(an) * 46 + Math.cos(an + 1.57) * k * 10, y + Math.sin(an) * 46 + Math.sin(an + 1.57) * k * 10); g.stroke(); }
        }
      },
      glow(g, A) {
        (A.marks.trees || []).forEach(([tx, ty], i) => {
          if (i % 2) return;
          for (let k = 0; k < 4; k++) glowSprite(g, P(tx + 0.5) + A.R(-50, 50), P(ty + 0.5) + A.R(-50, 50), 9, i % 4 ? '#5affc8' : '#9dff5a', 0.75);
        });
      },
      over(ctx, A, t) {
        for (let i = 0; i < 42; i++) {
          const bx = P(4 + hash(i, 2) * 32), by = P(3 + hash(i, 5) * 22);
          const x = bx + Math.sin(t * 0.6 + i) * 60 + Math.sin(t * 0.23 + i * 3) * 40, y = by + Math.cos(t * 0.5 + i * 2) * 40;
          const blink = Math.max(0, Math.sin(t * (1.5 + hash(i, 7) * 2) + i * 4));
          glowSprite(ctx, x, y, 10, '#d8ff7a', blink * 0.85);
        }
      }
    },

    m14: {
      name: 'Throne Hall', fa: 'تالار تخت', base: 'citadel', size: [44, 24], spawn: [5, 12], boss: [35, 12],
      theme: { floor: '#1a1620', floorAlt: '#1d1824', corridor: '#1a1620', wall: '#2a2233', wallTop: '#6a5a2e', trim: '#e2bd55', darkness: 0.86 },
      shape(A) {
        A.carve((x, y, tx, ty) => rect(tx, ty, 2, 3, 37, 20) || rect(tx, ty, 38, 7, 41, 16));
        [9, 15, 21, 27, 33].forEach(x => { A.block(x, 6, 2, 2); A.block(x, 16, 2, 2); });
      },
      lamps: () => {
        const l = [lamp(38, 12, '#e2bd55', 440, 0.9)];
        [9, 15, 21, 27, 33].forEach(x => { l.push(lamp(x + 1, 8.6, '#ff9a3a', 230, 0.8, { flicker: 0.35 })); l.push(lamp(x + 1, 15.4, '#ff9a3a', 230, 0.8, { flicker: 0.35 })); });
        return l;
      },
      art(g, A) {
        g.lineCap = 'round';
        for (let i = 0; i < 40; i++) {
          g.globalAlpha = 0.12; g.strokeStyle = '#d8d0e8'; g.lineWidth = A.R(0.8, 2);
          const x = A.R(P(2), P(42)), y = A.R(P(3), P(21));
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + A.R(-80, 80), y + A.R(-60, 60), x + A.R(-120, 120), y + A.R(-60, 60), x + A.R(-200, 200), y + A.R(-90, 90)); g.stroke();
        }
        const y0 = P(10), y1 = P(14);
        g.globalAlpha = 0.6; g.fillStyle = '#4a0f1a'; g.fillRect(P(3), y0, P(38), y1 - y0);
        g.globalAlpha = 0.25; g.fillStyle = '#7a1a2a';
        for (let x = P(3); x < P(41); x += 48) { g.beginPath(); g.moveTo(x, (y0 + y1) / 2); g.lineTo(x + 24, y0 + 18); g.lineTo(x + 48, (y0 + y1) / 2); g.lineTo(x + 24, y1 - 18); g.closePath(); g.fill(); }
        g.globalAlpha = 0.55; g.strokeStyle = '#e2bd55'; g.lineWidth = 3;
        g.strokeRect(P(3) + 6, y0 + 6, P(38) - 12, y1 - y0 - 12);
        g.globalAlpha = 0.3; g.lineWidth = 1; g.strokeRect(P(3) + 12, y0 + 12, P(38) - 24, y1 - y0 - 24);
        for (let s = 0; s < 4; s++) { g.globalAlpha = 0.2 - s * 0.03; g.strokeStyle = '#e2bd55'; g.lineWidth = 3; g.beginPath(); g.moveTo(P(37.2 + s * 0.9), P(7.2)); g.lineTo(P(37.2 + s * 0.9), P(16.8)); g.stroke(); }
        const ex = P(31), ey = P(12);
        D.ring(g, ex, ey, P(2.6), '#e2bd55', 0.25, 3);
        D.ring(g, ex, ey, P(2.2), '#e2bd55', 0.18, 1.5);
        g.save(); g.translate(ex, ey); g.globalAlpha = 0.22; g.fillStyle = '#e2bd55';
        g.beginPath(); for (let i = 0; i < 10; i++) { const an = i / 10 * TAU - Math.PI / 2, r = i % 2 ? P(0.8) : P(1.9); g.lineTo(Math.cos(an) * r, Math.sin(an) * r); } g.closePath(); g.fill(); g.restore();
        D.text(g, 'KNEEL', P(31), P(15.2), 20, '#e2bd55', 0.18);
      },
      glow(g, A) {
        g.globalAlpha = 0.22; g.strokeStyle = '#e2bd55'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(P(3), P(10) + 6); g.lineTo(P(41), P(10) + 6); g.moveTo(P(3), P(14) - 6); g.lineTo(P(41), P(14) - 6); g.stroke();
      },
      over(ctx, A, t) {
        [9, 15, 21, 27, 33].forEach((x, i) => [8.5, 15.5].forEach((y, j) => {
          const cx = P(x + 1), cy = P(y), f = Math.sin(t * 13 + i * 3 + j) * 0.5 + Math.sin(t * 7.3 + i) * 0.5;
          glowSprite(ctx, cx, cy - 6, 46, '#ff7a1a', 0.55 + f * 0.12);
          ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffb03a';
          ctx.beginPath(); ctx.moveTo(cx - 7, cy); ctx.quadraticCurveTo(cx - 6, cy - 14 - f * 4, cx + f * 3, cy - 22 - f * 6); ctx.quadraticCurveTo(cx + 6, cy - 12, cx + 7, cy); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.arc(cx, cy - 4, 3.5, 0, TAU); ctx.fill();
        }));
      }
    },

    m18: {
      name: 'Caldera', fa: 'دهانه‌ی آتشفشان', base: 'magma', size: [38, 30], spawn: [6, 15], boss: [31, 15],
      theme: { floor: '#1c1412', floorAlt: '#1f1614', corridor: '#1c1412', wall: '#2a1c17', wallTop: '#5a3424', trim: '#ff6a1a', darkness: 0.85 },
      shape(A) {
        const n = makeNoise(A.seed + 18, 2.5);
        A.carve((x, y) => (circ(x, y, 19, 15, 10.8) || rrect(x, y, 3.5, 11, 34.5, 19.5, 2) || rrect(x, y, 14, 3, 24.5, 27.5, 2)) && n(x, y) > 0.12);
        [[12, 9], [26, 21], [25, 8], [12, 21]].forEach(([x, y]) => { if (A.isF(x, y)) A.block(x, y, 1, 1); });
      },
      lamps: () => [lamp(19, 15, '#ffb03a', 430, 0.8, { pulse: true }), lamp(6, 15, '#ff6a1a', 300, 0.7), lamp(32, 15, '#ff6a1a', 300, 0.7), lamp(19, 5, '#ff6a1a', 300, 0.7), lamp(19, 25, '#ff6a1a', 300, 0.7)],
      deep(g, A) {
        g.globalAlpha = 1; g.fillStyle = '#2a0904'; g.fillRect(0, 0, P(A.W), P(A.H));
        for (let i = 0; i < 26; i++) D.blot(g, A.R(0, P(A.W)), A.R(0, P(A.H)), A.R(80, 220), '#ff4a10', 0.35);
        g.lineCap = 'round';
        for (let i = 0; i < 40; i++) {
          const x = A.R(0, P(A.W)), y = A.R(0, P(A.H));
          g.globalAlpha = 0.5; g.strokeStyle = A.rng() < 0.5 ? '#ff7a2a' : '#ffb03a'; g.lineWidth = A.R(2, 6);
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + A.R(-120, 120), y + A.R(-120, 120), x + A.R(-160, 160), y + A.R(-160, 160), x + A.R(-220, 220), y + A.R(-220, 220)); g.stroke();
        }
        for (let i = 0; i < 70; i++) {
          const x = A.R(0, P(A.W)), y = A.R(0, P(A.H)), r = A.R(14, 40);
          g.globalAlpha = 0.7; g.fillStyle = '#1a0a06'; g.beginPath();
          for (let k = 0; k < 6; k++) { const an = k / 6 * TAU + A.R(-0.3, 0.3); g.lineTo(x + Math.cos(an) * r * A.R(0.7, 1.1), y + Math.sin(an) * r * A.R(0.7, 1.1)); }
          g.closePath(); g.fill();
        }
      },
      deepGlow(g, A) {
        for (let i = 0; i < 30; i++) D.blot(g, A.R(0, P(A.W)), A.R(0, P(A.H)), A.R(90, 200), '#ff5a1a', 0.3);
      },
      art(g, A) {
        D.grime(g, A, 40, '#000000', 0.45, 40, 140);
        D.cracks(g, A, 40, '#0a0605', 0.7, 2.5, 40);
        for (let i = 0; i < 300; i++) { g.globalAlpha = A.R(0.15, 0.4); g.fillStyle = '#8a8078'; g.fillRect(A.R(P(3), P(35)), A.R(P(3), P(27)), 1.6, 1.6); }
        D.ring(g, P(19), P(15), P(4), '#ff6a1a', 0.12, 3, [10, 16]);
      },
      glow(g, A) {
        const save = A.rng;
        D.cracks(g, A, 16, '#ff6a1a', 0.45, 1.6, 30);
        void save;
      },
      over(ctx, A, t) {
        const e = A.marks.emberSrc || (A.marks.emberSrc = (() => {
          const out = [];
          for (let i = 0; i < 400 && out.length < 40; i++) { const x = A.RI(1, A.W - 2), y = A.RI(1, A.H - 2); if (!A.isF(x, y) && (A.isF(x + 2, y) || A.isF(x - 2, y) || A.isF(x, y + 2) || A.isF(x, y - 2))) out.push([P(x + 0.5), P(y + 0.5)]); }
          return out;
        })());
        e.forEach(([x, y], i) => {
          const ph = (t * (0.25 + hash(i, 4) * 0.3) + hash(i, 8)) % 1;
          glowSprite(ctx, x + Math.sin(t * 2 + i) * 14, y - ph * 160, 8, ph < 0.5 ? '#ffd36a' : '#ff6a1a', (1 - ph) * 0.9);
        });
      }
    },

    c3: {
      name: 'Twin Reactor', fa: 'راکتور دوقلو', base: 'datacore', size: [42, 26], spawn: [5, 13], boss: [21, 13],
      theme: { floor: '#10151c', floorAlt: '#121820', corridor: '#10151c', wall: '#1b222c', wallTop: '#3c4a5c', trim: '#7fe3ff', darkness: 0.9 },
      shape(A) { A.carve((x, y) => circ(x, y, 13.5, 13, 10.4) || circ(x, y, 28.5, 13, 10.4) || rect(x, y, 13, 8.6, 29, 17.4)); },
      lamps: () => [lamp(13.5, 13, '#3fd8ff', 460, 0.85), lamp(28.5, 13, '#ff3b5c', 460, 0.85), lamp(21, 13, '#e8f6ff', 220, 0.6, { pulse: true })],
      art(g, A) {
        D.grime(g, A, 26, '#000000', 0.35, 30, 120);
        [[13.5, '#3fd8ff'], [28.5, '#ff3b5c']].forEach(([x, c]) => {
          const cx = P(x), cy = P(13);
          [2, 4, 6.5, 9].forEach((r, i) => D.ring(g, cx, cy, P(r), c, 0.12 + (i % 2) * 0.05, i % 2 ? 4 : 1.5, i === 2 ? [20, 10] : null));
          D.ticks(g, cx, cy, P(2.1), P(9), 12, c, 0.06, 2);
        });
        g.globalAlpha = 0.25; g.strokeStyle = '#e8f6ff'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(P(21), P(3)); g.bezierCurveTo(P(17), P(9), P(25), P(17), P(21), P(23)); g.stroke();
        D.text(g, 'CORE-A', P(13.5), P(13), 28, '#3fd8ff', 0.15);
        D.text(g, 'CORE-B', P(28.5), P(13), 28, '#ff3b5c', 0.15);
        D.edgeStripes(g, A, '#7fe3ff', 0.06);
      },
      glow(g, A) { D.ring(g, P(13.5), P(13), P(2), '#3fd8ff', 0.6, 3); D.ring(g, P(28.5), P(13), P(2), '#ff3b5c', 0.6, 3); },
      over(ctx, A, t) {
        [[13.5, '#3fd8ff', 1], [28.5, '#ff3b5c', -1]].forEach(([x, c, d]) => {
          const cx = P(x), cy = P(13);
          ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.globalAlpha = 0.25;
          for (let i = 0; i < 3; i++) { const a = t * 0.8 * d + i * TAU / 3; ctx.beginPath(); ctx.arc(cx, cy, P(4), a, a + 0.9); ctx.stroke(); }
          ctx.lineWidth = 2; ctx.globalAlpha = 0.18;
          for (let i = 0; i < 4; i++) { const a = -t * 0.5 * d + i * TAU / 4; ctx.beginPath(); ctx.arc(cx, cy, P(9), a, a + 0.6); ctx.stroke(); }
        });
      }
    },

    m23: {
      name: 'Ossuary Crypt', fa: 'سردابه‌ی استخوان', base: 'citadel', size: [40, 26], spawn: [5, 13], boss: [33, 13],
      theme: { floor: '#141613', floorAlt: '#171915', corridor: '#141613', wall: '#20231e', wallTop: '#4a5243', trim: '#5dffa0', darkness: 0.94 },
      shape(A) {
        A.carve((x, y, tx, ty) => rect(tx, ty, 2, 2, 37, 23));
        [8, 14, 20, 26, 32].forEach(x => { A.block(x, 2, 1, 2); A.block(x, 22, 1, 2); });
        [[12, 8], [12, 17], [26, 8], [26, 17]].forEach(([x, y]) => A.block(x, y, 2, 1));
      },
      lamps: () => {
        const l = [lamp(19.5, 13, '#5dffa0', 320, 0.75, { pulse: true })];
        [5, 11, 17, 23, 29, 35].forEach(x => { l.push(lamp(x, 2.7, '#ffd27a', 140, 0.75, { flicker: 0.6 })); l.push(lamp(x, 23.3, '#ffd27a', 140, 0.75, { flicker: 0.6 })); });
        return l;
      },
      art(g, A) {
        g.globalAlpha = 0.35; g.strokeStyle = '#0a0b09'; g.lineWidth = 2;
        for (let y = 2; y < 24; y += 1.5) { g.beginPath(); g.moveTo(P(2), P(y)); g.lineTo(P(38), P(y)); g.stroke(); const off = (y * 2) % 2 ? 0.75 : 0; for (let x = 2 + off; x < 38; x += 1.5) { g.beginPath(); g.moveTo(P(x), P(y)); g.lineTo(P(x), P(y + 1.5)); g.stroke(); } }
        D.cracks(g, A, 30, '#050605', 0.55, 1.5);
        D.grime(g, A, 30, '#1f3a26', 0.25, 40, 120);
        for (let i = 0; i < 26; i++) {
          const side = i % 2, x = A.R(P(3), P(37)), y = side ? A.R(P(20.5), P(22.8)) : A.R(P(3.2), P(5.5));
          for (let k = 0; k < 6; k++) { g.globalAlpha = 0.5; g.fillStyle = '#cfc8b4'; g.save(); g.translate(x + A.R(-20, 20), y + A.R(-10, 10)); g.rotate(A.R(0, TAU)); g.fillRect(-9, -2, 18, 4); g.beginPath(); g.arc(-9, 0, 3, 0, TAU); g.arc(9, 0, 3, 0, TAU); g.fill(); g.restore(); }
          if (i % 3 === 0) { g.globalAlpha = 0.6; g.fillStyle = '#d8d2c0'; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill(); g.fillStyle = '#0a0b09'; g.beginPath(); g.arc(x - 3.5, y - 1, 2.5, 0, TAU); g.arc(x + 3.5, y - 1, 2.5, 0, TAU); g.fill(); g.fillRect(x - 3, y + 4, 6, 2); }
        }
        const cx = P(19.5), cy = P(13);
        D.ring(g, cx, cy, P(4.2), '#5dffa0', 0.2, 3); D.ring(g, cx, cy, P(3.6), '#5dffa0', 0.14, 1.5);
        g.globalAlpha = 0.16; g.strokeStyle = '#5dffa0'; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i < 5; i++) { const a0 = -Math.PI / 2 + i * TAU * 2 / 5; g.lineTo(cx + Math.cos(a0) * P(3.6), cy + Math.sin(a0) * P(3.6)); } g.closePath(); g.stroke();
        const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒ';
        for (let i = 0; i < runes.length; i++) { const an = i / runes.length * TAU; D.text(g, runes[i], cx + Math.cos(an) * P(3.9), cy + Math.sin(an) * P(3.9), 22, '#5dffa0', 0.3, an + Math.PI / 2, '400 '); }
      },
      glow(g, A) {
        const cx = P(19.5), cy = P(13);
        D.ring(g, cx, cy, P(4.2), '#5dffa0', 0.35, 2);
        [5, 11, 17, 23, 29, 35].forEach(x => { glowSprite(g, P(x), P(2.4), 10, '#ffe08a', 0.9); glowSprite(g, P(x), P(23.6), 10, '#ffe08a', 0.9); });
      },
      over(ctx, A, t) {
        for (let i = 0; i < 9; i++) {
          const x = P(2) + ((t * (12 + i * 3) + hash(i, 1) * P(36)) % P(36)), y = P(4 + hash(i, 2) * 18) + Math.sin(t * 0.3 + i) * 40;
          ctx.globalCompositeOperation = 'source-over';
          if (BO.softSprite) { ctx.globalAlpha = 0.07; ctx.drawImage(BO.softSprite('#9ab8a0'), x - 220, y - 120, 440, 240); }
        }
        ctx.globalCompositeOperation = 'lighter';
        const cx = P(19.5), cy = P(13);
        glowSprite(ctx, cx, cy, P(4.6), '#2fbf6a', 0.12 + Math.sin(t * 1.7) * 0.05);
      }
    },

    m24: {
      name: 'Storm Spire', fa: 'قله‌ی طوفان', base: 'frost', size: [36, 36], spawn: [6, 18], boss: [29, 18],
      theme: { floor: '#141a22', floorAlt: '#171e27', corridor: '#141a22', wall: '#1e2733', wallTop: '#4a6078', trim: '#7fd4ff', darkness: 0.9 },
      shape(A) {
        A.carve((x, y) => diamond(x, y, 18, 18, 15.4) && rect(x, y, 3, 3, 33, 33));
        [[11, 18], [25, 18], [18, 11], [18, 25]].forEach(([x, y]) => A.block(x, y, 1, 1));
      },
      lamps: () => [lamp(18, 18, '#bfefff', 400, 0.7), lamp(11.5, 18.5, '#7fd4ff', 220, 0.75, { pulse: true }), lamp(25.5, 18.5, '#7fd4ff', 220, 0.75, { pulse: true }), lamp(18.5, 11.5, '#7fd4ff', 220, 0.75, { pulse: true }), lamp(18.5, 25.5, '#7fd4ff', 220, 0.75, { pulse: true })],
      deep(g, A) {
        g.globalAlpha = 1; g.fillStyle = '#05080e'; g.fillRect(0, 0, P(A.W), P(A.H));
        for (let i = 0; i < 40; i++) D.blot(g, A.R(0, P(A.W)), A.R(0, P(A.H)), A.R(90, 260), i % 4 ? '#2a3546' : '#45546a', 0.45);
      },
      art(g, A) {
        g.globalAlpha = 0.25; g.strokeStyle = '#0a0e14'; g.lineWidth = 3;
        for (let k = 3; k <= 33; k += 2) { g.beginPath(); g.moveTo(P(k), P(3)); g.lineTo(P(k), P(33)); g.moveTo(P(3), P(k)); g.lineTo(P(33), P(k)); g.stroke(); }
        g.fillStyle = '#4a6078';
        for (let y = 3; y <= 33; y += 2) for (let x = 3; x <= 33; x += 2) { g.globalAlpha = 0.25; g.beginPath(); g.arc(P(x) + 8, P(y) + 8, 2, 0, TAU); g.fill(); }
        for (let i = 0; i < 14; i++) {
          const x = A.R(P(8), P(28)), y = A.R(P(8), P(28)), rx = A.R(30, 80), ry = rx * A.R(0.4, 0.7);
          g.globalAlpha = 0.4; g.fillStyle = '#0d1e2e'; g.beginPath(); g.ellipse(x, y, rx, ry, A.R(0, 3), 0, TAU); g.fill();
          g.globalAlpha = 0.25; g.strokeStyle = '#9fd8ff'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, rx * 0.8, ry * 0.7, 0, 3.6, 4.6); g.stroke();
        }
        [[11.5, 18.5], [25.5, 18.5], [18.5, 11.5], [18.5, 25.5]].forEach(([x, y]) => { D.ring(g, P(x), P(y), P(1.6), '#f0be3d', 0.25, 4, [10, 8]); D.blot(g, P(x), P(y), P(1.4), '#000000', 0.5); });
        D.cracks(g, A, 16, '#000000', 0.4, 1.4);
      },
      glow(g, A) { [[11.5, 18.5], [25.5, 18.5], [18.5, 11.5], [18.5, 25.5]].forEach(([x, y]) => glowSprite(g, P(x), P(y), 30, '#bfefff', 0.8)); },
      over(ctx, A, t) {
        const vr = BO.game && BO.game.camera && BO.game.camera.visibleRect ? BO.game.camera.visibleRect(0) : { x0: 0, y0: 0, x1: P(A.W), y1: P(A.H) };
        ctx.strokeStyle = '#9fc8e8'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.22;
        ctx.beginPath();
        const W = vr.x1 - vr.x0 + 200, H = vr.y1 - vr.y0;
        for (let i = 0; i < 110; i++) {
          const x = vr.x0 + ((hash(i, 1) * W + t * 140) % W) - 100, y = vr.y0 + ((hash(i, 2) * H + t * 900 * (0.8 + hash(i, 3) * 0.4)) % H);
          ctx.moveTo(x, y); ctx.lineTo(x - 7, y - 22);
        }
        ctx.stroke();
        const slot = Math.floor(t / 4.1), k = t / 4.1 - slot;
        if (k < 0.12 && hash(slot, 6) > 0.35) {
          const bx = P(2 + hash(slot, 1) * 32), by = P(2 + hash(slot, 2) * 32);
          glowSprite(ctx, bx, by, 900, '#bfefff', (1 - k / 0.12) * 0.35);
          ctx.globalAlpha = (1 - k / 0.12) * 0.9; ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 3;
          ctx.beginPath(); let x = bx, y = by - 600; ctx.moveTo(x, y);
          for (let s = 0; s < 9; s++) { x += (hash(slot, s + 10) - 0.5) * 90; y += 66; ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }
    },

    x1: {
      name: 'Clocktower', fa: 'برج ساعت', base: 'industrial', size: [34, 34], spawn: [5, 17], boss: [27, 17],
      theme: { floor: '#1a1712', floorAlt: '#1d1a14', corridor: '#1a1712', wall: '#2a241a', wallTop: '#6e5a34', trim: '#ffcf8a', darkness: 0.88 },
      shape(A) {
        A.carve((x, y) => circ(x, y, 17, 17, 14.7));
        [45, 135, 225, 315].forEach(d => { const an = d * Math.PI / 180; A.block(Math.round(17 + Math.cos(an) * 7.2 - 1), Math.round(17 + Math.sin(an) * 7.2 - 1), 2, 2); });
      },
      lamps: () => [lamp(17, 17, '#ffcf8a', 470, 0.85), lamp(11.5, 11.5, '#ffb347', 230, 0.65), lamp(22.5, 11.5, '#ffb347', 230, 0.65), lamp(11.5, 22.5, '#ffb347', 230, 0.65), lamp(22.5, 22.5, '#ffb347', 230, 0.65)],
      art(g, A) {
        const cx = P(17), cy = P(17);
        D.grime(g, A, 26, '#000000', 0.35, 40, 130);
        [[P(9), P(9), P(3.6), 18, 0.2], [P(25), P(25), P(4.2), 22, 0.6], [P(26), P(9.5), P(2.6), 14, 1.1], [P(8.5), P(25), P(3), 16, 0.4]].forEach(([x, y, r, n, rot]) => D.gear(g, x, y, r, n, '#6e5a34', 0.3, 5, rot));
        D.ring(g, cx, cy, P(13.7), '#ffcf8a', 0.3, 5); D.ring(g, cx, cy, P(13.1), '#ffcf8a', 0.18, 1.5);
        D.ticks(g, cx, cy, P(12.6), P(13.1), 60, '#ffcf8a', 0.25, 2);
        D.ticks(g, cx, cy, P(12.2), P(13.1), 12, '#ffcf8a', 0.4, 6);
        const NUM = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
        NUM.forEach((s, i) => { const an = -Math.PI / 2 + i / 12 * TAU; D.text(g, s, cx + Math.cos(an) * P(11.3), cy + Math.sin(an) * P(11.3), 46, '#ffcf8a', 0.22, an + Math.PI / 2, '700 '); });
        D.ring(g, cx, cy, P(4), '#ffcf8a', 0.2, 3);
        g.save(); g.translate(cx, cy); g.globalAlpha = 0.12; g.fillStyle = '#ffcf8a';
        for (let i = 0; i < 12; i++) { g.rotate(TAU / 12); g.beginPath(); g.ellipse(P(1.8), 0, P(1.6), P(0.45), 0, 0, TAU); g.fill(); }
        g.restore();
        D.text(g, 'TEMPUS EDAX RERUM', cx, cy + P(6.4), 24, '#ffcf8a', 0.14);
        D.cracks(g, A, 18, '#000000', 0.4, 1.4);
      },
      glow(g, A) {
        const cx = P(17), cy = P(17);
        D.ticks(g, cx, cy, P(12.3), P(13.1), 12, '#ffcf8a', 0.45, 3);
        glowSprite(g, cx, cy, P(1.2), '#ffcf8a', 0.5);
      },
      under(ctx, A, t) {
        const cx = P(17), cy = P(17), hA = -Math.PI / 2 + t * 0.02, mA = -Math.PI / 2 + t * 0.14;
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#5a4824';
        [[hA, P(7), 22], [mA, P(10.5), 12]].forEach(([a, l, w]) => {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(-P(1), -w / 2); ctx.lineTo(l * 0.85, -w / 2); ctx.lineTo(l, 0); ctx.lineTo(l * 0.85, w / 2); ctx.lineTo(-P(1), w / 2); ctx.closePath(); ctx.fill();
          ctx.restore();
        });
        ctx.globalAlpha = 0.45; ctx.fillStyle = '#7a6438'; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, TAU); ctx.fill();
      }
    },

    x2: {
      name: 'Brood Nest', fa: 'لانه‌ی تخم‌ها', base: 'jungle', size: [40, 30], spawn: [6, 15], boss: [32, 15],
      theme: { floor: '#17121a', floorAlt: '#1a141d', corridor: '#17121a', wall: '#24182a', wallTop: '#5a3d63', trim: '#b6ff3a', darkness: 0.93 },
      shape(A) {
        const n = makeNoise(A.seed + 22, 3.5);
        A.carve((x, y) => { const dx = (x - 20) / 17.8, dy = (y - 15) / 13.2; return Math.sqrt(dx * dx + dy * dy) + (n(x, y) - 0.5) * 0.38 < 0.96; });
        [[13, 8], [26, 20], [25, 8]].forEach(([x, y]) => A.block(x, y, 2, 2));
        for (let i = 0; i < 200 && A.eggs.length < 22; i++) {
          const x = A.RI(3, 36), y = A.RI(3, 26);
          if (!A.isF(x, y) || !D.solidNear(A, x, y) || circ(x, y, 6, 15, 3.5) || circ(x, y, 32, 15, 3.5)) continue;
          A.block(x, y, 1, 1); A.eggs.push([x, y]);
        }
      },
      lamps: A => [lamp(20, 15, '#d18bff', 420, 0.55)].concat(A.eggs.filter((e, i) => i % 5 === 0).map(([x, y]) => lamp(x + 0.5, y + 0.5, '#b6ff3a', 200, 0.7, { pulse: true }))),
      art(g, A) {
        const s = 40, h = s * Math.sqrt(3);
        g.globalAlpha = 0.16; g.strokeStyle = '#6a4a20'; g.lineWidth = 2.5;
        for (let y = 0; y < P(A.H) + h; y += h) for (let x = 0; x < P(A.W) + s * 3; x += s * 3) {
          [[x, y], [x + s * 1.5, y + h / 2]].forEach(([hx, hy]) => { g.beginPath(); for (let k = 0; k < 6; k++) { const an = k / 6 * TAU; g.lineTo(hx + Math.cos(an) * s, hy + Math.sin(an) * s); } g.closePath(); g.stroke(); });
        }
        for (let i = 0; i < 30; i++) D.blot(g, A.R(P(3), P(37)), A.R(P(3), P(27)), A.R(40, 120), i % 2 ? '#7a5a1a' : '#3a2a4a', 0.28);
        g.lineCap = 'round';
        for (let i = 0; i < 14; i++) {
          const x = A.R(P(4), P(36)), y = A.R(P(4), P(26));
          g.globalAlpha = 0.22; g.strokeStyle = '#7aa02a'; g.lineWidth = A.R(6, 14);
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + A.R(-150, 150), y + A.R(-150, 150), x + A.R(-200, 200), y + A.R(-200, 200), x + A.R(-260, 260), y + A.R(-260, 260)); g.stroke();
        }
        A.eggs.forEach(([x, y]) => D.blot(g, P(x + 0.5), P(y + 0.5), 80, '#2a3a0a', 0.6));
      },
      glow(g, A) { A.eggs.forEach(([x, y]) => glowSprite(g, P(x + 0.5), P(y + 0.5), 40, '#b6ff3a', 0.45)); },
      over(ctx, A, t) {
        A.eggs.forEach(([x, y], i) => glowSprite(ctx, P(x + 0.5), P(y + 0.5), 36, '#d4ff6a', 0.25 + Math.sin(t * 2.2 + i) * 0.2));
        for (let i = 0; i < 36; i++) {
          const ph = (t * 0.05 + hash(i, 3)) % 1, x = P(4 + hash(i, 1) * 32) + Math.sin(t * 0.7 + i) * 30, y = P(26 - ph * 22);
          glowSprite(ctx, x, y, 7, '#e8ffa0', Math.sin(ph * Math.PI) * 0.6);
        }
      }
    },

    x3: {
      name: 'Crystal Gallery', fa: 'تالار بلور', base: 'datacore', size: [38, 32], spawn: [6, 16], boss: [30, 16],
      theme: { floor: '#12141c', floorAlt: '#151824', corridor: '#12141c', wall: '#1c2030', wallTop: '#5a6a9a', trim: '#9ef0ff', darkness: 0.9 },
      shape(A) {
        A.carve((x, y) => hexF(x, y, 19, 16, 15.8));
        A.marks.crystals = [];
        [[12, 10], [26, 10], [19, 23]].forEach(([x, y]) => [[0, 0], [1, 0], [0, 1]].forEach(([dx, dy]) => { A.block(x + dx, y + dy, 1, 1); A.marks.crystals.push([x + dx, y + dy]); }));
      },
      lamps: () => [lamp(19, 16, '#ff9ef0', 320, 0.6, { pulse: true }), lamp(12.5, 10.5, '#9ef0ff', 300, 0.75), lamp(26.5, 10.5, '#9ef0ff', 300, 0.75), lamp(19.5, 23.5, '#9ef0ff', 300, 0.75)],
      art(g, A) {
        g.lineCap = 'round';
        for (let i = 0; i < 26; i++) {
          const x = A.R(0, P(A.W)), y = A.R(0, P(A.H)), l = A.R(200, 600);
          g.globalAlpha = 0.05; g.strokeStyle = '#ffffff'; g.lineWidth = A.R(6, 26);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(-0.52) * l, y + Math.sin(-0.52) * l); g.stroke();
        }
        g.globalAlpha = 0.08; g.strokeStyle = '#9ef0ff'; g.lineWidth = 1;
        for (let k = -40; k < 80; k++) { g.beginPath(); g.moveTo(P(k * 1.5), 0); g.lineTo(P(k * 1.5) + P(A.H) * 0.577, P(A.H)); g.moveTo(P(k * 1.5), 0); g.lineTo(P(k * 1.5) - P(A.H) * 0.577, P(A.H)); g.stroke(); }
        const HUES = ['#ff5a6e', '#ffb347', '#ffe27a', '#7dff9a', '#5ae0ff', '#7b8bff', '#d18bff'];
        [[13, 11], [27, 11], [20, 24]].forEach(([x, y]) => HUES.forEach((c, i) => { g.globalAlpha = 0.09; g.strokeStyle = c; g.lineWidth = 9; g.beginPath(); g.arc(P(x), P(y), P(2.4) + i * 9, -0.9, 0.9); g.stroke(); }));
        D.ticks(g, P(19), P(16), P(1.5), P(14), 24, '#ffffff', 0.04, 3);
      },
      glow(g, A) {
        (A.marks.crystals || []).forEach(([x, y], i) => {
          g.globalAlpha = 0.5; g.strokeStyle = i % 2 ? '#9ef0ff' : '#ff9ef0'; g.lineWidth = 2;
          g.strokeRect(P(x) + 3, P(y) + 3, TILE - 6, TILE - 6);
          glowSprite(g, P(x + 0.5), P(y + 0.5), 46, '#9ef0ff', 0.35);
        });
      },
      over(ctx, A, t) {
        const cx = P(19), cy = P(16), HUES = ['#ff5a6e', '#ffe27a', '#7dff9a', '#5ae0ff', '#d18bff'];
        for (let b = 0; b < 3; b++) {
          const an = t * 0.12 + b * TAU / 3;
          HUES.forEach((c, i) => {
            ctx.globalAlpha = 0.045; ctx.fillStyle = c;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, P(15), an + i * 0.05, an + i * 0.05 + 0.05); ctx.closePath(); ctx.fill();
          });
        }
        for (let i = 0; i < 16; i++) {
          const k = (t * 0.8 + hash(i, 4)) % 1;
          glowSprite(ctx, P(5 + hash(i, 1) * 28), P(4 + hash(i, 2) * 24), 12, '#ffffff', Math.max(0, Math.sin(k * Math.PI)) * 0.9 * (k < 0.25 ? 1 : 0));
        }
      }
    },

    x4: {
      name: 'Flooded Cistern', fa: 'آب‌انبار سیل‌زده', base: 'outpost', size: [44, 26], spawn: [5, 13], boss: [37, 13],
      theme: { floor: '#121a1c', floorAlt: '#141d20', corridor: '#121a1c', wall: '#1b2629', wallTop: '#3e5a5e', trim: '#3fe0c5', darkness: 0.92 },
      shape(A) {
        A.carve((x, y) => rrect(x, y, 2, 2, 42, 24, 3));
        [11, 21, 31].forEach(x => { A.block(x, 5, 2, 2); A.block(x, 19, 2, 2); });
      },
      lamps: () => [lamp(22, 13, '#9fd8ff', 430, 0.6), lamp(12, 9.5, '#3fe0c5', 240, 0.7, { pulse: true }), lamp(32, 16.5, '#3fe0c5', 240, 0.7, { pulse: true }), lamp(22, 4, '#3fe0c5', 200, 0.6), lamp(22, 22, '#3fe0c5', 200, 0.6)],
      art(g, A) {
        g.globalAlpha = 0.3; g.strokeStyle = '#0a1012'; g.lineWidth = 2;
        for (let y = 2; y < 24; y += 1) { g.beginPath(); g.moveTo(P(2), P(y)); g.lineTo(P(42), P(y)); g.stroke(); for (let x = 2 + (y % 2) * 1; x < 42; x += 2) { g.beginPath(); g.moveTo(P(x), P(y)); g.lineTo(P(x), P(y + 1)); g.stroke(); } }
        [[9, 11], [15, 17]].forEach(([y0, y1]) => {
          const gr = g.createLinearGradient(0, P(y0), 0, P(y1));
          gr.addColorStop(0, 'rgba(20,90,100,0)'); gr.addColorStop(0.15, 'rgba(20,90,100,0.45)'); gr.addColorStop(0.85, 'rgba(20,90,100,0.45)'); gr.addColorStop(1, 'rgba(20,90,100,0)');
          g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(P(2), P(y0), P(40), P(y1 - y0));
        });
        for (let i = 0; i < 40; i++) D.blot(g, A.R(P(3), P(41)), A.R(P(3), P(23)), A.R(30, 100), '#1f4a2a', 0.3);
        for (let i = 0; i < 6; i++) { const x = P(5 + i * 7), y = i % 2 ? P(3.4) : P(22.6); g.globalAlpha = 0.6; g.fillStyle = '#05090a'; g.fillRect(x - 26, y - 14, 52, 28); g.globalAlpha = 0.2; g.fillStyle = '#8aa8a8'; for (let k = -20; k <= 20; k += 8) g.fillRect(x + k, y - 12, 3, 24); }
        D.cracks(g, A, 22, '#000000', 0.4, 1.5);
      },
      glow(g, A) { for (let i = 0; i < 70; i++) glowSprite(g, A.R(P(3), P(41)), A.R(P(3), P(23)), 6, '#3fe0c5', 0.6); },
      under(ctx, A, t) {
        [[9, 11], [15, 17]].forEach(([y0, y1], j) => {
          ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 2;
          for (let k = 0; k < 4; k++) {
            const yy = P(y0) + (k + 0.5) / 4 * P(y1 - y0);
            ctx.globalAlpha = 0.12; ctx.beginPath();
            for (let x = P(2); x <= P(42); x += 24) ctx.lineTo(x, yy + Math.sin(x * 0.012 + t * (1.6 + k * 0.3) * (j ? -1 : 1)) * 7);
            ctx.stroke();
          }
        });
      },
      over(ctx, A, t) {
        for (let i = 0; i < 10; i++) {
          const per = 2.2 + hash(i, 1) * 2, ph = ((t + hash(i, 2) * per) % per) / per, slot = Math.floor((t + hash(i, 2) * per) / per);
          const x = P(3 + hash(slot, i) * 38), y = i % 2 ? P(9.3 + hash(slot, i + 9) * 1.4) : P(15.3 + hash(slot, i + 5) * 1.4);
          ctx.globalAlpha = (1 - ph) * 0.5; ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(x, y, 6 + ph * 46, (6 + ph * 46) * 0.45, 0, 0, TAU); ctx.stroke();
        }
      }
    },

    x5: {
      name: 'Corrupted Core', fa: 'هسته‌ی آلوده', base: 'datacore', size: [38, 28], spawn: [5, 14], boss: [31, 14],
      theme: { floor: '#0d0b14', floorAlt: '#100d18', corridor: '#0d0b14', wall: '#1a1426', wallTop: '#5a2a6a', trim: '#ff2bd6', darkness: 0.9 },
      shape(A) {
        A.carve((x, y, tx, ty) => rect(tx, ty, 2, 2, 35, 25));
        for (let y = 2; y <= 25; y++) for (let x = 2; x <= 35; x++) {
          if (circ(x, y, 19, 14, 7) || circ(x, y, 5, 14, 3.2) || circ(x, y, 31, 14, 3.2)) continue;
          if (hash(x, y, A.seed % 97) > 0.86) A.setS(x, y);
        }
        [[10, 5], [27, 5], [10, 20], [27, 20]].forEach(([x, y]) => A.block(x, y, 1, 3));
      },
      lamps: () => [lamp(19, 14, '#00f0ff', 420, 0.75, { pulse: true }), lamp(10.5, 6.5, '#ff2bd6', 280, 0.75), lamp(27.5, 6.5, '#ff2bd6', 280, 0.75), lamp(10.5, 21.5, '#ff2bd6', 280, 0.75), lamp(27.5, 21.5, '#ff2bd6', 280, 0.75)],
      deep(g, A) {
        g.globalAlpha = 1; g.fillStyle = '#030206'; g.fillRect(0, 0, P(A.W), P(A.H));
        g.font = '700 14px "Courier New", monospace';
        for (let x = 0; x < P(A.W); x += 18) for (let y = 0; y < P(A.H); y += 18) { if (A.rng() < 0.55) continue; g.globalAlpha = A.R(0.05, 0.3); g.fillStyle = A.rng() < 0.8 ? '#00f0ff' : '#ff2bd6'; g.fillText(A.rng() < 0.5 ? '0' : '1', x, y); }
      },
      art(g, A) {
        g.lineWidth = 1;
        for (let x = 2; x <= 36; x++) { g.globalAlpha = x % 4 ? 0.08 : 0.2; g.strokeStyle = x % 4 ? '#00f0ff' : '#ff2bd6'; g.beginPath(); g.moveTo(P(x), P(2)); g.lineTo(P(x), P(26)); g.stroke(); }
        for (let y = 2; y <= 26; y++) { g.globalAlpha = y % 4 ? 0.08 : 0.2; g.strokeStyle = y % 4 ? '#00f0ff' : '#ff2bd6'; g.beginPath(); g.moveTo(P(2), P(y)); g.lineTo(P(36), P(y)); g.stroke(); }
        A.marks.nodes = [];
        for (let i = 0; i < 22; i++) {
          let x = A.RI(3, 34) * TILE + TILE / 2, y = A.RI(3, 24) * TILE + TILE / 2;
          g.globalAlpha = 0.28; g.strokeStyle = i % 3 ? '#00f0ff' : '#ff2bd6'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 5; s++) { if (A.rng() < 0.5) x += (A.rng() < 0.5 ? -1 : 1) * A.RI(1, 3) * TILE; else y += (A.rng() < 0.5 ? -1 : 1) * A.RI(1, 3) * TILE; g.lineTo(x, y); }
          g.stroke(); A.marks.nodes.push([x, y]);
          g.globalAlpha = 0.5; g.fillStyle = g.strokeStyle; g.fillRect(x - 4, y - 4, 8, 8);
        }
        const hex = '0123456789ABCDEF';
        for (let i = 0; i < 40; i++) { let s = '0x'; for (let k = 0; k < 8; k++) s += hex[A.RI(0, 15)]; D.text(g, s, A.R(P(3), P(35)), A.R(P(3), P(25)), 12, '#00f0ff', 0.12, 0, '400 '); }
        D.text(g, 'ERR 0x00F // SECTOR NULL', P(19), P(3.2), 30, '#ff2bd6', 0.14);
      },
      glow(g, A) {
        for (let x = 4; x <= 36; x += 4) { g.globalAlpha = 0.18; g.strokeStyle = '#ff2bd6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(P(x), P(2)); g.lineTo(P(x), P(26)); g.stroke(); }
        (A.marks.nodes || []).forEach(([x, y]) => glowSprite(g, x, y, 16, '#00f0ff', 0.6));
      },
      over(ctx, A, t) {
        const y = P(2) + ((t / 4) % 1) * P(24);
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#00f0ff'; ctx.fillRect(P(2), y, P(34), 3);
        ctx.globalAlpha = 0.06; ctx.fillRect(P(2), y - 30, P(34), 30);
        const slot = Math.floor(t * 9);
        for (let i = 0; i < 6; i++) {
          if (hash(slot, i) < 0.5) continue;
          ctx.globalAlpha = 0.12; ctx.fillStyle = i % 2 ? '#ff2bd6' : '#00f0ff';
          ctx.fillRect(P(3 + hash(slot, i + 1) * 30), P(3 + hash(slot, i + 2) * 22), 20 + hash(slot, i + 3) * 160, 4 + hash(slot, i + 4) * 22);
        }
      }
    }
  };
  LA.STYLES = STYLES;
  LA.ORDER = ['m3', 'm5', 'm8', 'm10', 'm13', 'm14', 'm18', 'c3', 'm23', 'm24', 'x1', 'x2', 'x3', 'x4', 'x5'];

  /* ------------------------------ Builder ------------------------------ */
  function boundsOf(A) {
    let x0 = A.W, y0 = A.H, x1 = 0, y1 = 0;
    D.floorTiles(A, (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    return { x0, y0, x1, y1 };
  }

  function paintLayers(A, st) {
    if (!hasDoc) return null;
    const mk = () => { const c = document.createElement('canvas'); c.width = P(A.W); c.height = P(A.H); return c; };
    const under = mk(), glowC = mk();
    const gu = under.getContext('2d'), gg = glowC.getContext('2d');
    if (!gu || !gg) return null;
    const rngSave = A.rng;
    const run = (g, fn, clipper) => {
      if (!fn) return;
      g.save();
      if (clipper) clipper(g, A);
      try { fn(g, A); } catch (e) { U.reportError && U.reportError('labArena.paint', e); }
      g.restore();
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setLineDash([]);
    };
    run(gu, st.deep, D.deepClip);
    run(gu, st.art, D.floorClip);
    A.rng = U.makeRng(A.seed + 4242);
    run(gg, st.deepGlow, D.deepClip);
    run(gg, st.glow, D.floorClip);
    A.rng = rngSave;
    return { under, glow: glowC };
  }

  /**
   * Builds a full level object for the lab (same shape as LevelManager output).
   * opts: { seed, lamps (0..5 brightness steps) }
   */
  LA.build = function (key, opts) {
    const st = STYLES[key] || STYLES.m3;
    const o = opts || {};
    const seed = (o.seed | 0) || 31337;
    const [W, H] = st.size;
    const A = ctxFor(W, H, seed + LA.ORDER.indexOf(key) * 101);
    A.key = key; A.style = st;
    st.shape(A);
    A.clear(st.spawn[0], st.spawn[1], 1.6);
    A.clear(st.boss[0], st.boss[1], 1.8);
    floodFix(A, st.spawn[0], st.spawn[1]);
    // drop any prop that ended up on a sealed tile, unless it's a cover block
    A.props = A.props.filter(p => !p.dead && (A.isF(p.tx, p.ty) || p.coverBlock));
    for (let i = 0; i < A.props.length; i++) {
      const p = A.props[i];
      if (!p.dead) A.map.props[A.map.idx(p.tx, p.ty)] = p;
    }

    const base = (BO.THEMES && (BO.THEMES[st.base] || BO.THEMES.blacksite)) || {};
    const theme = Object.assign({}, base, st.theme);
    const b = boundsOf(A);
    const arenaRect = { x: P(b.x0 + 1), y: P(b.y0 + 1), w: P(b.x1 - b.x0 - 1), h: P(b.y1 - b.y0 - 1) };
    const sp = nearestFloor(A, st.spawn[0], st.spawn[1]), bp = nearestFloor(A, st.boss[0], st.boss[1]);
    const spawn = { x: P(sp[0] + 0.5), y: P(sp[1] + 0.5) };
    const bossSpawn = { x: P(bp[0] + 0.5), y: P(bp[1] + 0.5) };
    const ctr = nearestFloor(A, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    const arenaCenter = { x: P(ctr[0] + 0.5), y: P(ctr[1] + 0.5) };
    const corner = (fx, fy) => { const c = nearestFloor(A, U.lerp(b.x0, b.x1, fx), U.lerp(b.y0, b.y1, fy)); return { x: P(c[0] + 0.5), y: P(c[1] + 0.5) }; };
    const minionSpawns = [corner(0.15, 0.15), corner(0.85, 0.15), corner(0.15, 0.85), corner(0.85, 0.85)];
    const pk = (dx, dy) => { const c = nearestFloor(A, sp[0] + dx, sp[1] + dy); return { x: P(c[0] + 0.5), y: P(c[1] + 0.5) }; };
    const pickups = [Object.assign({ type: 'health' }, pk(-1, -2)), Object.assign({ type: 'ammo' }, pk(-1, 2)), Object.assign({ type: 'armor' }, pk(1, -3)),
      Object.assign({ type: 'health' }, corner(0.5, 0.12)), Object.assign({ type: 'ammo' }, corner(0.5, 0.88))];

    const lamps0 = (st.lamps ? st.lamps(A) : []).map(l => Object.assign({}, l));
    const roomRec = { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, cx: ctr[0], cy: ctr[1], tag: 'arena', index: 0 };
    const layers = paintLayers(A, st);
    const level = {
      def: { theme: st.base, seed, labStyle: key }, theme, map: A.map, rooms: [roomRec], doors: [], props: A.props,
      lamps: lamps0.map(l => Object.assign({}, l)), strips: [], roomLit: new Uint8Array(W * H).fill(1), panels: [], enemies: [], pickups,
      decor: [], targets: [], terminals: [], intel: [], spawn, extraction: { x: spawn.x, y: spawn.y, isExtraction: true }, spawnPoints: [spawn],
      arena: arenaRect, arenaRoom: roomRec, bossSpawn, arenaCenter, minionSpawns, uplink: null, seed,
      labArena: { key, style: st, A, layers, baseLamps: lamps0 }, labDarkness: st.theme.darkness
    };
    LA.applyLamps(level, o.lamps === undefined ? 3 : o.lamps);
    return level;
  };

  /** lamps slider: 0 = off, 1..5 = dim .. bright (arena keeps its own lamp layout). */
  LA.applyLamps = function (level, steps) {
    const la = level && level.labArena;
    if (!la) return false;
    const n = clamp(steps | 0, 0, 5);
    const k = [0, 0.55, 0.75, 0.9, 1, 1.15][n];
    level.lamps = n === 0 ? [] : la.baseLamps.map(l => Object.assign({}, l, { intensity: clamp(l.intensity * k, 0, 1), radius: l.radius * (0.85 + k * 0.15) }));
    return true;
  };

  LA.describe = function (key) { const s = STYLES[key]; return s ? { key, name: s.name, fa: s.fa, size: s.size } : null; };

  /* ------------------------------ Render hooks ------------------------------ */
  function blitLayer(ctx, img, game, additive, alpha) {
    const cam = game.camera;
    const r = cam && cam.visibleRect ? cam.visibleRect(90) : { x0: 0, y0: 0, x1: img.width, y1: img.height };
    const sx = clamp(Math.floor(r.x0), 0, img.width), sy = clamp(Math.floor(r.y0), 0, img.height);
    const ex = clamp(Math.ceil(r.x1), 0, img.width), ey = clamp(Math.ceil(r.y1), 0, img.height);
    if (ex <= sx || ey <= sy) return;
    ctx.save();
    if (additive) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
    ctx.restore();
  }

  function drawUnder(ctx, time) {
    const g = BO.game, L = g && g.level, la = L && L.labArena;
    if (!la) return;
    if (la.layers) blitLayer(ctx, la.layers.under, g, false, 1);
    if (la.style.under) { ctx.save(); la.style.under(ctx, la.A, time || 0, g); ctx.restore(); }
  }
  function drawOver(ctx, time) {
    const g = BO.game, L = g && g.level, la = L && L.labArena;
    if (!la) return;
    const t = time || 0;
    if (la.layers) blitLayer(ctx, la.layers.glow, g, true, 0.85 + Math.sin(t * 1.3) * 0.12);
    if (la.style.over) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; la.style.over(ctx, la.A, t, g); ctx.restore(); }
  }
  LA.drawUnder = drawUnder;
  LA.drawOver = drawOver;

  /** Hooks the hazard layer (drawn right above the floor / right after lighting). Safe to call repeatedly. */
  LA.install = function (game) {
    const hz = game && game.hazards;
    if (!hz) return false;
    const target = Object.prototype.hasOwnProperty.call(hz, 'render') ? hz : Object.getPrototypeOf(hz);
    if (!target || target.__labArenaPatched) return true;
    const oR = target.render, oO = target.renderOverlay;
    if (typeof oR !== 'function') return false;
    target.render = function (ctx, time) { U.safe('labArena.under', () => drawUnder(ctx, time)); return oR.apply(this, arguments); };
    if (typeof oO === 'function') target.renderOverlay = function (ctx, time) { const r = oO.apply(this, arguments); U.safe('labArena.over', () => drawOver(ctx, time)); return r; };
    target.__labArenaPatched = true;
    return true;
  };
})(window.BO);
