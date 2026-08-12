import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStage, stepStage } from '../src/sim/stage.js';

const W = 30;
const air = '.'.repeat(W);
function markerRow(pairs) { const a = Array(W).fill('.'); for (const [i, c] of pairs) a[i] = c; return a.join(''); }
// floor with a pit at cols 20-21
const floor = Array.from({ length: W }, (_, c) => (c === 20 || c === 21 ? '.' : '#')).join('');
const DEF = {
  startXp: 70, // L1 + 20 at risk
  rows: [air, air, markerRow([[2, 'p'], [10, 'c'], [15, 'w'], [26, 'x']]), floor],
};

function atCheckpoint(s) { s.player.x = s.checkpoints[0].x; s.player.y = s.checkpoints[0].y; }

test('souls-stage: touching a checkpoint activates it and sets the respawn point', () => {
  const s = createStage(DEF, { seed: 'cp' });
  assert.equal(s.activeCheckpoint, -1);
  atCheckpoint(s);
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(ev.some((e) => e.type === 'checkpoint'));
  assert.equal(s.activeCheckpoint, 0);
  assert.equal(s.respawnPoint.x, s.checkpoints[0].x);
});

test('souls-stage: resting at a checkpoint heals to full and respawns trash', () => {
  const s = createStage(DEF, { seed: 'rest' });
  s.progress.hp = 5;
  s.enemies[0].alive = false; // pretend it was killed
  atCheckpoint(s);
  const ev = stepStage(s, { moveDir: 0, rest: true });
  assert.ok(ev.some((e) => e.type === 'rest'));
  assert.equal(s.progress.hp, s.progress.stats.maxHP, 'healed to full');
  assert.ok(s.enemies[0].alive, 'trash respawned');
});

test('souls-stage: death respawns at the checkpoint, drops a marker, keeps the level', () => {
  const s = createStage(DEF, { seed: 'death' });
  atCheckpoint(s);
  stepStage(s, { moveDir: 0 }); // activate checkpoint
  const lvl = s.progress.level;
  const atRisk = s.progress.totalXp - 50; // above L1 floor
  // Kill the player.
  s.progress.hp = 0;
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(ev.some((e) => e.type === 'respawn'));
  assert.equal(s.deaths, 1);
  assert.equal(s.progress.hp, s.progress.stats.maxHP, 'respawn at full HP');
  assert.equal(s.progress.level, lvl, 'level retained');
  assert.ok(s.marker && s.marker.xp === atRisk, 'marker holds the at-risk XP');
  // respawned at the checkpoint
  assert.ok(Math.abs(s.player.x - s.checkpoints[0].x) < 1);
});

test('souls-stage: recovering the marker restores the XP', () => {
  const s = createStage(DEF, { seed: 'recover' });
  atCheckpoint(s);
  stepStage(s, { moveDir: 0 });
  const full = s.progress.totalXp;
  s.progress.hp = 0;
  stepStage(s, { moveDir: 0 }); // die → marker
  assert.ok(s.marker);
  // Walk the player onto the marker.
  s.player.x = s.marker.x; s.player.y = s.marker.y;
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(ev.some((e) => e.type === 'recover'));
  assert.equal(s.marker, null);
  assert.equal(s.progress.totalXp, full, 'XP restored');
});

test('souls-stage: falling in a pit respawns and relocates the marker to safe ground', () => {
  const s = createStage(DEF, { seed: 'pit' });
  // Drop the player into the pit (cols 20-21) below the world.
  s.player.x = 20 * 16 + 8;
  s.player.y = s.tilemap.worldHeight + 40;
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(ev.some((e) => e.type === 'respawn'));
  assert.ok(s.marker, 'marker dropped');
  // The marker must be on solid ground, not floating in the pit column.
  assert.ok(s.tilemap.solidAtPx(s.marker.x, s.marker.y + 2), 'marker relocated onto solid ground');
});

