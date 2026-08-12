import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCase2World } from './case-2-world.js';
import { runCaseBattery } from '../case/solver.js';
import { contains } from '../engine/geometry.js';
import { LOGICAL_W, LOGICAL_H } from '../config.js';

test('case-2 world graph validates and every scene is reachable', () => {
  const { graph, startScene } = buildCase2World();
  assert.deepEqual(graph.validate(), []);
  const seen = new Set([startScene]);
  const q = [startScene];
  while (q.length) for (const n of graph.neighbors(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.equal(seen.size, graph.size);
});

test('the embedded Case 2 still passes the full solver battery (with documents)', () => {
  const { caseData } = buildCase2World();
  const report = runCaseBattery(caseData);
  assert.ok(report.passed, report.problems.join('\n'));
});

test('every fact is acquirable from some hotspot; every statement via dialogue', () => {
  const { graph, caseData } = buildCase2World();
  const facts = new Set();
  for (const id of graph.ids()) for (const h of graph.get(id).hotspots) {
    for (const fact of h.meta?.facts || (h.meta?.fact ? [h.meta.fact] : [])) facts.add(fact);
  }
  for (const f of caseData.facts) assert.ok(facts.has(f.id), `fact ${f.id} is not acquirable in-world`);
  const revealed = new Set();
  for (const tree of Object.values(caseData.dialogues)) {
    for (const n of tree.nodes()) for (const o of n.options) for (const e of o.effects) {
      if (e.type === 'revealStatement') revealed.add(e.statement);
    }
  }
  for (const s of caseData.statements) assert.ok(revealed.has(s.id), `statement ${s.id} is never revealed in dialogue`);
});

test('hotspot fact/suspect/document refs all resolve', () => {
  const { graph, caseData, documents } = buildCase2World();
  for (const id of graph.ids()) for (const h of graph.get(id).hotspots) {
    if (!h.meta) continue;
    for (const fact of h.meta.facts || (h.meta.fact ? [h.meta.fact] : [])) assert.ok(caseData.fact(fact), `${h.id} -> missing fact ${fact}`);
    if (h.meta.suspect) assert.ok(caseData.dialogues[h.meta.suspect], `${h.id} -> no dialogue for suspect ${h.meta.suspect}`);
    if (h.meta.document) assert.ok(documents[h.meta.document], `${h.id} -> missing document ${h.meta.document}`);
  }
});

test('all hotspots sit inside the logical resolution', () => {
  const { graph } = buildCase2World();
  const screen = { x: 0, y: 0, w: LOGICAL_W, h: LOGICAL_H };
  for (const id of graph.ids()) for (const h of graph.get(id).hotspots) {
    const b = h.bounds;
    assert.ok(contains(screen, b.x, b.y) && b.x + b.w <= LOGICAL_W && b.y + b.h <= LOGICAL_H, `${id}/${h.id} off-screen`);
  }
});

test('no em dashes in player-facing world/document text', () => {
  const { graph, documents } = buildCase2World();
  const strings = [];
  for (const id of graph.ids()) { strings.push(graph.get(id).name); for (const h of graph.get(id).hotspots) strings.push(h.label); }
  for (const d of Object.values(documents)) strings.push(d.title, d.body);
  for (const s of strings) assert.ok(!s.includes('—'), `em dash in "${s}"`);
});

test('no em dashes in the Case 2 fixture prose (fact/prologue/trap text)', () => {
  const { caseData } = buildCase2World();
  const strings = [];
  for (const f of caseData.facts) strings.push(f.prose);
  for (const s of caseData.statements) strings.push(s.text);
  for (const b of caseData.prologue.beats) strings.push(b.prose);
  if (caseData.trap) strings.push(...caseData.trap.lines);
  for (const s of strings) assert.ok(!s.includes('—'), `em dash in player-facing prose: "${s}"`);
});
