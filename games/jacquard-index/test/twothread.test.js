import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTwoThread, coloredClue, minColoredLength, coloredPlacements,
  lineSolveColored, solveColored, countColoredSolutions, twoThreadClues,
  certifyTwoThread, BARE, A, B,
} from '../src/puzzle/twothread.js';
import { TWOTHREAD_MOTIFS, TWOTHREAD_TEACHING } from '../src/content/twoThreadMotifs.js';

test('coloured clue derivation: maximal single-colour runs, in order', () => {
  assert.deepEqual(coloredClue([A, A, B, B, BARE, A]), [
    { len: 2, color: A }, { len: 2, color: B }, { len: 1, color: A },
  ]);
  assert.deepEqual(coloredClue([BARE, BARE]), []);
  assert.deepEqual(coloredClue([A, B, A]), [{ len: 1, color: A }, { len: 1, color: B }, { len: 1, color: A }]);
});

test('adjacency rule: same-colour runs need a gap, different-colour runs may be flush', () => {
  // [A,B] fits in width 2 (flush); [A,A] needs width 3 (gap).
  assert.equal(minColoredLength([{ len: 1, color: A }, { len: 1, color: B }]), 2);
  assert.equal(minColoredLength([{ len: 1, color: A }, { len: 1, color: A }]), 3);
  // Enumerate: two different-colour singles in width 2 -> exactly [A,B].
  const p = coloredPlacements(2, [{ len: 1, color: A }, { len: 1, color: B }]);
  assert.equal(p.length, 1);
  assert.deepEqual(Array.from(p[0]), [A, B]);
});

test('the coloured line solver forces cells that every placement agrees on', () => {
  // A run of 3 A in width 3 forces all three to A.
  const forced = lineSolveColored(new Int8Array([-1, -1, -1]), [{ len: 3, color: A }]);
  assert.deepEqual(Array.from(forced), [A, A, A]);
  // No placement -> contradiction (clue too big).
  assert.equal(lineSolveColored(new Int8Array([-1, -1]), [{ len: 3, color: A }]), null);
});

test('every TWO-THREAD card is proved guess-free + unique under the coloured rules', () => {
  const failures = TWOTHREAD_MOTIFS.filter((m) => !certifyTwoThread(m).ok).map((m) => `${m.id}:${certifyTwoThread(m).reason}`);
  assert.deepEqual(failures, [], `unproved two-thread cards: ${failures.join(', ')}`);
  assert.equal(TWOTHREAD_MOTIFS[0].id, TWOTHREAD_TEACHING);
  // Every card uses BOTH threads (else it is just a base card).
  for (const m of TWOTHREAD_MOTIFS) {
    const { grid } = parseTwoThread(m.rows);
    assert.ok(grid.includes(A) && grid.includes(B), `${m.id} uses both threads`);
  }
});

test('the certifier agrees with the independent oracle (guess-free => unique)', () => {
  for (const m of TWOTHREAD_MOTIFS) {
    const { width, height, grid } = parseTwoThread(m.rows);
    const { rowClues, colClues } = twoThreadClues(width, height, grid);
    const cert = certifyTwoThread(m);
    const count = countColoredSolutions(width, height, rowClues, colClues, 2);
    if (cert.guessFree) assert.equal(count, 1, `${m.id}: guess-free but not unique (invariant broken)`);
  }
});

test('the prover REJECTS a colour-ambiguous card (adversarial: single-colour checker)', () => {
  // A./.A and .A/A. share identical coloured clues -> two solutions -> rejected.
  const r = certifyTwoThread({ id: 'checker', name: 'X', rows: ['A.', '.A'] });
  assert.equal(r.ok, false);
  const { width, height, grid } = parseTwoThread(['A.', '.A']);
  const { rowClues, colClues } = twoThreadClues(width, height, grid);
  assert.equal(countColoredSolutions(width, height, rowClues, colClues, 5), 2);
});

test('solveColored reaches exactly the intended grid for a proved card', () => {
  const m = TWOTHREAD_MOTIFS[1];
  const { width, height, grid } = parseTwoThread(m.rows);
  const { rowClues, colClues } = twoThreadClues(width, height, grid);
  const r = solveColored(width, height, rowClues, colClues);
  assert.equal(r.status, 'solved');
  assert.deepEqual(Array.from(r.board), Array.from(grid));
});
