// THE LEGIBILITY LINT's own regression suite (GATE 7c).
//
// The lint only earns its place if it FAILS against the strings the
// 2026-08-14 audit found. Those strings no longer exist in the build, so the
// proof that the gate still bites has to live here: every founding violation
// is pinned as a case the rules must catch, and every entry of the audit's
// OK-list is pinned as a case they must clear. Weakening a rule to make a new
// string pass will break these before it reaches a frame.

import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEntry, RULES, ALLOW } from '../scripts/legibility-lint.mjs';

const hitsFor = (text, stack = null, prev = null) => auditEntry({ text, stack }, prev).hits;
const rulesHit = (text, stack, prev) => hitsFor(text, stack, prev).map((h) => h.rule);

// Every violation the audit recorded at HEAD af8b256, verbatim in shape.
// The comment on each names the audit category it came from.
const VIOLATIONS = [
  ['a19 d7 m4', 'letter-digit-fusion'], // the founding one (fixed pre-audit)
  ['LEG 9  ·  30/120  ·  enc 0', 'bare-ratio'], // 1 — march masthead
  ['LEG 9  ·  30/120  ·  enc 0  ·  esc L2', 'letter-digit-fusion'], // 2 — escalation
  ['FILED ✓ expedition opened @30', 'at-token'], // 3 — save badge
  ['last filed @30', 'at-token'], // 3 — save badge, resting
  ['score: march (M)', 'parenthesized-letter'], // 3 — score/mute
  ['score muted (M)', 'parenthesized-letter'], // 3 — score/mute, muted
  ['faults 3 (E)', 'parenthesized-letter'], // 3 — fault badge
  ['#3 L4 reduced 73¤', 'letter-digit-fusion'], // 6 — docket history
  ['#3 L6 return 120¤', 'letter-digit-fusion'], // 6 — docket history
  ['expeditions filed: 1 · deepest leg: 4 · escalation L1', 'letter-digit-fusion'], // 6 — defeat
];

test('the lint catches every violation shape the 2026-08-14 audit recorded', () => {
  for (const [text, rule] of VIOLATIONS) {
    const hit = rulesHit(text);
    assert.ok(hit.length > 0, `lint went silent on a known violation: ${text}`);
    assert.ok(hit.includes(rule), `${text} should trip ${rule}, tripped ${JSON.stringify(hit)}`);
  }
});

test('a19 d7 m4 trips once per fused token, not once per line', () => {
  assert.equal(hitsFor('a19 d7 m4').length, 3);
});

test("the audit's OK-list passes — the allowlist is contextual, not blanket", () => {
  // Word-anchored ratios, in-string.
  assert.deepEqual(rulesHit('LEG 9  ·  pace 30/120  ·  encounters 0'), []);
  assert.deepEqual(rulesHit('leg 0 · pace 0/120'), []);
  assert.deepEqual(rulesHit('page 1/2'), []);
  assert.deepEqual(rulesHit('hp 43/43  atk 19 def 7 mag 4 spd 9'), []);
  // The hp figure that annotates the bar it is drawn on.
  assert.deepEqual(rulesHit('43/43', 'hp-figure'), []);
  // A two-ink line: the label is the preceding draw of the same block.
  assert.deepEqual(rulesHit('43/43', 'shop-frame:0', { text: 'hp', stack: 'shop-frame:0' }), []);
  // Diegetic ids, panel-anchored counts, ratios of a labelled quantity.
  assert.deepEqual(rulesHit('MANDATE 6150-C'), []);
  assert.deepEqual(rulesHit('#3 leg 4 reduced 73¤'), []);
  assert.deepEqual(rulesHit('sell 50%'), []);
  assert.deepEqual(rulesHit('pay ×0.91'), []);
  assert.deepEqual(rulesHit('encounters ×1.7'), []);
  assert.deepEqual(rulesHit('Sgt: Serve Writ → Warden (−12)'), []);
  assert.deepEqual(rulesHit('4x'), []); // the speed chips
  assert.deepEqual(rulesHit('Bailiff to level 4 (+3 xp)'), []);
  // Floating combat figures.
  assert.deepEqual(rulesHit('+21'), []);
  assert.deepEqual(rulesHit('−16'), []);
});

test('the ratio allowlist does not leak across an unrelated block or word', () => {
  // `LEG` names the 0, not the ratio that follows it.
  assert.deepEqual(rulesHit('LEG 0  ·  6/120'), ['bare-ratio']);
  // A label from a DIFFERENT block never clears a figure.
  assert.deepEqual(rulesHit('43/43', 'shop-frame:1', { text: 'hp', stack: 'shop-frame:0' }), ['bare-ratio']);
  // An untagged figure beside an untagged label is not a line, and is not cleared.
  assert.deepEqual(rulesHit('43/43', null, { text: 'supplies', stack: null }), ['bare-ratio']);
});

test('every allowlist entry names a rule that exists and says why', () => {
  const ids = new Set(RULES.map((r) => r.id));
  for (const a of ALLOW) {
    assert.ok(ids.has(a.rule), `allowlist entry targets unknown rule ${a.rule}`);
    assert.ok(a.why && a.why.length > 20, `allowlist entry for ${a.rule} has no stated reason`);
  }
  for (const r of RULES) assert.ok(r.why && r.why.length > 20, `rule ${r.id} has no stated reason`);
});
