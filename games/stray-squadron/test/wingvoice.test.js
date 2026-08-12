// Wingmate barks (M7) — procedural callout text. Structural + register guards: no
// em-dashes (hard rule 14), never empty, never cruel, deterministic per wingmate, and
// a line for every callout kind. A downed wingmate is warm, never gory or mocked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wingLine, allWingText, CALLOUT_KINDS } from '../src/run/wingvoice.js';
import { generateRoster } from '../src/run/wingmates.js';

test('no wingmate line ever contains an em-dash, and none is empty', () => {
  for (const line of allWingText()) {
    assert.ok(!line.includes('—'), 'em-dash in: ' + line);
    assert.ok(!line.includes('--'), 'double-hyphen dash in: ' + line);
    assert.ok(line.trim().length > 0, 'empty wingmate line');
  }
});

test('every callout kind yields a non-empty line for any wingmate', () => {
  const w = generateRoster('voice')[0];
  for (const kind of CALLOUT_KINDS) {
    const r = wingLine(w, kind);
    assert.equal(r.kind, kind);
    assert.ok(r.line.length > 0, 'empty line for ' + kind);
    assert.equal(r.speaker, w.name);
  }
});

test('a wingmate says its own consistent variant (deterministic)', () => {
  const w = generateRoster('voice')[0];
  assert.equal(wingLine(w, 'spot').line, wingLine(w, 'spot').line);
});

test('different wingmates can voice different variants', () => {
  const r = generateRoster('variety', ['Vesper', 'Tuck', 'Marlowe']);
  const spots = new Set(r.map((w) => wingLine(w, 'spot').line));
  assert.ok(spots.size > 1, 'squad should not all say the identical spot line');
});

test('a downed wingmate is brave and warm, never gory or a punchline', () => {
  const banned = ['dead', 'die', 'died', 'corpse', 'blood', 'kill', 'stupid', 'idiot',
    'useless', 'pathetic', 'loser', 'worthless', 'fault', 'blame'];
  for (const kind of ['distress', 'lost', 'rescued']) {
    for (const w of generateRoster('grim', ['Vesper'])) {
      const low = wingLine(w, kind).line.toLowerCase();
      for (const b of banned) assert.ok(!low.includes(b), 'grim/cruel token "' + b + '" in ' + kind + ': ' + low);
    }
  }
});

test('no wingmate line names any cruelty token', () => {
  const banned = ['stupid', 'idiot', 'useless', 'pathetic', 'loser', 'worthless'];
  for (const line of allWingText()) {
    const low = line.toLowerCase();
    for (const b of banned) assert.ok(!low.includes(b), 'cruel token "' + b + '" in: ' + line);
  }
});
