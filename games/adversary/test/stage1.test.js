import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE1 } from '../src/content/stage1.js';
import { createStage, stepStage } from '../src/sim/stage.js';
import { runBot } from '../src/sim/bot.js';

test('stage1: loads with trash enemies, a boss, and an exit', () => {
  const s = createStage(STAGE1, { seed: 's1' });
  assert.ok(s.enemies.length >= 5, 'has trash to level on');
  assert.ok(s.boss && s.boss.alive, 'has a boss');
  assert.ok(s.exitX > s.boss.x, 'exit is past the boss');
});

test('stage1: HEADLESS BOT clears the real Stage 1 (M3 acceptance signal)', () => {
  const s = createStage(STAGE1, { seed: 'accept' });
  const r = runBot(s, stepStage, 12000);
  assert.ok(r.cleared, `bot cleared Stage 1 (dead=${r.dead}, ticks=${r.ticks})`);
  assert.ok(!s.boss.alive, 'boss defeated');
  assert.ok(s.progress.level >= 1, 'bot leveled up on the way (real progression)');
});

test('stage1: the bot clears deterministically across seeds', () => {
  const outcomes = ['a', 'b', 'c', 'd'].map((seed) => {
    const s = createStage(STAGE1, { seed });
    const r = runBot(s, stepStage, 12000);
    return r.cleared && !r.dead;
  });
  assert.ok(outcomes.every(Boolean), 'cleared under every seed');
});
