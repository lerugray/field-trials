import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Notebook } from './notebook.js';
import { buildToyCase } from './fixtures/toy-case.js';

function logged() {
  const c = buildToyCase();
  const nb = new Notebook();
  nb.logFact(c.fact('f-means'), { scene: 'morgue' });
  nb.logFact(c.fact('f-chef-at-restaurant'), { scene: 'restaurant' });
  nb.logStatement(c.statement('s-chef-alibi'), { scene: 'studio' });
  return { c, nb };
}

test('facts and statements auto-log; logging is idempotent by id', () => {
  const { c, nb } = logged();
  assert.equal(nb.size, 3);
  nb.logFact(c.fact('f-means')); // repeat
  assert.equal(nb.size, 3);
});

test('entry exposes person, type, and text', () => {
  const { nb } = logged();
  const e = nb.get('f-chef-at-restaurant');
  assert.equal(e.person(), 'chef');
  assert.equal(e.type(), 'location');
  const s = nb.get('s-chef-alibi');
  assert.equal(s.type(), 'statement');
  assert.equal(s.person(), 'chef');
});

test('pin / unpin tracks pinned entries', () => {
  const { nb } = logged();
  nb.pin('f-means');
  assert.ok(nb.isPinned('f-means'));
  assert.deepEqual(nb.pinned().map((e) => e.id), ['f-means']);
  nb.unpin('f-means');
  assert.equal(nb.pinned().length, 0);
});

test('grouping collects entries into named folders', () => {
  const { nb } = logged();
  nb.addToGroup('the alibi', 'f-chef-at-restaurant');
  nb.addToGroup('the alibi', 's-chef-alibi');
  assert.deepEqual(nb.groups(), ['the alibi']);
  assert.deepEqual(nb.entriesInGroup('the alibi').map((e) => e.id).sort(),
    ['f-chef-at-restaurant', 's-chef-alibi']);
  nb.removeFromGroup('the alibi', 's-chef-alibi');
  assert.equal(nb.entriesInGroup('the alibi').length, 1);
});

test('cross-reference is mutual and never self-links', () => {
  const { nb } = logged();
  assert.ok(nb.crossRef('f-chef-at-restaurant', 's-chef-alibi'));
  assert.deepEqual(nb.crossRefsOf('f-chef-at-restaurant').map((e) => e.id), ['s-chef-alibi']);
  assert.deepEqual(nb.crossRefsOf('s-chef-alibi').map((e) => e.id), ['f-chef-at-restaurant']);
  assert.equal(nb.crossRef('f-means', 'f-means'), false);
});

test('search matches prose, person, type, value across terms', () => {
  const { nb } = logged();
  assert.deepEqual(nb.search('valet').map((e) => e.id), ['f-chef-at-restaurant']);
  assert.deepEqual(nb.search('stabbed').map((e) => e.id), ['f-means']);
  // multi-term AND
  assert.deepEqual(nb.search('chef location').map((e) => e.id), ['f-chef-at-restaurant']);
  assert.equal(nb.search('').length, 3); // empty query = all
});

test('filter by person / scene / type / kind', () => {
  const { nb } = logged();
  assert.equal(nb.filter({ person: 'chef' }).length, 2);
  assert.deepEqual(nb.filter({ scene: 'morgue' }).map((e) => e.id), ['f-means']);
  assert.deepEqual(nb.filter({ type: 'statement' }).map((e) => e.id), ['s-chef-alibi']);
  assert.equal(nb.filter({ kind: 'fact' }).length, 2);
});

test('facets enumerate distinct people/scenes/types for filter menus', () => {
  const { nb } = logged();
  const f = nb.facets();
  assert.deepEqual(f.people, ['chef', 'partner']);
  assert.deepEqual(f.scenes, ['morgue', 'restaurant', 'studio']);
  assert.ok(f.types.includes('statement') && f.types.includes('location'));
});

test('case-review restates KNOWN FACTS only (no statements)', () => {
  const { nb } = logged();
  const review = nb.reviewKnownFacts();
  assert.equal(review.length, 2);
  assert.ok(review.every((e) => e.kind === 'fact'));
});

test('round-trips through JSON against a case', () => {
  const { c, nb } = logged();
  nb.pin('f-means');
  nb.addToGroup('key', 'f-means');
  nb.crossRef('f-chef-at-restaurant', 's-chef-alibi');
  const json = JSON.parse(JSON.stringify(nb.toJSON()));
  const nb2 = Notebook.fromJSON(json, c);
  assert.equal(nb2.size, 3);
  assert.ok(nb2.isPinned('f-means'));
  assert.deepEqual(nb2.entriesInGroup('key').map((e) => e.id), ['f-means']);
  assert.deepEqual(nb2.crossRefsOf('s-chef-alibi').map((e) => e.id), ['f-chef-at-restaurant']);
});

test('fromJSON skips stale entries not in the case', () => {
  const c = buildToyCase();
  const nb = Notebook.fromJSON({ logged: [{ id: 'ghost', kind: 'fact' }] }, c);
  assert.equal(nb.size, 0);
});

test('log guards reject wrong types', () => {
  const nb = new Notebook();
  assert.throws(() => nb.logFact({ id: 'x' }), /needs a Fact/);
  assert.throws(() => nb.logStatement({ id: 'x' }), /needs a Statement/);
});
