// M12 E3 — traversal work-items seeded into gate-adjacent biome loot. A biome that
// borders a gate can drop a tag-carrying WORK-ITEM (consumable, never equipment) whose
// tag matches the gate's requiresTag — so the loop reads: loot in the salt flats →
// lay the ford across the drowned fen → the richer biome beyond.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoot } from '../src/engine/loot.js';
import lootData from '../data/register/loot.json' with { type: 'json' };

const loot = createLoot(lootData);

test('a gate-adjacent biome eventually yields a ford work-item; others never do', () => {
  // Across many seeds the salt flats produce the ford item at roughly its chance...
  let hits = 0;
  for (let s = 1; s <= 400; s++) {
    const it = loot.rollTraversal('salt-flats', s);
    if (it) { hits++; assert.deepEqual(it.tags, ['ford'], 'it carries the ford tag'); assert.equal(it.kind, 'work', 'a work-item, not equipment'); }
  }
  assert.ok(hits > 40 && hits < 200, `salt flats yield the ford sometimes (${hits}/400)`);
  // ...a biome with no traversal entry never does.
  for (let s = 1; s <= 100; s++) assert.equal(loot.rollTraversal('perilous-verge', s), null);
  assert.equal(loot.rollTraversal(null, 5), null, 'open country yields none');
});

test('the traversal roll is deterministic in (biome, seed)', () => {
  for (let s = 1; s <= 20; s++) {
    assert.deepEqual(loot.rollTraversal('salt-flats', s), loot.rollTraversal('salt-flats', s));
  }
});

test('the ford item, once carried, opens the fen ford (loop closes)', async () => {
  const { createGame, master: masterJson } = await import('../src/main.js');
  const g = createGame(masterJson);
  const gate = g.world.gateById('fen-ford-0');
  // find a salt-flats seed that drops the ford, add it, and spend it at the gate
  let item = null;
  for (let s = 1; s <= 400 && !item; s++) item = loot.rollTraversal('salt-flats', s);
  assert.ok(item, 'the salt flats can yield the ford item');
  g.session.addItem(item);
  const carried = g.session.items().find((it) => (it.tags || []).includes(gate.requiresTag));
  assert.ok(carried, 'the tag matches the gate requirement');
  g.session.dropItem(carried.uid);
  assert.equal(g.world.openGate(gate.id), true, 'the loop closes: loot → gate opens');
});
