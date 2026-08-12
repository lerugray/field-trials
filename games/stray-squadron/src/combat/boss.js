// The run climax — a rail boss. M8's headline: a complete run can now END, in
// victory or death, at a boss encounter with READABLE telegraphs. This module is
// the pure state machine (no rendering, no timing beyond dt): the boss holds at an
// arena station ahead of the ship, cycles telegraph -> attack -> recover, escalates
// through phases as its hull drops, and is defeated when its hull hits zero.
//
// Two laws shape every attack:
//   - Fairness. Every attack is TELEGRAPHED (a wind-up no shorter than a reaction
//     floor) and every bolt pattern leaves a clear dodge lane inside the reachable
//     steer frame. `clearGap` is the machine proof (test/boss.test.js audits it over
//     phases, seeds, and ship positions) — no seed hands you an unavoidable hit.
//   - Readability. The telegraph and the phase are SHAPE + count cues the HUD draws
//     (a filling warning arc, a labelled attack name, phase pips), never colour
//     alone (accessibility law). Reduced motion damps the pulse, never the warning.
//
// The all-range (free-flight) boss stays the DESIGN-SEED stretch cut: this is the
// required rail boss, and it is the whole M8 deliverable.

import { makeRng } from '../core/rng.js';
import { spawnProjectile, projectileHits, PROJECTILE } from './projectiles.js';
import { DAMAGE } from './combat.js';
import { FLIGHT } from '../flight/flight.js';

export const BOSS = {
  standoffS: 32,      // how far ahead of the ship the boss holds while fighting
  activateS: 150,     // ship-to-boss gap at which the fight begins (it looms first)
  radius: 3.4,        // big hostile core; player bolts converge to center -> hittable
  baseHp: 46,         // total hull at threat 1
  hpPerThreat: 16,    // + this much hull per threat rank above 1
  phaseCount: 3,      // escalation stages (hull thirds)
  score: 2200,        // the climax payoff (dominates the boss level's potential)
  // Fairness floors, shared by the runtime and the audit test:
  minTelegraph: 0.85, // no wind-up shorter than this (reaction time)
  clearRadius: 1.05,  // shipRadius(0.7)+boltRadius(0.32) — a real dodge lane must fit
};

// Per-phase timing + the attack pool it draws from. Later phases wind up faster and
// mix denser patterns, but the telegraph never dips under BOSS.minTelegraph and every
// pattern is still built around a clear lane — escalation is pace, never unfairness.
const PHASES = [
  { telegraph: 1.5,  recover: 1.4, pool: ['aimed', 'fan'] },
  { telegraph: 1.15, recover: 1.05, pool: ['fan', 'pillars', 'aimed'] },
  { telegraph: 0.9,  recover: 0.8, pool: ['pillars', 'fan', 'aimed'] },
];

// The reachable steer frame (a touch inside the hard clamp so a lane sits comfortably
// on-screen, not pinned to the very edge).
const FRAME_X = FLIGHT.steerRangeX - 0.5;   // ~2.9
const FRAME_Y = FLIGHT.steerRangeY - 0.35;  // ~1.75

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Build a boss for a run's final node. Deterministic from the seed. `arenaS` is the
// station the boss holds at (the runtime places it near the level end); `threat`
// (1-3, the node's threat) scales its hull so the last sector reads hardest.
export function createBoss(seed, { arenaS = 1330, threat = 3 } = {}) {
  const maxHp = BOSS.baseHp + BOSS.hpPerThreat * Math.max(0, threat - 1);
  return {
    rng: makeRng(String(seed) + ':boss'),
    s: arenaS,
    lat: 0, vert: 0,      // holds at rail center; player bolts converge here
    radius: BOSS.radius,
    maxHp,
    hp: maxHp,
    phaseCount: BOSS.phaseCount,
    phase: 1,
    score: BOSS.score,
    mode: 'dormant',      // 'dormant'|'telegraph'|'attack'|'recover'|'defeated'
    timer: 0,
    telegraphDur: 0,
    attackKind: null,     // the pattern currently winding up / just fired (for the HUD)
    pending: [],          // S7: the exact bolt lanes committed for this telegraph (HUD ghosts them)
    hitFlash: 0,          // brief per-hit visual pulse (runtime reads, decays)
    phaseChanged: false,  // one-shot: set when the phase advances, cleared by reader
    defeated: false,
  };
}

