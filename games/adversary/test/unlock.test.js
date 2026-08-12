import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStage, stepStage } from '../src/sim/stage.js';
import { serializeSave, applySave, createMemoryStorage, writeSave, readSave } from '../src/sim/save.js';
import { KIT_MOVES, moveUnlocked } from '../src/sim/kit.js';

const W = 20;
const row = (() => {
  const a = Array(W).fill('.');
  a[2] = 'p'; a[8] = 'C'; a[12] = 'J'; a[16] = 'x';
  return a.join('');
})();
const DEF = { rows: ['.'.repeat(W), '.'.repeat(W), row, '#'.repeat(W)] };

function pickup(s, move) {
  return s.unlockPickups.find((u) => u.move === move);
}

test('unlock: touching a pickup grants the move and emits an unlock event', () => {
  const s = createStage(DEF, { seed: 'u' });
  assert.equal(s.unlockPickups.length, 2);
  assert.ok(!s.kit.charged);
  const charged = pickup(s, 'charged');
  s.player.x = charged.x;
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(ev.some((e) => e.type === 'unlock' && e.move === 'charged'));
  assert.ok(s.kit.charged, 'kit move unlocked');
  assert.ok(moveUnlocked(s.kit, 'charged'));
  assert.ok(charged.collected);
});

test('unlock: touching J grants doubleJump and emits unlock event', () => {
  const s = createStage(DEF, { seed: 'u-dj' });
  assert.ok(!s.kit.doubleJump);
  const dj = pickup(s, 'doubleJump');
  assert.ok(dj, 'marker J maps to doubleJump pickup');
  s.player.x = dj.x;
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(ev.some((e) => e.type === 'unlock' && e.move === 'doubleJump'));
  assert.ok(s.kit.doubleJump, 'kit.doubleJump unlocked');
  assert.ok(moveUnlocked(s.kit, 'doubleJump'));
  assert.ok(dj.collected);
});

test('unlock: granted doubleJump emits exactly one double-jump event per airborne period', () => {
  const s = createStage(DEF, { seed: 'u-dj-ev' });
  s.player.x = pickup(s, 'doubleJump').x;
  stepStage(s, { moveDir: 0 });
  assert.ok(s.kit.doubleJump);

  const groundJump = stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.equal(groundJump.filter((e) => e.type === 'double-jump').length, 0, 'ground jump is not double-jump');
  assert.ok(!s.player.onGround);

  const airJump = stepStage(s, { jumpPressed: true, jumpHeld: true });
  const dj = airJump.filter((e) => e.type === 'double-jump');
  assert.equal(dj.length, 1, 'exactly one double-jump event on second press');
  assert.equal(dj[0].x, s.player.x);
  assert.equal(dj[0].y, s.player.y);
  assert.ok(s.player.airJumpUsed);

  const third = stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.equal(third.filter((e) => e.type === 'double-jump').length, 0, 'third press emits no double-jump');
  assert.ok(s.player.airJumpUsed);
});

test('unlock: supported spawn starts grounded; first press is normal jump with air jump still available', () => {
  const s = createStage({ ...DEF, kit: { doubleJump: true } }, { seed: 'u-dj-spawn' });
  assert.equal(s.kit.doubleJump, true);
  assert.equal(s.player.onGround, true, 'supported floor spawn must start grounded');
  assert.equal(s.player.airJumpUsed, false);

  const first = stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.equal(first.filter((e) => e.type === 'double-jump').length, 0, 'first press must not emit double-jump');
  assert.equal(s.player.airJumpUsed, false, 'air jump remains available after grounded launch');
  assert.ok(!s.player.onGround);

  const air = stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.equal(air.filter((e) => e.type === 'double-jump').length, 1);
  assert.equal(s.player.airJumpUsed, true);
});

test('unlock: air-jump presentation hook survives later ticks that replace s.events', () => {
  const s = createStage({ ...DEF, kit: { doubleJump: true } }, { seed: 'u-dj-pres' });
  // Settle independently of spawn grounding so this test isolates the durable hook.
  for (let i = 0; i < 5; i++) stepStage(s, { moveDir: 0 });
  assert.ok(s.player.onGround);
  stepStage(s, { jumpPressed: true, jumpHeld: true });
  const air = stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.equal(air.filter((e) => e.type === 'double-jump').length, 1);
  assert.ok(s.airJumpPresentation);
  assert.ok(s.airJumpPresentation.serial >= 1);
  const snap = {
    serial: s.airJumpPresentation.serial,
    x: s.airJumpPresentation.x,
    y: s.airJumpPresentation.y,
  };
  assert.equal(snap.x, s.player.x);
  assert.equal(snap.y, s.player.y);

  // Catch-up empty tick replaces s.events; durable hook must remain readable for render.
  stepStage(s, { moveDir: 0 });
  assert.equal(s.events.filter((e) => e.type === 'double-jump').length, 0);
  assert.equal(s.airJumpPresentation.serial, snap.serial);
  assert.equal(s.airJumpPresentation.x, snap.x);
  assert.equal(s.airJumpPresentation.y, snap.y);
});

test('unlock: KIT_MOVES catalogues double jump with second-press input', () => {
  const mv = KIT_MOVES.find((m) => m.id === 'doubleJump');
  assert.ok(mv, 'doubleJump in catalogue');
  assert.equal(mv.name, 'double jump');
  assert.equal(mv.input, 'in air: press jump again');
  assert.ok(!mv.base, 'item-granted, not base');
});

test('unlock: a collected move is not re-collected', () => {
  const s = createStage(DEF, { seed: 'u2' });
  s.player.x = pickup(s, 'charged').x;
  stepStage(s, { moveDir: 0 });
  const ev = stepStage(s, { moveDir: 0 }); // still overlapping
  assert.ok(!ev.some((e) => e.type === 'unlock'), 'no duplicate unlock');
});

test('unlock: kit unlocks persist through save/reload', () => {
  const storage = createMemoryStorage();
  const s = createStage(DEF, { seed: 'u3' });
  s.player.x = pickup(s, 'charged').x;
  stepStage(s, { moveDir: 0 }); // unlock charged
  writeSave(storage, 'slot', serializeSave(s));

  const { save } = readSave(storage, 'slot');
  const reloaded = applySave(createStage(DEF, { seed: 'fresh' }), save);
  assert.ok(reloaded.kit.charged, 'unlock persisted');
  assert.ok(pickup(reloaded, 'charged').collected, 'pickup marked collected on reload');
});
