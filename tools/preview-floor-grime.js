'use strict';
/* =========================================================================
 * BLACKOUT :: tools/preview-floor-grime.js
 * Renders the static-layer grime pass to PNG so the floor look can be checked
 * without launching the game.
 *
 * Suspected bug: noiseCanvas(40, seed) was drawn into a 480x480 canvas with
 * imageSmoothingEnabled, turning every 1px noise sample into a ~12px soft blob.
 * Tiled over the map that reads as smeared, out-of-focus grime instead of
 * surface detail. Tiling the noise at native size should fix it.
 *
 *   node tools/preview-floor-grime.js [outDir]
 * ========================================================================= */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* --------------------------- tiny PNG writer --------------------------- */
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
function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}
/* ------------------------------ helpers -------------------------------- */
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
/** Grayscale noise tile, exactly like noiseCanvas() in postfx.js. */
function noiseTile(size, seed) {
  const d = new Uint8Array(size * size);
  const rng = makeRng(seed);
  for (let i = 0; i < d.length; i++) d[i] = Math.floor(rng() * 255);
  return { size, data: d };
}
/** Nearest upscale, matching drawImage with smoothing off. */
function upscale(tile, size) {
  const out = new Float32Array(size * size);
  const k = size / tile.size;
  for (let y = 0; y < size; y++) {
    const sy = Math.min(tile.size - 1, Math.floor(y / k));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(tile.size - 1, Math.floor(x / k));
      out[y * size + x] = tile.data[sy * tile.size + sx] / 255;
    }
  }
  return out;
}
/** Tile a small noise canvas across W x H. */
function tileTo(field, W, H) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    out[y * W + x] = field.data[(y % field.size) * field.size + (x % field.size)] / 255;
  }
  return out;
}
/** Box blur, standing in for imageSmoothingEnabled=true. */
function blur(src, size, radius) {
  const tmp = new Float32Array(size * size), out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, n = 0;
    for (let k = -radius; k <= radius; k++) {
      const xx = x + k; if (xx < 0 || xx >= size) continue; s += src[y * size + xx]; n++;
    }
    tmp[y * size + x] = s / n;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, n = 0;
    for (let k = -radius; k <= radius; k++) {
      const yy = y + k; if (yy < 0 || yy >= size) continue; s += tmp[yy * size + x]; n++;
    }
    out[y * size + x] = s / n;
  }
  return out;
}
/** 'overlay' blend of a 0..1 grey layer onto a 0..1 base. */
function overlay(base, layer, alpha, W, H) {
  for (let i = 0; i < W * H; i++) {
    const b = base[i], l = layer[i];
    const o = b < 0.5 ? 2 * b * l : 1 - 2 * (1 - b) * (1 - l);
    base[i] = b + (o - b) * alpha;
  }
}

/* --------------------------- the two variants -------------------------- */
const W = 480, H = 480, TILE_PX = 48;

function baseFloor() {
  const px = new Float32Array(W * H);
  for (let ty = 0; ty < H / TILE_PX; ty++) for (let tx = 0; tx < W / TILE_PX; tx++) {
    const v = (tx + ty) % 2 ? 0.085 : 0.065;   // checkerboard floor tones
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      px[(ty * TILE_PX + y) * W + tx * TILE_PX + x] = v;
    }
  }
  return px;
}
/** OLD: 40x40 noise stretched to 480x480 with smoothing (current code). */
function oldPass(px) {
  overlay(px, blur(upscale(noiseTile(40, 7), W), W, 5), 0.28, W, H);
  overlay(px, tileTo(noiseTile(128, 9), W, H), 0.12, W, H);
}
/** NEW: 256x256 noise tiled at native size, gentle blur. */
function newPass(px) {
  overlay(px, blur(tileTo(noiseTile(256, 7), W, H), W, 3), 0.16, W, H);
  overlay(px, tileTo(noiseTile(128, 9), W, H), 0.07, W, H);
}

function toPng(px, file) {
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = Math.max(0, Math.min(255, Math.round(px[i] * 255 * 1.6)));
    rgba[i * 4] = Math.round(v * 0.85); rgba[i * 4 + 1] = Math.round(v * 0.9);
    rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255;
  }
  writePng(file, W, H, rgba);
}
/** Mean |dx|: high = busy detail, low = smeared flatness. */
function detail(px) {
  let sum = 0;
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) sum += Math.abs(px[y * W + x] - px[y * W + x - 1]);
  return sum / (W * H);
}

const outDir = process.argv[2] || path.join(__dirname, '..', 'preview');
fs.mkdirSync(outDir, { recursive: true });

const base = baseFloor();
const a = base.slice(); oldPass(a);
const b = base.slice(); newPass(b);
toPng(a, path.join(outDir, 'floor-grime-old.png'));
toPng(b, path.join(outDir, 'floor-grime-new.png'));
toPng(base, path.join(outDir, 'floor-base.png'));

const dBase = detail(base), dOld = detail(a), dNew = detail(b);
console.log('detail (mean |dx|):');
console.log('  base floor, no grime : ' + dBase.toFixed(5));
console.log('  OLD 40->480 stretch  : ' + dOld.toFixed(5) +
  (dOld < dBase * 0.6 ? '   <-- FLATTER than no grime = smeared/blurry' : ''));
console.log('  NEW 256 tiled        : ' + dNew.toFixed(5));
console.log('\nwrote preview/floor-grime-{old,new,base}.png');