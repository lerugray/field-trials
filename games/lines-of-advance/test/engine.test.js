import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, createPiece, resetToTestPreset, resetToCommsDrill } from '../src/state.js';
import { getLegalMoves } from '../src/movement.js';
import { computeCommunications } from '../src/comms.js';
import { canMovePiece, canDeclareAttack } from '../src/turn.js';
import { legalActions, applyAction, actionKey, evaluatePosition, searchBestAction,
  distanceToNearestEnemyArsenal, sideTempoEvaluation } from '../src/engine.js';

function stateWith(pieces, turn = 'North') {
  const state = createState();
  state.pieces = pieces;
  state.turn = turn;
  return state;
}

function tempoContext(root, previousMove, pathActions, overrides = {}) {
  const rootComms = computeCommunications(root);
  const previousMoves = new Map();
  const previousPositions = new Map();
  if (previousMove) {
    previousMoves.set('nI1', previousMove);
    previousPositions.set('nI1', previousMove.from);
  }
  return {
    rootState: root,
    rootPositions: new Map(root.pieces.map(p => [p.id, { x: p.x, y: p.y }])),
    previousMovesBySide: new Map([['North', previousMoves], ['South', new Map()]]),
    previousPositionsBySide: new Map([['North', previousPositions], ['South', new Map()]]),
    rootConnectedCounts: new Map([
      ['North', root.pieces.filter(p => p.side === 'North'
        && rootComms.status.get(p.id)?.status === 'in-communication').length],
      ['South', root.pieces.filter(p => p.side === 'South'
        && rootComms.status.get(p.id)?.status === 'in-communication').length]
    ]),
    rootImmediateLoss: new Map([['North', false], ['South', false]]),
    rootTacticalThreats: new Map([['North', 0], ['South', 0]]),
    pathActions: pathActions.map(action => ({ side: 'North', action })),
    tempoCounters: {},
    ...overrides
  };
}

test('engine move generation is a parity adapter over existing movement legality', () => {
  const state = resetToTestPreset(createState());
  const actions = legalActions(state);
  const moves = actions.filter(action => action.type === 'move');
  const expected = [];
  for (const piece of state.pieces.filter(p => p.side === state.turn && canMovePiece(state, p.id))) {
    for (const destination of getLegalMoves(state, piece.id)) {
      expected.push(`move:${piece.id}:${destination.coord}`);
    }
  }
  assert.deepEqual(moves.map(actionKey).sort(), expected.sort());
  assert.equal(actions.at(-1).type, 'end-turn');
});

test('engine attack actions match the existing combat legality surface', () => {
  const state = stateWith([
    createPiece({ id: 'n1', side: 'North', cls: 'Infantry', x: 4, y: 18 }),
    createPiece({ id: 's1', side: 'South', cls: 'Infantry', x: 4, y: 16 })
  ]);
  const attacks = legalActions(state).filter(action => action.type === 'attack');
  assert.equal(canDeclareAttack(state, 's1'), true);
  assert.deepEqual(attacks, [{ type: 'attack', targetId: 's1' }]);
  assert.doesNotThrow(() => applyAction(state, attacks[0]));
});

test('communication cut produces a visible evaluator swing', () => {
  const north = [
    createPiece({ id: 'n1', side: 'North', cls: 'Infantry', x: 4, y: 16 }),
    createPiece({ id: 'n2', side: 'North', cls: 'Infantry', x: 5, y: 16 })
  ];
  const intact = stateWith(north.concat(
    createPiece({ id: 's1', side: 'South', cls: 'Infantry', x: 3, y: 17 })
  ));
  const cut = stateWith(north.concat(
    createPiece({ id: 's1', side: 'South', cls: 'Infantry', x: 4, y: 17 })
  ));
  const intactEval = evaluatePosition(intact).score;
  const cutEval = evaluatePosition(cut).score;
  assert.ok(cutEval < intactEval - 100, `${intactEval} should fall visibly after cut, got ${cutEval}`);
});

test('search returns an action from the legal generator', () => {
  const state = resetToTestPreset(createState());
  const legal = new Set(legalActions(state).map(actionKey));
  const result = searchBestAction(state, { seed: 17, maxDepth: 2, nodeBudget: 600 });
  assert.ok(result.action);
  assert.ok(legal.has(actionKey(result.action)));
  assert.ok(result.depth >= 1);
  assert.ok(result.nodes <= 600);
});