// Which phase a boss is in for its current hull (1..phaseCount). Phase 1 in the top
// hull third, escalating as hull drops.
export function phaseForHp(boss) {
  const frac = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  const p = 1 + Math.floor((1 - frac) * boss.phaseCount - 1e-9);
  return clamp(p, 1, boss.phaseCount);
}

// --- attack patterns: each returns a list of frame offsets { lat, vert } the boss
// will fire a bolt at. All three are built around a guaranteed clear lane so the
// player, given the telegraph, can always be somewhere safe. `ship` is a snapshot of
// the player's current offset (for aimed shots).

// Aimed volley — bolts converge on where the ship IS at fire time (like a gunner,
// scaled up). Dodge by moving off that snapshot after the wind-up.
function aimedPattern(ship, rng) {
  const l = clamp(ship.lat, -FRAME_X, FRAME_X);
  const v = clamp(ship.vert, -FRAME_Y, FRAME_Y);
  const spread = 0.55 + rng.range(0, 0.2);
  return [
    { lat: l, vert: v },
    { lat: clamp(l + spread, -FRAME_X, FRAME_X), vert: clamp(v + 0.22, -FRAME_Y, FRAME_Y) },
    { lat: clamp(l - spread, -FRAME_X, FRAME_X), vert: clamp(v - 0.22, -FRAME_Y, FRAME_Y) },
  ];
}

// Horizontal fan — a row of bolts across the width at one height, with one lane left
// open. Dodge into the open lane (or simply to a different height).
function fanPattern(ship, rng) {
  const n = 7;
  const gap = rng.int(1, n - 2);            // never the very edge, so the lane is usable
  const vert = clamp([-0.9, 0, 0.9][rng.int(0, 2)], -FRAME_Y, FRAME_Y);
  const bolts = [];
  for (let i = 0; i < n; i++) {
    if (i === gap) continue;                // the guaranteed open lane
    const lat = -FRAME_X + (2 * FRAME_X) * (i / (n - 1));
    bolts.push({ lat, vert });
  }
  return bolts;
}

// Vertical pillars — columns of bolts at several widths, with one column omitted.
// Dodge horizontally into the missing column (clear at every height).
function pillarsPattern(ship, rng) {
  const lats = [-2.4, -1.2, 0, 1.2, 2.4];
  const gap = rng.int(0, lats.length - 1);
  const verts = [-1.5, 0, 1.5];
  const bolts = [];
  for (let i = 0; i < lats.length; i++) {
    if (i === gap) continue;
    for (const vert of verts) bolts.push({ lat: clamp(lats[i], -FRAME_X, FRAME_X), vert: clamp(vert, -FRAME_Y, FRAME_Y) });
  }
  return bolts;
}

const PATTERNS = { aimed: aimedPattern, fan: fanPattern, pillars: pillarsPattern };

// Generate the bolt offsets for a named pattern (exposed for the fairness audit).
export function bossPattern(kind, ship, rng) {
  return (PATTERNS[kind] || aimedPattern)(ship, rng);
}

// The best dodge the frame offers against a set of bolt offsets: the largest
// clearance (distance to the nearest bolt) available at any reachable point, and
// where it is. A pattern is fair iff this clearance >= BOSS.clearRadius. Grid search
// is exhaustive enough at this resolution for a proof and cheap enough to run per
// pattern in the test.
export function clearGap(bolts, opts = {}) {
  const rangeX = opts.rangeX != null ? opts.rangeX : FLIGHT.steerRangeX;
  const rangeY = opts.rangeY != null ? opts.rangeY : FLIGHT.steerRangeY;
  const step = opts.step != null ? opts.step : 0.15;
  const boltR = opts.boltRadius != null ? opts.boltRadius : PROJECTILE.radius;
  let best = -1, bestPt = { lat: 0, vert: 0 };
  for (let lat = -rangeX; lat <= rangeX + 1e-6; lat += step) {
    for (let vert = -rangeY; vert <= rangeY + 1e-6; vert += step) {
      let near = Infinity;
      for (const b of bolts) {
        const dl = lat - b.lat, dv = vert - b.vert;
        const d = Math.sqrt(dl * dl + dv * dv) - boltR; // clearance to the bolt edge
        if (d < near) near = d;
      }
      if (near > best) { best = near; bestPt = { lat, vert }; }
    }
  }
  return { clearance: best, point: bestPt };
}

function pickAttack(boss) {
  const pool = PHASES[boss.phase - 1].pool;
  return pool[boss.rng.int(0, pool.length - 1)];
}

