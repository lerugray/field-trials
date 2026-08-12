// node --test — the FEEL GATE regression (verification fold). Re-generates the
// telemetry tape and asserts it matches the committed golden within tolerance, so
// any accidental change to the signature feel (apex heights, hang, tilt curve)
// across future milestones is caught. Regenerate deliberately with
// `node scripts/gen-feel-tape.js` when the feel is intentionally retuned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { generateFeelTape } from '../src/sim/feeltape.js';
import { tuning } from '../src/sim/tuning.js';

const golden = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'golden/feel-tape.m1.json'), 'utf8'));

test('feel tape matches the golden within tolerance (regression guard)', () => {
  const tape = generateFeelTape();
  // Apex heights (wu) — the geometric escalation must hold tick-for-tick.
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(tape.apex[i] - golden.apex[i]) < 0.05, `apex[${i}] ${tape.apex[i]} ~ ${golden.apex[i]}`);
  }
  assert.ok(Math.abs(tape.apexRatios[0] - golden.apexRatios[0]) < 0.02, 'ratio jump2/jump1 stable');
  assert.ok(Math.abs(tape.apexRatios[1] - golden.apexRatios[1]) < 0.02, 'ratio jump3/jump1 stable');
  assert.ok(Math.abs(tape.maxTilt - golden.maxTilt) < 0.2, `maxTilt ${tape.maxTilt} ~ ${golden.maxTilt}`);
  assert.equal(tape.tiltCurve.length, golden.tiltCurve.length, 'tilt curve sample count stable');
  for (let i = 0; i < golden.tiltCurve.length; i++) {
    assert.ok(Math.abs(tape.tiltCurve[i] - golden.tiltCurve[i]) < 0.3, `tiltCurve[${i}] drift`);
  }
});

test('the golden itself honors the signature-feel LAW (not just self-consistent)', () => {
  // Belt-and-suspenders: the tape encodes the seed's ratios and max tilt, so a bad
  // golden can never silently pass the regression test above.
  assert.ok(Math.abs(golden.apexRatios[0] - 1.5) < 0.1, 'jump2 ≈ 1.5× H (law)');
  assert.ok(Math.abs(golden.apexRatios[1] - 2.2) < 0.15, 'jump3 ≈ 2.2× H (law)');
  assert.ok(Math.abs(golden.maxTilt - tuning.camera.tiltMaxDeg) < 0.5, 'peak tilt ≈ tiltMaxDeg (law)');
  assert.ok(golden.apex[0] < golden.apex[1] && golden.apex[1] < golden.apex[2], 'strictly escalating');
});
