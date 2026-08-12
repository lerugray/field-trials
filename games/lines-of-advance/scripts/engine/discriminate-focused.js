#!/usr/bin/env node
// discriminate-focused.js: focused S3.1 experiments at the baseline control.

import { runMatch } from './run-match.js';

const pairs = Number(process.env.LOA_DISCRIM_PAIRS) || 5;
const maxTurns = Number(process.env.LOA_DISCRIM_MAX_TURNS) || 40;
const noProgressTurns = Number(process.env.LOA_DISCRIM_NOPROG_TURNS) || 30;
const control = { maxTurns, noProgressTurns, passTurns: 10, hardTimeoutMs: 60_000 };

function aggregate(summary) {
  const reversals = summary.games.map(g => g.metrics.reverseRate);
  const advances = summary.games.map(g => g.metrics.advanceRate);
  const raw = summary.games.map(game => game.metrics._raw);
  const absoluteReversalCount = raw.reduce((sum, item) =>
    sum + item.reversalPieceReturns, 0);
  const reversalEligiblePieceMoves = raw.reduce((sum, item) =>
    sum + item.reversalEligiblePieceMoves, 0);
  const absoluteAdvancingMoves = raw.reduce((sum, item) =>
    sum + item.advancingFighterMoves, 0);
  const absoluteFighterMoves = raw.reduce((sum, item) => sum + item.fighterMoves, 0);
  const absoluteTurns = raw.reduce((sum, item) => sum + item.turnCount, 0);
  return {
    games: summary.games.length,
    perPieceReturnRate: reversalEligiblePieceMoves
      ? absoluteReversalCount / reversalEligiblePieceMoves : 0,
    absoluteReversalCount,
    reversalEligiblePieceMoves,
    absoluteAdvancingMoves,
    absoluteFighterMoves,
    fighterMovesPerTurn: absoluteTurns ? absoluteFighterMoves / absoluteTurns : 0,
    avgReverseRate: reversals.reduce((a, b) => a + b, 0) / reversals.length,
    avgFirstMoveReverseRate: summary.games.map(g => g.metrics.firstMoveReverseRate)
      .reduce((a, b) => a + b, 0) / summary.games.length,
    avgAdvanceRate: advances.reduce((a, b) => a + b, 0) / advances.length,
    totalAttackTurns: summary.games.map(g => g.metrics.attackTurns).reduce((a, b) => a + b, 0),
    totalArsenalAttempts: summary.games.map(g => g.metrics.arsenalAttempts).reduce((a, b) => a + b, 0),
    completedDepthHistogram: summary.games.map(g => g.metrics.completedDepthHistogram)
      .reduce((acc, h) => {
        for (const [k, v] of Object.entries(h)) acc[k] = (acc[k] ?? 0) + v;
        return acc;
      }, {})
  };
}

async function runConfig(arm, engine) {
  const { summary } = await runMatch({ engineA: engine, engineB: engine, pairs, control });
  return { arm, engine, ...aggregate(summary) };
}

const configs = [
  ['primitive', 'rc2:nodeBudget=300,maxDepth=3,turnAware=0'],
  ['turnAware-nocap', 'rc2:nodeBudget=300,maxDepth=3,turnAware=1,maxActionsPerTurn=Infinity'],
  ['turnAware-cap2', 'rc2:nodeBudget=300,maxDepth=3,turnAware=1,maxActionsPerTurn=2']
];

const results = [];
for (const [arm, config] of configs) {
  results.push(await runConfig(arm, config));
}

console.log(JSON.stringify({
  design: 'primitive / turnAware-nocap / turnAware-cap2',
  pairs,
  maxTurns,
  noProgressTurns,
  results
}, null, 2));
