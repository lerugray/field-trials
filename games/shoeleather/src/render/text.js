// SHOELEATHER — text layer model (CLAUDE.md rule 8: text is architectural).
//
// TEXT LAYER LAW: all UI text — notebook, documents, dialogue — renders on a SEPARATE
// crisp layer above the world raster, never baked into the low-res buffer, so text
// stays legible and scalable. Documents get a ZOOM. "Illegible evidence text is a
// blocked case, not a style."
//
// This module is the pure, node-testable part of that layer: word-wrapping and the
// zoom model. The browser draws the wrapped lines with real font rendering on an
// overlay canvas/DOM; the wrap math and zoom state live here so they are tested and
// deterministic. No timers (reading is untimed, forever).

// Word-wrap to a column budget (monospace assumption — the period UI font is fixed
// pitch). Preserves blank lines as paragraph breaks; hard-breaks words longer than
// the budget so nothing overflows and clips.
export function wrapText(text, cols) {
  if (!Number.isInteger(cols) || cols < 1) {
    throw new RangeError(`wrap cols must be a positive integer, got ${cols}`);
  }
  const out = [];
  const paragraphs = String(text).split('\n');
  for (const para of paragraphs) {
    if (para.trim() === '') { out.push(''); continue; }
    let line = '';
    for (const rawWord of para.split(/\s+/).filter(Boolean)) {
      let word = rawWord;
      // Hard-break a word too long to ever fit.
      while (word.length > cols) {
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, cols));
        word = word.slice(cols);
      }
      if (line === '') {
        line = word;
      } else if (line.length + 1 + word.length <= cols) {
        line += ' ' + word;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

// Discrete zoom for the document reader. Font sizes in logical px on the CRISP layer
// (not the low-res world buffer), so zoom is genuine resolution, never a smeary
// upscale of baked pixels.
export const DEFAULT_ZOOM_STEPS = Object.freeze([12, 14, 16, 20, 24, 32]);

export class ZoomModel {
  constructor({ steps = DEFAULT_ZOOM_STEPS, index = 2 } = {}) {
    if (!Array.isArray(steps) || steps.length === 0) throw new TypeError('zoom needs steps');
    this.steps = [...steps];
    this.index = clampIndex(index, this.steps.length);
    this.baseIndex = this.index;
  }

  size() { return this.steps[this.index]; }
  canZoomIn() { return this.index < this.steps.length - 1; }
  canZoomOut() { return this.index > 0; }

  zoomIn() { if (this.canZoomIn()) this.index++; return this.size(); }
  zoomOut() { if (this.canZoomOut()) this.index--; return this.size(); }
  reset() { this.index = this.baseIndex; return this.size(); }

  // Scale relative to the base size — the browser multiplies its base char width by
  // this to recompute the column budget for wrapText().
  scale() { return this.size() / this.steps[this.baseIndex]; }
}

function clampIndex(i, len) {
  i = Math.round(Number(i) || 0);
  if (i < 0) return 0;
  if (i > len - 1) return len - 1;
  return i;
}

// A readable document (letter, ledger, TV listing, ...). Body paragraphs are
// separated by blank lines. The reader lays the body out at the current column budget.
export class DocumentReader {
  constructor({ id, title = '', body = '', zoom = null } = {}) {
    if (!id) throw new TypeError('document needs an id');
    this.id = String(id);
    this.title = String(title);
    this.body = String(body);
    this.zoom = zoom || new ZoomModel();
  }

  // Lay out the body to a column budget. Returns wrapped lines including the title
  // and a blank separator, ready for the crisp text layer to paint.
  layout(cols) {
    const lines = [];
    if (this.title) { lines.push(...wrapText(this.title, cols)); lines.push(''); }
    lines.push(...wrapText(this.body, cols));
    return lines;
  }
}
