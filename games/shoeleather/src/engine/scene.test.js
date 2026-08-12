import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hotspot, Scene, SceneGraph, HOTSPOT_KINDS } from './scene.js';
import { rect } from './geometry.js';

test('hotspot requires id, label, valid kind', () => {
  assert.throws(() => new Hotspot({ bounds: rect(0, 0, 1, 1), label: 'x' }), /needs an id/);
  assert.throws(() => new Hotspot({ id: 'a', bounds: rect(0, 0, 1, 1) }), /needs a label/);
  assert.throws(() => new Hotspot({ id: 'a', bounds: rect(0, 0, 1, 1), label: 'x', kind: 'sniff' }), /unknown hotspot kind/);
});

test('hotspot contains point', () => {
  const h = new Hotspot({ id: 'desk', bounds: rect(10, 10, 20, 20), label: 'Desk', kind: 'look' });
  assert.ok(h.contains(10, 10));
  assert.ok(h.contains(29, 29));
  assert.ok(!h.contains(30, 30));
  assert.ok(!h.contains(9, 9));
});

test('all kinds are constructable', () => {
  for (const kind of HOTSPOT_KINDS) {
    const h = new Hotspot({ id: 'h', bounds: rect(0, 0, 1, 1), label: 'L', kind });
    assert.equal(h.kind, kind);
  }
});

test('scene rejects duplicate hotspot ids', () => {
  assert.throws(() => new Scene({
    id: 's', hotspots: [
      { id: 'a', bounds: rect(0, 0, 1, 1), label: 'A' },
      { id: 'a', bounds: rect(1, 1, 1, 1), label: 'A2' },
    ],
  }), /duplicate hotspot id/);
});

test('hotspotAt returns topmost (last-painted) hotspot', () => {
  const s = new Scene({ id: 's', hotspots: [
    { id: 'wall', bounds: rect(0, 0, 100, 100), label: 'Wall' },
    { id: 'painting', bounds: rect(20, 20, 30, 30), label: 'Painting' },
  ] });
  assert.equal(s.hotspotAt(25, 25).id, 'painting'); // overlap → topmost
  assert.equal(s.hotspotAt(5, 5).id, 'wall');
  assert.equal(s.hotspotAt(200, 200), null);
});

test('scene exits resolve via hotspot id', () => {
  const s = new Scene({
    id: 'hall',
    hotspots: [{ id: 'door', bounds: rect(0, 0, 10, 10), label: 'Door', kind: 'exit' }],
    links: [{ to: 'kitchen', via: 'door' }],
  });
  assert.equal(s.exitVia('door'), 'kitchen');
  assert.equal(s.exitVia('window'), null);
});

test('scene graph add/get/has/neighbors', () => {
  const g = new SceneGraph();
  g.add(new Scene({ id: 'hall', links: [{ to: 'kitchen', via: null }] }));
  g.add(new Scene({ id: 'kitchen' }));
  assert.ok(g.has('hall'));
  assert.equal(g.size, 2);
  assert.deepEqual(g.neighbors('hall'), ['kitchen']);
  assert.deepEqual(g.ids().sort(), ['hall', 'kitchen']);
});

test('scene graph rejects duplicate scene id', () => {
  const g = new SceneGraph();
  g.add(new Scene({ id: 'x' }));
  assert.throws(() => g.add(new Scene({ id: 'x' })), /duplicate scene id/);
});

test('validate flags dangling links and missing via hotspots', () => {
  const g = new SceneGraph();
  g.add(new Scene({
    id: 'hall',
    hotspots: [{ id: 'door', bounds: rect(0, 0, 1, 1), label: 'Door', kind: 'exit' }],
    links: [{ to: 'nowhere', via: 'door' }, { to: 'hall', via: 'ghost' }],
  }));
  const problems = g.validate();
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => /missing scene "nowhere"/.test(p)));
  assert.ok(problems.some((p) => /missing hotspot "ghost"/.test(p)));
});

test('validate is clean on a well-formed graph', () => {
  const g = new SceneGraph();
  g.add(new Scene({
    id: 'hall',
    hotspots: [{ id: 'door', bounds: rect(0, 0, 1, 1), label: 'Door', kind: 'exit' }],
    links: [{ to: 'kitchen', via: 'door' }],
  }));
  g.add(new Scene({ id: 'kitchen' }));
  assert.deepEqual(g.validate(), []);
});
