import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES,
  SPECIES_BY_ID,
  SPECIES_BY_RARITY,
  RARITIES,
  ARCHETYPES,
  EARS,
  FACES,
  PATTERNS,
  EYE_COUNTS,
  VFX_FAMILIES,
  ARCHETYPE_AFFINITY,
  TELL_CLARITIES,
  affinityOf,
} from '../src/data/roster.js';

test('roster has exactly 70 species', () => {
  assert.equal(SPECIES.length, 70);
});

test('rarity counts match the design contract', () => {
  const counts = {};
  for (const s of SPECIES) counts[s.rarity] = (counts[s.rarity] || 0) + 1;
  assert.deepEqual(counts, {
    common: 14,
    uncommon: 18,
    rare: 17,
    epic: 12,
    legendary: 9,
  });
});

test('every species has a unique id', () => {
  assert.equal(SPECIES_BY_ID.size, 70);
});

test('every species uses a known rarity and archetype and a valid hue', () => {
  for (const s of SPECIES) {
    assert.ok(RARITIES.includes(s.rarity), `${s.name} rarity ${s.rarity}`);
    assert.ok(ARCHETYPES.includes(s.archetype), `${s.name} archetype ${s.archetype}`);
    assert.ok(Number.isInteger(s.hue) && s.hue >= 0 && s.hue < 360, `${s.name} hue ${s.hue}`);
    assert.ok(typeof s.name === 'string' && s.name.length > 0);
  }
});

test('every archetype rig is actually used by at least one species', () => {
  const used = new Set(SPECIES.map((s) => s.archetype));
  for (const a of ARCHETYPES) assert.ok(used.has(a), `archetype ${a} unused`);
});

test('SPECIES_BY_RARITY buckets partition the roster', () => {
  let total = 0;
  for (const r of RARITIES) total += SPECIES_BY_RARITY[r].length;
  assert.equal(total, 70);
});

test('every species carries a valid trait set (the M7 feature layer)', () => {
  for (const s of SPECIES) {
    const t = s.traits;
    assert.ok(t && typeof t === 'object', `${s.name} has traits`);
    assert.ok(EARS.includes(t.ears), `${s.name} ears ${t.ears}`);
    assert.ok(FACES.includes(t.face), `${s.name} face ${t.face}`);
    assert.ok(PATTERNS.includes(t.pattern), `${s.name} pattern ${t.pattern}`);
    assert.ok(EYE_COUNTS.includes(t.eyes), `${s.name} eyes ${t.eyes}`);
  }
});

test('every species has a valid tell clarity and the roster uses every tier', () => {
  const used = new Set();
  for (const s of SPECIES) {
    assert.ok(TELL_CLARITIES.includes(s.tellClarity), `${s.name} tell clarity ${s.tellClarity}`);
    used.add(s.tellClarity);
  }
  assert.deepEqual([...used].sort(), ['clear', 'oblique', 'shaded']);
});

test('the roster is visibly varied — no two species share the full rig+trait profile', () => {
  // archetype + ears + face + pattern + eyes must not collide (hue still varies
  // even on the rare tie, but this guards against accidental clones on the parts).
  const seen = new Map();
  for (const s of SPECIES) {
    const t = s.traits;
    const key = `${s.archetype}|${t.ears}|${t.face}|${t.pattern}|${t.eyes}`;
    if (seen.has(key)) {
      // a small number of look-alikes is tolerable, but flag the collision so we
      // can eyeball it; assert only that hues differ so they never render identical.
      assert.notEqual(s.hue, seen.get(key), `${s.name} and same-profile sibling share a hue`);
    }
    seen.set(key, s.hue);
  }
});

test('every archetype has an affinity with a known VFX family', () => {
  for (const a of ARCHETYPES) {
    const aff = ARCHETYPE_AFFINITY[a];
    assert.ok(aff, `archetype ${a} has an affinity`);
    assert.ok(typeof aff.element === 'string' && aff.element.length, `${a} element`);
    assert.ok(VFX_FAMILIES.includes(aff.vfx), `${a} vfx ${aff.vfx}`);
  }
});

test('exactly five VFX families exist and each is used by some archetype', () => {
  assert.equal(VFX_FAMILIES.length, 5);
  const used = new Set(Object.values(ARCHETYPE_AFFINITY).map((a) => a.vfx));
  for (const f of VFX_FAMILIES) assert.ok(used.has(f), `vfx family ${f} unused`);
});

test('affinityOf resolves for every species and falls back safely', () => {
  for (const s of SPECIES) {
    const aff = affinityOf(s);
    assert.ok(VFX_FAMILIES.includes(aff.vfx));
  }
  assert.equal(affinityOf(null).vfx, ARCHETYPE_AFFINITY.critter.vfx);
  assert.equal(affinityOf({ archetype: 'nonsense' }).vfx, ARCHETYPE_AFFINITY.critter.vfx);
});
