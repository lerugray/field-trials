// Sector themes — the per-sector "where am I" layer the M4 encounter grammar
// paints a level with. A theme is pure DATA: an atmosphere (fog color + draw
// distance), the accent palettes its props are tinted toward (background debris,
// foreground rock hazards, and the rescue pickup), plus a prop-density hint the
// scenery builder reads. No mechanics live here — themes never change what an
// enemy does, only how the sector looks. Clean-room names, no Nintendo places.
//
// Pure + headless-testable. The seeded pick is the only randomness; the palettes
// are hand-authored in the study's flat, few-color register.

import { makeRng } from '../core/rng.js';

// Every theme carries the same shape so callers can read it uniformly:
//   fog    : { color:[r,g,b], near, far }  — the atmosphere + draw limit
//   debris : [[r,g,b], ...]                — background rail-field palette
//   rock   : [[r,g,b], ...]                — foreground obstacle palette
//   pickup : [r,g,b]                       — the rescue-pod accent (a warm, safe
//                                            hue distinct from any hazard)
//   density: number (~0.7..1.3)            — scenery-density multiplier hint
//
// ART MIGRATION 2026-08-10 — three additive fields carry the approved r4 register
// (docs/art-poc/approval-record/). All three are VISUAL ONLY:
//
//   sky      : { top, mid, horizon, glow, stars } — the banded gradient the frames
//              read their silhouettes against. The warm horizon lip is what makes a
//              far ridge legible as a silhouette instead of dissolving into black.
//   ground   : [g0, g1, g2, g3]  — the terrain's height/albedo ramp, dark rock up to
//              a pale flat. Four steps, because the facet register reads value steps.
//   vistaFar : the draw limit for LANDSCAPE only (terrain, relief, structures).
//
// vistaFar exists so the horizon can be a real horizon without touching one combat
// number. fog.color/near/far are unchanged from the pre-migration build, deliberately:
// they underwrite test/enemy-visibility.test.js's engagement-legibility floor and the
// M14c "nothing shoots you from inside the fog" property. Landscape is not a target, so
// it may recede further; enemies fade exactly when they always did.
export const SECTORS = [
  {
    id: 'ashfall',
    name: 'Ashfall Reach',
    fog: { color: [0.10, 0.08, 0.09], near: 13, far: 58 },
    vistaFar: 210,
    sky: {
      top: [0.047, 0.075, 0.133],
      mid: [0.118, 0.204, 0.298],
      horizon: [0.502, 0.478, 0.463],
      glow: [0.816, 0.549, 0.329],
      stars: 1,
    },
    ground: [
      [0.157, 0.169, 0.192], [0.376, 0.329, 0.290],
      [0.588, 0.455, 0.337], [0.784, 0.639, 0.463],
    ],
    debris: [
      [0.34, 0.30, 0.28], [0.29, 0.25, 0.24],
      [0.40, 0.33, 0.28], [0.24, 0.21, 0.20],
    ],
    rock: [[0.46, 0.34, 0.27], [0.39, 0.30, 0.25], [0.33, 0.26, 0.23]],
    pickup: [0.45, 0.85, 0.70],
    density: 1.15,
  },
  {
    id: 'coldwater',
    name: 'Coldwater Verge',
    fog: { color: [0.05, 0.08, 0.13], near: 15, far: 66 },
    vistaFar: 230,
    sky: {
      top: [0.035, 0.063, 0.110],
      mid: [0.094, 0.180, 0.290],
      horizon: [0.404, 0.494, 0.549],
      glow: [0.396, 0.639, 0.784],
      stars: 1,
    },
    ground: [
      [0.137, 0.157, 0.184], [0.267, 0.325, 0.373],
      [0.400, 0.478, 0.529], [0.596, 0.671, 0.702],
    ],
    debris: [
      [0.26, 0.31, 0.38], [0.22, 0.27, 0.34],
      [0.30, 0.35, 0.42], [0.18, 0.23, 0.30],
    ],
    rock: [[0.30, 0.38, 0.44], [0.26, 0.33, 0.40], [0.22, 0.28, 0.35]],
    pickup: [0.55, 0.90, 0.60],
    density: 0.9,
  },
  {
    id: 'amberdrift',
    name: 'Amber Drift',
    fog: { color: [0.11, 0.09, 0.07], near: 14, far: 60 },
    vistaFar: 215,
    sky: {
      top: [0.055, 0.063, 0.106],
      mid: [0.165, 0.184, 0.267],
      horizon: [0.549, 0.471, 0.376],
      glow: [0.902, 0.620, 0.298],
      stars: 0.7,
    },
    ground: [
      [0.169, 0.157, 0.137], [0.396, 0.337, 0.243],
      [0.612, 0.494, 0.302], [0.827, 0.690, 0.435],
    ],
    debris: [
      [0.38, 0.33, 0.24], [0.33, 0.28, 0.21],
      [0.44, 0.37, 0.26], [0.28, 0.24, 0.19],
    ],
    rock: [[0.48, 0.38, 0.24], [0.42, 0.33, 0.22], [0.35, 0.28, 0.20]],
    pickup: [0.50, 0.88, 0.85],
    density: 1.0,
  },
  {
    id: 'nightglass',
    name: 'Nightglass Field',
    fog: { color: [0.07, 0.06, 0.11], near: 14, far: 62 },
    vistaFar: 220,
    // The set-piece register from the approved frame 2: a violet night with a wine
    // horizon, so a capital hull reads as a grey mass against a coloured sky.
    sky: {
      top: [0.035, 0.035, 0.086],
      mid: [0.133, 0.098, 0.212],
      horizon: [0.376, 0.235, 0.306],
      glow: [0.588, 0.282, 0.376],
      stars: 1,
    },
    ground: [
      [0.145, 0.137, 0.180], [0.310, 0.278, 0.373],
      [0.463, 0.412, 0.510], [0.643, 0.596, 0.675],
    ],
    debris: [
      [0.29, 0.26, 0.36], [0.24, 0.22, 0.31],
      [0.33, 0.29, 0.40], [0.19, 0.18, 0.26],
    ],
    rock: [[0.34, 0.29, 0.44], [0.29, 0.25, 0.39], [0.25, 0.22, 0.33]],
    pickup: [0.60, 0.90, 0.75],
    density: 1.05,
  },
];

// The sector for a run/level, chosen from the seed. Deterministic: the same seed
// always lands in the same sector (the seeded-world contract). A distinct salt
// keeps this draw from desyncing the grammar or roster streams.
export function pickSector(seed) {
  const rng = makeRng(String(seed) + ':sector');
  return SECTORS[rng.int(0, SECTORS.length - 1)];
}

// Look a theme up by id (falls back to the first sector for an unknown id).
export function sectorById(id) {
  return SECTORS.find((s) => s.id === id) || SECTORS[0];
}
