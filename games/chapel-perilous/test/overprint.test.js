import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTitleDrawList, buildCreationDrawList,
  bustBoxFor, bustLeft, bandsOverlap, rowBand, CANVAS_W, CANVAS_H,
} from '../src/engine/layout.js';
import {
  buildCombatDrawList, buildDeathDrawList, buildBuildingDrawList, buildJournalDrawList, buildSneakDrawList,
} from '../src/engine/panels.js';
import { buildNatureDrawList } from '../src/engine/chrome.js';

// DIRECTIONS-2026-08-02-WORLD-CHARACTER §4: no text or image may overprint
// another element on ANY in-game surface, at any supported window size. These
// gates drive every draw-list with ADVERSARIAL over-long content and assert:
//   (a) no row runs past the card's right margin (no clip off the card),
//   (b) no two rows overlap in 2D (nothing prints over itself),
//   (c) on bust cards, no row enters the character-picture's x-band (no text
//       over the bust) — using the SAME shared bust box the shell draws from.

const LONG = 'Aloysius Quintilian-Thibodeaux the Thrice-Recanted Undersecretary of the Provisional Bureau of Impossible Cadastres';
const LONGER = `${LONG} ${LONG}`;

// Every row sits within the card's horizontal content box (no clip).
function assertNoClip(rows, width, marginX, label) {
  for (const r of rows) {
    assert.ok(r.x >= marginX - 0.5, `${label}: row x ${r.x} < margin ${marginX} — "${r.text}"`);
    assert.ok(r.x + r.width <= width - marginX + 0.5,
      `${label}: row right ${(r.x + r.width).toFixed(1)} > ${width - marginX} — clips card — "${r.text}"`);
  }
}

// No two distinct rows overlap in both axes (left-aligned rows share x, so a
// vertical-band overlap IS a 2D overlap → "printing over itself").
function assertNoSelfOverlap(rows, label) {
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (!a.text && !b.text) continue;
      const horiz = a.x < b.x + b.width && b.x < a.x + a.width;
      if (horiz && bandsOverlap(a, b)) {
        assert.fail(`${label}: rows overlap — "${a.text}" ⨯ "${b.text}"`);
      }
    }
  }
}

// No row crosses into the bust's rectangle (text over the character picture).
function assertClearOfBust(rows, box, label) {
  const left = bustLeft(box);
  const top = box.y - box.pad, bottom = box.y + box.size + box.pad;
  for (const r of rows) {
    const band = rowBand(r);
    const vOverlap = band.top < bottom && top < band.bottom;
    if (vOverlap) {
      assert.ok(r.x + r.width <= left + 0.5,
        `${label}: row right ${(r.x + r.width).toFixed(1)} enters bust (left ${left}) — "${r.text}"`);
    }
  }
}

test('COMBAT card: root + talk, over-long note/foes/approaches — no overprint', () => {
  for (const menu of ['root', 'talk']) {
    const rows = buildCombatDrawList({
      foes: Array.from({ length: 6 }, (_, i) => ({ name: `${LONG} #${i}`, hp: 9, maxHp: 12 })),
      party: Array.from({ length: 6 }, (_, i) => ({ name: `${LONG} party ${i}`, hp: 3, maxHp: 8 })),
      round: 3, menu,
      approaches: Array.from({ length: 8 }, (_, i) => ({ verb: `${LONG} verb${i}`, difficulty: 'hard' })),
      note: LONGER,
      log: [LONGER, LONGER, LONGER],
    });
    const label = `combat/${menu}`;
    assertNoClip(rows, CANVAS_W, 16, label);
    assertNoSelfOverlap(rows, label);
    assertClearOfBust(rows, bustBoxFor('combat'), label);
  }
});

test('DEATH card: over-long fallen/name/omen/oddment — no overprint on the HERO bust', () => {
  const rows = buildDeathDrawList({
    fallen: LONG,
    pc: { name: LONG, omen: LONGER, oddment: { name: LONG } },
  });
  assertNoClip(rows, CANVAS_W, 20, 'death');
  assertNoSelfOverlap(rows, 'death');
  assertClearOfBust(rows, bustBoxFor('death'), 'death');
});

test('CREATION card: over-long dealt name/omen — no overprint on the HERO bust', () => {
  const pc = { name: LONG, stats: { nerve: 'SHARP', craft: 'STEADY', pull: 'OPEN', gnosis: 'DIM' }, omen: LONGER, oddment: { name: LONG } };
  const rows = buildCreationDrawList({ pc });
  assertNoClip(rows, CANVAS_W, 20, 'creation');
  assertNoSelfOverlap(rows, 'creation');
  assertClearOfBust(rows, bustBoxFor('creation'), 'creation');
});

test('JOURNAL card: writing + reading with over-long draft/entries — no overprint', () => {
  const writing = buildJournalDrawList({ writing: true, editing: true, draft: LONGER, place: LONG });
  assertNoClip(writing, CANVAS_W, 18, 'journal/writing');
  assertNoSelfOverlap(writing, 'journal/writing');

  const entries = Array.from({ length: 10 }, (_, i) => ({
    id: i, when: 1000 + i, where: `${LONG} ${i}`, text: LONGER,
    origin: i % 3 === 0 ? 'ghost' : 'own', corruption: i % 2,
  }));
  const reading = buildJournalDrawList({ entries, selectedId: 2 });
  assertNoClip(reading, CANVAS_W, 18, 'journal/reading');
  assertNoSelfOverlap(reading, 'journal/reading');
});

test('SNEAK card: over-long enemy name/note — no overprint on the enemy bust', () => {
  const rows = buildSneakDrawList({ name: LONG, note: LONGER, chance: 0.67 });
  assertNoClip(rows, CANVAS_W, 16, 'sneak');
  assertNoSelfOverlap(rows, 'sneak');
  assertClearOfBust(rows, bustBoxFor('combat'), 'sneak');
});

test('BUILDING card: over-long service lines — no clip, no overprint', () => {
  const rows = buildBuildingDrawList({ name: LONG, lines: [LONGER, LONGER, LONG, LONGER] });
  assertNoClip(rows, CANVAS_W, 20, 'building');
  assertNoSelfOverlap(rows, 'building');
});

test('TITLE card: no overprint (baseline chrome sanity)', () => {
  const rows = buildTitleDrawList({ title: LONG, subtitle: LONGER, intro: LONGER, paletteName: LONG });
  assertNoClip(rows, CANVAS_W, 20, 'title');
  assertNoSelfOverlap(rows, 'title');
});

test('NATURE card: real explainer content — no clip, no self-overlap (cp-016)', () => {
  const rows = buildNatureDrawList();
  assertNoClip(rows, CANVAS_W, 22, 'nature');
  assertNoSelfOverlap(rows, 'nature');
});

test('bust boxes stay inside the card and leave a usable text column', () => {
  for (const kind of ['combat', 'death', 'creation']) {
    const b = bustBoxFor(kind);
    assert.ok(b.x + b.size + b.pad <= CANVAS_W, `${kind} bust within card width`);
    assert.ok(b.y + b.size + b.pad <= CANVAS_H, `${kind} bust within card height`);
    assert.ok(bustLeft(b) > 120, `${kind} leaves a usable text column`);
  }
});
