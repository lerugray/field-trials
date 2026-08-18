// overlays.test.js — the OVERLAY seam: the thirteen menu/announcement surfaces and
// the flow transition.
//
// These surfaces used to draw with the 2D context, so nothing about them could be
// proven without a browser. They are now pure paint into a pixel buffer, which means
// the whole overlay layer is testable headless — and the classes of defect that
// actually bit during the migration are exactly the ones asserted here:
//
//   - a surface asking for a character the pixel faces do not have (caught the seed
//     caret: an '_' has no glyph, so typing a seed printed a box),
//   - a menu card printing over the title wordmark,
//   - an in-play banner eating the HUD,
//   - the NaN-alpha black scanline, which px.js guards but every new surface can
//     still reintroduce through a fresh falloff,
//   - a transition that does not actually finish, which would strand the frame.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Painter, NATIVE, P, R, w5big, missingGlyphs, resetMissingGlyphs, panel, posterFrame, safeText } from '../src/render/px.js';
import { LAYOUT } from '../src/render/overlays.js';
import { pauseControlLines, DEFAULT_BINDINGS } from '../src/engine/input.js';
import { SHEETS, renderSheet, transitionSheet } from '../scripts/overlay-proof.mjs';
import { beginSlide, updateSlide, paintSlide, slideActive, slidePhase, resetSlide, holdSlide, SLIDE } from '../src/render/transition.js';
import { HUD_H, GROUND } from '../src/render/vistas.js';
import { VIEW, PLAYER } from '../src/tuning.js';
import * as OV from '../src/render/overlays.js';

const NAMES = Object.keys(SHEETS);

function stats(p) {
  const seen = new Set(); let lit = 0;
  for (let i = 0; i < p.d.length; i += 4) {
    const k = (p.d[i] << 16) | (p.d[i + 1] << 8) | p.d[i + 2];
    seen.add(k);
    if (p.d[i] + p.d[i + 1] + p.d[i + 2] > 24) lit++;
  }
  return { colours: seen.size, lit, total: p.d.length / 4 };
}

test('every overlay surface paints a full, non-blank, non-uniform frame', () => {
  assert.ok(NAMES.length >= 13, `expected at least the 13 converted surfaces, got ${NAMES.length}`);
  for (const name of NAMES) {
    const p = renderSheet(name);
    const s = stats(p);
    assert.ok(s.colours > 24, `${name}: only ${s.colours} colours — a flat fill is the one thing the bar rules out`);
    assert.ok(s.lit / s.total > 0.9, `${name}: ${((1 - s.lit / s.total) * 100).toFixed(1)}% of the frame is unpainted black`);
  }
});

// The gap that shipped a box on screen: '_' is in neither face, so the seed-entry
// caret printed the missing-glyph marker every time a player typed a seed.
test('no overlay asks for a character the pixel faces do not have', () => {
  for (const name of NAMES) {
    resetMissingGlyphs();
    renderSheet(name);
    assert.equal(missingGlyphs(), 0, `${name} drew ${missingGlyphs()} missing-glyph box(es) — its copy uses a character F5/F3 lack`);
  }
});

test('safeText folds an arbitrary runtime string onto the faces we have', () => {
  resetMissingGlyphs();
  const p = new Painter(NATIVE.w, 11);
  // A real error message: emoji, an arrow, a curly quote — none of them in the faces.
  OV.drawErrorBanner({
    imageSmoothingEnabled: false, drawImage() {}, save() {}, restore() {}, beginPath() {},
    rect() {}, clip() {}, fillText() {}, measureText(s) { return { width: String(s).length * 9 }; },
  }, 1280, 'TypeError: can’t read →prop← ⚠ of undefined');
  assert.equal(missingGlyphs(), 0, 'the LOUD-failure banner must never itself become a row of boxes');
  // '_' is the character that actually shipped a box — the seed-entry caret.
  assert.equal(safeText('a_b'), 'a.b');
  assert.equal(safeText('★'), '.');
  // …while the dashes ARE in the face and must survive untouched.
  assert.equal(safeText('SCORE 12 — 1 · 3'), 'SCORE 12 — 1 · 3');
});

test('every overlay is deterministic — the same screen paints the same pixels', () => {
  for (const name of NAMES) {
    const a = renderSheet(name), b = renderSheet(name);
    assert.deepEqual(Buffer.from(a.d), Buffer.from(b.d), `${name} is not deterministic (Math.random in art is banned)`);
  }
});

