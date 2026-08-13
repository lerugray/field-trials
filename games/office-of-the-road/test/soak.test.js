// Acceptance-harness integrity (audit finding 3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { acceptanceFindings, freshVerbLedger, SOAK_VERBS } from '../src/soak.js';

test('verb accounting is per expedition, not accumulated across runs', () => {
  const first = freshVerbLedger();
  const second = freshVerbLedger();
  first.cardPlay = true;
  for (const verb of SOAK_VERBS) second[verb] = verb !== 'cardPlay';
  const findings = acceptanceFindings([{ verbs: first }, { verbs: second }], { maxPassiveSec: 0, interventionsPerMin: 10 });
  assert.ok(findings.some((f) => f.sev === 'BLOCKER' && f.text.includes('expedition 1') && f.text.includes('jobChange')));
  assert.ok(findings.some((f) => f.sev === 'BLOCKER' && f.text.includes('expedition 2') && f.text.includes('cardPlay')));
});

test('an interventions-per-minute floor breach is a BLOCKER', () => {
  const verbs = freshVerbLedger();
  for (const verb of SOAK_VERBS) verbs[verb] = true;
  const findings = acceptanceFindings([{ verbs }], { maxPassiveSec: 2, interventionsPerMin: 2.5 });
  assert.deepEqual(findings, [{ sev: 'BLOCKER', text: 'interventions/min 2.5 below 3' }]);
});

test('a fully-mutated expedition with healthy watch/act metrics has no blockers', () => {
  const verbs = freshVerbLedger();
  for (const verb of SOAK_VERBS) verbs[verb] = true;
  assert.deepEqual(acceptanceFindings([{ verbs }], { maxPassiveSec: 24.9, interventionsPerMin: 3 }), []);
});

test('browser soak reloads the document and never calls the combat debug fast-forward', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, '../src/soak.js'), 'utf8');
  assert.match(source, /win\.location\.reload\(\)/);
  assert.doesNotMatch(source, /\.advanceCombat\s*\(/);
  assert.match(source, /Normal rAF is intentionally allowed to call tickCombat/);
});
