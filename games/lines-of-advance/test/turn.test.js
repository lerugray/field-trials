import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, createPiece } from '../src/state.js';
import {
  initTurnState,
  tryTurnMove,
  applyCombat,
  applyArsenalCapture,
  endTurn,
  applyRetreat,
  movesRemaining,
  canMovePiece,
  isInRetreatPhase,
  undo,
  agreeDraw,
  concede
} from '../src/turn.js';
import { serializeState, parseState } from '../src/state.js';

function place(state, side, cls, x, y) {
  const p = createPiece({ side, cls, x, y });
  state.pieces.push(p);
  return p;
}

function targetAt(state, x, y) {
  return state.pieces.find(p => p.x === x && p.y === y)?.id;
}

// Row 31: turn consists of up to five moves followed by one attack.
test('turn allows up to five moves then an attack (row 31)', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  // Space the infantry so each one-square north move lands on an empty square.
  place(s, 'North', 'Infantry', 8, 2);
  place(s, 'North', 'Infantry', 8, 4);
  place(s, 'North', 'Infantry', 8, 6);
  place(s, 'North', 'Infantry', 8, 8);
  place(s, 'North', 'Infantry', 8, 10);
  place(s, 'North', 'Foot Relay', 8, 12); // extra unit to test the move cap
  place(s, 'South', 'Infantry', 9, 4); // within range after the northward moves

  let state = s;
  for (let i = 0; i < 5; i += 1) {
    const p = state.pieces[i + 1];
    const result = tryTurnMove(state, p.id, p.x, p.y + 1);
    assert.equal(result.error, null);
    state = result.state;
  }
  assert.equal(movesRemaining(state), 0);
  const sixth = tryTurnMove(state, state.pieces[6].id, 8, 13);
  assert.equal(sixth.error, 'No moves remaining');

  const attack = applyCombat(state, targetAt(state, 9, 4));
  assert.equal(attack.error, null);
  assert.equal(attack.state.hasAttacked, true);
});

// Row 33: no unit may be moved twice in the same turn.
test('unit cannot be moved twice in one turn (row 33)', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'North', 'Infantry', 8, 10);
  place(s, 'South', 'Infantry', 8, 0); // prevent premature victory
  let state = tryTurnMove(s, s.pieces[1].id, 8, 11).state;
  const again = tryTurnMove(state, s.pieces[1].id, 8, 12);
  assert.equal(again.error, 'Cannot move this unit');
});

test('ordinary movement is closed after the turn attack (row 35)', () => {
  let state = initTurnState(createState());
  const mover = place(state, 'North', 'Foot Relay', 8, 18);
  place(state, 'North', 'Infantry', 8, 4);
  const target = place(state, 'South', 'Foot Relay', 8, 2);
  place(state, 'South', 'Infantry', 20, 0);
  const attack = applyCombat(state, target.id);
  assert.equal(attack.error, null);
  state = attack.state;
  const move = tryTurnMove(state, mover.id, 9, 18);
  assert.equal(move.error, 'Cannot move this unit');
  assert.equal(move.state, state);
});

// Row 43/46: forced retreat as first move of next turn; retreated unit cannot attack.
test('forced retreat is resolved at start of owning turn (rows 43, 46)', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  // South artillery target at (8,2) will be forced to retreat by North attack.
  place(s, 'South', 'Foot Artillery', 8, 2);
  place(s, 'North', 'Infantry', 8, 4);
  place(s, 'North', 'Foot Artillery', 8, 5);

  let state = applyCombat(s, targetAt(s, 8, 2)).state;
  assert.equal(state.pendingRetreats.length, 1);
  state = endTurn(state); // North -> South
  assert.equal(state.turn, 'South');
  assert.equal(isInRetreatPhase(state), true);

  const retreat = state.pendingRetreats[0];
  const resolved = applyRetreat(state, retreat.id, 9, 2);
  assert.equal(resolved.error, null);
  assert.equal(resolved.state.retreatedThisTurn.includes(retreat.id), true);
  assert.equal(resolved.state.pendingRetreats.length, 0);
});

// Row 45: retreat with no legal destination destroys the unit immediately.
test('retreat with no adjacent square destroys the unit (row 45)', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Foot Artillery', 8, 2);
  place(s, 'North', 'Infantry', 8, 4);
  place(s, 'North', 'Foot Artillery', 8, 5);
  // Fill adjacent retreat squares with friendly relays (non-defenders).
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    place(s, 'South', 'Foot Relay', 8 + dx, 2 + dy);
  }

  const result = applyCombat(s, targetAt(s, 8, 2));
  assert.equal(result.combat.result, 'destroyed');
  assert.equal(result.state.pendingRetreats.length, 0);
  assert.equal(result.state.pieces.some(p => p.x === 8 && p.y === 2), false);
});

// Row 75: victory by eliminating all enemy fighting units.
test('victory detected after last enemy fighter is destroyed (row 75)', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Infantry', 8, 2);
  place(s, 'North', 'Infantry', 8, 4);

  const result = applyCombat(s, targetAt(s, 8, 2));
  assert.equal(result.state.gameOver.winner, 'North');
  assert.equal(result.state.gameOver.reason, 'all enemy fighting units eliminated');
});

