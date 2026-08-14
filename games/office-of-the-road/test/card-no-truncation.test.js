// card-no-truncation.test.js — a CARD NAME is never ellipsized, on any surface
// that prints one. The sibling of shop-no-truncation.test.js, and the same law:
// "…" reads as a defect, so a zone is sized to the catalog rather than a name
// being cut to the zone.
//
// The residue this closes (2026-08-14): the draft screen hung an 11px name
// plate on the 32px card art and drew the name into 32px, which ellipsized
// FIVE of the twelve cards — "Tempe…", "Hange…", "Emper…" were merely the
// three a given draft happened to offer; "Strength" and "Magician" were the
// two waiting to be seen. Line-wrapping cannot rescue any of them: "Temperance"
// is a single unbreakable 47px token, so a 32px zone holds it on no number of
// lines. The zone was the defect, and the draft tile now matches deck review,
// which had already sized itself to the catalog and never truncated.
//
// Assertions are at the CATALOG level, exactly as the shop's are: a draft only
// ever offers three of twelve cards, so a name that overflows stays invisible
// until the run that rolls it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD_IDS, getCard, cardPlateName } from '../src/deck.js';
import { pixelTextWidth } from '../src/pixel-font.js';
import { truncateText } from '../src/text-wrap.js';
import {
  DRAFT_TILE, draftTileX, CONTROL_BAND_Y, CONTENT_TEXT_MAX_Y, CORE_TEXT_HEIGHT, NATIVE_W,
} from '../src/layout.js';

/** The caption tier — the raster every card name is drawn in. */
const CAPTION = { font: '8px pixel', textAlign: 'left' };

// Deck review's card tile, kept in step with buildDeckControls(): a 50px rect
// whose name is drawn against r.w - 2. It already cleared the catalog; asserted
// here so a future grid re-pitch cannot quietly reintroduce the defect.
const DECK_TILE_W = 50;
const DECK_NAME_ZONE = DECK_TILE_W - 2;

test('every card name fits the DRAFT plate without truncation', () => {
  for (const id of CARD_IDS) {
    const name = cardPlateName(id);
    assert.equal(
      truncateText(CAPTION, name, DRAFT_TILE.nameW), name,
      `${id}: "${name}" is ellipsized on the draft plate (${pixelTextWidth(CAPTION, name)}px vs ${DRAFT_TILE.nameW}px)`,
    );
  }
});

test('every card name fits the DECK REVIEW plate without truncation', () => {
  for (const id of CARD_IDS) {
    const name = cardPlateName(id);
    assert.equal(
      truncateText(CAPTION, name, DECK_NAME_ZONE), name,
      `${id}: "${name}" is ellipsized in deck review (${pixelTextWidth(CAPTION, name)}px vs ${DECK_NAME_ZONE}px)`,
    );
  }
});

test('a plate name drops the article and abbreviates nothing else', () => {
  for (const id of CARD_IDS) {
    const full = getCard(id).name;
    const plate = cardPlateName(id);
    assert.ok(full.endsWith(plate), `${id}: plate name "${plate}" is not a tail of "${full}"`);
    assert.equal(plate, full.replace(/^The /, ''), `${id}: plate name is not just the article dropped`);
    assert.ok(!/[.…]$/.test(plate), `${id}: plate name ends in an ellipsis or full stop`);
  }
});

test('a centred plate name stays inside its own tile', () => {
  // The renderer centres the name on the tile; a name that fits the zone must
  // also fit the tile once centred, or it would paint over the plate's edge.
  for (const id of CARD_IDS) {
    const w = pixelTextWidth(CAPTION, cardPlateName(id));
    const left = Math.max(1, (DRAFT_TILE.w - w) >> 1);
    assert.ok(left >= 1, `${id}: centred name starts outside the tile`);
    assert.ok(left + w <= DRAFT_TILE.w, `${id}: centred name (${w}px) overruns the ${DRAFT_TILE.w}px tile`);
  }
});

