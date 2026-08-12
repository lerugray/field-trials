// node --test — the CAPRICE engine (M4). The pool is pure data; computeMods folds an
// id list into mod deltas; deriveTuning bakes them into an effective tuning the sim
// reads. Critically, the EMPTY case must be byte-identical to base tuning (so the whole
// M1/M2/M3 determinism + golden-feel + save-round-trip battery stays green), and each
// caprice must actually move the number and the sim it targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPRICES, CAPRICE_BY_ID, identityMods, computeMods, deriveTuning, maxTierForSphere,
} from '../src/sim/caprices.js';
import { tuning, GRAVITY, TIMESTEP } from '../src/sim/tuning.js';
import { createPlayer, updatePlayer } from '../src/sim/player.js';
import { flatGround } from '../src/sim/islands.js';
import { createWorld, stepOnce } from '../src/sim/world.js';

test('pool is 16 caprices, unique ids, valid tiers, add-only shape', () => {
  assert.equal(CAPRICES.length, 16, 'v1 pool is 16 (studio fold)');
  const ids = new Set(CAPRICES.map((c) => c.id));
  assert.equal(ids.size, 16, 'ids unique (no duplicates draftable)');
  for (const c of CAPRICES) {
    assert.ok(c.name && c.desc, `${c.id} has a name + one-line desc`);
    assert.ok([0, 1, 2].includes(c.tier), `${c.id} tier is an act gate 0/1/2`);
    assert.ok(c.mods && typeof c.mods === 'object', `${c.id} carries a mods patch`);
    // Add-only law: no mod may REDUCE mobility. The only fields that could are speed/
    // height/jump/coyote muls (must be >= 1) or extraJumps (must be >= 0).
    const m = c.mods;
    for (const k of ['jumpHeightMul', 'airControlMul', 'moveSpeedMul', 'coyoteMul', 'stompRadiusMul', 'stompBounceMul', 'sparkRadiusMul', 'sparkPerKillMul']) {
      if (m[k] != null) assert.ok(m[k] >= 1, `${c.id}.${k} never reduces (${m[k]})`);
    }
    if (m.extraJumps != null) assert.ok(m.extraJumps >= 0, `${c.id} never removes jumps`);
  }
});

test('deriveTuning([]) is byte-identical to base tuning (no determinism perturbation)', () => {
  assert.deepEqual(deriveTuning([]), tuning);
  // And identityMods is the true no-op the fold folds onto.
  const idm = identityMods();
  assert.equal(idm.extraJumps, 0);
  assert.equal(idm.jumpHeightMul, 1);
  assert.equal(idm.podsThroughTerrain, false);
});

test('computeMods folds: multipliers multiply, adds add, booleans OR', () => {
  // Two hp-add caprices stack; two jump-height muls multiply.
  const m = computeMods(['spare-pip', 'iron-goat', 'spring-heels', 'sky-legs', 'bright-eyes']);
  assert.equal(m.hpMaxAdd, 3, '1 + 2 max hearts');
  assert.ok(Math.abs(m.jumpHeightMul - 1.12 * 1.3) < 1e-9, 'height muls multiply');
  assert.equal(m.podsThroughTerrain, true, 'bright-eyes flips the render flag');
  // Unknown ids are ignored (stale-save defensive).
  assert.deepEqual(computeMods(['nope', 'spare-pip']).hpMaxAdd, 1);
});

test('extra-jump caprices extend the chain (count + cumulative apexes)', () => {
  const t1 = deriveTuning(['double-clutch']);
  assert.equal(t1.jump.count, tuning.jump.count + 1, 'a fourth jump');
  assert.equal(t1.jump.heightMul.length, tuning.jump.heightMul.length + 1);
  assert.ok(t1.jump.heightMul[3] > t1.jump.heightMul[2], 'cumulative apex keeps escalating');
});

