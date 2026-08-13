// shop.test.js — THE QUARTERMASTER (DESIGN-SEED M4). Equipment overlay on frame
// stats, town shop generation (deterministic, leg-curved), the always-open
// resupply sink, buy/sell, and equipment save round-trip. The economy's closed
// loop is asserted here at the unit level; the gate probe (inc4) does the curve.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/tuning.js';
import { ITEMS, ITEM_IDS, getItem, itemsUnlockedBy, applyMods, sellValue } from '../src/items.js';
import { generateShop, buyLine, sellItem, resupply, isTownLeg } from '../src/shop.js';
import { createParty, equipItem, unequipSlot, changeJob, frameStats, serializeParty, restoreParty } from '../src/party.js';
import { deriveStats } from '../src/jobs.js';

test('every item is well-formed (slot, positive mods, price, minLeg)', () => {
  for (const id of ITEM_IDS) {
    const it = getItem(id);
    assert.ok(it.slot === 'arm' || it.slot === 'guard', id + ' slot');
    assert.ok(it.price > 0 && Number.isInteger(it.price), id + ' price');
    assert.ok(it.minLeg >= 0, id + ' minLeg');
    assert.ok(Object.keys(it.mods).length > 0, id + ' has mods');
    for (const k in it.mods) assert.ok(it.mods[k] > 0, `${id}.${k} positive`);
  }
});

test('applyMods overlays equipment onto a base block without mutating it', () => {
  const base = { hp: 40, atk: 10, def: 6, mag: 9, spd: 10 };
  const out = applyMods(base, { arm: 'issue_billhook', guard: 'regulation_jerkin' });
  assert.equal(out.atk, 13, '+3 atk from billhook');
  assert.equal(out.def, 8, '+2 def from jerkin');
  assert.equal(out.hp, 46, '+6 hp from jerkin');
  assert.equal(base.atk, 10, 'base untouched');
  assert.deepEqual(applyMods(base, null), base, 'null equip = identity');
  assert.deepEqual(applyMods(base, { arm: null, guard: null }), base, 'empty slots = identity');
});

test('itemsUnlockedBy honours the minLeg curve (no early power spike)', () => {
  const atLeg0 = itemsUnlockedBy(0);
  assert.ok(atLeg0.every((id) => getItem(id).minLeg === 0), 'leg 0 unlocks only tier-1');
  assert.ok(atLeg0.length > 0);
  const atLeg6 = itemsUnlockedBy(6);
  assert.ok(atLeg6.length > atLeg0.length, 'later legs unlock strictly more');
  assert.ok(atLeg6.includes('warden_plate'), 'tier-3 available by leg 6');
  assert.ok(!itemsUnlockedBy(0).includes('warden_plate'), 'tier-3 locked at leg 0');
});

test('generateShop is deterministic per (seed, leg) and only stocks unlocked items', () => {
  const a = generateShop(1234, 0);
  const b = generateShop(1234, 0);
  assert.deepEqual(a, b, 'same (seed,leg) → same board');
  const c = generateShop(1234, 6);
  assert.notDeepEqual(a.lines.map((l) => l.id), c.lines.map((l) => l.id), 'later leg → different board');
  for (const l of a.lines) assert.ok(getItem(l.id).minLeg <= 0, 'leg-0 board is all unlocked');
  // lines are unique and cheapest-first
  const ids = a.lines.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate lines');
  for (let i = 1; i < a.lines.length; i++) assert.ok(a.lines[i].price >= a.lines[i - 1].price, 'sorted by price');
});

test('buyLine moves gold → inventory and marks the line sold; refuses when short', () => {
  const party = createParty();
  party.gold = 1000;
  const shop = generateShop(42, 3);
  const li = 0, id = shop.lines[li].id, price = shop.lines[li].price;
  const r = buyLine(party, shop, li);
  assert.ok(r.ok);
  assert.equal(party.gold, 1000 - price);
  assert.deepEqual(party.inventory, [id]);
  assert.equal(shop.lines[li].sold, true);
  assert.equal(buyLine(party, shop, li).ok, false, 'cannot buy a sold line again');
  const broke = createParty(); broke.gold = 0;
  const shop2 = generateShop(42, 3);
  assert.equal(buyLine(broke, shop2, 0).ok, false, 'refused when the ledger is short');
});

