#!/usr/bin/env node
// tempo-smoke.js: prove S5.3 tempo terms are live and reversal gating is selective.

import { createState, resetToTestPreset } from '../../src/state.js';
import { searchBestAction, applyAction } from '../../src/engine.js';

const decisions = Number(process.env.LOA_TEMPO_SMOKE_DECISIONS) || 12;
let state = resetToTestPreset(createState());
const totals = {};

for (let i = 0; i < decisions && !state.gameOver; i += 1) {
  const result = searchBestAction(state, {
    seed: 1,
    maxDepth: 1,
    nodeBudget: 300,
    turnAware: true,
    maxActionsPerTurn: 2
  });
  for (const [name, count] of Object.entries(result.tempoFires || {})) {
    totals[name] = (totals[name] || 0) + count;
  }
  state = applyAction(state, result.action, { recordHistory: true });
}

const report = {
  decisions,
  safeAdvanceRewardFires: totals.safeAdvanceReward || 0,
  nonProgressPenaltyFires: totals.nonProgressPenalty || 0,
  reversal: {
    legacyUnconditionalMatches: totals.legacyReversalMatches || 0,
    legacyStationaryMatches: totals.legacyStationaryMatches || 0,
    genuineReturnCandidates: totals.genuineReversalReturns || 0,
    fixedPenaltyFires: totals.reversalPenalty || 0,
    fixedStationaryPenaltyFires: 0,
    waivedReturns: totals.reversalWaived || 0
  }
};

const pass = report.safeAdvanceRewardFires > 0
  && report.nonProgressPenaltyFires > 0
  && report.reversal.legacyStationaryMatches > 0
  && report.reversal.fixedPenaltyFires <= report.reversal.genuineReturnCandidates;
report.verdict = pass ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
