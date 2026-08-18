// px.test.js — the native-rasterizer seam (the art migration's foundation).
// The render layer is otherwise untested because it needs a canvas; these are the
// parts that are pure maths and CAN be proven headless — including the one class of
// bug that silently destroys a frame (a non-finite alpha clamping a pixel to black).

import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEW } from '../src/tuning.js';
import {
  NATIVE, Painter, NativeScreen, worldScale, rampAt, R, P, clamp, rng, fbm,
  t5, t3, t5big, w5, w3, F5, F3, rampOf, shade,
  computeLetterbox, cssToNative, beginTextLayer, takeTextLayer,
} from '../src/render/px.js';
import { computeFill, FILL_THRESHOLD } from '../scripts/fill-measure.mjs';

test('native buffer is exactly VIEW x 0.375 in BOTH axes (one uniform world->native scale)', () => {
  assert.equal(NATIVE.w / VIEW.w, NATIVE.h / VIEW.h);
  assert.equal(worldScale(VIEW.w), 0.375);
  assert.equal(NATIVE.w, 480);
  assert.equal(NATIVE.h, 300);
});

test('computeLetterbox uses best-fit fractional scale and never strands the playfield', () => {
  // The release fill gate: the playfield must fill ≥90% of the limiting viewport
  // dimension at every supported window size. Fractional scaling is intentional —
  // integer-only scaling left 1280x800 at 56% area fill and 1440x812 at 49%.
  const viewports = [
    [900, 600], [1280, 800], [1440, 812], [1440, 900],
    [1512, 860], [1920, 1080], [2560, 1440],
  ];
  for (const [w, h] of viewports) {
    const box = computeLetterbox(w, h);
    assert.ok(box.w <= w && box.h <= h, `${w}x${h}: playfield ${box.w}x${box.h} overflows viewport`);
    assert.ok(box.x >= 0 && box.y >= 0, `${w}x${h}: playfield must be centred inside viewport`);
    const { fill } = computeFill(box, w, h);
    assert.ok(fill >= FILL_THRESHOLD, `${w}x${h}: fill ${(fill * 100).toFixed(1)}% < ${FILL_THRESHOLD * 100}%`);
  }
  // Ratified 16:10 proof viewports are exact or near-exact.
  const r1440 = computeLetterbox(1440, 900);
  assert.equal(r1440.w, 1440);
  assert.equal(r1440.h, 900);
  const r1280 = computeLetterbox(1280, 800);
  assert.ok(r1280.w >= 1152 && r1280.h >= 720, `1280x800 playfield ${r1280.w}x${r1280.h} too small`);
  // Tiny window floors at 1×.
  assert.equal(computeLetterbox(200, 100).scale, 1);
  // Mouse remap still works with fractional scale.
  const box = computeLetterbox(1440, 900);
  assert.deepEqual(cssToNative(0, 0, box), { x: 0, y: 0 });
  assert.ok(cssToNative(1440, 900, box) == null); // outside letterbox
});

test('display text layer queues body draws and can suppress native paint', () => {
  const p = new Painter(64, 24);
  p.clear('#000000');
  beginTextLayer({ skipNative: true });
  t5(p, 'WIRE', 4, 4, '#ffffff', 1);
  t5big(p, 'POPINJAY', 4, 12, 2, '#ffffff', 1);
  const q = takeTextLayer();
  assert.equal(q.length, 2);
  assert.equal(q[0].s, 'WIRE');
  assert.equal(q[0].face, 'body');
  assert.equal(q[0].align, 'left');
  assert.equal(q[1].face, 'display');
  assert.equal(q[1].align, 'center');
  // skipNative: no lit pixels in the buffer
  let lit = 0;
  for (let i = 0; i < p.d.length; i += 4) if (p.d[i] > 0) lit++;
  assert.equal(lit, 0);
});

