import test from 'node:test';
import assert from 'node:assert/strict';

import { HELP_SECTIONS } from '../src/help.js';

test('help covers every v1 surface and inlines ending rules', () => {
  assert.deepEqual(HELP_SECTIONS.map(section => section.title), [
    'Objective',
    'Ending a game',
    'Turn',
    'Movement',
    'Supply',
    'Supply coverage',
    'Combat',
    'Board marks',
    'Engine and hints',
    'Sessions and saves',
    'Display and controls'
  ]);
  assert.match(HELP_SECTIONS.find(section => section.title === 'Ending a game').body, /Threefold repetition/);
  assert.match(HELP_SECTIONS.find(section => section.title === 'Engine and hints').body, /completed side turns/);
});

test('help copy passes the player-facing overclaim and punctuation gate', () => {
  const copy = HELP_SECTIONS.flatMap(section => [section.title, section.body, section.citation]).join('\n');
  assert.doesNotMatch(copy, /[\u2014]/u);
  assert.doesNotMatch(copy, /\b(?:official|definitive|complete|authentic|authorized|faithful|stockfish|ai)\b/iu);
});
