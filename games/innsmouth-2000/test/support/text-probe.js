// A recording 2D-context probe for the TEXT-OVERFLOW DETECTOR (M8, DIRECTIONS-M8-text-overflow).
//
// It records every fillText/strokeText the chrome draws, with the pixel box each glyph run occupies,
// so a test can measure rendered text extents against their container boxes and FAIL on any clip or
// escape. The monospace advance is now sourced from src/ui.js (monoAdvance) so the Node detector
// stays in lock-step with the layout helpers at every chrome scale.
//
// Vertical extent uses the canvas baseline conventions (ascent ~0.8em over the baseline, descent
// ~0.2em under it; a middle baseline splits the em). That is enough to catch a line whose baseline
// sits so low its descenders fall out of the panel.

import { monoAdvance } from '../../src/ui.js';

function fontPx(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font || '');
  return m ? parseFloat(m[1]) : 12;
}

// The horizontal extent [left,right] of a run drawn at x with the current textAlign.
function extentX(x, width, align) {
  if (align === 'center') return [x - width / 2, x + width / 2];
  if (align === 'right' || align === 'end') return [x - width, x];
  return [x, x + width]; // left / start
}

// The vertical extent [top,bottom] of a run whose baseline is at y, per textBaseline.
function extentY(y, px, baseline) {
  if (baseline === 'middle') return [y - px * 0.5, y + px * 0.5];
  if (baseline === 'top' || baseline === 'hanging') return [y, y + px];
  if (baseline === 'bottom') return [y - px, y];
  return [y - px * 0.8, y + px * 0.2]; // alphabetic / ideographic
}

// Build a probe: { ctx, texts }. `ctx` is a full no-op canvas context that also measures text and
// records every text run into `texts`. Each record: { text, x, y, px, align, baseline, box:{x,y,w,h} }.
export function makeProbe() {
  const texts = [];
  const noop = () => {};
  const ctx = {
    font: '12px monospace',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, lineJoin: 'miter', lineCap: 'butt',
    measureText(s) { const px = fontPx(this.font); return { width: String(s).length * px * monoAdvance(px) }; },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
  };
  const record = (s, x, y) => {
    const str = String(s);
    if (str.length === 0) return;
    const px = fontPx(ctx.font);
    const width = str.length * px * monoAdvance(px);
    const [left, right] = extentX(x, width, ctx.textAlign);
    const [top, bottom] = extentY(y, px, ctx.textBaseline);
    texts.push({
      text: str, x, y, px, align: ctx.textAlign, baseline: ctx.textBaseline,
      box: { x: left, y: top, w: right - left, h: bottom - top },
    });
  };
  ctx.fillText = record;
  ctx.strokeText = record;
  for (const m of [
    'fillRect', 'strokeRect', 'clearRect',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
    'rect', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'clip',
    'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform', 'resetTransform',
    'setLineDash', 'drawImage',
  ]) ctx[m] = noop;
  return { ctx, texts };
}

const EPS = 0.5; // sub-pixel tolerance: a half-pixel over the edge is not a visible clip.

// Return the text runs that escape a container box (any edge). `box` is {x,y,w,h}.
export function escapes(texts, box) {
  const out = [];
  for (const t of texts) {
    const b = t.box;
    const overL = box.x - b.x;
    const overR = (b.x + b.w) - (box.x + box.w);
    const overT = box.y - b.y;
    const overB = (b.y + b.h) - (box.y + box.h);
    const over = Math.max(overL, overR, overT, overB);
    if (over > EPS) {
      const edge = over === overR ? 'right' : over === overL ? 'left' : over === overB ? 'bottom' : 'top';
      out.push({ text: t.text, edge, over: Math.round(over * 10) / 10, box: t.box });
    }
  }
  return out;
}

// Return pairs of texts on (about) the same baseline whose horizontal boxes overlap — a two-column
// row whose left label has run into its right-aligned value. `rowEps` groups by baseline y.
export function rowCollisions(texts, rowEps = 4) {
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (Math.abs(a.y - b.y) > rowEps) continue;
      const aR = a.box.x + a.box.w, bR = b.box.x + b.box.w;
      const overlap = Math.min(aR, bR) - Math.max(a.box.x, b.box.x);
      if (overlap > EPS) out.push({ a: a.text, b: b.text, overlap: Math.round(overlap * 10) / 10 });
    }
  }
  return out;
}
