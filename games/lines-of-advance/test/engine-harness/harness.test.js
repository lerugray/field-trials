import test from 'node:test';
import assert from 'node:assert/strict';
import { runGame } from '../../scripts/engine/match.js';
import { makeRc2Adapter } from '../../scripts/engine/engine-adapter.js';
import { computePathologyMetrics, fullTurns } from '../../scripts/engine/metrics.js';
import { parseLoa1, formatLoa1 } from '../../src/notation.js';
import { createState, createPiece } from '../../src/state.js';

function makeTinyAdapter(actions) {
  let i = 0;
  return {
    id: 'tiny',
    seed: 1,
    options: {},
    choose() {
      const action = actions[i];
      i += 1;
      return { action, depth: 1, nodes: 1, elapsedMs: 0, pv: [] };
    }
  };
}

test('harness determinism: same seed produces identical game', async () => {
  const engines = {
    north: makeRc2Adapter('rc2-N', { nodeBudget: 300, maxDepth: 2 }),
    south: makeRc2Adapter('rc2-S', { nodeBudget: 300, maxDepth: 2 })
  };
  const control = { maxTurns: 20, noProgressTurns: 10, passTurns: 4 };
  const a = await runGame({ engines, ...control, gameId: 'a' });
  const b = await runGame({ engines, ...control, gameId: 'b' });
  assert.equal(a.result, b.result);
  assert.equal(a.reason, b.reason);
  assert.deepEqual(a.actions.map(e => e.action), b.actions.map(e => e.action));
});

test('metric correctness on a hand-built tiny game record', () => {
  // Build a synthetic action diary with valid LOA1 before/after states.
  // North moves nI1 a10->b10, South passes, North reverses b10->a10,
  // South passes, North attacks sI1.
  const state = createState();
  state.pieces = [
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 0, y: 9 }),
    createPiece({ id: 'sI1', side: 'South', cls: 'Infantry', x: 1, y: 9 })
  ];
  state.turn = 'North';

  function clone(pieces) {
    return pieces.map(p => ({ ...p, stats: { ...p.stats } }));
  }

  function move(state, id, x, y) {
    const next = { ...state, pieces: clone(state.pieces) };
    const p = next.pieces.find(p => p.id === id);
    p.x = x;
    p.y = y;
    next.movedThisTurn = [...next.movedThisTurn, id];
    return next;
  }

  function attack(state) {
    const next = { ...state, hasAttacked: true };
    return next;
  }

  function endTurn(state) {
    const next = { ...state, turn: state.turn === 'North' ? 'South' : 'North' };
    if (next.turn === 'North') next.turnNumber += 1;
    next.movedThisTurn = [];
    next.hasAttacked = false;
    return next;
  }

  const s0 = state;
  const s1 = move(s0, 'nI1', 1, 9);
  const s2 = endTurn(s1);
  const s3 = endTurn(s2);
  const s4 = move(s3, 'nI1', 0, 9);
  const s5 = endTurn(s4);
  const s6 = endTurn(s5);
  const s7 = move(s6, 'nI1', 1, 9);
  const s8 = attack(s7);
  const s9 = endTurn(s8);

  const actions = [
    { before: formatLoa1(s0), after: formatLoa1(s1), side: 'North', action: 'M:nI1@a10-b10', depth: 1 },
    { before: formatLoa1(s1), after: formatLoa1(s2), side: 'North', action: 'E', depth: 1 },
    { before: formatLoa1(s2), after: formatLoa1(s3), side: 'South', action: 'E', depth: 1 },
    { before: formatLoa1(s3), after: formatLoa1(s4), side: 'North', action: 'M:nI1@b10-a10', depth: 1 },
    { before: formatLoa1(s4), after: formatLoa1(s5), side: 'North', action: 'E', depth: 1 },
    { before: formatLoa1(s5), after: formatLoa1(s6), side: 'South', action: 'E', depth: 1 },
    { before: formatLoa1(s6), after: formatLoa1(s7), side: 'North', action: 'M:nI1@a10-b10', depth: 1 },
    { before: formatLoa1(s7), after: formatLoa1(s8), side: 'North', action: 'A:sI1@b10', depth: 1 },
    { before: formatLoa1(s8), after: formatLoa1(s9), side: 'North', action: 'E', depth: 1 }
  ];

  const metrics = computePathologyMetrics({ actions });
  assert.equal(metrics.attackTurns, 1);
  assert.ok(metrics._raw.reversalTurns >= 1, 'expected at least one reversal');
  assert.ok(metrics.reverseRate > 0, 'expected positive reverse rate');
  assert.equal(metrics.absoluteReversalCount, 2);
  assert.equal(metrics._raw.reversalEligiblePieceMoves, 2);
  assert.equal(metrics.perPieceReturnRate, 1);
  assert.equal(metrics.absoluteAdvancingMoves, metrics._raw.advancingFighterMoves);
  assert.equal(metrics.completedDepthHistogram['1'], actions.length);
});

test('fullTurns groups primitive actions by full turn', () => {
  const actions = [
    { action: 'M:nI1@k11-k10' },
    { action: 'E' },
    { action: 'M:sI1@k9-k8' },
    { action: 'E' },
    { action: 'E' }
  ];
  const turns = fullTurns(actions);
  assert.equal(turns.length, 3);
  assert.equal(turns[0].length, 2);
  assert.equal(turns[1].length, 2);
  assert.equal(turns[2].length, 1);
});

test('runGame maxTurns counts completed side turns, not primitive actions', async () => {
  function oneMoveThenEnd(id) {
    return {
      id,
      seed: 1,
      options: {},
      choose() {
        return { action: { type: 'end-turn' }, depth: 1, nodes: 1, elapsedMs: 0, pv: [] };
      }
    };
  }
  const game = await runGame({
    engines: { north: oneMoveThenEnd('N'), south: oneMoveThenEnd('S') },
    maxTurns: 2,
    noProgressTurns: 80,
    passTurns: 10
  });
  assert.equal(game.actions.length, 2);
  assert.equal(game.actions.every(entry => entry.action === 'E'), true);
  assert.equal(game.pathologyMetrics._raw.turnCount, 2);
  assert.equal(game.reason, 'maxturn');
});
