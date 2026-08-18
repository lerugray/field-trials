// draft.test.js — the souvenir DRAFT rules (DESIGN-SEED §The loop / draft mechanics)
// + the clean stat effects wired this increment. Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Run, DRAFT_SIZE } from '../src/sim/run.js';
import { World } from '../src/sim/world.js';
import { Drop } from '../src/sim/drop.js';
import { Balloon } from '../src/sim/balloon.js';
import { CATALOG, CATALOG_BY_ID, isWeapon } from '../src/sim/catalog.js';
import { PLAYER, CHAIN, DROPS, DRIP } from '../src/tuning.js';

function onPlayer(w, id = 1) { const gTop = w.stage.floorBelow(0, 0).y; return new Balloon({ cls: 'grand', x: w.player.x, floorY: gTop, y: w.player.feetY - 20, vy: 0, id }); }

test('a draft offers DRAFT_SIZE distinct, implemented, tier-eligible, unowned souvenirs', () => {
  const r = new Run({ seed: 3 });
  const offer = r.offerDraft().map((c) => c.id);
  assert.equal(offer.length, DRAFT_SIZE);
  assert.equal(new Set(offer).size, DRAFT_SIZE, 'no duplicates in an offer');
  for (const id of offer) {
    const c = CATALOG_BY_ID[id];
    assert.ok(c.implemented, `${id} is implemented`);
    assert.ok(c.tier <= r.locale, `${id} tier-eligible`);
  }
});

test('locale-1 offers guarantee at least one weapon-class (bad-luck floor)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = new Run({ seed });
    const offer = r.offerDraft().map((c) => c.id);
    assert.ok(offer.some(isWeapon), `seed ${seed} locale-1 offer has a weapon`);
  }
});

test('drafts are deterministic and never re-offer an owned souvenir', () => {
  const a = new Run({ seed: 9 }); const o1 = a.offerDraft().map((c) => c.id);
  const b = new Run({ seed: 9 }); const o2 = b.offerDraft().map((c) => c.id);
  assert.deepEqual(o1, o2, 'same run state → same offer');
  a.draftPick(o1[0]);
  const o3 = a.offerDraft().map((c) => c.id);
  assert.ok(!o3.includes(o1[0]), 'a drafted souvenir leaves the pool');
});

test('draftPick adds to the loadout; decline grants nothing', () => {
  const r = new Run({ seed: 1 });
  const offer = r.offerDraft().map((c) => c.id);
  r.draftPick(offer[0]);
  assert.deepEqual(r.souvenirs, [offer[0]]);
  const before = r.souvenirs.length;
  r.offerDraft(); r.draftDecline();
  assert.equal(r.souvenirs.length, before, 'declining adds nothing');
});

test('effect — Plume Hat gives +1 filled heart; Shield Charm starts shielded', () => {
  const w = new World({ seed: 1 }).equip('plumeHat').equip('shieldCharm');
  assert.equal(w.hearts, PLAYER.hearts + 1);
  assert.equal(w.shield, true);
});

test('effect — Ribbon Chain widens the chain window by 30 ticks', () => {
  const base = new World({ seed: 1 });
  const rib = new World({ seed: 1 }).equip('ribbonChain');
  assert.equal(rib.chainWindow(), base.chainWindow() + 30);
  assert.equal(base.chainWindow(), CHAIN.windowTicks);
});

test('effect — Confetti Bonus adds 50% medallion score', () => {
  const w = new World({ seed: 1 }).equip('confettiBonus'); // keep the roster so no clear-bonus fires
  w.drops = [new Drop({ kind: 'medallion', x: w.player.x, y: w.player.feetY - 10, id: 1 })];
  w.step({});
  assert.equal(w.score, Math.round(DROPS.medallionScore * 1.5));
});

test('effect — Bell Credit extends par 15%; Season Pass + Punctual pay extra tickets', () => {
  const withBell = new World({ seed: 1, stage: undefined });
  const base = withBell.parTicks;
  withBell.equip('bellCredit');
  assert.equal(withBell.parTicks, Math.round(base * 1.15));

  // Season Pass: +1 ticket per clear. Punctual: +2 when cleared under par.
  const r = new Run({ seed: 1 }); r.souvenirs = ['seasonPass', 'punctual'];
  const cleared = new World({ seed: 1 }); cleared.score = 100; cleared.pops = 5; cleared.tick = 10; cleared.parTicks = 6000;
  const before = r.tickets;
  r.clearStage(cleared);
  // locale-1 base 1 + seasonPass 1 + punctual 2 = 4.
  assert.equal(r.tickets - before, 1 + 1 + 2);
});

test('effect — Soft Landing zeroes knockback; Sure Feet lengthens i-frames + shields ladders', () => {
  const soft = new World({ seed: 1 }).equip('softLanding');
  soft.balloons = [onPlayer(soft)];
  soft.step({});
  assert.equal(soft.player.knockVx, 0, 'no knockback with Soft Landing');
  assert.ok(soft.player.iframe > 0);

  const base = new World({ seed: 1 }); base.balloons = [onPlayer(base)]; base.step({});
  const sure = new World({ seed: 1 }).equip('sureFeet'); sure.balloons = [onPlayer(sure)]; sure.step({});
  assert.equal(sure.player.iframe, Math.round(base.player.iframe * 1.5), 'Sure Feet +50% i-frames');

  // Sure Feet: no contact damage while on a ladder.
  const lad = new World({ seed: 1 }).equip('sureFeet');
  const ladder = lad.stage.ladders[0];
  lad.player.state = 'climb'; lad.player.ladder = ladder;
  lad.player.x = (ladder.x0 + ladder.x1) / 2; lad.player.feetY = (ladder.top + ladder.bottom) / 2;
  lad.balloons = [onPlayer(lad)];
  const h0 = lad.hearts; lad.step({});
  assert.equal(lad.hearts, h0, 'no ladder contact damage with Sure Feet');
});

