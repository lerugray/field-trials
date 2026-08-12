// drops.test.js — M11: uniques enter the campaign as first-kill boss drops + guarded exploration
// pickups (DIRECTIONS-20260806-M11). Covers the directive's required tests: first-kill grants, no
// duplicate on a re-arm kill, save/load round-trip of granted uniques, and campaign-obtainable
// coverage (every unique reachable).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStage, stepStage } from '../src/sim/stage.js';
import { serializeSave, applySave } from '../src/sim/save.js';
import { UNIQUE_IDS, uniqueDef } from '../src/sim/uniques.js';
import { BOSS_DROPS, EXPLORATION_DROPS, allObtainableUniques, explorationDropsFor } from '../src/content/drops.js';
import { CAMPAIGN_NODES } from '../src/content/campaign.js';

const W = 24;
const brow = (() => { const a = Array(W).fill('.'); a[2] = 'p'; a[16] = 'B'; a[22] = 'x'; return a.join(''); })();
// A flat one-boss stage carrying a boss drop; startXp gives enough strength to chip the boss down.
function bossStageDef(bossDrop, uniquePickups) {
  return { rows: ['.'.repeat(W), '.'.repeat(W), brow, '#'.repeat(W)], startXp: 400, bossDrop, uniquePickups };
}
function nearBoss(s) { s.player.x = s.boss.x - 20; s.player.facing = 1; return s; }

// Drive attacks until the boss dies (or a step cap), collecting every event.
function killBoss(s) {
  const evs = [];
  for (let i = 0; i < 300 && s.boss && s.boss.alive; i++) {
    evs.push(...stepStage(s, { moveDir: 0, attackPressed: i % 2 === 0, attackDown: true }));
  }
  return evs;
}

test('drops: a boss grants its mapped unique on first kill (event + inventory)', () => {
  const s = nearBoss(createStage(bossStageDef('unique-7'), { seed: 'd1' }));
  const evs = killBoss(s);
  assert.ok(!s.boss.alive, 'boss defeated');
  const drop = evs.find((e) => e.type === 'unique-drop');
  assert.ok(drop, 'a unique-drop event fired');
  assert.equal(drop.id, 'unique-7');
  assert.equal(drop.source, 'boss');
  assert.ok(s.inventory.weapons.includes('unique-7'), 'unique landed in the inventory');
});

test('drops: no drop when the boss carries no mapping', () => {
  const s = nearBoss(createStage(bossStageDef(null), { seed: 'd2' }));
  const evs = killBoss(s);
  assert.ok(!s.boss.alive);
  assert.ok(!evs.some((e) => e.type === 'unique-drop'), 'no unique-drop without a mapping');
});

test('drops: a re-armed boss does not drop the unique twice', () => {
  const s = nearBoss(createStage(bossStageDef('unique-2'), { seed: 'd3' }));
  const first = killBoss(s);
  assert.equal(first.filter((e) => e.type === 'unique-drop').length, 1, 'one drop on first kill');
  const ownedBefore = [...s.inventory.weapons];

  // Simulate a re-arm (as if the player had died un-beaten): revive the boss, clear the stage-clear
  // latch (else stepStage short-circuits), and kill it again.
  s.boss.alive = true;
  s.boss.hp = 40; // any positive HP — killBoss chips it back down
  s.cleared = false;
  const second = killBoss(s);
  assert.ok(!s.boss.alive, 're-killed');
  assert.equal(second.filter((e) => e.type === 'unique-drop').length, 0, 'no second drop on the re-arm kill');
  assert.deepEqual(s.inventory.weapons, ownedBefore, 'inventory unchanged — no duplicate');
});

