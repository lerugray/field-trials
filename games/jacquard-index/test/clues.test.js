import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runLengths, displayClue, minLineLength, clueFilledTotal, lineSatisfied, cluesEqual,
} from '../src/puzzle/clues.js';

test('runLengths encodes maximal filled runs in order', () => {
  assert.deepEqual(runLengths([0, 1, 1, 0, 1]), [2, 1]);
  assert.deepEqual(runLengths([1, 1, 1]), [3]);
  assert.deepEqual(runLengths([1, 0, 1, 0, 1]), [1, 1, 1]);
  assert.deepEqual(runLengths([0, 0, 0]), []);
  assert.deepEqual(runLengths([1]), [1]);
});

test('runLengths treats any truthy cell as filled', () => {
  assert.deepEqual(runLengths([true, true, false, true]), [2, 1]);
});

test('displayClue shows an empty line as [0]', () => {
  assert.deepEqual(displayClue([]), [0]);
  assert.deepEqual(displayClue([3, 2]), [3, 2]);
});

test('minLineLength counts runs plus mandatory gaps', () => {
  assert.equal(minLineLength([]), 0);
  assert.equal(minLineLength([5]), 5);
  assert.equal(minLineLength([3, 2]), 6);
  assert.equal(minLineLength([1, 1, 1]), 5);
});

test('clueFilledTotal sums the runs', () => {
  assert.equal(clueFilledTotal([]), 0);
  assert.equal(clueFilledTotal([3, 2]), 5);
});

test('lineSatisfied matches a fully-decided line against its clue exactly', () => {
  assert.ok(lineSatisfied([1, 1, 1, 0, 1, 1], [3, 2]));
  assert.ok(!lineSatisfied([1, 1, 0, 1, 1], [3, 2]));   // wrong first run
  assert.ok(lineSatisfied([0, 0, 0], []));               // empty line, empty clue
  assert.ok(!lineSatisfied([0, 1, 0], []));              // stray fill
  assert.ok(!lineSatisfied([1, 1, 1], [3, 2]));          // missing second run
});

test('cluesEqual compares clue lists', () => {
  assert.ok(cluesEqual([3, 2], [3, 2]));
  assert.ok(!cluesEqual([3, 2], [2, 3]));
  assert.ok(!cluesEqual([3], [3, 1]));
  assert.ok(cluesEqual([], []));
});
