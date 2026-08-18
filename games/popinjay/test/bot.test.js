// bot.test.js — M2 clearability + density contract (DESIGN-SEED M2: bot-proven
// clearability SAMPLE over both breakable states; split-arithmetic density; derived
// par). Pure sim, no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { generateStage, rosterHits } from '../src/sim/generate.js';
import { botPlay } from '../src/sim/bot.js';

const CAP = 24000; // ~400 s of sim — generous headroom over observed clears (<7000t)

function stageWith(seed, locale, stage, breakAll) {
  const stg = generateStage(seed, { locale, stage });
  if (breakAll) for (const s of stg.solids) if (s.kind === 'breakable') s.intact = false;
  return stg;
}

test('the bot clears generated stages in BOTH breakable states (clearability contract)', () => {
  let runs = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const locale = 1 + (seed % 3), stage = 1 + (seed % 4);
    for (const breakAll of [false, true]) {
      const stg = stageWith(seed, locale, stage, breakAll);
      const w = new World({ seed, stage: stg });
      const r = botPlay(w, CAP);
      assert.ok(r.cleared, `unclearable: seed ${seed} ${locale}-${stage} breakAll=${breakAll} (remaining ${w.balloons.length})`);
      runs++;
    }
  }
  assert.equal(runs, 48);
});

test('the bot pops exactly the roster hit-count (split arithmetic closes)', () => {
  for (const [seed, loc, st] of [[3, 1, 1], [11, 2, 3], [29, 3, 4], [88, 2, 2]]) {
    const stg = generateStage(seed, { locale: loc, stage: st });
    const expected = rosterHits(stg.spawns);
    const w = new World({ seed, stage: stg });
    w.parTicks = Infinity; // isolate the ROSTER arithmetic: no closing-bell drip
    w.dropChance = 0;      // ...and no drops (dynamite would force-split for free)
    const r = botPlay(w, CAP);
    assert.ok(r.cleared);
    assert.equal(r.pops, expected, `pops ${r.pops} != roster hits ${expected} (seed ${seed} ${loc}-${st})`);
  }
});

test('derived par is positive, scales with density, and is a plausible clock', () => {
  const teaching = generateStage(5, { locale: 1, stage: 1 });
  const late = generateStage(5, { locale: 3, stage: 4 });
  assert.ok(teaching.meta.parTicks > 0 && late.meta.parTicks > 0);
  assert.ok(teaching.meta.parHits === rosterHits(teaching.spawns));
  // Par is DERIVED from density and monotonic: whichever stage has more hits has the
  // longer par (same sign for the two deltas — robust regardless of which is denser).
  const dHits = late.meta.parHits - teaching.meta.parHits;
  const dPar = late.meta.parTicks - teaching.meta.parTicks;
  assert.ok(dHits * dPar >= 0, 'par must move monotonically with density');
});
