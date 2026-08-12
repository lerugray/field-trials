import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, PLAYER_HALF, FACING } from '../src/sim/player.js';
import { createTilemap } from '../src/sim/tilemap.js';
import { FEEL } from '../src/config/feel.js';

// 12×8 stage: floor on the bottom row, a wall column at tx=8 rising 3 tiles.
const MAP = createTilemap([
  '............',
  '............',
  '............',
  '............',
  '........#...',
  '........#...',
  '........#...',
  '############',
]);
const world = { tilemap: MAP, body: PLAYER_HALF };
const FLOOR_FEET = 7 * 16; // top of the floor row

function settle(p, ticks = 20, intent = {}) {
  for (let i = 0; i < ticks; i++) stepPlayer(p, intent, world);
  return p;
}

test('player-tile: falls and lands grounded on the floor', () => {
  const p = createPlayer(32, 0);
  settle(p, 40);
  assert.ok(p.onGround);
  assert.equal(p.y, FLOOR_FEET);
  assert.ok(Math.abs(p.vy) < 1e-6);
});

test('player-tile: walks along the floor staying grounded', () => {
  const p = createPlayer(32, FLOOR_FEET);
  settle(p, 5); // ensure grounded
  const x0 = p.x;
  for (let i = 0; i < 10; i++) stepPlayer(p, { moveDir: 1 }, world);
  assert.ok(p.x > x0, 'moved right');
  assert.ok(p.onGround, 'stayed grounded while walking');
  assert.equal(p.y, FLOOR_FEET);
});

test('player-tile: walking into a wall stops horizontal progress', () => {
  const p = createPlayer(96, FLOOR_FEET); // just left of the wall at tx8 (x=128)
  settle(p, 3);
  for (let i = 0; i < 60; i++) stepPlayer(p, { moveDir: 1 }, world);
  // Wall left face is at x=128; player right edge (x+halfW) can't pass it.
  assert.ok(p.x + PLAYER_HALF.halfW <= 128 + 1e-6, `player x ${p.x} passed the wall`);
});

test('player-tile: jump rises off the floor then returns to it', () => {
  const p = createPlayer(32, FLOOR_FEET);
  settle(p, 3);
  let minY = p.y;
  let leftGround = false;
  for (let t = 0; t < 60; t++) {
    stepPlayer(p, { jumpPressed: t === 0, jumpHeld: t < 16 }, world);
    if (!p.onGround) leftGround = true;
    minY = Math.min(minY, p.y);
  }
  assert.ok(leftGround, 'left the ground during the jump');
  assert.ok(FLOOR_FEET - minY > 30, `apex height ${(FLOOR_FEET - minY).toFixed(1)} too low`);
  assert.ok(p.onGround, 'landed again');
  assert.equal(p.y, FLOOR_FEET);
});

test('player-tile: deterministic trajectory for identical inputs', () => {
  function run() {
    const p = createPlayer(32, FLOOR_FEET);
    const trace = [];
    for (let t = 0; t < 40; t++) {
      stepPlayer(p, { moveDir: 1, jumpPressed: t === 5, jumpHeld: t >= 5 && t < 18 }, world);
      trace.push([p.x, p.y, p.vy]);
    }
    return trace;
  }
  assert.deepEqual(run(), run());
});

test('player-tile: horizontal wall contact does not refresh air jump', () => {
  const p = createPlayer(110, FLOOR_FEET); // close to wall left face at x=128
  settle(p, 3);
  assert.ok(p.onGround);

  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true, moveDir: 1 }, world);
  assert.ok(!p.onGround);

  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true, moveDir: 1 }, world);
  assert.equal(p.airJumpUsed, true);
  assert.equal(p.airJumped, true);

  let sawWallWhileAirborne = false;
  for (let t = 0; t < 40; t++) {
    stepPlayer(p, { moveDir: 1, jumpHeld: true, doubleJump: true }, world);
    if (p.onGround) break;
    if (p.x + PLAYER_HALF.halfW >= 128 - 1e-6) {
      sawWallWhileAirborne = true;
      assert.equal(p.airJumpUsed, true, 'wall contact must not clear airJumpUsed');
      break;
    }
  }
  assert.ok(sawWallWhileAirborne, 'must contact wall while airborne');
  assert.ok(!p.onGround, 'still airborne after wall contact');

  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true, moveDir: 1 }, world);
  assert.equal(p.airJumped, false);
  assert.equal(p.airJumpUsed, true);
  assert.notEqual(p.vy, -FEEL.JUMP_VELOCITY + FEEL.GRAVITY);
});
