import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createNames } from '../src/engine/names.js';
import { mulberry32 } from '../src/engine/prng.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const phonemes = JSON.parse(readFileSync(resolve(root, 'data/register/phonemes.json'), 'utf8'));

const FORBIDDEN = new Set(['THE', 'AND', 'GOD', 'RAT', 'SIN']); // spot-check subset

test('phonemes.json carries usable phoneme sets', () => {
  assert.ok(phonemes.length >= 3);
  for (const s of phonemes) {
    assert.ok(s.onset.length && s.nucleus.length && s.coda.length && s.syllable_patterns.length);
  }
});

test('createNames validates its input', () => {
  assert.throws(() => createNames(null));
  assert.throws(() => createNames([]));
  assert.throws(() => createNames([{ onset: ['k'] }]));
});

test('generated names are capitalized, >=2 chars, and dodge forbidden collisions', () => {
  const names = createNames(phonemes);
  const rng = mulberry32(2323);
  for (let i = 0; i < 500; i++) {
    const part = names.namePart(phonemes[i % phonemes.length], 1, 3, rng);
    assert.ok(part.length >= 2, `too short: '${part}'`);
    assert.equal(part[0], part[0].toUpperCase(), `not capitalized: '${part}'`);
    assert.ok(!FORBIDDEN.has(part.toUpperCase()), `forbidden collision: '${part}'`);
  }
});

test('personal / settlement / world names have sane shapes', () => {
  const names = createNames(phonemes);
  const rng = mulberry32(42);
  const person = names.personalName(1, rng);
  assert.ok(/\S/.test(person) && (person.includes(' ') || person.includes('-')), `person: '${person}'`);
  const town = names.settlementName(0, rng);
  assert.ok(town.length >= 2, `settlement: '${town}'`);
  const world = names.worldName(rng);
  assert.ok(world.length >= 2, `world: '${world}'`);
});

test('coordinate-seeded names are deterministic in (coord, worldSeed)', () => {
  const names = createNames(phonemes);
  assert.equal(names.regionAt(8, 6, 2323), names.regionAt(8, 6, 2323));
  assert.equal(names.npcAt(8, 6, 2323), names.npcAt(8, 6, 2323));
  // Different world seeds diverge (overwhelmingly likely).
  assert.notEqual(names.regionAt(8, 6, 2323), names.regionAt(8, 6, 9999));
});

test('regionAt yields varied, well-formed loc labels across the map', () => {
  const names = createNames(phonemes);
  const seen = new Set();
  for (let x = 0; x < 30; x++) {
    const r = names.regionAt(x, 0, 2323);
    assert.ok(r.startsWith('the ') && r.endsWith(' district'), `malformed loc: '${r}'`);
    seen.add(r);
  }
  assert.ok(seen.size > 5, `expected varied regions, got ${seen.size}`);
});
