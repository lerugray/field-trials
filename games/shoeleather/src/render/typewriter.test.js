import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleCount, reveal, isComplete, revealDurationMs } from './typewriter.js';

test('visibleCount grows with elapsed time at the given rate', () => {
  assert.equal(visibleCount(100, 40, 0), 0);
  assert.equal(visibleCount(100, 40, 500), 20);   // 40 cps * 0.5s
  assert.equal(visibleCount(100, 40, 5000), 100); // clamps to length
});

test('cps <= 0 reveals everything instantly (off)', () => {
  assert.equal(visibleCount(50, 0, 0), 50);
  assert.equal(reveal('the studio', 0, 0), 'the studio');
});

test('reveal returns the growing prefix', () => {
  assert.equal(reveal('lieutenant', 20, 0), '');
  assert.equal(reveal('lieutenant', 20, 250), 'lieut'); // 20 cps * 0.25s = 5 chars
  assert.equal(reveal('lieutenant', 20, 1000).length, 10);
});

test('instant forces full text (reduced motion / skip)', () => {
  assert.equal(reveal('one more question', 40, 0, true), 'one more question');
  assert.ok(isComplete('one more question', 40, 0, true));
});

test('isComplete flips once fully revealed', () => {
  assert.equal(isComplete('abc', 10, 0), false);
  assert.equal(isComplete('abc', 10, 1000), true);
  assert.equal(isComplete('abc', 0, 0), true); // off = already complete
});

test('revealDurationMs scales with length and rate', () => {
  assert.equal(revealDurationMs('abcd', 40), 100);
  assert.equal(revealDurationMs('abcd', 0), 0);
});
