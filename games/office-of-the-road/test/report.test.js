// report.test.js — THE FILED REPORT (DESIGN-SEED M5). The incident ledger traces
// cause → deduction, and the composed report reads as a causal chain (not a stat
// dump) with exactly one credit line. Register voice split is checked structurally.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLedger, recordRoute, recordMatter, recordMissedWindow,
  recordReduction, recordCredit, composeReport,
} from '../src/report.js';

const branch = { id: 'verge', label: 'The Unassessed Verge', safety: 'exposed', encounterMult: 1.7 };

test('the ledger records incidents in order', () => {
  const L = createLedger();
  recordRoute(L, 3, branch);
  recordMatter(L, 3, 'elite');
  recordMatter(L, 3, 'boss');
  assert.equal(L.matterByLeg[3], 2);
  assert.equal(L.routeByLeg[3].label, 'The Unassessed Verge');
  assert.equal(L.incidents.length, 3);
});

test('composeReport heads the chain with the fatal leg routing decision', () => {
  const L = createLedger();
  recordRoute(L, 5, branch);
  recordMatter(L, 5, 'elite');
  const { lines } = composeReport(L, { leg: 5, tier: 'elite', supplies: 4, gold: 88 });
  assert.equal(lines[0].tone, 'cause');
  assert.match(lines[0].text, /Leg 5 was routed via The Unassessed Verge/);
  assert.match(lines[0].text, /×1\.7/, 'carries the exact instrument');
});

test('unplayed decisive windows become causal coverage-gap lines (passive voice)', () => {
  const L = createLedger();
  recordRoute(L, 4, branch);
  recordMissedWindow(L, 4, 'boss', 'The Star', 'Chirurgeon');
  recordReduction(L, 4, 'boss', 'Chirurgeon');
  const { lines, hasCause } = composeReport(L, { leg: 4, tier: 'boss', supplies: 0, gold: 12 });
  assert.ok(hasCause);
  const gap = lines.find((l) => /went unplayed/.test(l.text));
  assert.ok(gap, 'a coverage-gap line exists');
  assert.equal(gap.tone, 'suffer');
  assert.match(gap.text, /The Star/);
  assert.match(gap.text, /was reduced/, 'passive voice for suffering');
});

test('the report always ends with exactly one credit line (active voice)', () => {
  const L = createLedger();
  recordRoute(L, 2, branch);
  recordCredit(L, 'mended the line at leg 2, averting a reduction', 30);
  recordCredit(L, 'husbanded supplies on the Posted Road', 5); // weaker; should not win
  const { lines } = composeReport(L, { leg: 2, tier: 'routine', supplies: 10, gold: 40 });
  const credits = lines.filter((l) => l.tone === 'credit');
  assert.equal(credits.length, 1, 'exactly one credit line');
  assert.match(credits[0].text, /mended the line/, 'the weightier credit wins');
  assert.match(credits[0].text, /the desk/i, 'active voice — the desk did it');
});

test('a bare run still composes a valid causal report (no crash, has a reduction)', () => {
  const L = createLedger();
  const { lines } = composeReport(L, { leg: 0, tier: 'routine', supplies: 0, gold: 0 });
  assert.ok(lines.length >= 2);
  assert.ok(lines.some((l) => /was reduced in full/.test(l.text)));
  assert.equal(lines[lines.length - 1].tone, 'credit', 'still ends on a credit line');
});
