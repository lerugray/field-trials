import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKit, decideMelee, CHARGED_MULT, DOWNTHRUST_MULT } from '../src/sim/kit.js';
import { FEEL } from '../src/config/feel.js';
import { createStage, stepStage } from '../src/sim/stage.js';

test('kit: base press is a normal swing regardless of unlocks', () => {
  const kit = createKit();
  const charge = { ticks: 0 };
  const r = decideMelee({ attackPressed: true }, { onGround: true }, kit, charge);
  assert.equal(r.type, 'normal');
  assert.equal(r.mul, 1);
});

test('kit: charged strike fires on release after a full hold (unlocked)', () => {
  const kit = createKit({ charged: true });
  const charge = { ticks: 0 };
  // Press + hold to full.
  decideMelee({ attackPressed: true, attackDown: true }, { onGround: true }, kit, charge);
  for (let i = 0; i < FEEL.CHARGE_FULL_TICKS; i++) {
    decideMelee({ attackDown: true }, { onGround: true }, kit, charge);
  }
  assert.equal(charge.ticks, FEEL.CHARGE_FULL_TICKS);
  // Release → charged.
  const r = decideMelee({ attackDown: false }, { onGround: true }, kit, charge);
  assert.equal(r.type, 'charged');
  assert.equal(r.mul, CHARGED_MULT);
  assert.equal(charge.ticks, 0, 'meter resets');
});

test('kit: a short hold releases no charged strike', () => {
  const kit = createKit({ charged: true });
  const charge = { ticks: 0 };
  decideMelee({ attackPressed: true, attackDown: true }, { onGround: true }, kit, charge);
  const r = decideMelee({ attackDown: false }, { onGround: true }, kit, charge); // released early
  assert.equal(r, null);
});

test('kit: charged is inert until unlocked', () => {
  const kit = createKit(); // locked
  const charge = { ticks: 0 };
  for (let i = 0; i < FEEL.CHARGE_FULL_TICKS + 2; i++) decideMelee({ attackDown: true }, { onGround: true }, kit, charge);
  assert.equal(charge.ticks, 0, 'no charge builds while locked');
  assert.equal(decideMelee({ attackDown: false }, { onGround: true }, kit, charge), null);
});

test('kit: downthrust needs air + down + press + unlock', () => {
  const kit = createKit({ downthrust: true });
  const charge = { ticks: 0 };
  // grounded → normal
  assert.equal(decideMelee({ attackPressed: true, down: true }, { onGround: true }, kit, charge).type, 'normal');
  // airborne + down → downthrust
  const r = decideMelee({ attackPressed: true, down: true }, { onGround: false }, kit, charge);
  assert.equal(r.type, 'downthrust');
  assert.equal(r.mul, DOWNTHRUST_MULT);
  assert.ok(r.downward);
  // locked → normal
  assert.equal(decideMelee({ attackPressed: true, down: true }, { onGround: false }, createKit(), charge).type, 'normal');
});

// --- stage integration ---
const W = 24;
const brow = (() => { const a = Array(W).fill('.'); a[2] = 'p'; a[16] = 'B'; a[22] = 'x'; return a.join(''); })();
const KIT_DEF = { rows: ['.'.repeat(W), '.'.repeat(W), brow, '#'.repeat(W)], startXp: 220, kit: { charged: true, downthrust: true } };

test('kit: in-stage charged strike deals ~2× a normal hit to the boss', () => {
  const s = createStage(KIT_DEF, { seed: 'charged' });
  s.player.x = s.boss.x - 20; s.player.facing = 1;
  const hits = [];
  // Normal press.
  let ev = stepStage(s, { moveDir: 0, attackPressed: true, attackDown: true });
  ev.filter((e) => e.type === 'hit').forEach((e) => hits.push(e.dmg));
  // Hold to full, then release.
  for (let i = 0; i < FEEL.CHARGE_FULL_TICKS; i++) stepStage(s, { moveDir: 0, attackDown: true });
  ev = stepStage(s, { moveDir: 0, attackDown: false });
  const charged = ev.find((e) => e.type === 'hit');
  assert.ok(hits.length >= 1, 'a normal hit landed');
  assert.ok(charged, 'a charged hit landed on release');
  assert.ok(charged.dmg >= hits[0] * 1.8, `charged ${charged.dmg} ~2x normal ${hits[0]}`);
});

test('kit: in-stage downthrust bounces the player upward on connect', () => {
  const s = createStage(KIT_DEF, { seed: 'dt' });
  // Put the player airborne directly above the boss.
  s.player.x = s.boss.x;
  s.player.y = s.boss.y - 20;
  s.player.onGround = false;
  s.player.vy = 2; // falling
  const ev = stepStage(s, { moveDir: 0, attackPressed: true, attackDown: true, down: true });
  assert.ok(ev.some((e) => e.type === 'kit-move' && e.move === 'downthrust'), 'downthrust performed');
  assert.ok(s.player.vy < 0, 'bounced upward on connect');
});
