import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInventory, addWeapon, addArmor, addItem, hasItem, consumeItem, weaponDef, ITEMS,
} from '../src/sim/inventory.js';
import { BARE_HANDS } from '../src/sim/equipment.js';

test('inventory: starting kit has the starter weapon, no armor beyond none, one heal', () => {
  const inv = createInventory();
  assert.ok(inv.weapons.includes('short-blade'));
  assert.ok(inv.armors.includes('none'));
  assert.equal(inv.items.heal, 1);
});

test('inventory: add weapon/armor deduplicates and validates', () => {
  const inv = createInventory();
  addWeapon(inv, 'long-blade');
  addWeapon(inv, 'long-blade'); // dup ignored
  assert.equal(inv.weapons.filter((w) => w === 'long-blade').length, 1);
  addWeapon(inv, 'nonexistent'); // invalid ignored
  assert.ok(!inv.weapons.includes('nonexistent'));
  addArmor(inv, 'heavy-armor');
  assert.ok(inv.armors.includes('heavy-armor'));
});

test('inventory: items add, count, consume', () => {
  const inv = createInventory({ items: { heal: 0 } });
  assert.ok(!hasItem(inv, 'heal'));
  addItem(inv, 'heal', 2);
  assert.equal(inv.items.heal, 2);
  const def = consumeItem(inv, 'heal');
  assert.equal(def.id, 'heal');
  assert.equal(inv.items.heal, 1);
  consumeItem(inv, 'heal');
  assert.equal(consumeItem(inv, 'heal'), null); // none left
  assert.equal(ITEMS.heal.heal, 15);
});

test('inventory: weaponDef resolves ids and bare hands', () => {
  assert.equal(weaponDef('short-blade').id, 'short-blade');
  assert.equal(weaponDef(BARE_HANDS.id).id, 'bare-hands');
});
