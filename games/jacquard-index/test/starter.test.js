import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starterPuzzles, STARTER_MOTIFS } from '../src/content/starter.js';
import { certify } from '../src/puzzle/solver.js';
import { isUnique } from '../src/puzzle/oracle.js';

test('every starter motif is guess-free AND oracle-unique (hard-rule 4)', () => {
  for (const m of starterPuzzles()) {
    const c = certify(m.puzzle);
    assert.ok(c.ok, `${m.id} must be guess-free, got ${c.reason}`);
    assert.ok(isUnique(m.puzzle), `${m.id} must have a unique solution`);
  }
});

test('starter motifs carry in-register metadata, no reference leakage', () => {
  assert.ok(STARTER_MOTIFS.length >= 3);
  for (const m of STARTER_MOTIFS) {
    assert.ok(m.name && m.blurb, `${m.id} needs name + blurb`);
    assert.doesNotMatch(`${m.name} ${m.blurb}`.toLowerCase(), /picross|nintendo|ufo/);
  }
});
