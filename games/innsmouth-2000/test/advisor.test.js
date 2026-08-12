// The Old Priest advisor (M8): his counsel reads the town's state, even-toned, appeasement first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { makeSim } from '../src/sim.js';
import { advise } from '../src/advisor.js';
import { DOOM_AWAKENINGS } from '../src/gods.js';

function townMap(cols = 10, rows = 10) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  return m;
}

const NO_DASH = /[—–]/; // hard rule 10: no em- or en-dashes in player text

test('a calm town gets steady reassurance and the closing refrain', () => {
  const sim = makeSim(townMap(), { dread: 5 });
  const a = advise(sim);
  assert.equal(a.title, 'The Old Priest');
  assert.ok(a.lines.length >= 1);
  assert.match(a.lines[a.lines.length - 1], /Appease them all/);
  for (const l of a.lines) assert.ok(!NO_DASH.test(l), `no dashes in "${l}"`);
});

test('an angry god is named first with its appeasement path', () => {
  const sim = makeSim(townMap(), { dread: 5 });
  sim.favor.dagon = 6; // dire
  const a = advise(sim);
  assert.match(a.lines[0], /Dagon/);
  assert.match(a.lines[0], /shrines by the water|Harbor Tithes/, 'names Dagon\'s path');
});

test('the Priest flags an empty treasury', () => {
  const sim = makeSim(townMap(), {});
  sim.treasury = -500; sim.servicesCut = true;
  const a = advise(sim);
  assert.ok(a.lines.some((l) => /coffers are empty|ledger right/.test(l)));
});

test('the Priest counts the dreamer\'s stirrings', () => {
  const sim = makeSim(townMap(), {});
  sim.awakenings = 2;
  const a = advise(sim);
  assert.ok(a.lines.some((l) => /dreamer has stirred 2 times/.test(l)));
});

test('once the town is lost the Priest has only the long dark', () => {
  const sim = makeSim(townMap(), {});
  sim.ended = { kind: 'doom', year: 1950, month: 3, awakenings: DOOM_AWAKENINGS };
  const a = advise(sim);
  assert.ok(a.lines.some((l) => /long dark|the sea has taken/.test(l)));
});
