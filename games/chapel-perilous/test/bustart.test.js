import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBusts, bustArtId, BUST_SIZE, RAW_BUSTS, HERO_PORTRAITS, heroPortraitFor } from '../src/engine/bustart.js';
import { TRANSPARENT } from '../src/engine/tileart.js';
import beings from '../data/bestiary/beings.json' with { type: 'json' };

test('every bust compiles to a BUST_SIZE square shade matrix', () => {
  const busts = createBusts();
  for (const id of busts.ids()) {
    const g = busts.get(id);
    assert.equal(g.length, BUST_SIZE, `${id} rows`);
    for (const row of g) {
      assert.equal(row.length, BUST_SIZE, `${id} cols`);
      for (const s of row) assert.ok(s === TRANSPARENT || (s >= 0 && s <= 6), `${id} shade ${s}`);
    }
  }
});

test('every bestiary being has a distinct bust', () => {
  const busts = createBusts();
  for (const b of beings.beings) {
    assert.ok(busts.has(bustArtId(b)), `bust for being ${b.id}`);
  }
});

test('the party/hero has a bust', () => {
  const busts = createBusts();
  assert.ok(busts.has('HERO'));
  assert.equal(bustArtId('some-nonbeing'), 'some-nonbeing');
  assert.equal(bustArtId(undefined), 'HERO');
});

test('busts are not blank — each has drawn and transparent pixels', () => {
  const busts = createBusts();
  for (const id of busts.ids()) {
    const flat = busts.get(id).flat();
    assert.ok(flat.some((s) => s >= 0), `${id} has drawn pixels`);
    assert.ok(flat.includes(TRANSPARENT), `${id} has transparent background`);
  }
});

test('bust roster covers the whole beings file plus the hero portraits, no orphans', () => {
  const ids = new Set(createBusts().ids());
  const expected = new Set([...HERO_PORTRAITS, ...beings.beings.map((b) => b.id)]);
  assert.deepEqual([...ids].sort(), [...expected].sort());
  // RAW authoring source matches the compiled set.
  assert.deepEqual(Object.keys(RAW_BUSTS).sort(), [...expected].sort());
});

test('hero portraits: HERO is the default, the seeded selector is deterministic + in-pool', () => {
  assert.equal(HERO_PORTRAITS[0], 'HERO', 'HERO stays the default/fallback');
  assert.ok(HERO_PORTRAITS.length >= 3, 'a real set of portraits to randomize over');
  const busts = createBusts();
  for (const id of HERO_PORTRAITS) assert.ok(busts.has(id), `portrait ${id} has a bust`);
  // deterministic + always in-pool across a spread of seeds
  const seen = new Set();
  for (let s = 0; s < 40; s++) {
    const p = heroPortraitFor(s);
    assert.ok(HERO_PORTRAITS.includes(p), `seed ${s} -> ${p} in pool`);
    assert.equal(heroPortraitFor(s), p, 'same seed -> same portrait');
    seen.add(p);
  }
  assert.ok(seen.size >= 2, 'the selector actually varies the portrait across seeds');
});
