import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, setAssist, iframeTicks, ASSIST_IFRAME_MULT } from '../src/sim/settings.js';
import { FEEL } from '../src/config/feel.js';
import { createStage, stepStage } from '../src/sim/stage.js';

const W = 20;
const DEF = { rows: ['.'.repeat(W), '.'.repeat(W), 'p'.padEnd(W, '.').slice(0, 8) + 'w' + '.'.repeat(W - 9), '#'.repeat(W)], startXp: 70 };

test('assist: master toggle couples the XP-safe and input-assist axes', () => {
  const s = createSettings();
  assert.ok(!s.assist && !s.xpSafe && !s.inputAssist);
  setAssist(s, true);
  assert.ok(s.assist && s.xpSafe && s.inputAssist);
  setAssist(s, false);
  assert.ok(!s.xpSafe && !s.inputAssist);
});

test('assist: visual-clarity/charge/mute flags exist and are independent of assist', () => {
  const s = createSettings();
  assert.equal(s.reduceEffects, false);
  assert.equal(s.chargeToggle, false);
  assert.equal(s.muted, false);
  // Independent of the assist master toggle.
  const a = createSettings({ assist: true });
  assert.equal(a.reduceEffects, false, 'reduce-effects is its own axis');
  const r = createSettings({ reduceEffects: true });
  assert.equal(r.reduceEffects, true);
  assert.equal(r.assist, false);
});

test('assist: input-assist lengthens hit-stun i-frames', () => {
  assert.equal(iframeTicks(FEEL.HITSTUN_IFRAME_TICKS, createSettings()), FEEL.HITSTUN_IFRAME_TICKS);
  assert.equal(
    iframeTicks(FEEL.HITSTUN_IFRAME_TICKS, createSettings({ assist: true })),
    Math.round(FEEL.HITSTUN_IFRAME_TICKS * ASSIST_IFRAME_MULT),
  );
});

test('assist: with XP-safe on, death drops NO marker and keeps all XP', () => {
  const s = createStage(DEF, { seed: 'a', settings: createSettings({ assist: true }) });
  const xp = s.progress.totalXp;
  s.progress.hp = 0;
  const ev = stepStage(s, { moveDir: 0 });
  assert.ok(ev.some((e) => e.type === 'respawn'));
  assert.equal(s.marker, null, 'no death marker under assist');
  assert.equal(s.progress.totalXp, xp, 'XP fully retained');
  assert.ok(!ev.some((e) => e.type === 'forfeit'));
});

test('assist: OFF (default) still drops a marker and floors XP', () => {
  const s = createStage(DEF, { seed: 'b' }); // no assist
  s.progress.hp = 0;
  stepStage(s, { moveDir: 0 });
  assert.ok(s.marker, 'marker dropped without assist');
  assert.ok(s.progress.totalXp < 70, 'XP floored to the level');
});

test('assist: taking a hit under input-assist gives longer i-frames in the stage', () => {
  const s = createStage(DEF, { seed: 'c', settings: createSettings({ assist: true }) });
  s.player.x = s.enemies[0].x; // overlap
  stepStage(s, { moveDir: 0 });
  assert.equal(s.iframes, Math.round(FEEL.HITSTUN_IFRAME_TICKS * ASSIST_IFRAME_MULT));
});

test('assist: never changes drop rates (seeded heal drops identical with/without assist)', () => {
  function kills(settings) {
    const s = createStage(DEF, { seed: 'drops', settings });
    s.player.x = s.enemies[0].x - 14; s.player.facing = 1;
    let drops = 0;
    for (let t = 0; t < 200; t++) {
      const ev = stepStage(s, { moveDir: 0, attackPressed: t % 12 === 0 });
      // respawn the trash by resting is not set up here; just measure the seeded drop on first kill
      if (ev.some((e) => e.type === 'kill')) drops = s.drops.length;
    }
    return drops;
  }
  assert.equal(kills(createSettings()), kills(createSettings({ assist: true })), 'drop behavior identical');
});
