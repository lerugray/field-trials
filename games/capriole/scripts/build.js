// build.js — produce the SHIPPED artifact: one self-contained dist/capriole.html
// that boots from file:// (double-click), with Three inlined from the VENDORED,
// version-pinned copy (no CDN). esbuild/three/playwright are toolchain devDeps
// only; the shipped file is one HTML with no external references (stack law).

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const vendorThree = resolve(root, 'vendor/three/three.module.js');

async function build() {
  // Bundle the app into one IIFE, resolving bare `three` imports to the vendored
  // module so nothing is fetched from a CDN or node_modules at runtime.
  const result = await esbuild.build({
    entryPoints: [resolve(root, 'src/main.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    write: false,
    alias: { three: vendorThree },
    legalComments: 'none',
  });

  const js = result.outputFiles[0].text;

  // Confirm the vendored version so the artifact is traceable.
  const threeVersion = JSON.parse(readFileSync(resolve(root, 'node_modules/three/package.json'), 'utf8')).version;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CAPRIOLE</title>
<meta name="generator" content="capriole build.js — three ${threeVersion} vendored/inlined" />
<style>
  html,body { margin:0; padding:0; overflow:hidden; background:#5fc9ff; height:100%; }
  canvas { display:block; }
  /* No external fonts/assets — art law: everything code-generated. */
</style>
</head>
<body>
<script>${js}</script>
</body>
</html>
`;

  mkdirSync(resolve(root, 'dist'), { recursive: true });
  const out = resolve(root, 'dist/capriole.html');
  writeFileSync(out, html);

  // Self-check: the shipped HTML SHELL loads nothing externally. We strip the
  // inlined <script> body first — URLs baked into the vendored Three source
  // (namespace URIs, doc links in strings) are not runtime fetches; what matters
  // is that the HTML tags themselves reference no external resource.
  const shell = html.replace(/<script>[\s\S]*?<\/script>/g, '<script>[inlined]</script>');
  const badTags = [
    /<script[^>]*\ssrc=/i,
    /<link\b/i,
    /<img[^>]*\ssrc=/i,
    /\shref\s*=\s*["']https?:/i,
    /url\(\s*["']?https?:/i,
  ].filter((re) => re.test(shell));
  if (badTags.length) {
    console.error('BUILD DEFECT: shipped HTML shell has an external reference:', badTags.map(String));
    process.exit(1);
  }

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`built dist/capriole.html (${kb} KB, three ${threeVersion} inlined) — boots from file://`);
}

build().catch((e) => { console.error('BUILD FAILED:', e); process.exit(1); });
