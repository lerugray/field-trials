// M12 C3 — the lineage / death-log. On death a permanent WORLD entry is banked:
// name, days survived, killer, deeds (gates opened / sites cleared / followers lost
// during that life). It survives permadeath and save/load (world-remembers), and the
// death screen shows the roll.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/engine/session.js';
import { createChargen } from '../src/engine/chargen.js';
import { buildDeathDrawList } from '../src/engine/panels.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };

const chargen = createChargen(chargenData);

test('a death banks a lineage entry with this life\'s deeds and days survived', () => {
  const s = createSession({ chargen, seed: 3 });
  const first = s.pc.name;
  s.clearSite('dungeon-a');       // a deed of this life
  s.clearSite('dungeon-b');
  s.noteGateOpened();             // a gate opened this life
  s.die('a five-eyed auditor', 40); // died at tick 40 (born at 0)

  const roll = s.lineage();
  assert.equal(roll.length, 1);
  const e = roll[0];
  assert.equal(e.name, first);
  assert.equal(e.days, 40);
  assert.equal(e.killer, 'a five-eyed auditor');
  assert.deepEqual(e.deeds, { clears: 2, followersLost: 0, gatesOpened: 1 });

  // the NEW stranger starts a fresh life — no inherited deeds
  assert.deepEqual(s.life(), { clears: 0, followersLost: 0, gatesOpened: 0 });
});

test('the lineage is world state: it grows across deaths and never resets', () => {
  const s = createSession({ chargen, seed: 8 });
  s.die('the tail', 10);
  s.clearSite('x');
  s.die('a hollow pilgrim', 25);
  const roll = s.lineage();
  assert.equal(roll.length, 2);
  assert.equal(roll[1].days, 15, 'the second stranger was born at tick 10, died at 25');
  assert.equal(roll[1].deeds.clears, 1);
});

test('lineage round-trips through serialize/restore', () => {
  const s = createSession({ chargen, seed: 5 });
  s.clearSite('a'); s.die('something', 12);
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  const s2 = createSession({ chargen, seed: 5 });
  s2.restore(snap);
  assert.deepEqual(s2.lineage(), s.lineage());
  // a life in progress restores its deed counters too
  assert.deepEqual(s2.life(), s.life());
});

test('the death screen shows the lineage roll', () => {
  const lineage = [
    { name: '[SEED] Anselm', days: 12, killer: '[SEED] the tail', deeds: { clears: 1, followersLost: 0, gatesOpened: 0 } },
    { name: '[SEED] Bruna', days: 30, killer: '[SEED] a warden', deeds: { clears: 3, followersLost: 1, gatesOpened: 2 } },
  ];
  const rows = buildDeathDrawList({ fallen: '[SEED] Bruna', pc: { name: '[SEED] Cyra' }, lineage }).filter((r) => r.text);
  const text = rows.map((r) => r.text).join('\n');
  assert.ok(/those the world remembers/.test(text), 'the roll is titled');
  assert.ok(/Anselm/.test(text) && /Bruna/.test(text), 'past strangers listed');
  assert.ok(/12d/.test(text) && /30d/.test(text), 'days survived shown');
});
