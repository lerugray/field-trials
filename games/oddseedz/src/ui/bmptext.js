// Bridge between the DOM UI and the code-drawn bitmap font. There are two paths:
//
//  1. bt(text)  — an explicit placeholder <span> for use inside innerHTML templates
//                 (painted by paintBt). Kept for cases that want a fixed colour/scale.
//  2. upgradeTextNodes() — the workhorse: walk the live DOM and replace every text
//                 node with a pixel-crisp <canvas> rendered in the node's computed
//                 colour and size. This is how "render ALL UI text with the bitmap
//                 font, no system-font UI text" holds across the whole app without
//                 rewriting every template string.
//
// A MutationObserver runs the upgrader whenever the DOM changes, so freshly-rendered
// innerHTML is converted on the next frame. Accessibility is preserved: the wrapper
// span carries the original text as aria-label and the canvas is aria-hidden, so
// screen readers still read every label.
//
// Emoji / pictographs have no authored glyph; the upgrader drops them (the locked
// register is emoji-free chrome) rather than paint a .notdef box. Editable form
// controls (<input>, <textarea>) keep the system font — you cannot type into a
// canvas — and are the one sanctioned exception.

import { renderToCanvas, measure, hasGlyph } from '../render/font.js';
import { PALETTE } from '../render/palette.js';

export const ALLOWED_TEXT_COLORS = [
  PALETTE.navyText,
  PALETTE.beigeText,
  PALETTE.headerText,
  PALETTE.accentOrange,
  PALETTE.accentGold,
  PALETTE.accentRed,
].map((c) => c.toLowerCase());

export function isAllowedTextColor(color) {
  return ALLOWED_TEXT_COLORS.includes(String(color).toLowerCase());
}

// --- the upgrader's colour gate (M9.1 directive item 3) ----------------------
// getComputedStyle returns colours as rgb()/rgba(), never the source hex, so the
// hex allowlist above can't match a live computed colour. Parse to RGB and clamp
// to the NEAREST sanctioned colour: an on-register colour lands on itself (a
// no-op), an off-register one snaps to the closest legal colour AND logs a dev
// warning — so drift becomes visible instead of silently painted.

function parseRgb(str) {
  const s = String(str).trim().toLowerCase();
  const hx = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hx) {
    let h = hx[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = s.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/);
  if (rgb) return [Math.round(+rgb[1]), Math.round(+rgb[2]), Math.round(+rgb[3])];
  return null;
}

const ALLOWED_RGB = ALLOWED_TEXT_COLORS.map((hex) => ({ hex, rgb: parseRgb(hex) }));

// Dev = explicit ?debug only. A file:// field-trial player should never see a
// colour-registration warning in the console; the clamp still happens silently.
const IS_DEV =
  typeof location !== 'undefined' &&
  /[?&]debug\b/.test(location.search || '');

const _warnedColors = new Set();