test('the draft row seats three tiles, their pointers and DECLINE on the native raster', () => {
  const tiles = [0, 1, 2].map((i) => ({ x: draftTileX(i), w: DRAFT_TILE.w }));
  const decline = { x: DRAFT_TILE.declineX, w: DRAFT_TILE.declineW };
  assert.ok(tiles[0].x - 8 >= 0, 'the first tile\'s focus pointer runs off the left edge');
  for (let i = 1; i < tiles.length; i++) {
    const prevRight = tiles[i - 1].x + tiles[i - 1].w;
    assert.ok(tiles[i].x >= prevRight, `tile ${i} overlaps tile ${i - 1}`);
    // The pointer is drawn 8px left of the tile and is 4px wide; it must land in
    // the gutter, never on the neighbour it is not marking.
    assert.ok(tiles[i].x - 8 > prevRight, `tile ${i}'s focus pointer overlaps tile ${i - 1}`);
  }
  const lastRight = tiles[2].x + tiles[2].w;
  assert.ok(decline.x > lastRight, 'DECLINE overlaps the third card tile');
  assert.ok(decline.x + decline.w <= NATIVE_W, 'DECLINE runs off the right edge');
});

test('the draft block is budgeted clear of the live control band', () => {
  const plateBottom = DRAFT_TILE.plateY + DRAFT_TILE.plateH;
  assert.ok(plateBottom <= CONTROL_BAND_Y, `name plate (ends ${plateBottom}) runs into the control band at ${CONTROL_BAND_Y}`);
  assert.ok(DRAFT_TILE.nameY <= CONTENT_TEXT_MAX_Y, `name row (${DRAFT_TILE.nameY}) breaks the content-text ceiling ${CONTENT_TEXT_MAX_Y}`);
  assert.ok(DRAFT_TILE.nameY >= DRAFT_TILE.plateY, 'the name is drawn above its own plate');
  assert.ok(DRAFT_TILE.nameY + CORE_TEXT_HEIGHT <= plateBottom + 1, 'the name overhangs the bottom of its plate');
  assert.ok(DRAFT_TILE.artY + DRAFT_TILE.artH < DRAFT_TILE.plateY, 'the plate overlaps the card art');
  const declineBottom = DRAFT_TILE.declineY + DRAFT_TILE.declineH;
  assert.ok(declineBottom <= CONTROL_BAND_Y, `DECLINE (ends ${declineBottom}) runs into the control band`);
});

test('the tile is wider than the art because the CATALOG sized it', () => {
  // The defect shape itself. If the art ever grows past the name, or the names
  // ever shrink under the art, this pairing should be reconsidered on purpose
  // rather than by drift.
  const widest = Math.max(...CARD_IDS.map((id) => pixelTextWidth(CAPTION, cardPlateName(id))));
  assert.ok(widest > DRAFT_TILE.artW, `no name exceeds the ${DRAFT_TILE.artW}px art any more; the wide tile may no longer be earning itself`);
  assert.ok(DRAFT_TILE.nameW >= widest, `the name zone (${DRAFT_TILE.nameW}px) no longer clears the widest name (${widest}px)`);
  assert.ok(DRAFT_TILE.nameW <= DRAFT_TILE.w - 2, 'the name zone must leave the plate its own edge');
});

test('the focused-card detail line states the effect in full, unellipsized', () => {
  // The draft already carries the shop's selection-detail-band pattern: the
  // focused card's effect is printed across the full content width at x=12.
  // It is the reason the plate carries only a name, so it is held to the same
  // no-truncation standard.
  const DETAIL_W = NATIVE_W - 24;
  for (const id of CARD_IDS) {
    const text = getCard(id).text;
    assert.equal(
      truncateText(CAPTION, text, DETAIL_W), text,
      `${id}: detail line is ellipsized (${pixelTextWidth(CAPTION, text)}px vs ${DETAIL_W}px)`,
    );
  }
});
