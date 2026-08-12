// scorecard.js — the CARNIVAL SCORECARD + ticket payout (M4 — The Ascent). Death files a
// CAUSAL run report (design spine: "a causal run report: sphere reached, what killed you,
// the caprice line that shaped it"); clearing sphere 9 files the same report as a VICTORY
// at a premium ticket multiplier (studio fold: "clearing sphere 9 = a VICTORY scorecard,
// same causal format, banks tickets at a premium multiplier"). Pure + deterministic from
// the world state — no WebGL, no wall clock; imports only tuning + the caprice pool (never
// world.js, so no import cycle).

import { tuning } from './tuning.js';
import { CAPRICE_BY_ID } from './caprices.js';

// Friendly cause labels for the "what killed you" line (silhouette-named archetypes, not
// SCE names — clean-room). `net` is the long fall (the updraft toll finally emptied HP).
export const CAUSE_LABELS = {
  drifter: 'a Drifter',
  turret: 'a Turret-Flower',
  hopper: 'a Hopper',
  swooper: 'a Swooper',
  boss: 'the Gatekeeper',
  net: 'the long fall',
};

export function causeLabel(cause) {
  return CAUSE_LABELS[cause] || 'the sky itself';
}

// Tickets: deep runs strictly beat farming shallow ones. Sphere index i (cleared) pays
// (i+1)·perSphereClearedBase — so clearing 1..C spheres pays base·C·(C+1)/2. Each cleared
// act-boss sphere adds bossBonus; skipped drafts each banked a ticket; a full clear
// multiplies the whole payout (victory premium). Returns the breakdown for the scorecard.
export function computeTickets(world, outcome) {
  const t = tuning.tickets;
  const C = world.spheresCleared || 0;
  const base = t.perSphereClearedBase * (C * (C + 1)) / 2;
  const bossCleared = tuning.run.actBossSpheres.filter((s) => s < C).length;
  const bossBonus = bossCleared * t.bossBonus;
  const skip = world.skipTickets || 0;
  const subtotal = base + bossBonus + skip;
  const mult = outcome === 'victory' ? t.victoryMult : 1;
  const total = subtotal * mult;
  return { base, bossBonus, skip, subtotal, mult, total, bossCleared };
}

// Build the causal scorecard for `outcome` ('death' | 'victory'). A plain JSON-able object
// the renderer lays out and the meta layer banks tickets from.
export function buildScorecard(world, outcome) {
  const sphereIndex = world.sphereIndex || 0;
  const caprices = (world.caprices || []).map((id) => {
    const c = CAPRICE_BY_ID[id];
    return { id, name: c ? c.name : id, desc: c ? c.desc : '' };
  });
  const tickets = computeTickets(world, outcome);
  const cause = outcome === 'death' ? (world.deathCause || null) : null;
  return {
    outcome,                              // 'death' | 'victory'
    seed: world.seed,
    sphereIndex,                          // 0-based sphere the run ended on
    sphereNumber: sphereIndex + 1,        // human 1-based
    act: Math.floor(sphereIndex / 3) + 1, // 1..3
    spheresCleared: world.spheresCleared || 0,
    cause,                                // raw cause key ('swooper', 'net', ...) or null on victory
    causeLabel: cause ? causeLabel(cause) : null,
    caprices,                             // the caprice LINE that shaped the run
    capriceLine: caprices.length ? caprices.map((c) => c.name).join(' · ') : 'no caprices — a pure ascent',
    hp: world.hp, hpMax: world.hpMax,
    time: world.time,
    tickets,                              // { base, bossBonus, skip, subtotal, mult, total, bossCleared }
  };
}

export default { buildScorecard, computeTickets, causeLabel, CAUSE_LABELS };