// Clamp any colour to the nearest sanctioned text colour. Returns a sanctioned
// hex. Warns once per distinct off-register colour (in dev) when it had to move.
export function clampTextColor(color) {
  const rgb = parseRgb(color);
  if (!rgb) return PALETTE.navyText;
  let best = ALLOWED_RGB[0];
  let bestD = Infinity;
  for (const a of ALLOWED_RGB) {
    if (!a.rgb) continue;
    const d = (a.rgb[0] - rgb[0]) ** 2 + (a.rgb[1] - rgb[1]) ** 2 + (a.rgb[2] - rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  if (bestD > 0 && IS_DEV && typeof console !== 'undefined') {
    const key = String(color).toLowerCase();
    if (!_warnedColors.has(key)) {
      _warnedColors.add(key);
      console.warn(`[oddseedz] off-register text colour ${color} clamped to ${best.hex}`);
    }
  }
  return best.hex;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function bt(text, { scale = 2, color = PALETTE.navyText, cls = '', block = false } = {}) {
  const c = isAllowedTextColor(color) ? color : PALETTE.navyText;
  const kls = ['bt', block ? 'bt-block' : '', cls].filter(Boolean).join(' ');
  return `<span class="${kls}" role="text" aria-label="${escapeAttr(text)}" data-bt="${escapeAttr(
    text,
  )}" data-s="${scale}" data-c="${c}"></span>`;
}

export function btWidth(text, { scale = 2 } = {}) {
  return measure(text, { scale }).width;
}

export function paintBt(root = document) {
  const spans = root.querySelectorAll('span.bt:not([data-bt-done])');
  for (const span of spans) {
    const text = span.getAttribute('data-bt') || '';
    const scale = Number(span.getAttribute('data-s')) || 2;
    const color = span.getAttribute('data-c') || PALETTE.navyText;
    const canvas = renderToCanvas(text, { scale, color });
    canvas.className = 'bt-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    span.textContent = '';
    span.appendChild(canvas);
    span.setAttribute('data-bt-done', '1');
  }
}

// --- the auto-upgrader -------------------------------------------------------

// Keep only characters the font can draw (letters, digits, punctuation, the
// authored symbols) plus spaces; drop emoji/pictographs and collapse the gaps they
// leave behind.
export function renderableText(str) {
  let out = '';
  for (const ch of String(str)) {
    if (ch === ' ' || ch === ' ') out += ' ';
    else if (hasGlyph(ch)) out += ch;
    // else: unsupported (emoji) — drop it
  }
  return out.replace(/ {2,}/g, ' ');
}

const SKIP_TAGS = new Set(['INPUT', 'TEXTAREA', 'CANVAS', 'SCRIPT', 'STYLE', 'SELECT', 'OPTION']);

// Longest single unbroken word we will paint to a canvas; past this, truncate.
const MAX_WORD_CHARS = 64;

// Map a computed font-size (px) to an integer render scale. Minimum 2 keeps every
// stroke at least 2px — the register forbids thin strokes.
function scaleForPx(px) {
  const s = Math.round(px / 7);
  return Math.max(2, Math.min(5, s));
}

// Replace one text node with a run of per-word bitmap canvases wrapped in an inline
// span. Rendering each WORD as its own inline-block canvas (with real spacer gaps
// between) lets the browser wrap the line at word boundaries exactly like normal
// text — so long labels flow instead of forcing one giant unbreakable box.
function spacer(px) {
  const sp = document.createElement('span');
  sp.className = 'bt-space';
  sp.style.display = 'inline-block';
  sp.style.width = px + 'px';
  sp.setAttribute('aria-hidden', 'true');
  return sp;
}

function upgradeOne(node) {
  const parent = node.parentElement;
  if (!parent) return;
  const raw = node.nodeValue;
  const text = renderableText(raw);
  const leading = /^\s/.test(raw);
  const trailing = /\s$/.test(raw);
  const trimmed = text.trim();
  const cs = getComputedStyle(parent);
  // Route the computed colour through the register gate: on-register is a no-op,
  // off-register clamps to the nearest sanctioned colour + warns in dev.
  const color = clampTextColor(cs.color || PALETTE.navyText);
  const scale = scaleForPx(parseFloat(cs.fontSize) || 14);
  const gap = Math.round(4 * scale); // inter-word space width
  if (!trimmed) {
    parent.replaceChild(spacer(gap), node);
    return;
  }
  const wrap = document.createElement('span');
  wrap.className = 'bt-text';
  wrap.setAttribute('role', 'text');
  wrap.setAttribute('aria-label', raw.trim());
  if (leading) wrap.appendChild(spacer(gap));
  const words = trimmed.split(' ');
  words.forEach((w, i) => {
    if (i > 0) wrap.appendChild(spacer(gap));
    if (!w) return;
    // Cap an individual unbroken word so a pathological no-whitespace string can't
    // mint a multi-thousand-pixel canvas (crash vector). Real UI words fit easily.
    if (w.length > MAX_WORD_CHARS) w = w.slice(0, MAX_WORD_CHARS - 1) + '…';
    const canvas = renderToCanvas(w, { scale, color });
    canvas.className = 'bt-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    wrap.appendChild(canvas);
  });
  if (trailing) wrap.appendChild(spacer(gap));
  parent.replaceChild(wrap, node);
}

// Walk `root` and upgrade every eligible text node.
export function upgradeTextNodes(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      if (p.classList.contains('bt-text') || p.classList.contains('bt')) return NodeFilter.FILTER_REJECT;
      if (p.closest('[data-no-bt]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const todo = [];
  while (walker.nextNode()) todo.push(walker.currentNode);
  for (const n of todo) upgradeOne(n);
}

let _observer = null;
export function mountBtObserver(root = document.body) {
  if (_observer) return;
  let queued = false;
  const flush = () => {
    queued = false;
    paintBt(document);
    upgradeTextNodes(document.body);
  };
  _observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(flush);
  });
  _observer.observe(root, { childList: true, subtree: true });
  flush();
}
