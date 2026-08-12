// node --test — island colliders, swept landing, edge-snap, kill-plane. No WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { island, makeTestArchipelago, surfaceBelow, archipelagoGround, flatGround } from '../src/sim/islands.js';
import { createWorld, stepOnce, computeKillPlaneY } from '../src/sim/world.js';
import { createPlayer, updatePlayer } from '../src/sim/player.js';
import { TIMESTEP, tuning } from '../src/sim/tuning.js';

test('the handcrafted archipelago has islands and a roomy spawn pad', () => {
  const isl = makeTestArchipelago();
  assert.ok(isl.length >= 4, 'at least four pads to teach jump 1→2→3');
  assert.equal(isl[0].topY, 0, 'spawn pad top at y=0');
  assert.ok(isl[0].radius >= 6, 'spawn pad is roomy');
});

test('surfaceBelow finds the highest top under a point, and null over the void', () => {
  const isl = [island(0, 0, 0, 5), island(0, 0, 3, 2)]; // stacked-ish; higher one at 3
  const s = surfaceBelow(isl, 0, 0, Infinity);
  assert.equal(s.y, 3, 'the higher top wins under (0,0)');
  // maxY caps which tops count as "below".
  const s2 = surfaceBelow(isl, 0, 0, 1.0);
  assert.equal(s2.y, 0, 'with maxY=1 only the y=0 top is below');
  assert.equal(surfaceBelow(isl, 100, 100, Infinity), null, 'over the void → null');
});

test('swept landing: crossing a top from above lands (no tunneling on a fast fall)', () => {
  const g = archipelagoGround([island(0, 0, 0, 5)]);
  // Player fell from y=+5 to y=-5 in one tick (a huge, unrealistic step): still lands.
  const landing = g.sampleBelow(0, 0, 5, -5, -300);
  assert.ok(landing && Math.abs(landing.y - 0) < 1e-9, 'swept check catches the top');
});

test('rising player does not land', () => {
  const g = archipelagoGround([island(0, 0, 0, 5)]);
  assert.equal(g.sampleBelow(0, 0, -0.1, 0.1, +5), null, 'moving up → no landing');
});

test('edge-snap clamps a near-miss landing onto the rim (law #8)', () => {
  const g = archipelagoGround([island(0, 0, 0, 5)]);
  // Land just past the rim (dist 5.5, within edgeSnap 1.1).
  const landing = g.sampleBelow(5.5, 0, 1, -1, -3);
  assert.ok(landing, 'near-miss still lands via edge-snap');
  const dist = Math.hypot(landing.x, landing.z);
  assert.ok(Math.abs(dist - 5) < 1e-6, `snapped onto rim (dist ${dist})`);
});

test('ground movement can cross the real rim and fall instead of edge-guarding', () => {
  const ground = archipelagoGround([island(0, 0, 0, 1)]);
  const p = createPlayer({ x: 0.92, y: 0, z: 0 });
  for (let i = 0; i < 12; i++) updatePlayer(p, { s: 1, yaw: 0 }, TIMESTEP, ground);
  assert.ok(p.pos.x > 1, 'walked beyond the physical platform radius');
  assert.equal(p.grounded, false, 'genuinely airborne over the void');
  assert.ok(p.pos.y < 0, 'gravity is dropping the player');
});

test('a landing well past the snap ring misses (falls into void)', () => {
  const g = archipelagoGround([island(0, 0, 0, 5)]);
  assert.equal(g.sampleBelow(9, 0, 1, -1, -3), null, 'too far past the rim → miss');
});

test('per-tick displacement is bounded (swept-collision safety, fold)', () => {
  const maxDisp = tuning.move.maxFallSpeed * TIMESTEP;
  assert.ok(maxDisp < 1.0, `max fall displacement/tick ${maxDisp.toFixed(3)} wu is small`);
});

test('player spawns above island A and lands on it', () => {
  const w = createWorld(1);
  for (let i = 0; i < 120; i++) stepOnce(w);
  assert.ok(w.player.grounded, 'landed');
  assert.ok(Math.abs(w.player.pos.y - 0) < 1e-6, 'rests on island A top (y=0)');
});

test('kill-plane sits below the lowest island by the margin', () => {
  const isl = makeTestArchipelago();
  const lowest = isl.reduce((m, i) => Math.min(m, i.topY), Infinity);
  assert.equal(computeKillPlaneY(isl), lowest - tuning.fall.killPlaneMargin);
});

test('falling into the void → updraft net returns the player to last grounded (law #7)', () => {
  const w = createWorld(1);
  for (let i = 0; i < 120; i++) stepOnce(w); // land on A
  const home = { ...w.player.pos };
  // Hurl the player off into the void below the kill-plane.
  w.player.grounded = false;
  w.player.pos.x = 200; w.player.pos.y = w.killPlaneY - 5; w.player.pos.z = 200;
  w.player.vel.y = -30;
  stepOnce(w);
  assert.ok(w.player.netCaughtThisTick, 'net caught the fall');
  assert.ok(Math.abs(w.player.pos.x - home.x) < 1e-6 && Math.abs(w.player.pos.z - home.z) < 1e-6, 'returned to last grounded island');
  assert.ok(w.player.grounded, 'set down grounded, not executed');
});

test('a bot aimed along the generated chain leaves the spawn pad and lands elsewhere', () => {
  // The reachability collect-bot proves the full traversal; here we just confirm the
  // leap + swept collision integrate over the GENERATED course: aim at island 1 and hop.
  const w = createWorld(1);
  for (let i = 0; i < 120; i++) stepOnce(w); // settle on the spawn pad
  assert.ok(w.player.grounded && Math.abs(w.player.pos.y) < 1e-6, 'settled on spawn pad');
  const B = w.islands[1];
  const yaw = Math.atan2(-(B.cx - w.islands[0].cx), -(B.cz - w.islands[0].cz)); // aim at island 1
  let held = false, landedIdx = 0;
  for (let i = 0; i < 300; i++) {
    const jump = !held && w.player.grounded;
    stepOnce(w, { f: 1, s: 0, jump, yaw });
    held = jump;
    if (w.player.grounded && i > 3) {
      landedIdx = w.islands.findIndex((o) =>
        Math.hypot(w.player.pos.x - o.cx, w.player.pos.z - o.cz) <= o.radius + 0.05 &&
        Math.abs(w.player.pos.y - o.topY) < 0.2);
      if (landedIdx > 0) break; // reached a non-spawn island
    }
  }
  assert.ok(landedIdx > 0, `bot hopped off the spawn pad onto island ${landedIdx}`);
});

test('flatGround adapter still lands a descending player', () => {
  const g = flatGround(0);
  assert.ok(g.sampleBelow(0, 0, 0.1, -0.1, -3), 'flat ground catches');
  assert.equal(g.sampleBelow(0, 0, 0.1, -0.1, +3), null, 'not while rising');
});
