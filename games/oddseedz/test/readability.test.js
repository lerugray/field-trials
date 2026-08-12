import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE, normColor } from '../src/render/palette.js';

// M9.1 directive item 1 — the NON-CIRCULAR readability hard rule. The old test
// walked a hand-authored PAIRS table and could never fail against reality. This
// one parses the ACTUAL shipped CSS in index.html: it resolves the :root custom
// properties, extracts every declaration whose property is exactly `color` (the
// only property that paints text — border-color/background-color/box-shadow are
// excluded), and asserts each resolved text colour is one of the sanctioned
// register text colours. A screen that picks up an off-register text hue fails
// here. (Inline styles: the UI only ever sets `border-color` inline — decorative
// rarity frames — never a text colour, so CSS is the whole text-colour surface.)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

// The sanctioned TEXT colours (directive item 1): warm-white on navy, dark-navy
// on light, white on the header band, plus the three accents as foreground
// punctuation. Everything else is off-register when used to paint text.
const SANCTIONED = new Set(
  [
    PALETTE.navyText, // #F4F0E2 warm-white
    PALETTE.beigeText, // #1E2A4A dark navy
    PALETTE.headerText, // #FFFFFF white
    PALETTE.accentOrange, // #E88C3A
    PALETTE.accentGold, // #F0C060
    PALETTE.accentRed, // #C04040
    'white', // named equivalent of headerText, if ever used
  ].map(normColor),
);

// The three off-register hues M9.1 banished; the test must fail if any returns.
const BANISHED = ['#1e6a2a', '#8a6018', '#ffb0a0'];

function styleBlock(html) {
  const m = html.match(/<style>([\s\S]*?)<\/style>/i);
  assert.ok(m, 'index.html must have a <style> block');
  return m[1];
}

// Parse the :root custom-property table into a name -> value map.
function rootVars(css) {
  const rootM = css.match(/:root\s*\{([\s\S]*?)\}/);
  assert.ok(rootM, ':root variable block not found');
  const vars = {};
  for (const m of rootM[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

// Resolve a CSS colour value (a var() reference or a literal) to a normalized
// colour, following var() chains.
function resolveColor(val, vars, depth = 0) {
  const v = String(val).trim();
  const varM = v.match(/^var\((--[\w-]+)\)$/);
  if (varM && depth < 8) {
    const ref = vars[varM[1]];
    assert.ok(ref != null, `unknown custom property ${varM[1]}`);
    return resolveColor(ref, vars, depth + 1);
  }
  return normColor(v);
}

// Every declaration whose property is EXACTLY `color` (a preceding '-' would make
// it border-color/background-color/etc, which never paint text).
function textColorDeclarations(css) {
  const out = [];
  for (const m of css.matchAll(/(^|[;{]|\s)color\s*:\s*([^;}]+)/g)) {
    out.push(m[2].trim());
  }
  return out;
}

test('the property matcher excludes *-color declarations', () => {
  const decls = textColorDeclarations(
    '.a{ color: red; border-color: blue; background-color: green; text-decoration-color: pink }',
  );
  assert.deepEqual(decls, ['red']);
});

test('every text colour in the shipped CSS is a sanctioned register colour', () => {
  const css = styleBlock(HTML);
  const vars = rootVars(css);
  const decls = textColorDeclarations(css);
  assert.ok(decls.length > 10, 'expected many text-colour declarations to check');
  const offenders = [];
  for (const raw of decls) {
    const resolved = resolveColor(raw, vars);
    if (!SANCTIONED.has(resolved)) offenders.push(`${raw} -> ${resolved}`);
  }
  assert.deepEqual(offenders, [], `off-register text colours found: ${offenders.join(', ')}`);
});

test('none of the seven banished hues survive as a text colour', () => {
  const css = styleBlock(HTML);
  const vars = rootVars(css);
  const resolved = textColorDeclarations(css).map((d) => resolveColor(d, vars));
  for (const bad of BANISHED) {
    assert.ok(!resolved.includes(bad), `banished hue ${bad} is back as a text colour`);
  }
});

// Negative proof (directive: "prove once by a negative fixture"): the very same
// checker MUST flag a reintroduced banished hue. If a future edit put
// `color: #1E6A2A` back, this is the assertion that would catch it.
test('the checker flags a reintroduced banished hue (negative fixture)', () => {
  const fixture = '.regression { color: #1E6A2A; }';
  const vars = rootVars(styleBlock(HTML));
  const resolved = textColorDeclarations(fixture).map((d) => resolveColor(d, vars));
  assert.equal(resolved.length, 1);
  assert.ok(!SANCTIONED.has(resolved[0]), 'sanctioned set must reject the banished green');
  assert.ok(BANISHED.includes(resolved[0]));
});

test('sanctioned set rejects each banished hue by construction', () => {
  for (const bad of BANISHED) assert.ok(!SANCTIONED.has(bad));
});
