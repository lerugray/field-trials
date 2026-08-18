// GATE 5 — the legibility floor, measured (DESIGN-SEED §8.5). Minimum text size and contrast are
// measured on the built artifact's fixed 640x360 buffer and asserted as numbers. Dwell time is
// unbounded by construction (the administration phase is untimed; the pacing law), recorded in the
// milestone proof.
//
// M7a: the contrast half now measures TEXT_PAIRS, the list of foreground/background pairings the
// renderer ACTUALLY draws, rather than a guessed matrix of every colour against every panel. That
// is a stricter gate, not a looser one: the old form could not see the ledger's ink-on-paper
// pairings at all, because before the palette pass there was no paper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_TEXT_PX, TEXT_PAIRS } from '../src/render.js';
import { C, RAMPS } from '../src/palette.js';

// WCAG relative luminance and contrast ratio.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test('the minimum text size holds the floor (>= 8px in the native buffer)', () => {
  assert.ok(MIN_TEXT_PX >= 8, `minimum text size ${MIN_TEXT_PX}px is below the 8px floor`);
});

test('readable text meets the contrast floor on every surface it is drawn on (>= 4.5:1)', () => {
  assert.ok(TEXT_PAIRS.length >= 10, 'the pairing list has gone thin; it must cover what is drawn');
  let worst = Infinity;
  for (const pair of TEXT_PAIRS) {
    const ratio = contrast(pair.fg, pair.bg);
    assert.ok(ratio >= 4.5, `${pair.name}: ${pair.fg} on ${pair.bg} is ${ratio.toFixed(2)}:1, below the 4.5:1 floor`);
    worst = Math.min(worst, ratio);
  }
  // Recorded rather than merely asserted, so the milestone proof can quote a number.
  assert.ok(worst >= 4.5, `the worst measured pairing is ${worst.toFixed(2)}:1`);
});

test('the ledger reads as ink on paper, both directions of the pairing', () => {
  // The ledger is the lit half of the desk: dark ink on light manila. If that ever inverts, the
  // whole composition has changed and the gate should say so out loud.
  assert.ok(luminance(C.paperBase) > luminance(C.inkBody), 'the ledger paper is no longer lighter than its ink');
  assert.ok(luminance(C.sectionText) > luminance(C.sectionVoid), 'the section text is no longer lighter than the section');
});

test('the gold seam marker clears the large-text contrast floor (>= 3:1)', () => {
  // Brass is a fill/marker colour, not body text; it holds the AA large-element floor against the
  // section it is drawn into.
  assert.ok(contrast(C.brassBright, C.sectionVoid) >= 3, 'the gold seam marker is below the 3:1 floor');
  assert.ok(contrast(RAMPS.brass[4], C.sectionVoid) >= 3, 'a mid brass step is below the 3:1 floor');
});
