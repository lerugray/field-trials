import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOOM_CLASSES, maxGlowPoolArea, maxLocalLuminanceLift } from '../src/engine/lightbudget.js';

// Independent acceptance ceilings. Production imports BLOOM_CLASSES; changing a
// live knob cannot expand peak lift or pool area without crossing this review gate.
const LIFT_CAP = Object.freeze({
  siteChapel: 0.011,
  siteCity: 0.028,
  siteDungeon: 0.004,
  partyTorch: 0.065,
  dungeonTorch: 0.215,
  dungeonEncounter: 0.004,
  crtBloom: 0.161,
  crtGlare: 0.028,
});

const AREA_CAP = Object.freeze({
  siteChapel: 0.247,
  siteCity: 0.665,
  siteDungeon: 0.126,
  partyTorch: 0.725,
  dungeonTorch: 0.102,
  dungeonEncounter: 0.322,
  crtBloom: 1,
  crtGlare: 0.228,
});

test('every additive light class stays under its maximum local luminance-lift cap', () => {
  assert.deepEqual(Object.keys(BLOOM_CLASSES).sort(), Object.keys(LIFT_CAP).sort(), 'every production class has a reviewed lift cap');
  for (const [name, spec] of Object.entries(BLOOM_CLASSES)) {
    const lift = maxLocalLuminanceLift(spec);
    assert.ok(lift <= LIFT_CAP[name], `${name} lift ${lift.toFixed(6)} must be <= ${LIFT_CAP[name]}`);
  }
});

test('every additive light class stays under its maximum glow-pool-area cap', () => {
  assert.deepEqual(Object.keys(BLOOM_CLASSES).sort(), Object.keys(AREA_CAP).sort(), 'every production class has a reviewed area cap');
  for (const [name, spec] of Object.entries(BLOOM_CLASSES)) {
    const area = maxGlowPoolArea(spec);
    assert.ok(area <= AREA_CAP[name], `${name} area ${area.toFixed(6)} must be <= ${AREA_CAP[name]}`);
  }
});
