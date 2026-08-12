import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../src/engine/services.js';
import { createSession } from '../src/engine/session.js';
import { createChargen } from '../src/engine/chargen.js';
import { createCharacter } from '../src/engine/character.js';
import { createProse } from '../src/engine/prose.js';
import cityRegister from '../data/register/city.json' with { type: 'json' };
import chargenData from '../data/register/chargen.json' with { type: 'json' };
import pools from '../data/register/pools.json' with { type: 'json' };

const chargen = createChargen(chargenData);
const prose = createProse(pools);
const services = createServices(cityRegister, { prose });

const building = (service, id = 'b0') => ({ id, service });

test('inn rests the party and reports the rest effect', () => {
  const s = createSession({ chargen, seed: 1 });
  s.pc.hp = 1;
  const r = services.interact(building('inn'), { session: s, seed: 3 });
  assert.equal(r.effect, 'rest');
  assert.equal(s.pc.hp, s.pc.maxHp);
  assert.ok(r.lines.every((l) => l.startsWith('[SEED]')));
});

test('rumor yields a seeded [SEED] line, deterministic per seed', () => {
  const a = services.interact(building('rumor'), { seed: 42 });
  const b = services.interact(building('rumor'), { seed: 42 });
  assert.equal(a.effect, 'rumor');
  assert.deepEqual(a.lines, b.lines);
  assert.ok(a.lines[1].startsWith('[SEED]'));
});

test('lodge admits a STEADY-or-better PULL and records membership', () => {
  const s = createSession({ chargen, seed: 5 });
  // force a capable PC
  s.reroll();
  const cap = createCharacter({ pull: 'STEADY' });
  // swap the session PC by hand for a deterministic statline
  Object.assign(s.pc, { rankIndex: cap.rankIndex, rank: cap.rank });
  const r = services.interact(building('lodge', 'lodge-7'), { session: s, seed: 1 });
  assert.equal(r.effect, 'joined');
  assert.equal(s.isMember('lodge-7'), true);
  // re-entering is idempotent
  const r2 = services.interact(building('lodge', 'lodge-7'), { session: s, seed: 1 });
  assert.equal(r2.effect, 'already-member');
});

test('lodge refuses a SHAKY PULL — pure verb-gating, no roll', () => {
  const s = createSession({ chargen, seed: 9 });
  const weak = createCharacter({ pull: 'SHAKY' });
  Object.assign(s.pc, { rankIndex: weak.rankIndex, rank: weak.rank });
  const r = services.interact(building('lodge', 'lodge-1'), { session: s, seed: 1 });
  assert.equal(r.effect, 'refused');
  assert.equal(s.isMember('lodge-1'), false);
});

test('shop generates seeded stock and a sell offer', () => {
  const s = createSession({ chargen, seed: 2 });
  const r = services.interact(building('shop', 'shop-1'), { session: s, seed: 1, tick: 0, archetype: 'market' });
  assert.equal(r.effect, 'shop');
  assert.ok(r.stock.length >= 3 && r.stock.length <= 6, 'stock size is 3-6');
  assert.ok(r.sellOffer == null || Array.isArray(r.sellOffer), 'sell offer is null or an array');
  assert.ok(r.lines.length >= 2);
  assert.ok(r.lines.every((l) => l.startsWith('[SEED]')));
  // Determinism: same seed/building/epoch/archetype reproduces the same stock.
  const r2 = services.interact(building('shop', 'shop-1'), { session: createSession({ chargen, seed: 2 }), seed: 1, tick: 0, archetype: 'market' });
  assert.deepEqual(r2.stock.map((x) => x.name), r.stock.map((x) => x.name));
  // Different seed -> different stock.
  const r3 = services.interact(building('shop', 'shop-1'), { session: createSession({ chargen, seed: 2 }), seed: 2, tick: 0, archetype: 'market' });
  assert.notDeepEqual(r3.stock.map((x) => x.name), r.stock.map((x) => x.name));
});

test('memberships are the mortal layer: a permadeath clears them', () => {
  const s = createSession({ chargen, seed: 3 });
  const cap = createCharacter({ pull: 'SHARP' });
  Object.assign(s.pc, { rankIndex: cap.rankIndex, rank: cap.rank });
  services.interact(building('lodge', 'lodge-x'), { session: s, seed: 1 });
  assert.equal(s.isMember('lodge-x'), true);
  s.die('test');
  assert.equal(s.isMember('lodge-x'), false, 'a new stranger is uninitiated');
});
