// SHOELEATHER — geometry helpers (logical-resolution space).
//
// Coordinates are in the fixed logical resolution of the world raster. The browser
// layer maps device pixels back to this space before hit-testing, so hotspot bounds
// are art-space and survive any integer upscale factor.

export function rect(x, y, w, h) {
  if (![x, y, w, h].every(Number.isFinite)) {
    throw new TypeError(`rect needs finite numbers, got ${x},${y},${w},${h}`);
  }
  if (w < 0 || h < 0) throw new RangeError('rect w/h must be non-negative');
  return { x, y, w, h };
}

export function contains(r, px, py) {
  return px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h;
}

export function center(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function area(r) {
  return r.w * r.h;
}

// Squared distance from a point to the nearest edge/interior of a rect (0 if inside).
export function dist2ToRect(r, px, py) {
  const dx = px < r.x ? r.x - px : px > r.x + r.w ? px - (r.x + r.w) : 0;
  const dy = py < r.y ? r.y - py : py > r.y + r.h ? py - (r.y + r.h) : 0;
  return dx * dx + dy * dy;
}
