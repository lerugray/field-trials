import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildM1World } from './m1-world.js';
import { CaseClock } from '../people/case-clock.js';
import { CHAIN_FACT_SLOTS } from '../case/case.js';

// M5 FAIRNESS AUDIT (in-world): the seed's difficulty law says every required deduction
// step must be EVIDENCED IN-WORLD — no moon logic. The solver proves the case data is
// solvable; these checks prove Case 1's WORLD actually surfaces every load-bearing step,
// and that the always-solvable law holds against the real scenes after counter-moves.

function winningFacts(caseData) {
  const wc = caseData.winningChain;
  return CHAIN_FACT_SLOTS.map((s) => caseData.fact(wc[s]));
}

test('every winning-chain fact is acquirable from an in-world hotspot', () => {
  const { graph, caseData } = buildM1World();
  const boundFacts = new Set();
  for (const id of graph.ids()) for (const h of graph.get(id).hotspots) for (const fact of h.meta?.facts || (h.meta?.fact ? [h.meta.fact] : [])) boundFacts.add(fact);
  for (const f of winningFacts(caseData)) assert.ok(boundFacts.has(f.id), `winning fact ${f.id} is not acquirable in any scene (moon logic)`);
});

test('the contradicted alibi statement is revealable through dialogue', () => {
  const { caseData } = buildM1World();
  const revealed = new Set();
  for (const tree of Object.values(caseData.dialogues)) for (const n of tree.nodes()) for (const o of n.options) for (const e of o.effects) if (e.type === 'revealStatement') revealed.add(e.statement);
  assert.ok(revealed.has(caseData.winningChain.contradictedStatement), 'the alibi statement is never spoken (moon logic)');
});

test('every winning-chain fact keeps an acquisition path OPEN in-world after all counter-moves', () => {
  const { graph, caseData } = buildM1World();
  // The set of acquisition-path labels the world actually offers (hotspot ids are the
  // in-world affordances; the fact acquisitionPaths are the abstract routes). We assert
  // the always-solvable guarantee: after every counter-move fires, each winning fact
  // still has an open path.
  const clock = new CaseClock({ counterMoves: caseData.counterMoves });
  for (let i = 0; i < caseData.counterMoves.length; i++) clock.advance(caseData);
  for (const f of winningFacts(caseData)) {
    assert.ok(clock.isFactAcquirable(f), `after counter-moves, winning fact ${f.id} has no open path (unwinnable)`);
  }
});

test('no counter-move ever closes a winning fact\'s last path (tuning check)', () => {
  const { caseData } = buildM1World();
  // Re-run each counter-move against the case; the guard must never throw (it would if a
  // move stranded a fact). This is the counter-move TUNING invariant.
  const clock = new CaseClock({ counterMoves: caseData.counterMoves });
  assert.doesNotThrow(() => { for (let i = 0; i < caseData.counterMoves.length; i++) clock.advance(caseData); });
});
