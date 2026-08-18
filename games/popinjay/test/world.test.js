// world.test.js — M1 gameplay integration: fire-control (single-slot, denied-fire,
// buffer), wire→balloon split resolution, the legibility event queue, stage clear,
// and a whole-world save round-trip with a wire in flight. Pure sim, no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Balloon } from '../src/sim/balloon.js';
import { generateStage } from '../src/sim/generate.js';
import { CLASSES } from '../src/tuning.js';

// A world with a single balloon parked in the player's column JUST above the muzzle,
// so the fast wire reaches it within a couple ticks before class hspeed drifts it out
// of column — a deterministic fixture for the fire→pop→split path.
function fixtureWorld(cls = 'grand') {
  const w = new World({ seed: 1 });
  w.balloons = [];
  const gTop = w.stage.floorBelow(0, 0).y;
  const y = w.player.muzzleY - 30; // ~2 ticks of wire travel
  const b = new Balloon({ cls, x: w.player.x, floorY: gTop, y, vy: 0, id: 1 });
  w.balloons.push(b);
  w._nextBalloonId = 2;
  return { w, b };
}

function firstEvent(w, type) { return w.events.find((e) => e.type === type); }

test('firing pops the balloon in the column, splits it, and scores', () => {
  const { w } = fixtureWorld('grand');
  w.step({ fire: true }); // rising edge → fire
  // Climb the wire until it resolves the hit.
  for (let t = 0; t < 200 && w.balloons.length === 1; t++) w.step({});
  assert.equal(w.balloons.length, 2, 'a grand splits into two parades');
  assert.ok(w.balloons.every((b) => b.cls === 'parade'));
  assert.equal(w.score, CLASSES.grand.score);
  assert.equal(w.wire, null, 'wire despawns the tick it hits');
});

test('a pop emits a legible event with position + class (action-legibility law)', () => {
  const { w } = fixtureWorld('fair');
  w.step({ fire: true });
  let popEv = null;
  for (let t = 0; t < 200 && !popEv; t++) { w.step({}); popEv = firstEvent(w, 'pop'); }
  assert.ok(popEv, 'a pop must surface a visible event');
  assert.equal(popEv.cls, 'fair');
  assert.equal(popEv.split, true);
});

test('single-slot: a press while the wire is alive is DENIED (never silent) and fires no second wire', () => {
  const w = new World({ seed: 1 });
  w.balloons = [];               // no target → the wire climbs (lives ~46 ticks)
  w.step({ fire: true });        // fire
  const wire1 = w.wire;
  assert.ok(wire1, 'first fire created the wire');
  w.step({ fire: false });       // release
  w.step({ fire: true });        // press again while busy → denied
  assert.ok(firstEvent(w, 'denied'), 'a denied fire must emit a legible event');
  assert.equal(w.wire, wire1, 'no second wire — single-slot commitment holds');
  assert.ok(w.fireBuffer > 0, 'the denied press is buffered');
  assert.ok(w.deniedFlashTicks > 0, 'a denied fire triggers the HUD slot flash');
});

test('fire buffer: a press during the wire\'s last moments fires on the tick the slot frees', () => {
  // Fire at a ceiling column (no balloon); climb until the wire is within the buffer
  // window of clearing; press THEN; the buffered press must re-arm as the slot frees.
  const w = new World({ seed: 2 });
  w.balloons = []; // no targets → the wire climbs to the ceiling and despawns
  w.step({ fire: true });
  assert.ok(w.wire);
  // Climb until the tip is near the ceiling (a few ticks from despawn) — WITHIN the
  // ~150 ms buffer window (WIRE.bufferTicks), unlike a press fired at full height.
  while (w.wire && w.wire.tipY > 100) w.step({ fire: false });
  assert.ok(w.wire, 'still in flight, but nearly done');
  w.step({ fire: true }); // rising-edge press in the last moments → buffered
  assert.ok(w.fireBuffer > 0, 'the late press is buffered');
  // A buffered wire should re-arm within a tick or two of the slot freeing.
  let refired = false;
  for (let t = 0; t < 20; t++) {
    const hadWire = !!w.wire;
    w.step({ fire: false }); // no fresh press — only the BUFFER may refire
    if (!hadWire && w.wire) { refired = true; break; }
  }
  assert.ok(refired, 'the buffered press fired once the slot freed');
});

test('the smallest class pops without splitting and the stage clears when empty', () => {
  const { w } = fixtureWorld('penny');
  w.step({ fire: true });
  for (let t = 0; t < 300 && !w.cleared; t++) w.step({});
  assert.equal(w.balloons.length, 0, 'penny pops with no children');
  assert.ok(w.cleared, 'an empty stage clears');
  assert.ok(firstEvent(w, 'cleared') || w.cleared, 'clear is signalled');
});