// px.js guards add()/mul() against a non-finite alpha, but a new surface can still
// paint a black row through some other route. Same gate the vistas carry.
test('no overlay contains a full-width near-black scanline (the NaN-alpha failure)', () => {
  for (const name of NAMES) {
    const p = renderSheet(name);
    for (let y = 0; y < p.h; y++) {
      let dark = 0;
      for (let x = 0; x < p.w; x++) { const c = p.get(x, y); if (c[0] + c[1] + c[2] < 18) dark++; }
      assert.ok(dark < p.w * 0.97, `${name}: row ${y} is a black scanline`);
    }
  }
});

// The layout invariant that was actually violated on the first pass: POPINJAY is set
// at scale 4 across the title card's centre, and the record cards sit to its right.
test('the title record cards clear the POPINJAY wordmark', () => {
  const wordRight = Math.round(240 - w5big('POPINJAY', 4) / 2) + w5big('POPINJAY', 4);
  assert.ok(LAYOUT.recordX > wordRight, `record cards start at ${LAYOUT.recordX} but the wordmark reaches ${wordRight}`);
  assert.ok(LAYOUT.recordX + LAYOUT.recordW <= NATIVE.w - 6, 'record cards must stay inside the poster mat');
});

// An announcement over live play must not eat the readouts the player is reading.
test('in-play banners never touch the HUD band', () => {
  const banners = {
    cleared: (p) => OV.drawClearedRibbon(p, { score: 100, timeBonus: 20 }),
    downed: (p) => OV.drawDowned(p),
    centerpiece: (p) => OV.drawCenterpiece(p, 'The Grand Carousel', 1),
    rehearsal: (p) => OV.drawRehearsal(p, 9),
    // Connect notice can fire during unpaused play; it must not sit on the HUD band.
    connectNotice: (p) => OV.drawControllerNotice(p, { headline: 'CONTROLLER CONNECTED', detail: 'STANDARD GAMEPAD READY' }),
  };
  for (const [name, fn] of Object.entries(banners)) {
    const p = new Painter(NATIVE.w, NATIVE.h);
    p.clear('#3399cc');
    const before = p.snapshot();
    fn(p);
    for (let y = 0; y <= HUD_H; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      assert.equal(p.d[i], before[i], `${name} painted into the HUD band at ${x},${y}`);
    }
  }
});

// The 2026-08-15 relocate put the notice at native y=264 (NATIVE.h - 28 - 8). That
// is the player (head ~256, feet 277) and the ground slab (GROUND=277). HUD-band
// clearance alone cannot see this: the test above only checks rows 0..HUD_H.
test('connect notice never paints over the player body or the ground band', () => {
  const playerHead = GROUND - PLAYER.height * (NATIVE.w / VIEW.w);
  const p = new Painter(NATIVE.w, NATIVE.h);
  p.clear('#3399cc');
  const before = p.snapshot();
  OV.drawControllerNotice(p, { headline: 'CONTROLLER CONNECTED', detail: 'STANDARD GAMEPAD READY' });

  // The card must actually exist — a no-op draw would pass the overlap asserts.
  let painted = 0;
  for (let i = 0; i < p.d.length; i += 4) if (p.d[i] !== before[i]) painted++;
  assert.ok(painted > 400, `connect notice painted only ${painted} pixels — the card is missing`);

  const overlapTop = Math.floor(playerHead);
  for (let y = overlapTop; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      assert.equal(p.d[i], before[i], `connect notice painted player/ground at ${x},${y} (playerHead=${playerHead}, GROUND=${GROUND})`);
    }
  }
});

function paintYRange(before, after) {
  let min = after.h, max = -1;
  for (let y = 0; y < after.h; y++) {
    for (let x = 0; x < after.w; x++) {
      const i = (y * after.w + x) * 4;
      if (after.d[i] !== before[i] || after.d[i + 1] !== before[i + 1] || after.d[i + 2] !== before[i + 2]) {
        if (y < min) min = y;
        if (y > max) max = y;
        break;
      }
    }
  }
  return { min, max, empty: max < 0 };
}

