import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_ITEMS, MAIN_ITEM_IDS, CONTROLS_ITEMS, CONTROLS_ITEM_IDS,
  KEYBOARD_ITEMS, MOUSE_ITEMS, CONTROLLER_ITEMS, rangeFraction,
} from '../src/ui/menu.js';

// menu.js builds real DOM, and this repo has no jsdom — so the page catalogs are
// exported as pure data (the titlemenu.js precedent) and audited here. What is being
// held is WHICH PAGE an option lives on, which is exactly what went wrong: the mouse
// settings were buried behind an item labelled "Controls (remap keys)…", so the
// operator went looking for a sensitivity control and did not find one.

test('the mouse options live on the MAIN options page, where you would look for them', () => {
  assert.ok(MAIN_ITEM_IDS.includes('mouseAim'), 'mouse aim is not on the main page');
  assert.ok(MAIN_ITEM_IDS.includes('mouseSensitivity'), 'mouse sensitivity is not on the main page');
});

test('they are NOT hidden on the key-rebinding page any more', () => {
  assert.ok(!CONTROLS_ITEM_IDS.includes('mouseAim'));
  assert.ok(!CONTROLS_ITEM_IDS.includes('mouseSensitivity'));
});

test('the mouse options sit with the other steering settings, not scattered', () => {
  const at = (id) => MAIN_ITEM_IDS.indexOf(id);
  assert.ok(at('invertY') < at('deadzone'));
  assert.ok(at('deadzone') < at('mouseAim'));
  assert.ok(at('mouseAim') < at('mouseSensitivity'));
  assert.ok(at('mouseSensitivity') < at('musicVolume'));
});

test('the controls page is now honestly just rebinding (its label says so)', () => {
  const kinds = new Set(CONTROLS_ITEMS.map((i) => i.kind));
  for (const k of kinds) assert.ok(['reset', 'goto'].includes(k), `stray kind ${k}`);
});

test('controls offers dedicated keyboard, mouse, and controller binding pages', () => {
  const pages = CONTROLS_ITEMS.filter((i) => i.kind === 'goto').map((i) => i.page);
  assert.deepEqual(pages.slice(0, 3), ['keyboard', 'mouse', 'controller']);
  assert.match(MAIN_ITEMS.find((i) => i.id === 'controls').label, /inputs/i);
});

test('every game verb appears on every input-class binding page', () => {
  const expected = [
    'steerUp', 'steerDown', 'steerLeft', 'steerRight',
    'fire', 'boost', 'brake', 'rollLeft', 'rollRight',
  ];
  for (const [inputClass, items] of [
    ['keyboard', KEYBOARD_ITEMS],
    ['mouse', MOUSE_ITEMS],
    ['controller', CONTROLLER_ITEMS],
  ]) {
    const rows = items.filter((i) => i.kind === 'rebind');
    assert.deepEqual(rows.map((i) => i.action), expected, inputClass);
    assert.ok(rows.every((i) => i.inputClass === inputClass), inputClass);
    assert.equal(items.at(-1).id, 'backToControls');
  }
});

test('mouse sensitivity is a slider, not a toggle', () => {
  const it = MAIN_ITEMS.find((i) => i.id === 'mouseSensitivity');
  assert.equal(it.kind, 'range');
});

test('every range row declares the scale its bar is drawn against', () => {
  for (const it of MAIN_ITEMS.filter((i) => i.kind === 'range')) {
    assert.equal(typeof it.min, 'number', `${it.id} has no min`);
    assert.equal(typeof it.max, 'number', `${it.id} has no max`);
    assert.ok(it.max > it.min, `${it.id} has an empty range`);
  }
});

test('no page is missing its way out', () => {
  assert.ok(MAIN_ITEM_IDS.includes('resume'));
  assert.ok(CONTROLS_ITEM_IDS.includes('back'));
  assert.equal(new Set(MAIN_ITEM_IDS).size, MAIN_ITEM_IDS.length, 'duplicate id on main');
  assert.equal(new Set(CONTROLS_ITEM_IDS).size, CONTROLS_ITEM_IDS.length, 'duplicate id on controls');
});

// ---- The bars on range rows ------------------------------------------------------
// The operator asked for "a bar or something for sensitivity". A bar that sits at 10%
// on its own default is worse than no bar — it reads as an empty, broken control — so
// the fill is checked here rather than left to a screenshot.

test('every range row draws a bar that is actually somewhere on its track', () => {
  const defaults = { fov: 65, deadzone: 0.15, mouseSensitivity: 1.0, musicVolume: 0.5 };
  for (const it of MAIN_ITEMS.filter((i) => i.kind === 'range')) {
    const f = rangeFraction(it, defaults[it.id]);
    assert.ok(f > 0.12 && f < 0.92,
      `${it.id} sits at ${(f * 100).toFixed(0)}% of its bar at the default — reads as empty or full`);
  }
});

test('the bar reads empty at the floor and full at the ceiling', () => {
  for (const it of MAIN_ITEMS.filter((i) => i.kind === 'range')) {
    assert.equal(rangeFraction(it, it.min), 0);
    assert.equal(rangeFraction(it, it.max), 1);
    assert.equal(rangeFraction(it, it.min - 999), 0, `${it.id} underflows`);
    assert.equal(rangeFraction(it, it.max + 999), 1, `${it.id} overflows`);
  }
});

test('sensitivity uses a log bar, so doubling looks the same wherever you start', () => {
  const it = MAIN_ITEMS.find((i) => i.id === 'mouseSensitivity');
  assert.equal(it.scale, 'log');
  const step = (a, b) => rangeFraction(it, b) - rangeFraction(it, a);
  assert.ok(Math.abs(step(0.5, 1) - step(2, 4)) < 1e-9, 'equal ratios should span equal distance');
  // a linear bar would have buried the default down at a tenth of the track
  const linear = (1.0 - it.min) / (it.max - it.min);
  assert.ok(linear < 0.12 && rangeFraction(it, 1.0) > 0.3,
    'the log scale should lift the default well clear of the linear 10%');
});
