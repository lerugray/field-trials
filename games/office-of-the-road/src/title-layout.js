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

/** Menu control rectangles on the title screen (owned, non-overlapping). */
export function titleMenuRects() {
  const w = 120, h = 14, x = (NATIVE_W - w) >> 1;
  return [
    { id: 'start', label: 'START', rect: { x, y: 144, w, h } },
    { id: 'howto', label: 'HOW TO PLAY', rect: { x, y: 162, w, h } },
    { id: 'credits', label: 'CREDITS', rect: { x: x + 20, y: 180, w: w - 40, h: 14 } },
  ];
}

/** HOW TO PLAY control rectangles (page-aware). */
export function howtoMenuRects(pageIndex) {
  const page = pageIndex | 0;
  const last = HOWTO_PAGES.length - 1;
  const rows = [];
  if (page > 0) rows.push({ id: 'prev', label: 'PREV', rect: { x: 12, y: 182, w: 48, h: 14 } });
  if (page < last) rows.push({ id: 'next', label: 'NEXT', rect: { x: 66, y: 182, w: 48, h: 14 } });
  rows.push({ id: 'back', label: 'TITLE', rect: { x: 214, y: 182, w: 94, h: 14 } });
  return rows;
}

/**
 * Draw-list rows for the title: brand + tag + menu labels.
 * Used by the overlap test (CHP pattern) — art regions are separate rects.
 */
export function buildTitleDrawList() {
  const rows = [];
  rows.push({ region: 'brand', text: TITLE_NAME, x: 12, y: 8, w: FULL, h: 14 });
  rows.push({ region: 'brand', text: TITLE_TAG, x: 12, y: 25, w: FULL, h: CORE_TEXT_HEIGHT });
  rows.push({ region: 'brand', text: TITLE_SUB, x: 24, y: 35, w: FULL - 24, h: CORE_TEXT_HEIGHT });
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
