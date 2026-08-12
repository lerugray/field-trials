import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTERS, styleFor, registerById, wallShadeAt } from '../src/engine/dungeonregister.js';

test('there are several distinct registers with valid fields', () => {
  assert.ok(REGISTERS.length >= 4, 'at least 4 registers');
  const ids = new Set();
  for (const r of REGISTERS) {
    assert.ok(r.id && r.name, 'id + name');
    assert.ok(!ids.has(r.id), `unique id ${r.id}`); ids.add(r.id);
    assert.ok(['brick', 'hatch', 'grid', 'stipple', 'none'].includes(r.pattern), `${r.id} pattern`);
    for (const k of ['wallNear', 'wallFar', 'ceil', 'floor', 'edgeShade', 'accent']) {
      assert.ok(r[k] >= 0 && r[k] <= 6, `${r.id}.${k} on ramp`);
    }
    assert.equal(typeof r.edge, 'boolean');
    assert.ok(r.edgeWidth >= 1);
  }
});

test('registers are visually distinct (no two share pattern+palette)', () => {
  const sigs = REGISTERS.map((r) => `${r.pattern}|${r.wallNear}|${r.wallFar}|${r.ceil}|${r.floor}`);
  assert.equal(new Set(sigs).size, REGISTERS.length, 'each register has a unique look');
});

test('styleFor is deterministic and covers the table across seeds', () => {
  assert.equal(styleFor(42).id, styleFor(42).id);
  const seen = new Set();
  for (let s = 0; s < 200; s++) seen.add(styleFor(s).id);
  assert.equal(seen.size, REGISTERS.length, 'every register is reachable');
});

test('registerById round-trips and misses cleanly', () => {
  assert.equal(registerById(REGISTERS[0].id).id, REGISTERS[0].id);
  assert.equal(registerById('nope'), null);
});

test('wallShadeAt interpolates near→far and clamps to the ramp', () => {
  const r = { wallNear: 5, wallFar: 1 };
  assert.equal(wallShadeAt(r, 0, 4), 5);        // nearest = near
  assert.equal(wallShadeAt(r, 4, 4), 1);        // farthest = far
  const mid = wallShadeAt(r, 2, 4);
  assert.ok(mid > 1 && mid < 5, 'mid slice between');
  assert.equal(wallShadeAt(r, 0, 0), 5);        // depth 0 guard
});
