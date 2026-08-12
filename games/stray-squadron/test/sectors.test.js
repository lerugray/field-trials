import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS, pickSector, sectorById } from '../src/world/sectors.js';

test('at least three authored sector themes (DESIGN-SEED M4 floor)', () => {
  assert.ok(SECTORS.length >= 3, `have ${SECTORS.length} sectors`);
});

test('every theme carries a complete, well-formed shape', () => {
  const isRgb = (c) =>
    Array.isArray(c) && c.length === 3 && c.every((v) => v >= 0 && v <= 1);
  for (const s of SECTORS) {
    assert.equal(typeof s.id, 'string');
    assert.ok(s.name && typeof s.name === 'string');
    assert.ok(isRgb(s.fog.color), `${s.id} fog color`);
    assert.ok(s.fog.far > s.fog.near, `${s.id} fog far>near`);
    assert.ok(s.debris.length >= 1 && s.debris.every(isRgb), `${s.id} debris palette`);
    assert.ok(s.rock.length >= 1 && s.rock.every(isRgb), `${s.id} rock palette`);
    assert.ok(isRgb(s.pickup), `${s.id} pickup accent`);
    assert.ok(s.density > 0, `${s.id} density`);
  }
});

test('sector ids are unique', () => {
  const ids = SECTORS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('pickSector is deterministic for a seed', () => {
  assert.equal(pickSector('run-9').id, pickSector('run-9').id);
});

test('pickSector spans more than one sector across seeds', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickSector('s' + i).id);
  assert.ok(seen.size >= 2, `only reached ${seen.size} sectors`);
});

test('sectorById round-trips and falls back safely', () => {
  for (const s of SECTORS) assert.equal(sectorById(s.id).id, s.id);
  assert.equal(sectorById('no-such-sector'), SECTORS[0]);
});
