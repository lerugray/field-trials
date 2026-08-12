// Round-1 overworld conformance. Terrain gets its own low-input luminance ramp:
// this replaces the superseded washed-field treatment at colour selection time,
// preserving large dark procedural masses without painting a dark veil over them.

import { hashInt } from './prng.js';

export const OVERWORLD_TERRAIN_LUMINANCE = Object.freeze([8, 15, 24, 36, 52, 78, 126]);
export const OVERWORLD_LANDMARK_LUMINANCE = Object.freeze([8, 17, 29, 47, 76, 126, 214]);
export const OVERWORLD_PARTY_LUMINANCE = Object.freeze([5, 14, 25, 45, 80, 150, 235]);
export const OVERWORLD_ROAD_LUMINANCE = 142;

export function overworldColor(palettes, scheme, shade, ramp = OVERWORLD_TERRAIN_LUMINANCE) {
  const i = Math.max(0, Math.min(ramp.length - 1, shade | 0));
  return palettes.luminanceToColor(scheme, ramp[i]);
}

function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }

/**
 * A stable, sweeping dotted road ending at the nearest city. Its far anchor sits
 * opposite the city across the starting country, so the road reads as one large
 * compositional gesture instead of a player-following decoration.
 */
export function overworldRoadPoints(start, sites, seed, spacing = 0.34) {
  const candidates = (sites || []).filter((site) => site.kind === 'city');
  const fallback = (sites || []).filter((site) => site.x !== start.x || site.y !== start.y);
  const target = (candidates.length ? candidates : fallback)
    .slice().sort((a, b) => distance(start, a) - distance(start, b))[0];
  if (!target) return [];

  let dx = target.x - start.x, dy = target.y - start.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  dx /= d; dy /= d;
  const side = (hashInt(start.x, start.y, seed ^ 0x726f6164) & 1) ? 1 : -1;
  const px = -dy * side, py = dx * side;
  const origin = { x: start.x - dx * 9 + px * 3.2, y: start.y - dy * 9 + py * 3.2 };
  const control = { x: start.x + px * 2.4, y: start.y + py * 2.4 };
  const lengthEstimate = distance(origin, control) + distance(control, target);
  const steps = Math.max(2, Math.ceil(lengthEstimate / spacing));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    points.push({
      x: u * u * origin.x + 2 * u * t * control.x + t * t * target.x,
      y: u * u * origin.y + 2 * u * t * control.y + t * t * target.y,
    });
  }
  return points;
}