test('resupply is the always-open sink: gold → supplies, never sold out', () => {
  const party = createParty();
  party.gold = TUNING.resupplyCost * 3;
  const before = party.supplies;
  for (let i = 0; i < 3; i++) {
    const r = resupply(party);
    assert.ok(r.ok, 'resupply never sells out while gold covers it');
  }
  assert.equal(party.supplies, before + 3 * TUNING.resupplyBlock);
  assert.equal(party.gold, 0);
  assert.equal(resupply(party).ok, false, 'refused only when the ledger cannot cover a block');
});

test('sellItem returns a fraction of price and removes the loose item', () => {
  const party = createParty();
  party.inventory = ['weighted_maul'];
  party.gold = 5;
  const r = sellItem(party, 0);
  assert.ok(r.ok);
  assert.equal(r.value, sellValue('weighted_maul'));
  assert.equal(party.gold, 5 + sellValue('weighted_maul'));
  assert.deepEqual(party.inventory, []);
  assert.equal(sellItem(party, 0).ok, false, 'nothing left to sell');
});

test('equipItem folds mods into the frame max and flows into combat stats', () => {
  const party = createParty(); // bailiff first
  const f = party.frames[0];
  const baseAtk = f.max.atk;
  party.inventory = ['weighted_maul']; // +6 atk
  const r = equipItem(party, 0, 'weighted_maul');
  assert.ok(r.ok);
  assert.equal(f.equip.arm, 'weighted_maul');
  assert.equal(f.max.atk, baseAtk + 6, 'equipment reaches frame.max (what combat reads)');
  assert.deepEqual(party.inventory, [], 'item left the inventory');
  // frameStats agrees with the live max
  assert.deepEqual(f.max, frameStats(f.jobId, f.equip));
});

test('equipping the same slot swaps: the displaced item returns to stores', () => {
  const party = createParty();
  party.inventory = ['issue_billhook', 'weighted_maul'];
  equipItem(party, 0, 'issue_billhook');
  const r = equipItem(party, 0, 'weighted_maul'); // same slot (arm)
  assert.ok(r.ok);
  assert.equal(r.displaced, 'issue_billhook');
  assert.equal(party.frames[0].equip.arm, 'weighted_maul');
  assert.ok(party.inventory.includes('issue_billhook'), 'displaced item back in stores');
  assert.ok(!party.inventory.includes('weighted_maul'), 'newly equipped item consumed from stores');
});

test('equipment survives a job change (overlay is job-orthogonal)', () => {
  const party = createParty();
  party.inventory = ['warden_plate']; // +7 def +16 hp
  equipItem(party, 0, 'warden_plate');
  const withPlateDef = party.frames[0].max.def;
  changeJob(party, 0, 'notary');
  const f = party.frames[0];
  assert.equal(f.equip.guard, 'warden_plate', 'still equipped after swap');
  assert.equal(f.max.def, deriveStats('notary').def + 7, 'plate def re-applied on the new job');
  assert.notEqual(f.max.def, withPlateDef, 'the base changed with the job; overlay persisted');
});

test('unequipSlot returns the item and drops the max (HP clamped)', () => {
  const party = createParty();
  party.inventory = ['warden_plate'];
  equipItem(party, 0, 'warden_plate');
  const f = party.frames[0];
  f.hp = f.max.hp; // full on the raised max
  const r = unequipSlot(party, 0, 'guard');
  assert.ok(r.ok);
  assert.equal(f.equip.guard, null);
  assert.ok(party.inventory.includes('warden_plate'));
  assert.equal(f.hp, f.max.hp, 'HP clamped down to the reduced max');
});

test('party equipment + inventory + gold round-trip through serialization', () => {
  const party = createParty();
  party.gold = 88; party.inventory = ['clerks_stylus', 'patrol_greaves'];
  equipItem(party, 1, 'clerks_stylus'); // chirurgeon gets +3 mag
  party.frames[0].hp = 5;
  const round = restoreParty(JSON.parse(JSON.stringify(serializeParty(party))));
  assert.equal(round.gold, 88);
  assert.deepEqual(round.inventory, ['patrol_greaves']);
  assert.equal(round.frames[1].equip.arm, 'clerks_stylus');
  assert.deepEqual(round.frames[1].max, party.frames[1].max, 'restored max reflects equipment');
  assert.equal(round.frames[0].hp, 5);
});

test('isTownLeg follows the town cadence', () => {
  // Default townEveryLegs=2 → pause after legs 1,3,5,... are towns.
  for (let leg = 0; leg < 8; leg++) {
    assert.equal(isTownLeg(leg), (leg + 1) % TUNING.townEveryLegs === 0);
  }
});
