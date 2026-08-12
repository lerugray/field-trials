// Regression tests for defects caught in the M10 sweep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStage, stepStage } from '../src/sim/stage.js';
import { createProjectile } from '../src/sim/projectile.js';

const W = 30;
function rowWith(pairs) { const a = Array(W).fill('.'); for (const [i, c] of pairs) a[i] = c; return a.join(''); }

test('defect #3: backtracking over an earlier checkpoint does NOT regress the respawn point', () => {
  const def = { rows: ['.'.repeat(W), '.'.repeat(W), rowWith([[2, 'p'], [8, 'c'], [18, 'c'], [26, 'x']]), '#'.repeat(W)] };
  const s = createStage(def, { seed: 'cp' });
  const [cp0, cp1] = s.checkpoints;
  s.player.x = cp0.x; stepStage(s, { moveDir: 0 });   // activate cp0
  s.player.x = cp1.x; stepStage(s, { moveDir: 0 });   // activate cp1
  assert.equal(s.respawnPoint.x, cp1.x);
  s.player.x = cp0.x; stepStage(s, { moveDir: 0 });   // walk back over cp0
  assert.equal(s.respawnPoint.x, cp1.x, 'respawn stays at the furthest checkpoint');
  assert.equal(s.activeCheckpoint, 1);
});

test('defect #4: resting at a checkpoint re-arms an un-beaten boss (no chip-then-rest exploit)', () => {
  const def = { rows: ['.'.repeat(W), '.'.repeat(W), rowWith([[2, 'p'], [8, 'c'], [20, 'B'], [26, 'x']]), '#'.repeat(W)], startXp: 220 };
  const s = createStage(def, { seed: 'rest-boss' });
  s.boss.hp = 10; // chipped
  s.player.x = s.checkpoints[0].x; s.player.y = s.checkpoints[0].y;
  stepStage(s, { moveDir: 0, rest: true });
  assert.equal(s.boss.hp, 44, 'boss re-armed to full on rest');
  assert.ok(s.boss.alive);
});

test('defect #4b: a BEATEN boss stays beaten across a rest', () => {
  const def = { rows: ['.'.repeat(W), '.'.repeat(W), rowWith([[2, 'p'], [8, 'c'], [20, 'B'], [26, 'x']]), '#'.repeat(W)] };
  const s = createStage(def, { seed: 'rest-beaten' });
  s.boss.alive = false;
  s.player.x = s.checkpoints[0].x; s.player.y = s.checkpoints[0].y;
  stepStage(s, { moveDir: 0, rest: true });
  assert.ok(!s.boss.alive, 'beaten boss never comes back');
});

test('defect #11: a killing hit + simultaneous lethal contact resolves as CLEAR, not death', () => {
  const def = { rows: ['.'.repeat(W), '.'.repeat(W), rowWith([[2, 'p'], [20, 'B'], [26, 'x']]), '#'.repeat(W)], startXp: 220 };
  const s = createStage(def, { seed: 'sim' });
  s.boss.hp = 1;                 // a projectile will kill it this tick
  s.progress.hp = 1;             // boss contact will drop the player to 0 the same tick
  s.player.x = s.boss.x;         // overlap the boss (contact)
  s.projectiles.push(createProjectile({ x: s.boss.x, y: s.boss.y - 10, vx: 0, damage: 50 }));
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(s.cleared, 'stage cleared on the killing blow');
  assert.equal(s.deaths, 0, 'the player was NOT credited a death on the winning tick');
  assert.ok(!ev.some((e) => e.type === 'respawn'), 'no respawn on the clear tick');
});
