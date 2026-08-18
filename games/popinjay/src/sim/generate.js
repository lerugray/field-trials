// generate.js — the seeded STAGE GENERATOR (DESIGN-SEED M2: constraint-grammar
// layouts + seeded rosters). Pure sim, deterministic: generateStage(seed, locale,
// stage) always yields the same Stage. This increment produces a STRUCTURALLY valid
// layout (in-bounds, non-overlapping, every platform ladder-reachable, a safe roster
// opening, the 1-1 teaching constraints) with a validate → reroll → fallback policy.
// The CLEARABILITY bot, split-arithmetic density gate, and derived par land next.

import { VIEW, CLASS_ORDER, TICK_HZ, WIND } from '../tuning.js';
import { Stream } from '../engine/streams.js';
import { hashInt } from '../engine/prng.js';
import { Stage } from './stage.js';

// Eventual hit-count of one balloon of a class if fully resolved (split arithmetic):
// grand→15, parade→7, fair→3, penny→1 (2·child+1 down the tree).
const HITS = { grand: 15, parade: 7, fair: 3, penny: 1 };
export function hitsFor(cls) { return HITS[cls] || 1; }
export function rosterHits(spawns) { return spawns.reduce((n, s) => n + hitsFor(s.cls), 0); }

// Named CENTERPIECES — each locale's 4th stage is a quasi-boss set-piece (original
// names in-register). They pass the SAME validation contract as generated stages.
export const CENTERPIECE_NAMES = { 1: 'The Grand Carousel', 2: 'The Regatta', 3: 'The Avalanche' };

// The intended intensity band (total eventual hits) by difficulty — teaching is
// gentle; later stages ramp; CENTERPIECES are denser (a quasi-boss).
function densityBand(teaching, difficulty, centerpiece) {
  if (teaching) return { min: 3, max: 16 };
  const base = { min: 8, max: 22 + difficulty * 6 };
  return centerpiece ? { min: base.min + 8, max: base.max + 18 } : base;
}

// Heuristic par (the bandstand clock target). DERIVED from the split-arithmetic hit
// count — each hit costs roughly a wire cycle + reposition; par grants slack so it
// reads as pressure, not a bomb. M4's farm probe tunes the constant; a bot-measured
// par refinement lands with World integration.
function derivePar(totalHits) {
  return Math.round((totalHits * 42 + 300) * 1.5); // ticks
}

const GROUND_H = 60;                 // ground slab thickness
const PLAT_W = 240, PLAT_H = 22;     // platform footprint
const LADDER_W = 30;
const SPAWN_SAFE_R = 240;            // no roster balloon starts within this of the player
const MIN_GAP = 40;                  // min horizontal gap between same-row platforms
const REROLL_LIMIT = 24;

// A stable per-stage generation seed (independent of the in-run streams).
export function stageSeed(masterSeed, locale, stage) {
  return hashInt(locale & 0xffff, stage & 0xffff, masterSeed) >>> 0;
}

export function generateStage(masterSeed, { locale = 1, stage = 1 } = {}) {
  const teaching = locale === 1 && stage === 1;
  const base = stageSeed(masterSeed, locale, stage);

  // validate → reroll (advance the sub-seed) → fallback. Each reroll is a fresh,
  // fully deterministic attempt; the first structurally-valid layout wins.
  for (let attempt = 0; attempt < REROLL_LIMIT; attempt++) {
    const rng = new Stream((base + attempt * 0x9e3779b9) >>> 0);
    const stg = buildCandidate(rng, { masterSeed, locale, stage, teaching, attempt });
    if (validateStructure(stg).ok && validateDensity(stg).ok) return finalize(stg);
  }
  return finalize(fallbackStage(masterSeed, locale, stage)); // guaranteed-valid minimal layout
}

// Stamp the derived par + hit-count onto a finished stage's meta.
function finalize(stg) {
  const hits = rosterHits(stg.spawns);
  stg.meta.parHits = hits;
  stg.meta.parTicks = derivePar(hits);
  return stg;
}

// The Panic Finale arena: an open field with two symmetric cover platforms + ladders
// and NO seeded roster (balloons RAIN from the top; see World finale mode). Marked
// meta.finale so World runs the survival clock.
export function generateFinale({ endless = false } = {}) {
  const W = VIEW.w, H = VIEW.h, groundTop = H - GROUND_H;
  const stage = new Stage({
    bounds: { left: 0, right: W, top: 0, bottom: H },
    solids: [
      { id: 'ground', kind: 'ground', x0: 0, x1: W, top: groundTop, bottom: H },
      { id: 'plat-l', kind: 'platform', x0: 200, x1: 480, top: H - 300, bottom: H - 276 },
      { id: 'plat-r', kind: 'platform', x0: 800, x1: 1080, top: H - 300, bottom: H - 276 },
    ],
    ladders: [
      { id: 'lad-l', x0: 210, x1: 240, top: H - 300, bottom: groundTop },
      { id: 'lad-r', x0: 1040, x1: 1070, top: H - 300, bottom: groundTop },
    ],
    spawns: [],
    meta: { locale: 3, stage: endless ? 'endless' : 'finale', teaching: false, playerSpawnX: W * 0.5, groundTop, finale: true, endless, parTicks: 90 * 60 },
  });
  return stage;
}

