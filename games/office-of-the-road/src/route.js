// route.js — ROUTING THE NEXT LEG (DESIGN-SEED M4). At each pause point the party
// chooses how to march the next leg: a branch with a legible safety-vs-resource
// tradeoff. Three archetypes span the axis:
//   posted   — The Posted Road: fewest encounters, a SUPPLY TOLL (maintained),
//              slightly lower pay. Buy quiet with supplies.
//   ordinary — The Cut: neutral risk, neutral pay, little/no toll.
//   verge    — The Unassessed Verge: most encounters, best pay, no toll. Risk.
//
// The chosen branch's mods ride on the leg (march.legMods): encounterMult scales
// the per-pace encounter chance; goldMult scales combat disbursement on that leg.
// A supply toll is paid once, at selection. EVERY branch still advances toward the
// floored mandate reward — no branch is worse than standing still.
//
// Content is a PURE function of (seed, legIndex) — like the shop, it never
// consumes a live RNG stream, so it can't perturb combat/terrain/mandate
// determinism. The player's CHOICE is the only input; it's captured in the leg
// mods, which the save carries. Register: roads are described as instruments —
// exact multipliers and tolls, deadpan road-names. node-testable.

import { TUNING } from './tuning.js';
import { hashInt } from './prng.js';
import { Stream } from './rng.js';

const ROUTE_SALT = 0x520a7e; // distinct constant; part of nothing saved

// The archetype spine (order = display order, safe→exposed). Labels are deadpan
// road-names; `safety` is the plain non-numeric channel beside the figures.
export const ROUTE_ARCHETYPES = [
  { id: 'posted', label: 'The Posted Road', safety: 'guarded', note: 'Maintained; a toll applies.' },
  { id: 'ordinary', label: 'The Cut', safety: 'ordinary', note: 'Assessed. No surprises.' },
  { id: 'verge', label: 'The Unassessed Verge', safety: 'exposed', note: 'Untolled. Matters arise.' },
];
const ARCHETYPES = ROUTE_ARCHETYPES;

// jitter: a value in [lo,hi] from the stream, rounded to 2 decimals (stable JSON).
function jitter(stream, band) {
  const [lo, hi] = band;
  if (hi <= lo) return lo;
  return Math.round((lo + stream.next() * (hi - lo)) * 100) / 100;
}

// generateBranches: the branch board for the leg the party is about to march.
// Deterministic under (seed, legIndex). Returns { legIndex, branches:[...] }.
export function generateBranches(seed, legIndex) {
  const stream = new Stream(hashInt(ROUTE_SALT, legIndex, seed >>> 0));
  const branches = ARCHETYPES.slice(0, TUNING.routeBranchCount).map((a) => {
    const encounterMult = jitter(stream, TUNING.routeEncounterMult[a.id]);
    const goldMult = jitter(stream, TUNING.routeGoldMult[a.id]);
    const [tlo, thi] = TUNING.routeSupplyToll[a.id];
    const supplyToll = stream.range(tlo, thi);
    return {
      id: a.id, label: a.label, safety: a.safety, note: a.note,
      encounterMult, goldMult, supplyToll,
      // mods that ride on the leg once chosen (the resolver + gold read these).
      mods: { encounterMult, goldMult },
    };
  });
  return { legIndex, branches };
}

// The neutral leg (no route chosen yet — the opening leg, and the default the
// determinism probe/baseline run under so they are unaffected by routing).
export function neutralLegMods() {
  return { encounterMult: 1, goldMult: 1 };
}
