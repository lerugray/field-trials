import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle } from '../src/puzzle/puzzle.js';
import {
  pairLedger, countingHouseClues, solveCountingHouse, countColHouseSolutions,
  certifyCountingHouse, nextCountingHouseHint,
} from '../src/puzzle/countinghouse.js';
import { COUNTINGHOUSE_MOTIFS, COUNTINGHOUSE_TEACHING } from '../src/content/countingHouseMotifs.js';

test('the pair ledger is the run-lengths of the interleaved strip T0,B0,T1,B1,...', () => {
  // strip = T0,B0,T1,B1,T2,B2,T3,B3 = 1,1, 0,0, 1,0, 1,1 -> runs [2,1,2]
  assert.deepEqual(pairLedger([1, 0, 1, 1], [1, 0, 0, 1]), [2, 1, 2]);
});

test('every COUNTING-HOUSE card is proved guess-free + unique under columns + ledgers', () => {
  const failures = COUNTINGHOUSE_MOTIFS.filter((m) => !certifyCountingHouse(m).ok)
    .map((m) => `${m.id}:${certifyCountingHouse(m).reason}`);
  assert.deepEqual(failures, [], `unproved counting-house cards: ${failures.join(', ')}`);
  assert.equal(COUNTINGHOUSE_MOTIFS[0].id, COUNTINGHOUSE_TEACHING);
  for (const m of COUNTINGHOUSE_MOTIFS) assert.equal(m.rows.length % 2, 0, `${m.id} has even height`);
});

test('the certifier agrees with the independent oracle (guess-free => unique)', () => {
  for (const m of COUNTINGHOUSE_MOTIFS) {
    const p = Puzzle.fromAscii(m.rows);
    const { colClues, pairClues } = countingHouseClues(p);
    if (certifyCountingHouse(m).guessFree) {
      assert.equal(countColHouseSolutions(p.width, p.height, colClues, pairClues, 2), 1, `${m.id} guess-free but not unique`);
    }
  }
});

test('the ledger is LOAD-BEARING: columns alone do not solve the teaching card', () => {
  const p = Puzzle.fromAscii(COUNTINGHOUSE_MOTIFS[0].rows);
  const { colClues } = countingHouseClues(p);
  const colsOnly = solveCountingHouse(p.width, p.height, colClues, []); // no ledgers
  assert.notEqual(colsOnly.status, 'solved', 'columns alone must not finish the card');
  const withLedgers = certifyCountingHouse(COUNTINGHOUSE_MOTIFS[0]);
  assert.equal(withLedgers.ok, true, 'columns + ledgers do finish it');
});

test('the prover REJECTS a ledger-ambiguous card (adversarial)', () => {
  // #./.# and .#/#. share column clues [1],[1] and the ledger [1,1] -> two solutions.
  const r = certifyCountingHouse({ id: 'amb', name: 'X', rows: ['#.', '.#'] });
  assert.equal(r.ok, false);
  const p = Puzzle.fromAscii(['#.', '.#']);
  const { colClues, pairClues } = countingHouseClues(p);
  // Column clues [1],[1] with ledger [1,1] admit ##/.., #./.#, and ../## -> three solutions.
  assert.ok(countColHouseSolutions(p.width, p.height, colClues, pairClues, 5) >= 2, 'ledger-ambiguous');
});

test('solveCountingHouse reaches exactly the intended grid', () => {
  const m = COUNTINGHOUSE_MOTIFS[1];
  const p = Puzzle.fromAscii(m.rows);
  const { colClues, pairClues } = countingHouseClues(p);
  const r = solveCountingHouse(p.width, p.height, colClues, pairClues);
  assert.equal(r.status, 'solved');
  for (let i = 0; i < r.board.length; i++) assert.equal(r.board[i], p.solution[i] ? 1 : 0);
});

test('the hint points at a forced move and flags a mistake', () => {
  const m = COUNTINGHOUSE_MOTIFS[0];
  const p = Puzzle.fromAscii(m.rows);
  const { colClues, pairClues } = countingHouseClues(p);
  const blank = new Uint8Array(p.width * p.height);
  const h = nextCountingHouseHint(p, colClues, pairClues, blank);
  assert.equal(h.kind, 'deduction');
  // Lay a thread where the solution is bare -> mistake.
  const marks = new Uint8Array(p.width * p.height);
  let bare = -1;
  for (let i = 0; i < p.solution.length; i++) if (!p.solution[i]) { bare = i; break; }
  marks[bare] = 1;
  assert.equal(nextCountingHouseHint(p, colClues, pairClues, marks).kind, 'mistake');
});
