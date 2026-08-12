// M12 C4 — the stranger's nature explainer (+ R4 qualitative wording). The four
// verb-gates are named in-voice, sourced from the real STAT_VERB / DIFFICULTY_RANK so
// the reference can't drift; ranks read as words, never a raw %. The one-time chargen
// panel and the permanent [?] reference share the same content.
import test from 'node:test';
import assert from 'node:assert/strict';
import { natureLines, buildNatureDrawList, buildHelpOverlay } from '../src/engine/chrome.js';
import { STAT_VERB } from '../src/engine/character.js';

test('natureLines names every stat→verb gate from the real mapping', () => {
  const { gates, ladder, thresh } = natureLines();
  for (const [stat, verb] of Object.entries(STAT_VERB)) {
    assert.ok(gates.some((g) => g.includes(stat) && g.includes(verb)), `${stat}→${verb} named`);
  }
  assert.equal(gates.length, 4);
  assert.ok(/shaky/.test(ladder) && /uncanny/.test(ladder), 'the rank ladder is spelled out');
  assert.ok(/steady|sharp/.test(thresh), 'thresholds are qualitative ranks');
});

test('the nature copy is qualitative — no raw percentage anywhere (R4)', () => {
  const { gates, ladder, thresh } = natureLines();
  for (const s of [...gates, ladder, thresh]) assert.ok(!s.includes('%'), `no % in "${s}"`);
  const rows = buildNatureDrawList().filter((r) => r.text);
  for (const r of rows) assert.ok(!r.text.includes('%'), `no % on the panel: ${r.text}`);
});

test('the one-time panel builds without clipping and titles itself', () => {
  const rows = buildNatureDrawList().filter((r) => r.text);
  const text = rows.map((r) => r.text).join('\n');
  assert.ok(/THE STRANGER'S NATURE/.test(text));
  assert.ok(/any key/.test(text), 'it is skippable');
});

test('the one-time panel shows the full lead sentence with no ellipsis (cp-016)', () => {
  const rows = buildNatureDrawList().filter((r) => r.text);
  const text = rows.map((r) => r.text).join(' ');
  assert.ok(/Four turns of nature open doors that blows never will/.test(text), text);
  assert.ok(!text.includes('…'), `real explainer content must not be clipped: ${text}`);
});

test('the permanent [?] reference reaches the nature page, which carries the gates', () => {
  // [?] page 0 (controls) points onward to the nature page...
  const controls = buildHelpOverlay().filter((r) => r.text).map((r) => r.text).join('\n');
  assert.ok(/the stranger's nature/.test(controls), 'controls point to the nature reference');
  // ...and the reference page lists the verbs (same content as the one-time panel).
  const ref = buildNatureDrawList({ reference: true }).filter((r) => r.text).map((r) => r.text).join('\n');
  assert.ok(/overawe/.test(ref) && /bind/.test(ref), 'the verbs are listed on the reference page');
  assert.ok(/to close/.test(ref), 'the reference page closes (not "any key")');
});
