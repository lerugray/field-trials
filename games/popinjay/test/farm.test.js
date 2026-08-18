// farm.test.js — the FARM PROBE (DESIGN-SEED §The loop, M4 exit gate): a full run must
// out-earn a suicide-farm of the easiest stage by ≥1.5× tickets/minute, or the economy
// constants are wrong. The convex locale multipliers + centerpiece double + finale
// premium are what make progression pay. Uses the (invincible) clearance bot for timing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Run } from '../src/sim/run.js';
import { generateStage, generateFinale } from '../src/sim/generate.js';
import { botPlay } from '../src/sim/bot.js';
import { FINALE, TICK_HZ } from '../src/tuning.js';

function fullRun(seed) {
  const run = new Run({ seed });
  let ticks = 0;
  while (!run.atFinale()) {
    const w = new World({ seed, stage: generateStage(seed, { locale: run.locale, stage: run.stage }) });
    const r = botPlay(w, 60000);
    if (!r.cleared) return null; // a stage that won't clear invalidates this seed's timing
    ticks += r.ticks;
    run.clearStage(w);
  }
  const fw = new World({ seed, stage: generateFinale() });
  botPlay(fw, FINALE.survivalTicks + 200);
  ticks += fw.tick;
  run.winFinale(fw.score);
  return { tickets: run.tickets, mins: ticks / TICK_HZ / 60 };
}

function suicideFarm(seed, budgetTicks) {
  let ticks = 0, tickets = 0;
  while (ticks < budgetTicks) {
    const w = new World({ seed, stage: generateStage(seed, { locale: 1, stage: 1 }) });
    const r = botPlay(w, 60000);
    ticks += r.ticks;
    tickets += 1; // a 1-1 clear pays exactly one locale-1 ticket
  }
  return { tickets, mins: ticks / TICK_HZ / 60 };
}

test('FARM PROBE: a full run out-earns a 1-1 suicide-farm by ≥1.5× tickets/minute (economy gate)', () => {
  const seeds = [1, 2, 3, 5, 7];
  let fullRate = 0, farmRate = 0, n = 0;
  for (const seed of seeds) {
    const fr = fullRun(seed);
    if (!fr) continue;
    const fm = suicideFarm(seed, Math.round(fr.mins * TICK_HZ * 60));
    fullRate += fr.tickets / fr.mins;
    farmRate += fm.tickets / fm.mins;
    n += 1;
  }
  assert.ok(n >= 4, 'enough seeds produced a clean full run');
  const ratio = fullRate / farmRate; // average tickets/min ratio across the sample
  assert.ok(ratio >= 1.5, `full run must pay >= 1.5x the farm; got ${ratio.toFixed(2)}x`);
});
