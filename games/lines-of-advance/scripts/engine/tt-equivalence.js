#!/usr/bin/env node
// tt-equivalence.js: verify bound-aware TT returns same root score as no-TT.

import { createState, resetToTestPreset, resetToCommsDrill, resetToCommCut,
  makeLcg } from '../../src/state.js';
import { searchBestAction, legalActions, applyAction, actionKey } from '../../src/engine.js';

const SAMPLES = Number(process.env.LOA_TT_SAMPLES) || 30;
const MIN_REAL_COMPARISONS = Number(process.env.LOA_TT_MIN_COMPARISONS) || 20;
const BROKEN_TT = process.env.LOA_TT_BROKEN_EXACT === '1';
const DEPTHS = [1, 2];
const NODE_BUDGETS = [300, 1000, 5000];

function randomPosition(rng, sample) {
  const presets = [resetToCommsDrill, resetToCommCut, resetToTestPreset];
  let state = presets[sample % presets.length](createState());
  let moves = 0;
  while (moves < sample % 4 && !state.gameOver) {
    const actions = legalActions(state);
    if (actions.length === 0) break;
    const tactical = actions.filter(action =>
      action.type === 'retreat' || action.type === 'attack' || action.type === 'arsenal');
    const movesTowardContact = actions.filter(action => action.type === 'move');
    const pool = tactical.length ? tactical : movesTowardContact.length
      ? movesTowardContact : actions;
    const action = pool[Math.floor(rng() * pool.length)];
    try {
      state = applyAction(state, action, { recordHistory: true });
    } catch {
      break;
    }
    moves += 1;
  }
  return state;
}

const rng = makeLcg(20260810);
let mismatches = 0;
let tested = 0;
let realComparisons = 0;
const examples = [];

for (let i = 0; i < SAMPLES; i += 1) {
  const state = randomPosition(rng, i);
  for (const depth of DEPTHS) {
    for (const nodeBudget of NODE_BUDGETS) {
      tested += 1;
      const common = {
        seed: 1,
        maxDepth: depth,
        nodeBudget,
        turnAware: true,
        maxActionsPerTurn: 2
      };
      const withTT = searchBestAction(state, {
        ...common,
        disableTT: false,
        auditBrokenTT: BROKEN_TT
      });
      const noTT = searchBestAction(state, { ...common, disableTT: true });
      // With budget aborts, completed depth may differ; only compare when both
      // finish the requested depth.
      if (withTT.depth === depth && noTT.depth === depth) {
        realComparisons += 1;
        if (withTT.score !== noTT.score) {
          mismatches += 1;
          if (examples.length < 3) {
            examples.push({ i, depth, nodeBudget, withTT: withTT.score, noTT: noTT.score });
          }
        }
      }
    }
  }
}

const enoughComparisons = realComparisons >= MIN_REAL_COMPARISONS;
const report = {
  ttVariant: BROKEN_TT ? 'BROKEN:depth-omitted-and-bounds-reused-as-exact' : 'fixed',
  samples: SAMPLES,
  tested,
  realComparisons,
  minimumRealComparisons: MIN_REAL_COMPARISONS,
  mismatches,
  verdict: mismatches === 0 && enoughComparisons ? 'PASS' : 'FAIL',
  examples
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
