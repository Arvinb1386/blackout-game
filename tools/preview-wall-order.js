'use strict';
/* =========================================================================
 * BLACKOUT :: tools/preview-wall-order.js
 * Reproduces the wall artefacts: washed-out walls, floor showing through the
 * bottom of walls, and the lit face bleeding into the tile below.
 *
 * Cause: buildStaticLayer walks the map in ONE row-major pass and calls
 * _drawWall() inline. A wall on row ty is painted before the floor of row ty+1,
 * so that floor tile lands straight on top of the wall's lit south lip and
 * shaded face. Walls need their own pass, after the floor.
 *
 *   node tools/preview-wall-order.js [outDir]
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 480, H = 336, TILE = 48;
const COLS = W / TILE, ROWS = H / TILE;

/* A tiny map: 0 = floor, 1 = solid. Two rooms split by a wall column. */
const map = [];
for (let y = 0; y < ROWS; y++) {
  map[y] = [];
  for (let x = 0; x < COLS; x++) {
    const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
    map[y][x] = (border || x === 4 || x === 5) ? 1 : 0;
  }
}
const isFloor = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && map[y][x] === 0;
function touchesFloor(tx, ty) {
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (isFloor(x, y)) return true;
  return false;
}
const theme = { wall: '#3a3f4d', wallTop: '#585f70', floor: '#2a2f3a', floorAlt: '#262b35' };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* ------------------------------ canvas --------------------------------- */
function newCanvas(w, h) {
  const px = new Float32Array(w * h * 3);
  const rect = (x, y, w2, h2, col) => {
    const a = col[3] === undefined ? 1 : col[3];
    for (let j = Math.max(0, y | 0); j < Math.min(h, (y + h2) | 0); j++) {
      for (let i = Math.max(0, x | 0); i < Math.min(w, (x + w2) | 0); i++) {
        const o = (j * w + i) * 3;
        px[o]     = px[o]     * (1 - a) + col[0] * a;
        px[o + 1] = px[o + 1] * (1 - a) + col[1] * a;
        px[o + 2] = px[o + 2] * (1 - a) + col[2] * a;
      }
    }
  };
  return { px, rect };
}
/* --------------------------- the two passes ---------------------------- */
/** CURRENT: one row-major pass, walls drawn inline. */
function drawOld(c) {
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const x = tx * TILE, y = ty * TILE;
    if (map[ty][tx] === 1) {
      if (!touchesFloor(tx, ty)) continue;
      c.rect(x, y, TILE, TILE, hex(theme.wall));
      c.rect(x + 3, y + 3, TILE - 6, TILE - 6, [0, 0, 0, 0.22]);
      c.rect(x, y + TILE - 5, TILE, 5, hex(theme.wallTop));   // south lip
      continue;
    }
    c.rect(x, y, TILE, TILE, hex((tx + ty) % 2 ? theme.floor : theme.floorAlt));
  }
}

/** FIXED: floor first, then walls in their own top-to-bottom pass. */
function drawNew(c) {
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    if (map[ty][tx] === 1) continue;
    c.rect(tx * TILE, ty * TILE, TILE, TILE, hex((tx + ty) % 2 ? theme.floor : theme.floorAlt));
  }
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    if (map[ty][tx] !== 1 || !touchesFloor(tx, ty)) continue;
    const x = tx * TILE, y = ty * TILE;
    c.rect(x, y, TILE, TILE, hex(theme.wall));
    c.rect(x + 3, y + 3, TILE - 6, TILE - 6, [0, 0, 0, 0.22]);
    c.rect(x, y + TILE - 5, TILE, 5, hex(theme.wallTop));
  }
}

/* ------------------------------ PNG out -------------------------------- */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(file, w, h, px) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3, d = y * (w * 3 + 1) + 1 + x * 3;
      raw[d] = px[o]; raw[d + 1] = px[o + 1]; raw[d + 2] = px[o + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

/* ------------------------------- probe --------------------------------- */
/**
 * The cap and face are filled with a CanvasPattern, then multiplied by a
 * translucent gradient. Count how many wall pixels end up lighter than the
 * floor beside them: a wall that reads "washed out" is one where the pattern
 * is pale and the floor shows through it.
 */
function wallStats(px, label) {
  // Wall at column 1, floor at column 2 (same row) for comparison.
  let wallLum = 0, floorLum = 0, wn = 0, fn = 0;
  for (let y = TILE; y < H - TILE; y++) {
    for (let k = 8; k < TILE - 8; k++) {
      const a = ((y * W) + TILE + k) * 3;
      const b = ((y * W) + TILE * 2 + k) * 3;
      wallLum += px[a] * 0.3 + px[a + 1] * 0.6 + px[a + 2] * 0.1; wn++;
      floorLum += px[b] * 0.3 + px[b + 1] * 0.6 + px[b + 2] * 0.1; fn++;
    }
  }
  const wl = wallLum / wn, fl = floorLum / fn;
  const contrast = fl > 0 ? wl / fl : 0;
  console.log('  ' + label.padEnd(14) + ' wall luma ' + wl.toFixed(1) +
    '  floor luma ' + fl.toFixed(1) + '  contrast x' + contrast.toFixed(2));
  return { wl, contrast };
}

/** How much the wall's own texture survives vs. the theme colour behind it. */
function capVariation(px) {
  let min = 255, max = 0;
  for (let y = TILE + 4; y < TILE + 20; y++) for (let k = 8; k < TILE - 8; k++) {
    const o = ((y * W) + TILE + k) * 3;
    const l = px[o] * 0.3 + px[o + 1] * 0.6 + px[o + 2] * 0.1;
    if (l < min) min = l; if (l > max) max = l;
  }
  return max - min;
}

const a = newCanvas(W, H); drawOld(a);
const b = newCanvas(W, H); drawNew(b);
const out = process.argv[2] || path.join(__dirname, '..', 'preview');
fs.mkdirSync(out, { recursive: true });
writePng(path.join(out, 'wallcap-old.png'), W, H, a.px);
writePng(path.join(out, 'wallcap-new.png'), W, H, b.px);

console.log('wall vs floor contrast (higher = wall reads as solid, not washed out):');
const so = wallStats(a.px, 'OLD');
const sn = wallStats(b.px, 'NEW');
console.log('\ncap texture variation (luma range across the cap):');
console.log('  OLD ' + capVariation(a.px).toFixed(1) + '   NEW ' + capVariation(b.px).toFixed(1));
console.log('\nwrote preview/wallcap-{old,new}.png');