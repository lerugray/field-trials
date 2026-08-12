// Title-screen SFX sockets (M12). Proves the "all silent this milestone" contract:
// with no operator player+samples, both hooks are no-ops; wire them and they fire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTitleSfx, TITLE_SFX_HOOKS } from '../src/audio/titlesfx.js';

test('the hook points are exactly move + confirm', () => {
  assert.deepEqual(TITLE_SFX_HOOKS, ['move', 'confirm']);
  const sfx = createTitleSfx();
  assert.deepEqual(sfx.hooks, ['move', 'confirm']);
});

test('unwired (this milestone): every hook is silent and reports not-wired', () => {
  const sfx = createTitleSfx();
  assert.equal(sfx.move(), false);
  assert.equal(sfx.confirm(), false);
  assert.equal(sfx.isWired('move'), false);
  assert.equal(sfx.isWired('confirm'), false);
});

test('a player with no samples still stays silent', () => {
  const played = [];
  const sfx = createTitleSfx({ play: (s) => played.push(s) });
  assert.equal(sfx.move(), false);
  assert.equal(sfx.confirm(), false);
  assert.equal(played.length, 0);
});

test('once the operator wires a player + samples, the hooks fire that sample', () => {
  const played = [];
  const sfx = createTitleSfx({
    play: (s) => played.push(s),
    samples: { move: 'MOVE_BUF', confirm: 'CONFIRM_BUF' },
  });
  assert.equal(sfx.isWired('move'), true);
  assert.equal(sfx.move(), true);
  assert.equal(sfx.confirm(), true);
  assert.deepEqual(played, ['MOVE_BUF', 'CONFIRM_BUF']);
});

test('a partially-wired socket only fires the sample it has', () => {
  const played = [];
  const sfx = createTitleSfx({ play: (s) => played.push(s), samples: { confirm: 'C' } });
  assert.equal(sfx.move(), false);    // no move sample -> silent
  assert.equal(sfx.confirm(), true);
  assert.deepEqual(played, ['C']);
});
