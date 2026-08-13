// meta.js — THE CERTIFICATION LEDGER (DESIGN-SEED M5). The roguelite's persistent
// spine: what survives an expedition's death. Job MASTERY is the certification
// currency — jobs level ACROSS runs (fixed at swap time within a run), so a
// player's configuration compounds run-over-run even as expeditions end.
//
// This is stored SEPARATELY from the per-run save (a distinct key): the run save
// is the open file the Office holds; the certification ledger is the permanent
// record the Office keeps regardless of any one expedition's outcome.
//
// Mastery is earned by FIELDING a job in won fights (accrued per-run, banked when
// the expedition ends — death now, the abandon valve later), and each level adds
// a small multiplier to that job's whole stat block. Level 0 → ×1 exactly, so a
// fresh ledger leaves the M2 baseline untouched. Pure + serializable; node-testable.

import { TUNING } from './tuning.js';
import { JOB_IDS } from './jobs.js';

export const META_KEY = 'office-of-the-road/certifications/v1';
export const META_VERSION = 1;

// createMeta: a fresh certification ledger (no mastery on file).
export function createMeta() {
  return { v: META_VERSION, mastery: {}, runs: 0, deepestLeg: 0, history: [], closedRuns: {} };
}

// The rolling run-history the Office keeps (roguelite table-stakes, M8). Newest
// first, capped — a returned docket / notice shows the recent record.
export const HISTORY_CAP = 8;
export function recordHistory(meta, entry) {
  if (!meta.history) meta.history = [];
  meta.history.unshift({
    run: meta.runs | 0,
    leg: entry.leg | 0,
    cause: entry.cause || 'reduced',
    gold: entry.gold | 0,
  });
  if (meta.history.length > HISTORY_CAP) meta.history.length = HISTORY_CAP;
  return meta.history;
}

// masteryXp / masteryLevel / masteryMult: read the ledger for one job.
export function masteryXp(meta, jobId) {
  return (meta && meta.mastery && meta.mastery[jobId]) | 0;
}
export function masteryLevel(meta, jobId) {
  return Math.min(TUNING.masteryLevelCap, Math.floor(masteryXp(meta, jobId) / TUNING.masteryXpPerLevel));
}
export function masteryMult(meta, jobId) {
  return 1 + masteryLevel(meta, jobId) * TUNING.masteryStatPerLevel;
}

// masteryMultByJob: the snapshot a run takes at creation — a multiplier for EVERY
// job (so mid-run job swaps read a fixed value). Pure; the run holds this fixed.
export function masteryMultByJob(meta) {
  const out = {};
  for (const jid of JOB_IDS) out[jid] = masteryMult(meta, jid);
  return out;
}

// A fresh per-run mastery tally (jobId -> xp earned this expedition).
export function createRunMastery() {
  return {};
}

// earnMastery: credit a job for surviving/winning a fight of the given tier.
export function earnMastery(runMastery, jobId, tier) {
  runMastery[jobId] = (runMastery[jobId] | 0) + (TUNING.masteryXpPerWin[tier] || 0);
  return runMastery;
}

// bankRun: fold a completed run's mastery tally into the permanent ledger. `frac`
// (default 1) scales the credit — the abandon valve (M5 inc4) banks a reduced
// share. Returns a per-job gain report { xp, before, after, leveled } for the
// certification-gain surface. Also records the run count + deepest leg reached.
export function bankRun(meta, runMastery, deepestLeg = 0, frac = 1) {
  const gains = {};
  for (const jid in runMastery) {
    const credit = Math.round((runMastery[jid] | 0) * frac);
    if (credit <= 0) continue;
    const before = masteryLevel(meta, jid);
    meta.mastery[jid] = masteryXp(meta, jid) + credit;
    const after = masteryLevel(meta, jid);
    gains[jid] = { xp: credit, before, after, leveled: after > before };
  }
  meta.runs = (meta.runs | 0) + 1;
  meta.deepestLeg = Math.max(meta.deepestLeg | 0, deepestLeg | 0);
  return gains;
}

// bankRunOnce: terminal-path integrity. The permanent ledger is authoritative
// about which run ids have already closed, so even a stale OPEN snapshot left by
// an interrupted pair of localStorage writes can never bank twice.
export function bankRunOnce(meta, runId, runMastery, deepestLeg = 0, frac = 1, cause = 'closed') {
  if (!runId) throw new Error('cannot bank a run without an id');
  if (!meta.closedRuns) meta.closedRuns = {};
  if (meta.closedRuns[runId]) return { banked: false, gains: {}, receipt: { ...meta.closedRuns[runId] } };
  const gains = bankRun(meta, runMastery, deepestLeg, frac);
  const receipt = { cause, deepestLeg: deepestLeg | 0, fraction: frac, run: meta.runs | 0 };
  meta.closedRuns[runId] = receipt;
  return { banked: true, gains, receipt: { ...receipt } };
}

export function isRunClosed(meta, runId) {
  return !!(meta && meta.closedRuns && runId && meta.closedRuns[runId]);
}

// ---- Serialization (a plain-JSON ledger; its own storage key) ---------------
export function serializeMeta(meta) {
  const closedRuns = {};
  for (const [id, receipt] of Object.entries(meta.closedRuns || {})) closedRuns[id] = { ...receipt };
  return { v: META_VERSION, mastery: { ...meta.mastery }, runs: meta.runs | 0, deepestLeg: meta.deepestLeg | 0, history: (meta.history || []).slice(0, HISTORY_CAP).map((h) => ({ ...h })), closedRuns };
}
// parseMeta: validate a raw stored ledger; returns a fresh one on anything
// unreadable (a corrupt ledger is never fatal — the certifications simply reset,
// surfaced by the caller rather than crashing the boot).
export function parseMeta(raw) {
  if (!raw) return createMeta();
  let obj;
  try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return createMeta(); }
  if (!obj || obj.v !== META_VERSION || typeof obj.mastery !== 'object' || !obj.mastery) return createMeta();
  const closedRuns = {};
  if (obj.closedRuns && typeof obj.closedRuns === 'object') {
    for (const [id, receipt] of Object.entries(obj.closedRuns)) if (id && receipt && typeof receipt === 'object') closedRuns[id] = { ...receipt };
  }
  return { v: META_VERSION, mastery: { ...obj.mastery }, runs: obj.runs | 0, deepestLeg: obj.deepestLeg | 0, history: Array.isArray(obj.history) ? obj.history.slice(0, HISTORY_CAP).map((h) => ({ ...h })) : [], closedRuns };
}
