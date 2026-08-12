import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Claim, Fact, Statement, CLAIM_TYPES, ROLES } from './fact.js';

test('Claim requires subject/claimType/value and a known type', () => {
  assert.throws(() => new Claim({ claimType: 'location', value: 'x' }), /subject/);
  assert.throws(() => new Claim({ subject: 's', value: 'x' }), /claimType/);
  assert.throws(() => new Claim({ subject: 's', claimType: 'location' }), /value/);
  assert.throws(() => new Claim({ subject: 's', claimType: 'nope', value: 'x' }), /unknown claimType/);
});

test('same coordinate + different value = contradiction', () => {
  const a = new Claim({ subject: 'chef', claimType: 'location', value: 'studio', time: 'Thu-2000' });
  const b = new Claim({ subject: 'chef', claimType: 'location', value: 'restaurant', time: 'Thu-2000' });
  assert.ok(a.contradicts(b));
  assert.ok(b.contradicts(a));
});

test('same coordinate + same value = no contradiction', () => {
  const a = new Claim({ subject: 'chef', claimType: 'location', value: 'studio', time: 'Thu-2000' });
  const b = new Claim({ subject: 'chef', claimType: 'location', value: 'studio', time: 'Thu-2000' });
  assert.ok(!a.contradicts(b));
});

test('different time coordinate = not the same claim, no contradiction', () => {
  const a = new Claim({ subject: 'chef', claimType: 'location', value: 'studio', time: 'Thu-2000' });
  const b = new Claim({ subject: 'chef', claimType: 'location', value: 'restaurant', time: 'Thu-2100' });
  assert.ok(!a.contradicts(b)); // different times, no shared coordinate
});

test('null time/place is unpinned and stays compatible', () => {
  const pinned = new Claim({ subject: 'chef', claimType: 'location', value: 'studio', time: 'Thu-2000' });
  const loose = new Claim({ subject: 'chef', claimType: 'location', value: 'restaurant' });
  assert.ok(pinned.contradicts(loose)); // loose matches the coordinate, different value
});

test('place also participates in the coordinate', () => {
  const a = new Claim({ subject: 'knife', claimType: 'property', value: 'clean', place: 'kitchen' });
  const b = new Claim({ subject: 'knife', claimType: 'property', value: 'bloodied', place: 'study' });
  assert.ok(!a.contradicts(b)); // different places, different coordinates
});

test('Fact carries acquisition paths, role, prologue-key flag', () => {
  const f = new Fact({
    id: 'f-tape-timestamp', subject: 'segment', claimType: 'time', value: 'Wed',
    acquisitionPaths: ['watch-tape', 'ask-producer'], role: 'chain', prologueKeyed: true,
    prose: 'The segment is dated Wednesday.',
  });
  assert.deepEqual(f.acquisitionPaths, ['watch-tape', 'ask-producer']);
  assert.equal(f.role, 'chain');
  assert.ok(f.prologueKeyed);
  assert.ok(!f.isRedHerring());
});

test('Fact rejects unknown role', () => {
  assert.throws(() => new Fact({ id: 'x', subject: 's', claimType: 'time', value: 'v', role: 'maybe' }), /unknown role/);
});

test('red herring fact is tagged and detectable', () => {
  const f = new Fact({ id: 'rh', subject: 'waiter', claimType: 'action', value: 'quit', role: 'red-herring' });
  assert.ok(f.isRedHerring());
});

test('Statement logs verbatim text and a typed claim, refutable by a fact', () => {
  const s = new Statement({
    id: 's1', speaker: 'chef', text: 'I was at the studio all evening.',
    subject: 'chef', claimType: 'location', value: 'studio', time: 'Thu-2000',
  });
  assert.equal(s.text, 'I was at the studio all evening.');
  const fact = new Fact({
    id: 'f1', subject: 'chef', claimType: 'location', value: 'restaurant', time: 'Thu-2000',
    acquisitionPaths: ['doorman', 'parking-log'],
  });
  assert.ok(s.refutedBy(fact));
});

test('Statement requires speaker and text', () => {
  assert.throws(() => new Statement({ id: 's', text: 'x', subject: 'a', claimType: 'time', value: 'v' }), /speaker/);
  assert.throws(() => new Statement({ id: 's', speaker: 'a', subject: 'a', claimType: 'time', value: 'v' }), /text/);
});

test('CLAIM_TYPES and ROLES are stable enums', () => {
  assert.ok(CLAIM_TYPES.includes('location'));
  assert.deepEqual([...ROLES], ['chain', 'red-herring']);
});

test('claim key is stable and distinguishes value', () => {
  const a = new Claim({ subject: 's', claimType: 'time', value: 'Wed' });
  const b = new Claim({ subject: 's', claimType: 'time', value: 'Thu' });
  assert.notEqual(a.key(), b.key());
});
