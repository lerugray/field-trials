// Scene-legibility instrumentation — the art PoC's measurement rig, ported into the
// game as GATES rather than as a console log.
//
// The r4 PoC (docs/art-poc/ss-art-poc-r4.html) measured three things every frame and
// THREW if any of them slipped: how many ships were large enough on screen to actually
// read, how much of the capital hull the frame was carrying, and what fraction of pixels
// were blown out. Those numbers are the reason the approved frames hold together, so
// they migrate with the art.
//
// One gate changed direction on the way in, and it is the operator's. The PoC asserted a
// FLOOR on ship count ("at least ten legible ships") because it was composing key art.
// Ray passed the frames with a caveat — "SS may be a little busy / hard to see what's
// going on" — so in the GAME the same measurement carries a CEILING and a separation
// rule instead: enemies must read as legible formation groups, never as a scrap heap.
// Key-art density is not gameplay density.
//
// Everything here is pure: it takes already-projected screen points and raw pixels, so
// the whole rig runs under node --test with no browser. The runtime feeds it from
// main.js under ?instrument; scripts/instrument.mjs drives that headless and enforces
// the gates against the real shipped artifact.

// The reference viewport the area floor is quoted in. A ship's projected area is scaled
// into this space before comparison so the same gate means the same thing at 1280x800
// and at 2560x1440.
export const REF_W = 1440, REF_H = 900;

// ---- The stated gates ---------------------------------------------------------------

// Projected bounding-box area, in reference pixels squared, at or above which a craft
// counts as LEGIBLE — i.e. big enough that its silhouette reads as a ship rather than as
// a speck. 250 is the PoC's own figure, which the approved frames were measured against.
export const LEGIBLE_AREA = 250;

// Exposure ceiling. Above this fraction of near-white pixels the frame is blooming, not
// lit — the accessibility law's flash cap governs washes, this governs the scene itself.
export const MAX_HOT_PIX_PCT = 8;
export const HOT_LUMA = 0.92;

// Readability ceilings (the operator's note, made checkable).
// A frame may carry at most this many legible hostiles at once before it reads as a
// heap. Waves in this game top out well under it; the gate exists so a future density
// change cannot quietly cross the line the operator already flagged.
export const MAX_LEGIBLE_ENEMIES = 9;

// Two legible hostiles whose centres sit closer than this (reference px) are CLUSTERED:
// their silhouettes merge and neither reads. A few is a formation; a lot is a scrap heap.
export const MIN_SEPARATION_PX = 46;
export const MAX_CLUSTERED_FRAC = 0.5;

// A capital ship is the frame's subject; below this share of the frame it is not
// reading as mass. The PoC's set-piece gate, unchanged.
export const MIN_BOSS_AREA_PCT = 12;

// ---- Measurement ---------------------------------------------------------------------

// Screen-space bounding box of a set of projected points, clipped to the viewport, with
// its area normalised into REF_W x REF_H. `points` are { x, y, visible } as produced by
// main.js's projectToScreen. Returns area 0 when nothing is in front of the camera.
export function projectedBounds(points, vw, vh) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  for (const p of points) {
    if (!p || !p.visible || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    n++;
  }
  if (!n) return { area: 0, nativeArea: 0, cx: 0, cy: 0, onScreen: false };
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const cMinX = Math.max(0, Math.min(vw, minX)), cMaxX = Math.max(0, Math.min(vw, maxX));
  const cMinY = Math.max(0, Math.min(vh, minY)), cMaxY = Math.max(0, Math.min(vh, maxY));
  const nativeArea = Math.max(0, cMaxX - cMinX) * Math.max(0, cMaxY - cMinY);
  return {
    nativeArea,
    area: nativeArea * (REF_W / Math.max(1, vw)) * (REF_H / Math.max(1, vh)),
    cx: cx * (REF_W / Math.max(1, vw)),
    cy: cy * (REF_H / Math.max(1, vh)),
    onScreen: nativeArea > 0,
  };
}

// Fraction of pixels at or above HOT_LUMA, as a percentage. `pixels` is RGBA bytes as
// read back from the native render target.
export function hotPixelPct(pixels) {
  if (!pixels || !pixels.length) return 0;
  let hot = 0;
  const n = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    const luma = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
    if (luma >= HOT_LUMA) hot++;
  }
  return (hot / n) * 100;
}

// How many of these legible hostiles are crowded against another one. `marks` are
// { cx, cy } in reference-pixel space (i.e. projectedBounds output).
export function clusteredCount(marks, minSep = MIN_SEPARATION_PX) {
  let clustered = 0;
  for (let i = 0; i < marks.length; i++) {
    for (let j = 0; j < marks.length; j++) {
      if (i === j) continue;
      const dx = marks[i].cx - marks[j].cx, dy = marks[i].cy - marks[j].cy;
      if (Math.hypot(dx, dy) < minSep) { clustered++; break; }
    }
  }
  return clustered;
}

// ---- The verdict ----------------------------------------------------------------------

// Judge one measured frame. `sample` is:
//   { enemies: [bounds...], boss: bounds|null, bossAreaPct, hotPixPct }
// Returns { pass, failures[], metrics } — never throws, so a probe can report every
// failure in a frame rather than only the first.
export function evaluateFrame(sample) {
  const failures = [];
  const legible = (sample.enemies || []).filter((b) => b && b.area >= LEGIBLE_AREA);
  const clustered = clusteredCount(legible);
  const clusteredFrac = legible.length ? clustered / legible.length : 0;

  if (legible.length > MAX_LEGIBLE_ENEMIES) {
    failures.push(
      `${legible.length} legible hostiles on screen exceeds the readability ceiling of ${MAX_LEGIBLE_ENEMIES}`,
    );
  }
  // One pair touching is a formation; a majority touching is a heap. The fraction gate
  // only engages once there are enough ships for "heap" to be a meaningful word.
  if (legible.length >= 3 && clusteredFrac > MAX_CLUSTERED_FRAC) {
    failures.push(
      `${clustered}/${legible.length} legible hostiles are within ${MIN_SEPARATION_PX}px of another `
      + `(${Math.round(clusteredFrac * 100)}% clustered, ceiling ${Math.round(MAX_CLUSTERED_FRAC * 100)}%)`,
    );
  }
  if (sample.hotPixPct > MAX_HOT_PIX_PCT) {
    failures.push(
      `hot pixels ${sample.hotPixPct.toFixed(2)}% exceed the ${MAX_HOT_PIX_PCT}% exposure ceiling`,
    );
  }
  if (sample.boss && sample.bossAreaPct != null && sample.bossAreaPct < MIN_BOSS_AREA_PCT) {
    failures.push(
      `capital silhouette ${sample.bossAreaPct.toFixed(2)}% is below the ${MIN_BOSS_AREA_PCT}% mass floor`,
    );
  }

  return {
    pass: failures.length === 0,
    failures,
    metrics: {
      legibleEnemies: legible.length,
      clustered,
      clusteredFrac,
      hotPixPct: sample.hotPixPct,
      bossAreaPct: sample.bossAreaPct != null ? sample.bossAreaPct : null,
    },
  };
}