test('souls-stage: a second death (away from the marker) forfeits the old marker', () => {
  const s = createStage(DEF, { seed: 'forfeit' });
  atCheckpoint(s);
  stepStage(s, { moveDir: 0 });        // activate checkpoint (~x168)
  // Die away from the checkpoint so the marker isn't sitting on the respawn point.
  s.player.x = 15 * 16; s.player.y = s.checkpoints[0].y;
  s.progress.hp = 0;
  stepStage(s, { moveDir: 0 });        // first death → marker out at ~x240; respawn at the checkpoint
  const firstMarkerXp = s.marker.xp;
  assert.ok(firstMarkerXp > 0);
  const oldMarkerX = s.marker.x;
  // Earn a bit; die again at the checkpoint (not on the old marker) → forfeit.
  s.progress.totalXp = 60;             // 10 new at risk
  s.progress.hp = 0;
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(ev.some((e) => e.type === 'forfeit' && e.xp === firstMarkerXp), 'old marker forfeited');
  assert.equal(s.marker.xp, 10, 'new marker holds the new at-risk XP');
  assert.notEqual(s.marker.x, oldMarkerX, 'new marker is at the new death site');
});

test('souls-stage: respawn clears jump transients and grounds on a supported surface', () => {
  const s = createStage({ ...DEF, kit: { doubleJump: true } }, { seed: 'respawn-jump' });
  const gold0 = s.gold;
  atCheckpoint(s);
  stepStage(s, { moveDir: 0 }); // activate checkpoint
  assert.ok(s.kit.doubleJump);

  // Leave ground, spend the air jump, and poison jump buffer/coyote before death.
  stepStage(s, { jumpPressed: true, jumpHeld: true });
  stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.equal(s.player.airJumpUsed, true);
  s.player.coyote = 3;
  s.player.jumpBuffer = 2;
  s.player.jumping = true;
  s.player.airJumped = true;

  s.progress.hp = 0;
  stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.equal(s.deaths, 1);
  assert.equal(s.player.airJumpUsed, false);
  assert.equal(s.player.airJumped, false);
  assert.equal(s.player.jumping, false);
  assert.equal(s.player.coyote, 0);
  assert.equal(s.player.jumpBuffer, 0);
  assert.equal(s.player.onGround, true, 'respawn on supported checkpoint must be grounded');
  assert.equal(s.kit.doubleJump, true, 'kit ownership preserved');
  assert.equal(s.gold, gold0, 'inventory/progression gold preserved');

  const next = stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.equal(next.filter((e) => e.type === 'double-jump').length, 0, 'immediate next press is a normal jump');
  assert.equal(s.player.airJumpUsed, false);
  assert.ok(!s.player.onGround);
});

test('souls-stage: dying re-arms an un-beaten boss to full, but a beaten boss stays beaten', () => {
  const BW = 24;
  const bair = '.'.repeat(BW);
  const bfloor = '#'.repeat(BW);
  const brow = Array(BW).fill('.'); brow[2] = 'p'; brow[10] = 'c'; brow[16] = 'B'; brow[22] = 'x';
  const bdef = { rows: [bair, bair, brow.join(''), bfloor], startXp: 220 };
  const s = createStage(bdef, { seed: 'bossreset' });
  s.player.x = s.checkpoints[0].x; s.player.y = s.checkpoints[0].y;
  stepStage(s, { moveDir: 0 }); // activate checkpoint
  // Chip the boss, then die.
  s.boss.hp = 10;
  s.progress.hp = 0;
  stepStage(s, { moveDir: 0 });
  assert.ok(s.boss.alive && s.boss.hp === 44, 'un-beaten boss re-armed to full');
  // Now beat it and die again — it stays dead.
  s.boss.alive = false;
  s.progress.hp = 0;
  stepStage(s, { moveDir: 0 });
  assert.ok(!s.boss.alive, 'beaten boss never respawns');
});
