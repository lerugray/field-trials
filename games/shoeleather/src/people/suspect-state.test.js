import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SuspectState, POSTURES } from './suspect-state.js';

test('begins fully tolerant and open', () => {
  const s = new SuspectState({ maxTolerance: 3 });
  assert.equal(s.tolerance, 3);
  assert.equal(s.posture(), 'open');
  assert.equal(s.hardened, false);
});

test('hardening drains tolerance and stiffens posture', () => {
  const s = new SuspectState({ maxTolerance: 4 });
  s.harden(); // 3/4
  assert.equal(s.posture(), 'guarded');
  s.harden(); // 2/4
  assert.equal(s.posture(), 'defensive');
  s.harden(); s.harden(); // 0/4
  assert.equal(s.posture(), 'hostile');
  assert.equal(s.hardened, true);
  s.harden(); // clamped
  assert.equal(s.tolerance, 0);
});

test('posture stages are all in POSTURES', () => {
  const s = new SuspectState({ maxTolerance: 4 });
  const seen = new Set();
  for (let i = 0; i <= 4; i++) { seen.add(s.posture()); s.harden(); }
  for (const p of seen) assert.ok(POSTURES.includes(p));
});

test('visits count and reset per-visit hardening', () => {
  const s = new SuspectState();
  s.beginVisit(); s.harden();
  assert.equal(s.hardenedThisVisit, 1);
  s.beginVisit();
  assert.equal(s.hardenedThisVisit, 0);
  assert.equal(s.visitCount, 2);
});

test('relaxation recovers tolerance only after enough turns away', () => {
  const s = new SuspectState({ maxTolerance: 3 });
  s.harden(); s.harden(); // tolerance 1
  s.leave(10);
  assert.equal(s.relaxIfDue(11, 3), 0); // only 1 turn away, not due
  assert.equal(s.tolerance, 1);
  assert.equal(s.relaxIfDue(13, 3), 1); // 3 turns away, recovers 1
  assert.equal(s.tolerance, 2);
});

test('relaxation does not exceed maxTolerance', () => {
  const s = new SuspectState({ maxTolerance: 2 });
  s.leave(0);
  assert.equal(s.relaxIfDue(100, 3, 5), 0); // already full
});

test('challenged statements are tracked', () => {
  const s = new SuspectState();
  s.markChallenged('s1');
  assert.ok(s.hasChallenged('s1'));
  assert.ok(!s.hasChallenged('s2'));
});

test('afterthought arms and disarms', () => {
  const s = new SuspectState();
  assert.equal(s.afterthoughtArmed, false);
  s.armAfterthought();
  assert.equal(s.afterthoughtArmed, true);
  s.disarmAfterthought();
  assert.equal(s.afterthoughtArmed, false);
});

test('round-trips through JSON', () => {
  const s = new SuspectState({ maxTolerance: 3 });
  s.beginVisit(); s.harden(); s.markSeen('n1'); s.markChallenged('s1'); s.leave(7);
  const s2 = SuspectState.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(s2.tolerance, 2);
  assert.equal(s2.visitCount, 1);
  assert.ok(s2.isSeen('n1'));
  assert.ok(s2.hasChallenged('s1'));
  assert.equal(s2.leftAtTick, 7);
});
