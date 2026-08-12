import { test } from 'node:test';
import assert from 'node:assert/strict';

import { meterCells } from '../src/render/meter.js';

const count = (cells, state) => cells.filter((c) => c === state).length;

test('a plain meter fills proportionally, no preview', () => {
  const cells = meterCells(50, 0, 10, 100);
  assert.equal(cells.length, 10);
  assert.equal(count(cells, 'on'), 5);
  assert.equal(count(cells, ''), 5);
  assert.equal(count(cells, 'up') + count(cells, 'cap'), 0);
});

test('a full meter is all on', () => {
  assert.deepEqual(meterCells(100, 0, 8, 100), Array(8).fill('on'));
});

test('an empty meter is all empty', () => {
  assert.deepEqual(meterCells(0, 0, 8, 100), Array(8).fill(''));
});

test('a pending gain previews as up cells beyond the filled ones', () => {
  const cells = meterCells(50, 20, 10, 100); // filled 5, next 7
  assert.deepEqual(cells, ['on', 'on', 'on', 'on', 'on', 'up', 'up', '', '', '']);
});

test('a pending loss previews as cap cells at the top of the filled range', () => {
  const cells = meterCells(50, -20, 10, 100); // filled 5, next 3
  assert.deepEqual(cells, ['on', 'on', 'on', 'cap', 'cap', '', '', '', '', '']);
});

test('gains and losses clamp to the cap', () => {
  // near-cap gain cannot overflow past the last cell
  const up = meterCells(95, 20, 10, 100);
  assert.equal(up.length, 10);
  assert.ok(!up.includes(undefined));
  assert.equal(count(up, 'on') + count(up, 'up'), 10);
  // below-zero loss cannot underflow
  const down = meterCells(5, -20, 10, 100);
  assert.equal(count(down, 'on'), 0);
});

test('stat meters use 12 cells against the stat cap', () => {
  const cells = meterCells(44, 0, 12, 99);
  assert.equal(cells.length, 12);
  assert.equal(count(cells, 'on'), Math.round((44 / 99) * 12));
});
