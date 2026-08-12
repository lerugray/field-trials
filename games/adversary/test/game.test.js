import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, deriveIntent } from '../src/sim/game.js';
import { FACING } from '../src/sim/player.js';
import { createInputState, ACTIONS } from '../src/core/input.js';

function inMeleeRange() {
  const g = createGame();
  g.player.x = 175;               // within short-blade reach of the dummy at x=190
  g.player.facing = FACING.RIGHT;
  return g;
}

test('game: starting state — auto-equipped weapon, L0, starting gold, dummy at full HP', () => {
  const g = createGame();
  assert.equal(g.loadout.weapon.id, 'short-blade');
  assert.equal(g.progress.level, 0);
  assert.equal(g.gold, 30);
  assert.equal(g.dummy.hp, 24);
  assert.ok(g.player.onGround === false || g.player.onGround === true);
});

test('game: attacking the dummy in range deals damage', () => {
  const g = inMeleeRange();
  const ev = stepGame(g, { moveDir: 0, attackPressed: true });
  assert.ok(ev.some((e) => e.type === 'hit'), 'a hit event fires');
  assert.ok(g.dummy.hp < 24, 'dummy took damage');
  assert.ok(g.dummy.flash > 0, 'hit flash set');
});

test('game: out of range, attacks miss', () => {
  const g = createGame();
  g.player.x = 20; // far from the dummy at x=190
  g.player.facing = FACING.RIGHT;
  const ev = stepGame(g, { moveDir: 0, attackPressed: true });
  assert.ok(!ev.some((e) => e.type === 'hit'));
  assert.equal(g.dummy.hp, 24);
});

test('game: sustained combat defeats the dummy, pays XP+gold, and eventually levels up', () => {
  const g = inMeleeRange();
  let defeats = 0, leveled = false;
  const startGold = g.gold;
  for (let t = 0; t < 400; t++) {
    const ev = stepGame(g, { moveDir: 0, attackPressed: t % 12 === 0 });
    for (const e of ev) {
      if (e.type === 'defeat') defeats++;
      if (e.type === 'levelup') leveled = true;
    }
  }
  assert.ok(defeats >= 4, `expected several defeats, got ${defeats}`);
  assert.ok(g.gold > startGold, 'gold accumulated');
  assert.ok(leveled, 'reached at least one level-up');
  assert.ok(g.progress.level >= 1);
});

test('game: deriveIntent maps input state to movement/action intent', () => {
  const input = createInputState();
  input.update(new Set([ACTIONS.RIGHT, ACTIONS.JUMP]), 0);
  let intent = deriveIntent(input);
  assert.equal(intent.moveDir, 1);
  assert.ok(intent.jumpPressed && intent.jumpHeld);

  input.update(new Set([ACTIONS.LEFT]), 1);
  intent = deriveIntent(input);
  assert.equal(intent.moveDir, -1);
  assert.ok(!intent.jumpPressed);

  // Left+right cancel.
  input.update(new Set([ACTIONS.LEFT, ACTIONS.RIGHT]), 2);
  assert.equal(deriveIntent(input).moveDir, 0);
});

test('game: deterministic — same scripted inputs reproduce the same outcome', () => {
  function run() {
    const g = inMeleeRange();
    for (let t = 0; t < 200; t++) stepGame(g, { moveDir: 0, attackPressed: t % 12 === 0 });
    return { hp: g.dummy.hp, gold: g.gold, level: g.progress.level, xp: g.progress.totalXp };
  }
  assert.deepEqual(run(), run());
});
