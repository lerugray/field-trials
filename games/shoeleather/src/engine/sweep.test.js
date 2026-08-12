import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from './scene.js';
import { SweepTracker } from './sweep.js';
import { rect } from './geometry.js';

function scene() {
  return new Scene({ id: 'kitchen', hotspots: [
    { id: 'stove', bounds: rect(0, 0, 10, 10), label: 'Stove' },
    { id: 'knife', bounds: rect(20, 0, 5, 5), label: 'Knife', kind: 'take' },
  ] });
}

test('brush records first touch and returns true once', () => {
  const t = new SweepTracker();
  assert.equal(t.brush('kitchen', 'stove'), true);
  assert.equal(t.brush('kitchen', 'stove'), false);
  assert.ok(t.isBrushed('kitchen', 'stove'));
  assert.equal(t.brushedCount('kitchen'), 1);
});

test('coverage reports found/total and swept', () => {
  const s = scene();
  const t = new SweepTracker();
  assert.deepEqual(t.coverage(s), { found: 0, total: 2, swept: false });
  t.brush('kitchen', 'stove');
  assert.deepEqual(t.coverage(s), { found: 1, total: 2, swept: false });
  t.brush('kitchen', 'knife');
  assert.deepEqual(t.coverage(s), { found: 2, total: 2, swept: true });
  assert.ok(t.isSwept(s));
});

test('empty scene is never "swept" (nothing to find is not coverage)', () => {
  const s = new Scene({ id: 'void' });
  const t = new SweepTracker();
  assert.equal(t.coverage(s).swept, false);
});

test('unbrushed lists what is left to find', () => {
  const s = scene();
  const t = new SweepTracker();
  t.brush('kitchen', 'stove');
  assert.deepEqual(t.unbrushed(s).map((h) => h.id), ['knife']);
});

test('round-trips through JSON', () => {
  const s = scene();
  const t = new SweepTracker();
  t.brush('kitchen', 'stove');
  t.brush('kitchen', 'knife');
  const json = JSON.parse(JSON.stringify(t.toJSON()));
  const t2 = SweepTracker.fromJSON(json);
  assert.ok(t2.isSwept(s));
  assert.deepEqual(t2.toJSON(), { kitchen: ['stove', 'knife'] });
});

test('fromJSON tolerates junk', () => {
  assert.equal(SweepTracker.fromJSON(null).brushedCount('x'), 0);
  assert.equal(SweepTracker.fromJSON(undefined).brushedCount('x'), 0);
});