// Row 77: occupying an enemy arsenal uses the turn's single attack.
test('arsenal capture consumes the single attack (row 77)', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'North', 'Infantry', 4, 2); // adjacent to South arsenal at (4,1)
  place(s, 'South', 'Infantry', 4, 18);

  // Move North infantry onto the South arsenal.
  let state = tryTurnMove(s, s.pieces[1].id, 4, 1).state;
  // Capturing the arsenal uses the single attack.
  const attack = applyArsenalCapture(state, 4, 1);
  assert.equal(attack.error, null);
  assert.equal(attack.state.hasAttacked, true);
  // A second attack should fail.
  const second = applyArsenalCapture(attack.state, 4, 18);
  assert.equal(second.error, 'Attack already declared');
});

test('an arsenal already held from a prior turn cannot be captured again', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'North', 'Infantry', 4, 2);
  place(s, 'South', 'Infantry', 20, 1);
  let state = tryTurnMove(s, s.pieces[1].id, 4, 1).state;
  state = applyArsenalCapture(state, 4, 1).state;
  state = endTurn(state);
  state = endTurn(state);
  const again = applyArsenalCapture(state, 4, 1);
  assert.equal(again.error, 'Arsenal is already held');
});

test('threefold exact repetition ends the live game as a draw', () => {
  const base = createState();
  place(base, 'North', 'Infantry', 4, 18);
  place(base, 'South', 'Infantry', 4, 1);
  let state = initTurnState(base);
  for (let i = 0; i < 4; i += 1) state = endTurn(state);
  assert.deepEqual(state.gameOver, {
    winner: null,
    result: 'draw',
    reason: 'threefold repetition'
  });
});

test('80 completed no-progress side turns end the live game as a draw', () => {
  const base = createState();
  place(base, 'North', 'Infantry', 4, 18);
  place(base, 'South', 'Infantry', 4, 1);
  let state = initTurnState(base);
  state.drawState.noProgressTurns = 79;
  state.drawState.positionCounts = {};
  state = endTurn(state);
  assert.equal(state.gameOver?.reason, '80-turn no-progress draw');
  assert.equal(state.gameOver?.winner, null);
});

test('agreed draw and concession provide explicit player termination paths', () => {
  const state = initTurnState(createState());
  assert.equal(agreeDraw(state).gameOver.reason, 'draw agreed');
  assert.deepEqual(concede(state, 'North').gameOver, {
    winner: 'South', reason: 'North conceded'
  });
});

// Undo restores previous position.
test('undo restores position before last move', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'North', 'Infantry', 8, 10);
  const moved = tryTurnMove(s, s.pieces[1].id, 8, 11).state;
  assert.equal(moved.pieces[1].y, 11);
  const undone = undo(moved);
  assert.equal(undone.pieces[1].y, 10);
});

test('undo removes the last log entry', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'North', 'Infantry', 8, 10);
  const moved = tryTurnMove(s, s.pieces[1].id, 8, 11).state;
  assert.equal(moved.log.length, 1);
  assert.equal(moved.log[0].moves[0].to, 'i12');
  const undone = undo(moved);
  assert.equal(undone.log.length, 0);
  assert.equal(undone.pieces[1].y, 10);
});

// Save/load round-trip preserves full mid-combat state (retreat pending, log, turn).
// History is deliberately EXCLUDED from serialization since 2026-08-08: embedding
// it made every snapshot contain all prior snapshots (exponential growth, RangeError
// around move 11-13, frozen game). Undo is runtime-only; loads start a fresh stack.
test('serialize/parse round-trip preserves mid-combat state', () => {
  const s = initTurnState(createState());
  place(s, 'North', 'Foot Relay', 8, 18);
  place(s, 'South', 'Foot Relay', 8, 1);
  place(s, 'South', 'Foot Artillery', 8, 2);
  place(s, 'North', 'Infantry', 8, 4);
  place(s, 'North', 'Foot Artillery', 8, 5);

  const afterMove = tryTurnMove(s, s.pieces[3].id, 8, 3).state;
  const afterCombat = applyCombat(afterMove, targetAt(afterMove, 8, 2)).state;
  assert.equal(afterCombat.pendingRetreats.length, 1);
  assert.equal(afterCombat.log.length, 1);
  assert.equal(afterCombat.history.length, 2);

  const roundTripped = parseState(serializeState(afterCombat));
  assert.equal(roundTripped.turn, 'North');
  assert.equal(roundTripped.turnNumber, 1);
  assert.equal(roundTripped.movedThisTurn.length, 1);
  assert.equal(roundTripped.hasAttacked, true);
  assert.equal(roundTripped.pendingRetreats.length, 1);
  assert.equal(roundTripped.log.length, 1);
  assert.equal(roundTripped.history.length, 0);
  assert.deepEqual(roundTripped.drawState, afterCombat.drawState);
  const target = roundTripped.pieces.find(p => p.cls === 'Foot Artillery' && p.side === 'South');
  assert.ok(target);
  assert.equal(target.x, 8);
  assert.equal(target.y, 2);
});
