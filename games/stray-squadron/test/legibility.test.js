// The legibility floor as a test (DESIGN-SEED M9: "HUD text clears a stated min-size/
// contrast floor, audited as a test"). Holds the shipped HUD to the stated floor:
// WCAG contrast math, every HUD ink over its dark drop-shadow clears AA, no glyph in
// the HUD source is smaller than the min, no stateful cue is color-only, the flash
// cap is enforced, and the key HUD elements fit the narrowest proof viewport (no
// clipped text). Stands as a regression from M9 on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  MIN_TEXT_PX, MIN_CONTRAST, FLASH_CAP, HURT_FLASH_MAX,
  HUD_INKS, SHADOW_BACKING, STATE_CUES,
  relativeLuminance, contrastRatio, clampFlash,
} from '../src/ui/legibility.js';
import { EXPLOSION } from '../src/combat/explosions.js';
import { HUD_LAYOUT } from '../src/ui/hud.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('WCAG contrast math: black/white is 21:1, identical is 1:1', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#345678', '#345678'), 1);
  assert.ok(relativeLuminance('#ffffff') > 0.99);
  assert.ok(relativeLuminance('#000000') < 0.01);
});

test('contrast helper composites translucent foregrounds (the drop-shadow case)', () => {
  // A 55% black shadow over black is still black -> contrast ~1.
  assert.ok(contrastRatio('rgba(0,0,0,0.55)', '#000000') < 1.1);
});

test('every HUD ink clears the AA contrast floor over its dark drop shadow', () => {
  for (const [name, color] of Object.entries(HUD_INKS)) {
    const cr = contrastRatio(color, SHADOW_BACKING);
    assert.ok(cr >= MIN_CONTRAST, `${name} (${color}) contrast ${cr.toFixed(2)} < ${MIN_CONTRAST}`);
  }
});

test('no HUD glyph is smaller than the min text size (source lint)', () => {
  const src = readFileSync(resolve(repoRoot, 'src/ui/hud.js'), 'utf8');
  const sizes = [...src.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0, 'no font sizes found — did the HUD change shape?');
  const tooSmall = sizes.filter((px) => px < MIN_TEXT_PX);
  assert.deepEqual(tooSmall, [], `HUD uses sub-floor text sizes: ${tooSmall.join(', ')}px`);
});

test('no stateful HUD cue is color-only: every state pairs a shape/icon/text/count', () => {
  const allowed = new Set(['shape', 'icon', 'text', 'count']);
  for (const c of STATE_CUES) {
    assert.ok(Array.isArray(c.cues) && c.cues.length >= 1, `${c.state}: no non-color cue`);
    for (const cue of c.cues) assert.ok(allowed.has(cue), `${c.state}: unknown cue ${cue}`);
  }
});

test('the manifest covers the real combat/boss/run states (not a stub list)', () => {
  const states = new Set(STATE_CUES.map((c) => c.state));
  for (const need of ['lock-on', 'deflect', 'hull', 'boss-telegraph', 'wing-status', 'medal-pace']) {
    assert.ok(states.has(need), `state-cue manifest missing ${need}`);
  }
});

test('flash intensity is hard-capped: no flash source exceeds the ceiling', () => {
  assert.ok(EXPLOSION.flashCap <= FLASH_CAP, 'explosion flash cap exceeds the legibility ceiling');
  assert.ok(HURT_FLASH_MAX <= FLASH_CAP, 'hurt-flash peak exceeds the ceiling');
  assert.equal(clampFlash(1), FLASH_CAP);
  assert.equal(clampFlash(0.1), 0.1);
  assert.equal(clampFlash(-5), 0);
});

test('main.js uses the shared HURT_FLASH_MAX constant, not a raw literal', () => {
  const src = readFileSync(resolve(repoRoot, 'src/main.js'), 'utf8');
  assert.ok(src.includes('HURT_FLASH_MAX'), 'main.js should reference the shared flash constant');
});

test('key HUD elements fit the narrowest proof viewport (no clipped text)', () => {
  const MIN_VW = 1280; // narrowest committed proof width
  // The REAL hud.js layout (S12 — imported, not mirrored), so this fails if the HUD's
  // bars ever grow past the narrowest viewport's margin.
  const meterW = HUD_LAYOUT.METER_W;                                   // brake/boost meter, centered
  const bossBarW = Math.min(HUD_LAYOUT.BOSS_BAR_CAP, MIN_VW * HUD_LAYOUT.BOSS_BAR_VW_FRAC); // boss gauge
  for (const [label, w] of [['meter', meterW], ['boss bar', bossBarW]]) {
    assert.ok(w <= MIN_VW - 40, `${label} width ${w} does not leave margin at ${MIN_VW}px`);
  }
});

