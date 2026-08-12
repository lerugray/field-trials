import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_KEYMAP } from './engine/focus.js';
import { cursorCss, verbLabel } from './main.js';
import { HOTSPOT_KINDS } from './engine/scene.js';
import { DEFAULT_SETTINGS } from './engine/settings.js';

// M7 POINT-AND-CLICK TABLE-STAKES AUDIT. The genre-completeness gate: these affordances
// must all exist in the shipped game. This test is the checklist, kept honest by code.

const ROOT = dirname(fileURLToPath(import.meta.url));
const mainSrc = readFileSync(join(ROOT, 'main.js'), 'utf8');

test('full keyboard path: cycle + select are bound (mouse is not required)', () => {
  const actions = new Set(Object.values(DEFAULT_KEYMAP));
  assert.ok(actions.has('focus-next') && actions.has('focus-prev'), 'hotspot cycling');
  assert.ok(actions.has('select'), 'keyboard select');
});

test('verb feedback: every hotspot kind maps to a distinct cursor AND a word label', () => {
  const cursors = new Set();
  for (const k of HOTSPOT_KINDS) {
    cursors.add(cursorCss(k));
    assert.ok(verbLabel(k).length > 0, `verb ${k} has no word label (colorblind floor)`);
  }
  assert.equal(cursors.size, HOTSPOT_KINDS.length, 'each verb needs a distinct cursor');
});

test('no real-time pressure: the game uses no interval/animation game-clock', () => {
  // rAF is used for PAINT only; there must be no setInterval driving game logic.
  assert.ok(!/setInterval\s*\(/.test(mainSrc), 'found a setInterval (no-timers law)');
});

test('named access points ship: notebook, accuse, save, load, restart, options, music', () => {
  for (const label of ['Notebook (n)', 'Accuse', 'Save', 'Load', 'Restart Case', 'Options', 'Music']) {
    assert.ok(mainSrc.includes(`'${label}'`) || mainSrc.includes(label), `missing access point: ${label}`);
  }
});

test('accessibility floor: text size, dyslexia font, reduced motion, photosensitivity', () => {
  for (const k of ['textScale', 'dyslexiaFont', 'reducedMotion', 'photosensitivitySafe']) {
    assert.ok(k in DEFAULT_SETTINGS, `missing accessibility setting: ${k}`);
  }
});

test('the shipped single-file build carries the access points and no external refs', () => {
  const dist = join(ROOT, '..', 'dist', 'shoeleather.html');
  const html = readFileSync(dist, 'utf8');
  assert.ok(!/src="\.\/src/.test(html), 'build references external src');
  for (const label of ['Notebook', 'Accuse', 'Options', 'Restart Case']) {
    assert.ok(html.includes(label), `built file missing ${label}`);
  }
});
