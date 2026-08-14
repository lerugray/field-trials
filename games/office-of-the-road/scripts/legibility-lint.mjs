#!/usr/bin/env node
// GATE 7c — THE LEGIBILITY LINT (docs/design/LEGIBILITY-LAW-2026-08-14.md §3.2).
//
// The law: every number, token and abbreviation rendered on any surface must be
// self-explanatory at the point of reading, to a first-session player, with no
// manual and no memory. Most of that is a judgement call and stays with the
// audit + the looker + Ray's eye. THESE four shapes are not judgement calls —
// they are the founding violations, and this gate makes them unable to regress:
//
//   1. single-letter + digit fusions   a19  d7  m4  L4   (the founding one)
//   2. bare at-tokens                  @30
//   3. parenthesized single letters    (M)  (E)
//   4. bare X/Y with no anchor         30/120
//
// It reads runs/rendered-text.json — the dump scripts/layout-gate-probe.py
// already extracts from live frames — so it lints what the game DREW, not what
// the catalog declares, and costs no second browser run.
//
//   node scripts/layout-gate.mjs && node scripts/legibility-lint.mjs
//
// The allowlist below is seeded from the audit's OK/borderline list
// (docs/design/LEGIBILITY-AUDIT-2026-08-14.md). Every entry names WHY the token
// is readable, because an unexplained exemption is how this law rots.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DUMP = resolve(ROOT, 'runs/rendered-text.json');
const DIST = resolve(ROOT, 'dist/office-of-the-road.html');

/**
 * The violation shapes. Each returns the matched tokens in a drawn string.
 * `g` flags are deliberate: one string may carry several (`a19 d7 m4`).
 */
export const RULES = [
  {
    id: 'letter-digit-fusion',
    // A lone letter welded to a figure. Not `Lv3` (two letters), not `4x`
    // (figure first), not `#3` (no letter) — one letter, then digits, alone.
    re: /(?<![A-Za-z0-9])[A-Za-z]\d+(?![A-Za-z])/g,
    why: 'a single letter fused to a figure names nothing (a19 / d7 / L4)',
  },
  {
    id: 'at-token',
    re: /@\s*\d/g,
    why: 'an at-sign is not a word; write what the figure counts (filed at tick 30)',
  },
  {
    id: 'parenthesized-letter',
    re: /\((?:[A-Za-z])\)/g,
    why: 'a lettered parenthetical is a keystroke sigil; spell the affordance',
  },
  {
    id: 'bare-ratio',
    re: /(?<![A-Za-z0-9.])\d+\s*\/\s*\d+(?![\d.])/g,
    why: 'X/Y floating free reads as nothing; anchor it to the word it counts',
  },
];

/** The words that can anchor an X/Y. Each names what the ratio is counting. */
const ANCHOR = /(^|[^A-Za-z])(hp|pace|page)\s*$/i;

/**
 * THE ALLOWLIST — the audit's OK/borderline list, made mechanical. A match is
 * cleared only when an entry claims it AND says why.
 */
export const ALLOW = [
  {
    rule: 'bare-ratio',
    // The anchor must sit IMMEDIATELY before the ratio. `LEG 0 · 6/120` is NOT
    // anchored: the word there names the 0, and the ratio is still floating.
    test: (t, m) => ANCHOR.test(t.text.slice(0, m.index)),
    why: 'word-anchored X/Y — the word immediately before it says what the ratio counts',
  },
  {
    rule: 'bare-ratio',
    // A two-colour line ("hp" in the caption role, the figure in the accent) is
    // two draw calls, so the label lands in the PREVIOUS event of the same
    // block. That is still a label at the point of reading — it is one line on
    // screen — so the anchor is looked for there too, and nowhere else.
    test: (t, m, prev) => m.index === 0 && !!prev && prev.stack === t.stack && ANCHOR.test(String(prev.text)),
    why: 'the label is the preceding draw of the same block — one line, two inks',
  },
  {
    rule: 'bare-ratio',
    test: (t) => t.stack === 'hp-figure',
    why: 'the figure annotating the hp bar it is drawn on (audit OK-list)',
  },
];

export function auditEntry(entry, prev) {
  const hits = [];
  let allowed = 0;
  const text = String(entry.text);
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      if (ALLOW.some((a) => a.rule === rule.id && a.test(entry, m, prev))) { allowed++; continue; }
      hits.push({ rule: rule.id, token: m[0], why: rule.why });
    }
  }
  return { hits, allowed };
}

function main() {
  if (!existsSync(DUMP)) {
    console.error('LEGIBILITY LINT FAILED: no rendered-text dump at runs/rendered-text.json');
    console.error('  run scripts/layout-gate.mjs first (it writes the dump this lint reads)');
    process.exit(1);
  }
  if (existsSync(DIST) && statSync(DUMP).mtimeMs < statSync(DIST).mtimeMs) {
    console.error('LEGIBILITY LINT FAILED: rendered-text dump is older than the build it should describe');
    console.error('  re-run scripts/layout-gate.mjs to re-extract it');
    process.exit(1);
  }

  const dump = JSON.parse(readFileSync(DUMP, 'utf8'));
  const failures = [];
  let strings = 0;
  let cleared = 0;
  for (const [state, entries] of Object.entries(dump)) {
    entries.forEach((entry, i) => {
      strings++;
      const { hits, allowed } = auditEntry(entry, i > 0 ? entries[i - 1] : null);
      cleared += allowed;
      for (const h of hits) failures.push({ state, ...h, text: entry.text, stack: entry.stack || null });
    });
  }

  const states = Object.keys(dump).length;
  if (failures.length) {
    console.error('LEGIBILITY LINT FAILED');
    for (const f of failures) console.error('  -', JSON.stringify(f));
    const byRule = {};
    for (const f of failures) byRule[f.rule] = (byRule[f.rule] | 0) + 1;
    console.error(`  states: ${states} · drawn strings: ${strings} · violations: ${failures.length}`);
    console.error(`  by shape: ${JSON.stringify(byRule)}`);
    process.exit(1);
  }

  console.log('  legibility lint: '
    + `${states} states · ${strings} drawn strings · 0 violations `
    + `(${RULES.length} shapes, ${cleared} allowlisted by context)`);
  process.exit(0);
}

// Only run the gate when invoked as a script; test/legibility-lint.test.js
// imports the rules to prove they still catch the audit's founding shapes.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
