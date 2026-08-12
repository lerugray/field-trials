import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPuzzle, validateLibrary } from '../src/puzzle/generator.js';
import { STARTER_MOTIFS } from '../src/content/starter.js';

test('buildPuzzle proves a good motif and tags its tier + uniqueness', () => {
  const rec = buildPuzzle({ id: 'spool', name: 'THE SPOOL', blurb: 'x', rows: ['..#..', '.###.', '#####', '.###.', '..#..'] });
  assert.ok(rec.ok);
  assert.equal(rec.reason, 'proved');
  assert.ok(rec.guessFree);
  assert.equal(rec.unique, true);
  assert.equal(rec.solutionCount, 1);
  assert.ok(rec.tier >= 1 && rec.tier <= 4);
});

test('buildPuzzle rejects a guess-requiring motif', () => {
  const rec = buildPuzzle({ id: 'bad', name: 'BAD', blurb: 'x', rows: ['#.', '.#'] });
  assert.ok(!rec.ok);
  assert.ok(!rec.guessFree);
  assert.equal(rec.tier, null);
});

test('buildPuzzle rejects an ambiguous (non-unique) motif via the oracle', () => {
  const rec = buildPuzzle({ id: 'amb', name: 'AMB', blurb: 'x', rows: ['#...', '.#..', '..#.', '...#'] });
  assert.ok(!rec.ok);
  assert.ok(rec.unique === false || !rec.guessFree);
});

test('validateLibrary proves the entire starter library (hard-rule 4)', () => {
  const { allProved, failures, built } = validateLibrary(STARTER_MOTIFS);
  assert.ok(allProved, `unproved motifs: ${failures.map((f) => `${f.id}:${f.reason}`).join(', ')}`);
  for (const b of built) {
    assert.equal(b.reason, 'proved');
    assert.ok(b.tier >= 1);
  }
});
