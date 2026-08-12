import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SPECIES } from '../src/data/roster.js';
import { summon } from '../src/engine/summon.js';
import { measureCreature, recenterOffsetY } from '../src/render/creature.js';
import { lifeStage, LIFESPAN_WEEKS } from '../src/engine/raise.js';

// The M12 item-1 "headless probe": measure every species' drawn footprint at
// every life stage against the real creature-window viewport, and assert the
// systematic recenter keeps the whole creature inside its window with margins.
// This is the audit the directive asks for — a clip anywhere fails the suite.

// A creature for a given species (the rig — the only thing that sets bounds —
// depends on species traits + archetype, not on the phrase seed).
function creatureFor(species, age) {
  return { ...summon('probe'), species, rarity: species.rarity, age };
}

// Ages spanning the four life stages, so the audit is literally "every stage":
// young, prime, elder, then past-lifespan twilight.
const STAGE_AGES = [1, 16, LIFESPAN_WEEKS - 1, LIFESPAN_WEEKS + 2];

// The main stage uses scale = min(cw,chh)/320 and centres the footprint on cy.
// A representative desktop pen (stage grid cell at 1280x800) plus a squarer one.
const VIEWPORTS = [
  { cw: 900, chh: 615 },
  { cw: 520, chh: 520 },
  { cw: 380, chh: 360 }, // mobile stage
];
const MIN_MARGIN = 24; // px of clear space demanded above and below the creature

test('every species is centred in its window with margins, at every life stage', () => {
  const seenStages = new Set();
  for (const sp of SPECIES) {
    for (const age of STAGE_AGES) {
      seenStages.add(lifeStage(age).key);
      const c = creatureFor(sp, age);
      const box = measureCreature(c);
      const off = recenterOffsetY(c);

      // recenter puts the footprint's vertical midpoint on cy, by construction.
      const rMin = box.minY + off;
      const rMax = box.maxY + off;
      assert.ok(
        Math.abs(rMin + rMax) < 1e-6,
        `${sp.name}: footprint not centred after recenter (mid=${((rMin + rMax) / 2).toFixed(2)})`,
      );

      for (const vp of VIEWPORTS) {
        const scale = Math.min(vp.cw, vp.chh) / 320;
        const cy = vp.chh * 0.5;
        const top = cy + rMin * scale;
        const bottom = cy + rMax * scale;
        assert.ok(
          top >= MIN_MARGIN,
          `${sp.name} @${age}w clips/hugs top in ${vp.cw}x${vp.chh} (top=${top.toFixed(0)})`,
        );
        assert.ok(
          bottom <= vp.chh - MIN_MARGIN,
          `${sp.name} @${age}w clips/hugs bottom in ${vp.cw}x${vp.chh} (bottom=${bottom.toFixed(0)}/${vp.chh})`,
        );
      }
    }
  }
  // the audit really did cover all four life stages
  assert.deepEqual([...seenStages].sort(), ['elder', 'prime', 'twilight', 'young']);
});

test('recenter offset is a pure function of the rig (stable across variant/seed)', () => {
  const sp = SPECIES.find((s) => s.archetype === 'bug');
  const a = { ...summon('one'), species: sp, rarity: sp.rarity };
  const b = { ...summon('two-different'), species: sp, rarity: sp.rarity };
  assert.equal(recenterOffsetY(a), recenterOffsetY(b));
});

test('measureCreature returns a finite footprint for every species', () => {
  for (const sp of SPECIES) {
    const box = measureCreature(creatureFor(sp, 1));
    for (const k of ['minX', 'minY', 'maxX', 'maxY']) {
      assert.ok(Number.isFinite(box[k]), `${sp.name}: ${k} not finite`);
    }
    assert.ok(box.maxY > box.minY && box.maxX > box.minX, `${sp.name}: degenerate box`);
  }
});
