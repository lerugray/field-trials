import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/sim/equipment.js';
import { UNIQUES, UNIQUE_IDS } from '../src/sim/uniques.js';
import { createStage, stepStage } from '../src/sim/stage.js';

// --- M7 weapon-usage probe: the commons/uncommons variety table stays situationally competitive,
// and uniques are build-changers (a tradeoff), never pure stat sticks. ---

function dims(w) { return { dmg: w.damage, reach: w.reach, speed: 1 / w.cooldownTicks }; }
// A dominates B iff A is >= on every dimension and strictly > on at least one.
function dominates(a, b) {
  const A = dims(a), B = dims(b);
  const ge = A.dmg >= B.dmg && A.reach >= B.reach && A.speed >= B.speed;
  const gt = A.dmg > B.dmg || A.reach > B.reach || A.speed > B.speed;
  return ge && gt;
}

test('probe: no common/uncommon weapon strictly dominates another (each leads in a dimension)', () => {
  const table = Object.values(WEAPONS);
  assert.ok(table.length >= 5, 'a real variety table');
  for (const a of table) {
    for (const b of table) {
      if (a.id === b.id) continue;
      assert.ok(!dominates(a, b), `${a.id} strictly dominates ${b.id} — variety table has a dead option`);
    }
  }
});

test('probe: every unique is a build-changer, not a stat stick', () => {
  const starter = WEAPONS['short-blade'];
  for (const id of UNIQUE_IDS) {
    const u = UNIQUES[id];
    const hasMod = Object.keys(u.mod).length > 0;
    // Not a stat stick: it carries a rule mod, OR it is not a strict upgrade over the starter
    // (i.e. it pays for its strength somewhere).
    const paysForItself = !dominates(u, starter);
    assert.ok(hasMod || paysForItself, `${id} looks like a pure stat stick (dominates the starter, no mod)`);
    assert.ok(u.rule && u.rule.length > 0, `${id} states the rule it bends`);
  }
});

// --- M7 grind-rate probe: measure checkpoint-adjacent farming (kill trash → rest → respawn → repeat)
// so a decay/soft-cap guard can be proposed from data rather than invented. ---

test('probe: measures the checkpoint-adjacent grind rate (XP per 1000 ticks)', () => {
  const W = 16;
  const row = (() => { const a = Array(W).fill('.'); a[3] = 'p'; a[5] = 'c'; a[8] = 'w'; a[14] = 'x'; return a.join(''); })();
  const s = createStage({ rows: ['.'.repeat(W), '.'.repeat(W), row, '#'.repeat(W)], startXp: 0 }, { seed: 'grind' });
  // Stand at the walker and farm: attack every tick; rest (respawn it) whenever it dies.
  s.player.x = s.enemies[0].x - 14; s.player.facing = 1;
  s.activeCheckpoint = 0; // pretend rested here
  const TICKS = 1000;
  let xp0 = s.progress.totalXp, kills = 0;
  for (let t = 0; t < TICKS; t++) {
    const dead = !s.enemies[0].alive;
    // If the trash is down, hop to the checkpoint and rest to respawn it, then back.
    if (dead) { s.player.x = s.checkpoints[0].x; stepStage(s, { moveDir: 0, rest: true }); s.player.x = s.enemies[0].x - 14; continue; }
    const ev = stepStage(s, { moveDir: 0, attackPressed: t % 12 === 0 });
    if (ev.some((e) => e.type === 'kill')) kills++;
  }
  const xpPer1000 = s.progress.totalXp - xp0;
  assert.ok(kills > 0, 'the farm actually killed trash');
  assert.ok(xpPer1000 > 0, `measured grind rate ${xpPer1000} xp / 1000 ticks (${kills} kills)`);
  // Report for the ratify notes (no silent policy — a decay guard is proposed in PROGRESS.md).
  // At ~60 ticks/s, 1000 ticks ≈ 16.7s.
});
