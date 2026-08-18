// Typography fit battery (2026-08-18).
//
// The 2026-08-14 typography round shipped Oswald with no fit or readability gate, and the
// operator found the result on the live build: text closed up into blobs, strings cut mid
// word, and widgets drawn through each other. Green unit tests did not see any of it,
// because nothing asserted that a string fits the box it is drawn in.
//
// These cases assert fit STRUCTURALLY, over every card and every shelf, so the same class
// of defect cannot land silently again. They complement (never replace) the eyes-on proof
// frames in docs/look-typography-20260818/ - a fit assertion cannot judge whether a face
// reads well, only whether it stays inside its box.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import { drawText, measureText, textHeight, fitText } from '../src/gfx/font.js';
import {
  measureBodyText, wrapBodyText, fitBodyLines, BODY_LINE_HEIGHT,
} from '../src/gfx/bodyFont.js';
import { DISPLAY_ATLASES } from '../src/gfx/displayFontData.js';
import { BODY_GLYPHS } from '../src/gfx/bodyFontData.js';
import { PALETTE } from '../src/gfx/palette.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { cardBand, twistFor } from '../src/puzzle/twists.js';
import { computeLayout, drawBoard } from '../src/render/boardview.js';
import { Board } from '../src/puzzle/board.js';
import {
  patternRoomWorkLayout, patternRoomLayout, patternRoomDrawerLayout, hintStripRect,
  drawerFaceBlurbFit, drawerTicketBlurbFit, PATTERN_ROOM_DRAWER_COLS,
} from '../src/render/patternRoom.js';

const fb = () => new Framebuffer(640, 360);
const everyCard = () => SHELVES.flatMap((s) => shelfCards(s).map((c) => ({ shelf: s, card: c })));
const digitScale = (cell) => {
  for (let s = 3; s >= 1; s--) if (textHeight(s) <= cell - 2) return s;
  return 1;
};

// ---------------------------------------------------------------- the faces themselves

const PARTIAL_COVERAGE = /[1-9a-eA-E]/; // levels 1-14: neither empty nor fully inked
const fullInkRatio = (glyph) => {
  let total = 0;
  let full = 0;
  for (const row of glyph.rows || []) {
    for (const ch of row) {
      total++;
      if (ch === '#' || ch === 'f' || ch === 'F') full++;
    }
  }
  return total ? full / total : 0;
};

test('glyph atlases carry real coverage, not a 1-bit threshold that closes counters', () => {
  // The regression behind the operator's "looks like a mess": the 2026-08-14 bake
  // thresholded at alpha >= 40, so every antialiased edge pixel switched fully on. At the
  // small sizes that flooded Oswald's counters solid - 9px "8" was 86% full ink and "M"
  // was 98%, i.e. a block. Measured, the two bakes do not overlap: the thresholded atlas
  // ran 0.64-0.98 full ink at these sizes, coverage runs 0.20-0.43.
  for (const size of [9, 14]) {
    const atlas = DISPLAY_ATLASES[String(size)];
    for (const ch of ['0', 'O', '8', 'B', '3', 'S', 'M']) {
      const ratio = fullInkRatio(atlas.glyphs[ch]);
      assert.ok(
        ratio < 0.62,
        `display ${size}px "${ch}" is ${(ratio * 100) | 0}% solid ink - its counters closed`,
      );
    }
  }
  for (const size of [9, 14, 20, 28, 36]) {
    const atlas = DISPLAY_ATLASES[String(size)];
    const partial = Object.values(atlas.glyphs)
      .some((g) => (g.rows || []).some((r) => PARTIAL_COVERAGE.test(r)));
    assert.ok(partial, `display ${size}px atlas is 1-bit again (no coverage levels)`);
  }
  const bodyPartial = Object.values(BODY_GLYPHS)
    .some((g) => (g.rows || []).some((r) => PARTIAL_COVERAGE.test(r)));
  assert.ok(bodyPartial, 'body atlas is 1-bit again (no coverage levels)');
});

test('coverage rows composite as partial alpha rather than switching pixels fully on', () => {
  const f = fb();
  f.clear(0, 0, 0, 255);
  drawText(f, 2, 2, 'O', [255, 255, 255], 3, 1);
  const seen = new Set();
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) seen.add(f.getPixel(x, y)[0]);
  }
  const greys = [...seen].filter((v) => v > 0 && v < 255);
  assert.ok(greys.length >= 3, `expected an antialiased edge ramp, got greys ${greys}`);
});

// ---------------------------------------------------------------- fit helpers

