// file:// delivery: the single-file artifact must build, contain no ESM
// import/export statements, and boot createGame headlessly (same proof shape
// as boot-smoke.test.js — exercise the game factory without a browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSinglefile } from '../scripts/build-singlefile.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('build-singlefile emits a clean self-contained HTML artifact', () => {
  const { html, js, outPath, modules } = buildSinglefile({ write: true });
  assert.ok(existsSync(outPath), 'chapel-perilous.html must be written');
  assert.ok(modules.length >= 5, 'expected several JS modules in the graph');
  assert.ok(html.includes('<canvas'), 'artifact must include the canvas shell');
  assert.ok(html.includes('<style>'), 'CSS must be inlined');
  assert.ok(html.includes('<script>'), 'JS must be inlined');
  assert.ok(!html.includes('type="module"'), 'artifact must not use ES modules');
  assert.ok(!html.includes('src="src/main.js"'), 'artifact must not reference external modules');

  // Zero import/export statements in the bundled script body.
  assert.equal((js.match(/^\s*import\s/gm) || []).length, 0, 'no import statements');
  assert.equal((js.match(/^\s*export\s/gm) || []).length, 0, 'no export statements');
  // JSON data was inlined (at least the world master seed config).
  assert.ok(js.includes('__DATA['), 'JSON must be inlined into __DATA');
});

test('single-file bundle boots createGame headlessly', () => {
  const { js } = buildSinglefile({ write: false });
  // Run in an isolated context with a minimal globalThis (no window → no DOM boot).
  const globalThisStub = { console };
  const sandbox = {
    console,
    Math,
    Object,
    Array,
    JSON,
    Number,
    String,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    Infinity,
    NaN,
    undefined,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Error,
    TypeError,
    RangeError,
    Uint32Array,
    Int32Array,
    Float64Array,
    globalThis: globalThisStub,
  };
  globalThisStub.globalThis = globalThisStub;
  vm.runInNewContext(js, sandbox, { timeout: 5000 });
  const chp = sandbox.globalThis.__CHP;
  assert.ok(chp, 'bundle must publish globalThis.__CHP');
  assert.equal(typeof chp.createGame, 'function');
  assert.ok(chp.master, 'bundle must expose the master fixture');
  const game = chp.createGame(chp.master);
  assert.ok(game.world && game.party, 'createGame yields world + party');
  assert.equal(typeof game.party.x, 'number');
  assert.equal(game.world.passable(game.party.x, game.party.y), true);
  assert.ok(game.session && game.session.pc, 'session deals a starting PC');
  // Deterministic site description still [SEED]-marked through the bundle.
  const site = game.world.listSites()[0];
  const d = game.describeSite(site);
  assert.ok(d.startsWith('[SEED] '), `site description must be [SEED]-marked: ${d}`);
});

test('written chapel-perilous.html parses and its script has no ESM', () => {
  buildSinglefile({ write: true });
  const html = readFileSync(resolve(root, 'chapel-perilous.html'), 'utf8');
  assert.ok(/<html[\s>]/i.test(html) && /<\/html>/i.test(html), 'HTML must parse as a document');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  assert.ok(scripts.length >= 1, 'expected an inline script');
  const body = scripts.join('\n');
  assert.equal((body.match(/^\s*import\s/gm) || []).length, 0);
  assert.equal((body.match(/^\s*export\s/gm) || []).length, 0);
  assert.match(body, /__CHP/);
});
