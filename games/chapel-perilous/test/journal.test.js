import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournal } from '../src/engine/journal.js';
import { createProse } from '../src/engine/prose.js';
import pools from '../data/register/pools.json' with { type: 'json' };

const prose = createProse(pools);
const mk = (seed = 2323) => createJournal({ prose, seed });

test('createJournal requires a prose engine', () => {
  assert.throws(() => createJournal({}), /prose engine/);
});

test('write / edit / remove manage raw player entries', () => {
  const j = mk();
  const a = j.write({ text: 'the clerk would not meet my eyes', where: 'the lodge', when: 3 });
  const b = j.write({ text: 'a door where no door was', where: 'the crawl', when: 5 });
  assert.equal(j.count(), 2);
  assert.equal(a.id, 1);
  assert.equal(b.origin, 'player');
  j.edit(a.id, 'the clerk smiled too widely');
  assert.equal(j.raw().find((e) => e.id === a.id).text, 'the clerk smiled too widely');
  assert.ok(j.remove(a.id));
  assert.equal(j.count(), 1);
  assert.throws(() => j.write({ text: '   ' }), /text required/);
});

test('no exposure ⇒ notes are the author\'s own, verbatim and unmarked', () => {
  const j = mk();
  j.write({ text: 'I trust the paper more than the people', where: 'the inn', when: 1 });
  const v = j.view({ exposure: 0 });
  const mine = v.filter((e) => e.origin === 'player');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].text, 'I trust the paper more than the people');
  assert.equal(mine[0].corruption, 0);
  assert.ok(!mine[0].text.includes('[SEED]'), 'uncorrupted player text carries no seed tag');
});

test('exposure + age corrupt the text, and corrupted entries are [SEED]-marked', () => {
  const j = mk();
  j.write({ text: 'the surveyor counted the windows twice and wrote nothing down', where: 'the town', when: 0 });
  const v = j.view({ exposure: 0.9, now: 6 });
  const mine = v.find((e) => e.origin === 'player');
  assert.ok(mine.corruption > 0, 'high exposure + age raises corruption');
  assert.ok(mine.text.startsWith('[SEED] '), 'corrupted text is gated');
  assert.notEqual(mine.text.replace('[SEED] ', ''), 'the surveyor counted the windows twice and wrote nothing down');
});

test('corruption is deterministic: same seed + inputs replay identically', () => {
  const one = mk(777);
  const two = mk(777);
  const txt = 'a phrase I will remember exactly as I wrote it';
  one.write({ text: txt, where: 'x', when: 0 });
  two.write({ text: txt, where: 'x', when: 0 });
  const a = one.view({ exposure: 0.7, now: 4 });
  const b = two.view({ exposure: 0.7, now: 4 });
  assert.deepEqual(a, b);
});

test('corruption intensity rises with both age and exposure', () => {
  const j = mk();
  assert.ok(j.intensityFor(0, 0) === 0);
  assert.ok(j.intensityFor(5, 0.8) > j.intensityFor(1, 0.8), 'older ⇒ more corrupt');
  assert.ok(j.intensityFor(3, 0.9) > j.intensityFor(3, 0.2), 'more exposed ⇒ more corrupt');
});

test('ghost entries appear only with exposure, are marked, and are deterministic', () => {
  const j = mk(9001);
  j.write({ text: 'my own line', where: 'here', when: 2 });
  assert.equal(j.view({ exposure: 0 }).filter((e) => e.origin === 'ghost').length, 0, 'none without exposure');
  const twin = mk(9001);
  twin.write({ text: 'my own line', where: 'here', when: 2 });
  const g1 = j.ghosts(0.8);
  const g2 = twin.ghosts(0.8);
  assert.ok(g1.length >= 1, 'exposure summons ghosts');
  assert.deepEqual(g1, g2, 'ghosts replay identically for the same seed + state');
  for (const g of g1) {
    assert.equal(g.origin, 'ghost');
    assert.ok(g.text.includes('[SEED]'), 'ghost prose is gated');
  }
});

test('view interleaves ghosts among player entries by when', () => {
  const j = mk(4242);
  j.write({ text: 'first', where: 'a', when: 1 });
  j.write({ text: 'second', where: 'b', when: 9 });
  const v = j.view({ exposure: 0.9, now: 12 });
  const whens = v.map((e) => e.when);
  const sorted = [...whens].sort((a, b) => a - b);
  assert.deepEqual(whens, sorted, 'entries render in when-order');
  assert.ok(v.some((e) => e.origin === 'ghost'), 'ghosts are present in the merged view');
});

test('serialize/restore round-trips the raw entries exactly (corruption recomputes)', () => {
  const j = mk(555);
  j.write({ text: 'note one', where: 'p', when: 1 });
  j.write({ text: 'note two', where: 'q', when: 4 });
  const snap = JSON.parse(JSON.stringify(j.serialize()));
  const k = createJournal({ prose, seed: 555 });
  k.restore(snap);
  assert.equal(k.count(), 2);
  assert.deepEqual(k.raw(), j.raw());
  // A new write continues the id sequence, not colliding with restored ids.
  const n = k.write({ text: 'note three', where: 'r', when: 6 });
  assert.equal(n.id, 3);
  // And the rendered view matches the original at the same exposure/now.
  assert.deepEqual(k.view({ exposure: 0.5, now: 5 }).filter((e) => e.origin === 'player').slice(0, 2),
    j.view({ exposure: 0.5, now: 5 }).filter((e) => e.origin === 'player'));
});
