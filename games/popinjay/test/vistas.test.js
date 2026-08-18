// vistas.test.js — the locale environment-art seam.
//
// The art itself is judged by eye (proof captures), but three things about it are
// mechanical and MUST hold, because each failure mode is silent on screen:
//   1. every colour a light rig hands the painter is a real hex — a typo would
//      otherwise be swallowed by the fallback and paint the wrong picture (rule 4);
//   2. a backdrop is deterministic for a given (locale, stage, seed);
//   3. the art's landmarks agree with the SIM's geometry (horizon, ground top),
//      so the painted ground and the collision ground are never out of register.

import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEW } from '../src/tuning.js';
import { generateStage } from '../src/sim/generate.js';
import { Painter, NATIVE, worldScale } from '../src/render/px.js';
import {
  paintVista, renderVista, clearVistaCache, vistaCacheSize, vistaKey, rigFor,
  HORIZON, GROUND, HUD_H,
} from '../src/render/vistas.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const STAGE_KEYS = [1, 2, 3, 4, 'finale'];

test('every light-rig colour is a real hex (a typo must never reach the painter)', () => {
  for (const locale of [1, 2, 3]) {
    for (const key of STAGE_KEYS) {
      const rig = rigFor(locale, key);
      for (const field of ['sunCol', 'haze', 'warmCol', 'coolCol']) {
        assert.match(rig[field], HEX, `locale ${locale} stage ${key}: ${field} = ${rig[field]}`);
      }
      assert.ok(Array.isArray(rig.skyRamp) && rig.skyRamp.length >= 6);
      for (const c of rig.skyRamp) assert.match(c, HEX, `locale ${locale} stage ${key}: sky ramp entry ${c}`);
    }
  }
});

test('the rigs walk a real time-of-day ladder (stage 1 brightest, centerpiece darkest)', () => {
  for (const locale of [1, 2, 3]) {
    const amb = [1, 2, 3, 4].map((s) => rigFor(locale, s).amb);
    const lamps = [1, 2, 3, 4].map((s) => rigFor(locale, s).lamps);
    for (let i = 1; i < amb.length; i++) {
      assert.ok(amb[i] <= amb[i - 1], `locale ${locale}: ambient must not rise (${amb})`);
      assert.ok(lamps[i] >= lamps[i - 1], `locale ${locale}: lamps must not dim (${lamps})`);
    }
    assert.ok(rigFor(locale, 4).night, `locale ${locale} stage 4 should be a night rig`);
    assert.ok(rigFor(locale, 'finale').amb <= rigFor(locale, 4).amb, 'the finale is at least as dark as the centerpiece');
  }
});

test('an unknown stage key degrades to a valid rig instead of throwing', () => {
  for (const key of [undefined, null, 0, 99, 'endless', 'nonsense']) {
    const rig = rigFor(2, key);
    assert.match(rig.sunCol, HEX);
    assert.ok(rig.amb > 0);
  }
  assert.match(rigFor(999, 1).sunCol, HEX, 'an unknown locale falls back to locale 1');
});

test('the art landmarks agree with the sim geometry (painted ground == collision ground)', () => {
  const s = worldScale(VIEW.w);
  const stage = generateStage(12345, { locale: 1, stage: 1 });
  const groundTopWorld = stage.solids.find((x) => x.kind === 'ground').top;
  // 740 * 0.375 = 277.5 — exactly a half pixel. The art stops at the FLOOR so the
  // backdrop meets the ground slab (which is drawn from the same floor) with no seam
  // and no gap. This assertion is the guard: change GROUND_H in the sim and it fails.
  assert.equal(Math.floor(groundTopWorld * s), GROUND, 'GROUND must be the ground slab top in native pixels');
  assert.equal(Math.round(VIEW.h * 0.62 * s), HORIZON, 'HORIZON must match the composition horizon');
  assert.ok(HUD_H < HORIZON && HORIZON < GROUND && GROUND < NATIVE.h);
});

