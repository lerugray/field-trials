// finale.test.js — the PANIC FINALE (DESIGN-SEED §Panic Finale): survive 90 s of
// escalating balloon RAIN. No roster to clear — the clock is the win. Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { generateFinale } from '../src/sim/generate.js';
import { botPlay } from '../src/sim/bot.js';
import { FINALE } from '../src/tuning.js';

function finaleWorld(seed = 1) { return new World({ seed, stage: generateFinale() }); }

test('the finale rains balloons and NEVER clears by emptying (the clock is the win)', () => {
  const w = finaleWorld(); w.invincible = true;
  for (let t = 0; t < 600; t++) w.step({});
  assert.ok(w.balloons.length > 0, 'rain has accumulated');
  assert.equal(w.finaleWon, false, 'not yet won at 10 s');
  // Even if every balloon were popped, the finale is not "cleared" — rain resumes.
  w.balloons = [];
  w.step({});
  assert.equal(w.cleared, false, 'emptying balloons does not win the finale');
});

test('surviving the survival clock wins the finale', () => {
  const w = finaleWorld(); w.invincible = true;
  for (let t = 0; t < FINALE.survivalTicks + 2 && !w.finaleWon; t++) w.step({});
  assert.ok(w.finaleWon, 'survived the clock');
  assert.ok(w.cleared, 'a won finale ends the stage');
  assert.equal(w.tick >= FINALE.survivalTicks, true);
});

test('the rain ESCALATES (spawn interval shrinks toward the climax)', () => {
  // Clear balloons every tick so the airborne CAP never gates — this isolates the
  // spawn INTERVAL, which must shrink (more spawns late than early).
  const w = finaleWorld(2); w.invincible = true;
  let firstWindow = 0, lateWindow = 0;
  for (let t = 0; t < FINALE.survivalTicks; t++) {
    const before = w._nextBalloonId; w.step({}); const spawned = w._nextBalloonId - before;
    if (t < 10 * 60) firstWindow += spawned;
    if (t > FINALE.survivalTicks - 10 * 60) lateWindow += spawned;
    w.balloons = []; // keep below the cap so only the interval governs
  }
  assert.ok(lateWindow > firstWindow, `rain escalates (early ${firstWindow} < late ${lateWindow})`);
});

test('the finale is winnable: an (invincible) bot survives the full clock', () => {
  const w = finaleWorld(3); // botPlay sets invincible — proves the stage ENDS, i.e. is survivable
  const r = botPlay(w, FINALE.survivalTicks + 100);
  assert.ok(r.cleared, 'the finale resolves (won) within the clock');
  assert.ok(w.finaleWon);
});

test('ENDLESS PANIC never wins on the clock (runs until a downing)', () => {
  const w = new World({ seed: 3, stage: generateFinale({ endless: true }) });
  w.invincible = true;
  for (let t = 0; t < FINALE.survivalTicks + 600; t++) w.step({}); // well past the 90 s mark
  assert.equal(w.finaleWon, false, 'endless has no clock win');
  assert.equal(w.cleared, false, 'endless never "clears"');
  assert.ok(w.tick > FINALE.survivalTicks, 'it kept running past the normal clock');
});

test('finale state round-trips byte-identically mid-storm', () => {
  const ref = finaleWorld(7); ref.invincible = true;
  for (let t = 0; t < 900; t++) ref.step({});
  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = World.fromSerialized(snap); resumed.invincible = true;
  for (let t = 0; t < 300; t++) { ref.step({}); resumed.step({}); }
  assert.equal(resumed.fingerprint(), ref.fingerprint());
});
