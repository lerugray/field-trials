import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The single-file build (hard rule 10) is what the operator actually opens, and
// scripts/build.js is a small hand-rolled bundler with a stated contract: named or
// namespace imports only, no default exports, no `export { ... }` re-export blocks.
//
// It does not enforce that contract — it just quietly produces a wrong bundle. On
// 2026-08-07 a `export { MOUSE_SENS_MIN, MOUSE_SENS_MAX, MOUSE_SENS_STEP };` line in
// settings.js dropped all three constants from the bundle: `node --test` stayed green
// because Node runs real ESM, and the built game got `undefined` for the mouse
// sensitivity range — a dead slider and a NaN step, on the exact setting the change
// existed to fix. Caught by reading the DOM of the built page, which is not a habit
// anything can rely on. So the contract is a test now.

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');
const root = path.join(here, '..');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const FILES = walk(srcDir).map((p) => [path.relative(srcDir, p), fs.readFileSync(p, 'utf8')]);

test('src is non-empty (a passing scan of nothing proves nothing)', () => {
  assert.ok(FILES.length > 30, `only found ${FILES.length} source files`);
});

test('no `export { ... }` re-export blocks — the bundler drops them silently', () => {
  for (const [rel, code] of FILES) {
    const m = code.match(/^export\s*\{/m);
    assert.ok(!m, `${rel} uses an \`export { ... }\` block; declare \`export const\` aliases instead`);
  }
});

test('no aliased imports — the bundler rewrites imports as destructuring', () => {
  // `import { A as B }` becomes `const { A as B } = mod`, which is a syntax error.
  for (const [rel, code] of FILES) {
    const re = /^import\s+\{([^}]*)\}/gm;
    let m;
    while ((m = re.exec(code)) !== null) {
      assert.ok(!/\bas\b/.test(m[1]), `${rel} aliases a named import (\`${m[1].trim()}\`)`);
    }
  }
});

test('no default exports — the bundler only carries named ones', () => {
  for (const [rel, code] of FILES) {
    assert.ok(!/^export\s+default\b/m.test(code), `${rel} has a default export`);
  }
});

// The one that actually catches the class: every name a module imports must be a name
// the target module really exports, as the BUNDLER sees exports — i.e. only
// `export function|const|let|var|class` declarations count.
test('every named import resolves to something the bundler will export', () => {
  const EXPORT_DECL = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
  const IMPORT = /^import\s+(?:\*\s+as\s+\w+|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/gm;
  const exportsOf = new Map();
  for (const [rel, code] of FILES) {
    const names = new Set();
    let m; EXPORT_DECL.lastIndex = 0;
    while ((m = EXPORT_DECL.exec(code)) !== null) names.add(m[1]);
    exportsOf.set(rel, names);
  }
  const problems = [];
  for (const [rel, code] of FILES) {
    let m; IMPORT.lastIndex = 0;
    while ((m = IMPORT.exec(code)) !== null) {
      if (!m[1]) continue; // namespace import
      const target = path.relative(srcDir, path.resolve(path.dirname(path.join(srcDir, rel)), m[2]));
      const have = exportsOf.get(target);
      if (!have) { problems.push(`${rel} imports from ${m[2]}, which is not in src/`); continue; }
      for (const raw of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!have.has(raw)) problems.push(`${rel} imports { ${raw} } from ${m[2]}, which the bundle will not export it`);
      }
    }
  }
  assert.deepEqual(problems, [], 'unresolvable imports:\n  ' + problems.join('\n  '));
});

test('the built single-file page carries every module and boots', () => {
  const dist = path.join(root, 'dist', 'stray-squadron.html');
  assert.ok(fs.existsSync(dist), 'dist/stray-squadron.html is missing — run node scripts/build.js');
  const html = fs.readFileSync(dist, 'utf8');
  // no unresolved module syntax survived into the bundle
  assert.ok(!/^\s*import\s/m.test(html), 'an import statement leaked into the bundle');
  assert.ok(!/^\s*export\s/m.test(html), 'an export statement leaked into the bundle');
  assert.ok(html.includes('boot()'), 'the bundle never calls boot()');
});

test('the built page carries the complete OG and Twitter share-card metadata', () => {
  const html = fs.readFileSync(path.join(root, 'dist', 'stray-squadron.html'), 'utf8');
  const description = 'A browser-native rail shooter with short seeded runs, a branching sector map, and a permanent flight log.';
  const tags = [
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Stray Squadron" />',
    '<meta property="og:title" content="Stray Squadron" />',
    `<meta property="og:description" content="${description}" />`,
    '<meta property="og:url" content="https://ss-preview.pages.dev/" />',
    '<meta property="og:image" content="https://ss-preview.pages.dev/og.png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="Stray Squadron" />',
    `<meta name="twitter:description" content="${description}" />`,
    '<meta name="twitter:image" content="https://ss-preview.pages.dev/og.png" />',
  ];

  for (const tag of tags) assert.ok(html.includes(tag), `built page is missing ${tag}`);
  assert.ok(!/<meta[^>]+(?:og:image|twitter:image)[^>]+content=["']data:/i.test(html),
    'share-card image must be an absolute https URL, not a data URI');
  assert.ok(/<meta property="og:image" content="https:\/\//.test(html),
    'og:image must be ABSOLUTE - Facebook ignores relative share-image URLs');
});

test('the built page embeds exactly the shipped music and no relative music URL', () => {
  const musicDir = path.join(root, 'assets', 'music');
  const shipped = fs.readdirSync(musicDir)
    .filter((name) => name.endsWith('.ogg'))
    .sort();
  const html = fs.readFileSync(path.join(root, 'dist', 'stray-squadron.html'), 'utf8');
  const match = html.match(/const MUSIC_SOURCES = (\{[^\n]*\});/);

  assert.ok(match, 'built runtime has no MUSIC_SOURCES mapping');
  const sources = JSON.parse(match[1]);
  assert.deepEqual(Object.keys(sources), shipped, 'embedded filenames are not deterministic/shipped-only');
  for (const name of shipped) {
    const expected = 'data:audio/ogg;base64,' + fs.readFileSync(path.join(musicDir, name)).toString('base64');
    assert.equal(sources[name], expected, `${name} is not embedded exactly`);
  }
  assert.ok(!html.includes('../assets/music/'), 'relative music asset reference survived the build');
  assert.equal(sources['ss-title-theme.ogg'], undefined, 'pending title track became loadable');
});
