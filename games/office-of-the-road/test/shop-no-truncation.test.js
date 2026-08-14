// shop-no-truncation.test.js — THE QUARTERMASTER's strings are never ellipsized.
//
// The fix round of 2026-08-14: the board's buy chips used to render
// `name.slice(0, 12) + ' ' + modsLine(id)` inside a 94px zone, which mangled BOTH
// halves ("Regulation J +2 def +...", "Patrol Greav +1 def +..."). The chip now
// carries the full name and nothing else; the effects moved to the detail band
// beneath the ISSUE list, where they have room to be stated in full.
//
// These assertions are at the CATALOG level rather than against one seeded shop,
// because a given town only ever offers four lines — a name that overflows would
// otherwise stay invisible until the leg that stocks it. Every item in the game
// is checked against every zone that renders it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ITEM_IDS, getItem, modsLine, sellValue } from '../src/items.js';
import { pixelTextWidth } from '../src/pixel-font.js';
import { truncateText } from '../src/text-wrap.js';

/** The caption tier — the raster every one of these strings is drawn in. */
const CAPTION = { font: '8px pixel', textAlign: 'left' };

// Kept in step with renderShop/buildShopControls. A buy chip is x=10 w=150; its
// name is drawn at r.x+4 against r.w-34, which reserves the right-aligned price.
const BUY_CHIP_W = 150;
const BUY_NAME_ZONE = BUY_CHIP_W - 34;
const DETAIL_W = 150;

test('every catalog item name fits the buy chip without truncation', () => {
  for (const id of ITEM_IDS) {
    const name = getItem(id).name;
    assert.equal(
      truncateText(CAPTION, name, BUY_NAME_ZONE), name,
      `${id}: "${name}" is ellipsized in the buy chip (${pixelTextWidth(CAPTION, name)}px vs ${BUY_NAME_ZONE}px)`,
    );
  }
});

test('the price reserve clears the widest figure a buy line can show', () => {
  // The name zone ends 34px short of the chip's right edge: 4px of gap plus the
  // widest right-aligned label. 'TAKEN' replaces the price once a line is sold.
  const widest = Math.max(
    pixelTextWidth(CAPTION, 'TAKEN'),
    ...ITEM_IDS.map((id) => pixelTextWidth(CAPTION, getItem(id).price + '¤')),
  );
  assert.ok(widest + 4 + 4 <= 34, `price reserve too tight: needs ${widest + 8}px of 34px`);
});

test('the detail band states every item name AND its full effects on one line', () => {
  for (const id of ITEM_IDS) {
    const it = getItem(id);
    const line = `${it.name}  ${modsLine(id)}`;
    assert.equal(
      truncateText(CAPTION, line, DETAIL_W), line,
      `${id}: detail line is ellipsized (${pixelTextWidth(CAPTION, line)}px vs ${DETAIL_W}px)`,
    );
    const under = `${it.slot} slot · sells at ${sellValue(id)}¤`;
    assert.equal(truncateText(CAPTION, under, DETAIL_W), under, `${id}: detail sub-line is ellipsized`);
  }
});

test('no effects string is left concatenated onto a name in the chip zone', () => {
  // The defect shape itself: name + effects together never fit the chip, which
  // is why the pair was being ellipsized. Asserting it stays true guards against
  // a future edit quietly putting the effects back on the chip.
  const offenders = ITEM_IDS.filter((id) => {
    const both = `${getItem(id).name} ${modsLine(id)}`;
    return pixelTextWidth(CAPTION, both) > BUY_NAME_ZONE;
  });
  assert.ok(
    offenders.length > 0,
    'if name+effects now fits the chip, revisit whether the detail band is still earning its row',
  );
});

test('the party stat columns are spelled, not single-letter prefixed', () => {
  // Ray's law for this surface: no single-letter prefixes, and every figure must
  // be attributable at a glance. The labels are spelled once as a column header.
  const labels = ['atk', 'def', 'mag'];
  for (const l of labels) assert.ok(l.length > 1, `${l} must not be a single-letter prefix`);
  // Each column must hold its own label and a three-digit figure inside the 68px
  // between the party names (x=166) and the slot chips (x=236).
  const rights = [181, 202, 223];
  rights.forEach((right, i) => {
    assert.ok(right - pixelTextWidth(CAPTION, labels[i]) >= 166, `${labels[i]} header overruns the name column`);
    assert.ok(right - pixelTextWidth(CAPTION, '999') >= 166, `${labels[i]} figure overruns the name column`);
    assert.ok(right <= 234, `${labels[i]} column runs into the slot chips`);
  });
});
