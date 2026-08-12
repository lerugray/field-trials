import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleTellView } from '../src/ui/battle-tell.js';

test('battle tell view exposes subtle engine copy and its clarity class before a command', () => {
  const view = battleTellView({
    move: 'guard',
    tell: {
      action: 'guard',
      clarity: 'shaded',
      presentationClass: 'tell-shaded',
      text: 'Rival plants its feet and watches.',
    },
  }, false);
  assert.deepEqual(view, {
    hidden: false,
    className: 'battle-tell tell-shaded',
    text: 'Rival plants its feet and watches.',
  });
});

test('battle tell view disappears once the bout is over', () => {
  assert.deepEqual(battleTellView(null, true), {
    hidden: true,
    className: 'battle-tell',
    text: '',
  });
});

test('battle tell view refuses an unexpected presentation class', () => {
  const view = battleTellView({
    move: 'strike',
    tell: {
      action: 'strike',
      presentationClass: 'mechanical-spoiler',
      text: 'Rival moves.',
    },
  }, false);
  assert.equal(view.className, 'battle-tell tell-clear');
});
