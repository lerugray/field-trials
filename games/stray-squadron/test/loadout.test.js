// The mid-run loadout choice (M7). Seeded and deterministic; boons are upside-only;
// the unlocked pool widens with the ship; a taken boon never reappears; aggregate
// mods sum correctly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOONS, LOADOUT, boonById, boonUnlocked, availableBoons, drawChoices, applyLoadout, instantOf,
} from '../src/run/loadout.js';

const NODE = { id: '1-0' };
const NONE = { hull: 0, blaster: 0, boost: 0 };
const MAXED = { hull: 3, blaster: 3, boost: 3 };

test('every boon is upside-only (no negative mod anywhere)', () => {
  for (const b of BOONS) {
    if (!b.mods) continue;
    for (const k of Object.keys(b.mods)) assert.ok(b.mods[k] >= 0, 'negative mod ' + k + ' on ' + b.id);
  }
});

test('the base pool is offered with a bare ship; richer boons are gated', () => {
  const base = availableBoons(NONE);
  const ids = base.map((b) => b.id);
  assert.ok(ids.includes('plating') && ids.includes('patch') && ids.includes('scavenger') && ids.includes('sights'));
  assert.ok(!ids.includes('coils'), 'coils needs blaster tier 1');
  assert.ok(!ids.includes('bulwark'), 'bulwark needs hull tier 2');
});

test('upgrades unlock the gated boons', () => {
  assert.ok(!boonUnlocked(boonById('coils'), NONE));
  assert.ok(boonUnlocked(boonById('coils'), { blaster: 1 }));
  assert.ok(!boonUnlocked(boonById('bulwark'), { hull: 1 }));
  assert.ok(boonUnlocked(boonById('bulwark'), { hull: 2 }));
  assert.equal(availableBoons(MAXED).length, BOONS.length, 'a maxed ship unlocks the whole pool');
});

test('drawChoices is deterministic and bounded by choicesPerBranch', () => {
  const a = drawChoices('run-1', NODE, MAXED, []);
  const b = drawChoices('run-1', NODE, MAXED, []);
  assert.deepEqual(a, b);
  assert.ok(a.length <= LOADOUT.choicesPerBranch);
  assert.ok(a.length >= 1);
});

test('a taken boon never appears in a later draw', () => {
  const taken = ['plating'];
  const draw = drawChoices('run-2', NODE, MAXED, taken);
  assert.ok(!draw.some((b) => b.id === 'plating'));
  assert.ok(!availableBoons(MAXED, taken).some((b) => b.id === 'plating'));
});

test('draws vary across branch nodes (not a constant offer)', () => {
  const sigs = new Set();
  for (let i = 0; i < 12; i++) {
    sigs.add(drawChoices('run-3', { id: 'n' + i }, MAXED, []).map((b) => b.id).join(','));
  }
  assert.ok(sigs.size > 1, 'different nodes should offer different draws');
});

test('applyLoadout sums persistent mods across taken boons', () => {
  const agg = applyLoadout(['plating', 'bulwark', 'coils', 'scavenger']);
  assert.equal(agg.bonusHull, 5, 'plating +2 and bulwark +3');
  assert.equal(agg.damageBonus, 1, 'coils +1');
  assert.ok(Math.abs(agg.salvageAdd - 0.10) < 1e-9, 'scavenger +0.10');
  assert.equal(agg.killScore, 0);
});

test('instants are flagged and excluded from persistent mods', () => {
  assert.equal(instantOf('patch'), 'healFull');
  assert.equal(instantOf('plating'), null);
  // a lone instant contributes no persistent mods
  const agg = applyLoadout(['patch']);
  for (const k of Object.keys(agg)) assert.equal(agg[k], 0);
});

test('an exhausted pool draws empty without throwing', () => {
  const allIds = BOONS.map((b) => b.id);
  assert.deepEqual(drawChoices('run', NODE, MAXED, allIds), []);
});
