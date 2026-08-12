import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BARE_HANDS, WEAPONS, ARMOR, STARTING_WEAPON_ID, createLoadout, equipWeapon, equipArmor,
  computeDamage, computeDamageVaried, compareEquip, WEAPON_KIND,
} from '../src/sim/equipment.js';
import { createRng } from '../src/core/rng.js';
import { statsForLevel } from '../src/sim/stats.js';

test('equipment: starting loadout auto-equips a real weapon, not bare hands', () => {
  const l = createLoadout();
  assert.equal(l.weapon.id, STARTING_WEAPON_ID);
  assert.notEqual(l.weapon.id, BARE_HANDS.id);
  assert.equal(l.armor.id, 'none');
});

test('equipment: bare hands is a distinct, feeble, unmistakable state', () => {
  assert.ok(BARE_HANDS.bare, 'flagged bare so the renderer shows an empty hand');
  assert.ok(BARE_HANDS.damage < WEAPONS['short-blade'].damage, 'feeble vs the starter');
  const l = equipWeapon(createLoadout(), BARE_HANDS.id);
  assert.equal(l.weapon.id, 'bare-hands');
});

test('equipment: equip weapon/armor by id', () => {
  const l = createLoadout();
  equipWeapon(l, 'long-blade');
  assert.equal(l.weapon.id, 'long-blade');
  equipArmor(l, 'heavy-armor');
  assert.equal(l.armor.defense, 7);
  // Unknown id leaves the current equip untouched.
  equipWeapon(l, 'does-not-exist');
  assert.equal(l.weapon.id, 'long-blade');
});

test('equipment: damage formula = max(1, str + weapon - def) (RE-DERIVED §3)', () => {
  const stats = statsForLevel(0); // str 14
  assert.equal(computeDamage(stats, WEAPONS['short-blade'], 0), 14 + 6);
  assert.equal(computeDamage(stats, WEAPONS['short-blade'], 5), 14 + 6 - 5);
  // Floor clamp: overwhelming defense still chips for 1.
  assert.equal(computeDamage({ str: 0 }, BARE_HANDS, 999), 1);
});

test('equipment: varied damage stays within the ±15% band and floor-clamps', () => {
  const stats = statsForLevel(0);
  const rng = createRng('dmg');
  const base = computeDamage(stats, WEAPONS['long-blade'], 3);
  for (let i = 0; i < 200; i++) {
    const d = computeDamageVaried(stats, WEAPONS['long-blade'], 3, rng);
    assert.ok(d >= 1);
    assert.ok(d >= Math.round(base * 0.85) - 1 && d <= Math.round(base * 1.15) + 1, `d=${d} base=${base}`);
  }
});

test('equipment: varied damage is deterministic for a given seed', () => {
  const stats = statsForLevel(0);
  const a = createRng(7), b = createRng(7);
  const seqA = Array.from({ length: 10 }, () => computeDamageVaried(stats, WEAPONS['short-blade'], 2, a));
  const seqB = Array.from({ length: 10 }, () => computeDamageVaried(stats, WEAPONS['short-blade'], 2, b));
  assert.deepEqual(seqA, seqB);
});

test('equipment: compareEquip surfaces damage/defense deltas and kind change', () => {
  const stats = statsForLevel(0);
  // short-blade → long-blade: +4 damage, same kind.
  const w = compareEquip(WEAPONS['short-blade'], WEAPONS['long-blade'], stats);
  assert.equal(w.dmgDelta, 4);
  assert.equal(w.kindChange, false);
  // melee → ranged: kind change flagged.
  const k = compareEquip(WEAPONS['short-blade'], WEAPONS['ranged-sidearm'], stats);
  assert.ok(k.kindChange);
  // armor comparison: none → heavy = +7 defense.
  const a = compareEquip(ARMOR.none, ARMOR['heavy-armor'], stats);
  assert.equal(a.defDelta, 7);
});

test('equipment: ranged sidearm is the ranged kind with long reach', () => {
  assert.equal(WEAPONS['ranged-sidearm'].kind, WEAPON_KIND.RANGED);
  assert.ok(WEAPONS['ranged-sidearm'].reach > WEAPONS['long-blade'].reach);
});
