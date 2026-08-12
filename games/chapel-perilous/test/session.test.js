import test from 'node:test';
import assert from 'node:assert/strict';
import { createChargen } from '../src/engine/chargen.js';
import { createSession } from '../src/engine/session.js';
import { createBestiary } from '../src/engine/bestiary.js';
import { createEncounters } from '../src/engine/encounters.js';
import { RANKS, STATS } from '../src/engine/character.js';
import { mulberry32 } from '../src/engine/prng.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };
import tablesData from '../data/encounters/tables.json' with { type: 'json' };

const chargen = createChargen(chargenData);
const bestiary = createBestiary(beingsData);
const encounters = createEncounters(tablesData, bestiary);

test('chargen deals a complete stranger: word-rank stats + omen + oddment weapon', () => {
  const c = chargen.rollSeeded(1);
  for (const s of STATS) assert.ok(RANKS.includes(c.rank(s)));
  assert.ok(c.omen && c.omen.startsWith('[SEED]'));
  assert.ok(c.oddment, 'a starting oddment');
  assert.ok(Array.isArray(c.weapon.dmg), 'the oddment is the weapon (power from items)');
  assert.ok(c.hp > 0);
});

test('rerolls are unlimited and deal different strangers (identity-shopping)', () => {
  // Across many seeds, statlines and oddments vary — no single canonical roll.
  const sigs = new Set();
  for (let s = 1; s <= 40; s++) {
    const c = chargen.rollSeeded(s);
    sigs.add(STATS.map((k) => c.rank(k)).join('/') + '|' + c.weapon.name);
  }
  assert.ok(sigs.size > 20, `expected varied strangers, got ${sigs.size} distinct`);
});

test('chargen is deterministic in the seed', () => {
  const a = chargen.rollSeeded(7);
  const b = chargen.rollSeeded(7);
  assert.deepEqual(a.stats(), b.stats());
  assert.equal(a.weapon.name, b.weapon.name);
  assert.equal(a.omen, b.omen);
});

test('session deals a first stranger with a roster', () => {
  const s = createSession({ chargen, seed: 123 });
  assert.ok(s.pc, 'a pc is dealt');
  assert.equal(s.roster.size, 1); // just the pc
  assert.equal(s.deaths, 0);
});

test('exposure accrues with hidden FNORD modulation, saves, and clears at safe rest', () => {
  const s = createSession({ chargen, seed: 123 });
  assert.equal(s.exposure, 0);
  s.accrueExposure(0.25);
  assert.ok(s.exposure >= 0.2125 && s.exposure <= 0.325, `FNORD-modulated exposure ${s.exposure}`);
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  const restored = createSession({ chargen, seed: 9 });
  restored.restore(snap);
  assert.equal(restored.exposure, s.exposure);
  const rest = restored.rest('inn');
  assert.equal(rest.ok, true);
  assert.equal(rest.exposureBefore, s.exposure);
  assert.equal(rest.exposureAfter, 0);
  assert.equal(restored.exposure, 0);
});

test('rest (playtest2): wild camp is refused; inn/shrine are safe full heals; world persists', () => {
  const s = createSession({ chargen, seed: 9 });
  s.pc.hp = 1;
  // The open field refuses to rest; recovery is consumable-only outside safe locations.
  const camp = s.rest('camp');
  assert.equal(camp.ok, false);
  assert.equal(camp.reason, 'not-safe');
  assert.equal(s.pc.hp, 1, 'wild rest heals nothing');
  // An inn rest, while the world holds no cleared dungeon, is a FREE full heal.
  s.pc.hp = 1;
  const inn = s.rest('inn');
  assert.equal(inn.ok, true);
  assert.equal(inn.free, true, 'inn is free before any dungeon is cleared');
  assert.equal(s.pc.hp, s.pc.maxHp, 'inn recovers the whole party');
  // Shrine is also a safe rest.
  s.pc.hp = 1;
  const shrine = s.rest('shrine');
  assert.equal(shrine.ok, true);
  assert.equal(s.pc.hp, s.pc.maxHp, 'shrine recovers the whole party');
  // Clearing a dungeon persists in world state even if you try to rest wild.
  s.pc.hp = 1;
  s.clearSite('chapel-0');
  s.rest('camp');
  assert.equal(s.isCleared('chapel-0'), true, 'cleared sites survive a refused rest');
});

test('cleared sites and history persist across a permadeath, but the PC is new', () => {
  const s = createSession({ chargen, seed: 55 });
  const firstName = s.pc.name;
  const firstPc = s.pc;
  s.clearSite('site-a');
  s.clearSite('site-b');
  s.die('the tail');
  assert.equal(s.deaths, 1);
  assert.notEqual(s.pc, firstPc, 'a fresh stranger takes over');
  // world persists
  assert.deepEqual(s.clearedSites().sort(), ['site-a', 'site-b']);
  assert.ok(s.history.some((h) => h.event === 'death'));
  assert.ok(s.history.some((h) => h.event === 'cleared'));
});

test('a permadeath drops the orphaned roster (followers hook banked)', () => {
  const s = createSession({ chargen, seed: 3 });
  // hand-recruit a follower onto the roster
  s.roster.recruit(bestiary.get('cave-rat'));
  assert.equal(s.roster.size, 2);
  s.die();
  assert.equal(s.roster.size, 1, 'the new stranger starts alone');
});

test('startCombat + resolveCombat: a lost fight kills the PC and rolls a new one', () => {
  const s = createSession({ chargen, seed: 4 });
  // Force a hopeless fight: weak pc vs the lethal tail.
  s.pc.hp = 1;
  const firstPc = s.pc;
  const enc = { kind: 'fight', foes: [bestiary.toCombatantSpec('thing-in-the-23rd-corridor')] };
  const combat = s.startCombat(enc, 1);
  let guard = 0;
  while (!combat.over && guard++ < 1000) {
    const a = combat.active();
    if (a && a.side === 'party') combat.take({ type: 'fight', target: combat.living('foe')[0].id });
    else combat.take();
  }
  assert.equal(combat.outcome, 'lose');
  const summary = s.resolveCombat(combat);
  assert.equal(summary.pcDied, true);
  assert.equal(s.deaths, 1);
  assert.notEqual(s.pc, firstPc);
});

test('startCombat + resolveCombat: a won fight syncs surviving hp and keeps the world', () => {
  const s = createSession({ chargen, seed: 8 });
  // Give the pc a reliable edge so the win is deterministic enough.
  s.pc.hp = 40;
  s.pc.weapon = { name: 'test-blade', dmg: [20, 20] };
  const enc = { kind: 'fight', foes: [bestiary.toCombatantSpec('cave-rat')] };
  const combat = s.startCombat(enc, 2);
  let guard = 0;
  while (!combat.over && guard++ < 1000) {
    const a = combat.active();
    if (a && a.side === 'party') combat.take({ type: 'fight', target: combat.living('foe')[0].id });
    else combat.take();
  }
  const summary = s.resolveCombat(combat);
  assert.equal(summary.outcome, 'win');
  assert.equal(s.deaths, 0);
  assert.ok(s.pc.hp <= 40 && s.pc.hp > 0, 'surviving hp is written back');
});

test('startCombat rejects a non-fight encounter', () => {
  const s = createSession({ chargen, seed: 1 });
  assert.throws(() => s.startCombat({ kind: 'cache', artifact: 'x' }, 1));
});
