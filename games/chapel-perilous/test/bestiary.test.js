import test from 'node:test';
import assert from 'node:assert/strict';
import { createBestiary, VERBS } from '../src/engine/bestiary.js';
import { createCombat } from '../src/engine/combat.js';
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };

test('the shipped roster loads and covers the content-identity requirements', () => {
  const b = createBestiary(beingsData);
  assert.ok(b.count >= 12, `expected >=12 beings, got ${b.count}`);
  // spans every habitat
  const habitats = new Set(b.all().flatMap((x) => x.habitat));
  for (const h of ['overworld', 'city', 'dungeon']) assert.ok(habitats.has(h), `missing habitat ${h}`);
  // every interaction verb bites at least one being
  const versUsed = new Set(b.all().flatMap((x) => Object.keys(x.interaction)));
  for (const v of VERBS) assert.ok(versUsed.has(v), `no being offers verb ${v}`);
  // most are recruitable, but a sacred few never are
  const sacred = b.all().filter((x) => x.sacred);
  assert.ok(sacred.length >= 1 && sacred.length < b.count, 'expected a small sacred class');
  for (const s of sacred) assert.equal(s.recruitable, false);
  // a fat tail exists
  assert.ok(b.all().some((x) => x.rarity === 'tail'), 'expected at least one tail being');
});

test('a being becomes a valid foe combatant spec', () => {
  const b = createBestiary(beingsData);
  const spec = b.toCombatantSpec('cave-rat');
  assert.equal(spec.side, 'foe');
  assert.ok(spec.hp > 0);
  assert.ok(Array.isArray(spec.weapon.dmg));
  assert.equal(spec.ref.id, 'cave-rat');
  // multiple copies get disambiguated ids/names
  const two = b.toCombatantSpec('cave-rat', 2);
  assert.notEqual(two.id, spec.id);
  // and the spec drops straight into combat
  const c = createCombat({ party: [{ id: 'pc', hp: 10 }], foes: [spec], seed: 1 });
  assert.equal(c.living('foe').length, 1);
});

test('approachesFor intersects the being profile with the actor verbs and honours sacred', () => {
  const b = createBestiary(beingsData);
  // gutter-clerk bites bargain + overawe(hard). An actor with only bargain sees only bargain.
  const only = b.approachesFor('gutter-clerk', ['bargain']);
  assert.deepEqual(only.map((a) => a.verb), ['bargain']);
  // a full-verb actor sees both, in canonical order
  const all = b.approachesFor('gutter-clerk', VERBS).map((a) => a.verb);
  assert.deepEqual(all, ['overawe', 'bargain']);
  // sacred beings refuse everything
  assert.deepEqual(b.approachesFor('thing-in-the-23rd-corridor', VERBS), []);
});

test('validation rejects malformed beings', () => {
  assert.throws(() => createBestiary({ beings: [] }));
  assert.throws(() => createBestiary({ beings: [{ id: 'x', name: 'X', hp: 0, weapon: 1 }] }), /hp/);
  assert.throws(() => createBestiary({ beings: [{ id: 'x', name: 'X', hp: 1, weapon: 1, interaction: { fly: 'open' } }] }), /verb/);
  // sacred + recruitable is contradictory
  assert.throws(() => createBestiary({ beings: [{ id: 'x', name: 'X', hp: 1, weapon: 1, sacred: true, recruitable: true }] }), /sacred/);
  // recruitable with no biting verbs is contradictory
  assert.throws(() => createBestiary({ beings: [{ id: 'x', name: 'X', hp: 1, weapon: 1, recruitable: true, interaction: {} }] }), /interaction/);
  // duplicate ids
  const dup = { beings: [{ id: 'x', name: 'X', hp: 1, weapon: 1 }, { id: 'x', name: 'Y', hp: 1, weapon: 1 }] };
  assert.throws(() => createBestiary(dup), /duplicate/);
});

test('M11: every being carries a valid combat behavior + defense weighting (readable AI)', () => {
  const b = createBestiary(beingsData);
  const BEHAVIORS = ['aggressive', 'cowardly', 'pack', 'caster', 'steady'];
  const FLAVORS = ['dodge', 'avoid', 'absorb'];
  for (const being of b.all()) {
    assert.ok(BEHAVIORS.includes(being.behavior), `${being.id} has a valid behavior (got ${being.behavior})`);
    assert.ok(FLAVORS.includes(being.defense), `${being.id} has a valid defense flavor (got ${being.defense})`);
    assert.equal(typeof being.talkInCombat, 'boolean');
  }
  // the small talk-capable-in-combat class exists but is a minority (two-layer model)
  const talkers = b.all().filter((x) => x.talkInCombat);
  assert.ok(talkers.length >= 1 && talkers.length < b.count / 2, 'talk-capable-in-combat is a minority class');
});
