// node --test — autosave/resume + save-round-trip determinism (stack law). No WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce, advanceSphere, resolveDraft, applyDamage } from '../src/sim/world.js';
import { serializeWorld, deserializeWorld, tryDeserialize, SAVE_VERSION } from '../src/sim/save.js';
import { DebugLog } from '../src/engine/debuglog.js';

// A deterministic input tape so the round-trip exercises real motion, not idle.
function inputAt(tick) {
  const jump = tick % 37 === 0;           // periodic hops
  const f = ((tick >> 5) & 1) ? 1 : -1;   // oscillate forward/back
  const s = ((tick >> 6) & 1) ? 1 : 0;    // occasional strafe
  const yaw = Math.sin(tick * 0.01);      // slow turn
  return { f, s, jump, yaw };
}

function hashRun(world, n) {
  let h = '';
  for (let i = 0; i < n; i++) {
    stepOnce(world, inputAt(world.tick));
    const p = world.player.pos;
    h += `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)};`;
  }
  return h;
}

test('save/restore round-trips exact player + clock state', () => {
  const w = createWorld(1234);
  for (let i = 0; i < 200; i++) stepOnce(w, inputAt(w.tick));
  const saved = serializeWorld(w);
  const r = deserializeWorld(saved);
  assert.equal(r.tick, w.tick);
  assert.deepEqual(r.player.pos, w.player.pos);
  assert.deepEqual(r.player.vel, w.player.vel);
  assert.equal(r.player.jumpsUsed, w.player.jumpsUsed);
  assert.deepEqual(r.rng.save(), w.rng.save());
});

test('save-round-trip determinism: next 500 ticks are byte-identical after a reload', () => {
  const a = createWorld(99);
  for (let i = 0; i < 137; i++) stepOnce(a, inputAt(a.tick)); // run mid-run

  // Branch 1: keep simulating.
  const saved = serializeWorld(a);
  const keepGoing = deserializeWorld(saved); // clone via save to avoid aliasing
  const hashNoReload = hashRun(keepGoing, 500);

  // Branch 2: serialize, reload, simulate the same 500.
  const reloaded = deserializeWorld(serializeWorld(deserializeWorld(saved)));
  const hashReload = hashRun(reloaded, 500);

  assert.equal(hashReload, hashNoReload, 'reload produces identical 500-tick trajectory');
});

test('a corrupt save falls back to null with a LOUD log entry (save-fuzz)', () => {
  const log = new DebugLog();
  assert.equal(tryDeserialize('{ not json', log), null);
  assert.equal(tryDeserialize({ v: 999 }, log), null);       // version skew
  assert.equal(tryDeserialize({ v: SAVE_VERSION }, log), null); // missing fields
  assert.ok(log.hasErrors(), 'each failure is loud');
});

test('tryDeserialize accepts a valid JSON string', () => {
  const w = createWorld(7);
  for (let i = 0; i < 50; i++) stepOnce(w, inputAt(w.tick));
  const json = JSON.stringify(serializeWorld(w));
  const r = tryDeserialize(json);
  assert.ok(r && r.tick === w.tick);
});

// M3: the save must round-trip live COMBAT state (enemies, HP, sparks, projectiles,
// firework) so a mid-fight reload is byte-identical for the next N ticks.
function combatInput(tick) {
  return { f: Math.sin(tick * 0.03), s: ((tick >> 5) & 1) ? 1 : -1, jump: tick % 29 === 0,
    fire: tick % 23 === 0, aimPitch: 0.2, yaw: Math.sin(tick * 0.02) };
}
function combatHash(world, n) {
  let h = '';
  for (let i = 0; i < n; i++) {
    stepOnce(world, combatInput(world.tick));
    const p = world.player.pos;
    h += `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}|hp${world.hp}|sc${world.stompChain}|`;
    for (const e of world.enemies) h += `${e.alive ? 1 : 0}:${e.pos.x.toFixed(4)},${e.pos.y.toFixed(4)};`;
    h += `spk${world.sparks.filter((s) => s.alive).length}#`;
  }
  return h;
}