test('search choice and principal variation are deterministic for seed and position', () => {
  const state = resetToTestPreset(createState());
  const options = { seed: 20260808, maxDepth: 2, nodeBudget: 700 };
  const first = searchBestAction(state, options);
  const second = searchBestAction(state, options);
  assert.equal(actionKey(first.action), actionKey(second.action));
  assert.deepEqual(first.pv.map(actionKey), second.pv.map(actionKey));
  assert.equal(first.score, second.score);
  assert.equal(first.depth, second.depth);
  assert.equal(first.nodes, second.nodes);
});

test('piece style is render-only for legal actions, evaluation, and search', () => {
  const base = resetToTestPreset(createState());
  const nato = { ...base, settings: { ...base.settings, pieceStyle: 'nato' } };
  const chess = { ...base, settings: { ...base.settings, pieceStyle: 'chess' } };
  const keys = state => legalActions(state).map(actionKey);
  assert.deepEqual(keys(nato), keys(base));
  assert.deepEqual(keys(chess), keys(base));
  assert.equal(evaluatePosition(nato).score, evaluatePosition(base).score);
  assert.equal(evaluatePosition(chess).score, evaluatePosition(base).score);
  const baseSearch = searchBestAction(base, { seed: 9, maxDepth: 1, nodeBudget: 200 });
  const natoSearch = searchBestAction(nato, { seed: 9, maxDepth: 1, nodeBudget: 200 });
  assert.equal(actionKey(natoSearch.action), actionKey(baseSearch.action));
});

test('turn-aware search returns a legal action and reports turn-aware flag', () => {
  const state = resetToTestPreset(createState());
  const legal = new Set(legalActions(state).map(actionKey));
  const result = searchBestAction(state, { seed: 17, maxDepth: 2, nodeBudget: 600, turnAware: true });
  assert.ok(result.action);
  assert.ok(legal.has(actionKey(result.action)));
  assert.equal(result.turnAware, true);
  assert.ok(result.nodes <= 600);
});

test('turn-aware search is deterministic for seed and position', () => {
  const state = resetToTestPreset(createState());
  const options = { seed: 20260808, maxDepth: 2, nodeBudget: 700, turnAware: true };
  const first = searchBestAction(state, options);
  const second = searchBestAction(state, options);
  assert.equal(actionKey(first.action), actionKey(second.action));
  assert.deepEqual(first.pv.map(actionKey), second.pv.map(actionKey));
  assert.equal(first.score, second.score);
  assert.equal(first.depth, second.depth);
  assert.equal(first.nodes, second.nodes);
});

test('arsenal distance reads position state and ignores a neutralized objective', () => {
  const state = stateWith([
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 10, y: 5 }),
    createPiece({ id: 'nCap', side: 'North', cls: 'Infantry', x: 4, y: 1 }),
    createPiece({ id: 'sI1', side: 'South', cls: 'Infantry', x: 12, y: 0 })
  ]);
  assert.equal(distanceToNearestEnemyArsenal(state, state.pieces[0]), 10,
    'captured e2 must be excluded, leaving u2 as the nearest active South arsenal');
});

test('tempo safe-advance and non-progress terms both fire', () => {
  const root = stateWith([
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 5, y: 19 }),
    createPiece({ id: 'sI1', side: 'South', cls: 'Infantry', x: 12, y: 0 })
  ]);
  const advanced = stateWith([
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 5, y: 18 }),
    root.pieces[1]
  ]);
  const advanceContext = tempoContext(root, null,
    [{ type: 'move', pieceId: 'nI1', x: 5, y: 18 }]);
  assert.equal(sideTempoEvaluation(advanced, 'North', computeCommunications(advanced), advanceContext), 5);
  assert.equal(advanceContext.tempoCounters.safeAdvanceReward, 1);

  const lateral = stateWith([
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 6, y: 19 }),
    root.pieces[1]
  ]);
  const lateralContext = tempoContext(root, null,
    [{ type: 'move', pieceId: 'nI1', x: 6, y: 19 }]);
  assert.equal(sideTempoEvaluation(lateral, 'North', computeCommunications(lateral), lateralContext), -3);
  assert.equal(lateralContext.tempoCounters.nonProgressPenalty, 1);

  const defenseContext = tempoContext(root, null,
    [{ type: 'move', pieceId: 'nI1', x: 6, y: 19 }], {
      rootTacticalThreats: new Map([['North', 1], ['South', 0]])
    });
  assert.equal(sideTempoEvaluation(lateral, 'North', computeCommunications(lateral), defenseContext), 0);
  assert.equal(defenseContext.tempoCounters.nonProgressWaived, 1);
});

