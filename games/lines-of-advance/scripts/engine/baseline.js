#!/usr/bin/env node
// baseline.js: rc2-vs-rc2 self-play baseline for S3.2 pathology metrics.

import { runMatch } from './run-match.js';

const pairs = Number(process.env.LOA_BASELINE_PAIRS) || 50; // 50 pairs = 100 games
const nodeBudget = Number(process.env.LOA_BASELINE_NODES) || 300;
const maxDepth = Number(process.env.LOA_BASELINE_DEPTH) || 3;
const maxTurns = Number(process.env.LOA_BASELINE_MAX_TURNS) || 50;
const noProgressTurns = Number(process.env.LOA_BASELINE_NOPROG_TURNS) || 20;
const outputDir = process.env.LOA_BASELINE_DIR || './tmp/engine-baseline';
const engine = process.env.LOA_BASELINE_ENGINE || 'rc2:turnAware=1';

const { summary, outPath } = await runMatch({
  engineA: engine,
  engineB: engine,
  pairs,
  outputDir,
  control: {
    maxTurns,
    noProgressTurns,
    passTurns: 10,
    hardTimeoutMs: 60_000
  }
});

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

const reversals = summary.games.map(g => g.metrics.reverseRate);
const advances = summary.games.map(g => g.metrics.advanceRate);
const attacks = summary.games.map(g => g.metrics.attackTurns);
const depths = summary.games.map(g => g.metrics.completedDepthHistogram);

const aggregate = {
  games: summary.games.length,
  pairs: summary.pairsRun,
  winsNorth: summary.games.filter(g => g.result === 'North').length,
  winsSouth: summary.games.filter(g => g.result === 'South').length,
  draws: summary.games.filter(g => g.result === 'draw' || g.result === '*').length,
  avgReverseRate: avg(reversals),
  avgFirstMoveReverseRate: avg(summary.games.map(g => g.metrics.firstMoveReverseRate)),
  avgAdvanceRate: avg(advances),
  totalAttackTurns: attacks.reduce((a, b) => a + b, 0),
  totalArsenalAttempts: summary.games.map(g => g.metrics.arsenalAttempts).reduce((a, b) => a + b, 0),
  totalCycleLength2: summary.games.map(g => g.metrics.cycleLength2Count).reduce((a, b) => a + b, 0),
  completedDepthHistogram: depths.reduce((acc, h) => {
    for (const [k, v] of Object.entries(h)) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {})
};

console.log(JSON.stringify(aggregate, null, 2));
console.log(`\nFull summary written to: ${outPath}`);
