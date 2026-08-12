// game.js — M2 "player core" integration: ties player physics + melee + equipment + XP/stats into
// one deterministic, headless-testable step. To visualize the combat/XP loop without M3 enemy AI,
// it includes a single inert TRAINING DUMMY (a placeholder target that respawns) — not an enemy,
// no AI, no scope-jump into M3. The dummy pays XP + gold on defeat so the leveling loop is real.

import { createPlayer, stepPlayer, FACING } from './player.js';
import { createAttack, stepMelee, meleeHitbox, resolveMeleeHits } from './melee.js';
import { createLoadout, computeDamage } from './equipment.js';
import { createProgress, gainXp } from './stats.js';
import { ACTIONS } from '../core/input.js';
import { FEEL } from '../config/feel.js';

export const PLAYER_BODY = Object.freeze({ halfW: 8, halfH: 12 });
const DUMMY = Object.freeze({ x: 190, w: 16, h: 24, maxHP: 24, xp: 12, gold: 3 });

/** Derive movement/action intent from an InputState for this tick. */
export function deriveIntent(input) {
  const left = input.isDown(ACTIONS.LEFT);
  const right = input.isDown(ACTIONS.RIGHT);
  return {
    moveDir: (right ? 1 : 0) - (left ? 1 : 0),
    jumpPressed: input.pressed(ACTIONS.JUMP),
    jumpHeld: input.isDown(ACTIONS.JUMP),
    attackPressed: input.pressed(ACTIONS.ATTACK),
  };
}

/** Create the M2 game state. */
export function createGame({ groundY = 176 } = {}) {
  return {
    world: { groundY },
    player: createPlayer(64, groundY),
    progress: createProgress(0),
    loadout: createLoadout(),
    attack: createAttack(),
    gold: 30, // OBSERVED starting gold (§2.3)
    dummy: { x: DUMMY.x, hp: DUMMY.maxHP, flash: 0 },
    events: [],
  };
}

function dummyAabb(game) {
  return { x: game.dummy.x, y: game.world.groundY - DUMMY.h, w: DUMMY.w, h: DUMMY.h };
}

/**
 * Advance the game one tick.
 * @param {object} game
 * @param {object} intent - from deriveIntent (or a scripted intent in tests).
 * @returns {Array} events emitted this tick (hit / defeat / levelup).
 */
export function stepGame(game, intent) {
  const events = [];
  stepPlayer(game.player, intent, game.world);

  const { hitActive } = stepMelee(game.attack, intent, game.loadout.weapon);
  if (hitActive) {
    const hb = meleeHitbox(
      { x: game.player.x, y: game.player.y, facing: game.player.facing },
      game.loadout.weapon,
      PLAYER_BODY,
    );
    const struck = resolveMeleeHits(game.attack, hb, [{ id: 'dummy', aabb: dummyAabb(game) }]);
    if (struck.length) {
      const dmg = computeDamage(game.progress.stats, game.loadout.weapon, 0);
      game.dummy.hp -= dmg;
      game.dummy.flash = 6;
      events.push({ type: 'hit', dmg });
      if (game.dummy.hp <= 0) {
        game.gold += DUMMY.gold;
        const lv = gainXp(game.progress, DUMMY.xp);
        events.push({ type: 'defeat', xp: DUMMY.xp, gold: DUMMY.gold });
        if (lv.leveledUp) events.push({ type: 'levelup', to: lv.to });
        game.dummy.hp = DUMMY.maxHP; // respawn the training target
      }
    }
  }
  if (game.dummy.flash > 0) game.dummy.flash--;

  game.events = events;
  return events;
}

export { DUMMY, FACING, FEEL };