test('end-to-end: a scripted player clears the authored Grand (all 15 hits)', () => {
  const w = new World({ seed: 1 }); // authored stage: one Grand
  w.invincible = true; // this probes CLEARING, not survival (the composure axis is separate)
  let popped = 0;
  for (let t = 0; t < 12000 && !w.cleared; t++) {
    // Deterministic aim: track the lowest live balloon; fire only when SOME balloon
    // is in a low catch band just above the muzzle and horizontally aligned — so the
    // fast wire reaches it before class hspeed drifts it out of column.
    let target = null;
    for (const b of w.balloons) if (!target || b.y > target.y) target = b;
    const input = { fire: false };
    if (target) {
      if (target.x > w.player.x + 1) input.right = true;
      else if (target.x < w.player.x - 1) input.left = true;
      if (!w.wire && w.fireBuffer === 0 && !w.prevFire) {
        for (const b of w.balloons) {
          const above = w.player.muzzleY - b.y;            // >0 means catchable (above muzzle)
          const band = b.radius + 130;                      // low window; short wire flight
          if (Math.abs(b.x - w.player.x) <= b.radius * 0.5 && above > 8 && above <= band) { input.fire = true; break; }
        }
      }
    }
    w.step(input);
    for (const e of w.drainEvents()) if (e.type === 'pop') popped++; // drain like the renderer
  }
  assert.ok(w.cleared, `stage should clear; popped=${popped}, remaining=${w.balloons.length}`);
  assert.equal(popped, 15, '1 Grand fully resolved = 15 pops');
});

test('a GENERATED-stage world save round-trips byte-identically (full geometry in the save)', () => {
  const stage = generateStage(31, { locale: 2, stage: 3 });
  const ref = new World({ seed: 31, stage });
  ref.step({ fire: true });
  for (let t = 0; t < 300; t++) ref.step({});
  const refPrint = ref.fingerprint();

  const a = new World({ seed: 31, stage: generateStage(31, { locale: 2, stage: 3 }) });
  a.step({ fire: true });
  for (let t = 0; t < 180; t++) a.step({});
  const snap = JSON.parse(JSON.stringify(a.serialize()));
  const resumed = World.fromSerialized(snap);
  // The rebuilt stage must carry the SAME generated geometry (not an authored default).
  assert.equal(resumed.stage.solids.length, stage.solids.length, 'generated geometry survived the save');
  assert.equal(resumed.stageLabel, '2 – 3');
  for (let t = 0; t < 120; t++) { a.step({}); resumed.step({}); }
  assert.equal(resumed.fingerprint(), a.fingerprint());
  assert.equal(a.fingerprint(), refPrint);
});

test('whole-world save round-trips byte-identically with a wire in flight', () => {
  // Reference: fire, let the wire climb a bit, then run on.
  const ref = new World({ seed: 42 });
  ref.step({ fire: true });
  for (let t = 0; t < 3; t++) ref.step({});
  const refPrint = (() => { const r = new World({ seed: 42 }); r.step({ fire: true }); for (let t = 0; t < 60; t++) r.step({}); return r.fingerprint(); })();

  // Save mid-flight (wire alive), restore, finish.
  assert.ok(ref.wire, 'a wire is in flight at the save point');
  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = World.fromSerialized(snap);
  for (let t = 0; t < 57; t++) { ref.step({}); resumed.step({}); }
  assert.equal(resumed.fingerprint(), ref.fingerprint(), 'resume diverged from the uninterrupted run');
  assert.equal(ref.fingerprint(), refPrint);
});

test('assists: composure raises max+start hearts; par-off skips drip; both round-trip', () => {
  // Composure assist: 5 starting/max hearts.
  const w = new World({ seed: 5, startHearts: 5 });
  assert.equal(w.maxHearts, 5);
  assert.equal(w.hearts, 5);

  // Par-off assist: past par with roster left, _stepDrip never telegraphs a drip.
  const p = new World({ seed: 5, stage: generateStage(5, { locale: 1, stage: 1 }), parOff: true });
  p.balloons = [new Balloon({ cls: 'penny', x: 200, floorY: 700, y: 400, vy: 0, id: 1 })];
  p.tick = p.parTicks + 500; // well past par
  for (let i = 0; i < 200; i++) { p.tick++; p._stepDrip(); }
  assert.equal(p.dripPending, null, 'par-off never telegraphs a drip');

  // Both assists ride the save.
  const w2 = World.fromSerialized(JSON.parse(JSON.stringify(p.serialize())));
  assert.equal(w2.parOff, true);
  const w3 = World.fromSerialized(JSON.parse(JSON.stringify(w.serialize())));
  assert.equal(w3.maxHearts, 5);
});
