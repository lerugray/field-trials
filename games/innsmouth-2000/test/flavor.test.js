import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { makeSim, FLAVOR_FILLER, FLAVOR_COOLDOWN } from '../src/sim.js';
import { TOOL, applyTool } from '../src/tools.js';
import { serializeSave, deserializeSave } from '../src/save.js';

// A bare, quiet grass map: nothing zoned, so no real headline is ever filed and only the flavor
// cycle can speak. This isolates the Courier's filler column (M9).
function quietMap(cols = 8, rows = 8) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  return m;
}

function stepN(sim, n) { for (let i = 0; i < n; i++) sim.step(); return sim; }

test('a quiet town still goes to press: filler appears after the cooldown', () => {
  const sim = makeSim(quietMap(), { seed: 'flavor' });
  stepN(sim, FLAVOR_COOLDOWN);
  const flavor = sim.events.filter((e) => e.kind === 'flavor');
  assert.equal(flavor.length, 1, 'exactly one filler after one cooldown of quiet months');
  assert.ok(flavor[0].headline && flavor[0].sub, 'filler carries a headline and a sub-line');
});

test('filler is throttled: no more than one every FLAVOR_COOLDOWN months', () => {
  const sim = makeSim(quietMap(), { seed: 'flavor' });
  stepN(sim, FLAVOR_COOLDOWN * 5);
  const flavor = sim.events.filter((e) => e.kind === 'flavor');
  assert.equal(flavor.length, 5, 'five fillers across five cooldown windows');
});

test('the filler column rotates without an immediate repeat', () => {
  const sim = makeSim(quietMap(), { seed: 'flavor' });
  // Enough quiet months to walk the whole pool at least once.
  stepN(sim, FLAVOR_COOLDOWN * (FLAVOR_FILLER.length + 2));
  const heads = sim.events.filter((e) => e.kind === 'flavor').map((e) => e.headline);
  for (let i = 1; i < heads.length; i++) {
    assert.notEqual(heads[i], heads[i - 1], 'consecutive fillers differ');
  }
});

test('a real headline takes the page: no month prints both real news and filler', () => {
  // A genuine growing town files real headlines (population milestones) in some months and is quiet
  // in others. The invariant: filler fills only the silence, so no single month (tick) ever carries
  // both a real event and a filler.
  const m = quietMap(16, 16);
  for (let c = 1; c <= 14; c++) applyTool(m, TOOL.ROAD, c, 5);
  for (let c = 1; c <= 14; c++) applyTool(m, TOOL.ZONE_R, c, 4);
  for (let c = 1; c <= 14; c++) applyTool(m, TOOL.ZONE_R, c, 6);
  const sim = makeSim(m, { seed: 'grow' });
  stepN(sim, 120);
  const real = new Set(sim.events.filter((e) => e.kind !== 'flavor').map((e) => e.tick));
  const filler = sim.events.filter((e) => e.kind === 'flavor');
  assert.ok(real.size > 0, 'the growing town filed some real headlines');
  assert.ok(filler.length > 0, 'and printed filler in the quiet months');
  for (const f of filler) {
    assert.ok(!real.has(f.tick), `no filler shares a month with a real headline (tick ${f.tick})`);
  }
});

test('the flavor cycle is deterministic across a save/load round-trip', () => {
  const a = makeSim(quietMap(), { seed: 'flavor', wrath: false });
  stepN(a, FLAVOR_COOLDOWN * 2 + 1);
  const reloaded = deserializeSave(serializeSave(a));
  stepN(a, FLAVOR_COOLDOWN * 2);
  stepN(reloaded, FLAVOR_COOLDOWN * 2);
  const heads = (s) => s.events.filter((e) => e.kind === 'flavor').map((e) => e.headline).join('|');
  assert.equal(heads(reloaded), heads(a), 'the reloaded town prints the same filler column');
});

test('no filler uses modern vocabulary or an em-dash (period register, hard rule 10)', () => {
  const banned = /\b(email|phone|internet|okay|guys|television|radio|automobile|weekend)\b|—/i;
  for (const [headline, sub] of FLAVOR_FILLER) {
    assert.ok(!banned.test(headline), `headline stays in register: ${headline}`);
    assert.ok(!banned.test(sub), `sub stays in register: ${sub}`);
  }
});
