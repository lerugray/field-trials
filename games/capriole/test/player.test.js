// node --test — the triple jump + movement kinematics (signature law #1). No WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, updatePlayer, jumpImpulses, moveBasis } from '../src/sim/player.js';
import { TIMESTEP, GRAVITY, tuning } from '../src/sim/tuning.js';

const FLAT = { groundY: 0, solidBelow: true };

// Drive a player pressing the first jump from the ground and each subsequent jump
// at its apex (first descending tick), up to `maxJumps`. Returns the peak height
// reached during each jump phase = the cumulative apex above takeoff.
function chainAtApex(maxJumps) {
  const p = createPlayer({ x: 0, y: 0, z: 0 });
  const peak = [0, 0, 0];
  let held = false; // ensures exactly one release tick between presses (clean edges)
  for (let i = 0; i < 2000; i++) {
    let jump = false;
    if (!held) {
      if (p.jumpsUsed === 0 && p.grounded) jump = true;
      else if (p.jumpsUsed > 0 && p.jumpsUsed < maxJumps && !p.grounded && p.vel.y <= 0) jump = true;
    }
    updatePlayer(p, { jump }, TIMESTEP, FLAT);
    held = jump;
    const idx = Math.min(p.jumpsUsed, maxJumps) - 1;
    if (idx >= 0) peak[idx] = Math.max(peak[idx], p.pos.y);
    if (p.jumpsUsed >= maxJumps && p.grounded && i > 60) break;
  }
  return peak.slice(0, maxJumps);
}

test('jumpImpulses are all positive and derived from gravity', () => {
  const imp = jumpImpulses();
  assert.equal(imp.length, tuning.jump.count);
  imp.forEach((v) => assert.ok(v > 0));
});

test('a single jump from the ground reaches about base height H', () => {
  const apexes = chainAtApex(1);
  const H = tuning.jump.baseHeight;
  assert.ok(apexes[0] >= H && apexes[0] <= H + 0.8, `jump1 apex ${apexes[0]} near H=${H}`);
});

test('the triple jump escalates geometrically (1.0 / 1.5 / 2.2 × H, within tolerance)', () => {
  const apexes = chainAtApex(3);
  const H = tuning.jump.baseHeight;
  assert.equal(apexes.length, 3, 'three apexes recorded');
  // Strictly increasing — each jump is a taller tool.
  assert.ok(apexes[0] < apexes[1] && apexes[1] < apexes[2], `increasing: ${apexes}`);
  // Cumulative apex within tolerance of the law's ratios (hang adds a little height).
  const ratio1 = apexes[1] / apexes[0];
  const ratio2 = apexes[2] / apexes[0];
  assert.ok(Math.abs(ratio1 - 1.5) < 0.2, `ratio jump2/jump1 = ${ratio1.toFixed(3)} ~ 1.5`);
  assert.ok(Math.abs(ratio2 - 2.2) < 0.25, `ratio jump3/jump1 = ${ratio2.toFixed(3)} ~ 2.2`);
});

test('you cannot jump more than `count` times before landing', () => {
  const p = createPlayer({ x: 0, y: 0, z: 0 });
  let held = false;
  let jumps = 0;
  for (let i = 0; i < 400; i++) {
    // Mash jump every other tick (release between to make edges).
    held = !held;
    const before = p.jumpsUsed;
    updatePlayer(p, { jump: held }, TIMESTEP, FLAT);
    if (p.jumpsUsed > before) jumps++;
    if (p.grounded && i > 5) break;
  }
  assert.equal(jumps, tuning.jump.count, `performed ${jumps} jumps, cap ${tuning.jump.count}`);
});

test('coyote time: you can still jump shortly after walking off a ledge', () => {
  const p = createPlayer({ x: 0, y: 0.001, z: 0 });
  p.grounded = true;
  // Walk off: no solid below now, no jump pressed yet.
  const air = { groundY: -1000, solidBelow: false };
  updatePlayer(p, { jump: false }, TIMESTEP, air); // leaves ground → coyote starts
  assert.ok(!p.grounded && p.coyote > 0, 'coyote grace active');
  // Now press jump within the window → first jump fires despite being airborne.
  updatePlayer(p, { jump: true }, TIMESTEP, air);
  assert.equal(p.jumpsUsed, 1, 'coyote allowed the first jump');
});

test('jump buffer: a press just before landing fires on touchdown', () => {
  const p = createPlayer({ x: 0, y: 0.05, z: 0 });
  p.grounded = false;
  p.vel.y = -3;
  // Press jump while still just above ground (buffered).
  updatePlayer(p, { jump: true }, TIMESTEP, FLAT); // still airborne this tick, lands
  // If it landed this tick, the buffered press should convert to a jump within buffer window.
  let jumped = p.jumpsUsed > 0;
  for (let i = 0; i < 6 && !jumped; i++) {
    updatePlayer(p, { jump: true }, TIMESTEP, FLAT);
    jumped = p.jumpsUsed > 0;
  }
  assert.ok(jumped, 'buffered jump fired around landing');
});

test('ground speed caps at maxGroundSpeed', () => {
  const p = createPlayer({ x: 0, y: 0, z: 0 });
  for (let i = 0; i < 120; i++) updatePlayer(p, { f: 1 }, TIMESTEP, FLAT);
  const speed = Math.hypot(p.vel.x, p.vel.z);
  assert.ok(speed <= tuning.move.maxGroundSpeed + 1e-6, `speed ${speed} <= cap`);
  assert.ok(speed > tuning.move.maxGroundSpeed - 0.5, 'reaches near the cap');
});

test('diagonal input is not faster than cardinal', () => {
  const a = createPlayer(); for (let i = 0; i < 120; i++) updatePlayer(a, { f: 1 }, TIMESTEP, FLAT);
  const b = createPlayer(); for (let i = 0; i < 120; i++) updatePlayer(b, { f: 1, s: 1 }, TIMESTEP, FLAT);
  const sa = Math.hypot(a.vel.x, a.vel.z), sb = Math.hypot(b.vel.x, b.vel.z);
  assert.ok(Math.abs(sa - sb) < 0.5, `cardinal ${sa} ~ diagonal ${sb}`);
});

test('moveBasis at yaw 0 points forward toward -Z', () => {
  const b = moveBasis(0);
  assert.ok(Math.abs(b.forward.x) < 1e-9 && Math.abs(b.forward.z + 1) < 1e-9, 'forward is -Z');
  assert.ok(Math.abs(b.right.x - 1) < 1e-9 && Math.abs(b.right.z) < 1e-9, 'right is +X');
});

test('air acceleration is weaker than ground acceleration', () => {
  // One tick of input from rest: ground gains more horizontal speed than air.
  const g = createPlayer({ x: 0, y: 0, z: 0 }); g.grounded = true;
  updatePlayer(g, { f: 1 }, TIMESTEP, FLAT);
  const air = createPlayer({ x: 0, y: 50, z: 0 }); air.grounded = false;
  updatePlayer(air, { f: 1 }, TIMESTEP, { groundY: 0, solidBelow: true });
  assert.ok(Math.hypot(g.vel.x, g.vel.z) > Math.hypot(air.vel.x, air.vel.z), 'ground accelerates faster');
});
