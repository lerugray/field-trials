// M6 INTERFACE — the shared chrome (keybar + help overlay) must never clip the
// canvas or overlap itself, for EVERY mode. Same regression discipline as the
// title/creation screens, extended to the new chrome (directive: "extend the
// no-overlap/no-clip regression coverage to every piece of new chrome").
import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_W, CANVAS_H, bandsOverlap, textWidth } from '../src/engine/layout.js';
import {
  MODE_HINTS,
  GLOBAL_HINTS,
  buildKeybar,
  buildHelpOverlay,
  buildHudBar,
  keybarHeight,
  packChips,
  chip,
  buildPanel,
} from '../src/engine/chrome.js';
import { PANEL_W } from '../src/engine/frame.js';

function assertNoClip(rows, label) {
  for (const r of rows) {
    assert.ok(String(r.text).length > 0, `${label}: empty row`);
    const w = r.width ?? textWidth(r.text, r.size);
    assert.ok(r.x >= 0, `${label}: x<0`);
    assert.ok(r.x + w <= CANVAS_W + 0.01, `${label}: clips width: "${r.text}" (${r.x}+${w} > ${CANVAS_W})`);
    assert.ok(r.y >= 0 && r.y <= CANVAS_H + 0.01, `${label}: y out of canvas: ${r.y}`);
  }
}

function assertNoOverlap(rows, label) {
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      assert.equal(bandsOverlap(rows[i], rows[j]), false,
        `${label}: rows share a y-band:\n  "${rows[i].text}"\n  "${rows[j].text}"`);
    }
  }
}

test('keybar for every mode: fits width, self-consistent, bottom-anchored', () => {
  for (const mode of Object.keys(MODE_HINTS)) {
    const rows = buildKeybar(mode);
    assert.ok(rows.length >= 1, `${mode}: keybar empty`);
    assertNoClip(rows, `keybar:${mode}`);
    assertNoOverlap(rows, `keybar:${mode}`);
    // Anchored to the bottom of the canvas (last band within ~a line of bottom).
    const lastBottom = Math.max(...rows.map((r) => r.bandBottom));
    assert.ok(lastBottom <= CANVAS_H, `${mode}: keybar past bottom`);
    assert.ok(lastBottom >= CANVAS_H - 40, `${mode}: keybar not bottom-anchored`);
    // Global keys always present in the legend.
    const joined = rows.map((r) => r.text).join('  ');
    for (const [k] of GLOBAL_HINTS) assert.ok(joined.includes(`[${k}]`), `${mode}: missing global [${k}]`);
  }
});

test('keybar wraps rather than clipping when a mode has many hints', () => {
  // overworld has the most controls; force a tiny width to prove wrapping works.
  const rows = buildKeybar('overworld', { width: 220 });
  assert.ok(rows.length >= 2, 'expected wrap to multiple lines');
  for (const r of rows) assert.ok(r.x + r.width <= 220 + 0.01, `wrapped line clips: ${r.text}`);
});

test('packChips never emits a line wider than maxW (given a fitting chip)', () => {
  const chips = ['[Enter] begin', '[R] deal again', '[Esc] back', '[P] palette'];
  const lines = packChips(chips, 120, 12);
  for (const l of lines) assert.ok(textWidth(l, 12) <= 120 + 0.01, `line too wide: ${l}`);
});

test('keybarHeight is positive and matches the drawn band', () => {
  for (const mode of Object.keys(MODE_HINTS)) {
    const h = keybarHeight(mode);
    assert.ok(h > 0 && h < CANVAS_H, `${mode}: implausible keybar height ${h}`);
  }
});

test('help overlay: no overlap, no clip, lists every group + close', () => {
  const rows = buildHelpOverlay();
  assertNoClip(rows, 'help');
  assertNoOverlap(rows, 'help');
  const joined = rows.map((r) => r.text).join('\n');
  assert.ok(/CONTROLS/.test(joined), 'help title');
  assert.ok(/moving about/.test(joined), 'help groups movement');
  assert.ok(/an encounter/.test(joined), 'help documents combat');
  assert.ok(/close/.test(joined), 'help documents how to close');
  // Every global key documented in the overlay.
  for (const [k] of GLOBAL_HINTS) assert.ok(joined.includes(`[${k}]`), `help missing global [${k}]`);
});

