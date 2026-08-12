import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';
import { deepestTier, TIER_NAMES } from '../src/puzzle/tiers.js';
import { isGuessFree } from '../src/puzzle/solver.js';
import { isUnique } from '../src/puzzle/oracle.js';
import { firstPlacement, lastPlacement, UNKNOWN } from '../src/puzzle/linesolver.js';

test('firstPlacement/lastPlacement bracket the overlap of a run', () => {
  const k = new Int8Array(6).fill(UNKNOWN);
  assert.deepEqual(firstPlacement(k, [4]), [0]);
  assert.deepEqual(lastPlacement(k, [4]), [2]);
  assert.deepEqual(firstPlacement(new Int8Array(5).fill(UNKNOWN), [1, 1]), [0, 2]);
  assert.deepEqual(lastPlacement(new Int8Array(5).fill(UNKNOWN), [1, 1]), [2, 4]);
});

test('T1: trivially-solvable puzzles report tier 1', () => {
  assert.equal(deepestTier(Puzzle.fromAscii(['###', '###', '###'])).tier, 1);
  assert.equal(deepestTier(Puzzle.fromAscii(['...', '...', '...'])).tier, 1);
  assert.equal(deepestTier(Puzzle.fromAscii(['..#..', '..#..', '#####', '..#..', '..#..'])).tier, 1);
});

test('T2: overlap-solvable puzzles report tier 2', () => {
  assert.equal(deepestTier(Puzzle.fromAscii(['#....', '##...', '###..', '####.', '#####'])).tier, 2);
});

test('T3: an anchoring puzzle reports tier 3', () => {
  const shuttle = Puzzle.fromAscii([
    '..####..', '.#....#.', '######.#', '#....#.#',
    '#....#.#', '######.#', '.#....#.', '..####..',
  ]);
  assert.equal(deepestTier(shuttle).tier, 3);
});

test('T4: a bounded-split puzzle reports tier 4 and is still guess-free', () => {
  const p = Puzzle.fromAscii([
    '##....', '....##', '.####.', '#..#.#', '..#.#.', '##....',
  ]);
  const t = deepestTier(p);
  assert.equal(t.tier, 4);
  assert.equal(t.name, TIER_NAMES[4]);
  assert.ok(isGuessFree(p), 'a tiered puzzle must be guess-free');
  assert.ok(isUnique(p), 'and unique');
});

test('tier is null exactly when the puzzle is not guess-free (invariant)', () => {
  const guessFree = [
    ['###', '.#.', '.#.'],
    ['#####', '#...#', '#...#', '#...#', '#####'],
    ['#.#', '.#.', '#.#'],
  ];
  const needsGuess = [
    ['#.', '.#'],                     // checkerboard
    ['#...', '.#..', '..#.', '...#'], // permutation diagonal
    ['#...#', '.###.', '..#..', '.###.', '#...#'], // the unique-but-guessy spool
  ];
  for (const rows of guessFree) {
    const p = Puzzle.fromAscii(rows);
    assert.ok(deepestTier(p) !== null, `should have a tier: ${rows.join('/')}`);
    assert.equal(deepestTier(p) !== null, isGuessFree(p));
  }
  for (const rows of needsGuess) {
    const p = Puzzle.fromAscii(rows);
    assert.equal(deepestTier(p), null, `should be tier-less: ${rows.join('/')}`);
    assert.equal(isGuessFree(p), false);
  }
});