test('each mobility caprice actually changes its tuning field', () => {
  assert.ok(deriveTuning(['spring-heels']).jump.baseHeight > tuning.jump.baseHeight);
  assert.ok(deriveTuning(['feather-fall']).move.airAccelFrac > tuning.move.airAccelFrac);
  assert.ok(deriveTuning(['wide-boots']).enemies.contactRadius > tuning.enemies.contactRadius);
  assert.ok(deriveTuning(['long-coyote']).jump.coyoteMs > tuning.jump.coyoteMs);
  assert.ok(deriveTuning(['high-bounce']).stomp.bounceVel > tuning.stomp.bounceVel);
  assert.ok(deriveTuning(['fleet']).move.maxAirSpeed > tuning.move.maxAirSpeed);
  assert.ok(deriveTuning(['powder-keg']).firework.ammoMax === tuning.firework.ammoMax + 3);
  assert.ok(deriveTuning(['quick-mend']).hp.fragmentsPerPip === tuning.hp.fragmentsPerPip - 1);
  assert.ok(deriveTuning(['spark-magnet']).spark.collectRadius > tuning.spark.collectRadius);
  assert.ok(deriveTuning(['twin-spark']).spark.perKill === tuning.spark.perKill * 2);
  assert.ok(deriveTuning(['featherweight']).fall.netTollHp === tuning.fall.netTollHp - 1);
  assert.ok(deriveTuning(['iron-goat']).hp.pips === tuning.hp.pips + 2);
});

// Behavioral: a spring-heels jump reaches a higher apex than a bare jump under the
// SAME scripted input (proves the mod threads through the real player tick).
function jumpApex(tune) {
  const ground = flatGround(0);
  const p = createPlayer({ x: 0, y: 0, z: 0 });
  p.grounded = true;
  let held = false, maxY = 0;
  for (let i = 0; i < 120; i++) {
    const jump = !held && p.jumpsUsed === 0 && p.grounded;
    updatePlayer(p, { jump, f: 0, s: 0, yaw: 0 }, TIMESTEP, ground, GRAVITY, tune);
    held = jump;
    maxY = Math.max(maxY, p.pos.y);
    if (p.grounded && i > 5) break;
  }
  return maxY;
}

test('spring-heels raises the real jump apex; empty matches base exactly', () => {
  const base = jumpApex(deriveTuning([]));
  const baseRef = jumpApex(tuning);
  assert.equal(base, baseRef, 'empty-caprice apex identical to base tuning');
  assert.ok(jumpApex(deriveTuning(['spring-heels'])) > base * 1.08, 'higher leap');
});

test('createWorld bakes caprices: hpMax, firework ammo, world.tune, mods flag', () => {
  const w = createWorld(7, 0, ['iron-goat', 'powder-keg', 'bright-eyes']);
  assert.equal(w.hpMax, tuning.hp.pips + 2, 'iron-goat raised max hearts');
  assert.equal(w.hp, w.hpMax, 'start full');
  assert.equal(w.firework.ammo, tuning.firework.ammoMax + 3, 'powder-keg ammo');
  assert.equal(w.mods.podsThroughTerrain, true, 'render flag carried on world.mods');
  assert.equal(w.tune.hp.pips, tuning.hp.pips + 2);
  assert.deepEqual(w.caprices, ['iron-goat', 'powder-keg', 'bright-eyes']);
});

test('a caprice run stays deterministic tick-for-tick', () => {
  const caps = ['spring-heels', 'double-clutch', 'iron-goat'];
  const input = { f: 1, s: 0, jump: true, yaw: 0.3 };
  const a = createWorld(42, 0, caps); const b = createWorld(42, 0, caps);
  for (let i = 0; i < 200; i++) { stepOnce(a, input); stepOnce(b, input); }
  assert.deepEqual(a.player.pos, b.player.pos);
  assert.equal(a.hp, b.hp);
});

test('maxTierForSphere gates by act (3 acts of 3)', () => {
  assert.equal(maxTierForSphere(0), 0);
  assert.equal(maxTierForSphere(2), 0);
  assert.equal(maxTierForSphere(3), 1);
  assert.equal(maxTierForSphere(5), 1);
  assert.equal(maxTierForSphere(6), 2);
  assert.equal(maxTierForSphere(8), 2);
  assert.equal(CAPRICE_BY_ID['double-clutch'].tier, 1);
});