test('px/add/mul composite as expected and stay in gamut', () => {
  const p = new Painter(4, 4);
  p.clear('#204060');
  assert.deepEqual(p.get(0, 0).slice(0, 3), [0x20, 0x40, 0x60]);
  p.add(0, 0, '#ffffff', 1);           // additive light saturates
  assert.deepEqual(p.get(0, 0).slice(0, 3), [255, 255, 255]);
  p.mul(1, 1, '#000000', 1);           // full multiply by black
  assert.deepEqual(p.get(1, 1).slice(0, 3), [0, 0, 0]);
  p.px(2, 2, '#ffffff', 0.5);          // half alpha blends
  const q = p.get(2, 2);
  assert.ok(q[0] > 0x20 && q[0] < 255);
});

// The PoC shipped a black line across the sea because Math.pow(negative, 1.5) is NaN
// and Uint8ClampedArray clamps NaN to 0. add()/mul() must reject any non-finite alpha.
test('a NaN or negative alpha can never blacken a pixel', () => {
  const p = new Painter(4, 4);
  p.clear('#3399cc');
  const before = p.get(1, 1).slice(0, 3);
  p.add(1, 1, '#ffffff', Math.pow(-0.5, 1.5));   // NaN
  p.add(1, 1, '#ffffff', NaN);
  p.add(1, 1, '#ffffff', -1);
  p.mul(1, 1, '#000000', NaN);
  p.mul(1, 1, '#000000', undefined);
  assert.deepEqual(p.get(1, 1).slice(0, 3), before);
});

test('wash() rejects a NaN falloff instead of painting it', () => {
  const p = new Painter(8, 8);
  p.clear('#3399cc');
  const before = p.get(4, 4).slice(0, 3);
  // A falloff that goes negative under a fractional power — the exact PoC bug shape.
  p.wash(0, 0, 8, 8, '#ffffff', 0.5, (i, j) => Math.pow(1 - Math.abs(j - 2) / 3, 1.5), 0);
  const after = p.get(4, 4).slice(0, 3);
  assert.ok(after.every((v, i) => v >= before[i]), 'wash may only ADD light, never blacken');
});

test('drawing is fully clipped to the buffer (no wrap onto the opposite edge)', () => {
  const p = new Painter(8, 8);
  p.clear('#000000');
  p.px(-1, 3, '#ffffff'); p.px(8, 3, '#ffffff'); p.px(3, -1, '#ffffff'); p.px(3, 8, '#ffffff');
  p.add(-5, 5, '#ffffff', 1); p.mul(20, 2, '#ffffff', 1);
  for (let i = 0; i < p.d.length; i++) assert.equal(p.d[i], i % 4 === 3 ? 255 : 0);
});

test('rampAt is monotone at the ends and dithers only in between', () => {
  const ramp = R.teal;
  assert.equal(rampAt(ramp, 0, 0, 0), ramp[0]);
  assert.equal(rampAt(ramp, -5, 0, 0), ramp[0]);
  assert.equal(rampAt(ramp, NaN, 0, 0), ramp[0]);          // never undefined
  assert.equal(rampAt(ramp, 1, 0, 0), ramp[ramp.length - 1]);
  assert.equal(rampAt(ramp, 99, 0, 0), ramp[ramp.length - 1]);
  // a mid value must resolve to one of the two bracketing steps, never anything else
  const seen = new Set();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) seen.add(rampAt(ramp, 0.5, x, y));
  for (const c of seen) assert.ok(ramp.includes(c));
  assert.ok(seen.size >= 2, 'a mid ramp value must actually dither between two steps');
});

test('art randomness is seeded and reproducible (a stage always paints the same picture)', () => {
  const a = rng(1234), b = rng(1234);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  const f1 = fbm(7, 4), f2 = fbm(7, 4);
  assert.equal(f1(3.5, 9.25), f2(3.5, 9.25));
});

