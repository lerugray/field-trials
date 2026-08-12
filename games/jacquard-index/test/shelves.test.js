import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHELVES, shelfCards, shelfTeaching, shelfComplete, shelfWovenCount,
  isShelfUnlocked, shelfOfCard,
} from '../src/content/shelves.js';
import { validateLibrary } from '../src/puzzle/generator.js';
import { twistFor } from '../src/puzzle/twists.js';

test('the roster is exactly the fixed eight shelves, in order', () => {
  assert.equal(SHELVES.length, 8);
  SHELVES.forEach((s, i) => assert.equal(s.order, i, `shelf ${i} order`));
  // The named roster (studio amendment) in order.
  assert.deepEqual(SHELVES.map((s) => s.id), [
    'loom', 'two-thread', 'counting-house', 'negative-cloth',
    'mirror-weave', 'house-rules', 'bias', 'patchwork',
  ]);
});

test('shelf 0 THE LOOM is built, has a teaching card, and its content is all proved', () => {
  const loom = SHELVES[0];
  assert.equal(loom.built, true);
  assert.equal(loom.twist, null, 'the primer carries no twist');
  const teaching = shelfTeaching(loom);
  assert.ok(teaching, 'THE LOOM has a teaching card');
  assert.equal(teaching.id, loom.teaching);
  const cards = shelfCards(loom);
  assert.ok(cards.length >= 13, `the primer holds a full curriculum, got ${cards.length}`);
  assert.equal(cards[0].id, loom.teaching, 'teaching card leads the shelf');
  // Every member is a proved, guess-free, unique base-machine puzzle (hard-rule 4).
  const { allProved, failures } = validateLibrary(cards);
  assert.ok(allProved, `THE LOOM has unproved content: ${failures.map((f) => `${f.id}:${f.reason}`).join(', ')}`);
});

test('every twist shelf names a twist + blurb; unbuilt ones carry no placeholder content', () => {
  for (const s of SHELVES.slice(1)) {
    assert.ok(s.twist, `${s.id} names its twist`);
    assert.ok(s.blurb && s.blurb.length > 0, `${s.id} has a house-voice blurb`);
    if (!s.built) assert.equal(s.memberIds.length, 0, `unbuilt ${s.id} carries no content`);
    else assert.ok(s.memberIds.length >= 13, `built ${s.id} ships a full shelf`);
  }
});

test('NEGATIVE CLOTH (shelf 3) is built and its content is proved under its twist prover', () => {
  const neg = SHELVES.find((s) => s.id === 'negative-cloth');
  assert.equal(neg.built, true);
  assert.ok(shelfTeaching(neg), 'has a teaching card');
  const cards = shelfCards(neg);
  assert.ok(cards.length >= 13);
  for (const c of cards) assert.equal(c.twist, 'negative-cloth', `${c.id} tagged with its twist`);
  const { certify } = twistFor('negative-cloth');
  const failures = cards.filter((c) => !certify(c).ok).map((c) => c.id);
  assert.deepEqual(failures, [], `unproved negative-cloth cards: ${failures.join(', ')}`);
});

test('the invented shelf THE BIAS is ratification-gated', () => {
  const bias = SHELVES.find((s) => s.id === 'bias');
  assert.equal(bias.ratificationGated, true);
});

test('unlock: only THE LOOM is open at the start; later shelves are sealed', () => {
  const progress = new Set();
  assert.equal(isShelfUnlocked(SHELVES[0], progress), true, 'primer opens from the start');
  for (const s of SHELVES.slice(1)) {
    assert.equal(isShelfUnlocked(s, progress), false, `${s.id} sealed until built + prior complete`);
  }
});

test('shelfComplete tracks weaving the whole shelf', () => {
  const loom = SHELVES[0];
  const progress = new Set();
  assert.equal(shelfComplete(loom, progress), false);
  assert.equal(shelfWovenCount(loom, progress), 0);
  // Weave everything but one.
  const cards = shelfCards(loom);
  for (let i = 0; i < cards.length - 1; i++) progress.add(cards[i].id);
  assert.equal(shelfComplete(loom, progress), false, 'one card short is not complete');
  assert.equal(shelfWovenCount(loom, progress), cards.length - 1);
  progress.add(cards[cards.length - 1].id);
  assert.equal(shelfComplete(loom, progress), true, 'all woven -> complete');
});

test('unlock chain: a built shelf opens once the prior BUILT shelf is done; unbuilt never block', () => {
  const loom = SHELVES[0];
  const progress = new Set(loom.memberIds);
  assert.equal(shelfComplete(loom, progress), true);
  // The next BUILT shelf after THE LOOM opens; later built shelves stay locked until their
  // own prior built shelf is complete.
  const builtInOrder = SHELVES.filter((s) => s.built);
  const nextBuilt = builtInOrder.find((s) => s.order > 0);
  assert.equal(isShelfUnlocked(nextBuilt, progress), true, `${nextBuilt.id} opens after THE LOOM`);
  const laterBuilt = builtInOrder.find((s) => s.order > nextBuilt.order);
  assert.equal(isShelfUnlocked(laterBuilt, progress), false, `${laterBuilt.id} still locked (its prior built shelf unfinished)`);
  // Unbuilt shelves are never enterable (sealed drawers do not soft-lock).
  for (const s of SHELVES.filter((x) => !x.built)) {
    assert.equal(isShelfUnlocked(s, progress), false, `${s.id} unbuilt/sealed`);
  }
});

test('shelfOfCard resolves a card to its shelf', () => {
  const loom = SHELVES[0];
  const someCard = loom.memberIds[0];
  assert.equal(shelfOfCard(someCard).id, 'loom');
  assert.equal(shelfOfCard('no-such-motif'), null);
});
