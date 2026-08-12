#!/usr/bin/env node
// cli-match.js: command-line A-vs-B match runner.

import { runMatch } from './run-match.js';

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const engineA = getArg('engine-a', 'rc2');
const engineB = getArg('engine-b', 'rc2');
const pairs = Number(getArg('pairs', '10'));
const outputDir = getArg('out', './tmp/engine-match');
const nodeBudget = Number(getArg('nodes', '900'));
const maxDepth = Number(getArg('depth', '3'));

const { summary, outPath } = await runMatch({
  engineA,
  engineB,
  pairs,
  outputDir,
  control: {
    maxTurns: 200,
    noProgressTurns: 80,
    passTurns: 10,
    hardTimeoutMs: 60_000
  }
});

console.log(JSON.stringify(summary, null, 2));
console.log(`\nWritten to: ${outPath}`);
