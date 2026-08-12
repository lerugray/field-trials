import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PALETTE,
  PAIRS,
  LEGAL_PAIRS,
  ACCENTS,
  isLegalPair,
  normColor,
} from '../src/render/palette.js';

// Directive item 4 — the READABILITY HARD RULE. Walk every declared text/panel
// pair and assert it is one of the three legal pairs. A regression here means a
// screen picked up an off-register text/background combination.
test('every declared body pair is one of the three legal pairs', () => {
  assert.ok(PAIRS.length >= 4, 'expected the primary/beige-light/beige-dark/header pairs');
  for (const pair of PAIRS) {
    assert.ok(
      isLegalPair(pair.text, pair.panel),
      `pair "${pair.name}" (${pair.text} on ${pair.panel}) is NOT one of the three legal pairs`,
    );
  }
});

test('there are exactly three legal pairs (navy / beige / header)', () => {
  assert.equal(LEGAL_PAIRS.length, 3);
});

test('accents are never used as a body text/panel pair', () => {
  // An accent colour on any panel must NOT validate as a legal body pair — accents
  // are foreground punctuation only.
  for (const accent of ACCENTS) {
    assert.ok(
      !isLegalPair(accent, PALETTE.navyPanel),
      `accent ${accent} must not be a legal body text on the navy panel`,
    );
    assert.ok(
      !isLegalPair(accent, PALETTE.beigeLight),
      `accent ${accent} must not be a legal body text on the beige panel`,
    );
  }
});

test('isLegalPair rejects an off-register combination', () => {
  assert.ok(!isLegalPair('#efeaf6', '#221d33'), 'the old purple register must be illegal now');
  assert.ok(!isLegalPair(PALETTE.navyText, PALETTE.beigeLight), 'warm-white text on beige is illegal');
  assert.ok(!isLegalPair(PALETTE.beigeText, PALETTE.navyPanel), 'dark-navy text on navy is illegal');
});

test('the three legal pairs each validate', () => {
  assert.ok(isLegalPair(PALETTE.navyText, PALETTE.navyPanel));
  assert.ok(isLegalPair(PALETTE.beigeText, PALETTE.beigeLight));
  assert.ok(isLegalPair(PALETTE.beigeText, PALETTE.beigeDark));
  assert.ok(isLegalPair(PALETTE.headerText, PALETTE.headerBand));
});

test('normColor is case- and whitespace-insensitive', () => {
  assert.equal(normColor('  #F4F0E2 '), '#f4f0e2');
  assert.equal(normColor('RGBA(24,36,88,0.82)'), 'rgba(24,36,88,0.82)');
});
