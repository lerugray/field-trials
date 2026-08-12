// bot.js — a deterministic headless stage-clear policy (DESIGN-SEED testing law: "beatable" = a
// headless seeded stage-clear bot completes the stage in tests). It reads stage state and returns
// an intent each tick: advance toward the exit, jump walls and gaps, attack enemies just ahead.
// Purely reactive and deterministic, so a passing run is a real acceptance signal, not an assertion.

import { PLAYER_HALF } from './player.js';
import { BOSS_PHASE } from './boss.js';

/** Produce the bot's intent for the current stage tick. */
export function botIntent(s) {
  const p = s.player;
  let dir = p.x < s.exitX ? 1 : -1;
  const tm = s.tilemap;
  const halfW = PLAYER_HALF.halfW;

  // Enemy or boss just ahead at roughly body height → attack.
  let attackPressed = false;
  const nearAhead = (ex, ey, range) => {
    const dx = (ex - p.x) * dir;
    return dx >= -10 && dx <= range && Math.abs(ey - p.y) < 30;
  };
  for (const e of s.enemies) {
    if (e.alive && nearAhead(e.x, e.y, 30)) { attackPressed = true; break; }
  }

  // Boss: close to striking distance and trade. Back off only during the actual lunge (the one
  // window a low-level fighter must respect); otherwise hold ground and attack.
  if (s.boss && s.boss.alive) {
    const b = s.boss;
    const gap = Math.abs(b.x - p.x);
    if (b.phase === BOSS_PHASE.LUNGE && gap < 70) {
      dir = p.x < b.x ? -1 : 1;        // sidestep the committed lunge
      attackPressed = false;
    } else {
      dir = p.x < b.x ? 1 : -1;        // face the boss
      if (gap < 34) attackPressed = true;
    }
  }

  // Wall directly ahead (solid at head or mid height) → jump.
  const aheadX = p.x + dir * (halfW + 2);
  const wallAhead = tm.solidAtPx(aheadX, p.y - PLAYER_HALF.halfH) || tm.solidAtPx(aheadX, p.y - PLAYER_HALF.halfH * 2 + 2);

  // Gap ahead: grounded but no floor a little further ahead → hop across.
  const gapProbeX = p.x + dir * (halfW + 10);
  const gapAhead = p.onGround && !tm.solidAtPx(gapProbeX, p.y + 4) && !tm.solidAtPx(gapProbeX, p.y + 20);

  const wantJump = (wallAhead || gapAhead) && (p.onGround || p.coyote > 0);

  return {
    moveDir: dir,
    jumpPressed: wantJump,
    // Keep holding through the ascent so the jump reaches full height (no jump-cut) — needed to
    // clear a full-width pit, which a single-tick press would fall short of.
    jumpHeld: wantJump || (!p.onGround && p.vy < 0),
    attackPressed,
  };
}

/**
 * Run a stage headlessly with the bot until cleared, dead, or the tick budget runs out.
 * @param {object} stage - a createStage() state.
 * @param {function} stepStage
 * @param {number} [maxTicks=6000]
 * @returns {{cleared:boolean, dead:boolean, ticks:number, kills:number}}
 */
export function runBot(stage, stepStage, maxTicks = 6000, maxDeaths = 8) {
  let kills = 0;
  for (let t = 0; t < maxTicks; t++) {
    const ev = stepStage(stage, botIntent(stage));
    for (const e of ev) if (e.type === 'kill') kills++;
    if (stage.cleared) return { cleared: true, dead: false, ticks: t + 1, kills, deaths: stage.deaths };
    // Souls: death respawns rather than ending. Bail only if the bot dies too many times (stuck).
    if (stage.deaths >= maxDeaths) return { cleared: false, dead: true, ticks: t + 1, kills, deaths: stage.deaths };
  }
  return { cleared: false, dead: false, ticks: maxTicks, kills, deaths: stage.deaths };
}