test('save-round-trip determinism on an ENEMY sphere: combat state reloads byte-identical', () => {
  const a = createWorld(4, 1); // sphere 1 has enemies
  for (let i = 0; i < 200; i++) stepOnce(a, combatInput(a.tick)); // fight mid-sphere
  const saved = serializeWorld(a);
  assert.ok(saved.enemies.length > 0, 'enemies were serialized');

  const keepGoing = deserializeWorld(saved);
  const hashNoReload = combatHash(keepGoing, 300);
  const reloaded = deserializeWorld(serializeWorld(deserializeWorld(saved)));
  const hashReload = combatHash(reloaded, 300);
  assert.equal(hashReload, hashNoReload, 'reload reproduces the exact combat trajectory');
});

test('resume matrix: mid-i-frame + mid-air enemy/spark state restores exactly', () => {
  const w = createWorld(4, 1);
  for (let i = 0; i < 200; i++) stepOnce(w, combatInput(w.tick));
  const r = deserializeWorld(serializeWorld(w));
  assert.equal(r.hp, w.hp, 'HP restored');
  assert.ok(Math.abs(r.iframe - w.iframe) < 1e-9, 'i-frame timer restored');
  assert.equal(r.fragments, w.fragments, 'pip-fragments restored');
  assert.equal(r.firework.ammo.toFixed(4), w.firework.ammo.toFixed(4), 'firework ammo restored');
  assert.deepEqual(r.enemies.map((e) => e.alive), w.enemies.map((e) => e.alive), 'enemy alive-state restored');
  assert.deepEqual(r.enemies.map((e) => e.pos), w.enemies.map((e) => e.pos), 'enemy positions restored');
});

// M4: the run-structure state (drafted caprices, curated pool, the active draft offer, the
// ticket counters, and the terminal scorecard) must all survive a save/resume — including a
// mid-DRAFT save (save-fuzz fold: the resume matrix includes mid-draft).
test('save round-trips a drafted-caprice build (world.tune reconstructs)', () => {
  const w = createWorld(8, 1, ['spring-heels', 'iron-goat', 'double-clutch']);
  for (let i = 0; i < 120; i++) stepOnce(w, combatInput(w.tick));
  const r = deserializeWorld(serializeWorld(w));
  assert.deepEqual(r.caprices, w.caprices, 'caprice build restored');
  assert.equal(r.hpMax, w.hpMax, 'caprice-boosted max hearts restored');
  assert.equal(r.tune.jump.count, w.tune.jump.count, 'derived tuning (extra jump) reconstructs');
  assert.equal(r.tune.jump.baseHeight, w.tune.jump.baseHeight, 'derived jump height reconstructs');
  // And the next 200 ticks stay byte-identical under the caprice build.
  assert.equal(combatHash(deserializeWorld(serializeWorld(w)), 200), combatHash(deserializeWorld(serializeWorld(w)), 200));
});

test('resume matrix: a mid-DRAFT save resumes on the same offer', () => {
  const w = createWorld(8, 0, [], ['spring-heels', 'wide-boots', 'spare-pip', 'long-coyote']);
  advanceSphere(w); // enter the draft
  assert.equal(w.phase, 'draft');
  const r = deserializeWorld(serializeWorld(w));
  assert.equal(r.phase, 'draft', 'still drafting after reload');
  assert.deepEqual(r.draft.offer, w.draft.offer, 'the same three caprices are offered');
  assert.equal(r.draft.nextIndex, w.draft.nextIndex);
  assert.deepEqual(r.pool, w.pool, 'the curated pool survives');
  // Resolving the reloaded draft advances correctly.
  resolveDraft(r, 0);
  assert.equal(r.phase, 'play');
  assert.equal(r.sphereIndex, 1);
  assert.ok(r.caprices.includes(w.draft.offer[0]));
});

test('resume matrix: a DEAD run rebuilds its causal scorecard', () => {
  const w = createWorld(8, 3, ['spring-heels']);
  w.spheresCleared = 3;
  applyDamage(w, 99, { x: 0, z: 1 }, true, 'hopper');
  assert.equal(w.phase, 'dead');
  const r = deserializeWorld(serializeWorld(w));
  assert.equal(r.phase, 'dead');
  assert.ok(r.scorecard, 'scorecard rebuilt on load');
  assert.equal(r.scorecard.cause, 'hopper');
  assert.equal(r.scorecard.tickets.total, w.scorecard.tickets.total, 'ticket payout matches');
});
