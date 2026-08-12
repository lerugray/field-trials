import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCase1 } from './case-1.js';
import { AccusationBoard } from '../board.js';
import { Notebook } from '../notebook.js';
import { CaseClock } from '../../people/case-clock.js';

test('Case 1 TRAP ending fires the superior variant on a correct staged demonstration', () => {
  const c = buildCase1();
  const nb = new Notebook();
  for (const id of Object.values(c.winningChain)) if (c.fact(id)) { nb.logFact(c.fact(id)); nb.pin(id); }
  nb.logStatement(c.statement('s-chef-alibi')); nb.pin('s-chef-alibi');
  const board = new AccusationBoard({ caseData: c, notebook: nb, clock: new CaseClock({ counterMoves: c.counterMoves }) });
  for (const [slot, id] of Object.entries(c.winningChain)) if (slot !== 'victim') board.set(slot, id);
  assert.equal(board.submit(true).variant, 'trap');
  assert.ok(c.trap && c.trap.lines.length > 0);
});
