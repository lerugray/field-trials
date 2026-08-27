// legibility.test.js — measured contrast for rust display type and paper accents.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, R, ACCENT_RED, contrastRatio, sampleDisplayRamp, rampAt, clamp } from '../src/render/px.js';

const PAPER = P.pa5;
const TITLE_SCRIM = '#4a4038';

test('ACCENT_RED meets AA on cream paper panels', () => {
  const ratio = contrastRatio(ACCENT_RED, PAPER);
  assert.ok(ratio >= 7.0, `accent red on paper ${ratio.toFixed(2)}:1 (was rd2 ${contrastRatio(P.rd2, PAPER).toFixed(2)}:1)`);
});

test('mid rust on dark title scrim is sub-AA without the halo treatment', () => {
  const ratio = contrastRatio(P.rd2, TITLE_SCRIM);
  assert.ok(ratio < 3.0, `rd2 on title scrim ${ratio.toFixed(2)}:1`);
});

test('rust display sample improves over mid rd2 on title scrim', () => {
  const mid = rampAt(R.rust, clamp(0.62 - 0.5 * 0.30, 0, 1), 0, 0);
  const face = sampleDisplayRamp(R.rust, 120, 80, 0.5, 0.35);
  const before = contrastRatio(mid, TITLE_SCRIM);
  const after = contrastRatio(face, TITLE_SCRIM);
  assert.ok(after >= before + 1.5, `sample ${after.toFixed(2)}:1 should beat mid ${before.toFixed(2)}:1`);
  assert.ok(after >= 4.0, `rust heading face on title scrim ${after.toFixed(2)}:1`);
});

test('ACCENT_RED beats flat rd2 on cream paper panels', () => {
  const before = contrastRatio(P.rd2, PAPER);
  const after = contrastRatio(ACCENT_RED, PAPER);
  assert.ok(after >= before + 4.0, `accent ${after.toFixed(2)}:1 vs rd2 ${before.toFixed(2)}:1`);
});

test('warm halo cream reads against title scrim', () => {
  const ratio = contrastRatio(P.pa5, TITLE_SCRIM);
  assert.ok(ratio >= 8.0, `cream halo on title scrim ${ratio.toFixed(2)}:1`);
});
