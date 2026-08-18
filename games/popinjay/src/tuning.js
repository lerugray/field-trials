// tuning.js — EVERY gameplay constant lives here, each with a one-line shape/feel
// comment (DESIGN-SEED §Stack). M0 pins the *structural* constants (sim rate, the
// logical view, the size-class table shape, the seed-pinned score values). The
// FEEL numbers (apex heights, horizontal speeds, split kick, wire speed) are
// authored at M1 against the golden feel tape — they are marked `M1:` and carry
// faithful-shape placeholders so nothing downstream reads `undefined`. A placeholder
// tuning number is expected scaffolding; a placeholder *shape* (art) is a defect.

// -- Simulation clock ---------------------------------------------------------
// Fixed-timestep deterministic sim (hard rule 6). 60 Hz: one tick = 1/60 s.
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

// -- Logical view -------------------------------------------------------------
// The sim/art is authored at a fixed logical resolution; the renderer letterboxes
// it into whatever the canvas is. The two proof viewports (hard rule 9) are
// 1280x800 and 1440x900; the logical field is 1280x800 so DPR-1 is 1:1.
export const VIEW = { w: 1280, h: 800 };

// -- Size classes (the split tree; DESIGN-SEED §Balloons) ---------------------
// Grand -> Parade -> Fair -> Penny -> pop. 1 Grand = 15 eventual hits, peak 8 Penny.
// `radius`/`apex`/`hspeed`/`kick` are FEEL numbers (M1 authors vs the golden tape);
// the values here are faithful-shape placeholders (bigger class = bigger radius,
// higher apex, slower horizontal — the reference's readable heavy-vs-skittery feel).
// `score` is SEED-PINNED (inverted by size) — not a placeholder.
export const CLASSES = {
  grand:  { order: 0, radius: 46, apex: 360, hspeed: 60, splitsInto: 'parade', score: 100 },
  parade: { order: 1, radius: 34, apex: 300, hspeed: 78, splitsInto: 'fair',   score: 200 },
  fair:   { order: 2, radius: 22, apex: 240, hspeed: 96, splitsInto: 'penny',  score: 400 },
  penny:  { order: 3, radius: 13, apex: 180, hspeed: 120, splitsInto: null,    score: 800 },
};
export const CLASS_ORDER = ['grand', 'parade', 'fair', 'penny'];

// Split kinematics (symmetric; M1 authors the real kick against the feel gate).
// Children launch with opposite horizontal velocities and a shared upward kick.
export const SPLIT = { kick: 210 /* M1: upward launch, px/s */ };

// -- The wire (signature verb; DESIGN-SEED §The wire) -------------------------
export const WIRE = {
  speed: 900,        // M1: px/s the wire climbs (swept-collision certified at M1)
  thickness: 4,      // px hitbox width
  bufferTicks: 9,    // ~150 ms fire buffer at 60 Hz
};

// -- The player (a walker, not an athlete; DESIGN-SEED §The player) ------------
export const PLAYER = {
  walkSpeed: 190,    // M1: px/s brisk walk
  climbSpeed: 150,   // M1: px/s ladder climb
  width: 30,         // px hitbox width (feel; centered on x)
  height: 56,        // px standing height (feetY - height = head/muzzle line)
  hearts: 3,         // baseline composure (one-hit is a chosen modifier only)
  iframeTicks: 90,   // M1: invulnerability window after a hit (~1.5 s)
};

// -- Composure hit (DESIGN-SEED M3: hearts + i-frames + knockback + hit-stop) -----
// A hit costs a heart, grants i-frames (outline-pulse, NOT flicker — rule 11), a
// clamped knockback, and a 200 ms hit-stop with the culprit balloon outlined AT the
// moment of impact (the lesson lands live, not on the scorecard).
export const HIT = {
  stopTicks: 12,      // ~200 ms freeze on impact (hit-stop)
  knockback: 260,     // px/s horizontal knockback (clamped)
  knockDecay: 0.85,   // per-tick knockback decay
  culpritTicks: 30,   // how long the culprit stays outlined after impact
};

// -- Physics ------------------------------------------------------------------
// Vertical launch velocity is DERIVED from apex each bounce (v = sqrt(2*g*apex))
// so periodicity is bit-exact regardless of terrain height (STUDY §1.2).
export const GRAVITY = 900; // M1: px/s^2 downward

// -- Chain / score windows (tick-denominated; DESIGN-SEED §Score vs tickets) --
export const CHAIN = {
  windowTicks: 90,   // ~1.5 s chain window; VISIBLE meter, never audio-only
  mult: [1, 2, 3, 4],// x2/x3/x4 escalation
};

// Stage-clear time bonus (vs par): a flat clear award + a per-second-under-par bonus.
export const SCORE = { clearBonusBase: 200, timeBonusPerSec: 50 };

