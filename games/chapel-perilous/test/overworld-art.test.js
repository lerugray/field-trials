import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OVERWORLD_LANDMARK_LUMINANCE,
  OVERWORLD_PARTY_LUMINANCE,
  OVERWORLD_ROAD_LUMINANCE,
  OVERWORLD_TERRAIN_LUMINANCE,
  overworldRoadPoints,
} from '../src/engine/overworldart.js';

test('round-1 overworld reserves its hot values for road, landmark, and party', () => {
  assert.ok(Math.max(...OVERWORLD_TERRAIN_LUMINANCE) < OVERWORLD_ROAD_LUMINANCE);
  assert.ok(OVERWORLD_ROAD_LUMINANCE < Math.max(...OVERWORLD_LANDMARK_LUMINANCE));
  assert.ok(Math.max(...OVERWORLD_LANDMARK_LUMINANCE) < Math.max(...OVERWORLD_PARTY_LUMINANCE));
  assert.equal(OVERWORLD_TERRAIN_LUMINANCE.filter((v) => v >= 128).length, 0, 'terrain contains no hot ramp entry');
});

test('dotted road is deterministic, sweeping, and terminates at the nearest city', () => {
  const start = { x: 5, y: 5 };
  const sites = [
    { x: 18, y: 4, kind: 'city' },
    { x: 9, y: 10, kind: 'city' },
    { x: 3, y: 8, kind: 'dungeon' },
  ];
  const a = overworldRoadPoints(start, sites, 2323);
  const b = overworldRoadPoints(start, sites, 2323);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 20, 'road has enough dots to read as a sweep');
  assert.deepEqual(a.at(-1), { x: 9, y: 10 }, 'road terminates at nearest city');
  assert.ok(Math.hypot(a[0].x - a.at(-1).x, a[0].y - a.at(-1).y) >= 10, 'road spans a large country mass');
});

