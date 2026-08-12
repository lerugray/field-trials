// palettes.js — per-sphere palette TABLES (art law: "solid saturated colors, 5-7 hue
// palette PER SPHERE (act-themed, committed as palette tables)"). Pure DATA, no THREE
// import — so `node --test` reads it with no WebGL and the sim can pick a palette index
// deterministically from the sphere number (never RNG; palette choice is not gameplay).
//
// Nine spheres, three acts of three. Each act is a hue FAMILY that shifts as the ascent
// climbs (dawn carnival → orchard twilight → cosmic dusk), each sphere a variation on its
// act so the sky reads as one continuous, deepening climb. Every entry carries the exact
// keys the renderer consumes (sky gradient, island cap + two strata bands, three floater
// hues, the landing-ring accent). Sphere 1 keeps the M1 "dawn carnival" look for continuity.

// The nine committed palettes. Index 0 = sphere 1 (the teaching sphere).
export const PALETTES = [
  // ---- Act 1 — dawn carnival (bright, warm, kind). ----
  { name: 'Dawn Fair', act: 0,
    skyTop: '#5fc9ff', skyBot: '#ffe9b0', cap: '#68d06a', strataA: '#c98a5a', strataB: '#a86a42',
    floatA: '#ff6b8a', floatB: '#ffd23f', floatC: '#7b6bff', ring: '#ffd23f' },
  { name: 'Meadow Rise', act: 0,
    skyTop: '#78d2ff', skyBot: '#ffd98f', cap: '#7ad86f', strataA: '#cf9463', strataB: '#9d6238',
    floatA: '#ff8f6b', floatB: '#ffe14a', floatC: '#6bd0ff', ring: '#ffe14a' },
  { name: 'Sunbell Peak', act: 0,
    skyTop: '#9fe0ff', skyBot: '#ffcf7a', cap: '#8ee06a', strataA: '#d79a5c', strataB: '#a05f34',
    floatA: '#ff7aa0', floatB: '#ffc93f', floatC: '#7ce0c0', ring: '#ffc93f' },

  // ---- Act 2 — orchard twilight (cooler, plummy, teal). ----
  { name: 'Plum Orchard', act: 1,
    skyTop: '#7f8cff', skyBot: '#ffc0d8', cap: '#5fc59a', strataA: '#9a6bb0', strataB: '#6b4586',
    floatA: '#ff7ac2', floatB: '#ffd166', floatC: '#66e0d0', ring: '#ffd166' },
  { name: 'Teal Hollow', act: 1,
    skyTop: '#5aa9ff', skyBot: '#c8b6ff', cap: '#3fbfa0', strataA: '#7f6bc0', strataB: '#4f3f86',
    floatA: '#ff8fd0', floatB: '#ffe07a', floatC: '#4fd6c8', ring: '#ffe07a' },
  { name: 'Amethyst Gap', act: 1,
    skyTop: '#8a7bff', skyBot: '#ffb0e0', cap: '#54c58f', strataA: '#a85fc0', strataB: '#6a3a90',
    floatA: '#ff6bd0', floatB: '#ffcf5a', floatC: '#7ad0ff', ring: '#ffcf5a' },

  // ---- Act 3 — cosmic dusk (deep, saturated, star-glow accents). ----
  { name: 'Cobalt Reach', act: 2,
    skyTop: '#3a56d0', skyBot: '#ff9ac8', cap: '#4fb0d8', strataA: '#5a5fc0', strataB: '#343a90',
    floatA: '#ff6bb0', floatB: '#ffd23f', floatC: '#7affe0', ring: '#ffd23f' },
  { name: 'Nebula Steps', act: 2,
    skyTop: '#5a3ad0', skyBot: '#ffb0e8', cap: '#6a8fe0', strataA: '#8a4fc8', strataB: '#4a2a86',
    floatA: '#ff7ae0', floatB: '#ffe07a', floatC: '#5fd0ff', ring: '#ffe07a' },
  { name: 'Crown of Heaven', act: 2,
    skyTop: '#2a2a80', skyBot: '#f99ac9', cap: '#8fa0ff', strataA: '#6a4fd0', strataB: '#3a2a80',
    floatA: '#ff8fd0', floatB: '#ffd23f', floatC: '#9affe0', ring: '#fff0a0' },
];

// The keys every palette must carry (renderer contract). skyTop+skyBot are the sky
// gradient; cap+strataA+strataB the island body; floatA/B/C the decorative floaters;
// ring the landing accent. That's 8 distinct hue slots (>5, <=7 unique families).
export const PALETTE_KEYS = ['skyTop', 'skyBot', 'cap', 'strataA', 'strataB', 'floatA', 'floatB', 'floatC', 'ring'];

// Number of spheres in a full ascent (3 acts × 3) — the palette table length is law-locked to it.
export const SPHERE_COUNT = 9;

// Deterministic palette for a sphere index (0-based). Clamps out-of-range indices to the
// last palette so a stray sphere number can never crash the renderer (fails soft, not loud —
// palette choice is cosmetic, not a gameplay guarantee).
export function paletteForSphere(index) {
  const i = Math.max(0, Math.min(PALETTES.length - 1, index | 0));
  return PALETTES[i];
}

// The act (0..2) a sphere belongs to. Act = floor(index / 3); each act's third sphere is the
// boss/elite gate (structure lands at M4, but the palette family already marks the act).
export function actForSphere(index) {
  return Math.floor(Math.max(0, index | 0) / 3);
}
