import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTitleMenu, hasSavedProgress, TITLE_ITEMS, NO_PROGRESS_REASON,
} from '../src/ui/titlemenu.js';

test('the three items are New Run / Continue / Options, in order', () => {
  assert.deepEqual(TITLE_ITEMS.map((i) => i.id), ['new', 'continue', 'options']);
});

test('hasSavedProgress: a brand-new pilot has none', () => {
  assert.equal(hasSavedProgress(null), false);
  assert.equal(hasSavedProgress({}), false);
  assert.equal(hasSavedProgress({ runs: 0, balance: 0, upgrades: {}, contracts: [] }), false);
});

test('hasSavedProgress: any one of run/salvage/upgrade/contract counts', () => {
  assert.equal(hasSavedProgress({ runs: 1 }), true);
  assert.equal(hasSavedProgress({ balance: 40 }), true);
  assert.equal(hasSavedProgress({ upgrades: { hull: 0, blaster: 2 } }), true);
  assert.equal(hasSavedProgress({ contracts: ['ace'] }), true);
});

test('Continue is disabled (with a quiet reason) when there is no progress', () => {
  const m = createTitleMenu({ hasProgress: false });
  const cont = m.items().find((i) => i.id === 'continue');
  assert.equal(cont.enabled, false);
  assert.equal(cont.reason, NO_PROGRESS_REASON);
  assert.equal(m.isEnabled('continue'), false);
  // New Run and Options are always live.
  assert.equal(m.isEnabled('new'), true);
  assert.equal(m.isEnabled('options'), true);
});

test('Continue is enabled and carries no reason when there is progress', () => {
  const m = createTitleMenu({ hasProgress: true });
  const cont = m.items().find((i) => i.id === 'continue');
  assert.equal(cont.enabled, true);
  assert.equal(cont.reason, null);
});

test('selection starts on New Run (always enabled)', () => {
  assert.equal(createTitleMenu({ hasProgress: false }).current(), 'new');
  assert.equal(createTitleMenu({ hasProgress: true }).current(), 'new');
});

test('move skips a disabled Continue', () => {
  const m = createTitleMenu({ hasProgress: false });
  assert.equal(m.current(), 'new');
  assert.equal(m.move(1), 'options'); // Continue is skipped
  assert.equal(m.move(1), 'new');     // wraps back past nothing enabled between
  assert.equal(m.move(-1), 'options');
});

test('move lands on Continue when it is enabled', () => {
  const m = createTitleMenu({ hasProgress: true });
  assert.equal(m.move(1), 'continue');
  assert.equal(m.move(1), 'options');
  assert.equal(m.move(1), 'new'); // wraps
});

test('only the selected item reports selected:true', () => {
  const m = createTitleMenu({ hasProgress: true });
  m.move(1); // -> continue
  const sel = m.items().filter((i) => i.selected);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].id, 'continue');
});

test('select points at an enabled item, refuses a disabled one', () => {
  const m = createTitleMenu({ hasProgress: false });
  assert.equal(m.select('options'), true);
  assert.equal(m.current(), 'options');
  assert.equal(m.select('continue'), false); // disabled -> refused
  assert.equal(m.current(), 'options');       // unchanged
});

test('activate returns the current id when enabled, null when disabled', () => {
  const on = createTitleMenu({ hasProgress: true });
  on.select('continue');
  assert.equal(on.activate(), 'continue');
  // A menu whose selection can never be a disabled item still guards activate():
  const off = createTitleMenu({ hasProgress: false });
  assert.equal(off.activate(), 'new');
  assert.equal(off.reasonFor('continue'), NO_PROGRESS_REASON);
});
