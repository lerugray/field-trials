// baseline.js — THE M2 EXIT GATES as runnable probes (DESIGN-SEED M2).
//   1) measureBaseline: actual auto-win rates per tier vs the committed bands.
//   2) degeneracySweep: sampled job comps over one fixed seeded encounter ladder;
//      no comp may exceed the median by > the stated margin; sub-floor comps are
//      flagged trap-tier.
// Pure + deterministic (seeded) so the gate is a test, not a vibe. No DOM.

import { TUNING } from './tuning.js';
import { makeStreams } from './rng.js';
import { createParty } from './party.js';
import { makeEnemies, resolveCombat } from './combat.js';
import { JOB_IDS } from './jobs.js';

// ---- Gate 1: the auto-win baseline curve ------------------------------------
export function measureTierWinRate(tier, fights = TUNING.baselineProbeFights, seedBase = 40000, jobIds) {
  let wins = 0, rounds = 0, stalemates = 0;
  for (let i = 0; i < fights; i++) {
    const s = makeStreams(seedBase + i);
    const party = createParty(jobIds);
    const enemies = makeEnemies(tier, s.combat);
    const r = resolveCombat(party, enemies, s.combat, { quiet: true });
    if (r.victory) wins++;
    rounds += r.rounds;
    if (r.rounds >= TUNING.combatMaxRounds && !r.victory) stalemates++;
  }
  return { tier, fights, winRate: wins / fights, avgRounds: rounds / fights, stalemates };
}

export function measureBaseline(fights = TUNING.baselineProbeFights) {
  const out = {};
  for (const tier of ['routine', 'elite', 'boss']) out[tier] = measureTierWinRate(tier, fights);
  return out;
}

// checkBands: which tiers fall inside their committed win band.
export function checkBands(measured) {
  const fails = [];
  for (const tier of Object.keys(measured)) {
    const [lo, hi] = TUNING.winRateBands[tier];
    const wr = measured[tier].winRate;
    if (wr < lo || wr > hi) fails.push({ tier, winRate: wr, band: [lo, hi] });
  }
  return { ok: fails.length === 0, fails };
}

// ---- Gate 2: job-comp degeneracy sweep --------------------------------------
// All comps of `size` distinct jobs (order-independent).
export function jobCombos(size = TUNING.partySize, pool = JOB_IDS) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === size) { out.push(acc.slice()); return; }
    for (let i = start; i < pool.length; i++) { acc.push(pool[i]); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

// Run one comp through the fixed ladder WITHOUT recovery (attrition carries), for
// `fights` seeds. Score = mean fraction of ladder stages cleared before a wipe.
export function measureCompLadder(jobIds, fights = 300, seedBase = 60000) {
  const ladder = TUNING.degeneracyLadder;
  let clearedSum = 0;
  for (let i = 0; i < fights; i++) {
    const s = makeStreams(seedBase + i);
    const party = createParty(jobIds);
    let cleared = 0;
    for (const tier of ladder) {
      const enemies = makeEnemies(tier, s.combat);
      const r = resolveCombat(party, enemies, s.combat, { quiet: true });
      if (r.victory) cleared++; else break; // a wipe ends the run
    }
    clearedSum += cleared / ladder.length;
  }
  return clearedSum / fights; // [0,1]
}

export function degeneracySweep(fights = 300) {
  const comps = jobCombos().map((jobIds) => ({ jobIds, score: measureCompLadder(jobIds, fights) }));
  comps.sort((a, b) => b.score - a.score);
  const scores = comps.map((c) => c.score).slice().sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const best = comps[0].score;
  const overMargin = comps.filter((c) => median > 0 && c.score > median * (1 + TUNING.degeneracyMargin));
  const trapTier = comps.filter((c) => median > 0 && c.score < median * TUNING.degeneracyFloor);
  return { comps, median, best, spread: median > 0 ? best / median - 1 : 0, overMargin, trapTier };
}
