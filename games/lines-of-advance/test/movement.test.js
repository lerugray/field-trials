import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  createPiece
} from '../src/state.js';
import { getLegalMoves, tryMovePiece, isImmobile } from '../src/movement.js';

// Movement tests place South pieces on their own arsenal lines so they are in supply
// (e.g., (4,2) aligns with South arsenal at (4,1)). Isolation is tested separately.

test('infantry has eight one-square destinations on an empty board', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 2 }));
  const moves = getLegalMoves(s, s.pieces[0].id);
  assert.equal(moves.length, 8);
});

test('infantry movement is blocked by occupied squares', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 2 }));
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 5, y: 3 }));
  const moves = getLegalMoves(s, s.pieces[0].id);
  assert.ok(!moves.some(m => m.coord === 'e3'));
  assert.equal(moves.length, 7);
});

test('cavalry has two-square straight, diagonal, and L-shaped moves', () => {
  let s = createState();
  // e3 is on the South arsenal line and in supply.
  s.pieces.push(createPiece({ side: 'South', cls: 'Cavalry', x: 4, y: 2 }));
  const moves = getLegalMoves(s, s.pieces[0].id);
  const byCoord = new Set(moves.map(m => m.coord));
  // straight two north: e3 -> e5
  assert.ok(byCoord.has('e5'));
  // diagonal two north-east: e3 -> g5
  assert.ok(byCoord.has('g5'));
  // L-shape: e3 -> f5 or g4
  assert.ok(byCoord.has('f5') || byCoord.has('g4'));
  assert.ok(moves.length > 8);
});

test('cavalry two-square move is blocked by intermediate piece', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Cavalry', x: 4, y: 2 }));
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 3 })); // blocks straight north
  const moves = getLegalMoves(s, s.pieces[0].id);
  assert.ok(!moves.some(m => m.y === 4 && m.x === 4));
});

test('mountain squares are not legal destinations', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Cavalry', x: 5, y: 5 }));
  const moves = getLegalMoves(s, s.pieces[0].id);
  assert.ok(!moves.some(m => m.x === 6 && m.y === 7)); // South mountain ridge
});

test('cavalry may move one square (row 26)', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Cavalry', x: 4, y: 2 })); // e3
  const moves = getLegalMoves(s, s.pieces[0].id);
  assert.ok(moves.some(m => m.coord === 'e4'));
});

test('mounted artillery may move one square (row 26)', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Mounted Artillery', x: 4, y: 2 })); // e3
  const moves = getLegalMoves(s, s.pieces[0].id);
  assert.ok(moves.some(m => m.coord === 'e4'));
});

test('L-shaped move uses diagonal-then-straight when straight-first is blocked (row 28)', () => {
  let s = createState();
  // e3 -> g4. Straight-first path f3->g4 is blocked at f3.
  s.pieces.push(createPiece({ side: 'South', cls: 'Cavalry', x: 4, y: 2 })); // e3
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 5, y: 2 })); // f3 blocker
  const moves = getLegalMoves(s, s.pieces[0].id);
  assert.ok(moves.some(m => m.coord === 'g4'));
});

test('L-shaped move is blocked only when both step orders are blocked (row 28)', () => {
  let s = createState();
  // e3 -> g4. Block both f3 (straight-first) and f4 (diagonal-first).
  s.pieces.push(createPiece({ side: 'South', cls: 'Cavalry', x: 4, y: 2 })); // e3
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 5, y: 2 })); // f3
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 5, y: 3 })); // f4
  const moves = getLegalMoves(s, s.pieces[0].id);
  assert.ok(!moves.some(m => m.coord === 'g4'));
});

test('isolated fighting unit cannot move', () => {
  let s = createState();
  // North infantry in south-west plain, not aligned with any North arsenal and alone.
  s.pieces.push(createPiece({ side: 'North', cls: 'Infantry', x: 2, y: 2 }));
  assert.ok(isImmobile(s, s.pieces[0]));
  assert.equal(getLegalMoves(s, s.pieces[0].id).length, 0);
});

test('relay may move while isolated', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'North', cls: 'Foot Relay', x: 2, y: 2 }));
  assert.ok(!isImmobile(s, s.pieces[0]));
  assert.ok(getLegalMoves(s, s.pieces[0].id).length > 0);
});

test('tryMovePiece rejects illegal move in rules mode', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 2 }));
  const p = s.pieces[0];
  const result = tryMovePiece(s, p.id, 10, 10);
  assert.equal(result.error, 'Illegal move');
  assert.equal(result.state.pieces[0].x, 4);
});

test('tryMovePiece allows any passable square in sandbox mode', () => {
  let s = createState();
  s.sandbox = true;
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 2 }));
  const p = s.pieces[0];
  const result = tryMovePiece(s, p.id, 10, 10);
  assert.equal(result.error, null);
  assert.equal(result.state.pieces[0].x, 10);
});

test('foot and mounted artillery use correct movement rates', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Foot Artillery', x: 4, y: 2 }));
  s.pieces.push(createPiece({ side: 'South', cls: 'Mounted Artillery', x: 20, y: 2 }));
  assert.equal(getLegalMoves(s, s.pieces[0].id).length, 8);
  assert.ok(getLegalMoves(s, s.pieces[1].id).length > 8);
});
