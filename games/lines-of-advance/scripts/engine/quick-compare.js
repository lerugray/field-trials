#!/usr/bin/env node
// quick-compare.js: primitive vs turn-aware engine at fixed controls.

import { runMatch } from './run-match.js';

const pairs = Number(process.env.LOA_COMPARE_PAIRS) || 20;
const nodeBudget = Number(process.env.LOA_COMPARE_NODES) || 300;
const maxDepth = Number(process.env.LOA_COMPARE_DEPTH) || 2;
const maxTurns = Number(process.env.LOA_COMPARE_MAX_TURNS) || 40;
const noProgressTurns = Number(process.env.LOA_COMPARE_NOPROG_TURNS) || 20;

async function run(engine) {
  const { summary } = await runMatch({
    engineA: engine,
    engineB: engine,
    pairs,
    control: { maxTurns, noProgressTurns, passTurns: 10, hardTimeoutMs: 60_000 }
  });
  const reversals = summary.games.map(g => g.metrics.reverseRate);
  const advances = summary.games.map(g => g.metrics.advanceRate);
  const attacks = summary.games.map(g => g.metrics.attackTurns);
  const depths = summary.games.map(g => g.metrics.completedDepthHistogram);
  return {
    engine,
    games: summary.games.length,
    avgReverseRate: reversals.reduce((a, b) => a + b, 0) / reversals.length,
    avgFirstMoveReverseRate: summary.games.map(g => g.metrics.firstMoveReverseRate)
      .reduce((a, b) => a + b, 0) / summary.games.length,
    avgAdvanceRate: advances.reduce((a, b) => a + b, 0) / advances.length,
    totalAttackTurns: attacks.reduce((a, b) => a + b, 0),
    totalArsenalAttempts: summary.games.map(g => g.metrics.arsenalAttempts)
      .reduce((a, b) => a + b, 0),
    completedDepthHistogram: depths.reduce((acc, h) => {
      for (const [k, v] of Object.entries(h)) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {})
  };
}

const primitive = await run(`rc2:nodeBudget=${nodeBudget},maxDepth=${maxDepth},turnAware=0`);
const turnAware = await run(`rc2:nodeBudget=${nodeBudget},maxDepth=${maxDepth},turnAware=1`);

console.log(JSON.stringify({ primitive, turnAware }, null, 2));