test('the same scene painted twice is byte-identical (no Math.random in art)', () => {
  const paint = () => {
    const p = new Painter(64, 40);
    p.clear(P.pa4);
    const n = fbm(31, 4);
    p.fn(0, 0, 64, 40, (x, y) => rampAt(R.paper, clamp(0.5 + (n(x * 0.05, y * 0.1) - 0.5) * 0.6, 0, 1), x, y));
    p.glow(32, 20, 14, '#ffcc88', 0.5, 2);
    p.castShadow(10, 30, 30, 18, 4, 0.4);
    p.paper(9, 0.2);
    return p.d;
  };
  assert.deepEqual(Array.from(paint()), Array.from(paint()));
});

test('every glyph in both faces is the right shape (no ragged font rows)', () => {
  for (const [name, font, w, h] of [['F5', F5, 5, 7], ['F3', F3, 3, 5]]) {
    for (const [ch, g] of Object.entries(font)) {
      const rows = g.split('/');
      assert.equal(rows.length, h, `${name}['${ch}'] must have ${h} rows`);
      for (const r of rows) assert.equal(r.length, w, `${name}['${ch}'] row must be ${w} wide`);
      assert.ok(/^[.#/]+$/.test(g), `${name}['${ch}'] may only use . and #`);
    }
  }
});

test('the HUD strings the game actually draws are all covered by the fonts', () => {
  // A missing glyph would silently render as a hole and the text reads wrong — rule 4
  // (loud failures) applies to art too, so cover the real vocabulary here.
  const vocab = 'COMPOSURE WIRE READY ARMED FIRING BUFFERED CHAIN PAR CLOSING BELL SCORE TICKETS ALOFT '
    + 'FREEZE SLOW SHIELD DYNAMITE GALLERY CLEARED DOWNED PAUSED OPTIONS DRAFT TRUNK TOUR MAP '
    + 'SEASIDE FAIRGROUND IRONWORKS PRESS ENTER TO START 0123456789 x-.:!/';
  for (const ch of vocab) {
    assert.ok(F5[ch] || F5[ch.toUpperCase()], `F5 is missing '${ch}'`);
    if (ch !== '!' && ch !== '/') assert.ok(F3[ch] || F3[ch.toUpperCase()], `F3 is missing '${ch}'`);
  }
});

test('the labels the SIM actually produces are covered (the en-dash trap)', () => {
  // run.label() is `${locale} – ${stage}` with an EN DASH, and the par dial says
  // "PAR · off" with a MIDDOT. Both rendered as invisible holes until they were added
  // — so assert against the real generated strings, not a hand-typed approximation.
  const labels = [];
  for (let loc = 1; loc <= 3; loc++) for (let st = 1; st <= 4; st++) labels.push(`${loc} – ${st}`);
  labels.push('PANIC FINALE', 'PAR · off', 'CLOSING BELL');
  for (const s of labels) {
    for (const ch of s) {
      if (ch === ' ') continue;
      assert.ok(F5[ch] || F5[ch.toUpperCase()], `F5 is missing '${ch}' (U+${ch.codePointAt(0).toString(16)}) from ${JSON.stringify(s)}`);
    }
  }
});

// Canonical 3×5 reference (pre-fix body face, af2e9a6^). Final glyphs must stay nearer
// their own reference than any other letter's — the resemblance term round 2 omitted.
const F3_CANONICAL = {
  A: '.#./#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###', F: '###/#../##./#../#..', G: '.##/#../#.#/#.#/.##', H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/.#.', K: '#.#/#.#/##./#.#/#.#', L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#', N: '#.#/##./###/.##/#.#', O: '.#./#.#/#.#/#.#/.#.', P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/##./.##', R: '##./#.#/##./#.#/#.#', S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/.#./.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.', Z: '###/..#/.#./#../###',
  0: '###/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./###', 2: '##./..#/.#./#../###', 3: '##./..#/.#./..#/##.',
  4: '#.#/#.#/###/..#/..#', 5: '###/#../##./..#/##.', 6: '.##/#../###/#.#/###', 7: '###/..#/.#./.#./.#.',
  8: '###/#.#/###/#.#/###', 9: '###/#.#/###/..#/##.',
};
// Pairs at Hamming 2 that cannot reach 3 without breaking resemblance — documented outs.
const F3_HAMMING2_EXCEPTIONS = new Set([
  '0|6', '0|8', '0|G', '0|U', '2|Z', '5|9', '5|S', '6|8', '6|G', '7|T', '7|Y', '8|9', '8|U',
  'C|G', 'D|O', 'E|F', 'F|P', 'H|M', 'H|W', 'I|T', 'K|X', 'M|W', 'P|R',
]);

function f3Bitmap(g) { return g.split('/').join(''); }
function f3Hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

test('every F3 alphanumeric resembles its own canonical form (nearest-neighbour gate)', () => {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (const ch of alpha) {
    const shipped = f3Bitmap(F3[ch]);
    const own = f3Bitmap(F3_CANONICAL[ch]);
    const dOwn = f3Hamming(shipped, own);
    for (const other of alpha) {
      if (other === ch) continue;
      const dOther = f3Hamming(shipped, f3Bitmap(F3_CANONICAL[other]));
      assert.ok(dOwn < dOther,
        `F3 '${ch}' is nearer canonical '${other}' (${dOther}) than itself (${dOwn})`);
    }
  }
});

test('every distinct F3 glyph pair meets separation floor (Hamming >=2; >=3 except documented)', () => {
  // Dash aliases (–/—/− with -) share a shape ON PURPOSE; any OTHER pair of glyphs
  // sharing a bitmap is an exact collision and must fail loudly. (The E/5 collision of
  // 2026-08-12 slipped through a distinct-bitmaps-only comparison — hence this check.)
  const DASH_ALIASES = new Set(['-', '\u2013', '\u2014', '\u2212']);
  const byBitmap = new Map();
  for (const [ch, g] of Object.entries(F3)) {
    const b = f3Bitmap(g);
    if (!byBitmap.has(b)) byBitmap.set(b, []);
    byBitmap.get(b).push(ch);
  }
  for (const [b, chars] of byBitmap) {
    if (chars.length > 1) {
      const allDashes = chars.every((c) => DASH_ALIASES.has(c));
      assert.ok(allDashes, `F3 glyphs share an identical bitmap: ${chars.join(' and ')}`);
    }
  }
  assert.notEqual(f3Bitmap(F3.E), f3Bitmap(F3['5']), 'F3 E and 5 must not share an identical bitmap');
  const alphaSet = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  const uniq = [...byBitmap.keys()];
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const d = f3Hamming(uniq[i], uniq[j]);
      const charsA = byBitmap.get(uniq[i]);
      const charsB = byBitmap.get(uniq[j]);
      assert.ok(d >= 2, `F3 ${charsA.join('/')} vs ${charsB.join('/')} must differ by >=2 pixels, got ${d}`);
      const alphaA = charsA.find((c) => alphaSet.has(c));
      const alphaB = charsB.find((c) => alphaSet.has(c));
      if (!alphaA || !alphaB) continue;
      const key = [alphaA, alphaB].sort().join('|');
      const floor = F3_HAMMING2_EXCEPTIONS.has(key) ? 2 : 3;
      const a = charsA.join('/');
      const b = charsB.join('/');
      assert.ok(d >= floor, `F3 ${a} vs ${b} must differ by >=${floor} pixels, got ${d}`);
    }
  }
});

