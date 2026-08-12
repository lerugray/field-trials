import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  interact, tasteOf, buyToy, ownsToy, withCare, freshTastes,
  SNACKS, TOYS, SNACK_COST, TOY_BY_ID,
} from '../src/engine/care.js';

function game({ bond = 50, stress = 40, fatigue = 20, temperament = 'Calm', seed = 12345, tastes, lastToy = null, money = 500, toys = [] } = {}) {
  return {
    creature: { name: 'Bo', seed, temperament, bond, stress, fatigue, tastes: tastes ?? freshTastes(), lastToy },
    estate: { money, toys },
  };
}

test('tasteOf is deterministic and never favorite == disliked', () => {
  for (const seed of [1, 2, 999, 424242]) {
    const a = tasteOf({ seed });
    const b = tasteOf({ seed });
    assert.deepEqual(a, b);
    assert.notEqual(a.favorite, a.disliked);
    assert.ok(SNACKS.some((s) => s.id === a.favorite));
    assert.ok(SNACKS.some((s) => s.id === a.disliked));
  }
});

test('petting raises bond and relieves stress, and does not mutate input', () => {
  const g = game({ bond: 40, stress: 60 });
  const before = JSON.stringify(g);
  const { creature, reaction } = interact(g, { type: 'pet' });
  assert.ok(creature.bond > 40);
  assert.ok(creature.stress < 60);
  assert.ok(reaction.deltas.bond > 0);
  assert.ok(reaction.deltas.stress < 0);
  assert.equal(JSON.stringify(g), before, 'interact is pure');
});

test('petting a blissful pet does almost nothing (diminishing returns)', () => {
  const g = game({ bond: 100, stress: 0 });
  const { reaction } = interact(g, { type: 'pet' });
  assert.equal(reaction.effect, 'content');
  assert.equal(reaction.deltas.bond, 0);
  assert.equal(reaction.deltas.stress, 0);
});

test('a poke teaches temperament: liked vs startled', () => {
  const bold = interact(game({ temperament: 'Bold' }), { type: 'poke' });
  assert.equal(bold.reaction.effect, 'playful');
  assert.ok(bold.reaction.deltas.bond > 0);

  const timid = interact(game({ temperament: 'Timid' }), { type: 'poke' });
  assert.equal(timid.reaction.effect, 'startled');
  assert.ok(timid.reaction.deltas.stress > 0);
  assert.ok(timid.reaction.deltas.bond < 0);
});

test('a toy requires ownership, then plays; novelty falls off on repeats', () => {
  const notOwned = interact(game({ toys: [] }), { type: 'toy', id: 'ball' });
  assert.equal(notOwned.reaction.effect, 'blocked');

  const fresh = interact(game({ bond: 40, stress: 60, toys: ['ball'], lastToy: null }), { type: 'toy', id: 'ball' });
  assert.equal(fresh.reaction.effect, 'playful');
  assert.equal(fresh.creature.lastToy, 'ball');

  const repeat = interact(game({ bond: 40, stress: 60, toys: ['ball'], lastToy: 'ball' }), { type: 'toy', id: 'ball' });
  assert.equal(repeat.reaction.effect, 'content'); // bored of the same toy
  assert.ok(repeat.reaction.deltas.bond < fresh.reaction.deltas.bond);
});

test('a favorite snack delights and is discovered once; costs money', () => {
  const seed = 777;
  const truth = tasteOf({ seed });
  const g = game({ seed, money: 500 });
  const r1 = interact(g, { type: 'snack', id: truth.favorite });
  assert.equal(r1.reaction.effect, 'delight');
  assert.equal(r1.reaction.deltas.money, -SNACK_COST);
  assert.equal(r1.estate.money, 500 - SNACK_COST);
  assert.deepEqual(r1.reaction.discovery, { kind: 'favorite', snack: truth.favorite });
  assert.equal(r1.creature.tastes.favorite, truth.favorite);

  // feeding it again is still delightful but no longer a NEW discovery
  const r2 = interact({ creature: r1.creature, estate: r1.estate }, { type: 'snack', id: truth.favorite });
  assert.equal(r2.reaction.effect, 'delight');
  assert.equal(r2.reaction.discovery, null);
});

test('a disliked snack is refused, and discovery reveals it', () => {
  const seed = 3131;
  const truth = tasteOf({ seed });
  const { reaction, creature } = interact(game({ seed }), { type: 'snack', id: truth.disliked });
  assert.equal(reaction.effect, 'dislike');
  assert.ok(reaction.deltas.bond < 0);
  assert.equal(creature.tastes.disliked, truth.disliked);
});

test('a snack is blocked when the estate cannot afford it', () => {
  const g = game({ money: SNACK_COST - 1 });
  const { reaction, estate } = interact(g, { type: 'snack', id: SNACKS[0].id });
  assert.equal(reaction.effect, 'blocked');
  assert.equal(estate.money, SNACK_COST - 1, 'no money spent on a blocked snack');
});

test('buyToy deducts money and grants ownership; refuses when broke or dup', () => {
  const g = game({ money: 100, toys: [] });
  const buy = buyToy(g, 'ball');
  assert.ok(buy.ok);
  assert.equal(buy.estate.money, 100 - TOY_BY_ID.ball.cost);
  assert.ok(ownsToy(buy.estate, 'ball'));

  const dup = buyToy({ estate: buy.estate }, 'ball');
  assert.equal(dup.ok, false);

  const broke = buyToy(game({ money: 0 }), 'puzzle');
  assert.equal(broke.ok, false);
});

test('withCare fills defaults idempotently (migration-safe)', () => {
  const bare = { name: 'X', seed: 1 };
  const filled = withCare(bare);
  assert.deepEqual(filled.tastes, freshTastes());
  assert.equal(filled.lastToy, null);
  const again = withCare(filled);
  assert.deepEqual(again.tastes, filled.tastes);
});

test('every toy and snack has a stable id, label and glyph', () => {
  for (const s of SNACKS) assert.ok(s.id && s.label && s.glyph);
  for (const t of TOYS) assert.ok(t.id && t.label && t.glyph && typeof t.cost === 'number');
});
