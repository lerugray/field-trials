#!/usr/bin/env node
// gate.js: release audit gate for the exact 900-node browser policy.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { runGame } from './match.js';
import { makeOpening } from './book.js';
import { makeRc2Adapter } from './engine-adapter.js';
import { fullTurns, countPieceReturns } from './metrics.js';
import { legalActions } from '../../src/engine.js';
import { computeCombat } from '../../src/combat.js';
import { activeArsenals } from '../../src/comms.js';
import { isFighter } from '../../src/state.js';

const GAMES_PER_ARM = Number(process.env.LOA_GATE_GAMES) || 40;
if (GAMES_PER_ARM < 40 && process.env.LOA_GATE_ALLOW_SHORT !== '1') {
  throw new Error('release gate requires at least 40 games per arm');
}

const CONTROL = Object.freeze({
  maxTurns: 80,
  noProgressTurns: 80,
  passTurns: 10,
  hardTimeoutMs: 120_000
});

// Declared release thresholds. These are deliberately not environment knobs.
const THRESHOLDS = Object.freeze({
  completedDepthFraction: 0.90,
  usefulAttackCount: 20,
  repetitionRate: 0.25,
  decisiveResultRate: 0.20,
  reversalRate: 0.15
});

const BASE_SEED = 0x4c4f4135;
const seeds = Array.from({ length: GAMES_PER_ARM }, (_, i) =>
  (BASE_SEED + Math.imul(i + 1, 7919)) >>> 0);
const openings = seeds.map((seed, i) => makeOpening('test', seed, 6 + (i % 10)));

function otherSide(side) {
  return side === 'North' ? 'South' : 'North';
}

function distanceToObjective(state, piece, x = piece.x, y = piece.y) {
  const objectives = activeArsenals(state, otherSide(piece.side));
  let best = Infinity;
  for (const objective of objectives) {
    best = Math.min(best, Math.max(Math.abs(x - objective.x), Math.abs(y - objective.y)));
  }
  return best;
}

function makeAdvancingAdapter(seed) {
  let tieSeed = seed >>> 0;
  function next() {
    tieSeed = (Math.imul(tieSeed, 1664525) + 1013904223) >>> 0;
    return tieSeed / 4294967296;
  }
  return {
    id: 'advancing-reference',
    seed,
    options: { policy: 'useful-attack-then-advance', movesPerTurn: 3 },
    choose(state) {
      const actions = legalActions(state);
      const arsenal = actions.find(action => action.type === 'arsenal');
      if (arsenal) return { action: arsenal, depth: null, nodes: 0, elapsedMs: 0, pv: [] };

      const useful = actions
        .filter(action => action.type === 'attack')
        .map(action => ({ action, combat: computeCombat(state, action.targetId) }))
        .filter(item => !item.combat.error && item.combat.result !== 'resist')
        .sort((a, b) => {
          const value = result => result === 'destroyed' ? 2 : 1;
          return value(b.combat.result) - value(a.combat.result)
            || a.action.targetId.localeCompare(b.action.targetId);
        });
      if (useful.length > 0) {
        return { action: useful[0].action, depth: null, nodes: 0, elapsedMs: 0, pv: [] };
      }

      const endTurn = actions.find(action => action.type === 'end-turn');
      const moves = actions.filter(action => action.type === 'move' || action.type === 'retreat');
      if ((state.movedThisTurn || []).length >= 3 || moves.length === 0) {
        return { action: endTurn, depth: null, nodes: 0, elapsedMs: 0, pv: [] };
      }
      const ranked = moves.map(action => {
        const piece = state.pieces.find(candidate => candidate.id === action.pieceId);
        const advance = piece && isFighter(piece.cls)
          ? distanceToObjective(state, piece) - distanceToObjective(state, piece, action.x, action.y)
          : 0;
        return { action, advance, tie: next() };
      }).sort((a, b) => b.advance - a.advance || a.tie - b.tie);
      return { action: ranked[0]?.action || endTurn, depth: null, nodes: 0, elapsedMs: 0, pv: [] };
    }
  };
}

function makePolicyAdapter(id, seed, searchTurnMoveLimit) {
  return makeRc2Adapter(id, {
    seed,
    timeBudgetMs: 900,
    nodeBudget: 900,
    maxDepth: 3,
    turnAware: true,
    maxActionsPerTurn: Infinity,
    searchTurnMoveLimit
  });
}

