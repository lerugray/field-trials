import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatLoa1,
  parseLoa1,
  formatAction,
  parseAction,
  formatMoveList,
  parseMoveList,
  formatGameRecord,
  parseGameRecord,
  encodeId,
  decodeId
} from '../src/notation.js';
import { createState, createPiece, resetToTestPreset, makeLcg } from '../src/state.js';
import { legalActions, applyAction } from '../src/engine.js';

const strict = assert.strict;

test('coordinate and class round-trip on test preset', () => {
  const state = resetToTestPreset(createState());
  const serialized = formatLoa1(state);
  strict.ok(serialized.startsWith('LOA1 '));
  const parsed = parseLoa1(serialized);
  strict.equal(formatLoa1(parsed), serialized);
});

test('game-over state round-trips', () => {
  const state = createState();
  state.pieces = [
    createPiece({ id: 'n1', side: 'North', cls: 'Infantry', x: 4, y: 18 })
  ];
  state.gameOver = { winner: 'North', reason: 'all enemy fighting units eliminated' };
  const serialized = formatLoa1(state);
  const parsed = parseLoa1(serialized);
  strict.equal(parsed.gameOver?.winner, 'North');
  strict.equal(formatLoa1(parsed), serialized);
});

test('pending retreats preserve order', () => {
  const state = createState();
  state.pieces = [
    createPiece({ id: 's1', side: 'South', cls: 'Infantry', x: 4, y: 18 }),
    createPiece({ id: 's2', side: 'South', cls: 'Infantry', x: 5, y: 18 })
  ];
  state.pendingRetreats = [
    { id: 's2', fromX: 5, fromY: 18 },
    { id: 's1', fromX: 4, fromY: 18 }
  ];
  const serialized = formatLoa1(state);
  const parsed = parseLoa1(serialized);
  strict.deepEqual(parsed.pendingRetreats, state.pendingRetreats);
});

test('action notation round-trip', () => {
  const state = resetToTestPreset(createState());
  const actions = legalActions(state).slice(0, 10);
  for (const action of actions) {
    const text = formatAction(action, state);
    const parsed = parseAction(text);
    strict.equal(parsed.type, action.type);
    if (action.pieceId) strict.equal(parsed.pieceId, action.pieceId);
    if (action.targetId) strict.equal(parsed.targetId, action.targetId);
    if (action.x !== undefined) {
      strict.equal(parsed.x, action.x);
      strict.equal(parsed.y, action.y);
    }
  }
});

test('end-turn action round-trips', () => {
  strict.deepEqual(parseAction('E'), { type: 'end-turn' });
  strict.equal(formatAction({ type: 'end-turn' }), 'E');
});

test('percent-encoded ids round-trip', () => {
  const weird = 'péçé %20';
  strict.equal(decodeId(encodeId(weird)), weird);
  const state = createState();
  state.pieces = [
    createPiece({ id: weird, side: 'North', cls: 'Infantry', x: 0, y: 0 })
  ];
  const serialized = formatLoa1(state);
  const parsed = parseLoa1(serialized);
  strict.equal(parsed.pieces[0].id, weird);
  strict.equal(formatLoa1(parsed), serialized);
});

test('game record round-trip with no moves', () => {
  const state = resetToTestPreset(createState());
  const start = formatLoa1(state);
  const record = formatGameRecord(start, [], 'draw', 'maxturn', { seed: '7' });
  const parsed = parseGameRecord(record);
  strict.equal(parsed.result, 'draw');
  strict.equal(parsed.reason, 'maxturn');
  strict.equal(parsed.tags.seed, '7');
  strict.equal(formatGameRecord(formatLoa1(parsed.start), parsed.actions, parsed.result, parsed.reason, parsed.tags), record);
});

test('random legal states serialize and re-serialize byte-identically', () => {
  const lcg = makeLcg(42);
  let state = resetToTestPreset(createState());
  for (let i = 0; i < 200; i += 1) {
    const actions = legalActions(state);
    if (actions.length === 0 || state.gameOver) break;
    const action = actions[Math.floor(lcg() * actions.length)];
    const next = applyAction(state, action);
    const canonical = formatLoa1(next);
    const reparsed = parseLoa1(canonical);
    strict.equal(formatLoa1(reparsed), canonical);
    state = next;
  }
});
