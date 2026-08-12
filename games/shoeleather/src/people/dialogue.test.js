import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueTree, DialogueRunner, evalGuard, guardsPass, GUARD_TYPES } from './dialogue.js';
import { SuspectState } from './suspect-state.js';
import { Notebook } from '../case/notebook.js';
import { buildToyCase } from '../case/fixtures/toy-case.js';

function tree() {
  return new DialogueTree({
    id: 'chef', root: 'open',
    nodes: [
      { id: 'open', speaker: 'chef', text: 'Lieutenant. Late for you.', options: [
        { id: 'ask-alibi', text: 'Where were you Thursday?', to: 'alibi', effects: [{ type: 'revealStatement', statement: 's-chef-alibi' }] },
        { id: 'leave', text: 'That is all for now.', to: null },
      ] },
      { id: 'alibi', speaker: 'chef', text: 'At the studio. Taping. Ask anyone.', options: [
        { id: 'press', text: 'Almost forgot to ask.', to: 'press', guards: [{ type: 'factKnown', fact: 'f-chef-at-restaurant' }] },
        { id: 'back', text: 'I see.', to: 'open' },
      ] },
      { id: 'press', speaker: 'chef', text: 'The valet log? That means nothing.', options: [
        { id: 'done', text: 'We will talk again.', to: null },
      ] },
    ],
  });
}

test('tree validates: no dangling targets, no orphans', () => {
  assert.deepEqual(tree().validate(), []);
});

test('validate flags a dangling option target', () => {
  const t = tree();
  t.node('open').options[0].to = 'ghost';
  assert.ok(t.validate().some((p) => /missing node "ghost"/.test(p)));
});

test('validate flags an orphan node', () => {
  const t = new DialogueTree({ id: 'x', root: 'a', nodes: [
    { id: 'a', text: 'a', options: [{ id: 'end', text: 'bye', to: null }] },
    { id: 'island', text: 'unreachable', options: [] },
  ] });
  assert.ok(t.validate().some((p) => /orphan dialogue node "island"/.test(p)));
});

test('constructing with a bad root throws', () => {
  assert.throws(() => new DialogueTree({ id: 'x', root: 'nope', nodes: [{ id: 'a', text: 'a' }] }), /root/);
});

test('runner enters root, counts a visit, marks seen', () => {
  const state = new SuspectState();
  const runner = new DialogueRunner(tree(), state, { notebook: new Notebook() });
  const node = runner.enter();
  assert.equal(node.id, 'open');
  assert.equal(state.visitCount, 1);
  assert.ok(state.isSeen('open'));
});

test('choosing an option applies effects and transitions', () => {
  const nb = new Notebook();
  const runner = new DialogueRunner(tree(), new SuspectState(), { notebook: nb, caseData: buildToyCase() });
  runner.enter();
  const next = runner.choose('ask-alibi');
  assert.equal(next.id, 'alibi');
  assert.ok(nb.has('s-chef-alibi')); // revealStatement effect logged it verbatim
});

test('guarded option is hidden until its fact is known', () => {
  const nb = new Notebook();
  const caseData = buildToyCase();
  const runner = new DialogueRunner(tree(), new SuspectState(), { notebook: nb, caseData });
  runner.enter();
  runner.choose('ask-alibi');
  assert.equal(runner.options().find((o) => o.id === 'press'), undefined); // fact unknown
  nb.logFact(caseData.fact('f-chef-at-restaurant'));
  assert.ok(runner.options().find((o) => o.id === 'press')); // now available
});

test('choosing an unavailable (guarded) option throws', () => {
  const runner = new DialogueRunner(tree(), new SuspectState(), { notebook: new Notebook(), caseData: buildToyCase() });
  runner.enter();
  runner.choose('ask-alibi');
  assert.throws(() => runner.choose('press'), /not available/);
});

test('choosing a null-target option ends the conversation', () => {
  const runner = new DialogueRunner(tree(), new SuspectState(), { notebook: new Notebook() });
  runner.enter();
  assert.equal(runner.choose('leave'), null);
  assert.equal(runner.current(), null);
});

test('evalGuard handles each guard type', () => {
  const state = new SuspectState();
  state.markSeen('open'); state.visitCount = 2;
  const nb = new Notebook();
  const ctx = { state, notebook: nb };
  assert.equal(evalGuard({ type: 'nodeSeen', node: 'open' }, ctx), true);
  assert.equal(evalGuard({ type: 'visitAtLeast', n: 2 }, ctx), true);
  assert.equal(evalGuard({ type: 'visitAtLeast', n: 3 }, ctx), false);
  assert.equal(evalGuard({ type: 'notHardened' }, ctx), true);
  assert.equal(evalGuard({ type: 'afterthought' }, ctx), false);
  state.armAfterthought();
  assert.equal(evalGuard({ type: 'afterthought' }, ctx), true);
  state.tolerance = 0;
  assert.equal(evalGuard({ type: 'notHardened' }, ctx), false);
  assert.throws(() => evalGuard({ type: 'bogus' }, ctx), /unknown guard/);
});

test('guardsPass is AND over all guards', () => {
  const state = new SuspectState(); state.visitCount = 1;
  const ctx = { state, notebook: new Notebook() };
  assert.equal(guardsPass([{ type: 'visitAtLeast', n: 1 }, { type: 'notHardened' }], ctx), true);
  assert.equal(guardsPass([{ type: 'visitAtLeast', n: 5 }], ctx), false);
  assert.equal(guardsPass([], ctx), true);
  assert.ok(GUARD_TYPES.includes('factKnown'));
});
