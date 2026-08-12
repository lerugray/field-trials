// M10 A8 — pool-membership placement invariant. Ray saw a "Cave Rat" on the open
// overworld and read it as misplaced (a cave creature in open country). Fix: the
// Cave Rat is now DUNGEON-ONLY, and a new overworld-appropriate mundane (the
// Carrion Crow) fills the open-country / salt / fen common slots. These invariants
// keep that honest: a being can never again wander or fill a mundane overworld
// slot unless it actually lives on the overworld.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import beings from '../data/bestiary/beings.json' with { type: 'json' };
import tables from '../data/encounters/tables.json' with { type: 'json' };
import biomeData from '../data/world/biomes.json' with { type: 'json' };

const byId = new Map(beings.beings.map((b) => [b.id, b]));
const habitatOf = (id) => (byId.get(id) || {}).habitat || [];

test('every visible overworld wanderer belongs on the overworld (habitat check)', () => {
  for (const b of biomeData.biomes) {
    for (const id of b.wanderers) {
      assert.ok(byId.has(id), `biome '${b.id}' wanderer '${id}' is a real being`);
      assert.ok(
        habitatOf(id).includes('overworld'),
        `biome '${b.id}' wanders '${id}' but its habitat is ${JSON.stringify(habitatOf(id))} — not an overworld creature`,
      );
    }
  }
});

// The tables rolled during ordinary overworld travel where a MUNDANE common should
// read as belonging to open country. The perilous-verge is deliberately excluded:
// it is the boundary-breaking biome where dungeon/city wrongness bleeds onto the
// map by design (surveyor-of-fnords, the Thing) — that anomaly is the point.
const MUNDANE_OVERWORLD_TABLES = ['overworld', 'biome_pine_barrens', 'biome_salt_flats', 'biome_drowned_fen'];

test('mundane (non-unfair) overworld encounters only field overworld-habitat beings', () => {
  for (const key of MUNDANE_OVERWORLD_TABLES) {
    const t = tables.tables[key];
    assert.ok(t, `table '${key}' exists`);
    for (const e of t.entries) {
      if (e.kind !== 'fight' || e.unfair) continue; // the fat unfair tail may carry wrongness
      for (const f of e.foes) {
        assert.ok(
          habitatOf(f.being).includes('overworld'),
          `table '${key}' fields '${f.being}' as a mundane fight, but it is not an overworld creature (${JSON.stringify(habitatOf(f.being))})`,
        );
      }
    }
  }
});

test("the Cave Rat is now dungeon-only and never surfaces on the overworld (Ray's defect)", () => {
  assert.deepEqual(habitatOf('cave-rat'), ['dungeon'], 'cave-rat must be dungeon-only');
  for (const b of biomeData.biomes) {
    assert.ok(!b.wanderers.includes('cave-rat'), `cave-rat must not wander biome '${b.id}'`);
  }
  for (const key of MUNDANE_OVERWORLD_TABLES) {
    const foes = tables.tables[key].entries.flatMap((e) => (e.foes || []).map((f) => f.being));
    assert.ok(!foes.includes('cave-rat'), `cave-rat must not appear in overworld table '${key}'`);
  }
  // ...and the replacement mundane really is an overworld creature.
  assert.ok(habitatOf('carrion-crow').includes('overworld'), 'carrion-crow is an overworld being');
});
