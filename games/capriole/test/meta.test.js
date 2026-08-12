// node --test — the LIGHT META layer (M4): tickets bank across runs, unlock caprices into
// the TRUNK, and a curated LOADOUT (≤16) becomes the next run's draft pool. Progression is
// curation agency, never dilution — the starter trunk is always present, and a corrupt meta
// falls back gracefully.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultMeta, STARTER_TRUNK, unlockCost, lockedCaprices, canUnlock, unlockCaprice,
  bankTickets, setLoadout, runPool, sanitizeMeta,
} from '../src/sim/meta.js';
import { CAPRICES, CAPRICE_BY_ID } from '../src/sim/caprices.js';
import { createWorld, advanceSphere } from '../src/sim/world.js';
import { tuning } from '../src/sim/tuning.js';

test('default meta: starter trunk is every tier-0 caprice, loadout auto-filled', () => {
  const m = defaultMeta();
  assert.equal(m.tickets, 0);
  assert.equal(m.trunk.length, CAPRICES.filter((c) => c.tier === 0).length);
  for (const id of STARTER_TRUNK) assert.ok(CAPRICE_BY_ID[id].tier === 0);
  assert.deepEqual(m.loadout, m.trunk, 'loadout auto-fills to the trunk');
});

test('locked caprices are the non-starter (higher-tier) ones', () => {
  const locked = lockedCaprices(defaultMeta()).map((c) => c.id);
  assert.ok(locked.length === 16 - STARTER_TRUNK.length);
  for (const c of lockedCaprices(defaultMeta())) assert.ok(c.tier > 0);
});

test('bankTickets accumulates a scorecard payout', () => {
  const m = bankTickets(defaultMeta(), { tickets: { total: 21 } });
  assert.equal(m.tickets, 21);
  assert.equal(bankTickets(m, { tickets: { total: 4 } }).tickets, 25);
});

test('unlocking a tier-1 caprice costs tickets and adds it to trunk + loadout', () => {
  let m = bankTickets(defaultMeta(), { tickets: { total: 50 } });
  const id = 'double-clutch'; // tier 1
  assert.equal(unlockCost(id), tuning.tickets.unlockCost[1]);
  assert.ok(canUnlock(m, id));
  m = unlockCaprice(m, id);
  assert.equal(m.tickets, 50 - tuning.tickets.unlockCost[1]);
  assert.ok(m.trunk.includes(id) && m.loadout.includes(id));
  // Re-unlocking is a no-op (already owned).
  assert.equal(unlockCaprice(m, id), m);
});

test('cannot unlock what you cannot afford', () => {
  const m = defaultMeta(); // 0 tickets
  assert.equal(canUnlock(m, 'sky-legs'), false);
  assert.equal(unlockCaprice(m, 'sky-legs'), m, 'no-op when broke');
});

test('setLoadout curates a subset of the trunk (deduped, capped, trunk-only)', () => {
  let m = bankTickets(defaultMeta(), { tickets: { total: 100 } });
  m = unlockCaprice(m, 'double-clutch');
  // Try to set a loadout with a not-owned id + a dupe → filtered.
  m = setLoadout(m, ['spring-heels', 'spring-heels', 'double-clutch', 'iron-goat']);
  assert.deepEqual(m.loadout, ['spring-heels', 'double-clutch'], 'iron-goat not owned; dupe removed');
});

test('runPool = curated loadout, or the whole trunk when empty (auto-fill)', () => {
  let m = defaultMeta();
  assert.deepEqual(runPool(m), m.trunk, 'auto-fill');
  m = setLoadout(m, ['spring-heels']);
  assert.deepEqual(runPool(m), ['spring-heels'], 'curated pool respected');
  m = setLoadout(m, []); // empty → auto-fill again
  assert.deepEqual(runPool(m), m.trunk);
});

test('sanitizeMeta repairs corrupt input and guarantees the starter trunk', () => {
  assert.deepEqual(sanitizeMeta(null), defaultMeta());
  const repaired = sanitizeMeta({ tickets: -5, trunk: ['bogus', 'double-clutch'], loadout: ['bogus'] });
  assert.equal(repaired.tickets, 0, 'negative tickets clamped');
  for (const id of STARTER_TRUNK) assert.ok(repaired.trunk.includes(id), 'starter always present');
  assert.ok(repaired.trunk.includes('double-clutch'), 'valid unlocked id kept');
  assert.ok(!repaired.trunk.includes('bogus'), 'bogus dropped');
  assert.ok(repaired.loadout.length > 0, 'empty valid loadout auto-fills');
});

test('the run only drafts from the meta loadout (progression = curation)', () => {
  // A loadout of exactly one caprice → every draft in act 1 offers only that caprice.
  const w = createWorld(31, 0, [], ['spring-heels']);
  assert.deepEqual(w.pool, ['spring-heels']);
  advanceSphere(w); // draft entering sphere 1 (tier 0 gate)
  assert.deepEqual(w.draft.offer, ['spring-heels'], 'only the curated caprice is offered');
});

test('a tier-locked loadout entry is not offered until its act', () => {
  // double-clutch (tier 1) in the pool, but a draft entering an act-1 sphere must not offer it.
  const w = createWorld(31, 0, [], ['spring-heels', 'double-clutch']);
  advanceSphere(w); // entering sphere 1 → gate tier 0
  assert.ok(!w.draft.offer.includes('double-clutch'), 'tier-1 caprice gated out of act 1');
});
