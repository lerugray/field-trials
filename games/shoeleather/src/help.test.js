import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELP, CONTROL_HINT } from './help.js';

test('help covers the core systems', () => {
  const titles = HELP.map((s) => s.title.toLowerCase()).join(' ');
  for (const topic of ['looking', 'notebook', 'interrogation', 'accusation', 'anytime']) {
    assert.ok(titles.includes(topic), `help missing a section on ${topic}`);
  }
});

test('every help section has readable lines', () => {
  for (const s of HELP) {
    assert.ok(s.lines.length > 0, `${s.title} has no lines`);
    for (const l of s.lines) assert.ok(l.length > 0);
  }
});

test('help explains the no-hints / exact-chain difficulty stance', () => {
  const all = HELP.flatMap((s) => s.lines).join(' ').toLowerCase();
  assert.ok(all.includes('exact chain'));
  assert.ok(all.includes('pinned'));
  assert.ok(all.includes('no pixel-hunting') || all.includes('sweep'));
});

test('register: no em dashes in help or the control hint', () => {
  for (const s of HELP) for (const l of s.lines) assert.ok(!l.includes('—'), `em dash in "${l}"`);
  assert.ok(!CONTROL_HINT.includes('—'));
  assert.ok(CONTROL_HINT.includes('help'));
});