function paintBox(before, after) {
  let x0 = after.w, x1 = -1, y0 = after.h, y1 = -1;
  for (let y = 0; y < after.h; y++) {
    for (let x = 0; x < after.w; x++) {
      const i = (y * after.w + x) * 4;
      if (after.d[i] !== before[i] || after.d[i + 1] !== before[i + 1] || after.d[i + 2] !== before[i + 2]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, x1, y0, y1, empty: y1 < 0 };
}

// 2026-08-16 FU2: rehearsal band (y 24..53) and the HUD+4 notice slot (y 26..56)
// occupied the same native rows. A pad connect during REHEARSAL painted the opaque
// card over the rehearsal instruction text.
test('controller notice y-range never overlaps the rehearsal banner', () => {
  const fill = '#3399cc';
  const rehearsal = new Painter(NATIVE.w, NATIVE.h); rehearsal.clear(fill);
  const r0 = rehearsal.snapshot();
  OV.drawRehearsal(rehearsal, 9);
  const rY = paintYRange(r0, rehearsal);
  assert.equal(rY.empty, false, 'rehearsal banner must paint');

  const notice = new Painter(NATIVE.w, NATIVE.h); notice.clear(fill);
  const n0 = notice.snapshot();
  OV.drawControllerNotice(notice, { headline: 'CONTROLLER CONNECTED', detail: 'STANDARD GAMEPAD READY' });
  const nY = paintYRange(n0, notice);
  assert.equal(nY.empty, false, 'controller notice must paint');

  const overlap = !(nY.max < rY.min || rY.max < nY.min);
  assert.equal(overlap, false,
    `notice y ${nY.min}..${nY.max} overlaps rehearsal y ${rY.min}..${rY.max}`);
});

// 2026-08-16 FU2: the HUD+4 slot (native 26..56) covered the central obelisk cap
// (~y 41) and any walker whose native head sits in that band — a mid-climb near
// the highest generate.js platform, and the rarer pose with the body in the cap.
test('controller notice does not occlude a mid-climb pose near the tower top', () => {
  const S = NATIVE.w / VIEW.w;
  const fill = '#113355';
  const notice = new Painter(NATIVE.w, NATIVE.h); notice.clear(fill);
  const n0 = notice.snapshot();
  OV.drawControllerNotice(notice, { headline: 'CONTROLLER CONNECTED', detail: 'STANDARD GAMEPAD READY' });
  const slot = paintBox(n0, notice);
  assert.equal(slot.empty, false, 'controller notice must paint');

  // Highest generated row is VIEW.h - 510 (generate.js). Walker standing on it:
  const highFeet = VIEW.h - 510;
  const climbHead = Math.floor((highFeet - PLAYER.height) * S);
  const climbFeet = Math.ceil(highFeet * S);
  const climbOverlap = !(slot.y1 < climbHead || climbFeet < slot.y0);
  assert.equal(climbOverlap, false,
    `notice y ${slot.y0}..${slot.y1} overlaps high-climb player y ${climbHead}..${climbFeet}`);

  // Obelisk cap in locale-1 captures: native y ~41 at CX. The HUD+4 opaque card
  // (rows 26..56) fully replaced that column. Corner-toast and/or alpha-fade must
  // leave the orange walker marker readable.
  const towerHead = 41;
  const towerFeet = towerHead + Math.ceil(PLAYER.height * S);
  const towerX = 240;
  const posed = new Painter(NATIVE.w, NATIVE.h); posed.clear(fill);
  for (let y = towerHead; y <= towerFeet; y++) posed.px(towerX, y, '#e85a2a');
  const marker = posed.get(towerX, towerHead).slice(0, 3);
  OV.drawControllerNotice(posed, { headline: 'CONTROLLER CONNECTED', detail: 'STANDARD GAMEPAD READY' });
  const after = posed.get(towerX, towerHead);
  const channelDelta = Math.abs(after[0] - marker[0]) + Math.abs(after[1] - marker[1]) + Math.abs(after[2] - marker[2]);
  const xMissesTower = slot.x1 < towerX - 8 || slot.x0 > towerX + 8;
  const stillReadsMarker = after[0] > 160 && after[1] < 140 && channelDelta < 180;
  assert.ok(xMissesTower || stillReadsMarker,
    `notice box ${slot.x0}..${slot.x1},${slot.y0}..${slot.y1} opaques the tower-top marker at ${towerX},${towerHead} (got ${after.slice(0, 3)}, Δ${channelDelta})`);
});

test('the OPTIONS cursor is visibly distinct — a selected row differs from an unselected one', () => {
  const rows = [
    { label: 'Master volume', type: 'scale', min: 0, max: 1, value: 0.5, text: '50%', on: false },
    { label: 'Mute all', type: 'toggle', value: false, text: 'OFF', on: false },
  ];
  const a = new Painter(NATIVE.w, NATIVE.h); a.clear('#000'); OV.drawOptions(a, { items: rows, cursor: 0 });
  const b = new Painter(NATIVE.w, NATIVE.h); b.clear('#000'); OV.drawOptions(b, { items: rows, cursor: 1 });
  let diff = 0;
  for (let i = 0; i < a.d.length; i += 4) if (a.d[i] !== b.d[i]) diff++;
  assert.ok(diff > 400, `moving the cursor changed only ${diff} pixels — the selection must be unmistakable`);
});

test('controller connect/disconnect notices stay on the pixel face', () => {
  resetMissingGlyphs();
  const p = new Painter(NATIVE.w, NATIVE.h); p.clear('#123456');
  OV.drawControllerNotice(p, { headline: 'CONTROLLER DISCONNECTED', detail: 'GAME PAUSED · RECONNECT OR USE KEYS' });
  OV.drawControllerNotice(p, { headline: 'CONTROLLER NOT MAPPED', detail: 'USE A STANDARD-MAPPED PAD' });
  OV.drawControllerNotice(p, { headline: 'CONTROLLER CONNECTED', detail: 'F310 D-INPUT STANDARDIZED' });
  assert.equal(missingGlyphs(), 0);
  const q = new Painter(NATIVE.w, NATIVE.h); q.clear('#123456');
  OV.drawPaused(q);
  OV.drawPaused(q, { heading: 'CONTROLS · KEY > PAD', rows: [['FIRE WIRE', 'Z/SPC > A']], footer: 'START RESUME  ·  BACK OPTIONS  ·  LB QUIT' });
  assert.equal(missingGlyphs(), 0);
});

test('draft hint mentions pad verbs when a highlight is shown, and stays keyboard-only otherwise', () => {
  assert.match(OV.draftHint('NONE', false), /PRESS 1  2  3 TO TAKE/);
  assert.match(OV.draftHint('NONE', false), /D TO DECLINE/);
  assert.doesNotMatch(OV.draftHint('NONE', false), /\bA\b/);
  assert.match(OV.draftHint('2', true), /A TAKES/);
  assert.match(OV.draftHint('2', true), /B/);
  assert.equal(OV.draftHint('NONE', true).includes('_'), false);

  const keys = new Painter(NATIVE.w, NATIVE.h); keys.clear('#000');
  OV.drawDraft(keys, { offer: [], held: 'NONE' });
  const pad = new Painter(NATIVE.w, NATIVE.h); pad.clear('#000');
  OV.drawDraft(pad, { offer: [], held: 'NONE', cursor: 0, pad: true });
  let hintDiff = 0;
  for (let x = 0; x < NATIVE.w; x++) {
    const i = (42 * NATIVE.w + x) * 4;
    if (keys.d[i] !== pad.d[i]) hintDiff++;
  }
  assert.ok(hintDiff > 20, 'pad-connected draft must reprint the hint with pad verbs, not only a card highlight');
  resetMissingGlyphs();
  OV.drawDraft(new Painter(NATIVE.w, NATIVE.h), { offer: [], held: 'NONE', cursor: 1, pad: true });
  assert.equal(missingGlyphs(), 0);
});

test('connected pause card is pauseControlLines (eight KEY>PAD rows)', () => {
  const lines = pauseControlLines(DEFAULT_BINDINGS);
  assert.equal(lines.length, 8);
  const rows = lines.map((line) => {
    const i = line.indexOf(':');
    return [line.slice(0, i), line.slice(i + 1)];
  });
  resetMissingGlyphs();
  const p = new Painter(NATIVE.w, NATIVE.h); p.clear('#123456');
  OV.drawPaused(p, { heading: 'CONTROLS · KEY > PAD', rows, footer: 'START RESUME  ·  BACK OPTIONS  ·  LB QUIT' });
  assert.equal(missingGlyphs(), 0);
});

// A meter normalised to the row's own minimum prints an EMPTY bar at the lowest
// setting: three composure hearts, or 80% game speed, would both read as "off".
test('an options meter is never empty at a legitimate non-zero value', () => {
  const cases = [
    { label: 'Composure hearts', type: 'count', min: 3, max: 5, value: 3, text: '3', on: false },
    { label: 'Game speed', type: 'scale', min: 0.8, max: 1.0, value: 0.8, text: '80%', on: false },
  ];
  for (const it of cases) {
    const lit = new Painter(NATIVE.w, NATIVE.h); lit.clear('#000');
    OV.drawOptions(lit, { items: [it], cursor: 9 });          // cursor elsewhere: no highlight
    const zero = new Painter(NATIVE.w, NATIVE.h); zero.clear('#000');
    OV.drawOptions(zero, { items: [{ ...it, value: 0, text: '0' }], cursor: 9 });
    let diff = 0;
    for (let i = 0; i < lit.d.length; i += 4) if (lit.d[i] !== zero.d[i]) diff++;
    assert.ok(diff > 30, `${it.label} at its minimum paints the same meter as zero — the bar reads as "off"`);
  }
});

test('the scorecard reads a victory differently from a downing', () => {
  const base = { locale: 3, stage: 'finale', seed: 1, souvenirs: [], pops: 10, bestChain: 2, score: 10, tickets: 1 };
  const a = new Painter(NATIVE.w, NATIVE.h); a.clear('#000');
  OV.drawScorecard(a, { sc: { ...base, outcome: 'victory' }, souvenirs: [], unlock: { complete: true } });
  const b = new Painter(NATIVE.w, NATIVE.h); b.clear('#000');
  OV.drawScorecard(b, { sc: { ...base, outcome: 'downed', locale: 1, stage: 2, culpritCls: 'penny' }, souvenirs: [], unlock: { name: 'X', bank: 1, cost: 12 } });
  let diff = 0;
  for (let i = 0; i < a.d.length; i += 4) if (a.d[i] !== b.d[i]) diff++;
  assert.ok(diff > 2000, 'the two outcomes must not print the same card');
});

test('a scorecard with no data degrades to the printed ground instead of throwing', () => {
  const p = new Painter(NATIVE.w, NATIVE.h); p.clear('#000');
  OV.drawScorecard(p, { sc: null, souvenirs: [], unlock: null });
  assert.ok(stats(p).colours > 8);
  const q = new Painter(NATIVE.w, NATIVE.h); q.clear('#000');
  OV.drawTrunk(q, { owned: [], locked: [], bank: 0, cursor: 0, cost: 12 });   // an empty catalogue
  OV.drawDraft(q, { offer: [], held: 'NONE' });
  assert.ok(stats(q).colours > 8);
});

test('formatSouvenirSummary fits names on one line and counts the overflow', () => {
  const short = ['Feather', 'Ribbon', 'Coin'];
  const s1 = OV.formatSouvenirSummary(short, 200);
  assert.equal(s1.shown, 'FEATHER, RIBBON, COIN');
  assert.equal(s1.more, 0);

  // 12 long names in a 156px-wide scorecard column: only a few fit; the rest are +N MORE.
  const long = ['Second Barrel', 'Sky Anchor', 'Quick Spool', 'Gallery Sidearm', 'Long Fuse',
    'Plume Hat', 'Shield Charm', 'Ribbon Chain', 'Confetti Bonus', 'Season Pass', 'Punctual', 'Opera Glasses'];
  const s2 = OV.formatSouvenirSummary(long, 156);
  assert.ok(s2.shown.length > 0);
  assert.ok(s2.more > 0, 'overflow must be summarized, not silently truncated');
  assert.equal(s2.shown.split(', ').length + s2.more, long.length);
});

// ---------------------------------------------------------------- the transition

test('the slide dissolves from the outgoing plate to the incoming one and clears itself', () => {
  const from = new Painter(NATIVE.w, NATIVE.h); from.clear('#ff0000');
  resetSlide();
  beginSlide(from, 'stage', false);
  assert.ok(slideActive());

  // phase 0 = entirely the outgoing plate; phase 1 = entirely the incoming one
  const at = (ph) => {
    holdSlide(ph);
    const to = new Painter(NATIVE.w, NATIVE.h); to.clear('#0000ff');
    paintSlide(to);
    let old = 0;
    for (let i = 0; i < to.d.length; i += 4) if (to.d[i] > 128) old++;
    return old / (to.d.length / 4);
  };
  assert.equal(at(0), 1, 'at phase 0 the outgoing frame must still cover the screen');
  assert.equal(at(1), 0, 'at phase 1 not one pixel of the outgoing frame may remain');
  const mid = at(0.5);
  assert.ok(mid > 0.1 && mid < 0.9, `mid-transition should be a genuine mix, got ${mid}`);
  // monotone: the plate only ever thins
  let prev = 1;
  for (const ph of [0.2, 0.4, 0.6, 0.8, 1]) { const v = at(ph); assert.ok(v <= prev + 1e-9, 'the dissolve must never thicken'); prev = v; }
  resetSlide();
});

test('a transition always finishes within its declared duration — it can never strand a frame', () => {
  for (const kind of ['stage', 'locale']) {
    const from = new Painter(NATIVE.w, NATIVE.h); from.clear('#123456');
    resetSlide(); beginSlide(from, kind, false);
    let t = 0;
    while (slideActive() && t < 5) { updateSlide(1 / 60); t += 1 / 60; }
    assert.ok(!slideActive(), `${kind} slide never ended`);
    assert.ok(t <= SLIDE[kind] + 1 / 30, `${kind} slide ran ${t.toFixed(3)}s, longer than its ${SLIDE[kind]}s budget`);
  }
});

test('transitions are FAST — none may add a perceptible wait, and reduce-motion is shorter still', () => {
  assert.ok(SLIDE.stage <= 0.3, 'a stage change must be under 300ms');
  assert.ok(SLIDE.locale <= 0.45, 'even the locale plate must stay under 450ms');
  assert.ok(SLIDE.calm < SLIDE.stage, 'reduce-motion must be the shortest of the three');
  const from = new Painter(NATIVE.w, NATIVE.h); from.clear('#123456');
  resetSlide(); beginSlide(from, 'locale', true);
  let t = 0;
  while (slideActive() && t < 5) { updateSlide(1 / 60); t += 1 / 60; }
  assert.ok(t <= SLIDE.calm + 1 / 30, 'a calm slide must honour the reduce-motion duration');
  resetSlide();
});

test('a slide against a different-sized buffer resets instead of corrupting the frame', () => {
  const from = new Painter(NATIVE.w, NATIVE.h); from.clear('#ffffff');
  resetSlide(); beginSlide(from, 'stage', false); holdSlide(0.5);
  const odd = new Painter(64, 64); odd.clear('#010203');
  paintSlide(odd);
  assert.equal(slideActive(), false, 'a mismatched buffer must clear the transition, not paint through it');
  assert.deepEqual(odd.get(10, 10).slice(0, 3), [1, 2, 3], 'the odd buffer must be left untouched');
});

test('the mid-transition plate is a real composite of both screens', () => {
  const p = transitionSheet(0.5);
  const s = stats(p);
  assert.ok(s.colours > 200, 'a dissolve of two lit frames should carry both palettes');
  assert.ok(s.lit / s.total > 0.95);
});

// ---------------------------------------------------------------- shared chrome

test('panel() paints its whole card and lifts off the ground with a shadow', () => {
  const p = new Painter(80, 60);
  p.clear('#000000');
  panel(p, 10, 10, 40, 30);
  for (let y = 10; y < 40; y++) for (let x = 10; x < 50; x++) {
    assert.ok(p.get(x, y)[0] > 40, `card interior unpainted at ${x},${y}`);
  }
  assert.deepEqual(p.get(2, 2).slice(0, 3), [0, 0, 0], 'panel must not paint beyond its own rect');
});

test('posterFrame() is one ornament with two tunings, not two ornaments', () => {
  const a = new Painter(NATIVE.w, NATIVE.h); a.clear('#204060'); posterFrame(a);
  const b = new Painter(NATIVE.w, NATIVE.h); b.clear('#204060');
  posterFrame(b, { outer: P.pa4, outerA: 0.55, inner: P.gd3, innerA: 0.45, s: 10, steps: 12, curl: P.gd4, curlA: 0.85, pip: P.gd5, pipA: 0.9 });
  let diff = 0;
  for (let i = 0; i < a.d.length; i += 4) if (a.d[i] !== b.d[i]) diff++;
  assert.ok(diff > 100, 'the two tunings must actually differ');
  // and both must leave the middle of the frame alone
  assert.deepEqual(a.get(240, 150).slice(0, 3), b.get(240, 150).slice(0, 3));
});
