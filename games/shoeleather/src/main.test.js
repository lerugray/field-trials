import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitFactor, deviceToLogical, cursorCss, verbLabel, localStorageStore, setEndingMode, boardSlotWidth, endingPortraitState } from './main.js';
import { LOGICAL_W, LOGICAL_H, UPSCALE_STEPS } from './config.js';

// Importing main.js under node must not crash (DOM auto-boot is guarded).

test('fitFactor picks the largest integer upscale that fits', () => {
  // 384x216: factor 4 needs 1536x864
  assert.equal(fitFactor(1600, 900, LOGICAL_W, LOGICAL_H), 4);
  assert.equal(fitFactor(1200, 700, LOGICAL_W, LOGICAL_H), 3);
  // tiny window floors at the smallest step
  assert.equal(fitFactor(100, 100, LOGICAL_W, LOGICAL_H), UPSCALE_STEPS[0]);
});

test('deviceToLogical divides by factor and floors', () => {
  assert.deepEqual(deviceToLogical(0, 0, 3), { x: 0, y: 0 });
  assert.deepEqual(deviceToLogical(31, 62, 3), { x: 10, y: 20 });
});

test('cursorCss and verbLabel cover every verb distinctly', () => {
  const kinds = ['look', 'take', 'talk', 'use', 'exit'];
  const cursors = new Set(kinds.map(cursorCss));
  assert.equal(cursors.size, kinds.length); // each verb a distinct cursor
  for (const k of kinds) assert.ok(verbLabel(k).length > 0);
  assert.equal(cursorCss('nonsense'), 'default');
});

test('localStorageStore adapts a localStorage-shaped object', () => {
  const backing = {};
  const ls = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
  };
  // keys() reads enumerable own keys of the ls object; emulate with defineProperties
  const store = localStorageStore(Object.assign(ls, {}));
  store.set('a', '1');
  assert.equal(store.get('a'), '1');
  store.remove('a');
  assert.equal(store.get('a'), null);
});

test('true ending scene mode clears residue, hides HUD bar, and disables world input', () => {
  const ui = { bar: { style: {} }, stage: { style: {} }, toast: { style: { display: 'block' }, textContent: 'old toast' } };
  let cleared = 0;
  const engine = { focus: { clear() { cleared++; } } };
  setEndingMode(ui, engine, true);
  assert.equal(ui.bar.style.display, 'none');
  assert.equal(ui.stage.style.pointerEvents, 'none');
  assert.equal(ui.toast.style.display, 'none');
  assert.equal(ui.toast.textContent, '');
  assert.equal(cleared, 1);
  setEndingMode(ui, engine, false);
  assert.equal(ui.bar.style.display, 'flex');
  assert.equal(ui.stage.style.pointerEvents, '');
});

test('expanded board slots size to full evidence labels within the document width', () => {
  assert.equal(boardSlotWidth(10), 220);
  assert.equal(boardSlotWidth(78), 750);
  assert.equal(boardSlotWidth(200), 940);
});

test('confrontation portrait state hardens only the accused and calls out the speaking witness', () => {
  assert.equal(endingPortraitState({ isAccused: true, isSpeaker: false, beatIndex: 0 }), 'open');
  assert.equal(endingPortraitState({ isAccused: true, isSpeaker: false, beatIndex: 4 }), 'guarded');
  assert.equal(endingPortraitState({ isAccused: true, isSpeaker: false, beatIndex: 6 }), 'defensive');
  assert.equal(endingPortraitState({ isAccused: true, isSpeaker: true, beatIndex: 8 }), 'hostile');
  assert.equal(endingPortraitState({ isAccused: false, isSpeaker: false, beatIndex: 8 }), 'open');
  assert.equal(endingPortraitState({ isAccused: false, isSpeaker: true, beatIndex: 8 }), 'guarded');
});
