import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStage, stepStage, playerAabb } from '../src/sim/stage.js';
import { botIntent, runBot } from '../src/sim/bot.js';
import { FEEL } from '../src/config/feel.js';

const W = 28;
const air = '.'.repeat(W);
const floor = '#'.repeat(W);
function markerRow(pairs) {
  const a = Array(W).fill('.');
  for (const [i, ch] of pairs) a[i] = ch;
  return a.join('');
}
// Flat stage: player left, walkers + a hopper in the path, exit at the right.
const FLAT = {
  rows: [air, air, air, air, air, air,
    markerRow([[2, 'p'], [8, 'w'], [14, 'h'], [20, 'w'], [26, 'x']]),
    floor],
};

test('stage: loads spawns from markers', () => {
  const s = createStage(FLAT, { seed: 'load' });
  assert.equal(s.enemies.length, 3);         // 2 walkers + 1 hopper
  assert.ok(s.player.x > 0 && s.player.x < 100);
  assert.ok(s.exitX > 300);                   // near the right edge
  assert.equal(s.progress.level, 0);
});

test('stage: player melee kills an adjacent enemy and gains XP+gold', () => {
  const s = createStage(FLAT, { seed: 'kill' });
  // Move the player next to the first walker.
  const walker = s.enemies[0];
  s.player.x = walker.x - 14;
  s.player.facing = 1;
  const startGold = s.gold;
  let killEvent = null;
  for (let t = 0; t < 40 && !killEvent; t++) {
    const ev = stepStage(s, { moveDir: 0, attackPressed: t % 12 === 0 });
    killEvent = ev.find((e) => e.type === 'kill');
  }
  assert.ok(killEvent, 'walker was killed');
  assert.ok(s.gold > startGold, 'gold gained');
  assert.ok(s.progress.totalXp > 0, 'xp gained');
  assert.equal(killEvent.enemy, 'walker');
  assert.ok(Number.isFinite(killEvent.at?.x) && Number.isFinite(killEvent.at?.y), 'kill event carries position');
  assert.ok(killEvent.facing === -1 || killEvent.facing === 1, 'kill event carries facing');
});

test('stage: enemy contact damages the player once, then i-frames protect', () => {
  const s = createStage(FLAT, { seed: 'contact' });
  const e = s.enemies[0];
  s.player.x = e.x; // overlap the enemy
  const hp0 = s.progress.hp;
  stepStage(s, { moveDir: 0 });
  assert.ok(s.progress.hp < hp0, 'took contact damage');
  assert.equal(s.iframes > 0, true, 'i-frames engaged');
  const hpAfter = s.progress.hp;
  // Next tick while overlapping: i-frames prevent a second hit.
  s.player.x = e.x;
  stepStage(s, { moveDir: 0 });
  assert.equal(s.progress.hp, hpAfter, 'no damage during i-frames');
});

test('stage: heal drop goes to the Items slot when walked over (used from the menu)', () => {
  const s = createStage(FLAT, { seed: 'heal' });
  const before = s.inventory.items.heal || 0;
  // Inject a heal drop right on the player.
  s.drops.push({ kind: 'heal', x: s.player.x, y: s.player.y - 10, vy: 0, value: 10, life: 100 });
  let picked = false;
  for (let t = 0; t < 30 && !picked; t++) {
    const ev = stepStage(s, { moveDir: 0 });
    if (ev.some((e) => e.type === 'pickup')) picked = true;
  }
  assert.ok(picked, 'heal picked up');
  assert.equal(s.inventory.items.heal, before + 1, 'added to Items slot');
});

test('stage: HEADLESS BOT clears the flat stage (acceptance signal)', () => {
  const s = createStage(FLAT, { seed: 'clear' });
  const r = runBot(s, stepStage, 4000);
  assert.ok(r.cleared, `bot cleared the stage (dead=${r.dead}, ticks=${r.ticks})`);
  assert.ok(!r.dead, 'bot survived');
  assert.ok(r.kills >= 1, 'bot killed enemies on the way');
});

test('stage: bot clear is deterministic for a fixed seed', () => {
  const a = runBot(createStage(FLAT, { seed: 'det' }), stepStage, 4000);
  const b = runBot(createStage(FLAT, { seed: 'det' }), stepStage, 4000);
  assert.deepEqual(a, b);
});

// A boss stage: trash to level up on, then a boss guarding the exit. Player starts with some XP,
// as they would arriving at the boss having fought through the stage.
const BOSS_STAGE = {
  startXp: 220, // ~L3: tankier + hits harder, as a mid-stage character would be
  rows: [air, air, air, air, air, air,
    markerRow([[2, 'p'], [8, 'w'], [13, 'w'], [22, 'B'], [26, 'x']]),
    floor],
};

test('stage: boss present → clear requires defeating the boss, not just the exit', () => {
  const s = createStage(BOSS_STAGE, { seed: 'boss1' });
  assert.ok(s.boss && s.boss.alive);
  // Teleport the player onto the exit without killing the boss.
  s.player.x = s.exitX;
  stepStage(s, { moveDir: 0 });
  assert.ok(!s.cleared, 'reaching the exit does not clear while the boss lives');
});

test('stage: HEADLESS BOT clears the boss stage (M3 acceptance signal)', () => {
  const s = createStage(BOSS_STAGE, { seed: 'boss-clear' });
  const r = runBot(s, stepStage, 8000);
  assert.ok(r.cleared, `bot cleared the boss stage (dead=${r.dead}, ticks=${r.ticks})`);
  assert.ok(!s.boss.alive, 'boss defeated');
});

test('stage: camera follows the player and clamps to the world', () => {
  const s = createStage(FLAT, { seed: 'cam' });
  stepStage(s, { moveDir: 0 });
  assert.equal(s.camera.x, 0); // at spawn, clamped to left edge
  s.player.x = s.tilemap.worldWidth - 1;
  stepStage(s, { moveDir: 0 });
  assert.ok(s.camera.x <= s.tilemap.worldWidth - s.vw + 1e-6);
  assert.ok(s.camera.x >= 0);
});