// The split-arithmetic density gate (a reroll criterion).
export function validateDensity(stg) {
  const band = densityBand(!!stg.meta.teaching, stg.meta.difficulty || 1, !!stg.meta.centerpiece);
  const hits = rosterHits(stg.spawns);
  const ok = hits >= band.min && hits <= band.max;
  return { ok, hits, band, reasons: ok ? [] : [`density ${hits} outside [${band.min},${band.max}]`] };
}

// ---- the constraint grammar -------------------------------------------------
function buildCandidate(rng, ctx) {
  const { locale, stage, teaching } = ctx;
  const W = VIEW.w, H = VIEW.h, groundTop = H - GROUND_H;
  const difficulty = teaching ? 0 : (locale - 1) * 4 + stage; // 1..12-ish
  const solids = [{ id: 'ground', kind: 'ground', x0: 0, x1: W, top: groundTop, bottom: H }];
  const ladders = [];

  // Platforms on DISTINCT rows (so vertical overlap is impossible), random x.
  const rows = shuffle(rng, [H - 250, H - 380, H - 510]);
  const nPlat = teaching ? 0 : Math.min(3, 1 + rng.int(2 + Math.floor(difficulty / 3)));
  const breakableChance = teaching ? 0 : Math.min(0.5, 0.15 + difficulty * 0.03);

  for (let i = 0; i < nPlat; i++) {
    const top = rows[i];
    const x0 = 90 + rng.int(Math.max(1, W - 180 - PLAT_W));
    const kind = (rng.next() < breakableChance) ? 'breakable' : 'platform';
    const solid = { id: `${kind === 'breakable' ? 'brk' : 'plat'}-${i}`, kind, x0, x1: x0 + PLAT_W, top, bottom: top + PLAT_H, intact: true };
    solids.push(solid);
    // Ladder at whichever end has a clear column down to the ground.
    const leftX = x0 + 6, rightX = x0 + PLAT_W - 6 - LADDER_W;
    const cand = rng.next() < 0.5 ? [leftX, rightX] : [rightX, leftX];
    const lx = cand.find((x) => columnClearToGround(solids, x + LADDER_W / 2, top, solid));
    if (lx != null) ladders.push({ id: `lad-${i}`, x0: lx, x1: lx + LADDER_W, top, bottom: groundTop });
  }

  // Player spawn: an open ground column clear of platforms overhead-ish (any ground
  // column works for standing; we just avoid spawning directly under low cover).
  const playerSpawnX = pickOpenColumn(rng, W, solids);

  // Roster: seeded balloons, class-bounded, with a SAFE OPENING around the spawn.
  // A CENTERPIECE (each locale's 4th stage) is a denser quasi-boss.
  const centerpiece = !teaching && stage === 4; // each locale's 4th stage
  const maxOrder = teaching ? 1 /* Parade cap */ : 0 /* Grand allowed */;
  const nB = teaching ? (1 + rng.int(2)) : (1 + rng.int(1 + Math.floor(difficulty / 2)) + (centerpiece ? 2 : 0));
  const spawns = [];
  let guard = 0;
  while (spawns.length < nB && guard++ < 200) {
    const cls = pickClass(rng, maxOrder);
    const x = 120 + rng.int(W - 240);
    if (Math.abs(x - playerSpawnX) < SPAWN_SAFE_R) continue; // safe opening
    const y = 150 + rng.int(220);
    // Locale-3 mechanical ACT: WEIGHTED GORES (the whole roster is heavier).
    spawns.push({ cls, x, y, vxSign: rng.next() < 0.5 ? -1 : 1, weighted: locale === 3 });
  }

  // Locale-2 mechanical ACT: a WIND BAND (a mid-air horizontal drift zone). Deterministic
  // direction + band from the rng; a single band keeps 2-1 readable, more can follow.
  const windBands = [];
  if (locale === 2) {
    const bandTop = H * (0.30 + rng.next() * 0.15);
    const dir = rng.next() < 0.5 ? -1 : 1;
    windBands.push({ y0: bandTop, y1: bandTop + H * 0.22, vx: dir * WIND.bandSpeed });
  }

  return new Stage({
    bounds: { left: 0, right: W, top: 0, bottom: H },
    solids, ladders, spawns, windBands,
    meta: { locale, stage, teaching, playerSpawnX, groundTop, difficulty, centerpiece, centerpieceName: centerpiece ? CENTERPIECE_NAMES[locale] : null },
  });
}

