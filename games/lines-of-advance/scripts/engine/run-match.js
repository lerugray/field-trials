// run-match.js: CLI for running an A-vs-B engine match.

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runGame } from './match.js';
import { makeRc2Adapter, makeRandomAdapter, makePassAdapter, makeFirstActionAdapter, makeIllegalAdapter } from './engine-adapter.js';
import { buildBook } from './book.js';
import { makeSprt, pairScore } from './sprt.js';
import { formatLoa1 } from '../../src/notation.js';

function parseEngineSpec(spec) {
  // spec: "rc2" or "rc2:nodeBudget=2000,maxDepth=2" or "rc2:depth=2"
  if (!spec) return { id: 'rc2', options: {} };
  const [id, optsStr] = spec.split(':');
  const options = {};
  if (optsStr) {
    for (const part of optsStr.split(',')) {
      const [k, v] = part.split('=');
      if (k === 'nodeBudget' || k === 'maxDepth' || k === 'timeBudgetMs' || k === 'seed') {
        options[k] = Number(v);
      } else if (k === 'turnAware') {
        options[k] = v === '1' || v === 'true';
      } else if (k === 'maxActionsPerTurn' || k === 'searchTurnMoveLimit') {
        options[k] = Number(v);
      } else {
        options[k] = v;
      }
    }
  }
  return { id, options };
}

function makeAdapter(spec) {
  const { id, options } = parseEngineSpec(spec);
  if (id === 'rc2') return makeRc2Adapter(id, options);
  if (id === 'random') return makeRandomAdapter(id, options);
  if (id === 'pass') return makePassAdapter(id);
  if (id === 'first') return makeFirstActionAdapter(id);
  if (id === 'illegal') return makeIllegalAdapter(id);
  throw new Error(`Unknown engine id: ${id}`);
}

async function runMatch(options = {}) {
  const {
    engineA = 'rc2',
    engineB = 'rc2',
    pairs = 10,
    openingPreset = 'test',
    openings = null,
    outputDir = './tmp/engine-match',
    sprtOptions = null,
    control = {}
  } = options;

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const book = openings || buildBook({ presets: [openingPreset], pairs });
  const sprt = sprtOptions ? makeSprt(sprtOptions) : null;
  let sprtVerdict = null;
  const gameRecords = [];
  const pairResults = [];

  for (let i = 0; i < book.length; i += 1) {
    const opening = book[i];
    const pairId = `pair-${i}`;

    // Game 1: A = North, B = South
    const game1 = await runGame({
      opening: { loa1: opening.loa1 },
      engines: { north: makeAdapter(engineA), south: makeAdapter(engineB) },
      pairId,
      gameId: `${pairId}-g1`,
      openingId: opening.openingId,
      openingCluster: opening.cluster,
      ...control
    });

    // Game 2: B = North, A = South
    const game2 = await runGame({
      opening: { loa1: opening.loa1 },
      engines: { north: makeAdapter(engineB), south: makeAdapter(engineA) },
      pairId,
      gameId: `${pairId}-g2`,
      openingId: opening.openingId,
      openingCluster: opening.cluster,
      ...control
    });

    gameRecords.push(game1, game2);
    const score = pairScore(
      { result: game1.result },
      { result: game2.result }
    );
    pairResults.push({ pairId, openingId: opening.openingId, score, game1: game1.gameId, game2: game2.gameId });

    if (sprt) {
      sprtVerdict = sprt.update(score);
      if (sprtVerdict.status !== 'continue') {
        break;
      }
    }
  }

  const summary = {
    engineA,
    engineB,
    pairsRun: pairResults.length,
    pairResults,
    sprt: sprtVerdict || (sprt ? sprt.current() : null),
    games: gameRecords.map(g => ({
      gameId: g.gameId,
      result: g.result,
      reason: g.reason,
      actions: g.actions.length,
      metrics: g.pathologyMetrics
    }))
  };

  const outPath = resolve(outputDir, `match-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  return { summary, outPath };
}

export { runMatch, parseEngineSpec, makeAdapter };