test('a backdrop is deterministic for the same (locale, stage, seed)', () => {
  clearVistaCache();
  const a = renderVista({ locale: 2, stage: 3, seed: 777 }).snapshot();
  clearVistaCache();
  const b = renderVista({ locale: 2, stage: 3, seed: 777 }).snapshot();
  assert.deepEqual(Array.from(a), Array.from(b));
});

test('all 3 locales x 5 stage states paint a full, non-blank, non-uniform frame', () => {
  clearVistaCache();
  for (const locale of [1, 2, 3]) {
    for (const key of STAGE_KEYS) {
      const p = renderVista({ locale, stage: key, seed: 4242 });
      const seen = new Set();
      let opaque = 0;
      for (let i = 0; i < GROUND * NATIVE.w; i++) {
        const o = i * 4;
        if (p.d[o + 3] === 255) opaque++;
        seen.add((p.d[o] >> 4) << 8 | (p.d[o + 1] >> 4) << 4 | (p.d[o + 2] >> 4));
      }
      assert.equal(opaque, GROUND * NATIVE.w, `locale ${locale}/${key}: every backdrop pixel must be opaque`);
      assert.ok(seen.size > 40, `locale ${locale}/${key}: only ${seen.size} colour buckets — the frame is flat`);
    }
  }
});

test('no backdrop contains a full-width near-black scanline (the NaN-alpha failure)', () => {
  // The PoC shipped exactly this defect once: a non-finite alpha clamped a whole row
  // to black and read as "a hard horizon". Cheap to assert, impossible to eyeball.
  clearVistaCache();
  for (const locale of [1, 2, 3]) {
    for (const key of [1, 3, 'finale']) {
      const p = renderVista({ locale, stage: key, seed: 99 });
      for (let y = HUD_H; y < GROUND; y++) {
        let dark = 0;
        for (let x = 0; x < NATIVE.w; x++) {
          const o = (y * NATIVE.w + x) * 4;
          if (p.d[o] + p.d[o + 1] + p.d[o + 2] < 12) dark++;
        }
        assert.ok(dark < NATIVE.w * 0.9, `locale ${locale}/${key}: row ${y} is a black band (${dark}/${NATIVE.w})`);
      }
    }
  }
});

test('the four stages of one locale are genuinely different pictures (not one wallpaper)', () => {
  clearVistaCache();
  const frames = [1, 2, 3, 4].map((s) => renderVista({ locale: 1, stage: s, seed: 5 }).snapshot());
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      let diff = 0;
      for (let k = 0; k < frames[i].length; k += 4) if (frames[i][k] !== frames[j][k]) diff++;
      assert.ok(diff > frames[i].length / 4 * 0.15, `stages ${i + 1} and ${j + 1} differ in only ${diff} pixels`);
    }
  }
});

test('the three locales are unmistakably different places', () => {
  clearVistaCache();
  const frames = [1, 2, 3].map((l) => renderVista({ locale: l, stage: 2, seed: 5 }).snapshot());
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    let diff = 0;
    for (let k = 0; k < frames[i].length; k += 4) if (frames[i][k] !== frames[j][k]) diff++;
    assert.ok(diff > frames[i].length / 4 * 0.45, `locales ${i + 1} and ${j + 1} share too much (${diff} differing px)`);
  }
});

test('the cache returns identical pixels and is bounded', () => {
  clearVistaCache();
  const p1 = new Painter(NATIVE.w, NATIVE.h);
  paintVista(p1, { locale: 3, stage: 2, seed: 11 });
  const p2 = new Painter(NATIVE.w, NATIVE.h);
  paintVista(p2, { locale: 3, stage: 2, seed: 11 });          // cache hit
  assert.deepEqual(Array.from(p1.d), Array.from(p2.d));
  assert.equal(vistaCacheSize(), 1);
  for (let s = 0; s < 24; s++) paintVista(new Painter(NATIVE.w, NATIVE.h), { locale: 1, stage: 1, seed: s });
  assert.ok(vistaCacheSize() <= 10, `cache grew to ${vistaCacheSize()}`);
  assert.equal(vistaKey(2, 'finale', 7), '2|finale|7');
});