test('effect — Long Waltz extends slow/freeze by 50%', () => {
  const w = new World({ seed: 1 }).equip('longWaltz'); w.balloons = [];
  w.drops = [new Drop({ kind: 'slow', x: w.player.x, y: w.player.feetY - 10, id: 1 })];
  w.step({});
  assert.equal(w.timeSlow, Math.round(DROPS.slowTicks * 1.5));
});

test('effect — Opera Cloak triggers a post-hit slow-motion beat', () => {
  const w = new World({ seed: 1 }).equip('operaCloak');
  w.balloons = [onPlayer(w)];
  w.step({});
  assert.ok(w.timeSlow > 0, 'a hit while cloaked slows time');
});

test('effect — Encore revives once on a fatal hit, then death sticks', () => {
  const w = new World({ seed: 1 }).equip('seasonEncore');
  const b = onPlayer(w);
  w.hearts = 1; w._playerHit(b);
  assert.equal(w.dead, false, 'the first fatal hit is survived');
  assert.equal(w.hearts, 1, 'revived on 1 heart');
  assert.ok(w.encoreUsed && w.freeze > 0, 'encore spent + a freeze granted');
  // A second fatal hit (encore spent) is lethal.
  w.player.iframe = 0; w.hearts = 1; w._playerHit(b);
  assert.ok(w.dead, 'encore does not repeat');
});

test('effect — Collector\'s Eye makes drops fall slower', () => {
  const w = new World({ seed: 1 }).equip('collectorsEye'); w.dropChance = 1;
  const gTop = w.stage.floorBelow(0, 0).y;
  const penny = new Balloon({ cls: 'penny', x: 100, floorY: gTop, y: 300, vy: 0, id: 1 });
  w.balloons = [penny];
  w._resolveHit(penny);
  assert.ok(w.drops.length >= 1, 'a drop rolled');
  assert.ok(w.drops.every((d) => Math.abs(d.gravityScale - 0.7) < 1e-9), 'drops fall at 70% gravity');
});

test('the full 24-souvenir catalog is now implemented (every draft pick does something)', () => {
  assert.equal(CATALOG.length, 24);
  assert.equal(CATALOG.filter((c) => !c.implemented).length, 0, 'no catalog-only souvenirs remain');
});

test('effect — Iron Gores makes a weighted balloon split one class FURTHER (Grand → Fair)', () => {
  const g = new Balloon({ cls: 'grand', x: 500, floorY: 740, weighted: true });
  const kids = g.split(true);
  assert.ok(kids.length === 2 && kids.every((k) => k.cls === 'fair'), 'weighted Grand skips Parade → Fair');
  // The base split (no skip) is unchanged.
  assert.ok(new Balloon({ cls: 'grand', x: 0, floorY: 740 }).split().every((k) => k.cls === 'parade'));
});

test('effect — Tuba Blast lofts every balloon upward once per stage', () => {
  const w = new World({ seed: 1 }).equip('tubaBlast');
  for (let t = 0; t < 8; t++) w.step({}); // let the roster be mid-arc
  w.step({ tuba: true });
  assert.ok(w.balloons.every((b) => b.vy < 0), 'all balloons sent upward');
  assert.equal(w.tubaReady, false, 'the charge is spent');
});

test('effect — Magnet Gloves slides a landed drop toward the player', () => {
  const w = new World({ seed: 1 }).equip('magnetGloves'); w.balloons = [];
  const gTop = w.stage.floorBelow(0, 0).y;
  w.drops = [new Drop({ kind: 'medallion', x: 120, y: gTop - 14, landed: true, id: 1 })];
  w.player.x = 800;
  const x0 = w.drops[0].x;
  w.step({});
  assert.ok(w.drops.length && w.drops[0].x > x0, 'the drop drifted toward the player');
});

test('effect — Fair Warning telegraphs a drip earlier (a longer warning)', () => {
  const w = new World({ seed: 5, stage: undefined }).equip('fairWarning');
  w.invincible = true; w.parTicks = 30;
  let firstTicks = 0;
  for (let t = 0; t < 4000 && !w.dripPending; t++) w.step({});
  firstTicks = w.dripPending ? w.dripPending.ticksLeft : 0;
  assert.ok(firstTicks > DRIP.telegraphTicks, `warning ${firstTicks} > base ${DRIP.telegraphTicks}`);
});

test('effect — Centerpiece Medal pays an extra bonus on a centerpiece clear', () => {
  const r = new Run({ seed: 1 }); r.souvenirs = ['centerpieceMedal']; r.stage = 4; // 1-4 centerpiece
  const cleared = new World({ seed: 1 }); cleared.score = 0; cleared.pops = 0; cleared.tick = 99999; cleared.parTicks = 0;
  const before = r.tickets;
  r.clearStage(cleared);
  // locale-1 centerpiece = mult(1)*2, + Medal extra mult(1) = 3.
  assert.equal(r.tickets - before, 3);
});
