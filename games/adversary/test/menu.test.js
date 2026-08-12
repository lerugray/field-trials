import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMenu, openMenu, closeMenu, toggleMenu, moveTab, moveCursor, currentTab,
  entries, compareAt, confirm, TABS,
} from '../src/sim/menu.js';
import { createStage } from '../src/sim/stage.js';
import { addWeapon, addArmor } from '../src/sim/inventory.js';

const W = 20;
const FLAT = { rows: ['.'.repeat(W), '.'.repeat(W), 'p'.padEnd(W, '.'), '#'.repeat(W)] };
function ctx() {
  const s = createStage(FLAT, { seed: 'menu' });
  addWeapon(s.inventory, 'long-blade');
  addArmor(s.inventory, 'light-armor');
  return s;
}

test('menu: open/close/toggle', () => {
  const m = createMenu();
  assert.ok(!m.open);
  toggleMenu(m); assert.ok(m.open);
  closeMenu(m); assert.ok(!m.open);
  openMenu(m); assert.equal(currentTab(m), 'items');
});

test('menu: five tabs in order, wrapping', () => {
  const m = createMenu(); openMenu(m);
  assert.deepEqual(TABS, ['items', 'weapons', 'equipment', 'moves', 'strength']);
  moveTab(m, 1); assert.equal(currentTab(m), 'weapons');
  moveTab(m, -1); assert.equal(currentTab(m), 'items');
  moveTab(m, -1); assert.equal(currentTab(m), 'strength'); // wrap
});

test('menu: MOVES tab lists the kit with lock state + inputs', () => {
  const s = ctx();
  s.kit.charged = true;
  const m = createMenu(); openMenu(m); moveTab(m, 3); // moves
  const rows = entries(m, s);
  const dodge = rows.find((r) => r.id === 'dodge');
  const charged = rows.find((r) => r.id === 'charged');
  const downthrust = rows.find((r) => r.id === 'downthrust');
  assert.ok(dodge.unlocked, 'base move always unlocked');
  assert.ok(charged.unlocked, 'unlocked move shows unlocked');
  assert.ok(!downthrust.unlocked && downthrust.value === 'LOCKED', 'locked move reads LOCKED');
});

test('menu: weapons tab lists owned weapons + bare hands and equips on confirm', () => {
  const s = ctx();
  const m = createMenu(); openMenu(m); moveTab(m, 1); // weapons
  const rows = entries(m, s);
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes('short-blade') && ids.includes('long-blade') && ids.includes('bare-hands'));
  // Equip long-blade.
  m.cursor = ids.indexOf('long-blade');
  const ev = confirm(m, s);
  assert.equal(ev.type, 'equip-weapon');
  assert.equal(s.loadout.weapon.id, 'long-blade');
});

test('menu: weapons tab surfaces the equip-comparison delta', () => {
  const s = ctx(); // equipped short-blade
  const m = createMenu(); openMenu(m); moveTab(m, 1);
  const ids = entries(m, s).map((r) => r.id);
  m.cursor = ids.indexOf('long-blade');
  const cmp = compareAt(m, s);
  assert.equal(cmp.dmgDelta, 4); // long(10) - short(6)
  assert.equal(cmp.kindChange, false);
  // bare hands is clearly worse.
  m.cursor = ids.indexOf('bare-hands');
  assert.ok(compareAt(m, s).dmgDelta < 0);
});

test('menu: equipment tab equips armor and shows defense delta', () => {
  const s = ctx();
  const m = createMenu(); openMenu(m); moveTab(m, 2); // equipment
  const ids = entries(m, s).map((r) => r.id);
  m.cursor = ids.indexOf('light-armor');
  assert.equal(compareAt(m, s).defDelta, 3);
  confirm(m, s);
  assert.equal(s.loadout.armor.id, 'light-armor');
});

test('menu: items tab uses a heal item, restoring HP and decrementing count', () => {
  const s = ctx();
  s.progress.hp = 10;
  const m = createMenu(); openMenu(m); // items tab (0)
  const rows = entries(m, s);
  assert.ok(rows.some((r) => r.id === 'heal' && r.count >= 1));
  m.cursor = 0;
  const ev = confirm(m, s);
  assert.equal(ev.type, 'use-item');
  assert.ok(ev.healed > 0);
  assert.ok(s.progress.hp > 10);
  assert.equal(s.inventory.items.heal, 0);
});

test('menu: strength tab is read-only stat rows', () => {
  const s = ctx();
  const m = createMenu(); openMenu(m); moveTab(m, 4); // strength is now the 5th tab
  const rows = entries(m, s);
  const names = rows.map((r) => r.name);
  assert.ok(names.includes('Strength') && names.includes('Max Power') && names.includes('Level'));
  assert.equal(confirm(m, s), null); // no action
});

test('menu: cursor wraps within the current tab list', () => {
  const s = ctx();
  const m = createMenu(); openMenu(m); moveTab(m, 1);
  const n = entries(m, s).length;
  moveCursor(m, -1, s);
  assert.equal(m.cursor, n - 1); // wrapped to last
});
