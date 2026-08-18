// cycle.js — the cycle spine. THE PACING LAW LIVES HERE (DESIGN-SEED §3, hard rule 3):
//
//   The player advances the clock; the clock never advances on the player.
//
// The sim advances ONLY inside commitCycle(). Nothing in this file reads wall-clock time, sets a
// timer, or listens for a real-time tick. commitCycle is a pure function of (facility) plus a
// per-cycle RNG derived from the seed and the cycle number, so a run replays exactly from a seed.
//
// M0 status: this is the STUB the pacing-law test stands on. The phase handlers below do no sim
// work yet (that is M1 onward); what M0 fixes is the SHAPE and the law: one entry point, pure,
// seeded, no clock.
import { PHASES } from './model.js';
import { createRng } from './rng.js';
import { applyCommit, resolveRaid, runReport as runReportContent } from './sim.js';

// A structured error the caller can surface loudly (DESIGN-SEED §5: failures are loud, never
// swallowed). Thrown when the cycle is driven out of order.
export class CycleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CycleError';
  }
}

// The per-cycle RNG. Deriving it from seed + cycle number is what makes the raid replayable: the
// same facility signed over on the same cycle always resolves the same way.
export function cycleRng(facility) {
  return createRng(`${facility.seed}:cycle:${facility.cycle.number}`);
}

// An empty after-action report for a cycle. M1+ fills these counts and lines; every line must
// carry a numeric neighbour and drive a next-cycle consequence (DESIGN-SEED §3, §4.2).
function emptyReport(cycleNumber) {
  return {
    cycle: cycleNumber,
    casualties: { staff: 0, raiders: 0 },
    goldLost: 0,
    structuralDamage: 0,
    claimsBacklog: 0,
    grievancesFiled: 0,
    lines: [],
  };
}

// ---- phase handlers ------------------------------------------------------------------------
// The spine delegates each phase to the content in sim.js. The signature (facility, rng, report)
// is the contract; the handlers are pure and clock-free by construction.

function runCommit(facility, rng, report) {
  return applyCommit(facility, rng, report); // income lands; works orders tick down and complete
}

function runRaid(facility, rng, report) {
  return resolveRaid(facility, rng, report); // a party approaches the Cornerstone; no input
}

function runReport(facility, rng, report) {
  return runReportContent(facility, rng, report); // payday, consequences, and the loss check
}

// commitCycle(facility) -> the next facility. THE ONLY function that advances the sim.
//
// Called from ADMIN (the operator has signed the cycle over). It resolves COMMIT -> RAID ->
// REPORT deterministically and returns the facility positioned in ADMIN for the next cycle, with
// the after-action report attached as `lastReport`. It never mutates the facility it is given.
export function commitCycle(facility) {
  if (facility.cycle.phase !== 'ADMIN') {
    throw new CycleError(
      `commitCycle called in phase ${facility.cycle.phase}; the cycle is only signed over from ADMIN`,
    );
  }
  if (facility.status !== 'active') {
    throw new CycleError(
      `commitCycle called on a closed tenure (status ${facility.status}); the tenure is at an end`,
    );
  }

  // Work on a clone so the input state is never mutated (purity, and save/load safety later).
  const next = structuredClone(facility);
  const rng = cycleRng(next);
  const report = emptyReport(next.cycle.number);

  // Move through the resolving phases. The `phase` field is set at each step so a watchable replay
  // has something to read; it does not gate on any clock.
  next.cycle.phase = 'COMMIT';
  runCommit(next, rng, report);
  next.cycle.phase = 'RAID';
  runRaid(next, rng, report);
  next.cycle.phase = 'REPORT';
  runReport(next, rng, report);

  // The report's contents ARE next cycle's paperwork. Attach it and open the next ADMIN.
  next.lastReport = report;
  next.cycle.number += 1;
  next.cycle.phase = 'ADMIN';
  return next;
}

// Re-export so callers wire the spine from one module.
export { PHASES };
