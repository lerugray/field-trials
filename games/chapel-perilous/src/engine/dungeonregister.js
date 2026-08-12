// M5 VISUAL REGISTER — distinct 3D dungeon registers.
//
// The dungeon stays a first-person grid crawl (Cyclopean wireframe/fill), but
// each dungeon is dressed in one of several IDENTIFIABLY DIFFERENT visual
// registers — different shade palettes, wall fill patterns, edge/line weight,
// ceiling & floor treatment — selected deterministically from the dungeon seed.
// Two different sites therefore read as visibly different places.
//
// This module is pure/data (no canvas): it owns the register table, the seeded
// pick, and the per-depth shade math. main.js's renderFP consumes the style.

// Each register:
//   pattern    : wall-face dressing — 'brick'|'hatch'|'grid'|'stipple'|'none'
//   wallNear   : wall shade at z=0 (nearest slice)
//   wallFar    : wall shade at the far slice (interpolated between)
//   ceil, floor: ceiling / floor band shades
//   edge       : draw wall-quad outlines (the wireframe look) when true
//   edgeShade  : outline shade;  edgeWidth: px line weight
//   accent     : shade for the fill pattern lines/dots
//   floorLines : draw receding perspective lines on the floor when true
export const REGISTERS = [
  {
    id: 'cyclopean-stone', name: '[SEED] Cyclopean Stone',
    pattern: 'brick', wallNear: 5, wallFar: 1, ceil: 2, floor: 3,
    edge: true, edgeShade: 6, edgeWidth: 2, accent: 1, floorLines: false,
  },
  {
    id: 'hollow-wire', name: '[SEED] Hollow Wire',
    pattern: 'none', wallNear: 1, wallFar: 0, ceil: 0, floor: 1,
    edge: true, edgeShade: 6, edgeWidth: 3, accent: 6, floorLines: true,
  },
  {
    id: 'fleshy-hatch', name: '[SEED] Fleshy Hatch',
    pattern: 'hatch', wallNear: 4, wallFar: 1, ceil: 3, floor: 2,
    edge: false, edgeShade: 5, edgeWidth: 1, accent: 6, floorLines: false,
  },
  {
    id: 'bureau-grid', name: '[SEED] Bureau Grid',
    pattern: 'grid', wallNear: 4, wallFar: 2, ceil: 3, floor: 4,
    edge: true, edgeShade: 5, edgeWidth: 1, accent: 2, floorLines: true,
  },
  {
    id: 'abyssal-stipple', name: '[SEED] Abyssal Stipple',
    pattern: 'stipple', wallNear: 6, wallFar: 1, ceil: 1, floor: 2,
    edge: false, edgeShade: 6, edgeWidth: 1, accent: 3, floorLines: false,
  },
];

// Deterministic register for a dungeon seed (stable per site).
export function styleFor(seed) {
  const s = (seed >>> 0) % REGISTERS.length;
  return REGISTERS[s];
}

export function registerById(id) {
  return REGISTERS.find((r) => r.id === id) || null;
}

// Wall shade at depth slice z (0..maxDepth): interpolate near→far by z.
export function wallShadeAt(reg, z, maxDepth) {
  const t = maxDepth > 0 ? Math.min(1, z / maxDepth) : 0;
  const v = Math.round(reg.wallNear + (reg.wallFar - reg.wallNear) * t);
  return Math.max(0, Math.min(6, v));
}
