#!/usr/bin/env node
// discriminate.js: run S3.1 discriminating experiments.

import { runMatch } from './run-match.js';

const pairs = Number(process.env.LOA_DISCRIM_PAIRS) || 20;
const maxTurns = Number(process.env.LOA_DISCRIM_MAX_TURNS) || 50;
const noProgressTurns = Number(process.env.LOA_DISCRIM_NOPROG_TURNS) || 25;

const control = { maxTurns, noProgressTurns, passTurns: 10, hardTimeoutMs: 60_000 };

function aggregate(summary) {
  const reversals = summary.games.map(g => g.metrics.reverseRate);
  const advances = summary.games.map(g => g.metrics.advanceRate);
  return {
    games: summary.games.length,
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

async function runConfig(engine) {
  const { summary } = await runMatch({ engineA: engine, engineB: engine, pairs, control });
  return { engine, ...aggregate(summary) };
}

const experiments = [];

// S3.1 hypothesis 1: primitive depth vs turn-aware depth.
for (const depth of [1, 2, 3]) {
  experiments.push(runConfig(`rc2:nodeBudget=300,maxDepth=${depth},turnAware=0`));
  experiments.push(runConfig(`rc2:nodeBudget=300,maxDepth=${depth},turnAware=1`));
}

// S3.1 hypothesis 2: node budget ladder at primitive depth 2 and turn-aware depth 1.
for (const nodes of [450, 900, 2000, 5000]) {
  experiments.push(runConfig(`rc2:nodeBudget=${nodes},maxDepth=2,turnAware=0`));
  experiments.push(runConfig(`rc2:nodeBudget=${nodes},maxDepth=2,turnAware=1`));
}

const results = await Promise.all(experiments);
console.log(JSON.stringify({ pairs, maxTurns, noProgressTurns, results }, null, 2));