// -- Drops (power items; DESIGN-SEED §Drops) ----------------------------------
// Popped balloons roll the drops stream; a drop FALLS, lands on the surface below,
// and expires after ~8 s with a blink warning. Legibility is silhouette-first with a
// post-pickup banner. Dynamite is gated (never while slow/freeze active, one airborne;
// implemented as a telegraphed beat cascade next increment).
export const DROPS = {
  chance: 0.18,          // per-pop chance to roll a drop
  ttlTicks: 8 * 60,      // ~8 s life
  blinkTicks: 2 * 60,    // blink in the last ~2 s
  radius: 14,
  gravity: 620,          // px/s^2 (drops fall gently)
  // Per-act weights (M4 authors per-locale tables; these are the working weights).
  weights: { medallion: 40, slow: 20, freeze: 14, shield: 16, dynamite: 10 },
  medallionScore: 500,
  slowTicks: 4 * 60, slowRate: 0.5,   // all balloons at 50% for 4 s
  freezeTicks: 2 * 60,                 // all balloons halted for 2 s
};

// Dynamite = a telegraphed BEAT CASCADE (STUDY §4.3), not an instant screen flip: a
// 1 s visible fuse, then every non-Penny balloon splits ONE class step per beat until
// all are Penny (split arithmetic preserved). Photosensitivity-bounded (beat-synced,
// no full-screen flash). Gated: never rolls while slow/freeze active, one airborne.
export const DYNAMITE = { fuseTicks: 60, beatTicks: 24 };

// -- Souvenir weapon-class params (DESIGN-SEED catalog; drafts are M4) ----------
// Gallery Sidearm: a 6-shot-per-stage pop-gun on a SECOND button — a fast bullet that
// pops the first balloon it meets and passes THROUGH platforms (no wall property). A
// sidearm BESIDE the wire, never a replacement.
export const SIDEARM = { ammo: 6, speed: 1400, radius: 5 };

// -- Locale mechanical acts (DESIGN-SEED §The loop: locales are ACTS, not palettes) --
// Locale 2 = WIND BANDS: fixed horizontal drift zones (drawn as bunting streams) that
// SHEAR parabolas horizontally but never touch the vertical arc — exact periodicity
// (the promise law) is preserved. Locale 3 = WEIGHTED GORES (a heavier variant class),
// authored next increment.
export const WIND = { bandSpeed: 95 };
// Locale 3 = WEIGHTED GORES: a heavier balloon variant (deeper, faster arcs, distinct
// spiked silhouette). Still exactly periodic (its own derived integer period).
export const GORE = { apexScale: 1.5, hspeedScale: 1.25 };
export const QUICK_SPOOL_SCALE = 1.4;   // Quick Spool: wire travels 40% faster
export const SKY_ANCHOR_TICKS = 4 * 60; // Sky Anchor: wire persists 4 s as a wall

// -- Panic Finale (DESIGN-SEED §Panic Finale) ---------------------------------
// Survive 90 s of escalating balloon RAIN: the spawn interval ramps from base→min
// over the clock. The curve is tuned so a souvenir-less baseline survives ~40%
// (M4 finale-baseline probe — a follow-up increment measures + tunes it).
export const FINALE = {
  survivalTicks: 90 * TICK_HZ,  // 90 s
  baseInterval: 105,            // ticks between rain drops at the start (~1.75 s)
  minInterval: 66,              // …ramping to ~1.1 s at the climax
  maxAirborne: 6,               // rain PAUSES at this airborne ceiling (bounds density → survivable)
  rehearsalTicks: 12 * TICK_HZ, // 12 s taught-first preview during interstitials
};

// -- Par (the bandstand clock — pressure, NOT failure; DESIGN-SEED §Stage pressure)
// M1 placeholder: a single flat par so the HUD dial is real. M2 DERIVES par per stage
// from the seeded roster (split-arithmetic + clearability), and past-par raises the
// bandstand tempo + flips the dial state (never audio-only).
export const PAR = { m1Seconds: 55 };

// -- Closing-bell drip (past-par pressure; DESIGN-SEED §Stage pressure + drip contract)
// Convergence is GUARANTEED: at most `maxPerStage` drip Pennies, spawning pauses at the
// active-balloon ceiling, and drip STOPS once the seeded roster lineage is cleared — so
// pressure can never make a stage uncleanable. Each drip is telegraphed (1.5 s corner
// warning) and enters at HALF speed, targeting the player's half (anti-camp).
export const DRIP = {
  maxPerStage: 6,
  telegraphTicks: 90,   // 1.5 s warning before a drip appears
  entryTicks: 60,       // half-speed entry window (~1 s)
  activeCeiling: 12,    // pause drip while this many balloons are aloft
  intervalTicks: 150,   // spacing between drip attempts past par
};
