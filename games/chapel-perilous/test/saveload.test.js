import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/engine/session.js';
import { createChargen } from '../src/engine/chargen.js';
import { createBestiary } from '../src/engine/bestiary.js';
import { STATS } from '../src/engine/character.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };

const chargen = createChargen(chargenData);
const bestiary = createBestiary(beingsData);

test('session serialize/restore reproduces the run exactly', () => {
  const s = createSession({ chargen, seed: 77 });
  // build up some state
  s.pc.hp = 5;
  s.roster.recruit(bestiary.get('cave-rat'));
  s.roster.recruit(bestiary.get('gutter-clerk'));
  s.clearSite('site-a');
  s.joinLodge('lodge-3');
  const before = s.serialize();

  // restore into a FRESH session and compare snapshots
  const s2 = createSession({ chargen, seed: 999 });
  s2.restore(before);
  assert.deepEqual(s2.serialize(), before);
  // spot-check live state
  assert.equal(s2.pc.hp, 5);
  assert.equal(s2.roster.size, 3);
  assert.deepEqual(STATS.map((k) => s2.pc.rank(k)), STATS.map((k) => s.pc.rank(k)));
  assert.equal(s2.isMember('lodge-3'), true);
  assert.deepEqual(s2.clearedSites().sort(), ['site-a']);
});

test('restored followers are combat-ready and the hidden FNORD survives', () => {
  const s = createSession({ chargen, seed: 12 });
  s.roster.recruit(bestiary.get('brass-automaton'));
  const snap = s.serialize();
  const s2 = createSession({ chargen, seed: 3 });
  s2.restore(snap);
  const combatants = s2.roster.toCombatants();
  assert.equal(combatants.length, 2);
  assert.ok(combatants[1].weapon && Array.isArray(combatants[1].weapon.dmg));
  assert.equal(s2.pc._fnord, s.pc._fnord, 'hidden FNORD round-trips');
});

test('restore rejects a malformed snapshot', () => {
  const s = createSession({ chargen, seed: 1 });
  assert.throws(() => s.restore(null));
  assert.throws(() => s.restore({}));
});

test('a snapshot survives a JSON round-trip (it is plain data)', () => {
  const s = createSession({ chargen, seed: 5 });
  s.roster.recruit(bestiary.get('hollow-pilgrim'));
  const snap = s.serialize();
  const through = JSON.parse(JSON.stringify(snap));
  const s2 = createSession({ chargen, seed: 6 });
  s2.restore(through);
  assert.deepEqual(s2.serialize(), snap);
});
