import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTIFS, MOTIFS_BY_SIZE } from '../src/content/motifs.js';
import { validateLibrary } from '../src/puzzle/generator.js';

test('the entire motif library is proved guess-free + unique (hard-rule 4)', () => {
  const { allProved, failures } = validateLibrary(MOTIFS);
  assert.ok(allProved, `unproved motifs: ${failures.map((f) => `${f.id}:${f.reason}`).join(', ')}`);
});

test('every motif carries in-register metadata, unique ids, no reference leakage', () => {
  const ids = new Set();
  for (const m of MOTIFS) {
    assert.ok(m.name && m.blurb && m.rows && m.size, `${m.id} missing fields`);
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`);
    ids.add(m.id);
    assert.equal(m.rows.length, m.size, `${m.id} row count != size`);
    for (const r of m.rows) assert.equal(r.length, m.size, `${m.id} ragged row`);
    assert.doesNotMatch(`${m.name} ${m.blurb}`.toLowerCase(), /picross|nintendo|ufo/);
  }
});

test('the library spans a range of sizes and difficulty tiers', () => {
  const sizes = Object.keys(MOTIFS_BY_SIZE).map(Number).sort((a, b) => a - b);
  assert.ok(sizes.length >= 4, `expected several sizes, got ${sizes}`);
  assert.ok(sizes[0] <= 5 && sizes[sizes.length - 1] >= 10);
  const { built } = validateLibrary(MOTIFS);
  const tiers = new Set(built.map((b) => b.tier));
  assert.ok(tiers.size >= 3, `expected a spread of tiers, got ${[...tiers]}`);
});