function renderLabel(p, s, y) {
  p.clear('#000000');
  t3(p, s, 8, y, '#ffffff', 1);
  const lit = new Set();
  for (let j = y; j < y + 5; j++) for (let i = 8; i < 8 + s.length * 4; i++) {
    const px = p.get(i, j);
    if (px[0] + px[1] + px[2] > 24) lit.add(`${i},${j}`);
  }
  return lit;
}

test('rendered F3 labels WIRE and HIRE are visibly distinct on the buffer', () => {
  const p = new Painter(64, 24);
  const wire = renderLabel(p, 'WIRE', 4);
  const hire = renderLabel(p, 'HIRE', 14);
  let shared = 0;
  for (const k of wire) if (hire.has(k)) shared++;
  assert.ok(wire.size > 10 && hire.size > 10);
  assert.ok(shared / Math.max(wire.size, hire.size) < 0.72, `WIRE/HIRE overlap ${shared} px is too high`);
});

test('rendered title control strings FIRE WIRE and FIRE HIRE differ on the buffer', () => {
  const p = new Painter(120, 24);
  const fireWire = renderLabel(p, 'FIRE WIRE', 4);
  const fireHire = renderLabel(p, 'FIRE HIRE', 14);
  let shared = 0;
  for (const k of fireWire) if (fireHire.has(k)) shared++;
  assert.ok(fireWire.size > 20 && fireHire.size > 20);
  assert.ok(shared / Math.max(fireWire.size, fireHire.size) < 0.78, 'FIRE WIRE vs FIRE HIRE must differ at W/H');
});

