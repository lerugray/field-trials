// Shared word-wrap used by the live renderer and the objective text gate.
// Measurement is always pixelTextWidth (shipped bitmap face), never canvas fonts.

import { pixelTextWidth } from './pixel-font.js';

export function wrapLinesNoEllipsis(ctx, text, maxW, maxLines = Infinity) {
  const words = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxLines <= 0) return [];
  const lines = [];
  let lineStr = '';
  for (const word of words) {
    const test = lineStr ? lineStr + ' ' + word : word;
    if (pixelTextWidth(ctx, test) <= maxW) { lineStr = test; continue; }
    if (lineStr) { lines.push(lineStr); lineStr = ''; }
    if (pixelTextWidth(ctx, word) <= maxW) { lineStr = word; continue; }
    // Never split inside a word — emit the whole token (width gate catches overflow).
    if (lineStr) { lines.push(lineStr); lineStr = ''; }
    if (lines.length >= maxLines) { lineStr = word; break; }
    lineStr = word;
  }
  if (lineStr) lines.push(lineStr);
  return lines.length <= maxLines ? lines : lines.slice(0, maxLines);
}

export function truncateText(ctx, text, maxW) {
  const source = String(text == null ? '' : text);
  if (maxW <= 0) return '';
  if (pixelTextWidth(ctx, source) <= maxW) return source;
  const ellipsis = '…';
  if (pixelTextWidth(ctx, ellipsis) > maxW) return '';
  let end = source.length;
  while (end > 0 && pixelTextWidth(ctx, source.slice(0, end).trimEnd() + ellipsis) > maxW) end--;
  return source.slice(0, end).trimEnd() + ellipsis;
}

export function wrapLines(ctx, text, maxW, maxLines = Infinity) {
  const words = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxLines <= 0) return [];
  const lines = [];
  let lineStr = '';
  for (const word of words) {
    const test = lineStr ? lineStr + ' ' + word : word;
    if (pixelTextWidth(ctx, test) <= maxW) { lineStr = test; continue; }
    if (lineStr) { lines.push(lineStr); lineStr = ''; }
    if (pixelTextWidth(ctx, word) <= maxW) { lineStr = word; continue; }
    let rest = word;
    while (rest) {
      let end = 1;
      while (end < rest.length && pixelTextWidth(ctx, rest.slice(0, end + 1)) <= maxW) end++;
      const part = rest.slice(0, end);
      rest = rest.slice(end);
      if (rest) lines.push(part); else lineStr = part;
    }
  }
  if (lineStr) lines.push(lineStr);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  const last = visible.length - 1;
  visible[last] = truncateText(ctx, visible[last] + ' …', maxW);
  return visible;
}
