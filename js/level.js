/* =========================================================================
 * BLACKOUT :: level.js  (LevelManager)
 * Seeded procedural facility generator: rooms + corridors (MST with extra
 * loops), doors, cover clusters, destructibles, lighting, hazards, objective
 * entities, enemy squads and loot. A boss arena is sealed behind one locked
 * door. Connectivity is verified with a flood fill.
 * ========================================================================= */
'use strict';
(function (BO) {
  const U = BO.U;
  const TILE = BO.CONFIG.TILE;
  const T = BO.TILE_TYPE;

  const PROP_DEFS = {
    crate:    { hp: 60,  destructible: true,  tall: false, color: '#5a4630', debris: '#7a5c3a', drop: 0.45 },
    barrier:  { hp: 140, destructible: true,  tall: false, color: '#4a4e5a', debris: '#6c717e' },
    barrel:   { hp: 28,  destructible: true,  tall: false, color: '#b8352a', debris: '#5a1d18', explosive: 125, blastDamage: 85 },
    computer: { hp: 40,  destructible: true,  tall: false, color: '#20262f', debris: '#3a4250', drop: 0.25 },
    pillar:   { hp: 220, destructible: true,  tall: true,  color: '#2a2e38', debris: '#4e5563' },
    locker:   { hp: 120, destructible: true,  tall: true,  color: '#343a46', debris: '#4a5160' },
    cache:    { hp: 260, destructible: true,  tall: false, color: '#3d4a2c', debris: '#5c6b3d', objective: 'cache', explosive: 110, blastDamage: 40, drop: 1 },
    core:     { hp: 650, destructible: true,  tall: true,  color: '#3a1e2a', debris: '#ff2d55', objective: 'core', explosive: 150, blastDamage: 50, drop: 1 },
    terminal: { hp: 0,   destructible: false, tall: false, color: '#1b2430', interact: true }
  };

  function makeProp(kind, tx, ty) {
    const d = PROP_DEFS[kind];
    return { kind, def: d, tx, ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, hp: d.hp, maxHp: d.hp,
      destructible: d.destructible, tall: d.tall, dead: false, hitFlash: 0, activated: false, progress: 0, charge: -1, variant: 0 };
  }

  function build(def, seed) {
    const rng = U.makeRng(seed);
    const R = (a, b) => a + rng() * (b - a);
    const RI = (a, b) => Math.floor(a + rng() * (b - a + 1));
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const theme = BO.THEMES[def.theme] || BO.THEMES.outpost;
    const W = def.size[0], H = def.size[1];
    const map = new BO.TileMap(W, H);
    const rooms = [];

    /* ----------------------------- Rooms ----------------------------- */
    let arena = null;
    if (def.boss) {
      const aw = 22, ah = 16;
      arena = { x: W - aw - 3, y: Math.floor(H / 2 - ah / 2), w: aw, h: ah, tag: 'arena' };
    }
    const maxX = arena ? arena.x - 5 : W - 2;
    rooms.push({ x: 3, y: RI(3, H - 12), w: 9, h: 8, tag: 'start' });
    let tries = 0;
    while (rooms.length < def.roomCount && tries++ < 900) {
      const w = RI(7, 14), h = RI(6, 11);
      const r = { x: RI(2, Math.max(3, maxX - w - 1)), y: RI(2, H - h - 2), w, h, tag: 'room' };
      if (r.x + r.w >= maxX) continue;
      if (rooms.some(o => r.x < o.x + o.w + 2 && r.x + r.w + 2 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y)) continue;
      rooms.push(r);
    }
    if (arena) rooms.push(arena);
    rooms.forEach((r, i) => {
      r.index = i;
      r.cx = Math.floor(r.x + r.w / 2); r.cy = Math.floor(r.y + r.h / 2);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        map.tiles[map.idx(x, y)] = T.FLOOR;
        map.roomId[map.idx(x, y)] = i;
      }
    });

    /* --------------------------- Corridors --------------------------- */
    const carve = (x, y) => {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
      const i = map.idx(x, y);
      if (map.tiles[i] === T.SOLID) map.tiles[i] = T.FLOOR;
    };
    const corridor = (a, b) => {
      const horizontalFirst = rng() < 0.5;
      const hLine = (x0, x1, y) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 1; x++) { carve(x, y); carve(x, y + 1); } };
      const vLine = (y0, y1, x) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + 1; y++) { carve(x, y); carve(x + 1, y); } };
      if (horizontalFirst) { hLine(a.cx, b.cx, a.cy); vLine(a.cy, b.cy, b.cx); }
      else { vLine(a.cy, b.cy, a.cx); hLine(a.cx, b.cx, b.cy); }
    };
    const normal = rooms.filter(r => r.tag !== 'arena');
    const inTree = [normal[0]];
    const edges = [];
    while (inTree.length < normal.length) {
      let best = null, bestD = Infinity;
      for (const a of inTree) for (const b of normal) {
        if (inTree.indexOf(b) >= 0) continue;
        const d = U.dist2(a.cx, a.cy, b.cx, b.cy);
        if (d < bestD) { bestD = d; best = [a, b]; }
      }
      if (!best) break;
      edges.push(best);
      inTree.push(best[1]);
    }
    normal.forEach(a => {
      if (rng() > 0.3) return;
      let best = null, bestD = Infinity;
      normal.forEach(b => {
        if (a === b || edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) return;
        const d = U.dist2(a.cx, a.cy, b.cx, b.cy);
        if (d < bestD) { bestD = d; best = b; }
      });
      if (best) edges.push([a, best]);
    });
    edges.forEach(e => corridor(e[0], e[1]));
    if (arena) {
      let near = null, nd = Infinity;
      normal.forEach(r => { const d = U.dist2(r.cx, r.cy, arena.x, arena.cy) + Math.abs(r.cy - arena.cy) * 30; if (d < nd && r.tag !== 'start') { nd = d; near = r; } });
      near = near || normal[0];
      for (let x = near.cx; x <= arena.cx; x++) { carve(x, arena.cy); carve(x, arena.cy + 1); }
      for (let y = Math.min(near.cy, arena.cy); y <= Math.max(near.cy, arena.cy) + 1; y++) { carve(near.cx, y); carve(near.cx + 1, y); }
    }

    /* ----------------------------- Doors ----------------------------- */
    const doors = [];
    const noProp = new Uint8Array(W * H);
    const protect = (tx, ty, rad) => {
      for (let y = ty - rad; y <= ty + rad; y++) for (let x = tx - rad; x <= tx + rad; x++) if (map.inBounds(x, y)) noProp[map.idx(x, y)] = 1;
    };
    rooms.forEach(r => {
      const sides = [
        { horizontal: true, fixed: r.y - 1, from: r.x, to: r.x + r.w - 1, out: -1 },
        { horizontal: true, fixed: r.y + r.h, from: r.x, to: r.x + r.w - 1, out: 1 },
        { horizontal: false, fixed: r.x - 1, from: r.y, to: r.y + r.h - 1, out: -1 },
        { horizontal: false, fixed: r.x + r.w, from: r.y, to: r.y + r.h - 1, out: 1 }
      ];
      sides.forEach(s => {
        const at = (k) => (s.horizontal ? [k, s.fixed] : [s.fixed, k]);
        let k = s.from;
        while (k <= s.to) {
          const [x, y] = at(k);
          if (map.tile(x, y) !== T.FLOOR) { k++; continue; }
          const start = k;
          while (k <= s.to && map.tile(...at(k)) === T.FLOOR) k++;
          const end = k - 1, len = end - start + 1;
          for (let q = start; q <= end; q++) { const [px, py] = at(q); protect(px, py, 2); }
          if (len > 3) continue;
          const [fx0, fy0] = at(start - 1), [fx1, fy1] = at(end + 1);
          if (map.tile(fx0, fy0) !== T.SOLID || map.tile(fx1, fy1) !== T.SOLID) continue;
          const outward = [];
          for (let q = start; q <= end; q++) {
            const [px, py] = at(q);
            outward.push(s.horizontal ? map.tile(px, py + s.out) : map.tile(px + s.out, py));
          }
          if (outward.some(t => t !== T.FLOOR)) continue;
          const isArena = r.tag === 'arena';
          if (!isArena && rng() > 0.6) continue;
          const door = { tiles: [], horizontal: s.horizontal, open: 0, locked: isArena, arena: isArena, len, x: 0, y: 0, room: r.index };
          for (let q = start; q <= end; q++) {
            const [px, py] = at(q);
            const i = map.idx(px, py);
            map.tiles[i] = T.DOOR;
            map.doors[i] = door;
            door.tiles.push(i);
            door.x += px * TILE + TILE / 2; door.y += py * TILE + TILE / 2;
          }
          door.x /= len; door.y /= len;
          doors.push(door);
        }
      });
    });

    /* ----------------------------- Props ----------------------------- */
    const props = [];
    const startRoom = rooms[0];
    const spawn = { x: startRoom.cx * TILE + TILE / 2, y: startRoom.cy * TILE + TILE / 2 };
    protect(startRoom.cx, startRoom.cy, 2);
    const freeTile = (tx, ty, ri) => map.inBounds(tx, ty) && map.tiles[map.idx(tx, ty)] === T.FLOOR &&
      map.roomId[map.idx(tx, ty)] === ri && !map.props[map.idx(tx, ty)] && !noProp[map.idx(tx, ty)];
    const isolated = (tx, ty, own) => {
      for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
        const p = map.propAt(x, y);
        if (p && own.indexOf(p) < 0) return false;
      }
      return true;
    };
    const place = (kind, tx, ty) => {
      const p = makeProp(kind, tx, ty);
      map.props[map.idx(tx, ty)] = p;
      props.push(p);
      return p;
    };
    const placeCluster = (kind, cells, ri) => {
      if (!cells.every(c => freeTile(c[0], c[1], ri) && isolated(c[0], c[1], []))) return false;
      cells.forEach(c => place(kind, c[0], c[1]));
      return true;
    };
    /** Spiral search for a free interior tile close to (cx, cy). */
    const nearestFree = (r, cx, cy) => {
      for (let rad = 0; rad < 6; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x <= r.x || y <= r.y || x >= r.x + r.w - 1 || y >= r.y + r.h - 1) continue;
        if (freeTile(x, y, r.index) && isolated(x, y, [])) return [x, y];
      }
      return null;
    };

    // Objective rooms are chosen far from the start for a sense of journey.
    const byDistance = normal.filter(r => r.tag !== 'start')
      .sort((a, b) => U.dist2(b.cx, b.cy, startRoom.cx, startRoom.cy) - U.dist2(a.cx, a.cy, startRoom.cx, startRoom.cy));
    let extractionRoom = arena || byDistance[0];
    extractionRoom.tag = extractionRoom.tag === 'arena' ? 'arena' : 'extraction';
    protect(extractionRoom.cx, extractionRoom.cy, 2);
    const used = new Set([extractionRoom]);
    const takeRoom = (preferFar) => {
      const list = preferFar ? byDistance : byDistance.slice().reverse();
      const r = list.find(x => !used.has(x) && x.tag === 'room');
      if (r) used.add(r);
      return r || pick(byDistance);
    };
    const targets = [], terminals = [], intel = [];
    for (let i = 0; i < (def.caches || 0); i++) {
      const r = takeRoom(true), c = nearestFree(r, r.cx + RI(-1, 1), r.cy + RI(-1, 1));
      if (c) targets.push(place('cache', c[0], c[1]));
    }
    for (let i = 0; i < (def.cores || 0); i++) {
      const r = takeRoom(true), c = nearestFree(r, r.cx, r.cy);
      if (c) targets.push(place('core', c[0], c[1]));
    }
    let uplink = null;
    for (let i = 0; i < (def.terminals || 0); i++) {
      const r = takeRoom(i === 0), c = nearestFree(r, r.cx, r.cy);
      if (c) {
        const t = place('terminal', c[0], c[1]);
        terminals.push(t);
        if (!uplink) uplink = { x: r.cx * TILE + TILE / 2, y: r.cy * TILE + TILE / 2 };
      }
    }
    for (let i = 0; i < (def.intel || 0); i++) {
      const r = takeRoom(i % 2 === 0), c = nearestFree(r, r.cx + RI(-2, 2), r.cy + RI(-2, 2));
      if (c) { intel.push({ x: c[0] * TILE + TILE / 2, y: c[1] * TILE + TILE / 2 }); protect(c[0], c[1], 0); noProp[map.idx(c[0], c[1])] = 1; }
    }

    if (arena) {
      const ax = arena.x, ay = arena.y, aw = arena.w, ah = arena.h;
      [[ax + 5, ay + 4], [ax + aw - 6, ay + 4], [ax + 5, ay + ah - 5], [ax + aw - 6, ay + ah - 5]].forEach(c => place('pillar', c[0], c[1]));
      [[ax + 9, ay + 3], [ax + 10, ay + 3], [ax + 11, ay + ah - 4], [ax + 12, ay + ah - 4]].forEach(c => { if (freeTile(c[0], c[1], arena.index)) place('barrier', c[0], c[1]); });
    }

    const CRATE_SHAPES = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [2, 0]]];
    rooms.forEach(r => {
      if (r.tag === 'arena') return;
      const area = (r.w - 2) * (r.h - 2);
      const clusters = Math.round(area / 26 * def.propDensity * (r.tag === 'start' ? 0.4 : 1));
      for (let c = 0; c < clusters; c++) {
        const roll = rng();
        const tx = RI(r.x, r.x + r.w - 1), ty = RI(r.y, r.y + r.h - 1);
        if (roll < 0.42) placeCluster('crate', pick(CRATE_SHAPES).map(s => [tx + s[0], ty + s[1]]), r.index);
        else if (roll < 0.66) {
          const horiz = rng() < 0.5, len = RI(2, 3);
          const cells = [];
          for (let k = 0; k < len; k++) cells.push(horiz ? [tx + k, ty] : [tx, ty + k]);
          placeCluster('barrier', cells, r.index);
        } else if (roll < 0.78 && r.w >= 9 && r.h >= 8) {
          const px = RI(r.x + 2, r.x + r.w - 3), py = RI(r.y + 2, r.y + r.h - 3);
          placeCluster('pillar', [[px, py]], r.index);
        } else if (roll < 0.9) {
          const len = RI(2, 3), x0 = RI(r.x, r.x + r.w - len);
          const cells = [];
          for (let k = 0; k < len; k++) cells.push([x0 + k, r.y]);
          placeCluster('computer', cells, r.index);
        } else {
          const len = RI(1, 2), y0 = RI(r.y, r.y + r.h - len);
          const side = rng() < 0.5 ? r.x : r.x + r.w - 1;
          const cells = [];
          for (let k = 0; k < len; k++) cells.push([side, y0 + k]);
          placeCluster('locker', cells, r.index);
        }
      }
    });
    let barrels = def.barrels || 0, barrelTries = 0;
    while (barrels > 0 && barrelTries++ < 300) {
      const r = pick(normal);
      if (r.tag === 'start') continue;
      const tx = RI(r.x, r.x + r.w - 1), ty = RI(r.y, r.y + r.h - 1);
      if (placeCluster('barrel', [[tx, ty]], r.index)) barrels--;
    }

    /* ------------------------ Connectivity check ------------------------ */
    const flood = () => {
      const seen = new Uint8Array(W * H);
      const stack = [map.idx(startRoom.cx, startRoom.cy)];
      seen[stack[0]] = 1;
      while (stack.length) {
        const i = stack.pop();
        const x = i % W, y = (i - x) / W;
        const nb = [i - 1, i + 1, i - W, i + W];
        for (let k = 0; k < 4; k++) {
          const n = nb[k];
          if (n < 0 || n >= W * H || seen[n]) continue;
          if ((k === 0 && x === 0) || (k === 1 && x === W - 1)) continue;
          if (map.tiles[n] === T.SOLID) continue;
          const p = map.props[n];
          if (p && !p.dead) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      return seen;
    };
    for (let iter = 0; iter < 120; iter++) {
      const seen = flood();
      let fixed = false, broken = -1;
      for (let i = 0; i < W * H && broken < 0; i++) if (map.tiles[i] !== T.SOLID && !map.props[i] && !seen[i]) broken = i;
      if (broken < 0) break;
      const bx = broken % W, by = (broken - bx) / W;
      for (let rad = 1; rad < 4 && !fixed; rad++) {
        for (let y = by - rad; y <= by + rad && !fixed; y++) for (let x = bx - rad; x <= bx + rad && !fixed; x++) {
          const p = map.propAt(x, y);
          if (p && !p.def.objective && p.kind !== 'terminal') {
            map.props[map.idx(x, y)] = null;
            props.splice(props.indexOf(p), 1);
            fixed = true;
          }
        }
      }
      if (!fixed) map.tiles[broken] = T.SOLID; // seal unreachable pocket
    }

    /* ----------------------------- Lighting ---------------------------- */
    const lamps = [], strips = [];
    const roomLit = new Uint8Array(rooms.length);
    rooms.forEach(r => {
      const forced = r.tag === 'start' || r.tag === 'extraction' || r.tag === 'arena';
      const lit = forced || rng() > theme.darkRooms;
      roomLit[r.index] = lit ? 1 : 0;
      if (!lit) {
        // Dead rooms still get a faint emergency strobe.
        lamps.push({ x: (r.x + 1) * TILE, y: (r.y + 1) * TILE, radius: 110, color: theme.trim, flicker: 0, pulse: true, intensity: 0.5, phase: rng() * 6 });
        return;
      }
      const count = r.w * r.h > 90 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const lx = count === 1 ? r.cx : (k === 0 ? r.x + r.w * 0.28 : r.x + r.w * 0.72);
        lamps.push({ x: lx * TILE + TILE / 2, y: r.cy * TILE + TILE / 2, radius: U.clamp(Math.max(r.w, r.h) * TILE * (count === 1 ? 0.62 : 0.48), 210, 460),
          color: pick(theme.lamps), flicker: rng() < 0.3 ? R(0.5, 1) : 0, pulse: false, intensity: R(0.75, 0.95), phase: rng() * 10 });
      }
      strips.push({ x0: (r.x + 0.5) * TILE, y0: r.y * TILE + 3, x1: (r.x + r.w - 0.5) * TILE, y1: r.y * TILE + 3, color: theme.trim });
      if (rng() < 0.5) strips.push({ x0: (r.x + 0.5) * TILE, y0: (r.y + r.h) * TILE - 3, x1: (r.x + r.w - 0.5) * TILE, y1: (r.y + r.h) * TILE - 3, color: theme.trim });
    });
    doors.forEach(d => lamps.push({ x: d.x, y: d.y, radius: 80, color: d.arena ? '#ff2d55' : theme.trim, flicker: 0, pulse: true, intensity: 0.45, phase: rng() * 6, door: d }));
    for (let y = 2; y < H - 2; y += 6) for (let x = 2; x < W - 2; x += 6) {
      const i = map.idx(x, y);
      if (map.tiles[i] === T.FLOOR && map.roomId[i] < 0 && rng() < 0.45) lamps.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, radius: 130, color: pick(theme.lamps), flicker: rng() < 0.4 ? 1 : 0, pulse: false, intensity: 0.6, phase: rng() * 10 });
    }

    /* ------------------------------ Hazards ---------------------------- */
    const panels = [];
    let hz = def.hazards || 0, hzTries = 0;
    while (hz > 0 && hzTries++ < 200) {
      const r = pick(normal);
      if (r.tag === 'start') continue;
      const tx = RI(r.x + 1, r.x + r.w - 3), ty = RI(r.y + 1, r.y + r.h - 3);
      let ok = true;
      for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) if (!freeTile(x, y, r.index)) ok = false;
      if (!ok) continue;
      panels.push({ x: tx * TILE, y: ty * TILE, w: TILE * 2, h: TILE * 2, offset: rng() * 6 });
      for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) noProp[map.idx(x, y)] = 1;
      hz--;
    }

    /* ------------------------------ Enemies ---------------------------- */
    const enemies = [];
    const combatRooms = normal.filter(r => r.tag !== 'start');
    const totalArea = combatRooms.reduce((s, r) => s + r.w * r.h, 0);
    const typeWeights = def.enemies.types;
    const rollType = () => {
      let x = rng();
      for (const k in typeWeights) { x -= typeWeights[k]; if (x <= 0) return k; }
      return 'grunt';
    };
    const randomRoomTile = (r) => {
      for (let k = 0; k < 30; k++) {
        const tx = RI(r.x, r.x + r.w - 1), ty = RI(r.y, r.y + r.h - 1);
        const i = map.idx(tx, ty);
        if (map.tiles[i] !== T.FLOOR || map.props[i]) continue;
        const wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2;
        if (!map.isCircleFree(wx, wy, 22)) continue;
        return { x: wx, y: wy };
      }
      return null;
    };
    let enemyAttempts = 0;
    while (enemies.length < def.enemies.count && enemyAttempts++ < def.enemies.count * 12) {
      const type = rollType();
      let room = combatRooms[0];
      for (let k = 0; k < 4; k++) {
        let x = rng() * totalArea;
        room = combatRooms.find(r => (x -= r.w * r.h) <= 0) || combatRooms[0];
        if (type !== 'sniper' || room.w * room.h >= 70) break;
      }
      if (room === arena) continue;
      const pos = randomRoomTile(room);
      if (!pos || U.dist(pos.x, pos.y, spawn.x, spawn.y) < TILE * 10) continue;
      const patrol = [];
      const pc = RI(1, 3);
      for (let k = 0; k < pc; k++) { const pp = randomRoomTile(room); if (pp) patrol.push(pp); }
      patrol.push({ x: pos.x, y: pos.y });
      enemies.push({ type, x: pos.x, y: pos.y, patrol });
    }

    /* ------------------------------ Pickups ---------------------------- */
    const pickups = [];
    const lootRooms = normal.filter(r => r.tag !== 'start');
    const addPickup = (type, extra) => {
      for (let k = 0; k < 10; k++) {
        const pos = randomRoomTile(pick(lootRooms));
        if (pos) { pickups.push(Object.assign({ type, x: pos.x, y: pos.y }, extra || {})); return; }
      }
    };
    const P = def.pickups;
    for (let i = 0; i < P.health; i++) addPickup('health');
    for (let i = 0; i < P.ammo; i++) addPickup('ammo');
    for (let i = 0; i < P.armor; i++) addPickup('armor');
    for (let i = 0; i < P.credits; i++) addPickup('credits', { value: RI(20, 45) });
    for (let i = 0; i < P.power; i++) addPickup(pick(['damage', 'rate', 'speed', 'invuln']));
    (def.weaponPickups || []).forEach(id => addPickup('weapon', { weaponId: id }));
    if (arena) {
      [[arena.x + 2, arena.y + 2], [arena.x + arena.w - 3, arena.y + arena.h - 3]].forEach(c => pickups.push({ type: 'health', x: c[0] * TILE + TILE / 2, y: c[1] * TILE + TILE / 2 }));
      pickups.push({ type: 'ammo', x: (arena.x + arena.w - 3) * TILE + TILE / 2, y: (arena.y + 2) * TILE + TILE / 2 });
      pickups.push({ type: 'armor', x: (arena.x + 2) * TILE + TILE / 2, y: (arena.y + arena.h - 3) * TILE + TILE / 2 });
    }
    pickups.push({ type: 'ammo', x: spawn.x + TILE * 2, y: spawn.y });

    /* ------------------------------ Decor ------------------------------ */
    const decor = [];
    for (let i = 0; i < W * H / 9; i++) {
      const tx = RI(1, W - 2), ty = RI(1, H - 2);
      const idx = map.idx(tx, ty);
      if (map.tiles[idx] !== T.FLOOR || map.props[idx]) continue;
      const corridorTile = map.roomId[idx] < 0;
      decor.push({ type: corridorTile ? (rng() < 0.6 ? 'grate' : 'cable') : pick(['stain', 'stain', 'vent', 'debris', 'cable', 'marking']), x: tx * TILE, y: ty * TILE, rot: rng() * U.TAU, s: R(0.6, 1.2) });
    }

    /* ----------------------------- Spawns ------------------------------ */
    const spawnPoints = [];
    combatRooms.forEach(r => { for (let k = 0; k < 3; k++) { const p = randomRoomTile(r); if (p) spawnPoints.push(p); } });
    const ex = { x: extractionRoom.cx * TILE + TILE / 2, y: extractionRoom.cy * TILE + TILE / 2, isExtraction: true };
    let arenaRect = null, bossSpawn = null, arenaCenter = null, minionSpawns = [];
    if (arena) {
      arenaRect = { x: arena.x * TILE, y: arena.y * TILE, w: arena.w * TILE, h: arena.h * TILE };
      bossSpawn = { x: (arena.x + arena.w - 6) * TILE, y: arena.cy * TILE + TILE / 2 };
      arenaCenter = { x: arena.cx * TILE + TILE / 2, y: arena.cy * TILE + TILE / 2 };
      minionSpawns = [[2, 2], [arena.w - 3, 2], [2, arena.h - 3], [arena.w - 3, arena.h - 3]].map(c => ({ x: (arena.x + c[0]) * TILE + TILE / 2, y: (arena.y + c[1]) * TILE + TILE / 2 }));
    }

    return {
      def, theme, map, rooms, doors, props, lamps, strips, roomLit, panels, enemies, pickups, decor, targets, terminals, intel,
      spawn, extraction: ex, spawnPoints, arena: arenaRect, arenaRoom: arena, bossSpawn, arenaCenter, minionSpawns, uplink, seed
    };
  }

  const LevelManager = {
    /** Builds a level, retrying with a shifted seed if a layout ever fails validation. */
    generate(def) {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const level = build(def, def.seed + attempt * 7919);
          const goals = (def.caches || 0) + (def.cores || 0);
          if (level.targets.length < goals || level.terminals.length < (def.terminals || 0) || level.intel.length < (def.intel || 0)) continue;
          if (level.enemies.length < Math.min(4, def.enemies.count)) continue;
          return level;
        } catch (err) {
          U.reportError('level.generate.' + attempt, err);
        }
      }
      throw new Error('Level generation failed for ' + def.id);
    },
    PROP_DEFS,
    makeProp
  };

  BO.LevelManager = LevelManager;
  BO.PROP_DEFS = PROP_DEFS;
})(window.BO);
