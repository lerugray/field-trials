// automation.test.js — MUTATION-DURING-AUTOMATION + RUN-HISTORY (DESIGN-SEED M8).
// The march ticker owns only the road; it never touches the party, deck, or the
// certification ledger — those change only at pause points (camp/town/combat),
// which freeze the ticker. So a job swap / equip / deck edit can never be raced by
// a live tick: no orphaned references, no double-applied stats. Also: the rolling
// run-history the Office keeps.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMarch, step, runTicks, serializeMarch } from '../src/engine.js';
import { createParty, changeJob, equipItem, serializeParty } from '../src/party.js';
import { createDeck, addCard, removeCard, serializeDeck } from '../src/deck.js';
import { createMeta, bankRun, recordHistory, createRunMastery, earnMastery, serializeMeta, parseMeta, HISTORY_CAP } from '../src/meta.js';

test('a march tick touches ONLY road state — never the party or deck', () => {
  const march = createMarch(4242);
  const party = createParty();
  const deck = createDeck();
  const partyBefore = JSON.stringify(serializeParty(party));
  const deckBefore = JSON.stringify(serializeDeck(deck));
  runTicks(march, 600); // a long automated stretch (encounters would open pause points in-game)
  assert.equal(JSON.stringify(serializeParty(party)), partyBefore, 'the march never mutated the party');
  assert.equal(JSON.stringify(serializeDeck(deck)), deckBefore, 'the march never mutated the deck');
});

test('a job swap applied mid-automation is applied EXACTLY once (no double stats)', () => {
  const march = createMarch(7);
  const party = createParty(['bailiff', 'chirurgeon', 'surveyor', 'sumpter']);
  runTicks(march, 120);
  changeJob(party, 0, 'notary'); // the pause-point edit
  const afterSwap = JSON.stringify(party.frames[0].max);
  runTicks(march, 240); // resume marching
  assert.equal(party.frames[0].jobId, 'notary');
  assert.equal(JSON.stringify(party.frames[0].max), afterSwap, 'stats are the single swap, not re-applied by ticks');
});

test('an equip applied mid-automation is single-applied and untouched by ticks', () => {
  const march = createMarch(9);
  const party = createParty();
  party.inventory = ['weighted_maul'];
  const baseAtk = party.frames[0].max.atk;
  runTicks(march, 80);
  equipItem(party, 0, 'weighted_maul'); // +6 atk, once
  runTicks(march, 200);
  assert.equal(party.frames[0].max.atk, baseAtk + 6, 'the +6 is applied exactly once');
  assert.equal(party.frames[0].equip.arm, 'weighted_maul');
});

test('deck edits at a pause point leave no orphaned references', () => {
  const deck = createDeck(['the_tower', 'the_star', 'strength']);
  addCard(deck, 'the_sun');
  removeCard(deck, 'strength');
  const all = [...deck.list, ...deck.drawPile, ...deck.hand, ...deck.discard];
  assert.ok(!all.includes('strength'), 'the struck card is gone from every pile (no orphan)');
  assert.ok(deck.list.includes('the_sun'), 'the added card is on the list');
});

test('the ledger keeps a rolling run-history, newest-first, capped', () => {
  const meta = createMeta();
  for (let r = 1; r <= HISTORY_CAP + 3; r++) {
    meta.runs = r;
    recordHistory(meta, { leg: r, cause: r % 2 ? 'reduced' : 'abandoned', gold: r * 10 });
  }
  assert.equal(meta.history.length, HISTORY_CAP, 'capped');
  assert.equal(meta.history[0].run, HISTORY_CAP + 3, 'newest first');
  const lastR = HISTORY_CAP + 3; // r=11 → odd → 'reduced'
  assert.ok(meta.history[0].leg === lastR && meta.history[0].cause === (lastR % 2 ? 'reduced' : 'abandoned'));
});

test('run-history round-trips through the meta ledger serialization', () => {
  const meta = createMeta();
  meta.runs = 2; recordHistory(meta, { leg: 5, cause: 'reduced', gold: 88 });
  const round = parseMeta(JSON.parse(JSON.stringify(serializeMeta(meta))));
  assert.deepEqual(round.history, meta.history);
  assert.deepEqual(parseMeta('{"v":1,"mastery":{}}').history, [], 'missing history → empty');
});
