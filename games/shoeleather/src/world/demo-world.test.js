import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoWorld } from './demo-world.js';
import { HOTSPOT_KINDS } from '../engine/scene.js';
import { contains } from '../engine/geometry.js';
import { LOGICAL_W, LOGICAL_H } from '../config.js';

test('demo world graph validates (no dangling links or vias)', () => {
  const { graph } = buildDemoWorld();
  assert.deepEqual(graph.validate(), []);
});

test('every scene is reachable from the start via exits', () => {
  const { graph, startScene } = buildDemoWorld();
  const seen = new Set([startScene]);
  const queue = [startScene];
  while (queue.length) {
    for (const n of graph.neighbors(queue.shift())) {
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  assert.equal(seen.size, graph.size, 'some scene is unreachable');
});

test('all hotspot bounds sit inside the logical resolution (no off-screen hunts)', () => {
  const { graph } = buildDemoWorld();
  const screen = { x: 0, y: 0, w: LOGICAL_W, h: LOGICAL_H };
  for (const id of graph.ids()) {
    for (const h of graph.get(id).hotspots) {
      const b = h.bounds;
      assert.ok(contains(screen, b.x, b.y), `${id}/${h.id} top-left off-screen`);
      assert.ok(b.x + b.w <= LOGICAL_W && b.y + b.h <= LOGICAL_H, `${id}/${h.id} extends off-screen`);
    }
  }
});

test('every hotspot kind is exercised somewhere in the harness world', () => {
  const { graph } = buildDemoWorld();
  const kinds = new Set();
  for (const id of graph.ids()) for (const h of graph.get(id).hotspots) kinds.add(h.kind);
  for (const k of HOTSPOT_KINDS) assert.ok(kinds.has(k), `kind "${k}" never demonstrated`);
});

test('document-referencing hotspots point at documents that exist', () => {
  const { graph, documents } = buildDemoWorld();
  for (const id of graph.ids()) {
    for (const h of graph.get(id).hotspots) {
      const docId = h.meta && h.meta.document;
      if (docId) assert.ok(documents[docId], `hotspot ${h.id} references missing document ${docId}`);
    }
  }
});

test('documents lay out to readable lines at a column budget', () => {
  const { documents } = buildDemoWorld();
  const lines = documents.ledger.layout(32);
  assert.ok(lines.length > 3);
  for (const l of lines) assert.ok(l.length <= 32);
  assert.ok(lines[0].includes('DUTY LEDGER'));
});

test('no em dashes in player-facing world text (register law)', () => {
  const { graph, documents } = buildDemoWorld();
  const strings = [];
  for (const id of graph.ids()) {
    strings.push(graph.get(id).name);
    for (const h of graph.get(id).hotspots) strings.push(h.label);
  }
  for (const d of Object.values(documents)) { strings.push(d.title, d.body); }
  for (const s of strings) assert.ok(!s.includes('—'), `em dash in "${s}"`);
});
