import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createProse, REGISTERS } from '../src/engine/prose.js';
import { mulberry32 } from '../src/engine/prng.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pools = JSON.parse(readFileSync(resolve(root, 'data/register/pools.json'), 'utf8'));

// A description is player-facing draft prose. These invariants must hold on the
// composed output regardless of which registers collided.
function assertClean(s) {
  assert.equal(typeof s, 'string');
  assert.ok(s.startsWith('[SEED] '), `must be [SEED]-marked: ${s}`);
  const body = s.slice('[SEED] '.length);
  assert.ok(body.length > 0, 'non-empty body');
  assert.ok(/[.?!]$/.test(body.trim()), `should end with terminal punctuation: ${s}`);
  assert.ok(!body.includes('{') && !body.includes('}'), `no unresolved template slot: ${s}`);
  assert.ok(!body.includes(',.'), `sanitize should have fixed ",.": ${s}`);
  assert.ok(!body.includes('  '), `no double spaces: ${s}`);
  assert.ok(!/(^|[\s.,;:("'—-])[aA] [aeiouAEIOU]/.test(body), `a/an article error: ${s}`);
  assert.ok(!/\bthe the\b/i.test(body), `duplicate article: ${s}`);
}

test('pools.json carries all five registers with non-empty verb/noun pools', () => {
  assert.deepEqual([...pools.registers].sort(), [...REGISTERS].sort());
  for (const r of REGISTERS) {
    assert.ok(pools.verbs[r].length > 0, `verbs.${r}`);
    assert.ok(pools.nouns[r].length > 0, `nouns.${r}`);
  }
  for (const k of ['mundane', 'absurdist', 'impossible']) assert.ok(pools.causes[k].length > 0);
});

test('createProse validates its pools', () => {
  assert.throws(() => createProse(null));
  assert.throws(() => createProse({ verbs: {}, nouns: {} }));
});

test('describeSite is deterministic in (site, worldSeed)', () => {
  const p = createProse(pools);
  const site = { x: 8, y: 6, name: '[SEED] The Chapel Perilous', kind: 'dungeon' };
  const a = p.describeSite(site, 2323);
  const b = p.describeSite(site, 2323);
  assert.equal(a, b);
  // A different world seed yields (with overwhelming likelihood) different prose.
  const c = p.describeSite(site, 9999);
  assert.notEqual(a, c);
});

test('describeSite output is clean, [SEED]-marked, and names the site', () => {
  const p = createProse(pools);
  for (let x = 0; x < 24; x++) {
    for (let y = 0; y < 6; y++) {
      const s = p.describeSite({ x, y, name: 'The Chapel Perilous' }, 2323);
      assertClean(s);
      assert.ok(s.includes('The Chapel Perilous'), `should name the site: ${s}`);
      // Exactly one [SEED] marker — the engine's own prefix, never a doubled one.
      assert.equal(s.split('[SEED]').length - 1, 1, `should carry exactly one [SEED] marker: ${s}`);
    }
  }
});

test('describeSite produces varied prose across sites (not a single template)', () => {
  const p = createProse(pools);
  const seen = new Set();
  for (let x = 0; x < 40; x++) seen.add(p.describeSite({ x, y: 0, name: 'Site' }, 2323));
  assert.ok(seen.size > 10, `expected varied output, got ${seen.size} distinct`);
});

test('pickRegister mixes all five registers and tilts with weirdness', () => {
  const p = createProse(pools);
  const rng = mulberry32(2323);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(p.pickRegister(rng, 0.5));
  assert.equal(seen.size, 5, `all five registers should appear, saw ${[...seen]}`);

  // High weirdness should surface ominous+conspiratorial more than low weirdness.
  const count = (w) => {
    const r = mulberry32(777);
    let dark = 0;
    for (let i = 0; i < 2000; i++) {
      const reg = p.pickRegister(r, w);
      if (reg === 'ominous' || reg === 'conspiratorial') dark++;
    }
    return dark;
  };
  assert.ok(count(0.95) > count(0.05), 'weirdness should raise ominous/conspiratorial share');
});

test('descriptions of the same site collide multiple registers over its lifetime', () => {
  // Over many world seeds one site draws different register vocabulary — the
  // Illuminatus! collision. Confirm at least three distinct opener shapes appear.
  const p = createProse(pools);
  const markers = {
    conspiratorial: (s) => s.includes('officially') || s.includes('not reading this'),
    ominous: (s) => s.includes('once before') || s.includes('declined to specify') || s.includes('discusses'),
    bureaucratic: (s) => s.includes('filed against') || s.includes('permitted'),
    lyrical: (s) => s.includes('margin of') || s.includes('remembers a different'),
    clinical: (s) => s.includes('Field survey') || s.includes('is ongoing'),
  };
  const hit = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const s = p.describeSite({ x: 8, y: 6, name: 'The Chapel Perilous' }, seed);
    for (const [reg, test] of Object.entries(markers)) if (test(s)) hit.add(reg);
  }
  assert.ok(hit.size >= 3, `expected >=3 registers across runs, saw ${[...hit]}`);
});

test('cause selection scales with weirdness', () => {
  const p = createProse(pools);
  const mundane = new Set(pools.causes.mundane);
  const impossible = new Set(pools.causes.impossible);
  // Low weirdness: mundane causes appear.
  let sawMundane = false;
  const lo = mulberry32(42);
  for (let i = 0; i < 200; i++) if (mundane.has(p.cause(0.0, lo))) sawMundane = true;
  assert.ok(sawMundane, 'low weirdness should yield mundane causes');
  // High weirdness: impossible causes appear.
  let sawImpossible = false;
  const hi = mulberry32(42);
  for (let i = 0; i < 200; i++) if (impossible.has(p.cause(1.0, hi))) sawImpossible = true;
  assert.ok(sawImpossible, 'high weirdness should yield impossible causes');
});

test('sanitize fixes mechanical artefacts', () => {
  const p = createProse(pools);
  assert.equal(p.sanitize('closed,.'), 'closed.');
  assert.equal(p.sanitize('a apple'), 'an apple');
  assert.equal(p.sanitize('A egg'), 'An egg');
  assert.equal(p.sanitize('the the office'), 'the office');
  assert.equal(p.sanitize('upon upon request'), 'upon request');
});

test('describeTerrain is deterministic, clean and [SEED]-marked', () => {
  const p = createProse(pools);
  const a = p.describeTerrain('FOREST', 3, 4, 2323);
  const b = p.describeTerrain('FOREST', 3, 4, 2323);
  assert.equal(a, b);
  assertClean(a);
  assert.ok(a.toLowerCase().includes('forest'));
});

test('Chapel full-collision: describeSite collide mixes all five registers, deterministic + clean', () => {
  const p = createProse(pools);
  const site = { x: 7, y: -3, id: 'chapel-perilous', name: 'The Chapel Perilous' };
  const a = p.describeSite(site, 2323, { loc: 'the annex', collide: true });
  const b = p.describeSite(site, 2323, { loc: 'the annex', collide: true });
  assert.equal(a, b, 'collision prose must be deterministic');
  assertClean(a);
  // Structure: one opener sentence + all four remaining register tails = 5 sentences.
  const body = a.slice('[SEED] '.length).trim();
  const sentences = body.split(/(?<=[.?!])\s+/).filter(Boolean);
  assert.ok(sentences.length >= 5, `collision should stack ≥5 sentences, got ${sentences.length}: ${body}`);
});

test('Chapel full-collision differs from an ordinary (non-collide) description', () => {
  const p = createProse(pools);
  const site = { x: 7, y: -3, id: 'chapel-perilous', name: 'The Chapel Perilous' };
  const collide = p.describeSite(site, 2323, { collide: true });
  const plain = p.describeSite(site, 2323, {});
  assert.notEqual(collide, plain);
  // Collision output is longer — it stacks every register.
  assert.ok(collide.length > plain.length, 'collision should stack more registers');
});

test('describeTerrain collide mode names the tile and stays clean', () => {
  const p = createProse(pools);
  const a = p.describeTerrain('chamber', 1, 2, 99, { collide: true });
  const b = p.describeTerrain('chamber', 1, 2, 99, { collide: true });
  assert.equal(a, b);
  assertClean(a);
  assert.ok(a.toLowerCase().includes('chamber'));
});

test('describeBiomeEvent: [SEED] + clean + deterministic + carries the biome name', () => {
  const p = createProse(pools);
  const biome = { id: 'salt-flats', name: '[SEED] The Salt Flats', weirdness: 0.2, register: 'clinical' };
  const frag = '[SEED] the pan records your passage in a thin line of salt';
  const a = p.describeBiomeEvent(biome, frag, 12345);
  const b = p.describeBiomeEvent(biome, frag, 12345);
  assert.equal(a, b, 'deterministic in the seed');
  assertClean(a);
  assert.ok(a.toLowerCase().includes('salt flats'), 'names the biome');
  // A different biome/register/seed yields different flavor.
  const other = p.describeBiomeEvent({ id: 'pine-barrens', name: '[SEED] The Pine Barrens', weirdness: 0.55, register: 'ominous' }, '[SEED] the pines close the path', 999);
  assert.notEqual(a, other);
  assertClean(other);
});

test('describeBiomeEvent tolerates a missing/invalid register (falls back to a weighted pick)', () => {
  const p = createProse(pools);
  const out = p.describeBiomeEvent({ name: '[SEED] Nowhere', weirdness: 0.5 }, '[SEED] nothing in particular', 7);
  assertClean(out);
});
