import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAttack, canAttack, stepMelee, meleeHitbox, aabbOverlap, resolveMeleeHits, attackVisualView,
  ATTACK_PHASE,
} from '../src/sim/melee.js';
import { FACING } from '../src/sim/player.js';
import { WEAPONS, BARE_HANDS } from '../src/sim/equipment.js';

const wpn = WEAPONS['short-blade']; // cooldownTicks 10, reach 18

test('melee: attack starts on press, goes active, then cools down', () => {
  const atk = createAttack();
  assert.ok(canAttack(atk));
  let r = stepMelee(atk, { attackPressed: true }, wpn);
  assert.ok(r.started && r.hitActive);
  assert.equal(atk.phase, ATTACK_PHASE.ACTIVE);
  // Cannot start again mid-swing / during cooldown.
  assert.ok(!canAttack(atk));
});

test('melee: active window lasts a few ticks then returns to idle, cooldown blocks re-fire', () => {
  const atk = createAttack();
  stepMelee(atk, { attackPressed: true }, wpn);
  let activeTicks = 1;
  for (let i = 0; i < 6; i++) {
    const r = stepMelee(atk, { attackPressed: false }, wpn);
    if (r.hitActive) activeTicks++;
  }
  assert.ok(activeTicks >= 3 && activeTicks <= 5, `active window ${activeTicks}`);
  assert.equal(atk.phase, ATTACK_PHASE.IDLE);
  // Still on cooldown (10 ticks total) so a press here does not start.
  const r = stepMelee(atk, { attackPressed: true }, wpn);
  assert.ok(!r.started);
});

test('melee: cooldown expires after weapon.cooldownTicks and allows re-fire', () => {
  const atk = createAttack();
  stepMelee(atk, { attackPressed: true }, wpn);
  for (let i = 0; i < wpn.cooldownTicks; i++) stepMelee(atk, { attackPressed: false }, wpn);
  assert.ok(canAttack(atk));
  const r = stepMelee(atk, { attackPressed: true }, wpn);
  assert.ok(r.started);
});

test('melee: hitbox is placed in front by facing and weapon reach', () => {
  const right = meleeHitbox({ x: 100, y: 100, facing: FACING.RIGHT }, wpn);
  assert.equal(right.x, 100 + 8);        // body halfW
  assert.equal(right.w, wpn.reach);
  const left = meleeHitbox({ x: 100, y: 100, facing: FACING.LEFT }, wpn);
  assert.equal(left.x, 100 - 8 - wpn.reach);
  assert.equal(left.w, wpn.reach);
  // Bare hands reaches barely past the body.
  const bare = meleeHitbox({ x: 100, y: 100, facing: FACING.RIGHT }, BARE_HANDS);
  assert.ok(bare.w < right.w);
});

test('melee: aabbOverlap basic truth table', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.ok(aabbOverlap(a, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!aabbOverlap(a, { x: 20, y: 0, w: 5, h: 5 }));
  assert.ok(!aabbOverlap(a, { x: 0, y: 20, w: 5, h: 5 }));
});

test('melee: a single swing hits each target at most once', () => {
  const atk = createAttack();
  stepMelee(atk, { attackPressed: true }, wpn); // active
  const hb = meleeHitbox({ x: 100, y: 100, facing: FACING.RIGHT }, wpn);
  const targets = [
    { id: 'e1', aabb: { x: 110, y: 90, w: 16, h: 20 } },  // in reach
    { id: 'e2', aabb: { x: 400, y: 90, w: 16, h: 20 } },  // far away
  ];
  const first = resolveMeleeHits(atk, hb, targets);
  assert.deepEqual(first.map((t) => t.id), ['e1']);
  // Same swing, next active tick: e1 already logged, not struck again.
  stepMelee(atk, { attackPressed: false }, wpn);
  const second = resolveMeleeHits(atk, hb, targets);
  assert.equal(second.length, 0);
});

test('melee: no hits resolve when not in the active phase', () => {
  const atk = createAttack();
  const hb = meleeHitbox({ x: 100, y: 100, facing: FACING.RIGHT }, wpn);
  const targets = [{ id: 'e1', aabb: { x: 110, y: 90, w: 16, h: 20 } }];
  assert.equal(resolveMeleeHits(atk, hb, targets).length, 0);
});

test('melee visual: no arc exists without an attack and cooldown alone never shows one', () => {
  const atk = createAttack();
  assert.deepEqual(attackVisualView(atk), { active: false, frame: -1 });
  atk.cooldown = 5;
  stepMelee(atk, { attackPressed: false }, wpn);
  assert.deepEqual(attackVisualView(atk), { active: false, frame: -1 });
});

test('melee visual: four held frames advance in order and expire independently of mechanics', () => {
  const atk = createAttack();
  stepMelee(atk, { attackPressed: true }, wpn);
  const frames = [attackVisualView(atk).frame];
  while (attackVisualView(atk).active) {
    stepMelee(atk, { attackPressed: false }, wpn);
    if (attackVisualView(atk).active) frames.push(attackVisualView(atk).frame);
  }
  assert.deepEqual(frames, [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(attackVisualView(atk), { active: false, frame: -1 });
});

test('melee visual: identical inputs reproduce identical visual frames and attack state', () => {
  function run() {
    const atk = createAttack();
    const out = [];
    for (let tick = 0; tick < 24; tick++) {
      stepMelee(atk, { attackPressed: tick === 0 || tick === 12 }, wpn);
      out.push({ ...attackVisualView(atk), phase: atk.phase, cooldown: atk.cooldown });
    }
    return out;
  }
  assert.deepEqual(run(), run());
});