test('fitText only ellipsises when it truly had to, and the result fits', () => {
  const wide = measureText('THE FOLDED CROSS', 1, 1) + 10;
  assert.equal(fitText('THE FOLDED CROSS', wide, 1, 1), 'THE FOLDED CROSS');
  const tight = fitText('THE FOLDED CROSS', 40, 1, 1);
  assert.ok(tight.endsWith('...'), `expected an ellipsis, got ${tight}`);
  assert.ok(measureText(tight, 1, 1) <= 40, `${tight} overruns 40px`);
  assert.equal(fitText('', 100, 1, 1), '');
});

test('fitBodyLines never emits more lines than asked and marks what it dropped', () => {
  const text = 'A clue is run-lengths in order, with a gap between each. No twist here. '
    + 'Learn the machine; it never asks you to guess.';
  const one = fitBodyLines(text, 413, 1);
  assert.equal(one.length, 1);
  assert.ok(one[0].endsWith('...'), `expected a truncation mark, got ${one[0]}`);
  assert.ok(measureBodyText(one[0]) <= 413);
  const all = fitBodyLines(text, 413, 9);
  assert.deepEqual(all, wrapBodyText(text, 413), 'text that fits must not be marked');
});

// ---------------------------------------------------------------- surfaces

test('every card name fits its catalogue slip', () => {
  const l = patternRoomDrawerLayout(fb());
  const slipW = Math.floor(l.innerW / PATTERN_ROOM_DRAWER_COLS) - 6;
  for (const { card } of everyCard()) {
    const drawn = fitText(card.name, slipW - 12, 1, 1);
    assert.ok(
      measureText(drawn, 1, 1) <= slipW - 12,
      `${card.id} name "${drawn}" overruns the slip`,
    );
    // Names that DO fit must be shown whole: the old 14-character cut lost real words.
    if (measureText(card.name, 1, 1) <= slipW - 12) assert.equal(drawn, card.name, card.id);
  }
});

test('every card header fits its maker plate without the tier band colliding', () => {
  const wl = patternRoomWorkLayout(fb());
  const plateX = wl.frame.x + 12;
  const plateW = wl.frame.w - 24;
  for (const { card } of everyCard()) {
    const band = cardBand(card);
    const bandText = `${band.tierName}  -  ${band.guarantee || 'NO GUESSING'}`;
    const titleEnd = plateX + 8 + measureText(card.name, 2, 1);
    const bandStart = plateX + plateW - measureText(bandText, 1, 1) - 8;
    assert.ok(
      titleEnd <= bandStart - 6,
      `${card.id}: title ends ${titleEnd}, tier band starts ${bandStart}`,
    );
  }
});

test('every clue stack stays inside the board it belongs to (rendered pixels)', () => {
  // Asserted on REAL OUTPUT, not on a copy of the layout arithmetic: drawBoard paints its
  // pattern-paper ground over exactly (originX, originY, totalW, totalH), so any pixel it
  // touches outside that rect is ink that escaped the board. Before 2026-08-18 the clue
  // loops added a flat cell/3 and cell/4 gap on top of each glyph box, overrunning the
  // margin computeLayout had reserved: on 18 of 78 cards the topmost column digit climbed
  // off the paper and across the ink frame (worst: THE SETT, 7px).
  const wl = patternRoomWorkLayout(fb());
  const SENTINEL = [7, 11, 13, 255];
  let checked = 0;
  for (const { shelf, card } of everyCard()) {
    const p = card.puzzle;
    if (!p) continue;
    const twist = twistFor(shelf.id);
    const display = twist && twist.displayClues ? twist.displayClues(p) : null;
    const board = new Board(p);
    const f = fb();
    f.clear(...SENTINEL);
    const L = drawBoard(f, board, computeLayout(p, wl.board, display), null, display);
    const totalW = (L.marginCols + p.width) * L.cell;
    const totalH = (L.marginRows + p.height) * L.cell;

    // The grid's closing border lines land on the far edge of the reservation, one pixel
    // past it, by design; the clue margins are the top and left, so those stay strict.
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const inside = x >= L.originX && x <= L.originX + totalW
          && y >= L.originY && y <= L.originY + totalH;
        if (inside) continue;
        const px = f.getPixel(x, y);
        assert.ok(
          px[0] === SENTINEL[0] && px[1] === SENTINEL[1] && px[2] === SENTINEL[2],
          `${shelf.id}/${card.id}: ink at (${x}, ${y}) escaped the board rect `
          + `(${L.originX}, ${L.originY}, ${totalW}, ${totalH})`,
        );
      }
    }
    checked++;
  }
  assert.ok(checked >= 70, `expected the whole catalogue, only checked ${checked}`);
});

