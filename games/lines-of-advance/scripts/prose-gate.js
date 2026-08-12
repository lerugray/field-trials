// Mechanical half of the M6 Hammerstein register and no-overclaim pass.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(root, 'src');
const sourceFiles = readdirSync(sourceDir)
  .filter(name => ['.js', '.css'].includes(extname(name)))
  .map(name => resolve(sourceDir, name));
const files = [
  ...sourceFiles,
  resolve(root, 'scripts', 'build.js'),
  resolve(root, 'package.json'),
  resolve(root, 'dist', 'index.html')
];

const forbiddenBranding = /Debord|Becker[- ]?Ho|Situationist|Le Jeu de la Guerre|A Game of War|Game of War/iu;
const overclaims = /\b(?:official|definitive|complete|authentic|authorized|faithful|Stockfish)\b/iu;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /\u2014/u, `em dash found in ${file}`);
  assert.doesNotMatch(text, forbiddenBranding, `name-trading term found in ${file}`);
  assert.doesNotMatch(text, overclaims, `overclaim term found in ${file}`);
}

console.log(`Prose gate passed across ${files.length} source and package files.`);
