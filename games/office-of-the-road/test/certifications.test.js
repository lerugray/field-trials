// certifications.test.js — THE CERTIFICATION WALL + ESCALATION (DESIGN-SEED M5).
// The wall unlocks on total mastery; starting bonuses aggregate the earned certs;
// escalation deepens with the record. A fresh ledger unlocks nothing and
// escalates to ×1 (the baseline identity).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/tuning.js';
import { createMeta } from '../src/meta.js';
import {
  CERTIFICATIONS, totalMastery, certificationState, earnedCertifications,
  newlyEarned, startingBonuses, escalationLevel, escalationMult,
} from '../src/certifications.js';
import { makeEnemies } from '../src/combat.js';
import { makeStreams } from '../src/rng.js';

test('a fresh ledger clears nothing, grants nothing, escalates to ×1', () => {
  const meta = createMeta();
  assert.equal(totalMastery(meta), 0);
  assert.deepEqual(earnedCertifications(meta), []);
  assert.deepEqual(startingBonuses(meta), { gold: 0, supplies: 0, deck: [] });
  assert.equal(escalationLevel(meta), 0);
  assert.equal(escalationMult(meta), 1);
});

test('escalation ×1 leaves enemy generation byte-identical to the baseline', () => {
  const meta = createMeta();
  const a = makeEnemies('elite', makeStreams(42).combat); // no escMult
  const b = makeEnemies('elite', makeStreams(42).combat, escalationMult(meta)); // ×1
  assert.deepEqual(a, b, 'escalation 0 → identical enemies');
});

test('certifications unlock as total mastery crosses their thresholds', () => {
  const meta = createMeta();
  meta.mastery.bailiff = CERTIFICATIONS[0].req; // exactly the first threshold
  assert.ok(earnedCertifications(meta).includes('provisional_credit'));
  assert.equal(certificationState(meta).find((c) => c.id === 'provisional_credit').earned, true);
  assert.equal(certificationState(meta).find((c) => c.id === 'seasoned_file').earned, false);
});

test('startingBonuses aggregate every earned cert (gold, supplies, deck slots)', () => {
  const meta = createMeta();
  meta.mastery.bailiff = 1000; // clears the whole wall
  const b = startingBonuses(meta);
  const expectGold = CERTIFICATIONS.reduce((s, c) => s + ((c.start && c.start.gold) || 0), 0);
  assert.equal(b.gold, expectGold);
  assert.ok(b.deck.includes('the_sun'), 'the deck-slot cert adds its card');
  assert.ok(b.supplies > 0);
});

test('newlyEarned reports exactly the certs crossed by banking a run', () => {
  const before = 0, after = CERTIFICATIONS[1].req; // crosses cert 0 and 1
  const fresh = newlyEarned(before, after).map((c) => c.id);
  assert.deepEqual(fresh, ['provisional_credit', 'expanded_file']);
  assert.deepEqual(newlyEarned(after, after), [], 'no new clearance without crossing');
});

test('escalation level rises with the deepest leg on record, capped', () => {
  const meta = createMeta();
  meta.deepestLeg = TUNING.escalationEveryLegs * 2; // exactly level 2
  assert.equal(escalationLevel(meta), 2);
  assert.ok(Math.abs(escalationMult(meta) - (1 + 2 * TUNING.escalationStep)) < 1e-9);
  meta.deepestLeg = 9999;
  assert.equal(escalationLevel(meta), TUNING.escalationCap, 'escalation caps');
});

test('escalation actually strengthens enemies above ×1', () => {
  const weak = makeEnemies('routine', makeStreams(7).combat, 1);
  const strong = makeEnemies('routine', makeStreams(7).combat, 1 + 3 * TUNING.escalationStep);
  assert.ok(strong[0].max.hp > weak[0].max.hp, 'escalated enemies are tougher');
});
