import test from 'node:test';
import assert from 'node:assert/strict';
import { createPalettes } from '../src/engine/palette.js';
import { SHADE_LEVELS } from '../src/engine/tiles.js';
import palettesData from '../data/palettes.json' with { type: 'json' };

const parse = (s) => s.match(/\d+/g).map(Number);

test('the shipped palettes load with >=4 single-hue schemes', () => {
  const p = createPalettes(palettesData);
  assert.ok(p.count >= 4, `expected >=4 schemes, got ${p.count}`);
  assert.ok(p.ids().includes(p.defaultId));
});

test('each scheme follows the approved luminance LUT and blooms only at the hot end', () => {
  const p = createPalettes(palettesData);
  for (const s of p.list()) {
    const low = parse(p.shadeToColor(s.id, 0));
    const top = parse(p.shadeToColor(s.id, SHADE_LEVELS - 1));
    const dist = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
    assert.ok(dist(top, s.glow) < dist(top, s.rgb), `${s.id} hot end blooms toward glow tint`);
    assert.equal(p.shadeToColor(s.id, 3), p.luminanceToColor(s.id, 255 * p.factor(3)), `${s.id} shade path uses LUT`);
    assert.ok(low.reduce((a, b) => a + b, 0) < top.reduce((a, b) => a + b, 0), `${s.id} retains value order`);
  }
});

test('brightness ramps monotonically from dark to light', () => {
  const p = createPalettes(palettesData);
  for (const id of p.ids()) {
    let prevSum = -1;
    for (let shade = 0; shade < SHADE_LEVELS; shade++) {
      const sum = parse(p.shadeToColor(id, shade)).reduce((a, b) => a + b, 0);
      assert.ok(sum > prevSum, `${id} not increasing at shade ${shade}`);
      prevSum = sum;
    }
  }
});

test('shade 0 rests above black; shade max reaches the hot phosphor tint', () => {
  const p = createPalettes(palettesData);
  const id = p.ids()[0];
  const dark = parse(p.shadeToColor(id, 0)).reduce((a, b) => a + b, 0);
  assert.ok(dark > 0, 'floor keeps shade 0 above pure black');
  const bright = parse(p.shadeToColor(id, SHADE_LEVELS - 1));
  const hot = p.glow(id);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(bright[i] - hot[i]) <= 6, 'top shade reaches hot tint plus resting phosphor');
});

test('ramp returns one colour per shade level', () => {
  const p = createPalettes(palettesData);
  assert.equal(p.ramp(p.ids()[0]).length, SHADE_LEVELS);
});

test('next/prev cycle the schemes and wrap', () => {
  const p = createPalettes(palettesData);
  const ids = p.ids();
  assert.equal(p.next(ids[ids.length - 1]), ids[0], 'next wraps to first');
  assert.equal(p.prev(ids[0]), ids[ids.length - 1], 'prev wraps to last');
  // a full cycle returns home
  let cur = ids[0];
  for (let i = 0; i < ids.length; i++) cur = p.next(cur);
  assert.equal(cur, ids[0]);
});

test('validation rejects malformed schemes', () => {
  assert.throws(() => createPalettes({ schemes: [{ id: 'a', rgb: [0, 0, 0] }] }), />=4/);
  assert.throws(() => createPalettes({ schemes: [1, 2, 3, 4].map((i) => ({ id: `s${i}`, rgb: [0, 0] })) }), /triple/);
  assert.throws(() => createPalettes({ schemes: [1, 2, 3, 4].map((i) => ({ id: `s${i}`, rgb: [0, 0, 300] })) }), /range/);
});

// M6 review addendum item 3 — the Cyclopean-2 accent (one restrained second hue
// per scheme, over the otherwise single-hue ramp).
test('every shipped scheme carries a restrained accent hue', () => {
  const p = createPalettes(palettesData);
  for (const id of p.ids()) {
    assert.ok(p.hasAccent(id), `${id} should declare an accent`);
    const rgb = parse(p.accentColor(id));
    assert.equal(rgb.length, 3);
    for (const c of rgb) assert.ok(c >= 0 && c <= 255, `${id} accent channel in range`);
  }
});