function actorMetrics(records, engineId) {
  let decisions = 0;
  let completed = 0;
  let attacks = 0;
  let usefulAttacks = 0;
  let resistedAttacks = 0;
  let arsenalCaptures = 0;
  let turns = 0;
  let reversalTurns = 0;
  let reversalReturns = 0;
  let reversalEligible = 0;
  const previousTurn = { North: null, South: null };
  const depthHistogram = {};

  for (const record of records) {
    previousTurn.North = null;
    previousTurn.South = null;
    for (const entry of record.actions) {
      if (entry.engine !== engineId) continue;
      decisions += 1;
      const depth = entry.depth ?? 0;
      depthHistogram[depth] = (depthHistogram[depth] || 0) + 1;
      if (depth >= 1) completed += 1;
      if (entry.actionObj.type === 'attack') {
        attacks += 1;
        if (entry.combatResult === 'destroyed' || entry.combatResult === 'retreat') usefulAttacks += 1;
        if (entry.combatResult === 'resist') resistedAttacks += 1;
      }
      if (entry.actionObj.type === 'arsenal') arsenalCaptures += 1;
    }
    for (const turn of fullTurns(record.actions)) {
      if (turn[0]?.engine !== engineId) continue;
      const side = turn[0].side;
      const returns = countPieceReturns(previousTurn[side], turn);
      turns += 1;
      if (returns.returns > 0) reversalTurns += 1;
      reversalReturns += returns.returns;
      reversalEligible += returns.eligible;
      previousTurn[side] = turn;
    }
  }

  const repetitions = records.filter(record => record.reason === 'rep3').length;
  const decisive = records.filter(record => record.result !== 'draw').length;
  return {
    games: records.length,
    colors: records.reduce((acc, record) => {
      const north = record.engines.north.id === engineId;
      acc[north ? 'North' : 'South'] += 1;
      return acc;
    }, { North: 0, South: 0 }),
    decisions,
    completedDepthFraction: decisions ? completed / decisions : 0,
    depthHistogram,
    attacks,
    usefulAttacks,
    resistedAttacks,
    arsenalCaptures,
    repetitionRate: records.length ? repetitions / records.length : 0,
    decisiveResultRate: records.length ? decisive / records.length : 0,
    results: records.reduce((acc, record) => {
      const key = `${record.result}:${record.reason}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    turns,
    reversalRate: turns ? reversalTurns / turns : 0,
    perPieceReturnRate: reversalEligible ? reversalReturns / reversalEligible : 0
  };
}

function verdict(metrics) {
  const checks = {
    completedDepthFraction: metrics.completedDepthFraction >= THRESHOLDS.completedDepthFraction,
    usefulAttackCount: metrics.usefulAttacks >= THRESHOLDS.usefulAttackCount,
    repetitionRate: metrics.repetitionRate <= THRESHOLDS.repetitionRate,
    decisiveResultRate: metrics.decisiveResultRate >= THRESHOLDS.decisiveResultRate,
    reversalRate: metrics.reversalRate <= THRESHOLDS.reversalRate
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

async function runArm(name, searchTurnMoveLimit) {
  const engineId = `${name}-900`;
  const workerCount = Math.max(1, Math.min(
    Number(process.env.LOA_GATE_WORKERS) || 4,
    availableParallelism(),
    openings.length
  ));
  const records = new Array(openings.length);
  let nextIndex = 0;
  let completed = 0;
  async function runWorkerQueue() {
    while (nextIndex < openings.length) {
      const i = nextIndex;
      nextIndex += 1;
      records[i] = workerCount === 1
        ? await runGateGame(name, searchTurnMoveLimit, i)
        : await runGateWorker(name, searchTurnMoveLimit, i);
      completed += 1;
      console.error(`[release-gate] ${name} ${completed}/${openings.length}`);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => runWorkerQueue()));
  const metrics = actorMetrics(records, engineId);
  return {
    name,
    policy: {
      nodeBudget: 900,
      maxDepth: 3,
      turnAware: true,
      maxActionsPerTurn: 'Infinity',
      searchTurnMoveLimit: searchTurnMoveLimit ?? null
    },
    metrics,
    verdict: verdict(metrics),
    games: records.map(record => ({
      gameId: record.gameId,
      openingId: record.openingId,
      seed: record.control.seed,
      color: record.engines.north.id === engineId ? 'North' : 'South',
      result: record.result,
      reason: record.reason,
      turns: record.pathologyMetrics._raw.turnCount,
      actions: record.actions.length
    }))
  };
}

async function runGateGame(name, searchTurnMoveLimit, i) {
  const engineId = `${name}-900`;
  const side = i % 2 === 0 ? 'North' : 'South';
  const policy = makePolicyAdapter(engineId, seeds[i], searchTurnMoveLimit);
  const reference = makeAdvancingAdapter(seeds[i] ^ 0x9e3779b9);
  const engines = side === 'North'
    ? { north: policy, south: reference }
    : { north: reference, south: policy };
  return runGame({
    opening: { loa1: openings[i].loa1 },
    engines,
    pairId: `${name}-${i}`,
    gameId: `${name}-${i}-${side}`,
    openingId: openings[i].openingId,
    openingCluster: `test-prefix-${openings[i].prefixLength}`,
    seed: seeds[i],
    ...CONTROL
  });
}

function runGateWorker(name, searchTurnMoveLimit, i) {
  return new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { name, searchTurnMoveLimit, i }
    });
    worker.once('message', resolveWorker);
    worker.once('error', rejectWorker);
    worker.once('exit', code => {
      if (code !== 0) rejectWorker(new Error(`gate worker exited ${code}`));
    });
  });
}

if (!isMainThread) {
  const record = await runGateGame(
    workerData.name,
    workerData.searchTurnMoveLimit ?? undefined,
    workerData.i
  );
  parentPort.postMessage(record);
} else {
  const before = await runArm('before', undefined);
  const after = await runArm('after', 1);
  const report = {
    schema: 'loa-release-ai-gate-v1',
    generatedAt: new Date().toISOString(),
    thresholds: THRESHOLDS,
    control: CONTROL,
    gamesPerArm: GAMES_PER_ARM,
    distinctOpenings: new Set(openings.map(opening => opening.loa1)).size,
    seeds,
    arms: [before, after],
    pass: after.verdict.pass
  };

  const outputDir = resolve('tmp');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, 'release-ai-gate.json');
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error(`[release-gate] report ${outputPath}`);
  process.exitCode = report.pass ? 0 : 1;
}
