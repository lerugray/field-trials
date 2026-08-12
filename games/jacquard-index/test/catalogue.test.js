import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHELVES, shelfCards, shelfTeaching, shelfComplete, isShelfUnlocked } from '../src/content/shelves.js';
import { twistFor, cardBand } from '../src/puzzle/twists.js';

// The M3 acceptance sweep: every BUILT shelf ships a full, proved curriculum under its own
// twist, and the catalogue opens shelf by shelf.

test('the roster is the fixed eight shelves; seven are built, THE BIAS is sealed + gated', () => {
  assert.equal(SHELVES.length, 8);
  const built = SHELVES.filter((s) => s.built);
  assert.equal(built.length, 7, 'all shelves but the ratification-gated THE BIAS are built');
  const bias = SHELVES.find((s) => s.id === 'bias');
  assert.equal(bias.built, false);
  assert.equal(bias.ratificationGated, true);
  assert.equal(isShelfUnlocked(bias, new Set()), false, 'THE BIAS stays sealed until ratified');
});

test('every built shelf ships a teaching card + at least 12 more, all proved under its twist', () => {
  for (const shelf of SHELVES.filter((s) => s.built)) {
    const cards = shelfCards(shelf);
    assert.ok(cards.length >= 13, `${shelf.id} ships 12 + teaching (${cards.length})`);
    const teaching = shelfTeaching(shelf);
    assert.ok(teaching, `${shelf.id} has a teaching card`);
    assert.equal(cards[0].id, shelf.teaching, `${shelf.id} teaching card leads`);
    const certify = twistFor(shelf.twist).certify;
    const failures = cards.filter((c) => !certify(c).ok).map((c) => `${c.id}:${certify(c).reason}`);
    assert.deepEqual(failures, [], `${shelf.id} unproved content: ${failures.join(', ')}`);
    // Every card shows a guarantee band through its twist.
    for (const c of cards) assert.ok(cardBand(c).ok, `${c.id} certified for its band`);
  }
});

test('every card id across the whole catalogue is unique', () => {
  const seen = new Set();
  for (const shelf of SHELVES) {
    for (const id of shelf.memberIds) {
      assert.ok(!seen.has(id), `duplicate card id ${id}`);
      seen.add(id);
    }
  }
});

test('progression opens the catalogue shelf by shelf across every built shelf', () => {
  const progress = new Set();
  const builtInOrder = SHELVES.filter((s) => s.built);
  // Only THE LOOM is open at the start.
  assert.equal(isShelfUnlocked(builtInOrder[0], progress), true);
  for (let i = 1; i < builtInOrder.length; i++) {
    assert.equal(isShelfUnlocked(builtInOrder[i], progress), false, `${builtInOrder[i].id} sealed before its predecessor is done`);
  }
  // Weave each built shelf in turn; the next built shelf opens.
  for (let i = 0; i < builtInOrder.length; i++) {
    const shelf = builtInOrder[i];
    assert.equal(isShelfUnlocked(shelf, progress), true, `${shelf.id} open when reached`);
    for (const id of shelf.memberIds) progress.add(id);
    assert.equal(shelfComplete(shelf, progress), true);
    const next = builtInOrder[i + 1];
    if (next) assert.equal(isShelfUnlocked(next, progress), true, `${next.id} opens once ${shelf.id} is woven`);
  }
});

test('each twist is distinct in the registry (no two shelves share a twist key)', () => {
  const keys = SHELVES.filter((s) => s.twist).map((s) => s.twist);
  assert.equal(new Set(keys).size, keys.length, 'twist keys are distinct');
});
