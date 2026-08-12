import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCase1 } from './fixtures/case-1.js';
import { buildCase2 } from './fixtures/case-2.js';
import { buildEndingScene } from './ending.js';

for (const [label, build] of [['Case 1', buildCase1], ['Case 2', buildCase2]]) {
  test(`${label} ending resolves victim and cast to display names`, () => {
    const c = build();
    const scene = buildEndingScene(c, c.winningChain);
    assert.notEqual(scene.victim.name, c.victim);
    assert.notEqual(scene.accused.name, c.winningChain.suspect);
    assert.ok(scene.witnesses.length >= 1);
  });

  test(`${label} ending performs every full chain fact before CASE CLOSED`, () => {
    const c = build();
    const scene = buildEndingScene(c, c.winningChain);
    const spoken = scene.beats.map((b) => b.prose).join(' ');
    for (const slot of ['means', 'time', 'place', 'alibiMechanism', 'prologueFact', 'corroboration', 'physicalContradiction']) {
      assert.ok(spoken.includes(c.fact(c.winningChain[slot]).prose), `missing full ${slot} prose`);
    }
    assert.equal(scene.beats.at(-1).card, 'CASE CLOSED');
    assert.ok(!scene.beats.slice(0, -1).some((b) => b.card === 'CASE CLOSED'));
  });
}