test('rendered F3 body copy no longer confuses M with X (looker misreads)', () => {
  const pairs = [
    ['CLIMB', 'CLIXB'], ['COMPOSURE', 'COXPOSURE'], ['AMUSEMENTS', 'AXUSEXENTS'], ['M7', 'X7'],
    ['BUILD M7', 'BUILD X7'], ['EXPOSITION AMUSEMENTS CO.', 'EXPOSITION AXUSEXENTS CO.'],
  ];
  for (const [good, bad] of pairs) {
    const p = new Painter(Math.max(w3(good), w3(bad)) + 16, 24);
    const a = renderLabel(p, good, 4);
    const b = renderLabel(p, bad, 14);
    let shared = 0;
    for (const k of a) if (b.has(k)) shared++;
    assert.ok(a.size > 8 && b.size > 8);
    assert.ok(shared / Math.max(a.size, b.size) < 0.88,
      `${good} vs ${bad} overlap ${shared} px — M/X still confusable`);
  }
});

test('an unknown glyph draws a VISIBLE box, never an invisible hole', () => {
  const p = new Painter(40, 16);
  p.clear('#000000');
  t5(p, '☃', 2, 2, '#ffffff');            // a snowman is definitely not in the font
  let lit = 0;
  for (let i = 0; i < p.d.length; i += 4) if (p.d[i] > 0) lit++;
  assert.ok(lit > 0, 'a missing glyph must leave a visible mark');
});

test('text advances by a fixed pitch and stays inside the buffer', () => {
  const p = new Painter(NATIVE.w, NATIVE.h);
  p.clear('#000000');
  assert.equal(t5(p, 'ABC', 0, 0, '#ffffff'), 18);
  assert.equal(w5('ABC'), 18);
  assert.equal(t3(p, 'ABC', 0, 20, '#ffffff'), 12);
  assert.equal(w3('ABC'), 12);
  // drawing off the right edge must not throw or wrap
  t5(p, 'OVERFLOWTEXT', NATIVE.w - 10, 0, '#ffffff');
  assert.equal(p.get(0, 1)[0], 255, 'the A stem should still be lit');
});

test('rampOf keeps a gameplay tint identifiable while making it shadeable', () => {
  const ramp = rampOf('#b0432f');
  assert.equal(ramp.length, 6);
  assert.equal(ramp[2], '#b0432f');            // the tint itself sits mid-ramp
  assert.equal(ramp[0], shade('#b0432f', -0.62));
  assert.equal(ramp[5], shade('#b0432f', 0.7));
});

test('NativeScreen degrades safely with no DOM (headless capture/tests never crash)', () => {
  const s = new NativeScreen();
  assert.equal(s.painter.w, NATIVE.w);
  assert.equal(s.present({}, 1280, 800), false);
});
