// souvenir.test.js — the weapon-class souvenirs (DESIGN-SEED catalog): Second Barrel,
// Quick Spool, Sky Anchor, Gallery Sidearm, Long Fuse. All strictly ADDITIVE. Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Balloon } from '../src/sim/balloon.js';
import { Drop } from '../src/sim/drop.js';
import { generateStage } from '../src/sim/generate.js';
import { botPlay } from '../src/sim/bot.js';
import { SIDEARM, SKY_ANCHOR_TICKS, DYNAMITE } from '../src/tuning.js';

function emptyWorld() { const w = new World({ seed: 1 }); w.balloons = []; return w; }
function sawPop(w) { return w.drainEvents().some((e) => e.type === 'pop'); }

test('Second Barrel: two wires can be live at once; a third press is denied', () => {
  const w = emptyWorld(); w.equip('secondBarrel');
  w.step({ fire: true });                       // wire 1
  assert.equal(w.wires.length, 1);
  w.step({ fire: false }); w.step({ fire: true }); // wire 2
  assert.equal(w.wires.length, 2);
  w.step({ fire: false }); w.step({ fire: true }); // slots full → denied
  assert.equal(w.wires.length, 2, 'no third wire');
  assert.ok(w.drainEvents().some((e) => e.type === 'denied'));

  // Without the souvenir a second press is denied (baseline single-slot).
  const b = emptyWorld();
  b.step({ fire: true }); b.step({ fire: false }); b.step({ fire: true });
  assert.equal(b.wires.length, 1);
});

test('Quick Spool: the wire reaches the ceiling faster (40%)', () => {
  const time = (qs) => { const w = emptyWorld(); if (qs) w.equip('quickSpool'); w.step({ fire: true }); let t = 0; while (w.wires.length && t < 500) { w.step({}); t++; } return t; };
  assert.ok(time(true) < time(false), 'quick spool clears its wire sooner');
});

test('Sky Anchor: the wire persists as a WALL at the ceiling, popping balloons, then despawns', () => {
  const w = emptyWorld(); w.equip('skyAnchor');
  w.step({ fire: true });
  for (let t = 0; t < 60; t++) w.step({});
  assert.equal(w.wires.length, 1, 'the wire persists past the ceiling');
  assert.ok(w.wires[0].anchored, 'it is anchored as a wall');
  // A balloon entering its column gets popped by the standing wall.
  w.balloons = [new Balloon({ cls: 'penny', x: w.player.x, floorY: 700, y: 400, vy: 0, id: 99 })];
  let popped = false;
  for (let t = 0; t < 20 && !popped; t++) { w.step({}); if (sawPop(w)) popped = true; }
  assert.ok(popped, 'the anchored wall pops a balloon in its column');
  // It despawns once its ~4 s timer runs out.
  for (let t = 0; t < SKY_ANCHOR_TICKS + 5; t++) w.step({});
  assert.equal(w.wires.length, 0, 'the anchored wire eventually clears');
});

test('Gallery Sidearm: X fires a limited pop-gun that passes THROUGH platforms', () => {
  const w = emptyWorld(); w.equip('gallerySidearm');
  assert.equal(w.sidearmAmmo, SIDEARM.ammo, 'reloads to 6 at entry');
  // Fire from UNDER the low platform at a balloon ABOVE it — the bullet (no wall) passes
  // through. A Grand (wide, slow-drifting) so the fast bullet reliably meets it.
  w.player.x = 300; // under plat-lo (a wire would stop at the underside)
  w.balloons = [new Balloon({ cls: 'grand', x: 300, floorY: 700, y: 200, vy: 0, id: 1 })];
  w.step({ sidearm: true });
  assert.equal(w.sidearmAmmo, SIDEARM.ammo - 1, 'a shot spent one round');
  let popped = false;
  for (let t = 0; t < 40 && !popped; t++) { w.step({}); if (sawPop(w)) popped = true; }
  assert.ok(popped, 'the sidearm popped a balloon above the platform (passed through)');
});

test('Gallery Sidearm ammo is capped per stage (no infinite fire)', () => {
  const w = emptyWorld(); w.equip('gallerySidearm'); w.sidearmAmmo = 2;
  w.step({ sidearm: true }); w.step({ sidearm: false });
  w.step({ sidearm: true }); w.step({ sidearm: false });
  w.step({ sidearm: true }); // third press — no ammo
  assert.equal(w.sidearmAmmo, 0, 'ammo cannot go negative / fire past the cap');
});

test('Long Fuse: the dynamite cascade takes longer (a pause beat between steps)', () => {
  const duration = (lf) => {
    const w = new World({ seed: 1 }); w.invincible = true; if (lf) w.equip('longFuse');
    w.drops = [new Drop({ kind: 'dynamite', x: w.player.x, y: w.player.feetY - 10, id: 1 })];
    let t = 0; while ((w.dynamiteFuse > 0 || w.cascading || t === 0) && t < 3000) { w.step({}); t++; }
    return t;
  };
  assert.ok(duration(true) > duration(false), 'long fuse spaces the cascade out');
});

test('ADDITIVE law: a stage clearable without souvenirs stays clearable with any of them', () => {
  const seed = 17, loc = 2, st = 3;
  for (const souv of [null, 'secondBarrel', 'quickSpool', 'skyAnchor', 'gallerySidearm', 'longFuse']) {
    const w = new World({ seed, stage: generateStage(seed, { locale: loc, stage: st }) });
    if (souv) w.equip(souv);
    const r = botPlay(w, 30000);
    assert.ok(r.cleared, `clearable with ${souv || 'no souvenir'}`);
  }
});

test('souvenir + weapon state round-trips byte-identically in the save', () => {
  const ref = emptyWorld();
  ref.equip('secondBarrel').equip('quickSpool').equip('gallerySidearm');
  ref.step({ fire: true, sidearm: true });
  ref.balloons = [new Balloon({ cls: 'grand', x: ref.player.x, floorY: 700, y: 300, vy: 0, id: 5 })];
  for (let t = 0; t < 6; t++) ref.step({});
  const snap = JSON.parse(JSON.stringify(ref.serialize()));
  const resumed = World.fromSerialized(snap);
  assert.deepEqual([...resumed.souvenirs].sort(), [...ref.souvenirs].sort());
  for (let t = 0; t < 60; t++) { ref.step({}); resumed.step({}); }
  assert.equal(resumed.fingerprint(), ref.fingerprint());
});
