// Title + HOW TO PLAY layout — pure geometry/copy for overlap tests and render.
// Register: deadpan desk prose (DESIGN-SEED). Pack art keys are named here; main
// draws the licensed sheets. Exemplars are NEVER copied into game text.

import { TEXT_LEADING, CORE_TEXT_HEIGHT, boxesIntersect, NATIVE_W } from './layout.js';

export const TITLE_NAME = 'THE OFFICE OF THE ROAD';
export const TITLE_TAG = 'The desk the heroes report to.';
export const TITLE_SUB = 'An expedition is issued. The road processes it.';

/** Battler keys shown on the title (shipped sv_actors only). */
export const TITLE_BATTLERS = [
  'HEDGE_KNIGHT_BROWN', 'MYSTIC_GREEN', 'WARDEN_GREEN', 'TEMPLAR_BLUE',
];

/** Tarot faces fanned on the title (Pixel Tarot, shipped). */
export const TITLE_TAROT = [
  'the_tower', 'the_star', 'strength', 'temperance', 'death', 'the_sun',
];

export const HOWTO_PAGES = [
  {
    masthead: 'HOW TO PLAY: THE CHARGE',
    lines: [
      'You are the desk. The party marches itself.',
      'The Office issues a mandate. The road does the work.',
      'Combat resolves on standing orders and jobs.',
      'Tarot from the hand is the desk\'s intervention.',
      'At camp and town the file may be edited:',
      'jobs, deck, stores, and the next road.',
      'Death files a report. Certifications persist.',
    ],
  },
  {
    masthead: 'HOW TO PLAY: THE VERBS ON FILE',
    lines: [
      'ADVANCE: pace the march from 0.5× to 4×.',
      'SUSPENSION: suspend proceedings at will (Space).',
      'INTERVENTION: play tarot into a live matter.',
      'REASSIGNMENT: reassign a frame\'s trade at camp.',
      'REQUISITION: issue quartermaster kit in towns.',
      'ROUTING: choose each leg by exact tradeoff.',
      'EARLY RETURN: file an early return at camp.',
    ],
  },
];

const FULL = NATIVE_W - 24;

/**
 * THE TITLE COMPOSITION — one source of truth for the render and the overlap
 * test. Five bands, top to bottom, each with its own air:
 *
 *   brand    the name at 2× (the only enlarged type in the game)
 *   tag      one accent line: what you are
 *   sub      one caption line: what happens
 *   party    four battlers standing on a ground line
 *   hand     the tarot, overlapped like a held hand rather than spaced out
 *   menu     three equal chips, ~63% of canvas width, centred
 *
 * There is deliberately NO scrim. The scene reads through; the menu chips are
 * opaque objects laid on it, which is what gives the screen its depth.
 */
export const TITLE_BAND = Object.freeze({
  brandY: 9, // 2× type: a 16px box
  tagY: 29,
  subY: 40,
  partyY: 52,
  partySize: 36,
  partyPitch: 42,
  handY: 93,
  cardW: 28,
  cardH: 38,
  cardPitch: 19, // well under cardW, so the cards read as a held hand
  menuY: 138,
});

/** Menu chips: same width, same height, same x — the CREDITS row is no longer inset. */
export const TITLE_MENU_W = 200;
export const TITLE_MENU_H = 14;
export const TITLE_MENU_GAP = 3; // ~21% of chip height

/** Menu control rectangles on the title screen (owned, non-overlapping). */
export function titleMenuRects() {
  const w = TITLE_MENU_W, h = TITLE_MENU_H, x = (NATIVE_W - w) >> 1;
  const pitch = h + TITLE_MENU_GAP;
  return [
    { id: 'start', label: 'START', priority: 'primary', rect: { x, y: TITLE_BAND.menuY, w, h } },
    { id: 'howto', label: 'HOW TO PLAY', priority: 'secondary', rect: { x, y: TITLE_BAND.menuY + pitch, w, h } },
    { id: 'credits', label: 'CREDITS', priority: 'secondary', rect: { x, y: TITLE_BAND.menuY + pitch * 2, w, h } },
  ];
}

