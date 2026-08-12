import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_COLS,
  BOARD_ROWS,
  fileFromX,
  xFromFile,
  rankFromY,
  yFromRank,
  coordFromXY,
  xyFromCoord,
  isOnBoard,
  allSquares
} from '../src/state.js';

test('board dimensions are 25x20', () => {
  assert.equal(BOARD_COLS, 25);
  assert.equal(BOARD_ROWS, 20);
});

test('fileFromX maps x to letters a-y', () => {
  assert.equal(fileFromX(0), 'a');
  assert.equal(fileFromX(24), 'y');
  assert.equal(fileFromX(12), 'm');
});

test('xFromFile inverts fileFromX for valid files', () => {
  for (let x = 0; x < BOARD_COLS; x += 1) {
    assert.equal(xFromFile(fileFromX(x)), x);
  }
});

test('rankFromY maps y to ranks 1-20', () => {
  assert.equal(rankFromY(0), '1');
  assert.equal(rankFromY(19), '20');
});

test('yFromRank inverts rankFromY', () => {
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    assert.equal(yFromRank(rankFromY(y)), y);
  }
});

test('coordFromXY and xyFromCoord round-trip', () => {
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLS; x += 1) {
      const coord = coordFromXY(x, y);
      const parsed = xyFromCoord(coord);
      assert.deepEqual(parsed, { x, y });
    }
  }
});

test('xyFromCoord rejects malformed coords', () => {
  assert.equal(xyFromCoord(''), null);
  assert.equal(xyFromCoord('z1'), null);
  assert.equal(xyFromCoord('a0'), null);
  assert.equal(xyFromCoord('a21'), null);
  assert.equal(xyFromCoord('1a'), null);
});

test('isOnBoard accepts all valid squares and rejects edges', () => {
  assert.ok(isOnBoard(0, 0));
  assert.ok(isOnBoard(24, 19));
  assert.ok(!isOnBoard(-1, 0));
  assert.ok(!isOnBoard(25, 0));
  assert.ok(!isOnBoard(0, -1));
  assert.ok(!isOnBoard(0, 20));
});

test('allSquares returns 500 squares', () => {
  const squares = allSquares();
  assert.equal(squares.length, 500);
  assert.equal(squares[0].coord, 'a1');
  assert.equal(squares[squares.length - 1].coord, 'y20');
});
