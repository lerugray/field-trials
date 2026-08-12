import test from 'node:test';
import assert from 'node:assert/strict';
import { createDungeonKit, assembleDungeon } from '../src/engine/dungeon.js';
import { createBestiary } from '../src/engine/bestiary.js';
import { createDungeonLife } from '../src/engine/dungeonlife.js';
import { createCharacter } from '../src/engine/character.js';
import kit from '../data/dungeon/kit.json' with { type: 'json' };
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };

const dk = createDungeonKit(kit);
const bestiary = createBestiary(beingsData);
const makeDungeon = (seed = 123, cells = 5) => assembleDungeon(dk, { seed, cells });

function makeLife(seed = 123, opts = {}) {
  const d = makeDungeon(seed);
  return { d, life: createDungeonLife(d, { bestiary, seed: seed ^ 0x11fe, max: 3, ...opts }) };
}

test('places up to max enemies, none in the entrance cell, all on dungeon-habitat non-sacred beings', () => {
  const { d, life } = makeLife();
  const list = life.list();
  assert.ok(list.length > 0 && list.length <= 3, `placed ${list.length}`);
  const entrance = d.cellAt(d.start.x, d.start.y);
  for (const e of list) {
    assert.ok(!(e.cx === entrance.cx && e.cy === entrance.cy), 'not in the entrance cell');
    const b = bestiary.get(e.beingId);
    assert.ok((b.habitat || []).includes('dungeon'), 'dungeon habitat');
    assert.ok(!b.sacred, 'never a sacred being');
  }
});

test('deterministic placement: same seed → identical enemies', () => {
  const a = makeLife(77).life, b = makeLife(77).life;
  assert.deepEqual(a.list(), b.list());
});

test('atTile finds the live enemy in a cell and returns null elsewhere', () => {
  const { life } = makeLife();
  const e = life.list()[0];
  assert.ok(life.atTile(e.tile.x, e.tile.y), 'enemy detected at its cell tile');
  assert.equal(life.at(e.cx, e.cy).beingId, e.beingId);
});

test('sneak probability rises with NERVE and success marks the enemy bypassed', () => {
  // Monte-Carlo over many enemy cells: an UNCANNY-nerve PC slips past far more
  // often than a SHAKY one (same stat system, no new dial).
  function rate(nerve) {
    let ok = 0, tot = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { life } = makeLife(1000 + seed);
      const pc = createCharacter({ nerve, craft: 'STEADY', pull: 'STEADY', gnosis: 'STEADY' });
      for (const e0 of life.liveList()) {
        const e = life.at(e0.cx, e0.cy);
        const r = life.sneak(e, pc, seed * 31 + 7);
        tot++; if (r.success) ok++;
      }
    }
    return ok / tot;
  }
  const shaky = rate('SHAKY'), uncanny = rate('UNCANNY');
  assert.ok(uncanny > shaky + 0.2, `uncanny ${uncanny.toFixed(2)} >> shaky ${shaky.toFixed(2)}`);
});

test('a successful sneak makes the enemy no longer block (bypassed, not clearable-as-live)', () => {
  const { life } = makeLife();
  const e = life.at(life.list()[0].cx, life.list()[0].cy);
  // UNCANNY nerve → high p; retry attempts vary the roll until it passes.
  const pc = createCharacter({ nerve: 'UNCANNY', craft: 'STEADY', pull: 'STEADY', gnosis: 'STEADY' });
  let passed = false;
  for (let i = 0; i < 20 && !passed; i++) passed = life.sneak(life.at(e.cx, e.cy) || e, pc, i).success;
  assert.ok(passed, 'eventually slips past');
  assert.equal(life.at(e.cx, e.cy), null, 'bypassed enemy no longer blocks the cell');
});

test('encounterFor builds a single-foe non-unfair dungeon fight', () => {
  const { life } = makeLife();
  const enc = life.encounterFor(life.list()[0]);
  assert.equal(enc.kind, 'fight');
  assert.equal(enc.unfair, false);
  assert.equal(enc.foes.length, 1);
});

test('clear() removes an enemy from the live set (won on confrontation)', () => {
  const { life } = makeLife();
  const before = life.count;
  const e = life.at(life.list()[0].cx, life.list()[0].cy);
  life.clear(e);
  assert.equal(life.count, before - 1);
  assert.equal(life.at(e.cx, e.cy), null);
});

test('serialize/restore round-trips the enemy states (save/load)', () => {
  const { life } = makeLife();
  const pc = createCharacter({ nerve: 'UNCANNY', craft: 'STEADY', pull: 'STEADY', gnosis: 'STEADY' });
  life.sneak(life.at(life.list()[0].cx, life.list()[0].cy), pc, 3);
  const snap = JSON.parse(JSON.stringify(life.serialize()));
  const { life: life2 } = makeLife();
  life2.restore(snap);
  assert.deepEqual(life2.list(), life.list());
});