/** Left edge of the centred party row, and of the overlapped tarot hand. */
export function titlePartyX(count = TITLE_BATTLERS.length) {
  const span = (count - 1) * TITLE_BAND.partyPitch + TITLE_BAND.partySize;
  return (NATIVE_W - span) >> 1;
}
export function titleHandX(count = TITLE_TAROT.length) {
  const span = (count - 1) * TITLE_BAND.cardPitch + TITLE_BAND.cardW;
  return (NATIVE_W - span) >> 1;
}

/**
 * HOW TO PLAY control rectangles (page-aware). Priority is carried by WIDTH:
 * the forward verb is ~1.7× its neighbours at the same height, and the two
 * secondary chips hold the outer corners.
 */
export function howtoMenuRects(pageIndex) {
  const page = pageIndex | 0;
  const last = HOWTO_PAGES.length - 1;
  const rows = [];
  if (page > 0) rows.push({ id: 'prev', label: 'PREV', priority: 'secondary', rect: { x: 12, y: 182, w: 56, h: 14 } });
  if (page < last) rows.push({ id: 'next', label: 'NEXT', priority: 'primary', rect: { x: 74, y: 182, w: 95, h: 14 } });
  rows.push({ id: 'back', label: 'TITLE', priority: page < last ? 'secondary' : 'primary', rect: { x: page < last ? 252 : 175, y: 182, w: page < last ? 56 : 133, h: 14 } });
  return rows;
}

/**
 * Draw-list rows for the title: brand + tag + menu labels.
 * Used by the overlap test (CHP pattern) — art regions are separate rects.
 */
export function buildTitleDrawList() {
  const rows = [];
  rows.push({ region: 'brand', text: TITLE_NAME, x: 12, y: TITLE_BAND.brandY, w: FULL, h: CORE_TEXT_HEIGHT * 2 });
  rows.push({ region: 'brand', text: TITLE_TAG, x: 12, y: TITLE_BAND.tagY, w: FULL, h: CORE_TEXT_HEIGHT });
  rows.push({ region: 'brand', text: TITLE_SUB, x: 24, y: TITLE_BAND.subY, w: FULL - 24, h: CORE_TEXT_HEIGHT });
  for (const c of titleMenuRects()) {
    rows.push({
      region: 'menu', text: c.label,
      x: c.rect.x + 4, y: c.rect.y + 4,
      w: c.rect.w - 8, h: CORE_TEXT_HEIGHT,
      control: c.rect,
    });
  }
  return rows;
}

/** Draw-list rows for a HOW TO PLAY page. */
export function buildHowtoDrawList(pageIndex = 0) {
  const page = HOWTO_PAGES[pageIndex | 0] || HOWTO_PAGES[0];
  const rows = [];
  rows.push({ region: 'header', text: page.masthead, x: 12, y: 14, w: FULL, h: CORE_TEXT_HEIGHT });
  let y = 36;
  for (const line of page.lines) {
    rows.push({ region: 'body', text: line, x: 12, y, w: FULL, h: CORE_TEXT_HEIGHT });
    y += TEXT_LEADING + 1;
  }
  for (const c of howtoMenuRects(pageIndex)) {
    rows.push({
      region: 'menu', text: c.label,
      x: c.rect.x + 4, y: c.rect.y + 4,
      w: c.rect.w - 8, h: CORE_TEXT_HEIGHT,
      control: c.rect,
    });
  }
  return rows;
}

/** Assert no two content rows share ink (menu labels may sit inside controls). */
export function findDrawListOverlaps(rows) {
  const hits = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      // Menu labels that live inside their own control do not collide with each other
      // across different controls if boxes are disjoint — check all content pairs.
      if (a.region === 'menu' && b.region === 'menu') {
        if (boxesIntersect(
          { x: a.x, y: a.y, w: a.w, h: a.h },
          { x: b.x, y: b.y, w: b.w, h: b.h },
        )) hits.push({ a: a.text, b: b.text, aBox: a, bBox: b });
        continue;
      }
      if (a.region === 'menu' || b.region === 'menu') continue; // body vs owned menu label
      if (boxesIntersect(
        { x: a.x, y: a.y, w: a.w, h: a.h },
        { x: b.x, y: b.y, w: b.w, h: b.h },
      )) hits.push({ a: a.text, b: b.text, aBox: a, bBox: b });
    }
  }
  return hits;
}
