// node --test — determinism lint (verification fold): the sim must contain no
// wall-clock / nondeterministic sources. Seeded named RNG streams ONLY; no
// Math.random, Date.now, performance.now, or `new Date()` anywhere under src/sim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const simDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/sim');

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const FORBIDDEN = [
  { re: /\bMath\.random\b/, why: 'Math.random — use a named RNG stream' },
  { re: /\bDate\.now\b/, why: 'Date.now — sim must not read wall clock' },
  { re: /\bperformance\.now\b/, why: 'performance.now — sim must not read wall clock' },
  { re: /\bnew Date\b/, why: 'new Date — sim must not read wall clock' },
];

test('src/sim contains no nondeterministic sources', () => {
  const violations = [];
  for (const file of jsFiles(simDir)) {
    // Strip line comments so a mention in prose does not trip the lint.
    const code = readFileSync(file, 'utf8').replace(/\/\/[^\n]*/g, '');
    for (const f of FORBIDDEN) {
      if (f.re.test(code)) violations.push(`${file}: ${f.why}`);
    }
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});
