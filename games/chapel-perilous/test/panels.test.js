// M6 INTERFACE — encounter / death / building panels must never overlap or clip,
// across the full range of variable content (rosters, logs, approaches).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_W, CANVAS_H, bandsOverlap, textWidth } from '../src/engine/layout.js';
import { buildCombatDrawList, buildDeathDrawList, buildBuildingDrawList, buildJournalDrawList, buildManualDrawList, buildManualPage } from '../src/engine/panels.js';

function assertClean(rows, label) {
  assert.ok(rows.length >= 1, `${label}: empty draw list`);
  for (const r of rows) {
    assert.ok(String(r.text).length > 0, `${label}: empty row`);
    const w = r.width ?? textWidth(r.text, r.size);
    assert.ok(r.x >= 0 && r.x + w <= CANVAS_W + 0.01, `${label}: clips width: "${r.text}" (${r.x}+${w})`);
    assert.ok(r.y >= 0 && r.y <= CANVAS_H + 0.01, `${label}: y out of canvas: ${r.y}`);
  }
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      assert.equal(bandsOverlap(rows[i], rows[j]), false, `${label}: overlap:\n  "${rows[i].text}"\n  "${rows[j].text}"`);
}

const foe = (n, hp = 3) => ({ name: `[SEED] being ${n}`, hp, maxHp: hp });
const mate = (n, hp = 5) => ({ name: `[SEED] ally ${n}`, hp, maxHp: hp });

test('combat panel (root): clean, shows THEM/YOU + encounter header', () => {
  const rows = buildCombatDrawList({
    foes: [foe(1), foe(2)], party: [mate(1)], round: 2,
    menu: 'root', note: '[SEED] the air tightens', log: ['[SEED] a blow lands', '[SEED] it reels'],
  });
  assertClean(rows, 'combat-root');
  const joined = rows.map((r) => r.text).join('\n');
  assert.ok(/ENCOUNTER/.test(joined) && /THEM/.test(joined) && /YOU/.test(joined));
});

test('combat panel (talk): clean, lists approaches', () => {
  const rows = buildCombatDrawList({
    foes: [foe(1)], party: [mate(1)], menu: 'talk',
    approaches: [{ verb: 'flatter', difficulty: 'open' }, { verb: 'threaten', difficulty: 'hard' }],
  });
  assertClean(rows, 'combat-talk');
  const joined = rows.map((r) => r.text).join('\n');
  assert.ok(/flatter/.test(joined) && /\[1\]/.test(joined));
});

test('combat log is WRAPPED, never clipped/ellipsized (A6 — Ray: log clips by the art)', () => {
  // A single very long log entry — before A6 this got squeezed into one line
  // beside the bust and ellipsized. Now it wraps to the column; no log line may
  // carry the ellipsis, and every word of the entry must survive on screen.
  const longEntry = 'the auditor unrolls a form the length of the corridor and begins, in a voice like a filing drawer, to read you your own itemized failures aloud';
  const rows = buildCombatDrawList({
    foes: [foe(1)], party: [mate(1)], menu: 'root',
    log: [longEntry],
  });
  assertClean(rows, 'combat-longlog');
  const logRows = rows.filter((r) => r.region === 'log');
  assert.ok(logRows.length >= 2, 'a long log entry should wrap to multiple lines, not clip to one');
  for (const r of logRows) assert.ok(!r.text.includes('…'), `log line clipped with an ellipsis: "${r.text}"`);
  // every word of the entry appears somewhere in the rendered log (nothing dropped)
  const shown = logRows.map((r) => r.text).join(' ');
  for (const w of longEntry.split(' ')) assert.ok(shown.includes(w), `log dropped the word "${w}"`);
});

test('combat panel: clean at worst-case content (overflowing rosters/log/approaches)', () => {
  const many = (mk) => Array.from({ length: 8 }, (_, i) => mk(i));
  for (const menu of ['root', 'talk']) {
    const rows = buildCombatDrawList({
      foes: many(foe), party: many(mate), menu,
      approaches: many((i) => ({ verb: `verb${i}longenough`, difficulty: 'hard' })),
      note: '[SEED] a very long ominous note that should be clamped to a single line cleanly here',
      log: many((i) => `[SEED] log entry number ${i} with some length to it as well`),
    });
    assertClean(rows, `combat-worst-${menu}`);
    // Clamp markers appear when content overflows.
    assert.ok(rows.some((r) => /more/.test(r.text)), `${menu}: expected a "+N more" clamp marker`);
  }
});

test('death panel: clean, names the fallen + the new stranger', () => {
  const rows = buildDeathDrawList({
    fallen: '[SEED] Old Initiate',
    pc: { name: '[SEED] New Stranger', omen: '[SEED] a crossed-out star', oddment: { name: '[SEED] a dull knife with a very long descriptive label indeed' } },
  });
  assertClean(rows, 'death');
  const joined = rows.map((r) => r.text).join('\n');
  assert.ok(/YOU DIED/.test(joined) && /gone for good/.test(joined) && /New Stranger/.test(joined));
});