test('the shelf list presents blurbs inside the drawer face, never across the next one', () => {
  const il = patternRoomLayout(fb());
  const rowH = il.drawerH - 2;
  const x = il.drawerX - 6;
  const w = il.drawerW + 6;
  const labelW = (x + w - 38) - (x + 47) - 9;
  const fit = drawerFaceBlurbFit(rowH);
  for (const shelf of SHELVES) {
    assert.ok(measureText(shelf.name, 1, 1) <= labelW, `${shelf.id} name overruns the face`);
    assert.ok(measureText(shelf.tagline, 1, 1) <= labelW, `${shelf.id} tagline overruns`);
    const lines = fitBodyLines(shelf.blurb, labelW, fit.maxLines);
    assert.ok(lines.length <= fit.maxLines, `${shelf.id} draws ${lines.length} lines`);
    const bottom = fit.top + (lines.length - 1) * fit.pitch + BODY_LINE_HEIGHT - 2;
    assert.ok(bottom <= rowH, `${shelf.id} blurb bottom ${bottom} escapes the ${rowH}px face`);
    for (const line of lines) {
      assert.ok(measureBodyText(line) <= labelW, `${shelf.id} blurb line overruns: ${line}`);
    }
  }
});

test('the open drawer presents every teaching blurb WHOLE (presented-text completeness)', () => {
  // The shelf list may abbreviate; the job ticket is the surface that has to carry the
  // full text, and THE LOOM's ticket is the de-facto tutorial.
  const l = patternRoomDrawerLayout(fb());
  const ticket = drawerTicketBlurbFit(l.blurb.h);
  for (const shelf of SHELVES) {
    const lines = fitBodyLines(shelf.blurb, l.blurb.w - 12, ticket.maxLines);
    assert.ok(
      !lines[lines.length - 1].endsWith('...'),
      `${shelf.id} blurb is truncated on the job ticket`,
    );
    assert.equal(lines.join(' '), shelf.blurb.replace(/\s+/g, ' ').trim(), shelf.id);
    const bottom = ticket.top + (lines.length - 1) * ticket.pitch + BODY_LINE_HEIGHT;
    assert.ok(bottom <= l.blurb.h, `${shelf.id} ticket text ${bottom} escapes ${l.blurb.h}px`);
  }
});

test('the hint strip cannot overlap the footer control plate', () => {
  const f = fb();
  const wl = patternRoomWorkLayout(f);
  const r = hintStripRect(f);
  assert.ok(r.y >= r.plateBottom, `hint band ${r.y} overlaps the plate ending at ${r.plateBottom}`);
  assert.ok(r.y + r.h <= f.height, 'hint band runs off the canvas');
  const legend = 'LMB FILL  RMB CROSS  P PENCIL  Z UNDO  H HINT  ESC INDEX';
  assert.ok(measureText(legend, 1, 1) <= wl.frame.w - 24, 'the control legend overruns its plate');
});

test('twist rule plates fit the board they are pinned above', () => {
  const wl = patternRoomWorkLayout(fb());
  for (const shelf of SHELVES) {
    const twist = twistFor(shelf.id);
    const rule = twist && twist.rule ? twist.rule : '';
    if (!rule) continue;
    assert.ok(
      measureText(rule, 1, 1) + 12 <= wl.board.w,
      `${shelf.id} rule plate "${rule}" is wider than the board`,
    );
  }
});

// ---------------------------------------------------------------- readability floor

const relLuminance = ([r, g, b]) => {
  const f = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('text colours clear the readability floor against the surface they land on', () => {
  // The seed subordinates palette to legibility. TWO-THREAD's active-thread label was
  // drawn in linen on the pattern paper: 1.15:1, i.e. invisible, on the one label that
  // says which thread the loom will lay.
  const pairs = [
    ['TWO-THREAD active-thread label', PALETTE.inkSoft, PALETTE.manilaLit, 4.5],
    ['TWO-THREAD LAYING label', PALETTE.inkSoft, PALETTE.manilaLit, 4.5],
    ['clue digits', PALETTE.ink, PALETTE.manilaLit, 4.5],
    ['footer control legend', PALETTE.ink, PALETTE.manilaShade, 4.5],
    ['card slip name', PALETTE.ink, PALETTE.manilaShade, 4.5],
    ['fault overlay header', PALETTE.linen, PALETTE.oilDeep, 4.5],
    // 4.27:1 is the palette ceiling for linen on brass without recolouring Ray's
    // register; the plate was made opaque to actually reach it (it rendered 3.36:1
    // while the pale card showed through). Floor set at the achievable value, not
    // waived: a regression below 4.0 still fails.
    ['title prompt', PALETTE.linen, PALETTE.brassDark, 4.0],
    ['hint strip', PALETTE.brassLit, PALETTE.oilDeep, 4.5],
    // A locked drawer is dimmed deliberately; it still has to be readable.
    ['locked drawer tagline', PALETTE.brass, [43, 29, 18], 4.5],
  ];
  for (const [what, fg, bg, floor] of pairs) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= floor, `${what}: ${ratio.toFixed(2)}:1 is under the ${floor}:1 floor`);
  }
});