test('drops: granted unique survives a save/load round-trip (owned + equipped)', () => {
  const def = bossStageDef('unique-3');
  const s = nearBoss(createStage(def, { seed: 'd4' }));
  killBoss(s);
  assert.ok(s.inventory.weapons.includes('unique-3'));
  // Equip the granted unique, then round-trip through the save.
  s.loadout.weapon = uniqueDef('unique-3');
  const save = serializeSave(s, 's-test');

  const fresh = createStage(def, { seed: 'd4' });
  applySave(fresh, save);
  assert.ok(fresh.inventory.weapons.includes('unique-3'), 'owned unique restored');
  assert.equal(fresh.loadout.weapon.id, 'unique-3', 'equipped unique restored (not silently dropped)');
});

test('drops: a guarded exploration pickup grants its unique on touch', () => {
  const s = createStage(bossStageDef(null, [{ id: 'unique-5', col: 10 }]), { seed: 'd5' });
  assert.equal(s.uniquePickups.length, 1, 'pickup materialized in stage state');
  const u = s.uniquePickups[0];
  s.player.x = u.x; s.player.y = u.y + 8; // stand on the pickup
  const evs = stepStage(s, { moveDir: 0 });
  const drop = evs.find((e) => e.type === 'unique-drop');
  assert.ok(drop && drop.id === 'unique-5' && drop.source === 'pickup', 'pickup granted the unique');
  assert.ok(s.inventory.weapons.includes('unique-5'));
  assert.ok(u.collected, 'pickup consumed');
});

test('drops: a reloaded stage does not re-offer an already-owned exploration pickup', () => {
  const def = bossStageDef(null, [{ id: 'unique-6', col: 10 }]);
  const s = createStage(def, { seed: 'd6' });
  const u = s.uniquePickups[0];
  s.player.x = u.x; s.player.y = u.y + 8;
  stepStage(s, { moveDir: 0 });
  const save = serializeSave(s, 's-test');

  const fresh = createStage(def, { seed: 'd6' });
  applySave(fresh, save);
  assert.ok(fresh.uniquePickups[0].collected, 'owned pickup marked collected on load');
});

test('coverage: every unique is obtainable in the campaign (boss drops ∪ exploration pickups)', () => {
  const obtainable = allObtainableUniques();
  assert.equal(obtainable.size, UNIQUE_IDS.length, 'obtainable set covers all uniques');
  for (const id of UNIQUE_IDS) assert.ok(obtainable.has(id), `${id} is reachable`);
});

test('coverage: boss-drop mapping is a bijection onto valid uniques (no double-mapped id)', () => {
  const vals = Object.values(BOSS_DROPS);
  assert.equal(new Set(vals).size, vals.length, 'no unique is mapped to two bosses');
  for (const id of vals) assert.ok(uniqueDef(id), `${id} is a real unique`);
  for (const d of EXPLORATION_DROPS) {
    assert.ok(uniqueDef(d.id), `${d.id} is a real unique`);
    assert.ok(!vals.includes(d.id), 'exploration drop is not also a boss drop');
  }
});

test('coverage: every campaign boss node carries its mapped drop; exploration pickups land in-stage', () => {
  const seen = new Set();
  const visit = (id, stageDef) => {
    if (BOSS_DROPS[id]) {
      assert.equal(stageDef.bossDrop, BOSS_DROPS[id], `${id} stage def carries its boss drop`);
      seen.add(BOSS_DROPS[id]);
    }
    for (const d of explorationDropsFor(id)) {
      assert.ok((stageDef.uniquePickups || []).some((p) => p.id === d.id), `${id} carries pickup ${d.id}`);
      // and it materializes when the stage is built
      const st = createStage(stageDef, { seed: 'cov-' + id });
      assert.ok(st.uniquePickups.some((p) => p.id === d.id), `${d.id} materializes in ${id}`);
      seen.add(d.id);
    }
  };
  for (const node of CAMPAIGN_NODES) {
    if (node.branch) { visit(node.branch.left.id, node.branch.left.stage); visit(node.branch.right.id, node.branch.right.stage); }
    else visit(node.id, node.stage);
  }
  for (const id of UNIQUE_IDS) assert.ok(seen.has(id), `${id} is placed somewhere in the campaign`);
});
