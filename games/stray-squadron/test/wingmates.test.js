// Wingmates — the procedural, mortal squad (M7). Pure + seeded: the same seed draws
// the same squad; support aggregates only living members; losing one drops coverage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES, TRAITS, ROSTER,
  generateWingmate, generateRoster, rosterSupport, loseWingmate, survivors,
  speciesById, traitById,
} from '../src/run/wingmates.js';
import { makeRng } from '../src/core/rng.js';

test('a drawn roster is deterministic for a seed', () => {
  const a = generateRoster('seed-x');
  const b = generateRoster('seed-x');
  assert.deepEqual(a, b, 'same seed must draw the same squad');
});

test('different seeds draw different squads (not a constant)', () => {
  const names = new Set();
  for (let i = 0; i < 20; i++) names.add(generateRoster('s' + i).map((w) => w.name).join('|'));
  assert.ok(names.size > 10, 'squad draws should vary across seeds');
});

test('the base roster is the free squad size, present with no contracts', () => {
  const r = generateRoster('any');
  assert.equal(r.length, ROSTER.baseSize);
  assert.ok(r.every((w) => !w.contracted), 'free squad is uncontracted');
});

test('contracts add one named veteran slot each, on top of the base squad', () => {
  const r = generateRoster('any', ['Vesper', 'Tuck']);
  assert.equal(r.length, ROSTER.baseSize + 2);
  const vets = r.filter((w) => w.contracted);
  assert.equal(vets.length, 2);
  assert.deepEqual(vets.map((w) => w.given).sort(), ['Tuck', 'Vesper']);
  // a contracted veteran carries its fixed name verbatim (no callsign appended)
  assert.ok(vets.every((w) => w.name === w.given));
});

test('every wingmate has a valid species, trait, voice, and support', () => {
  const r = generateRoster('validity', ['Marlowe']);
  for (const w of r) {
    assert.ok(speciesById(w.species), 'valid species: ' + w.species);
    assert.ok(traitById(w.trait), 'valid trait: ' + w.trait);
    assert.equal(typeof w.name, 'string');
    assert.ok(w.name.length > 0);
    assert.ok(w.voice && w.voice.pitch > 0, 'voice pitch present');
    assert.ok('salvageMul' in w.support && 'killScore' in w.support);
    assert.equal(w.alive, true);
    assert.equal(w.lostAt, null);
  }
});

test('given names are distinct within a squad (no two of the same)', () => {
  for (let i = 0; i < 40; i++) {
    const r = generateRoster('distinct-' + i, ['Vesper', 'Tuck', 'Marlowe']);
    const given = r.map((w) => w.given);
    assert.equal(new Set(given).size, given.length, 'duplicate given name in squad ' + i);
  }
});

test('rosterSupport sums only living members', () => {
  const r = generateRoster('support-seed', ['Vesper']);
  const full = rosterSupport(r);
  assert.equal(full.aliveCount, r.length);
  assert.equal(full.size, r.length);
  // the aggregate is the sum of each living member's channels
  const expectSalv = r.reduce((a, w) => a + w.support.salvageMul, 0);
  const expectKill = r.reduce((a, w) => a + w.support.killScore, 0);
  assert.ok(Math.abs(full.salvageMul - expectSalv) < 1e-9);
  assert.equal(full.killScore, expectKill);
});

test('losing a wingmate drops their coverage for the run remainder', () => {
  const r = generateRoster('loss-seed', ['Vesper']);
  const before = rosterSupport(r);
  const victim = r[0];
  const lost = loseWingmate(r, victim.id, '2-1');
  assert.equal(lost.id, victim.id);
  assert.equal(lost.alive, false);
  assert.equal(lost.lostAt, '2-1');
  const after = rosterSupport(r);
  assert.equal(after.aliveCount, before.aliveCount - 1);
  assert.equal(after.size, before.size, 'a lost wingmate still shows on the roster');
  assert.ok(after.salvageMul <= before.salvageMul);
  assert.ok(after.killScore <= before.killScore);
  // support drops by exactly the victim's contribution
  assert.ok(Math.abs((before.salvageMul - after.salvageMul) - victim.support.salvageMul) < 1e-9);
  assert.equal(before.killScore - after.killScore, victim.support.killScore);
});

test('loseWingmate is idempotent and safe on an unknown id', () => {
  const r = generateRoster('idem');
  const w = loseWingmate(r, r[0].id, 'n');
  const again = loseWingmate(r, r[0].id, 'other');
  assert.equal(again.alive, false);
  assert.equal(again.lostAt, 'n', 'first loss node is kept, not overwritten');
  assert.equal(loseWingmate(r, 999), null, 'unknown id returns null, no throw');
  assert.equal(survivors(r).length, r.length - 1);
});

test('generateWingmate honors a fixed veteran name and flags contracted', () => {
  const rng = makeRng('one');
  const w = generateWingmate(rng, 3, 'Vesper');
  assert.equal(w.given, 'Vesper');
  assert.equal(w.name, 'Vesper');
  assert.equal(w.contracted, true);
  assert.equal(w.callsign, null);
});

test('species and trait tables are non-empty and well-formed', () => {
  assert.ok(SPECIES.length >= 4);
  assert.ok(TRAITS.length >= 4);
  for (const s of SPECIES) assert.ok(s.voicePitch > 0);
  for (const t of TRAITS) {
    assert.ok('salvageMul' in t.support && 'killScore' in t.support);
    assert.ok(t.support.salvageMul >= 0 && t.support.killScore >= 0, 'support is a bonus, never a penalty');
  }
  // clean-room + memorial-cast guard: no wingmate species collides with the cast or
  // the reference hero species.
  const banned = ['dog', 'beagle', 'cat', 'tabby', 'poodle', 'fox'];
  for (const s of SPECIES) assert.ok(!banned.includes(s.id), 'banned species id: ' + s.id);
});
