// feeltape.test.js — the M1 golden-tape gate (DESIGN-SEED verification bar: the M1
// feel tape is asserted at every later milestone; a regeneration diff = a signature-
// physics regression). If a tuning change is INTENTIONAL, regenerate the golden with
//   node -e "import('./src/sim/feeltape.js').then(m=>...)"  and review the diff.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { measureFeelTape } from '../src/sim/feeltape.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(HERE, 'golden/feel-tape-M1.json'), 'utf8'));

test('the live signature physics matches the committed M1 golden feel tape', () => {
  const live = measureFeelTape();
  assert.deepEqual(live, golden,
    'feel tape drift — the signature physics changed. If intentional, regenerate golden/feel-tape-M1.json and review the diff.');
});

test('the golden tape encodes the signature laws it is meant to lock', () => {
  // Sanity that the tape is meaningful (not an empty/degenerate record).
  assert.equal(golden.split.symmetric, true, 'splits must be exactly symmetric (law #1)');
  assert.equal(golden.split.child, 'parade');
  assert.ok(golden.classes.grand.period > golden.classes.penny.period, 'heavier classes bounce slower');
  assert.ok(golden.wire.speedPxPerTick > 0);
  // The arc starts at the rest line, peaks near the derived apex, and comes back down.
  const arc = golden.grandArc;
  assert.equal(arc[0], 0, 'arc begins at the rest line');
  // The ~12-point sampling may miss the exact apex tick, so allow a small margin.
  assert.ok(Math.max(...arc) >= golden.classes.grand.effectiveApex - 4, 'arc peaks near the apex');
});
