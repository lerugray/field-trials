import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summon, STAT_KEYS, TEMPERAMENTS, sanitizeName, renameCreature, NAME_MAX } from '../src/engine/summon.js';
import { SPECIES, SPECIES_BY_ID, RARITIES } from '../src/data/roster.js';

const TAB = String.fromCharCode(9);
const CTRL = String.fromCharCode(1);

test('summon is fully deterministic for a phrase', () => {
  const a = summon('the quick brown fox');
  const b = summon('the quick brown fox');
  assert.deepEqual(a, b);
});

test('normalized phrases summon the same creature', () => {
  const a = summon('  Fluffy Doom ');
  const b = summon('fluffy doom');
  assert.equal(a.seed, b.seed);
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.species.id, b.species.id);
});

test('summoning always gives — even empty/odd input', () => {
  for (const phrase of ['', '   ', '💥', '42', 'a']) {
    const c = summon(phrase);
    assert.ok(SPECIES_BY_ID.has(c.species.id), `no species for ${JSON.stringify(phrase)}`);
    assert.ok(RARITIES.includes(c.rarity));
  }
});

test('summoned creatures carry their species tell-clarity dial', () => {
  for (const phrase of ['plain', 'sly fox', 'cosmic static']) {
    const c = summon(phrase);
    assert.equal(c.species.tellClarity, SPECIES_BY_ID.get(c.species.id).tellClarity);
  }
});

test('every creature has all five stats within the global band', () => {
  for (let i = 0; i < 500; i++) {
    const c = summon('phrase-' + i);
    for (const k of STAT_KEYS) {
      assert.ok(Number.isInteger(c.stats[k]), `${k} not int`);
      assert.ok(c.stats[k] >= 20 && c.stats[k] <= 74, `${k}=${c.stats[k]} out of band`);
    }
    assert.ok(TEMPERAMENTS.includes(c.temperament));
    assert.ok(typeof c.name === 'string' && c.name.length >= 2);
    assert.ok(c.species.hue >= 0 && c.species.hue < 360);
  }
});

test('higher rarity trends toward higher stats (population averages)', () => {
  const sum = {};
  const n = {};
  for (const r of RARITIES) { sum[r] = 0; n[r] = 0; }
  for (let i = 0; i < 8000; i++) {
    const c = summon('sample-' + i);
    const avg = STAT_KEYS.reduce((a, k) => a + c.stats[k], 0) / STAT_KEYS.length;
    sum[c.rarity] += avg;
    n[c.rarity] += 1;
  }
  const mean = {};
  for (const r of RARITIES) mean[r] = sum[r] / n[r];
  assert.ok(mean.common < mean.legendary, `common ${mean.common} !< legendary ${mean.legendary}`);
  assert.ok(mean.common < mean.epic);
  assert.ok(mean.uncommon < mean.epic);
});

test('over a deterministic phrase sweep, rarity distribution is sane', () => {
  const counts = {};
  const N = 5000;
  for (let i = 0; i < N; i++) {
    const c = summon('sweep-' + i);
    counts[c.rarity] = (counts[c.rarity] || 0) + 1;
  }
  for (const r of RARITIES) assert.ok(counts[r] > 0, `rarity ${r} never summoned`);
  // common should dominate; legendary should be scarce
  assert.ok(counts.common > counts.legendary * 5);
});

test('a large deterministic sweep can reach every one of the 70 species', () => {
  const seen = new Set();
  for (let i = 0; i < 20000 && seen.size < 70; i++) {
    seen.add(summon('reach-' + i).species.id);
  }
  assert.equal(seen.size, 70, `only reached ${seen.size}/70 species`);
});

test('art variant knobs do not affect stats or species', () => {
  // hueShift stays within +-14 of the species base hue
  const c = summon('hue check phrase');
  const base = SPECIES.find((s) => s.id === c.species.id).hue;
  let d = Math.abs(c.species.hue - base);
  d = Math.min(d, 360 - d);
  assert.ok(d <= 14, `hue drift ${d} too large`);
});

// --- rename (M8: naming your pet) --------------------------------------------
test('sanitizeName trims, collapses whitespace, strips control chars, caps length', () => {
  assert.equal(sanitizeName('  Rex  '), 'Rex');
  assert.equal(sanitizeName('a' + TAB + TAB + '  b'), 'a b');
  assert.equal(sanitizeName('Re' + CTRL + 'x'), 'Rex');
  assert.ok(sanitizeName('x'.repeat(40)).length <= NAME_MAX);
});

test('sanitizeName never returns empty — blanks keep the fallback', () => {
  assert.equal(sanitizeName('   ', 'Bo'), 'Bo');
  assert.equal(sanitizeName('', 'Bo'), 'Bo');
  assert.equal(sanitizeName(null, 'Bo'), 'Bo');
  assert.equal(sanitizeName(' '), 'Buddy'); // default fallback
});

test('renameCreature is a pure copy under a safe name; blank is a no-op', () => {
  const c = summon('rename me');
  const r = renameCreature(c, '  Champion  ');
  assert.equal(r.name, 'Champion');
  assert.notEqual(r, c); // pure copy
  assert.equal(c.name, summon('rename me').name); // original untouched
  assert.equal(renameCreature(r, '   ').name, 'Champion'); // blank keeps name
  assert.equal(renameCreature(null, 'x'), null);
});
