// node --test — deterministic headless half of the real death loop. The browser half
// (real Enter/clicks across scorecard → trunk → start) remains an orchestrator harvest
// pass; this test drives the actual sim tick to HP-zero through repeated updraft-net falls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce } from '../src/sim/world.js';
import { defaultMeta, bankTickets, runPool } from '../src/sim/meta.js';

test('real net death files scorecard, banks tickets into meta, and seeds a clean new run', () => {
  const ended = createWorld(0xCA9, 3, ['spring-heels']);
  ended.spheresCleared = 3;
  ended.skipTickets = 1;
  const startingHp = ended.hp;

  // This is the real fall-toll branch in stepOnce, repeated deterministically until its
  // one-pip toll reaches zero. No applyDamage shortcut and no staged terminal phase.
  for (let fall = 0; fall < startingHp; fall++) {
    ended.player.pos.y = ended.killPlaneY - 1;
    stepOnce(ended, {});
    if (fall < startingHp - 1) assert.equal(ended.phase, 'play', `fall ${fall + 1} is a toll, not instant death`);
  }

  assert.equal(ended.phase, 'dead');
  assert.equal(ended.dead, true);
  assert.equal(ended.diedThisTick, true);
  assert.equal(ended.scorecard.outcome, 'death');
  assert.equal(ended.scorecard.cause, 'net');
  assert.equal(ended.scorecard.causeLabel, 'the long fall');
  assert.equal(ended.scorecard.spheresCleared, 3);
  assert.equal(ended.scorecard.capriceLine, 'Spring Heels');
  assert.ok(ended.scorecard.tickets.total > 0, 'real run depth produces a ticket payout');

  const tickAtDeath = ended.tick;
  stepOnce(ended, { jump: true, f: 1 });
  assert.equal(ended.tick, tickAtDeath, 'terminal scorecard phase freezes the ended run');

  const before = defaultMeta();
  const after = bankTickets(before, ended.scorecard);
  assert.equal(after.tickets, before.tickets + ended.scorecard.tickets.total, 'scorecard payout enters persistent meta');
  assert.deepEqual(after.trunk, before.trunk, 'banking tickets does not mutate the trunk');

  const next = createWorld(0xCAA, 0, [], runPool(after));
  assert.equal(next.phase, 'play');
  assert.equal(next.dead, false);
  assert.equal(next.hp, next.hpMax);
  assert.deepEqual(next.pool, runPool(after), 'new run uses the banked meta loadout');
  assert.equal(after.tickets, ended.scorecard.tickets.total, 'tickets persist across the new-run boundary');
});
