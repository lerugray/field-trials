// The hangar voices — Cuckoo / Leon / Kirby between-runs prose. Structural + register
// guards only (the operator's voice pass is the real gate, DIRECTIONS-M6): no
// em-dashes (hard rule 14), never empty, never a cruelty token aimed at the cast.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cuckooHangar, leonHangar, kirbyGreeting, kirbyReact, allHubText,
} from '../src/run/hubvoice.js';

test('no hangar line ever contains an em-dash (hard rule 14), and none is empty', () => {
  for (const line of allHubText()) {
    assert.ok(!line.includes('—'), 'em-dash in: ' + line);
    assert.ok(!line.includes('--'), 'double-hyphen dash in: ' + line);
    assert.ok(line.trim().length > 0, 'empty hangar line');
  }
});

test('Cuckoo greets differently for a first visit, a victory, and a ship-down', () => {
  const first = cuckooHangar({ lifetimeRuns: 0, lastRun: null }).line;
  const won = cuckooHangar({ lifetimeRuns: 3, lastRun: { victory: true } }).line;
  const down = cuckooHangar({ lifetimeRuns: 3, lastRun: { died: true } }).line;
  assert.equal(cuckooHangar({}).speaker, 'Commander Cuckoo');
  assert.notEqual(first, won);
  assert.notEqual(won, down);
  assert.ok(first && won && down);
});

test('a ship-down is met with warmth, never a jab (memorial cast is never cruel)', () => {
  const down = cuckooHangar({ lifetimeRuns: 2, lastRun: { died: true } }).line.toLowerCase();
  const banned = ['stupid', 'idiot', 'useless', 'pathetic', 'loser', 'worthless', 'fault', 'blame'];
  for (const b of banned) assert.ok(!down.includes(b), 'cruel token in ship-down line: ' + b);
});

test('Leon has a deterministic, non-empty quip keyed to lifetime runs', () => {
  const a = leonHangar({ lifetimeRuns: 0 });
  const b = leonHangar({ lifetimeRuns: 0 });
  assert.equal(a.line, b.line, 'Leon quip must be deterministic for the same state');
  assert.equal(a.speaker, 'Leon');
  assert.ok(a.line.length > 0);
  // it does vary across states
  const many = new Set([0, 1, 2, 3].map((n) => leonHangar({ lifetimeRuns: n }).line));
  assert.ok(many.size > 1, 'Leon should have more than one quip');
});

test('Kirby has a greeting and a keyed reaction for every purchase outcome', () => {
  assert.equal(kirbyGreeting().speaker, 'Kirby');
  for (const kind of ['boughtUpgrade', 'boughtContract', 'poor', 'maxed', 'locked']) {
    const r = kirbyReact(kind);
    assert.equal(r.speaker, 'Kirby');
    assert.ok(r.line.length > 0, 'empty Kirby reaction for ' + kind);
  }
  // an unknown kind falls back, never crashes
  assert.ok(kirbyReact('???').line.length > 0);
});

test('none of the cast is ever named as a punchline target', () => {
  const banned = ['stupid', 'idiot', 'useless', 'pathetic', 'loser', 'worthless'];
  for (const line of allHubText()) {
    const low = line.toLowerCase();
    for (const b of banned) assert.ok(!low.includes(b), 'cruel token "' + b + '" in: ' + line);
  }
});
