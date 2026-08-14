// pixel-font.js — the game's single type face.
//
// THE FACE: "Undead Pixel 8" by Not Jam (CC0). A real, designed pixel font —
// not a hand-rolled glyph table. The sheet, its metrics and its licence ship in
// materials/fonts/not-jam-undead-pixel-8/; scripts/extract-font.mjs slices it
// into src/font-data.js, which is what this module renders.
//
// Canvas font rasterization is deliberately absent: every lit glyph cell is an
// integer fillRect, so nearest-neighbour display scaling stays two-colour crisp
// at any window size. No fillText, no @font-face, no antialiasing, ever.
//
// ONE family, integer scales only. Type roles live in TYPE below; call sites use
// setType(ctx, 'body') rather than inventing pixel sizes.

// NOTE: one line. scripts/build.js strips imports line-by-line, so a wrapped
// import statement would survive into the single-file bundle and break it.
import { FONT_GLYPHS, FONT_CELL_H, FONT_CAP_H, FONT_X_H, FONT_SPACE_ADVANCE, FONT_NAME, FONT_AUTHOR, FONT_LICENSE } from './font-data.js';

const G = FONT_GLYPHS;

/** Letter-spacing, in face pixels, between adjacent glyph inks. */
const TRACKING = 1;

/**
 * THE TYPE SCALE. Three roles, one family, hierarchy by size and colour.
 *
 * `title` is the face at an integer 2× — the only enlarged tier, reserved for
 * the brand and screen mastheads. `body` and `caption` share the 1× raster:
 * this face's cap height is 6px on a 200px-tall canvas (3% — the brief's title
 * band), so a genuinely smaller caption raster would need a second family
 * (forbidden) and would land under the text gate's ink floor. The caption tier
 * is therefore a colour + usage tier, per ROLE.caption in ui.js.
 */
export const TYPE = Object.freeze({
  title: 2,
  body: 1,
  caption: 1,
});

/** Canvas font strings the scale reader understands (kept for legacy call sites). */
const TYPE_FONT = Object.freeze({
  title: '16px pixel',
  body: '8px pixel',
  caption: '8px pixel',
});

/** Set the active type role on a context. Returns the scale for layout maths. */
export function setType(ctx, role) {
  const scale = TYPE[role] || TYPE.body;
  ctx.font = TYPE_FONT[role] || TYPE_FONT.body;
  return scale;
}

/** Rendered line box height for a role, in canvas pixels. */
export function typeHeight(role) {
  return FONT_CELL_H * (TYPE[role] || TYPE.body);
}

// Characters the face does not carry, mapped to ones it does. '·' IS carried
// natively and is left alone.
//
// '¤' is the exception that is carried and still substituted: the face draws it
// as a 4-row ring-and-rays that collapses into two blobs at native size — it
// read as "xx" beside every figure in the ledger, which is a legibility defect,
// not a style. The authored copy keeps '¤' (it is the register's mark); it
// renders as the genre's gold suffix, and the headline ledger figures carry the
// licensed gold ICON instead of any glyph at all.
const REPLACE = {
  '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '−': '-',
  '•': '*', '×': 'x', '→': '>', '←': '<', '►': '>',
  '◄': '<', '✓': 'V', '✗': 'X', '⚠': '!', '…': '...', '≥': '>', '≤': '<',
  '▸': '>', '∎': '#', '¤': 'G',
};

function expanded(text) {
  let out = '';
  for (const raw of String(text == null ? '' : text)) {
    const clean = REPLACE[raw] !== undefined ? REPLACE[raw] : raw;
    for (const ch of clean) {
      if (G[ch]) { out += ch; continue; }
      // Fold an accent away before giving up; '?' is the loud last resort.
      const folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      out += (folded && G[folded[0]]) ? folded[0] : '?';
    }
  }
  return out;
}

/**
 * Read the scale off a context. Any font ≥9px is the 2× title tier; everything
 * else renders 1×. (The pre-font-swap call sites used 6/7/8/10px strings and
 * still resolve correctly through this rule.)
 */
function pixelScale(ctx) {
  const match = /([0-9.]+)px/.exec(String(ctx && ctx.font || '8px'));
  return match && Number(match[1]) >= 9 ? 2 : 1;
}

/** Ink width + advance for one character. Glyphs arrive pre-trimmed. */
function bounds(ch) {
  const rows = G[ch];
  if (!rows || rows.length === 0 || !rows[0]) return { width: FONT_SPACE_ADVANCE, advance: FONT_SPACE_ADVANCE };
  const width = rows[0].length;
  return { width, advance: width + TRACKING };
}

function logicalWidth(chars) {
  let width = 0;
  for (const ch of chars) width += bounds(ch).advance;
  return width ? width - TRACKING : 0;
}

export function pixelTextWidth(ctx, text) {
  return logicalWidth(expanded(text)) * pixelScale(ctx);
}

export function pixelText(ctx, text, x, y) {
  const chars = expanded(text);
  if (!chars) return 0;
  const scale = pixelScale(ctx);
  const width = logicalWidth(chars) * scale;
  let left = Math.round(x);
  if (ctx.textAlign === 'right' || ctx.textAlign === 'end') left -= width;
  else if (ctx.textAlign === 'center') left -= Math.floor(width / 2);
  const top = Math.round(y);
  if (Array.isArray(ctx.__pixelTextEvents)) ctx.__pixelTextEvents.push({
    text: String(text == null ? '' : text), x: left, y: top, w: width, h: FONT_CELL_H * scale,
    stack: ctx.__pixelTextStack || null,
  });
  let cursor = 0;
  for (let ci = 0; ci < chars.length; ci++) {
    const rows = G[chars[ci]];
    const metric = bounds(chars[ci]);
    if (rows && rows.length) {
      for (let row = 0; row < rows.length; row++) {
        const bits = rows[row];
        let col = 0;
        while (col < bits.length) {
          while (col < bits.length && bits[col] !== '1') col++;
          const start = col;
          while (col < bits.length && bits[col] === '1') col++;
          if (start < col) {
            ctx.fillRect(left + (cursor + start) * scale, top + row * scale, (col - start) * scale, scale);
          }
        }
      }
    }
    cursor += metric.advance;
  }
  return width;
}

export const PIXEL_FONT = Object.freeze({
  name: FONT_NAME,
  author: FONT_AUTHOR,
  license: FONT_LICENSE,
  cellWidth: 5, // the modal advance; widths are proportional per glyph
  cellHeight: FONT_CELL_H,
  capHeight: FONT_CAP_H,
  xHeight: FONT_X_H,
  proportional: true,
});

/** The raw bitmap rows for one character (used by the face's regression tests). */
export function glyphRows(ch) {
  const rows = G[ch] || G['?'];
  return rows.slice();
}
