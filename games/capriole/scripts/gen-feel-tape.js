// gen-feel-tape.js — write the golden feel telemetry tape. Run this INTENTIONALLY
// when the signature feel is deliberately retuned (and eyeball the diff); the test
// then guards against accidental drift. Usage: node scripts/gen-feel-tape.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { generateFeelTape } from '../src/sim/feeltape.js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../test/golden');
mkdirSync(dir, { recursive: true });
const tape = generateFeelTape();
writeFileSync(resolve(dir, 'feel-tape.m1.json'), JSON.stringify(tape, null, 2) + '\n');
console.log('wrote test/golden/feel-tape.m1.json');
console.log(`  apex=${tape.apex} ratios=${tape.apexRatios} maxTilt=${tape.maxTilt} airTicks=${tape.airTicks}`);
