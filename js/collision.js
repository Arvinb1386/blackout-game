/* =========================================================================
 * BLACKOUT :: collision.js
 * Tile grid, DDA ray casting (bullets, line of sight, light), and circle vs
 * tile movement resolution. Props (crates, barriers, barrels...) live in the
 * grid so cover naturally blocks bullets and movement.
 * ========================================================================= */
'use strict';
(function (BO) {
  const TILE = BO.CONFIG.TILE;
  const U = BO.U;

  const TILE_TYPE = { SOLID: 0, FLOOR: 1, DOOR: 2 };
  const MODE = { MOVE: 0, BULLET: 1, SIGHT: 2, PATH: 3 };
  const DOOR_PASSABLE = 0.7;

  class TileMap {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.tiles = new Uint8Array(w * h);
      this.props = new Array(w * h).fill(null);
      this.doors = new Array(w * h).fill(null);
      this.roomId = new Int16Array(w * h).fill(-1);
      this.pixelW = w * TILE;
      this.pixelH = h * TILE;
    }
    idx(tx, ty) { return ty * this.w + tx; }
    inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
    tile(tx, ty) { return this.inBounds(tx, ty) ? this.tiles[ty * this.w + tx] : TILE_TYPE.SOLID; }
    isFloor(tx, ty) { const t = this.tile(tx, ty); return t === TILE_TYPE.FLOOR || t === TILE_TYPE.DOOR; }
    propAt(tx, ty) { return this.inBounds(tx, ty) ? this.props[ty * this.w + tx] : null; }
    doorAt(tx, ty) { return this.inBounds(tx, ty) ? this.doors[ty * this.w + tx] : null; }

    /** True when tile (tx,ty) blocks for the given query mode. */
    blocks(tx, ty, mode) {
      if (!this.inBounds(tx, ty)) return true;
      const i = ty * this.w + tx;
      const t = this.tiles[i];
      if (t === TILE_TYPE.SOLID) return true;
      if (t === TILE_TYPE.DOOR) {
        const door = this.doors[i];
        if (door) {
          if (mode === MODE.PATH) return door.locked;
          if (door.open < DOOR_PASSABLE) return true;
        }
      }
      const prop = this.props[i];
      if (prop && !prop.dead) {
        if (mode === MODE.SIGHT) return prop.tall;
        return true;
      }
      return false;
    }

    /** Is a circle at (x,y) completely free of blocking tiles? */
    isCircleFree(x, y, r, mode) {
      const m = mode === undefined ? MODE.MOVE : mode;
      const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE);
      const ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.blocks(tx, ty, m)) continue;
          const px = U.clamp(x, tx * TILE, tx * TILE + TILE), py = U.clamp(y, ty * TILE, ty * TILE + TILE);
          if ((x - px) * (x - px) + (y - py) * (y - py) < r * r) return false;
        }
      }
      return true;
    }
  }

  /** Reusable ray result to avoid allocating in hot loops. */
  function makeHit() { return { hit: false, x: 0, y: 0, t: 1, dist: 0, tx: 0, ty: 0, nx: 0, ny: 0, prop: null, door: null }; }
  const scratchHit = makeHit();

  /**
   * Amanatides & Woo voxel traversal. Walks every tile the segment crosses
   * in order and stops on the first blocking tile.
   */
  function raycast(map, x0, y0, x1, y1, mode, out) {
    const res = out || scratchHit;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
    res.hit = false; res.prop = null; res.door = null; res.nx = 0; res.ny = 0;
    if (map.blocks(tx, ty, mode)) return fillHit(map, res, x0, y0, 0, len, tx, ty);
    if (len < 1e-6) { res.x = x1; res.y = y1; res.t = 1; res.dist = 0; return res; }
    const dirX = dx / len, dirY = dy / len;
    const stepX = dirX > 0 ? 1 : -1, stepY = dirY > 0 ? 1 : -1;
    const tDeltaX = dirX !== 0 ? Math.abs(TILE / dirX) : Infinity;
    const tDeltaY = dirY !== 0 ? Math.abs(TILE / dirY) : Infinity;
    let tMaxX = dirX > 0 ? ((tx + 1) * TILE - x0) / dirX : (dirX < 0 ? (x0 - tx * TILE) / -dirX : Infinity);
    let tMaxY = dirY > 0 ? ((ty + 1) * TILE - y0) / dirY : (dirY < 0 ? (y0 - ty * TILE) / -dirY : Infinity);
    let t = 0;
    let guard = 0;
    while (guard++ < 4096) {
      let nx = 0, ny = 0;
      if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; nx = -stepX; }
      else { t = tMaxY; tMaxY += tDeltaY; ty += stepY; ny = -stepY; }
      if (t > len) break;
      if (map.blocks(tx, ty, mode)) {
        fillHit(map, res, x0 + dirX * t, y0 + dirY * t, t, len, tx, ty);
        res.nx = nx; res.ny = ny;
        return res;
      }
    }
    res.x = x1; res.y = y1; res.t = 1; res.dist = len;
    return res;
  }

  function fillHit(map, res, x, y, t, len, tx, ty) {
    res.hit = true; res.x = x; res.y = y; res.dist = t; res.t = len > 0 ? t / len : 0;
    res.tx = tx; res.ty = ty;
    res.prop = map.propAt(tx, ty);
    if (res.prop && res.prop.dead) res.prop = null;
    res.door = map.doorAt(tx, ty);
    return res;
  }

  function lineOfSight(map, x0, y0, x1, y1, mode) {
    return !raycast(map, x0, y0, x1, y1, mode === undefined ? MODE.SIGHT : mode, scratchHit).hit;
  }

  /** Pushes a circle out of every overlapping blocking tile. */
  function resolveCircle(map, ent, r, mode) {
    let collided = false;
    const tx0 = Math.floor((ent.x - r) / TILE), tx1 = Math.floor((ent.x + r) / TILE);
    const ty0 = Math.floor((ent.y - r) / TILE), ty1 = Math.floor((ent.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!map.blocks(tx, ty, mode)) continue;
        const left = tx * TILE, top = ty * TILE;
        const px = U.clamp(ent.x, left, left + TILE), py = U.clamp(ent.y, top, top + TILE);
        let ddx = ent.x - px, ddy = ent.y - py;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= r * r) continue;
        collided = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = r - d;
          ent.x += ddx / d * push;
          ent.y += ddy / d * push;
        } else {
          // Center is inside the tile: eject along the shallowest axis.
          const cx = left + TILE / 2, cy = top + TILE / 2;
          ddx = ent.x - cx; ddy = ent.y - cy;
          if (Math.abs(ddx) > Math.abs(ddy)) ent.x = ddx > 0 ? left + TILE + r : left - r;
          else ent.y = ddy > 0 ? top + TILE + r : top - r;
        }
      }
    }
    return collided;
  }

  /** Sub-stepped axis-separated movement, safe for fast dodges. */
  function moveCircle(map, ent, dx, dy, r, mode) {
    const m = mode === undefined ? MODE.MOVE : mode;
    const steps = U.clamp(Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.5)), 1, 10);
    const sx = dx / steps, sy = dy / steps;
    let collided = false;
    for (let i = 0; i < steps; i++) {
      ent.x += sx;
      if (resolveCircle(map, ent, r, m)) collided = true;
      ent.y += sy;
      if (resolveCircle(map, ent, r, m)) collided = true;
    }
    return collided;
  }

  BO.TILE_TYPE = TILE_TYPE;
  BO.COLLIDE = MODE;
  BO.TileMap = TileMap;
  BO.Collision = { raycast, lineOfSight, moveCircle, resolveCircle, makeHit };
})(window.BO);