test('building panel: clean, frames the name + wraps service prose', () => {
  const rows = buildBuildingDrawList({
    name: '[SEED] The Rumor Exchange',
    lines: ['[SEED] A clerk you have never met greets you by a name you have not given, and slides a folded slip of paper across the counter without a word about payment.'],
  });
  assertClean(rows, 'building');
  assert.ok(rows.some((r) => /Rumor Exchange/.test(r.text)));
});

const jentry = (i, origin = 'player', corruption = 0) => ({
  id: origin === 'ghost' ? `g${i}` : i, origin, corruption, when: i,
  where: origin === 'ghost' ? '' : `[SEED] place ${i}`,
  text: `[SEED] entry ${i} with enough words to force wrapping across the column width comfortably`,
});

test('journal panel (reading): clean, frames the header + entries', () => {
  const rows = buildJournalDrawList({
    entries: [jentry(1), jentry(2, 'player', 0.4), jentry(3, 'ghost', 1)],
  });
  assertClean(rows, 'journal-read');
  assert.ok(rows.some((r) => /JOURNAL/.test(r.text)));
});

test('journal panel (empty): clean, prompts a first note', () => {
  const rows = buildJournalDrawList({ entries: [] });
  assertClean(rows, 'journal-empty');
  assert.ok(rows.some((r) => /empty|write a note/i.test(r.text)));
});

test('journal panel (writing): clean, shows place stamp + draft', () => {
  const rows = buildJournalDrawList({
    writing: true, place: '[SEED] the lodge',
    draft: 'the clerk knew my name before I gave it and I do not like what that implies at all',
  });
  assertClean(rows, 'journal-write');
  const joined = rows.map((r) => r.text).join('\n');
  assert.ok(/writing/i.test(joined) && /lodge/.test(joined));
});

test('journal panel: clean at worst-case (many long entries clamp to budget)', () => {
  const entries = Array.from({ length: 20 }, (_, i) => jentry(i, i % 3 === 0 ? 'ghost' : 'player', i % 2));
  const rows = buildJournalDrawList({ entries });
  assertClean(rows, 'journal-worst');
});

// Structure Arc slice 1 (LOCK 1/2) — the manual (questline reader) panel.
const op = (n, status, site) => ({
  number: n, title: `NAME_TBD_op${n}_title`,
  teaches: `[SEED] a long mechanical description of what operation ${n} actually teaches, long enough to need wrapping on the narrow card without losing any words`,
  status, siteLabel: site,
});

test('manual panel: clean, shows the header and every operation\'s number/status', () => {
  const rows = buildManualDrawList({
    operations: [op(1, 'complete', '[SEED] the Near Hollow'), op(2, 'active', '[SEED] the Mid Threshold'), op(3, 'locked', '[SEED] the Far Gate')],
    introBeats: ['PROSE_TBD_intro_1', 'PROSE_TBD_intro_2'],
  });
  assertClean(rows, 'manual');
  const joined = rows.map((r) => r.text).join('\n');
  assert.ok(/THE MANUAL/.test(joined));
  assert.ok(/Operation 1/.test(joined) && /Operation 2/.test(joined) && /Operation 3/.test(joined));
  // an active/complete op names its dungeon; a locked one does not
  assert.ok(/Near Hollow/.test(joined) && /Mid Threshold/.test(joined));
  assert.ok(!/Far Gate/.test(joined), 'a locked operation should not reveal its site pointer');
});

test('manual panel (empty): clean, no crash', () => {
  const rows = buildManualDrawList({ operations: [] });
  assertClean(rows, 'manual-empty');
});

test('manual panel: wrapped worst-case content remains reachable across scroll pages', () => {
  const many = Array.from({ length: 20 }, (_, i) => op(i + 1, i === 0 ? 'active' : 'locked', `[SEED] site ${i} with an unreasonably long name for a small card`));
  const args = { operations: many, introBeats: ['PROSE_TBD_a', 'PROSE_TBD_b', 'PROSE_TBD_c'] };
  const first = buildManualPage(args);
  assertClean(first.rows, 'manual-worst-first');
  assert.ok(first.maxScroll > 0, 'long content should expose a scroll range');

  const shown = [];
  for (let scroll = 0; scroll <= first.maxScroll; scroll += first.visibleLines) {
    const page = buildManualPage({ ...args, scroll });
    assertClean(page.rows, `manual-worst-${scroll}`);
    shown.push(...page.rows.map((r) => r.text));
  }
  const last = buildManualPage({ ...args, scroll: first.maxScroll });
  assertClean(last.rows, 'manual-worst-last');
  shown.push(...last.rows.map((r) => r.text));
  const joined = shown.join('\n');
  assert.ok(/Operation 20/.test(joined), 'the final operation must be reachable by scrolling');
  assert.ok(/without losing any words/.test(joined), 'wrapped teaching prose must survive intact');
  assert.ok(!joined.includes('…'), 'the reader must not ellipsize Manual prose');
});
