// certifications.js — THE CERTIFICATION WALL (DESIGN-SEED M5). The meta-unlocks
// the roguelite fills over many expeditions, and the escalation curve that makes
// runs get deeper as it fills. Certifications are gated on the permanent ledger
// (total mastery); each grants a starting advantage (a requisition, a deck slot).
// Escalation is set by the deepest leg ever reached — the world only deepens once
// you have proven you can go there.
//
// Register: certifications read as CLEARANCES the Office grants; escalation as the
// jurisdiction the file has advanced into. Deadpan, numeric. A fresh ledger clears
// nothing and escalates to level 0 (×1), so the M2 baseline stays exact.
//
// Pure (reads a meta ledger); node-testable.

import { TUNING } from './tuning.js';

// totalMastery: the ledger's whole certification weight (sum of all job XP).
export function totalMastery(meta) {
  let t = 0;
  for (const jid in (meta && meta.mastery) || {}) t += meta.mastery[jid] | 0;
  return t;
}

// The wall, in order. Each cert gates on total mastery and grants a `start`
// bonus applied when a new expedition opens: { gold?, supplies?, deck?:[cardIds] }.
export const CERTIFICATIONS = [
  { id: 'provisional_credit', name: 'Provisional Credit', req: 10,
    desc: 'Expeditions depart with a credit advanced to the ledger.', start: { gold: 40 } },
  { id: 'expanded_file', name: 'Expanded File', req: 25,
    desc: 'A further instrument is added to the standing deck.', start: { deck: ['the_sun'] } },
  { id: 'standing_requisition', name: 'Standing Requisition', req: 55,
    desc: 'Departure is provisioned: additional supplies and credit.', start: { gold: 40, supplies: 16 } },
  { id: 'seasoned_file', name: 'Seasoned File', req: 100,
    desc: 'A seasoned file departs the better equipped.', start: { gold: 60, deck: ['temperance'] } },
];

// certificationState: the wall as { id, name, desc, req, earned } — for the UI and
// for detecting NEW clearances after a run banks mastery.
export function certificationState(meta) {
  const t = totalMastery(meta);
  return CERTIFICATIONS.map((c) => ({ id: c.id, name: c.name, desc: c.desc, req: c.req, earned: t >= c.req }));
}

// earnedCertifications: just the unlocked cert ids at the ledger's current weight.
export function earnedCertifications(meta) {
  const t = totalMastery(meta);
  return CERTIFICATIONS.filter((c) => t >= c.req).map((c) => c.id);
}

// newlyEarned: cert ids unlocked crossing from `beforeXp` to `afterXp` — the
// "NEW CLEARANCE" the defeat surface announces after banking a run.
export function newlyEarned(beforeXp, afterXp) {
  return CERTIFICATIONS.filter((c) => beforeXp < c.req && afterXp >= c.req).map((c) => ({ id: c.id, name: c.name, desc: c.desc }));
}

// startingBonuses: aggregate every earned cert's start bonus into one bundle
// applied at expedition open. Deterministic from the ledger.
export function startingBonuses(meta) {
  const out = { gold: 0, supplies: 0, deck: [] };
  const earned = new Set(earnedCertifications(meta));
  for (const c of CERTIFICATIONS) {
    if (!earned.has(c.id) || !c.start) continue;
    out.gold += c.start.gold || 0;
    out.supplies += c.start.supplies || 0;
    if (c.start.deck) out.deck.push(...c.start.deck);
  }
  return out;
}

// escalationLevel: how deep the world runs THIS expedition — set by the deepest
// leg ever reached, capped. Level 0 for a fresh ledger.
export function escalationLevel(meta) {
  const deepest = (meta && meta.deepestLeg) | 0;
  return Math.min(TUNING.escalationCap, Math.floor(deepest / TUNING.escalationEveryLegs));
}

// escalationMult: the strength/pay multiplier for the current escalation level.
// ×1 at level 0 (fresh) — the exact identity, so the baseline is untouched.
export function escalationMult(meta) {
  return 1 + escalationLevel(meta) * TUNING.escalationStep;
}
