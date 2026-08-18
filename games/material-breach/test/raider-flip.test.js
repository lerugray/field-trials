// Release fix round D1 follow-up — raider flip must follow travel direction. The pack figures face
// right, so a party moving right must not be mirrored, and a party moving left must be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility } from '../src/model.js';
import { castPlacements } from '../src/scene.js';

function placementsFor(steps, cursor = 0) {
  const f = createFacility({ seed: 'flip-test' });
  const view = { overlay: 'raid', replay: { steps, cursor } };
  return castPlacements(f, view);
}

test('a raider moving right faces right (flip false)', () => {
  const steps = [
    { pos: { x: 2, y: 8 }, strength: 1 },
    { pos: { x: 3, y: 8 }, strength: 1 },
    { pos: { x: 4, y: 8 }, strength: 1 },
  ];
  const placed = placementsFor(steps, 1);
  const head = placed.find((p) => p.figure === 'raider');
  assert.ok(head, 'raider head not placed');
  assert.equal(head.flip, false, 'rightward raider was flipped');
});

test('a raider moving left faces left (flip true)', () => {
  const steps = [
    { pos: { x: 8, y: 8 }, strength: 1 },
    { pos: { x: 7, y: 8 }, strength: 1 },
    { pos: { x: 6, y: 8 }, strength: 1 },
  ];
  const placed = placementsFor(steps, 1);
  const head = placed.find((p) => p.figure === 'raider');
  assert.ok(head, 'raider head not placed');
  assert.equal(head.flip, true, 'leftward raider was not flipped');
});

test('the trailing raider shares the head facing', () => {
  const steps = [
    { pos: { x: 10, y: 8 }, strength: 1 },
    { pos: { x: 9, y: 8 }, strength: 1 },
    { pos: { x: 8, y: 8 }, strength: 1 },
    { pos: { x: 7, y: 8 }, strength: 1 },
  ];
  const placed = placementsFor(steps, 3);
  const head = placed.find((p) => p.figure === 'raider');
  const trail = placed.find((p) => p.figure === 'raiderB');
  assert.ok(head && trail, 'party missing head or trail');
  assert.equal(head.flip, true);
  assert.equal(trail.flip, head.flip, 'trail faces a different direction from the head');
});
