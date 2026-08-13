// Jobs: valid definitions, distinct verb sets (the M2 distinctness law),
// deterministic stat derivation. Party: attrition, job change, serialization.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, JOB_IDS, DEFAULT_PARTY, getJob, deriveStats, verbSetKey } from '../src/jobs.js';
import { TUNING } from '../src/tuning.js';
import {
  createParty, changeJob, campRest, spendSupplies, applyDamage, applyHeal,
  livingFrames, isWiped, serializeParty, restoreParty,
} from '../src/party.js';

test('roster is 6-8 jobs with the required shape', () => {
  assert.ok(JOB_IDS.length >= 6 && JOB_IDS.length <= 8, 'want 6-8 jobs, got ' + JOB_IDS.length);
  for (const id of JOB_IDS) {
    const j = getJob(id);
    assert.equal(j.id, id);
    assert.ok(j.name && j.blurb && j.battler, id + ' missing name/blurb/battler');
    assert.ok(Array.isArray(j.verbs) && j.verbs.length >= 2, id + ' needs >=2 verbs');
    for (const k of ['hp', 'atk', 'def', 'mag', 'spd']) {
      assert.equal(typeof j.weights[k], 'number', `${id}.weights.${k}`);
    }
  }
});

test('no two jobs share a verb set (distinctness law)', () => {
  const keys = JOB_IDS.map(verbSetKey);
  assert.equal(new Set(keys).size, keys.length, 'two jobs have identical verb sets');
});

test('every verb has a valid kind and target', () => {
  const kinds = new Set(['attack', 'spell', 'heal', 'guard', 'ward']);
  const targets = new Set(['enemy', 'enemies', 'ally', 'allies', 'self']);
  for (const id of JOB_IDS) {
    for (const v of getJob(id).verbs) {
      assert.ok(kinds.has(v.kind), `${id}.${v.id} bad kind ${v.kind}`);
      assert.ok(targets.has(v.target), `${id}.${v.id} bad target ${v.target}`);
      assert.ok(v.power > 0, `${id}.${v.id} power`);
    }
  }
});

test('stat derivation is deterministic and reflects weights', () => {
  const a = deriveStats('bailiff');
  const b = deriveStats('bailiff');
  assert.deepEqual(a, b);
  // Sumpter (wall) has more HP+DEF than Surveyor (ranged); Surveyor more SPD.
  const wall = deriveStats('sumpter');
  const ranged = deriveStats('surveyor');
  assert.ok(wall.hp > ranged.hp && wall.def > ranged.def);
  assert.ok(ranged.spd > wall.spd);
});

test('enemy multiplier scales the whole block', () => {
  const base = deriveStats('bailiff', 1);
  const big = deriveStats('bailiff', 2);
  assert.ok(big.hp > base.hp && big.atk > base.atk);
});

test('party is the tuned size at full HP and supplies', () => {
  const p = createParty();
  assert.equal(p.frames.length, TUNING.partySize);
  assert.equal(p.supplies, TUNING.startSupplies);
  for (const f of p.frames) assert.equal(f.hp, f.max.hp);
  assert.deepEqual(p.frames.map((f) => f.jobId), DEFAULT_PARTY);
});

test('damage kills at zero and heal never revives or overfills', () => {
  const p = createParty();
  const f = p.frames[0];
  applyDamage(f, f.max.hp + 10);
  assert.equal(f.hp, 0);
  assert.equal(f.alive, false);
  assert.equal(applyHeal(f, 20), 0, 'heal must not revive the dead');
  const g = p.frames[1];
  applyDamage(g, 5);
  assert.equal(applyHeal(g, 999), 5, 'heal caps at max');
  assert.equal(g.hp, g.max.hp);
});

test('changeJob recomputes stats and carries HP proportionally', () => {
  const p = createParty();
  const f = p.frames[0];
  applyDamage(f, Math.round(f.max.hp / 2)); // ~50% hp
  changeJob(p, 0, 'notary');
  assert.equal(f.jobId, 'notary');
  assert.deepEqual(f.max, deriveStats('notary'));
  const frac = f.hp / f.max.hp;
  assert.ok(frac > 0.4 && frac < 0.6, 'hp proportion should carry ~50%');
});

test('camp rest heals missing HP at a supply cost, and refuses when broke', () => {
  const p = createParty();
  applyDamage(p.frames[0], 20);
  const before = p.frames[0].hp;
  const r = campRest(p);
  assert.ok(r.rested && r.cost === TUNING.campRecoverSupplyCost);
  assert.ok(p.frames[0].hp > before);
  p.supplies = 0;
  assert.equal(campRest(p).rested, false);
});

test('wipe detection', () => {
  const p = createParty();
  assert.equal(isWiped(p), false);
  for (const f of p.frames) applyDamage(f, 9999);
  assert.equal(livingFrames(p).length, 0);
  assert.equal(isWiped(p), true);
});

test('party serialize/restore round-trips', () => {
  const p = createParty(['bailiff', 'notary', 'almoner', 'sumpter']);
  applyDamage(p.frames[1], 7);
  spendSupplies(p, 5);
  const back = restoreParty(JSON.parse(JSON.stringify(serializeParty(p))));
  assert.equal(back.supplies, p.supplies);
  assert.deepEqual(back.frames.map((f) => [f.jobId, f.hp, f.alive]),
    p.frames.map((f) => [f.jobId, f.hp, f.alive]));
});
