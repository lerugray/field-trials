// mandate.js — THE MANDATE (DESIGN-SEED M4). The Office issues a mandate: a
// generated quest-chain with a terminus (a destination leg). The party marches
// the road toward it; completing the terminus leg DISCHARGES the mandate, pays
// its disbursement into the expedition ledger, and the Office issues the next.
// Runs therefore have a spine of mandates, not just an endless road.
//
// Side-clauses are optional conditions checked at discharge (frugality on
// encounters, provisioning on supplies) that disburse a small bonus. Every
// mandate carries a REWARD FLOOR (tuning) so discharging is never worse than
// standing still — the economy's forward-progress guarantee.
//
// Register (laws 1,2,4): a mandate reads as a decree/form. Objectives are
// clauses; completion is a discharge; the reward is a disbursement. Deadpan,
// numeric, never triumphant. Generated on the `mandate` RNG stream only, so it
// never perturbs terrain/encounter/combat determinism.
//
// Pure + serializable (folds into the save envelope). node-testable.

import { TUNING } from './tuning.js';

// In-register title fragments (bureaucratic, deadpan, original — clean-room).
// A title reads like a filed instrument: "Survey of the Toll Wood".
export const MANDATE_SUBJECTS = [
  'Survey', 'Assessment', 'Conveyance', 'Inspection', 'Remittance',
  'Enclosure', 'Requisition', 'Adjustment', 'Perambulation', 'Distraint',
];
export const MANDATE_OBJECTS = [
  'of the Toll Wood', 'of the Marker Stones', 'against the Fen',
  'of the Chalk Flat', 'of the Cutting', 'of Outstanding Tracts',
  'of the Lower Marches', 'of the Held Ground', 'of the Unassessed Verge',
];

// The two side-clause kinds. Each is a predicate over the discharge record
// (a snapshot of how the haul went), plus a plain instrument line.
const SIDE_KINDS = ['frugal', 'provisioned'];

// makeSideClauses: 1–2 distinct optional clauses for a mandate of the given span.
// Thresholds are derived from span + tuning so they scale with the haul.
function makeSideClauses(stream, span, startSupplies) {
  const n = stream.range(TUNING.mandateSideRange[0], TUNING.mandateSideRange[1]);
  const pool = SIDE_KINDS.slice();
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const kind = pool.splice(stream.int(pool.length), 1)[0];
    if (kind === 'frugal') {
      const threshold = Math.max(1, Math.round(span * TUNING.mandateFrugalPerLeg));
      out.push({
        id: 'frugal', kind, threshold, bonus: TUNING.mandateSideBonus,
        text: `Clause (frugality): the haul is to field no more than ${threshold} matters.`,
      });
    } else {
      const threshold = Math.round(startSupplies * TUNING.mandateProvisionFrac);
      out.push({
        id: 'provisioned', kind, threshold, bonus: TUNING.mandateSideBonus,
        text: `Clause (provisioning): the terminus is to be reached with supplies at or above ${threshold}.`,
      });
    }
  }
  return out;
}

// createMandate: issue one mandate from the mandate stream. `issuedAtLeg` is the
// leg the party stands on when the Office issues it; `issuedAtEncounters` is the
// cumulative encounter count at issue (used to measure a frugality clause over
// this haul only). `startSupplies` sizes the provisioning clause.
export function createMandate(stream, index, issuedAtLeg, issuedAtEncounters, startSupplies = TUNING.startSupplies) {
  const [lo, hi] = TUNING.mandateLegSpan;
  const span = stream.range(lo, hi);
  const destinationLeg = issuedAtLeg + span;
  // Reference number: a deterministic file code, purely diegetic.
  const ref = String(stream.range(1000, 9999)) + '-' + String.fromCharCode(65 + stream.int(6));
  const subject = stream.pick(MANDATE_SUBJECTS);
  const object = stream.pick(MANDATE_OBJECTS);
  const rewardRaw = TUNING.mandateRewardBase + span * TUNING.mandateRewardPerLeg;
  const reward = Math.max(TUNING.mandateRewardFloor, rewardRaw);
  const side = makeSideClauses(stream, span, startSupplies);
  return {
    index: index | 0,
    ref,
    title: `${subject} ${object}`,
    subject, object,
    issuedAtLeg: issuedAtLeg | 0,
    issuedAtEncounters: issuedAtEncounters | 0,
    destinationLeg: destinationLeg | 0,
    span,
    reward,
    side,
    discharged: false,
  };
}

// legsRemaining: legs still to march before this mandate's terminus.
export function legsRemaining(mandate, currentLeg) {
  return Math.max(0, mandate.destinationLeg - currentLeg);
}

// isTerminus: does completing `completedLeg` reach (or pass) the terminus?
export function isTerminus(mandate, completedLeg) {
  return completedLeg >= mandate.destinationLeg;
}

// evaluateSideClause: is a clause satisfied by the discharge record? `record`:
//   { encounters (fielded on THIS haul), supplies (at arrival) }
export function evaluateSideClause(clause, record) {
  if (clause.kind === 'frugal') return record.encounters <= clause.threshold;
  if (clause.kind === 'provisioned') return record.supplies >= clause.threshold;
  return false;
}

// dischargeReward: the disbursement for discharging `mandate` given the haul
// record. Base reward (floor-guaranteed) plus each met side-clause's bonus.
// Returns { gold, base, met: [ids], clauses: [{id, met, bonus}] }.
export function dischargeReward(mandate, record) {
  let gold = mandate.reward;
  const met = [];
  const clauses = [];
  for (const c of mandate.side) {
    const ok = evaluateSideClause(c, record);
    clauses.push({ id: c.id, met: ok, bonus: c.bonus });
    if (ok) { gold += c.bonus; met.push(c.id); }
  }
  return { gold, base: mandate.reward, met, clauses };
}

// ---- Serialization (folds into the save envelope, v4) -----------------------
export function serializeMandate(mandate) {
  if (!mandate) return null;
  return { ...mandate, side: mandate.side.map((c) => ({ ...c })) };
}
export function restoreMandate(snap) {
  if (!snap) return null;
  return { ...snap, side: (snap.side || []).map((c) => ({ ...c })) };
}
