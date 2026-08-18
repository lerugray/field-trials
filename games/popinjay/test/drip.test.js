// drip.test.js — the closing-bell DRIP contract (DESIGN-SEED §Stage pressure):
// past-par only, telegraphed, capped, anti-camp, and CONVERGENT (drip can never make
// a stage uncleanable). Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { generateStage } from '../src/sim/generate.js';
import { botPlay } from '../src/sim/bot.js';
import { DRIP } from '../src/tuning.js';

function idleWorld(seed, loc, st, parTicks) {
  const w = new World({ seed, stage: generateStage(seed, { locale: loc, stage: st }) });
  if (parTicks != null) w.parTicks = parTicks;
  w.invincible = true; // these probe DRIP mechanics, not the survival axis
  return w;
}

test('no drip before par; past par it TELEGRAPHS, then spawns capped Penny drips', () => {
  const w = idleWorld(1, 2, 2, 60);
  for (let t = 0; t < 60; t++) w.step({}); // up to par, idle (roster never clears)
  assert.equal(w.dripCount, 0, 'no drip before par');
  assert.equal(w.dripPending, null);

  let sawTelegraph = false;
  for (let t = 0; t < 4000 && w.dripCount < DRIP.maxPerStage; t++) { w.step({}); if (w.dripPending) sawTelegraph = true; }
  assert.ok(sawTelegraph, 'a drip is telegraphed before it appears');
  assert.equal(w.dripCount, DRIP.maxPerStage, 'drip caps at maxPerStage');
  assert.ok(w.balloons.filter((b) => b.drip).every((b) => b.cls === 'penny'), 'drips are Pennies');

  for (let t = 0; t < 2000; t++) w.step({});
  assert.equal(w.dripCount, DRIP.maxPerStage, 'never exceeds the cap');
});

test('drip enters at HALF speed (an entry window) targeting the player\'s half (anti-camp)', () => {
  for (const [px, sidePredicate] of [[120, (x) => x < 640], [1160, (x) => x > 640]]) {
    const w = idleWorld(2, 2, 2, 30);
    w.player.x = px;
    let tx = null, entry = null;
    for (let t = 0; t < 4000 && tx == null; t++) {
      w.step({});
      w.player.x = px; // hold the camp position
      if (w.dripCount > 0) { const d = w.balloons.find((b) => b.drip); if (d) { tx = d.x; entry = d.entryTicks; } }
    }
    assert.ok(tx != null, 'a drip spawned');
    assert.ok(sidePredicate(tx), `drip targeted the player's half (px=${px}, dripx=${tx})`);
    assert.ok(entry > 0 && entry <= DRIP.entryTicks, 'drip has a half-speed entry window');
  }
});

test('CONVERGENCE: once the seeded roster is cleared, drip STOPS (cap never grows)', () => {
  const w = idleWorld(3, 1, 2, 30);
  for (let t = 0; t < 2500 && w.dripCount < 2; t++) w.step({}); // let a couple drips appear
  const before = w.dripCount;
  assert.ok(before >= 1, 'some drip happened');
  // Simulate the roster lineage cleared (only drip Pennies remain).
  w.balloons = w.balloons.filter((b) => b.drip);
  w.step({}); // process the roster-clear: any pending telegraph is cancelled
  assert.equal(w.dripPending, null, 'a pending drip cancels when the roster clears');
  for (let t = 0; t < 2000; t++) w.step({});
  assert.equal(w.dripCount, before, 'no new drips after the roster is cleared');
});

test('the bot still clears a stage forced past par (convergence under pressure)', () => {
  const w = new World({ seed: 5, stage: generateStage(5, { locale: 2, stage: 3 }) });
  w.parTicks = 60; // force closing-bell pressure almost immediately
  const r = botPlay(w, 30000);
  assert.ok(r.cleared, 'the bot clears despite drip pressure');
  assert.ok(w.dripCount > 0, 'drip actually fired during the run');
});

test('drip state (incl. a mid-telegraph) round-trips byte-identically in the save', () => {
  // A low-par teaching stage so idle play crosses par quickly (par rides in the save).
  const mk = () => { const w = new World({ seed: 4, stage: generateStage(4, { locale: 1, stage: 1 }) }); w.invincible = true; return w; };
  const ref = mk();
  // Run until a drip has fired (well past the derived teaching par).
  for (let t = 0; t < 4000 && ref.dripCount < 1; t++) ref.step({});
  assert.ok(ref.dripCount >= 1, 'a drip fired before the save point');
  const refPrint = (() => { const r = mk(); for (let t = 0; t < ref.tick + 200; t++) r.step({}); return r.fingerprint(); })();

  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = World.fromSerialized(snap);
  resumed.invincible = true; // match ref (invincible is a runtime flag, not serialized)
  assert.equal(resumed.dripCount, ref.dripCount, 'drip count survived the save');
  for (let t = 0; t < 200; t++) { ref.step({}); resumed.step({}); }
  assert.equal(resumed.fingerprint(), ref.fingerprint(), 'resume diverged with drip active');
  assert.equal(ref.fingerprint(), refPrint);
});
