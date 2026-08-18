// fill-measure.mjs — measure the actual presented playfield from canvas pixels.
// The page background is the game's letterbox bar colour; everything drawn by the
// renderer differs from it, so the bounding box of non-background pixels IS the
// presented box. Used by scripts/capture.mjs and unit-tested in node.

export const PAGE_BG = '#1c1916';

function parseColor(hex) {
  return {
    r: parseInt(hex.substr(1, 2), 16),
    g: parseInt(hex.substr(3, 2), 16),
    b: parseInt(hex.substr(5, 2), 16),
  };
}

function pixelDiff(data, i, bg) {
  return (
    Math.abs(data[i] - bg.r) +
    Math.abs(data[i + 1] - bg.g) +
    Math.abs(data[i + 2] - bg.b)
  );
}

// Find the tight bounding box of pixels that are not the background colour.
// `imageData` is a Uint8ClampedArray-like { data, width, height } or a plain object
// with { data: Uint8ClampedArray | number[], width, height }.
export function measurePresentBox(imageData, bgHex = PAGE_BG) {
  const bg = parseColor(bgHex);
  const { data, width, height } = imageData;
  const len = data.length;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let any = false;

  // Row scan: find top and bottom.
  for (let y = 0; y < height; y++) {
    let rowHas = false;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = rowStart + x * 4;
      if (i + 3 >= len) break;
      if (pixelDiff(data, i, bg) > 12) { rowHas = true; break; }
    }
    if (rowHas) {
      any = true;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!any) return { x: 0, y: 0, w: 0, h: 0 };

  // Column scan: find left and right (only between minY and maxY).
  for (let x = 0; x < width; x++) {
    let colHas = false;
    for (let y = minY; y <= maxY; y++) {
      const i = (y * width + x) * 4;
      if (i + 3 >= len) break;
      if (pixelDiff(data, i, bg) > 12) { colHas = true; break; }
    }
    if (colHas) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Convert a pixel bounding box to CSS-pixel box using the device pixel ratio.
export function toCssBox(box, dpr = 1) {
  if (dpr <= 0) dpr = 1;
  return {
    x: box.x / dpr,
    y: box.y / dpr,
    w: box.w / dpr,
    h: box.h / dpr,
  };
}

// Fill ratios of a CSS box against a CSS viewport. Returns fractional values.
export function computeFill(box, vpW, vpH) {
  const fillW = vpW > 0 ? box.w / vpW : 0;
  const fillH = vpH > 0 ? box.h / vpH : 0;
  return { fillW, fillH, fill: Math.min(fillW, fillH) };
}

// The release gate threshold: the presented playfield must fill at least 90% of the
// limiting viewport dimension at every supported size.
export const FILL_THRESHOLD = 0.90;

export function gatePass(box, vpW, vpH) {
  const { fill } = computeFill(box, vpW, vpH);
  return fill >= FILL_THRESHOLD;
}
