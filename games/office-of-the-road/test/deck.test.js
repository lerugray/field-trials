// The tarot deck: deterministic shuffle/draw, thin-deck ops, art coverage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStreams } from '../src/rng.js';
import {
  CARDS, CARD_IDS, STARTING_DECK, getCard, shuffle, createDeck, drawOne, drawUp,
  playFromHand, addCard, removeCard, discardHand, serializeDeck, restoreDeck,
} from '../src/deck.js';
import { TAROT_KEYS } from '../src/art.js';

test('every card maps to a real tarot art key and has a valid shape', () => {
  const kinds = new Set(['strike', 'smite', 'execute', 'mend', 'salve', 'rally', 'ordinance', 'ward', 'stay', 'instrument']);
  const targets = new Set(['enemy', 'weakest', 'sturdiest', 'ally', 'allies', 'self', 'none']);
  for (const id of CARD_IDS) {
    const c = getCard(id);
    assert.ok(TAROT_KEYS.includes(c.arcana), `${id} arcana ${c.arcana} not in the tarot art set`);
    assert.ok(kinds.has(c.kind), `${id} bad kind ${c.kind}`);
    assert.ok(targets.has(c.target), `${id} bad target ${c.target}`);
    assert.ok(c.name && c.text, `${id} missing name/text`);
  }
});

test('starting deck is thin and all real', () => {
  assert.ok(STARTING_DECK.length <= 6, 'starting deck should be thin');
  for (const id of STARTING_DECK) assert.ok(CARDS[id], 'starting deck has unknown card ' + id);
});

test('shuffle is deterministic and a permutation', () => {
  const s1 = makeStreams(5).shuffle, s2 = makeStreams(5).shuffle;
  const base = ['a', 'b', 'c', 'd', 'e', 'f'];
  const x = shuffle(base, s1), y = shuffle(base, s2);
  assert.deepEqual(x, y);
  assert.deepEqual(x.slice().sort(), base.slice().sort());
  assert.notDeepEqual(x, base); // overwhelmingly likely reordered
});

test('draw moves cards draw->hand and reshuffles discard when dry', () => {
  const s = makeStreams(9).shuffle;
  const deck = createDeck(STARTING_DECK, s);
  const drawn = drawUp(deck, 3, s);
  assert.equal(drawn.length, 3);
  assert.equal(deck.hand.length, 3);
  assert.equal(deck.drawPile.length, STARTING_DECK.length - 3);
  // play the whole hand -> discard, then draw beyond the pile forces a reshuffle
  while (deck.hand.length) playFromHand(deck, 0);
  assert.equal(deck.discard.length, 3);
  const rest = drawUp(deck, STARTING_DECK.length, s); // remaining draw pile + reshuffled discard
  assert.equal(rest.length, STARTING_DECK.length); // 2 left + 3 reshuffled = the whole deck
  // invariant: every card is always somewhere, total conserved
  const total = deck.drawPile.length + deck.hand.length + deck.discard.length;
  assert.equal(total, STARTING_DECK.length);
});

test('total card count is conserved across many draws/plays', () => {
  const s = makeStreams(123).shuffle;
  const deck = createDeck(STARTING_DECK, s);
  for (let i = 0; i < 40; i++) {
    if (deck.hand.length < 2) drawUp(deck, 2, s); else playFromHand(deck, 0);
    const total = deck.drawPile.length + deck.hand.length + deck.discard.length;
    assert.equal(total, STARTING_DECK.length, 'cards leaked at step ' + i);
  }
});

test('add and remove are run-persistent deck edits', () => {
  const s = makeStreams(1).shuffle;
  const deck = createDeck(STARTING_DECK, s);
  addCard(deck, 'the_sun');
  assert.ok(deck.list.includes('the_sun'));
  assert.equal(deck.list.length, STARTING_DECK.length + 1);
  assert.ok(removeCard(deck, 'the_tower'));
  assert.ok(!deck.list.includes('the_tower'));
  assert.equal(removeCard(deck, 'not_a_card'), false);
});

test('deck serialize/restore round-trips', () => {
  const s = makeStreams(7).shuffle;
  const deck = createDeck(STARTING_DECK, s);
  drawUp(deck, 2, s); discardHand(deck);
  const back = restoreDeck(JSON.parse(JSON.stringify(serializeDeck(deck))));
  assert.deepEqual(back, deck);
});