test('exact reversal requires a genuine previous move and current return', () => {
  const root = stateWith([
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 5, y: 18 }),
    createPiece({ id: 'sI1', side: 'South', cls: 'Infantry', x: 12, y: 0 })
  ]);
  const returned = stateWith([
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 5, y: 19 }),
    root.pieces[1]
  ]);
  const previousMove = { from: { x: 5, y: 19 }, to: { x: 5, y: 18 } };
  const context = tempoContext(root, previousMove,
    [{ type: 'move', pieceId: 'nI1', x: 5, y: 19 }]);
  assert.equal(sideTempoEvaluation(returned, 'North', computeCommunications(returned), context), -33);
  assert.equal(context.tempoCounters.genuineReversalReturns, 1);
  assert.equal(context.tempoCounters.reversalPenalty, 1);

  const stationaryContext = tempoContext(root, null, []);
  stationaryContext.previousPositionsBySide.get('North').set('nI1', { x: 5, y: 18 });
  assert.equal(sideTempoEvaluation(root, 'North', computeCommunications(root), stationaryContext), 0);
  assert.equal(stationaryContext.tempoCounters.legacyStationaryMatches, 1);
  assert.equal(stationaryContext.tempoCounters.reversalPenalty, undefined);
});

test('S5.3 reversal waivers cover retreat, material, arsenal, communication, and defense', () => {
  const makeReturn = () => {
    const root = stateWith([
      createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 5, y: 18 }),
      createPiece({ id: 'sI1', side: 'South', cls: 'Infantry', x: 12, y: 0 }),
      createPiece({ id: 'sR1', side: 'South', cls: 'Foot Relay', x: 20, y: 0 })
    ]);
    const returned = stateWith([
      createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 5, y: 19 }),
      root.pieces[1], root.pieces[2]
    ]);
    return { root, returned, previous: { from: { x: 5, y: 19 }, to: { x: 5, y: 18 } } };
  };

  {
    const { root, returned, previous } = makeReturn();
    const context = tempoContext(root, previous,
      [{ type: 'retreat', pieceId: 'nI1', x: 5, y: 19 }]);
    sideTempoEvaluation(returned, 'North', computeCommunications(returned), context);
    assert.equal(context.tempoCounters['reversalWaived.forcedRetreat'], 1);
  }
  {
    const { root, returned, previous } = makeReturn();
    returned.pieces = returned.pieces.filter(p => p.id !== 'sR1');
    const context = tempoContext(root, previous, [
      { type: 'move', pieceId: 'nI1', x: 5, y: 19 },
      { type: 'attack', targetId: 'sR1' }
    ]);
    sideTempoEvaluation(returned, 'North', computeCommunications(returned), context);
    assert.equal(context.tempoCounters['reversalWaived.winsMaterial'], 1);
  }
  {
    const root = stateWith([
      createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 5, y: 1 }),
      createPiece({ id: 'sI1', side: 'South', cls: 'Infantry', x: 12, y: 0 })
    ]);
    const returned = stateWith([
      createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 4, y: 1 }),
      root.pieces[1]
    ]);
    const previous = { from: { x: 4, y: 1 }, to: { x: 5, y: 1 } };
    const context = tempoContext(root, previous, [
      { type: 'move', pieceId: 'nI1', x: 4, y: 1 },
      { type: 'arsenal', x: 4, y: 1 }
    ]);
    sideTempoEvaluation(returned, 'North', computeCommunications(returned), context);
    assert.equal(context.tempoCounters['reversalWaived.capturesArsenal'], 1);
  }
  for (const [reason, overrides] of [
    ['restoresCommunication', { rootConnectedCounts: new Map([['North', -1], ['South', 0]]) }],
    ['avoidsImmediateLoss', { rootImmediateLoss: new Map([['North', true], ['South', false]]) }]
  ]) {
    const { root, returned, previous } = makeReturn();
    const context = tempoContext(root, previous,
      [{ type: 'move', pieceId: 'nI1', x: 5, y: 19 }], overrides);
    sideTempoEvaluation(returned, 'North', computeCommunications(returned), context);
    assert.equal(context.tempoCounters[`reversalWaived.${reason}`], 1);
  }
});

