// The M9 genre-completeness audit, as a regression. DESIGN-SEED M9 demands "no
// silent gaps": every rail-shooter table stake is either built (and points at real
// code) or deferred with a named reason. This test keeps docs/AUDIT-M9.md's manifest
// honest — if a "built" feature's module is deleted or renamed, or a deferral loses
// its reason, the audit goes red instead of silently lying.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  GENRE_STAKES,
  auditManifest,
  builtStakes,
  deferredStakes,
  referencedModules,
} from '../src/audit/genre.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('manifest is well-formed: every stake built-with-modules or deferred-with-reason', () => {
  assert.deepEqual(auditManifest(), [], 'manifest has silent gaps or malformed stakes');
});

test('every built stake points at module files that actually exist on disk', () => {
  const missing = referencedModules().filter((m) => !existsSync(resolve(repoRoot, m)));
  assert.deepEqual(missing, [], `built stakes reference missing modules: ${missing.join(', ')}`);
});

test('every deferred stake carries a plain-words reason and a milestone/cut', () => {
  for (const s of deferredStakes()) {
    assert.ok(s.reason && s.reason.length > 20, `${s.id}: deferral reason too thin`);
    assert.ok(s.milestone, `${s.id}: deferral names no milestone/cut`);
  }
});

test('the audit covers the whole build: the M2..M8 marquee features are all present and built', () => {
  // A guard that the manifest cannot quietly drop a shipped headline feature.
  const marquee = [
    'rail-flight', 'charge-lock-on', 'barrel-roll', 'enemy-waves',
    'encounter-grammar', 'route-map', 'score-medals', 'hub-economy',
    'flight-log', 'memorial-cast', 'wingmates', 'loadout-choice', 'boss',
  ];
  const built = new Set(builtStakes().map((s) => s.id));
  const gaps = marquee.filter((id) => !built.has(id));
  assert.deepEqual(gaps, [], `marquee features missing/deferred: ${gaps.join(', ')}`);
});

test('the M9 deliverables themselves are in the manifest as built', () => {
  const built = new Set(builtStakes().map((s) => s.id));
  for (const id of ['input-remap', 'legibility-floor', 'music-bed', 'assist-basics']) {
    assert.ok(built.has(id), `M9 deliverable ${id} not marked built`);
  }
});

test('no stake is silently absent: the manifest is non-trivial', () => {
  assert.ok(GENRE_STAKES.length >= 25, 'manifest suspiciously short');
  assert.ok(deferredStakes().length >= 4, 'expected the named cuts to be enumerated');
});
