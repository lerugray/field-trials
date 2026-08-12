// Ambient hangar chatter rotation (M10). Pure: it only decides which existing line
// shows next, never authors prose and never touches game state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatter } from '../src/run/chatter.js';
import { LEON_QUIPS } from '../src/run/hubvoice.js';

test('advance cycles through every line in order and wraps', () => {
  const c = createChatter(['a', 'b', 'c']);
  assert.equal(c.current(), 'a');
  assert.equal(c.advance(), 'b');
  assert.equal(c.advance(), 'c');
  assert.equal(c.advance(), 'a'); // wraps
});

test('a full cycle visits all lines exactly once before repeating', () => {
  const c = createChatter(LEON_QUIPS);
  const seen = new Set([c.current()]);
  for (let i = 1; i < LEON_QUIPS.length; i++) seen.add(c.advance());
  assert.equal(seen.size, LEON_QUIPS.length, 'every quip appears in one cycle');
  assert.equal(c.advance(), LEON_QUIPS[0], 'then it wraps to the first');
});

test('startIndex is honoured and normalised', () => {
  assert.equal(createChatter(['a', 'b', 'c'], 1).current(), 'b');
  assert.equal(createChatter(['a', 'b', 'c'], 4).current(), 'b'); // 4 % 3
  assert.equal(createChatter(['a', 'b', 'c'], -1).current(), 'c'); // negative wraps
});

test('an empty or junk pool never throws', () => {
  const c = createChatter([]);
  assert.equal(c.current(), '');
  assert.equal(c.advance(), '');
  assert.equal(c.size(), 0);
  const j = createChatter([null, 3, '', 'ok']);
  assert.equal(j.size(), 1);
  assert.equal(j.current(), 'ok');
});

test('the chatter pool is the blessed Leon quips (no new prose)', () => {
  const c = createChatter(LEON_QUIPS);
  assert.ok(c.size() >= 3, 'expected the shipped comms pool');
  // every line is already in the hubvoice pool the voice-pass guard covers
  const pool = new Set(LEON_QUIPS);
  let line = c.current();
  for (let i = 0; i < LEON_QUIPS.length; i++) { assert.ok(pool.has(line)); line = c.advance(); }
});