test('bound-aware TT returns same score as no-TT on shallow search', () => {
  const state = resetToTestPreset(createState());
  const options = { seed: 5, maxDepth: 2, nodeBudget: 800 };
  const withTT = searchBestAction(state, options);
  const noTT = searchBestAction(state, { ...options, disableTT: true });
  assert.equal(withTT.depth, noTT.depth);
  assert.equal(withTT.score, noTT.score);
  assert.equal(actionKey(withTT.action), actionKey(noTT.action));
});

test('turn-aware search without a within-turn limit finishes no ply at play budgets', () => {
  const state = resetToTestPreset(createState());
  for (const nodeBudget of [300, 900]) {
    const result = searchBestAction(state, {
      seed: 11, maxDepth: 3, nodeBudget, turnAware: true, maxActionsPerTurn: Infinity
    });
    assert.equal(result.depth, 0, `budget ${nodeBudget} should not finish a turn-aware ply`);
  }
});

test('shipped 900-node policy completes a turn-aware ply from the standard opening', () => {
  const state = resetToTestPreset(createState());
  const result = searchBestAction(state, {
    seed: 11, maxDepth: 3, nodeBudget: 900, turnAware: true,
    maxActionsPerTurn: Infinity, searchTurnMoveLimit: 1
  });
  assert.ok(result.depth >= 1, `expected a finished ply, got depth ${result.depth}`);
  assert.equal(result.searchTurnMoveLimit, 1);
  assert.ok(new Set(legalActions(state).map(actionKey)).has(actionKey(result.action)));
});

test('searchTurnMoveLimit bounds search only and leaves all five live moves available', () => {
  function playedMoveCountBeforeEndTurn(options) {
    let state = resetToTestPreset(createState());
    let moves = 0;
    for (let step = 0; step < 8; step += 1) {
      const result = searchBestAction(state, options);
      if (!result.action || result.action.type === 'end-turn') break;
      if (result.action.type === 'move') moves += 1;
      state = applyAction(state, result.action, { recordHistory: true });
    }
    return moves;
  }
  const base = { seed: 11, maxDepth: 3, nodeBudget: 300, turnAware: true };
  assert.equal(playedMoveCountBeforeEndTurn({ ...base, maxActionsPerTurn: 2 }), 2);
  assert.equal(playedMoveCountBeforeEndTurn({
    ...base, maxActionsPerTurn: Infinity, searchTurnMoveLimit: 1
  }), 5);
});

test('bound-aware TT stays equivalent under a within-turn search limit', () => {
  const state = resetToTestPreset(createState());
  const options = {
    seed: 5, maxDepth: 2, nodeBudget: 1500, turnAware: true,
    maxActionsPerTurn: Infinity, searchTurnMoveLimit: 1
  };
  const withTT = searchBestAction(state, options);
  const noTT = searchBestAction(state, { ...options, disableTT: true });
  assert.equal(withTT.depth, noTT.depth);
  assert.equal(withTT.score, noTT.score);
  assert.equal(actionKey(withTT.action), actionKey(noTT.action));
});

test('shipped policy takes a destroying attack in a legal tactical position', () => {
  let state = resetToCommsDrill(createState());
  let chosen = null;
  for (let decision = 0; decision < 3; decision += 1) {
    const result = searchBestAction(state, {
      seed: 11, maxDepth: 3, nodeBudget: 900, turnAware: true,
      maxActionsPerTurn: Infinity, searchTurnMoveLimit: 1
    });
    chosen = result.action;
    if (chosen.type === 'attack' || chosen.type === 'end-turn') break;
    state = applyAction(state, chosen, { recordHistory: true });
  }
  assert.equal(chosen.type, 'attack');
});

test('shipped policy declines an available resisted attack', () => {
  const state = stateWith([
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 2, y: 0 }),
    createPiece({ id: 'sI1', side: 'South', cls: 'Infantry', x: 3, y: 0 })
  ]);
  assert.equal(canDeclareAttack(state, 'sI1'), true);
  const result = searchBestAction(state, {
    seed: 11, maxDepth: 3, nodeBudget: 900, turnAware: true,
    maxActionsPerTurn: Infinity, searchTurnMoveLimit: 1
  });
  assert.notEqual(result.action.type, 'attack');
});

test('an already-held enemy arsenal emits no new capture action', () => {
  const state = stateWith([
    createPiece({ id: 'nI1', side: 'North', cls: 'Infantry', x: 4, y: 1 }),
    createPiece({ id: 'sI1', side: 'South', cls: 'Infantry', x: 20, y: 1 })
  ]);
  state.movedThisTurn = [];
  assert.equal(legalActions(state).some(action => action.type === 'arsenal'), false);
});
