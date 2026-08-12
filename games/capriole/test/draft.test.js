// node --test — the between-sphere CAPRICE DRAFT (M4). Clearing a sphere opens a draft
// of up to three caprices; picking one bends the run; skipping banks a ticket; the sim
// freezes while drafting (untimed by law); tiers are act-gated; drafts never duplicate an
// owned caprice; the offer is deterministic from the seeded 'caprices' stream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce, advanceSphere, beginDraft, resolveDraft } from '../src/sim/world.js';
import { CAPRICE_BY_ID, maxTierForSphere } from '../src/sim/caprices.js';
import { tuning } from '../src/sim/tuning.js';
import { createFreshPressGate } from '../src/engine/freshpress.js';

test('advanceSphere on a non-final sphere opens a draft (does not load yet)', () => {
  const w = createWorld(11, 0);
  advanceSphere(w);
  assert.equal(w.phase, 'draft');
  assert.ok(w.draft, 'a draft offer exists');
  assert.equal(w.draft.nextIndex, 1);
  assert.ok(w.draft.offer.length <= tuning.caprice.offerCount);
  assert.equal(w.sphereIndex, 0, 'not advanced until resolved');
  assert.equal(w.spheresCleared, 1, 'the clear is banked for tickets');
});

test('drafting a caprice adds it to the build, re-derives tune, then advances', () => {
  const w = createWorld(11, 0);
  advanceSphere(w);
  const chosen = w.draft.offer[0];
  const before = w.tune.jump.baseHeight;
  resolveDraft(w, 0);
  assert.equal(w.phase, 'play');
  assert.equal(w.sphereIndex, 1, 'advanced to the next sphere');
  assert.ok(w.caprices.includes(chosen), 'the drafted caprice is owned');
  // tune re-derived (if a jump-height caprice was chosen the base height moved; either way
  // the derive ran — assert the mods reflect the pick).
  const m = CAPRICE_BY_ID[chosen].mods;
  if (m.jumpHeightMul) assert.ok(w.tune.jump.baseHeight > before);
});

test('a +heart caprice raises hpMax and grants the heart full', () => {
  // Force an offer that includes spare-pip by drafting until offered, or inject via beginDraft.
  const w = createWorld(5, 0);
  w.hp = 3; // below max
  beginDraft(w, 1);
  w.draft.offer = ['spare-pip']; // deterministic injection for the assertion
  const maxBefore = w.hpMax, hpBefore = w.hp;
  resolveDraft(w, 0);
  assert.equal(w.hpMax, maxBefore + 1, 'max hearts raised');
  assert.equal(w.hp, hpBefore + 1, 'the new heart arrives full (heal by the delta)');
});

test('skipping banks a ticket and advances', () => {
  const w = createWorld(9, 0);
  advanceSphere(w);
  const owned = w.caprices.length;
  resolveDraft(w, -1);
  assert.equal(w.phase, 'play');
  assert.equal(w.sphereIndex, 1);
  assert.equal(w.skipTickets, tuning.caprice.skipTicket);
  assert.equal(w.caprices.length, owned, 'no caprice added on skip');
});

test('the offer never duplicates an owned caprice', () => {
  const w = createWorld(3, 5); // act 2 → tiers 0+1 available
  w.caprices = ['spring-heels', 'feather-fall', 'double-clutch'];
  beginDraft(w, 6);
  for (const id of w.draft.offer) assert.ok(!w.caprices.includes(id), `${id} not already owned`);
});

test('tiers are act-gated: act-1 draft offers only tier-0 caprices', () => {
  const w = createWorld(21, 0);
  beginDraft(w, 1); // entering sphere 1 (act 1) → gate tier 0
  assert.equal(w.draft.gate, 0);
  for (const id of w.draft.offer) assert.equal(CAPRICE_BY_ID[id].tier, 0, `${id} is tier 0`);
});

test('act-3 draft can offer high-tier caprices', () => {
  const w = createWorld(21, 6);
  beginDraft(w, 7); // entering sphere 7 (act 3) → gate tier 2
  assert.equal(w.draft.gate, 2);
  assert.equal(maxTierForSphere(7), 2);
});

test('the offer is deterministic from the seed (resume cannot re-roll)', () => {
  const a = createWorld(77, 0); advanceSphere(a);
  const b = createWorld(77, 0); advanceSphere(b);
  assert.deepEqual(a.draft.offer, b.draft.offer);
});

test('the sim is frozen while a draft is open', () => {
  const w = createWorld(4, 0);
  advanceSphere(w);
  const tick0 = w.tick;
  const pos0 = { ...w.player.pos };
  for (let i = 0; i < 30; i++) stepOnce(w, { f: 1, jump: true });
  assert.equal(w.tick, tick0, 'no ticks advanced');
  assert.deepEqual(w.player.pos, pos0, 'player did not move');
});

test('a buffered confirm cannot skip the picker; release plus a fresh press is required', () => {
  const w = createWorld(41, 0);
  const gate = createFreshPressGate();
  advanceSphere(w);
  const offered = w.draft.offer[0];

  // Space was already held while the exit opened. Its repeat keydown and keyup
  // must leave the deterministic draft phase and offer untouched.
  gate.open(['Space']);
  if (gate.keyDown('Space', true)) resolveDraft(w, 0);
  assert.equal(w.phase, 'draft');
  assert.equal(w.draft.offer[0], offered);
  gate.keyUp('Space');
  assert.equal(w.phase, 'draft', 'release alone does not choose');

  // Only a new non-repeat keydown may take the focused/default card.
  if (gate.keyDown('Space')) resolveDraft(w, 0);
  assert.equal(w.phase, 'play');
  assert.ok(w.caprices.includes(offered));
});

test('drafts drain the pool: repeated drafts never re-offer an owned caprice', () => {
  const w = createWorld(123, 0);
  const seen = new Set();
  for (let s = 0; s < 6; s++) {
    beginDraft(w, s + 1);
    for (const id of w.draft.offer) assert.ok(!seen.has(id), `${id} offered twice across drafts`);
    if (w.draft.offer.length) { resolveDraft(w, 0); seen.add(w.caprices[w.caprices.length - 1]); }
    else resolveDraft(w, -1);
  }
});