test('the approved green/amber accents are hot phosphor, while alternate schemes may retain a second hue', () => {
  const p = createPalettes(palettesData);
  for (const id of ['phosphor-green', 'amber']) {
    assert.deepEqual(parse(p.accentColor(id)), p.glow(id), `${id} stays inside the approved monochrome family`);
  }
  for (const s of p.list().filter((row) => !['phosphor-green', 'amber'].includes(row.id))) {
    const [br, bg, bb] = s.rgb;
    const [ar, ag, ab] = parse(p.accentColor(s.id));
    // If the accent were merely the base scaled, ar/br == ag/bg == ab/bb. Assert
    // the channel ratios differ meaningfully so it reads as a distinct colour.
    const ratio = (a, b) => (b === 0 ? (a === 0 ? 1 : 999) : a / b);
    const rr = ratio(ar, br), rg = ratio(ag, bg), rb = ratio(ab, bb);
    const spread = Math.max(rr, rg, rb) - Math.min(rr, rg, rb);
    assert.ok(spread > 0.2, `${s.id} alternate accent remains distinct (spread ${spread.toFixed(2)})`);
  }
});

test('accentColor dims by t and falls back to the LUT hot shade when no accent set', () => {
  const p = createPalettes(palettesData);
  const id = p.ids()[0];
  const full = parse(p.accentColor(id, 1)).reduce((a, b) => a + b, 0);
  const half = parse(p.accentColor(id, 0.5)).reduce((a, b) => a + b, 0);
  assert.ok(half < full, 't scales accent brightness down');
  // A scheme with no accent still returns a colour (the brightest base shade).
  const noAccent = createPalettes({ schemes: [1, 2, 3, 4].map((i) => ({ id: `s${i}`, rgb: [200, 100, 50] })) });
  assert.ok(!noAccent.hasAccent('s1'));
  assert.deepEqual(parse(noAccent.accentColor('s1')), parse(noAccent.shadeToColor('s1', SHADE_LEVELS - 1)));
});

test('validation rejects a malformed accent', () => {
  assert.throws(() => createPalettes({ schemes: [1, 2, 3, 4].map((i) => ({ id: `s${i}`, rgb: [0, 0, 0], accent: [0, 0] })) }), /accent/);
  assert.throws(() => createPalettes({ schemes: [1, 2, 3, 4].map((i) => ({ id: `s${i}`, rgb: [0, 0, 0], accent: [0, 0, 300] })) }), /accent/);
});

// Art-uplift: the HOT phosphor tint additive light blooms toward. It must be a
// valid rgb and brighter than the base (a "hot" end).
test('every scheme yields a hot glow tint at least as bright as its base', () => {
  const p = createPalettes(palettesData);
  for (const s of p.list()) {
    const glow = p.glow(s.id);
    assert.equal(glow.length, 3);
    for (const c of glow) assert.ok(c >= 0 && c <= 255, `${s.id} glow channel in range`);
    const baseSum = s.rgb.reduce((a, b) => a + b, 0);
    const glowSum = glow.reduce((a, b) => a + b, 0);
    assert.ok(glowSum >= baseSum, `${s.id} glow should be a hot (brighter) tint`);
  }
});

test('glowColor dims by t and the LUT carries glow into the ramp top', () => {
  const p = createPalettes(palettesData);
  const id = p.ids()[0];
  const parse2 = (str) => str.match(/\d+/g).map(Number);
  const full = parse2(p.glowColor(id, 1)).reduce((a, b) => a + b, 0);
  const half = parse2(p.glowColor(id, 0.5)).reduce((a, b) => a + b, 0);
  assert.ok(half < full, 't scales glow brightness down');
  const top = parse2(p.shadeToColor(id, SHADE_LEVELS - 1));
  const hot = p.glow(id);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(top[i] - hot[i]) <= 6, 'top ramp shade blooms toward hot tint');
  // A scheme with no explicit glow still returns a hot tint (base pushed to white).
  const noGlow = createPalettes({ schemes: [1, 2, 3, 4].map((i) => ({ id: `s${i}`, rgb: [100, 100, 100] })) });
  const g = noGlow.glow('s1');
  assert.ok(g[0] > 100, 'derived glow pushes the base toward white');
});

test('validation rejects a malformed glow', () => {
  assert.throws(() => createPalettes({ schemes: [1, 2, 3, 4].map((i) => ({ id: `s${i}`, rgb: [0, 0, 0], glow: [0, 0] })) }), /glow/);
  assert.throws(() => createPalettes({ schemes: [1, 2, 3, 4].map((i) => ({ id: `s${i}`, rgb: [0, 0, 0], glow: [0, 0, 300] })) }), /glow/);
});