function enterTelegraph(boss, ship) {
  boss.attackKind = pickAttack(boss);
  // S7: COMMIT the exact bolt lanes at telegraph start (aimed snapshots the ship HERE),
  // so the HUD can ghost the real lanes during the wind-up and the player can dodge by
  // pre-positioning. The rng draws in the same order as before (pickAttack then pattern),
  // so determinism is unchanged; only the aimed snapshot moves earlier (fairer).
  boss.pending = bossPattern(boss.attackKind, ship || { lat: 0, vert: 0 }, boss.rng);
  boss.telegraphDur = Math.max(BOSS.minTelegraph, PHASES[boss.phase - 1].telegraph);
  boss.timer = boss.telegraphDur;
  boss.mode = 'telegraph';
}

// Advance the boss by dt against the ship snapshot { s, lat, vert }. Returns the
// list of bolt SPECS fired this step ({ s, lat, vert }) — usually empty, non-empty
// only on the frame a telegraph completes. The runtime turns each into an enemy
// projectile. Also surfaces one-shot events on the returned object for the HUD/audio.
export function updateBoss(boss, ship, dt) {
  const out = { bolts: [], justActivated: false, fired: null };
  if (boss.defeated) { boss.mode = 'defeated'; return out; }
  dt = clamp(dt || 0, 0, 0.1);
  if (boss.hitFlash > 0) boss.hitFlash = Math.max(0, boss.hitFlash - dt * 3);

  // Loom, then wake when the ship closes into the arena.
  if (boss.mode === 'dormant') {
    if (ship && boss.s - ship.s <= BOSS.activateS) {
      out.justActivated = true;
      enterTelegraph(boss, ship);
    }
    return out;
  }

  boss.timer -= dt;
  if (boss.mode === 'telegraph') {
    if (boss.timer <= 0) {
      // fire the lanes committed at telegraph start (S7 — the same ones the HUD ghosted)
      for (const o of boss.pending) out.bolts.push({ s: boss.s, lat: o.lat, vert: o.vert });
      out.fired = boss.attackKind;
      boss.pending = [];
      boss.mode = 'recover';
      boss.timer = PHASES[boss.phase - 1].recover;
    }
  } else if (boss.mode === 'recover') {
    if (boss.timer <= 0) enterTelegraph(boss, ship);
  }
  return out;
}

// The telegraph read for the HUD: 0 when not winding up, ramping to 1 as the attack
// lands. The HUD fills a warning arc by this and labels boss.attackKind.
export function telegraphProgress(boss) {
  if (boss.mode !== 'telegraph' || boss.telegraphDur <= 0) return 0;
  return clamp(1 - boss.timer / boss.telegraphDur, 0, 1);
}

// Apply damage to the boss hull; advances the phase across a third-boundary and
// flags the change. Returns true on the killing blow.
export function damageBoss(boss, dmg) {
  if (boss.defeated || dmg <= 0) return false;
  boss.hp = Math.max(0, boss.hp - dmg);
  boss.hitFlash = 1;
  const np = phaseForHp(boss);
  if (np !== boss.phase) { boss.phase = np; boss.phaseChanged = true; }
  if (boss.hp <= 0) { boss.defeated = true; boss.mode = 'defeated'; return true; }
  return false;
}

// Resolve every live PLAYER bolt against the boss sphere. On a hit the bolt is spent
// and the boss takes bolt/charged-bolt damage (+ the Blaster Coils bonus). Pure: the
// runtime spawns the hit spark and the defeat burst from the returned counts. One
// bolt hits at most once. Returns { hits, killed }.
export function resolveBossHits(projectiles, boss, boltBonus = 0) {
  if (!boss || boss.defeated) return { hits: 0, killed: false };
  const bonus = boltBonus > 0 ? boltBonus : 0;
  let hits = 0, killed = false;
  for (const p of projectiles.list) {
    if (p.dead || p.team !== 'player') continue;
    if (!projectileHits(p, boss, boss.radius)) continue;
    p.dead = true;
    hits++;
    const dmg = (p.charged ? DAMAGE.chargedBolt : DAMAGE.bolt) + bonus;
    if (damageBoss(boss, dmg)) { killed = true; break; }
  }
  return { hits, killed };
}

// Read + clear the one-shot phase-change flag (the runtime uses it to fire a cue).
export function takePhaseChange(boss) {
  if (boss.phaseChanged) { boss.phaseChanged = false; return true; }
  return false;
}