// ---- The inline-left bar labels (art migration 2026-08-10) ------------------------
// The approved HUD frame puts each bottom-row label BESIDE its bar rather than above
// it. The check above only ever measured widths, so the layout that actually clips —
// a label stacked above a bar that already sits near the bottom edge — was invisible
// to it. These two hold the new arrangement: the labels must stay inside the frame
// vertically, and the hull row must still fit horizontally now that its label has
// pushed the segments to the right.
test('bottom-row HUD labels sit INLINE with their bars, inside the viewport', async () => {
  const { LABEL_GAP } = await import('../src/ui/hud.js');
  const src = readFileSync(resolve(repoRoot, 'src/ui/hud.js'), 'utf8');
  assert.ok(LABEL_GAP > 0, 'the inline label needs a gap from its bar');

  // Both bottom readouts share the y = vh - 44 baseline and a 12px bar height, so an
  // inline label's centre is at vh - 38: comfortably inside any viewport we ship at.
  const BAR_Y_FROM_BOTTOM = 44, BAR_H = 12;
  for (const vh of [720, 800, 900, 1440]) {
    const labelCentre = vh - BAR_Y_FROM_BOTTOM + BAR_H / 2;
    assert.ok(labelCentre < vh - 8,
      `at vh=${vh} the inline label centre ${labelCentre} is too near the bottom edge`);
    assert.ok(labelCentre > 0);
  }
  // The regression this replaces: a label drawn ABOVE the bar at y-8 with a 12px
  // ascender. Guard structurally so a future edit cannot quietly stack them again.
  assert.ok(!/fillText\('HULL', x \+ 0\.8, y - 8/.test(src),
    'HULL label is stacked above its bar again — the approved frame puts it inline-left');
});

test('the hull row still fits at the narrowest viewport with its label inline', () => {
  const MIN_VW = 1280;
  // hud.js drawHull: labelX 20, 'HULL' at 12px mono (~0.6em advance), LABEL_GAP, then
  // maxHull segments of 15 + 3 gap. Ten hull segments is well past anything the
  // upgrade ladder grants.
  const labelW = 4 * 12 * 0.62;
  const widest = 20 + labelW + 10 + 10 * (15 + 3);
  assert.ok(widest <= MIN_VW / 2,
    `hull row ${Math.round(widest)}px would crowd the centred meter at ${MIN_VW}px`);
});

test('menu inks: every DOM menu text color clears the floor against the panel bg', async () => {
  const { MENU_INKS, MENU_PANEL_BG, contrastRatio, MIN_CONTRAST } =
    await import('../src/ui/legibility.js');
  for (const [name, ink] of Object.entries(MENU_INKS)) {
    const r = contrastRatio(ink, MENU_PANEL_BG);
    assert.ok(r >= MIN_CONTRAST, `menu ink ${name} (${ink}) contrast ${r.toFixed(2)} < ${MIN_CONTRAST}`);
  }
});

// ---- A flash must read as LIGHT, not as a colour (2026-08-07) --------------------
// The operator reported "the screen is flashing brown randomly and im not sure why".
// It was the kill flash: a saturated warm ink, capped at 34% alpha by the
// accessibility law, composited over a near-black sector fog. Measured in a headless
// capture of the real build, the old ink landed on RGB(104,80,56) — hue 30,
// saturation 0.46 — which is brown. The cap is not negotiable, so the ink is what has
// to give. These hold the composited result, over every REAL sector fog, to a stated
// saturation ceiling and to actually being lighter than the scene it lands on.

test('the kill flash composites LIGHT over every sector, never into the brown band', async () => {
  const {
    HUD_WASH_INKS, FLASH_CAP, MAX_FLASH_SAT, compositeWash, saturation, relativeLuminance,
  } = await import('../src/ui/legibility.js');
  const { SECTORS } = await import('../src/world/sectors.js');
  for (const s of SECTORS) {
    const scene = `rgb(${s.fog.color.map((v) => Math.round(v * 255)).join(',')})`;
    const lit = compositeWash(HUD_WASH_INKS.FLASH, s.fog.color, FLASH_CAP);
    const sat = saturation(lit);
    assert.ok(sat <= MAX_FLASH_SAT,
      `flash over ${s.id} composites to ${lit}, saturation ${sat.toFixed(3)} > ${MAX_FLASH_SAT} (reads as a colour, not a flash)`);
    assert.ok(relativeLuminance(lit) > relativeLuminance(scene) * 4,
      `flash over ${s.id} barely lifts the scene (${lit} vs ${scene})`);
  }
});

test('the ink that produced the operator-reported brown would now FAIL this floor', async () => {
  const { FLASH_CAP, MAX_FLASH_SAT, compositeWash, saturation } =
    await import('../src/ui/legibility.js');
  const { SECTORS } = await import('../src/world/sectors.js');
  const ashfall = SECTORS.find((s) => s.id === 'ashfall');
  const old = compositeWash('rgba(255,196,120,1)', ashfall.fog.color, FLASH_CAP);
  assert.equal(old, 'rgb(104,80,56)');           // the measured pixel, pinned
  assert.ok(saturation(old) > MAX_FLASH_SAT);    // and the floor catches it
});

test('the flash cap itself is untouched — it is a law, not a tuning knob', async () => {
  const { FLASH_CAP, clampFlash } = await import('../src/ui/legibility.js');
  const { EXPLOSION, explosionFlash, strongestFlash } = await import('../src/combat/explosions.js');
  assert.equal(FLASH_CAP, 0.34);
  assert.equal(EXPLOSION.flashCap, FLASH_CAP);
  assert.equal(clampFlash(1), FLASH_CAP);
  // a huge explosion still cannot exceed it
  const pool = { list: [{ t: 0, scale: 40 }], nextId: 1 };
  assert.equal(explosionFlash(pool, false), FLASH_CAP);
  // and reduced motion still suppresses both the alpha and the bloom point
  assert.equal(explosionFlash(pool, true), 0);
  assert.equal(strongestFlash(pool, true), null);
});

test('the flash names the kill it came from, so it is not a mystery wash', async () => {
  const { createExplosions, spawnExplosion, stepExplosions, strongestFlash, explosionFlash } =
    await import('../src/combat/explosions.js');
  const pool = createExplosions();
  assert.equal(strongestFlash(pool, false), null);         // nothing dead, nothing to bloom
  const small = spawnExplosion(pool, { s: 10, lat: 0, vert: 0, scale: 0.5 });
  const big = spawnExplosion(pool, { s: 40, lat: 2, vert: -1, scale: 2.2 });
  const src = strongestFlash(pool, false);
  assert.equal(src, big, 'the flash should come from the explosion driving it');
  assert.equal(src.s, 40); assert.equal(src.lat, 2); assert.equal(src.vert, -1);
  assert.ok(small.scale < big.scale);
  // once every burst has faded past the flash window, there is no source and no alpha
  // (the flash window is the first 34%% of a burst's life; stepExplosions clamps dt to 0.1)
  stepExplosions(pool, 0.1); stepExplosions(pool, 0.1);
  assert.equal(explosionFlash(pool, false), 0);
  assert.equal(strongestFlash(pool, false), null);
});

test('the menu range-slider groove clears the NON-TEXT contrast floor', async () => {
  // A groove is a shape, not a glyph, so it answers to WCAG's 3:1 for non-text UI
  // rather than the 4.5:1 text bar. It also has to exist: the fill and the groove are
  // written into a cssText string, where one undefined colour silently deletes the
  // whole declaration and leaves an invisible control (which is exactly what happened
  // on 2026-08-07 before the built page was read back).
  const {
    MENU_SURFACES, MENU_INKS, MENU_PANEL_BG, MIN_CONTRAST_NONTEXT, contrastRatio,
  } = await import('../src/ui/legibility.js');
  for (const [name, ink] of Object.entries(MENU_SURFACES)) {
    assert.match(ink, /^#[0-9a-f]{6}$/i, `menu surface ${name} is not a usable colour`);
    const r = contrastRatio(ink, MENU_PANEL_BG);
    assert.ok(r >= MIN_CONTRAST_NONTEXT,
      `menu surface ${name} (${ink}) contrast ${r.toFixed(2)} < ${MIN_CONTRAST_NONTEXT}`);
  }
  // and the fill has to be distinguishable from the groove it sits in
  assert.ok(contrastRatio(MENU_INKS.value, MENU_SURFACES.track) >= 1.6,
    'the slider fill does not stand out from its own groove');
});

// ---- The kill flash is LOCAL, not a screen event (2026-08-07 evening) ------------
// M14d fixed the kill wash's colour (brown -> warm white) but kept its EXTENT: a
// bloom radius of 0.42 x the screen diagonal, most of the frame lit on every kill,
// one kill every ~3.5s of combat (measured in a headless driven run of the real
// build). The operator reported it the same day: "there is still a flash... super
// distracting". The bloom's job is to mark the kill — locality is the fix, and an
// off-screen kill draws NOTHING (a sourceless centred wash is exactly the
// "flashing randomly and im not sure why" complaint, one report earlier).

test('the kill bloom is local: a small shared radius fraction, not screen-scale', async () => {
  const { KILL_BLOOM_FRAC } = await import('../src/ui/hud.js');
  assert.ok(KILL_BLOOM_FRAC <= 0.2,
    `kill bloom radius ${KILL_BLOOM_FRAC} of the diagonal is a screen event, not a marker`);
  assert.ok(KILL_BLOOM_FRAC >= 0.08,
    `kill bloom radius ${KILL_BLOOM_FRAC} is too small to read as a kill mark`);
});

test('drawFlash blooms only where a kill is visible — no screen-scale literal, no centred fallback', () => {
  const src = readFileSync(resolve(repoRoot, 'src/ui/hud.js'), 'utf8');
  assert.ok(src.includes('KILL_BLOOM_FRAC'),
    'hud.js should size the kill bloom from the shared, tested constant');
  assert.ok(!/Math\.hypot\(vw,\s*vh\)\s*\*\s*0\./.test(src),
    'a bloom radius is computed from a literal fraction of the diagonal — use KILL_BLOOM_FRAC');
  assert.ok(!/at\s*\?\s*at\.x\s*:/.test(src),
    'the centred-bloom fallback for off-screen kills is still in hud.js');
});
