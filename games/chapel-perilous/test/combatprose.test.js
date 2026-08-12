// M11 Part A inc6 — the register-carried combat surface. Verb labels, action beats,
// and outcome banners come in-voice from combat.json (no menu-speak), are [SEED]-gated,
// and are deterministic in the passed seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombatProse } from '../src/engine/combatprose.js';
import combatData from '../data/register/combat.json' with { type: 'json' };

const cp = createCombatProse(combatData);
const VERBS = ['attack', 'defend', 'item', 'subterfuge', 'talk', 'flee'];

test('every combat verb has an in-voice label — no menu-speak on the surface', () => {
  for (const v of VERBS) {
    const l = cp.label(v);
    assert.ok(l.startsWith('[SEED]'), `${v} label is [SEED]-gated`);
    assert.ok(!/^\[SEED\] (fight|talk|flee|item)$/i.test(l), `${v} label is voiced, not a raw verb`);
  }
  // the raw combat verbs "fight/talk/flee" do not appear as labels
  const labels = VERBS.map((v) => cp.label(v).toLowerCase());
  assert.ok(!labels.includes('[seed] fight'));
});

test('each verb has a voiced beat, deterministic in seed', () => {
  for (const v of VERBS) {
    assert.ok(cp.beat(v, 1).startsWith('[SEED]'));
    assert.equal(cp.beat(v, 7), cp.beat(v, 7), 'same seed → same beat');
  }
});

test('outcome banners resolve for every engine outcome + refusal, hyphen or underscore', () => {
  for (const k of ['win', 'lose', 'fled', 'parley', 'recruit']) {
    assert.ok(cp.outcome(k, 2).startsWith('[SEED]'), `${k} banner present`);
  }
  // engine events arrive hyphenated — they must still resolve
  assert.equal(cp.outcome('flee-fail', 1), cp.outcome('flee_fail', 1));
  assert.ok(cp.outcome('talk-hardened', 3).startsWith('[SEED]'));
  assert.ok(cp.outcome('item-fumble', 3).startsWith('[SEED]'));
  assert.ok(cp.outcome('subterfuge-spent', 3).startsWith('[SEED]'));
});

test('an unknown key degrades gracefully (still [SEED]-marked, never throws)', () => {
  assert.ok(cp.outcome('nonsense', 1).startsWith('[SEED]'));
  assert.ok(cp.beat('nonsense', 1).startsWith('[SEED]'));
});

// C1/C2 — the kill/join beat lines, by class, and the classifier.
test('kill and join beats voice every class, deterministic + [SEED]-gated', () => {
  for (const cls of ['mundane', 'strange', 'uncanny', 'sacred']) {
    assert.ok(cp.killLine(cls, 3).startsWith('[SEED]'), `kill ${cls}`);
    assert.ok(cp.joinLine(cls, 3).startsWith('[SEED]'), `join ${cls}`);
    assert.equal(cp.killLine(cls, 9), cp.killLine(cls, 9), 'same seed → same kill line');
  }
  assert.ok(cp.killLine('nonsense', 1).startsWith('[SEED]'), 'unknown class degrades gracefully');
});

test('classOf bands a being by sacredness then weirdness', () => {
  assert.equal(cp.classOf({ sacred: true, register: { weirdness: 0.1 } }), 'sacred');
  assert.equal(cp.classOf({ register: { weirdness: 0.7 } }), 'uncanny');
  assert.equal(cp.classOf({ register: { weirdness: 0.4 } }), 'strange');
  assert.equal(cp.classOf({ register: { weirdness: 0.05 } }), 'mundane');
  assert.equal(cp.classOf(null), 'mundane', 'no ref → mundane, never throws');
});
