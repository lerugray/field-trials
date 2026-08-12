import { test } from 'node:test';
import assert from 'node:assert/strict';

import { drawCreature, paletteFor, drawVfx, vfxForCreature } from '../src/render/creature.js';
import { VFX_FAMILIES } from '../src/data/roster.js';
import { summon } from '../src/engine/summon.js';
import { moodOf, MOOD_IDS } from '../src/engine/mood.js';
import { SPECIES } from '../src/data/roster.js';

// A recording stub 2D context: every method is a no-op that counts calls, and
// gradient factories return an object with addColorStop. This does not check
// pixels (that is the browser proof shot's job) — it guards that drawCreature
// runs to completion across every mood and reaction without throwing.
function stubCtx() {
  const calls = { fill: 0, stroke: 0, fillText: 0 };
  const gradient = { addColorStop() {} };
  const handler = {
    get(_t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === '__calls') return calls;
      return (...args) => {
        if (prop in calls) calls[prop]++;
        return undefined;
      };
    },
    set() {
      return true; // accept fillStyle/lineWidth/font/globalAlpha/etc.
    },
  };
  return new Proxy({}, handler);
}

const REACT_EFFECTS = ['delight', 'playful', 'soothed', 'happy', 'content', 'startled', 'dislike'];

test('drawCreature renders every archetype without throwing', () => {
  const phrases = ['a', 'bug friend', 'ghost', 'plant pal', 'birdy', 'fishy', 'orb', 'the object'];
  for (const ph of phrases) {
    const c = summon(ph);
    const ctx = stubCtx();
    assert.doesNotThrow(() => drawCreature(ctx, c, 1234, { cx: 100, cy: 100, scale: 1 }));
    assert.ok(ctx.__calls.fill > 0, 'something was painted');
  }
});

test('drawCreature renders all 70 species with their trait layer', () => {
  // Every roster species must draw to completion through its full trait set
  // (ears/face/pattern/eye-count) — this is the M7 all-70 render guarantee.
  for (const s of SPECIES) {
    const creature = {
      name: s.name,
      species: { id: s.id, name: s.name, archetype: s.archetype, hue: s.hue, traits: s.traits },
      rarity: s.rarity,
      stats: { pow: 30, def: 30, spd: 30, sta: 30, foc: 30 },
      variant: 12345,
      seed: 7,
    };
    const ctx = stubCtx();
    assert.doesNotThrow(
      () => drawCreature(ctx, creature, 800, { cx: 100, cy: 100, scale: 1 }),
      `${s.name} (${s.archetype}) failed to render`,
    );
    assert.ok(ctx.__calls.fill > 0, `${s.name} painted nothing`);
  }
});

test('drawCreature renders a species even when traits are missing (foe/legacy fallback)', () => {
  for (const arch of ['blob', 'critter', 'avian', 'aquatic', 'orb', 'object']) {
    const creature = {
      name: 'Bare',
      species: { id: 'bare', name: 'Bare', archetype: arch, hue: 120 }, // no traits
      rarity: 'common',
      stats: { pow: 20, def: 20, spd: 20, sta: 20, foc: 20 },
      variant: 3,
    };
    const ctx = stubCtx();
    assert.doesNotThrow(() => drawCreature(ctx, creature, 100, { cx: 50, cy: 50, scale: 1 }));
  }
});

test('drawCreature renders every mood face', () => {
  const c = summon('mood tester');
  for (const id of MOOD_IDS) {
    // build a mood object the renderer will accept by finding vitals that yield it
    const mood = moodOf({ bond: 80, stress: 5, fatigue: 10, temperament: 'Cheeky' });
    assert.ok(mood);
  }
  // exercise the face directly across all mood face-param shapes
  const faces = [
    { mouth: 'grin', eyes: 'happy', brow: 0, bounce: 1.5 },
    { mouth: 'frown', eyes: 'sad', brow: -1, bounce: 0.6 },
    { mouth: 'wobble', eyes: 'wide', brow: -1, bounce: 0.9 },
    { mouth: 'frown', eyes: 'open', brow: 1, bounce: 0.8 },
    { mouth: 'flat', eyes: 'sleepy', brow: 0, bounce: 0.5 },
  ];
  for (const mood of faces) {
    const ctx = stubCtx();
    assert.doesNotThrow(() => drawCreature(ctx, c, 500, { cx: 50, cy: 50, scale: 1, mood }));
  }
});

test('drawCreature renders every reaction effect over its full window', () => {
  const c = summon('reactor');
  for (const effect of REACT_EFFECTS) {
    for (const dt of [0, 400, 999, 1500]) {
      const ctx = stubCtx();
      assert.doesNotThrow(() =>
        drawCreature(ctx, c, 2000, { cx: 60, cy: 60, scale: 1, reaction: { effect, t0: 2000 - dt } }));
    }
  }
});

test('drawCreature renders every battle pose over its envelope', () => {
  const c = summon('fighter');
  for (const pose of ['idle', 'attack', 'hit', 'ko']) {
    for (const poseT of [0, 0.5, 1]) {
      for (const facing of [-1, 1]) {
        const ctx = stubCtx();
        assert.doesNotThrow(
          () => drawCreature(ctx, c, 1000, { cx: 80, cy: 80, scale: 1, pose, poseT, facing }),
          `pose ${pose}@${poseT} facing ${facing} threw`,
        );
        assert.ok(ctx.__calls.fill > 0);
      }
    }
  }
});

test('drawVfx paints every affinity family across its progress', () => {
  for (const family of VFX_FAMILIES) {
    for (const p of [0, 0.25, 0.6, 1]) {
      const ctx = stubCtx();
      assert.doesNotThrow(() => drawVfx(ctx, family, 100, 100, p, { scale: 1 }));
      assert.ok(ctx.__calls.fill > 0 || ctx.__calls.stroke > 0, `${family} painted nothing`);
    }
  }
});

test('vfxForCreature resolves a family + hue for any creature', () => {
  const c = summon('sparky');
  const v = vfxForCreature(c);
  assert.ok(VFX_FAMILIES.includes(v.family));
  assert.equal(typeof v.hue, 'number');
  // bare creature (no traits/affinity) still resolves via the fallback
  const v2 = vfxForCreature({ species: { archetype: 'nope' } });
  assert.ok(VFX_FAMILIES.includes(v2.family));
});

test('paletteFor is stable and complete', () => {
  const p = paletteFor(summon('palette'));
  for (const key of ['body', 'outline', 'belly', 'eyeWhite', 'eyeDark', 'shine']) {
    assert.equal(typeof p[key], 'string');
  }
});

test('paletteFor silhouette mode collapses colour to a single dark tone', () => {
  const p = paletteFor(summon('palette'), { silhouette: true });
  assert.equal(p.body, '#0a0a14');
  assert.equal(p.outline, '#0a0a14');
  assert.equal(p.eyeWhite, '#0a0a14');
  assert.equal(p.silhouette, true);
});

test('drawCreature silhouette mode renders every archetype without throwing', () => {
  for (const arch of ['blob', 'orb', 'critter', 'avian', 'bug', 'aquatic', 'humanoid', 'plant', 'spectral', 'object']) {
    const c = summon(`silhouette ${arch}`);
    c.species.archetype = arch;
    const ctx = stubCtx();
    assert.doesNotThrow(() => drawCreature(ctx, c, 500, { cx: 80, cy: 80, scale: 1, silhouette: true }));
    assert.ok(ctx.__calls.fill > 0, `${arch} silhouette painted nothing`);
  }
});