// A guaranteed-valid minimal layout (the reroll fallback — never ship a broken stage).
export function fallbackStage(masterSeed, locale, stage) {
  const W = VIEW.w, H = VIEW.h, groundTop = H - GROUND_H;
  return new Stage({
    bounds: { left: 0, right: W, top: 0, bottom: H },
    solids: [
      { id: 'ground', kind: 'ground', x0: 0, x1: W, top: groundTop, bottom: H },
      { id: 'plat-0', kind: 'platform', x0: W * 0.5 - PLAT_W / 2, x1: W * 0.5 + PLAT_W / 2, top: H - 380, bottom: H - 380 + PLAT_H },
    ],
    ladders: [{ id: 'lad-0', x0: W * 0.5 - PLAT_W / 2 + 6, x1: W * 0.5 - PLAT_W / 2 + 6 + LADDER_W, top: H - 380, bottom: groundTop }],
    spawns: [{ cls: locale === 1 && stage === 1 ? 'parade' : 'grand', x: W * 0.25, y: 200, vxSign: 1 }],
    meta: { locale, stage, teaching: locale === 1 && stage === 1, playerSpawnX: W * 0.72, groundTop, fallback: true },
  });
}

// ---- the structural validator (the reroll gate) -----------------------------
export function validateStructure(stg) {
  const reasons = [];
  const B = stg.bounds;
  const plats = stg.solids.filter((s) => s.kind !== 'ground');

  for (const s of stg.solids) {
    if (s.x0 < B.left - 1 || s.x1 > B.right + 1 || s.top < B.top - 1 || s.bottom > B.bottom + 1) reasons.push(`solid ${s.id} out of bounds`);
  }
  // No two non-ground solids overlap (with a min gap when co-planar).
  for (let i = 0; i < plats.length; i++) {
    for (let j = i + 1; j < plats.length; j++) {
      if (rectsOverlap(plats[i], plats[j], MIN_GAP)) reasons.push(`solids ${plats[i].id}/${plats[j].id} overlap`);
    }
  }
  // Every platform/breakable is reachable: a ladder whose top is at its level and
  // whose column lies within its span, reaching down to the ground or a lower solid.
  for (const p of plats) {
    const served = stg.ladders.some((l) => Math.abs(l.top - p.top) < 2 && l.x0 >= p.x0 - 2 && l.x1 <= p.x1 + 2 && l.bottom > l.top);
    if (!served) reasons.push(`platform ${p.id} unreachable (no ladder)`);
  }
  // Roster: in bounds, above the ground, and clear of the player's safe opening.
  const gt = stg.meta.groundTop != null ? stg.meta.groundTop : (B.bottom - GROUND_H);
  for (const sp of stg.spawns) {
    if (sp.x < B.left || sp.x > B.right) reasons.push('roster balloon out of bounds');
    if (sp.y != null && sp.y > gt) reasons.push('roster balloon starts below the ground');
    if (Math.abs(sp.x - stg.meta.playerSpawnX) < SPAWN_SAFE_R - 1) reasons.push('roster violates the safe opening');
  }
  if (stg.spawns.length === 0) reasons.push('empty roster');
  // Teaching constraints (1-1): at most Parade class, no breakables.
  if (stg.meta.teaching) {
    if (stg.solids.some((s) => s.kind === 'breakable')) reasons.push('teaching stage has a breakable');
    for (const sp of stg.spawns) if (orderOf(sp.cls) < 1) reasons.push('teaching stage has a Grand');
  }
  return { ok: reasons.length === 0, reasons };
}

// ---- helpers ----------------------------------------------------------------
function pickClass(rng, maxOrder) {
  // `maxOrder` is the smallest order number allowed = the BIGGEST size allowed
  // (grand=0). Allowed = classes at or below that size (order >= maxOrder). pool[0]
  // is the biggest allowed; bias toward it (bigger = more splits = more density).
  const pool = CLASS_ORDER.filter((c) => orderOf(c) >= maxOrder);
  const p = pool.length ? pool : [CLASS_ORDER[CLASS_ORDER.length - 1]];
  return rng.next() < 0.55 ? p[0] : rng.pick(p);
}
function orderOf(cls) { return CLASS_ORDER.indexOf(cls); }

function columnClearToGround(solids, x, fromTop, self) {
  // A ladder column is clear if no OTHER platform spans x strictly below fromTop.
  for (const s of solids) {
    if (s === self || s.kind === 'ground') continue;
    if (x >= s.x0 && x <= s.x1 && s.top > fromTop + 1) return false;
  }
  return true;
}

function pickOpenColumn(rng, W, solids) {
  for (let tries = 0; tries < 40; tries++) {
    const x = 120 + rng.int(W - 240);
    if (!solids.some((s) => s.kind !== 'ground' && x >= s.x0 - 20 && x <= s.x1 + 20)) return x;
  }
  return W * 0.72;
}

function rectsOverlap(a, b, gap) {
  return a.x0 < b.x1 + gap && a.x1 + gap > b.x0 && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
