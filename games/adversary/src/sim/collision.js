// collision.js — per-axis AABB-vs-tile resolution (DESIGN-SEED M3: real tile collision replacing
// the M2 flat ground). Boxes are top-left {x,y,w,h} in world pixels. Resolve X then Y (the standard
// order that avoids corner snags). Pure and deterministic — the headless stage-clear bot relies on
// it reproducing exactly.

const EPS = 1e-6;

/** Tile-row range [t0, t1] inclusive that a [lo, hi) pixel span covers. */
function tileRange(lo, hi, tileSize) {
  return [Math.floor(lo / tileSize), Math.floor((hi - EPS) / tileSize)];
}

/** Resolve horizontal movement; mutates box.x. Sweeps crossed columns. Returns true on wall hit. */
export function resolveMoveX(box, dx, tilemap) {
  if (dx === 0) return false;
  const ts = tilemap.tileSize;
  const oldX = box.x;
  box.x += dx;
  const [ty0, ty1] = tileRange(box.y, box.y + box.h, ts);
  if (dx > 0) {
    const from = Math.floor((oldX + box.w) / ts);
    const to = Math.floor((box.x + box.w - EPS) / ts);
    for (let tx = from; tx <= to; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        if (tilemap.solidAt(tx, ty)) { box.x = tx * ts - box.w; return true; }
      }
    }
  } else {
    const from = Math.floor(oldX / ts);
    const to = Math.floor(box.x / ts);
    for (let tx = from; tx >= to; tx--) {
      for (let ty = ty0; ty <= ty1; ty++) {
        if (tilemap.solidAt(tx, ty)) { box.x = (tx + 1) * ts; return true; }
      }
    }
  }
  return false;
}

/**
 * Resolve vertical movement; mutates box.y. Sweeps crossed rows.
 * @returns {{hit:boolean, onGround:boolean, hitCeiling:boolean}}
 */
export function resolveMoveY(box, dy, tilemap) {
  if (dy === 0) return { hit: false, onGround: false, hitCeiling: false };
  const ts = tilemap.tileSize;
  const oldY = box.y;
  box.y += dy;
  const [tx0, tx1] = tileRange(box.x, box.x + box.w, ts);
  if (dy > 0) {
    const from = Math.floor((oldY + box.h) / ts);
    const to = Math.floor((box.y + box.h - EPS) / ts);
    for (let ty = from; ty <= to; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tilemap.solidAt(tx, ty)) { box.y = ty * ts - box.h; return { hit: true, onGround: true, hitCeiling: false }; }
      }
    }
  } else {
    const from = Math.floor(oldY / ts);
    const to = Math.floor(box.y / ts);
    for (let ty = from; ty >= to; ty--) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tilemap.solidAt(tx, ty)) { box.y = (ty + 1) * ts; return { hit: true, onGround: false, hitCeiling: true }; }
      }
    }
  }
  return { hit: false, onGround: false, hitCeiling: false };
}

/**
 * Move a box by (dx,dy) with full tile collision, X then Y.
 * @returns {{hitX:boolean, onGround:boolean, hitCeiling:boolean}}
 */
export function moveAndCollide(box, dx, dy, tilemap) {
  const hitX = resolveMoveX(box, dx, tilemap);
  const y = resolveMoveY(box, dy, tilemap);
  return { hitX, onGround: y.onGround, hitCeiling: y.hitCeiling };
}

/** True if a solid tile sits directly beneath the box (grounded check independent of motion). */
export function isGrounded(box, tilemap) {
  const ts = tilemap.tileSize;
  const [tx0, tx1] = tileRange(box.x, box.x + box.w, ts);
  const ty = Math.floor((box.y + box.h + EPS) / ts);
  for (let tx = tx0; tx <= tx1; tx++) if (tilemap.solidAt(tx, ty)) return true;
  return false;
}