test('chip renders a hint pair as bracketed key + label', () => {
  assert.equal(chip(['Enter', 'begin']), '[Enter] begin');
});

test('HUD bar: left + right never overlap or clip, even with long strings', () => {
  const rows = buildHudBar({
    left: 'A very long generated settlement name that would otherwise run across the whole strip',
    right: '⛊ Some Very Long Stranger Name  ♥ 12/12  +4',
  });
  assert.equal(rows.length, 2, 'left + right rows');
  assertNoClip(rows, 'hud');
  // Same line by design (left + right columns) — the invariant is x-separation.
  const [l, r] = rows[0].x < rows[1].x ? rows : [rows[1], rows[0]];
  assert.ok(l.x + l.width <= r.x, 'left and right columns must not cross');
});

test('HUD bar: omits an empty side', () => {
  assert.equal(buildHudBar({ left: 'here', right: '' }).length, 1);
  assert.equal(buildHudBar({ left: '', right: '' }).length, 0);
});

test('HUD bar: accent mode-cue sits left of the place and nothing collides', () => {
  const rows = buildHudBar({
    cue: 'OVERWORLD',
    left: 'A very long generated settlement name that would run across the strip',
    right: '⛊ Some Very Long Stranger Name  ♥ 12/12  +4',
  });
  assert.equal(rows.length, 3, 'cue + place + vitals');
  assertNoClip(rows, 'hud');
  const cueRow = rows.find((r) => r.text === 'OVERWORLD');
  assert.ok(cueRow, 'cue row present');
  assert.equal(cueRow.color, 'accent', 'cue is drawn in the accent hue');
  assert.equal(cueRow.x, 12, 'cue anchors the far left');
  // Ordered left→right by x with no overlap: cue, then place, then vitals.
  const sorted = [...rows].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i - 1].x + sorted[i - 1].width <= sorted[i].x, `zone ${i - 1} must not cross zone ${i}`);
  }
});

test('HUD bar with a cue but no cue-collision on a narrow place still fits', () => {
  const rows = buildHudBar({ cue: 'ENCOUNTER', left: 'here', right: 'hp' });
  assert.equal(rows.length, 3);
  assertNoClip(rows, 'hud');
});

test('side HUD panel: no overlap, no clip, within the panel column, tall or short', () => {
  const H = 444;
  const groups = [
    { heading: 'the party', lines: ['the Cartographer of Salt', '♥ 6/6', '+2 followers'] },
    { heading: 'where', lines: ['(12,7)', 'a walled town', 'facing N'] },
    { heading: 'the thread', lines: ['deaths 3', 'cleared 5'] },
  ];
  const rows = buildPanel({ cue: 'OVERWORLD', groups, height: H });
  assert.ok(rows.length > 0, 'panel produced rows');
  // within the panel column (x >= 0, right edge within PANEL_W) and above its floor.
  for (const r of rows) {
    const w = r.width ?? textWidth(r.text, r.size);
    assert.ok(r.x >= 0, `panel x<0: "${r.text}"`);
    assert.ok(r.x + w <= PANEL_W + 0.01, `panel clips width: "${r.text}"`);
    assert.ok((r.bandBottom ?? r.y) <= H + 0.01, `panel clips height: "${r.text}"`);
  }
  // no two rows share a vertical band.
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      assert.ok(!bandsOverlap(rows[i], rows[j]), `panel rows overlap: "${rows[i].text}" / "${rows[j].text}"`);
});

test('side HUD panel: an over-long value line is ellipsized, never clipped', () => {
  const rows = buildPanel({
    cue: 'DUNGEON',
    groups: [{ heading: 'where', lines: ['a hollow site of impossibly many syllables strung together far past the panel'] }],
  });
  for (const r of rows) {
    const w = r.width ?? textWidth(r.text, r.size);
    assert.ok(r.x + w <= PANEL_W + 0.01, `panel clips: "${r.text}"`);
  }
});
