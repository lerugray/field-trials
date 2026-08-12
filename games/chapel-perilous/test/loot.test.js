// M10 Part B — loot + inventory. Ray's first genre gap: "not sure if there's any
// loot if you kill something." Kills can now drop salvage/trinkets and caches yield
// relics, into a mortal-layer inventory you can equip from. These lock the model:
// seeded + no-scaling drops, a working pack, equip swaps the weapon (power-from-
// items), and it all persists + resets on death.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoot } from '../src/engine/loot.js';
import { createChargen } from '../src/engine/chargen.js';
import { createSession } from '../src/engine/session.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };
import lootData from '../data/register/loot.json' with { type: 'json' };

const loot = createLoot(lootData);
const chargen = createChargen(chargenData);
const foe = { name: 'Rat', weapon: { name: 'yellow teeth', dmg: [1, 2] } };

test('kill loot is seeded, mostly-nothing, and never scales (LOCK spirit)', () => {
  // deterministic per seed
  assert.deepEqual(loot.rollKill(foe, 7), loot.rollKill(foe, 7));
  // across many seeds most kills drop nothing; a minority drop items
  let drops = 0;
  for (let s = 1; s <= 400; s++) if (loot.rollKill(foe, s)) drops += 1;
  const rate = drops / 400;
  assert.ok(rate > 0.15 && rate < 0.45, `drop rate ${rate} should sit near the fixed ~0.30, not scale`);
  // a dropped weapon salvages the foe's own band (power from items)
  let sawWeapon = false;
  for (let s = 1; s <= 50 && !sawWeapon; s++) {
    const it = loot.rollKill(foe, s);
    if (it && it.kind === 'weapon') { sawWeapon = true; assert.deepEqual(it.weapon.dmg, [1, 2]); }
  }
  assert.ok(sawWeapon, 'expected at least one salvaged-weapon drop in the sample');
});

test('a richer fixed Operation profile yields more drops from the same seed set', () => {
  const count = (dropChance) => {
    let drops = 0;
    for (let seed = 1; seed <= 1000; seed++) if (loot.rollKill(foe, seed, { dropChance })) drops++;
    return drops;
  };
  assert.ok(count(0.40) > count(0.30), 'Operation 4 profile should pay out more often than Operation 1');
});

test('a cache yields a named relic item', () => {
  const it = loot.fromCache('hagbards-compass', '[SEED] Hagbard’s Compass');
  assert.equal(it.kind, 'relic');
  assert.equal(it.artifact, 'hagbards-compass');
  assert.ok(it.name.includes('Compass'));
});

test('inventory: add assigns a uid; items() is a copy; drop removes', () => {
  const s = createSession({ chargen, seed: 1 });
  assert.deepEqual(s.items(), [], 'a fresh stranger carries nothing');
  const a = s.addItem({ kind: 'trinket', name: '[SEED] a coin' });
  const b = s.addItem({ kind: 'trinket', name: '[SEED] a key' });
  assert.notEqual(a.uid, b.uid, 'each item gets a distinct uid');
  assert.equal(s.items().length, 2);
  s.items().push({ uid: 'x' }); // mutating the copy must not affect the pack
  assert.equal(s.items().length, 2);
  assert.equal(s.dropItem(a.uid), true);
  assert.equal(s.items().length, 1);
});

test('equip swaps the PC weapon (reversibly) — power from items', () => {
  const s = createSession({ chargen, seed: 2 });
  const before = s.pc.weapon;
  const it = s.addItem({ kind: 'weapon', name: '[SEED] a sharp thing', weapon: { name: 'sharp thing', dmg: [9, 9] } });
  assert.equal(s.equip(it.uid), true);
  assert.deepEqual(s.pc.weapon.dmg, [9, 9], 'equipped weapon is now the PC weapon');
  // the old weapon is stowed back (reversible) and the equipped item left the pack
  assert.ok(!s.items().some((x) => x.uid === it.uid), 'equipped item leaves the pack');
  assert.ok(s.items().some((x) => x.kind === 'weapon' && x.weapon.dmg[0] === before.dmg[0]), 'old weapon stowed back');
  // equipping a non-weapon is a no-op
  const t = s.addItem({ kind: 'trinket', name: '[SEED] a coin' });
  assert.equal(s.equip(t.uid), false);
});

test('inventory persists through save/load and resets on death', () => {
  const s = createSession({ chargen, seed: 3 });
  s.addItem({ kind: 'relic', name: '[SEED] the compass', artifact: 'hagbards-compass' });
  const eq = s.addItem({ kind: 'weapon', name: '[SEED] a blade', weapon: { name: 'blade', dmg: [8, 8] } });
  s.equip(eq.uid);
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  const s2 = createSession({ chargen, seed: 99 });
  s2.restore(snap);
  assert.deepEqual(s2.items().map((x) => x.name), s.items().map((x) => x.name), 'pack round-trips');
  assert.deepEqual(s2.pc.weapon.dmg, [8, 8], 'equipped weapon round-trips');
  // death clears the mortal-layer pack
  s.die('test');
  assert.deepEqual(s.items(), [], 'a new stranger inherits none of the dead one’s loot');
});
