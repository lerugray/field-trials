// Shell-scope discipline. main.js has two scopes: createGame() (the engine
// factory, whose locals are only reachable through the object it returns) and
// boot() (the shell, which binds a NAMED SUBSET of those onto its own variables).
// Referencing a createGame local bare in the shell is a guaranteed
// ReferenceError — and one no unit test can see, because it only fires when a
// real keypress reaches that line in a browser.
//
// This has cost the project twice:
//   cp-017 (2026-08-03) refreshMinimap was defined inside createGame, so EVERY
//     dungeon movement key threw for three days while movement looked done.
//   2026-08-09  three bare `mapState` references — one on every dungeon exit
//     carrying a minimap, two on the gate path — surfaced by the file:// soak
//     as 165 page errors, and fixed on the ambient-score branch.
// So it gets a structural guard rather than a third incident.
//
// The policed list below is DELIBERATELY EXPLICIT. An earlier version of this
// test parsed createGame's return object with a regex, silently matched a
// different function's `return {`, and passed while the real bug sat in the file
// — so the parsing came out and the plant test at the bottom went in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'src/main.js'), 'utf8');

// The shell scope begins at the shell's own mode variable; everything after it
// is inside boot(), not createGame().
const SHELL_ANCHOR = "let mode = 'title';";

/**
 * createGame locals that the shell does NOT bind, so the shell must reach them
 * as `game.<name>`. Only names distinctive enough that a bare textual match is
 * really this binding — common words the shell legitimately redeclares (start,
 * save, load, tick, passable, prose) are excluded on purpose.
 *
 * To refresh: compare createGame's `return { ... }` with the shell's
 * `let game, world, party, ...;` declaration. Anything returned but not declared
 * belongs here.
 */
const FACTORY_ONLY = [
  'mapState', 'bestiary', 'encounters', 'chargen', 'dungeonKit', 'services',
  'starterCaches', 'densityFor', 'milestoneCapacity', 'startTown', 'nearStart',
  'exposure', 'bumpTick', 'canEnterSite', 'sitePassable',
  'START_SAFE_RADIUS', 'START_CACHE_COUNT',
];

/** Comments are not code: strip them, or every prose mention is a false hit. */
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

/** Bare (non-`game.`-qualified) uses of `name` in a chunk of shell source. */
function bareUses(shellSrc, name) {
  const out = [];
  for (const m of shellSrc.matchAll(new RegExp(`(?<![\\w.$])${name}\\s*[.(]`, 'g'))) {
    if (shellSrc.slice(Math.max(0, m.index - 5), m.index).endsWith('game.')) continue;
    out.push(m.index);
  }
  return out;
}

test('main.js still has the two scopes this guard assumes', () => {
  assert.ok(src.includes('function createGame('), 'createGame factory present');
  assert.ok(src.includes('export function boot()'), 'boot shell present');
  const anchor = src.indexOf(SHELL_ANCHOR);
  assert.ok(anchor > 0, 'the shell anchor moved — update SHELL_ANCHOR');
  assert.ok(anchor > src.indexOf('function createGame('),
    'the anchor must sit inside the shell, after the factory');
  // Every policed name must really be absent from the shell's binding list; if
  // one gets bound there later, drop it from FACTORY_ONLY rather than leave a
  // guard that polices nothing.
  const decl = src.match(/\n {2}let (game, world, party[^;]*);/);
  assert.ok(decl, 'could not find the shell binding list — update this test');
  const bound = new Set(decl[1].split(',').map((s) => s.trim()));
  const stale = FACTORY_ONLY.filter((n) => bound.has(n));
  assert.deepEqual(stale, [], `these are now shell-bound and should leave FACTORY_ONLY: ${stale}`);
});

test('no createGame-only name is referenced bare in the shell scope', () => {
  const shellStart = src.indexOf(SHELL_ANCHOR);
  const shell = stripComments(src.slice(shellStart));
  const offenders = [];
  for (const name of FACTORY_ONLY) {
    // A shell-local declaration of the same name makes bare use legal.
    if (new RegExp(`(?:const|let|var|function)\\s+${name}\\b`).test(shell)) continue;
    for (const idx of bareUses(shell, name)) {
      const line = src.slice(0, shellStart + idx).split('\n').length;
      offenders.push(`main.js:${line} uses bare \`${name}\` — must be \`game.${name}\``);
    }
  }
  assert.deepEqual(offenders, [],
    `createGame locals referenced bare in the shell throw ReferenceError at runtime:\n  ${offenders.join('\n  ')}`);
});

test('the guard actually fires on the real 2026-08-09 defect', () => {
  // A guard that cannot fail is not a guard. Plant the exact two shapes that
  // were in the file and prove the detector sees them, then prove the corrected
  // form is clean.
  const bad = stripComments([
    "let mode = 'title';",
    '  function toOverworld() {',
    '    if (run && run.minimap) mapState.setDungeon(run.site, run.minimap);',
    '  }',
    '            mapState.knowGate(g);',
  ].join('\n'));
  assert.equal(bareUses(bad, 'mapState').length, 2, 'both planted defects must be seen');

  const good = stripComments([
    "let mode = 'title';",
    '    stashDungeonMap();',
    '            game.mapState.knowGate(g);',
  ].join('\n'));
  assert.equal(bareUses(good, 'mapState').length, 0, 'the corrected form must be clean');
});

test('comments mentioning a factory local are not treated as code', () => {
  // Two comments in main.js mention `prose` in passing, and the toOverworld fix
  // comment names `mapState` explicitly — comment stripping is load-bearing.
  const sample = [
    "let mode = 'title';",
    '  // prose (the outcome lines) and mapState.foo are only mentioned here',
    '  /* mapState.bar in a block comment too */',
    '  const x = 1;',
  ].join('\n');
  const out = stripComments(sample);
  assert.equal(bareUses(out, 'mapState').length, 0, 'commented code must be stripped before scanning');
  assert.ok(out.includes('const x = 1;'), 'and real code must survive');
});
