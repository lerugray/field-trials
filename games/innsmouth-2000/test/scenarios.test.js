// Difficulty / scenario starts (M8).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap } from '../src/mapgen.js';
import { makeSim, SPEED } from '../src/sim.js';
import { SCENARIOS, SCENARIO_LIST, scenarioFor, applyScenario } from '../src/scenarios.js';

function start(key) {
  const map = makeMap({ seed: `scenario-${key}`, cols: 48, rows: 48 });
  const sc = scenarioFor(key);
  const sim = makeSim(map, { seed: 'sc', wrath: true, ...sc.opts });
  applyScenario(sim, key);
  return sim;
}

test('every scenario has a label, blurb, and a treasury/dread', () => {
  for (const key of SCENARIO_LIST) {
    const sc = SCENARIOS[key];
    assert.ok(sc.label && sc.blurb, `${key} is described`);
    assert.ok(Number.isFinite(sc.opts.treasury) && Number.isFinite(sc.opts.dreadBase), `${key} has a start`);
  }
});

test('easy is richer and calmer than hard', () => {
  assert.ok(SCENARIOS.easy.opts.treasury > SCENARIOS.hard.opts.treasury);
  assert.ok(SCENARIOS.easy.opts.dreadBase < SCENARIOS.hard.opts.dreadBase);
});

test('every scenario starts at Creep; Quiet Cove alone halves neglected favor pressure', () => {
  // Operator ruling 2026-08-09: all scenarios start at the slowest speed so a
  // player can found a town before the pressure mounts.
  for (const key of ['easy', 'standard', 'hard', 'recovery']) {
    assert.equal(SCENARIOS[key].startSpeed, SPEED.CREEP);
  }
  for (const key of ['standard', 'hard', 'recovery']) {
    assert.equal(SCENARIOS[key].opts.wrathPace, undefined, `${key} keeps ordinary wrath pacing`);
  }
  const calm = start('easy');
  const hard = start('hard');
  calm.step(); hard.step();
  assert.ok(70 - calm.favor.shub < 70 - hard.favor.shub, 'neglect advances more slowly in Quiet Cove');
});

test('an unknown key falls back to the standard start', () => {
  assert.equal(scenarioFor('nonsense').key, 'standard');
});

test('the scenarios set the treasury and ambient dread', () => {
  assert.equal(start('easy').treasury, SCENARIOS.easy.opts.treasury);
  assert.equal(start('hard').dreadBase, SCENARIOS.hard.opts.dreadBase);
});

test('the recovery start has already been flooded, and is not mid-disaster', () => {
  const sim = start('recovery');
  assert.equal(sim.disaster, null, 'the tide has come and gone, not still crawling');
  let flooded = 0;
  for (const t of sim.map.tiles) if (t && t.scar && t.scar.kind === 'flooded') flooded++;
  assert.ok(flooded > 0, 'the low shore bears flood scars to rebuild');
  assert.ok(sim.treasury <= SCENARIOS.recovery.opts.treasury, 'and a lean treasury');
});
