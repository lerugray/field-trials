// stage.js — the stage runtime (DESIGN-SEED M3: a beatable stage). Binds tilemap + player +
// enemies + drops + contact damage (with i-frames & knockback) + camera + the clear condition into
// one deterministic step. Drives from a stage definition (tiles + spawn markers). The headless
// seeded stage-clear bot (test) advances this exact step — "beatable" means the bot reaches the
// exit, not an assertion. Boss integration lands in the next increment; pre-boss clear = reach exit.

import { createTilemap } from './tilemap.js';
import { createPlayer, stepPlayer, PLAYER_HALF, FACING } from './player.js';
import { createProgress, gainXp } from './stats.js';
import { createLoadout, computeDamage } from './equipment.js';
import { createAttack, stepMelee, meleeHitbox, resolveMeleeHits } from './melee.js';
import { createEnemy, stepEnemy, enemyAabb, damageEnemy, resetEnemy } from './enemy.js';
import { createBoss, stepBoss, bossAabb, bossContactDamage, damageBoss, resetBoss } from './boss.js';
import { aabbOverlap } from './melee.js';
import { isGrounded } from './collision.js';
import { createInventory, addItem, addWeapon } from './inventory.js';
import { createMenu } from './menu.js';
import { dropMarker, recoverMarker } from './souls.js';
import { createKit, decideMelee, DOWNTHRUST_BOUNCE } from './kit.js';
import { createProjectile, projectileAabb, stepProjectile } from './projectile.js';
import { weaponMod } from './uniques.js';
import { createSettings, iframeTicks } from './settings.js';
import { createRng } from '../core/rng.js';
import { ACTIONS } from '../core/input.js';
import { FEEL } from '../config/feel.js';

/** Derive movement/action intent from an InputState for this tick. */
export function deriveIntent(input) {
  const left = input.isDown(ACTIONS.LEFT);
  const right = input.isDown(ACTIONS.RIGHT);
  return {
    moveDir: (right ? 1 : 0) - (left ? 1 : 0),
    jumpPressed: input.pressed(ACTIONS.JUMP),
    jumpHeld: input.isDown(ACTIONS.JUMP),
    attackPressed: input.pressed(ACTIONS.ATTACK),
    attackDown: input.isDown(ACTIONS.ATTACK), // for charge hold
    down: input.isDown(ACTIONS.DOWN),         // for downthrust (air+down+attack)
    subweaponPressed: input.pressed(ACTIONS.SUBWEAPON),
    up: input.isDown(ACTIONS.UP),
    rest: input.pressed(ACTIONS.DOWN), // rest at a checkpoint
    // dodge: single-button (accessibility) OR a d-pad double-tap
    dodge: input.pressed(ACTIONS.DODGE) || input.doubleTapped(ACTIONS.LEFT) || input.doubleTapped(ACTIONS.RIGHT),
  };
}

// Spawn-marker legend (non-solid tiles read by the loader).
const MARKERS = { p: 'player', w: 'walker', h: 'hopper', x: 'exit', B: 'boss', c: 'checkpoint' };
// Kit-unlock pickups: a marker letter → the move it grants.
const UNLOCK_MARKERS = { C: 'charged', D: 'downthrust', J: 'doubleJump', P: 'projectile', S: 'subweapon' };

/** Player collision/hurt AABB (top-left), feet at player.y. */
export function playerAabb(player, body = PLAYER_HALF) {
  return { x: player.x - body.halfW, y: player.y - body.halfH * 2, w: body.halfW * 2, h: body.halfH * 2 };
}

/**
 * Build a stage runtime from a definition.
 * @param {object} def - {rows:string[], startXp?, weaponId?}
 * @param {object} [opts] - {seed, vw, vh}
 */
export function createStage(def, { seed = 'stage', vw = 256, vh = 240, settings } = {}) {
  const tilemap = createTilemap(def.rows);
  const ts = tilemap.tileSize;
  const rng = createRng(seed);

  let playerSpawn = { x: ts * 2, y: tilemap.worldHeight - ts };
  let exitX = tilemap.worldWidth - ts;
  const enemies = [];
  const checkpoints = [];
  const unlockPickups = [];
  let boss = null;

  for (const cell of tilemap.findCells((ch) => MARKERS[ch])) {
    const feetY = cell.y + ts; // marker sits on the tile; feet at its bottom
    switch (MARKERS[cell.ch]) {
      case 'player': playerSpawn = { x: cell.x + ts / 2, y: feetY }; break;
      case 'exit': exitX = cell.x + ts / 2; break;
      case 'walker': enemies.push(createEnemy('walker', cell.x + ts / 2, feetY, FACING.LEFT)); break;
      case 'hopper': enemies.push(createEnemy('hopper', cell.x + ts / 2, feetY, FACING.LEFT)); break;
      case 'boss': boss = createBoss(cell.x + ts / 2, feetY, FACING.LEFT); break;
      case 'checkpoint': checkpoints.push({ x: cell.x + ts / 2, y: feetY }); break;
      default: break;
    }
  }
  for (const cell of tilemap.findCells((ch) => UNLOCK_MARKERS[ch])) {
    unlockPickups.push({ x: cell.x + ts / 2, y: cell.y + ts - 8, move: UNLOCK_MARKERS[cell.ch], collected: false });
  }

  // M11 guarded exploration pickups: a unique sits on the surface at a given tile column. Y is the
  // topmost solid surface in that column (feet-height), so it reads like the kit-unlock pickups.
  const uniquePickups = [];
  for (const p of def.uniquePickups || []) {
    const tx = clamp(Math.floor(p.col), 0, tilemap.w - 1);
    let surfaceY = tilemap.worldHeight - ts; // fallback: bottom row
    for (let ty = 0; ty < tilemap.h; ty++) {
      if (tilemap.solidAt(tx, ty) && !tilemap.solidAt(tx, ty - 1)) { surfaceY = ty * ts; break; }
    }
    uniquePickups.push({ x: tx * ts + ts / 2, y: surfaceY - 8, id: p.id, collected: false });
  }

  const player = createPlayer(playerSpawn.x, playerSpawn.y);
  // Support detection: a spawn sitting on solid ground starts grounded so the first jump is not
  // misclassified as an item air jump. Invalid airborne spawns stay airborne.
  player.onGround = isGrounded(playerAabb(player), tilemap);
  return {
    tilemap,
    world: { tilemap, body: PLAYER_HALF },
    rng,
    player,
    spawn: playerSpawn,
    progress: createProgress(def.startXp ?? 0),
    loadout: createLoadout({ weaponId: def.weaponId }),
    inventory: createInventory({ weapons: def.weaponId ? [def.weaponId] : undefined }),
    menu: createMenu(),
    attack: createAttack(),
    kit: createKit(def.kit),
    charge: { ticks: 0 },
    unlockPickups,
    uniquePickups,
    bossDropId: def.bossDrop || null, // M11: the unique this stage's boss grants on its first kill
    theme: def.theme || 'cemetery', // M12-ART: stage sub-palette id (stagerender reads it)
    seed, // M12-ART: also seeds deterministic environmental dressing / parallax layout
    projectiles: [],
    subResource: 3,
    subResourceMax: 3,
    enemies,
    boss,
    drops: [],
    gold: 30,
    iframes: 0,
    camera: { x: 0, y: 0 },
    vw, vh,
    settings: settings || createSettings(),
    exitX,
    // --- Souls layer ---
    checkpoints,
    respawnPoint: { ...playerSpawn },  // last activated checkpoint (spawn until one is touched)
    activeCheckpoint: -1,
    marker: null,                       // single death marker holding at-risk XP
    deaths: 0,
    cleared: false,
    dead: false,
    events: [],
    // Durable, read-only presentation hook: survives catch-up ticks that replace s.events.
    airJumpPresentation: { serial: 0, x: 0, y: 0 },
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

const RESPAWN_GRACE = 60; // ticks of invuln after respawn

/**
 * Apply damage to a melee/projectile target (an enemy index or 'boss'). Emits hit/kill/defeat +
 * XP/gold/level events and seeded heal drops. Shared by melee swings and projectiles.
 */
function applyDamageToTarget(s, id, dmg, events) {
  if (id === 'boss') {
    const r = damageBoss(s.boss, dmg);
    events.push({ type: 'hit', dmg, enemy: 'boss' });
    if (r.killed) {
      s.gold += r.gold;
      const lv = gainXp(s.progress, r.xp);
      events.push({ type: 'boss-defeat', xp: r.xp, gold: r.gold });
      if (lv.leveledUp) events.push({ type: 'levelup', to: lv.to });
      // M11 first-kill boss drop: grant the mapped unique once. The `includes` guard IS the
      // no-duplicate guarantee — a re-armed boss (or a reloaded stage) already has the id in
      // inventory, so it never grants twice.
      if (s.bossDropId && !s.inventory.weapons.includes(s.bossDropId)) {
        addWeapon(s.inventory, s.bossDropId);
        events.push({ type: 'unique-drop', id: s.bossDropId, source: 'boss' });
      }
    }
    return;
  }
  const e = s.enemies[id];
  if (!e || !e.alive) return;
  const r = damageEnemy(e, dmg);
  events.push({ type: 'hit', dmg, enemy: e.type.id });
  if (r.killed) {
    s.gold += r.gold;
    const lv = gainXp(s.progress, r.xp);
    events.push({ type: 'kill', enemy: e.type.id, xp: r.xp, gold: r.gold, at: { x: e.x, y: e.y }, facing: e.facing });
    if (lv.leveledUp) events.push({ type: 'levelup', to: lv.to });
    if (s.rng.chance(0.25)) s.drops.push({ kind: 'heal', x: e.x, y: e.y - 8, vy: -1, value: 10, life: 600 });
  }
}

/** Current live targets (enemies + boss) as {id, aabb} for a hit query. */
function liveTargets(s) {
  const targets = s.enemies.filter((e) => e.alive).map((e) => ({ id: s.enemies.indexOf(e), aabb: enemyAabb(e) }));
  if (s.boss && s.boss.alive) targets.push({ id: 'boss', aabb: bossAabb(s.boss) });
  return targets;
}

/**
 * Find safe standing ground near x (so a death marker in a pit relocates to the last solid ground
 * rather than floating in the void). Searches the column at x, then outward, for a solid tile with
 * air above; falls back to the respawn point.
 */
function safeGroundNear(s, x) {
  const tm = s.tilemap, ts = tm.tileSize;
  const tx0 = clamp(Math.floor(x / ts), 0, tm.w - 1);
  for (let d = 0; d < tm.w; d++) {
    for (const tx of d === 0 ? [tx0] : [tx0 - d, tx0 + d]) {
      if (tx < 0 || tx >= tm.w) continue;
      for (let ty = 0; ty < tm.h; ty++) {
        if (tm.solidAt(tx, ty) && !tm.solidAt(tx, ty - 1)) {
          return { x: tx * ts + ts / 2, y: ty * ts }; // feet on the surface
        }
      }
    }
  }
  return { ...s.respawnPoint };
}

/** Souls death → respawn at the active checkpoint, drop the marker, respawn trash (never the boss). */
function respawnPlayer(s, deathX, events) {
  const safe = safeGroundNear(s, deathX);
  // Honest assist: XP never drops — no marker, no forfeit (drop rates untouched either way).
  if (!s.settings.xpSafe) {
    const { marker, forfeited } = dropMarker(s.progress, safe.x, safe.y, s.marker);
    s.marker = marker;
    if (forfeited > 0) events.push({ type: 'forfeit', xp: forfeited });
  }
  for (const e of s.enemies) resetEnemy(e); // trash respawns
  if (s.boss) resetBoss(s.boss);            // un-beaten boss re-arms to full; a beaten boss stays dead
  s.player.x = s.respawnPoint.x;
  s.player.y = s.respawnPoint.y;
  s.player.vx = 0; s.player.vy = 0;
  // Clear transient jump state so post-death input cannot spend or misclassify an air jump.
  // Wall-reset semantics are untouched (airJumpUsed still only clears on true ground landings).
  s.player.airJumpUsed = false;
  s.player.airJumped = false;
  s.player.jumping = false;
  s.player.coyote = 0;
  s.player.jumpBuffer = 0;
  s.player.onGround = isGrounded(playerAabb(s.player), s.tilemap);
  s.progress.hp = s.progress.stats.maxHP;
  s.iframes = RESPAWN_GRACE;
  s.deaths++;
  events.push({ type: 'death', at: { x: safe.x, y: safe.y }, marker: !!s.marker });
  events.push({ type: 'respawn', deaths: s.deaths });
}

/** Apply contact damage to the player with i-frames + knockback away from srcX. Returns true if hit. */
function hurtPlayer(s, srcX, dmg, events) {
  if (s.iframes !== 0 || s.player.dodging > 0) return false; // hit-stun i-frames or a dodge dash
  const mod = weaponMod(s.loadout.weapon); // equipped-weapon defensive mods (unique tradeoffs)
  dmg = Math.max(1, Math.round(dmg * (mod.fragile || 1)) - (mod.defenseBonus || 0));
  s.progress.hp = Math.max(0, s.progress.hp - dmg);
  s.iframes = iframeTicks(FEEL.HITSTUN_IFRAME_TICKS, s.settings); // longer under input-assist
  const dir = s.player.x < srcX ? -1 : 1;
  s.player.x += dir * FEEL.KNOCKBACK_IMPULSE * 2;
  s.player.vy = -2;
  events.push({ type: 'hurt', dmg });
  return true; // the once-per-tick death check in stepStage handles hp<=0
}

/**
 * Advance the stage one tick.
 * @param {object} s - stage state (mutated).
 * @param {object} intent - {moveDir, jumpPressed, jumpHeld, attackPressed}
 * @returns {Array} events this tick.
 */
export function stepStage(s, intent) {
  const events = [];
  if (s.dead || s.cleared) { s.events = events; return events; }

  // --- player physics against tiles (kit.doubleJump is the permanent ownership source of truth) ---
  stepPlayer(s.player, { ...(intent || {}), doubleJump: s.kit.doubleJump }, s.world);
  if (s.player.airJumped) {
    events.push({ type: 'double-jump', x: s.player.x, y: s.player.y });
    // Durable presentation coordinates: persist across later ticks that replace s.events.
    s.airJumpPresentation.serial += 1;
    s.airJumpPresentation.x = s.player.x;
    s.airJumpPresentation.y = s.player.y;
  }
  s.player.x = clamp(s.player.x, PLAYER_HALF.halfW, s.tilemap.worldWidth - PLAYER_HALF.halfW);
  if (s.iframes > 0) s.iframes--;

  // --- fell into a pit → Souls respawn ---
  if (s.player.y > s.tilemap.worldHeight + 24) {
    respawnPlayer(s, s.player.x, events);
    s.events = events;
    return events;
  }

  let pbox = playerAabb(s.player);

  // --- checkpoints: touch activates (sets respawn point); rest (DOWN) heals + respawns trash ---
  for (let i = 0; i < s.checkpoints.length; i++) {
    const cp = s.checkpoints[i];
    if (!aabbOverlap(pbox, { x: cp.x - 10, y: cp.y - 32, w: 20, h: 32 })) continue;
    // Only ever advance the respawn point forward — backtracking over an earlier checkpoint must
    // not regress where you respawn.
    if (i > s.activeCheckpoint) {
      s.activeCheckpoint = i;
      s.respawnPoint = { x: cp.x, y: cp.y };
      events.push({ type: 'checkpoint', index: i });
    }
    if (intent && intent.rest) {
      s.progress.hp = s.progress.stats.maxHP;
      s.subResource = s.subResourceMax; // rest refills the sub-weapon resource
      for (const e of s.enemies) resetEnemy(e); // voluntary rest respawns trash (Souls discipline)
      if (s.boss) resetBoss(s.boss);            // rest re-arms an un-beaten boss (no chip-then-rest exploit)
      events.push({ type: 'rest' });
    }
  }

  // --- kit-unlock pickups: touch grants the move (fanfare/prompt handled by the boot layer) ---
  for (const u of s.unlockPickups) {
    if (u.collected) continue;
    if (aabbOverlap(pbox, { x: u.x - 10, y: u.y - 20, w: 20, h: 24 })) {
      u.collected = true;
      s.kit[u.move] = true;
      events.push({ type: 'unlock', move: u.move });
    }
  }

  // --- M11 guarded exploration pickups: touch grants the unique into the inventory (equip via the
  // action menu). The `includes` guard keeps a reloaded pickup from re-granting. ---
  for (const u of s.uniquePickups) {
    if (u.collected) continue;
    if (aabbOverlap(pbox, { x: u.x - 10, y: u.y - 20, w: 20, h: 24 })) {
      u.collected = true;
      if (!s.inventory.weapons.includes(u.id)) addWeapon(s.inventory, u.id);
      events.push({ type: 'unique-drop', id: u.id, source: 'pickup' });
    }
  }

  // --- recover the death marker on touch ---
  if (s.marker && aabbOverlap(pbox, { x: s.marker.x - 12, y: s.marker.y - 32, w: 24, h: 32 })) {
    const r = recoverMarker(s.progress, s.marker);
    events.push({ type: 'recover', xp: r.recovered });
    if (r.leveledUp) events.push({ type: 'levelup', to: r.to });
    s.marker = null;
  }

  // --- player melee (base + charged + downthrust from the kit) ---
  const wpn0 = s.loadout.weapon;
  const wmod = weaponMod(wpn0);
  const swing = decideMelee(intent, s.player, s.kit, s.charge, wpn0);
  const { started, hitActive } = stepMelee(s.attack, { attackPressed: !!swing }, wpn0);
  if (started && swing) {
    s.attack.mul = swing.mul;
    s.attack.downward = swing.downward;
    s.attack.swingType = swing.type;
    if (swing.type !== 'normal') events.push({ type: 'kit-move', move: swing.type });
    // Full-health projectile: a normal swing at full HP fires a beam forward (kit-gated). A unique
    // may fire it at any health (projectileAnyHp).
    const beamOk = (s.kit.projectile && s.progress.hp >= s.progress.stats.maxHP) || wmod.projectileAnyHp;
    if (beamOk && swing.type === 'normal') {
      const dmg = computeDamage(s.progress.stats, wpn0, 0);
      s.projectiles.push(createProjectile({
        x: s.player.x + s.player.facing * 12, y: s.player.y - PLAYER_HALF.halfH,
        vx: s.player.facing * 4.5, damage: dmg, kind: 'beam',
      }));
      events.push({ type: 'kit-move', move: 'projectile' });
    }
  }
  if (hitActive) {
    const downward = s.attack.downward;
    const hb = downward
      ? { x: s.player.x - PLAYER_HALF.halfW, y: s.player.y, w: PLAYER_HALF.halfW * 2, h: wpn0.reach }
      : meleeHitbox({ x: s.player.x, y: s.player.y - PLAYER_HALF.halfH, facing: s.player.facing }, wpn0, PLAYER_HALF);
    const dmg = Math.round(computeDamage(s.progress.stats, wpn0, 0) * (s.attack.mul || 1) * (wmod.dmgMul || 1));
    const struck = resolveMeleeHits(s.attack, hb, liveTargets(s));
    if (downward && struck.length) s.player.vy = -DOWNTHRUST_BOUNCE * (wmod.downthrustPower || 1);
    for (const t of struck) applyDamageToTarget(s, t.id, dmg, events);
    // Lifesteal: a unique heals a share of damage dealt.
    if (wmod.lifesteal && struck.length) {
      s.progress.hp = Math.min(s.progress.stats.maxHP, s.progress.hp + Math.max(1, Math.round(dmg * wmod.lifesteal)) * struck.length);
    }
  }

  // --- sub-weapon: up + B fires a sub-weapon projectile, consuming a resource (free for a unique) ---
  if (s.kit.subweapon && intent && intent.up && intent.subweaponPressed && (s.subResource > 0 || wmod.freeSub)) {
    if (!wmod.freeSub) s.subResource--;
    s.projectiles.push(createProjectile({
      x: s.player.x + s.player.facing * 12, y: s.player.y - PLAYER_HALF.halfH - 4,
      vx: s.player.facing * 3.2, vy: -1.2, damage: 12, w: 10, h: 10, kind: 'sub',
    }));
    events.push({ type: 'kit-move', move: 'subweapon', resource: s.subResource });
  }

  // --- enemies AI + contact damage ---
  pbox = playerAabb(s.player); // refresh after melee knockback
  for (const e of s.enemies) {
    if (!e.alive) continue;
    stepEnemy(e, s.tilemap);
    if (aabbOverlap(pbox, enemyAabb(e))) hurtPlayer(s, e.x, e.type.contactDamage, events);
  }

  // --- boss AI + contact damage (telegraphed lunge hits harder) ---
  if (s.boss && s.boss.alive) {
    stepBoss(s.boss, s.player, s.tilemap);
    if (aabbOverlap(playerAabb(s.player), bossAabb(s.boss))) {
      hurtPlayer(s, s.boss.x, bossContactDamage(s.boss), events);
    }
  }

  // --- projectiles: travel, hit the first live target, die on tile/hit/life ---
  for (const pr of s.projectiles) {
    if (pr.dead) continue;
    stepProjectile(pr, s.tilemap);
    if (pr.dead) continue;
    const box = projectileAabb(pr);
    for (const t of liveTargets(s)) {
      if (aabbOverlap(box, t.aabb)) { applyDamageToTarget(s, t.id, pr.damage, events); pr.dead = true; break; }
    }
  }
  s.projectiles = s.projectiles.filter((pr) => !pr.dead);

  // --- clear check runs BEFORE the death check: a winning hit (boss killed / exit reached) is not
  // punished by a simultaneous lethal contact on the same tick ---
  if (!s.cleared) {
    const clearedNow = s.boss ? !s.boss.alive : s.player.x >= s.exitX;
    if (clearedNow) { s.cleared = true; events.push({ type: 'clear' }); }
  }

  // --- once-per-tick death check → Souls respawn (skipped if the stage just cleared) ---
  if (!s.cleared && s.progress.hp <= 0) {
    respawnPlayer(s, s.player.x, events);
    s.events = events;
    return events;
  }

  // --- drops: fall to ground, collected on overlap ---
  for (const d of s.drops) {
    if (d.collected) continue;
    d.vy = Math.min(FEEL.TERMINAL_FALL, d.vy + FEEL.GRAVITY);
    if (!s.tilemap.solidAtPx(d.x, d.y + 6)) d.y += d.vy; else d.vy = 0;
    d.life--;
    if (aabbOverlap(pbox, { x: d.x - 6, y: d.y - 6, w: 12, h: 12 })) {
      d.collected = true;
      if (d.kind === 'heal') {
        // Healing items go to the Items slot (used from the action menu), per DESIGN-SEED.
        addItem(s.inventory, 'heal', 1);
        events.push({ type: 'pickup', kind: 'heal' });
      }
    }
  }
  s.drops = s.drops.filter((d) => !d.collected && d.life > 0);

  // --- camera follow (clamped to world) ---
  s.camera.x = clamp(s.player.x - s.vw / 2, 0, Math.max(0, s.tilemap.worldWidth - s.vw));
  s.camera.y = clamp(s.player.y - s.vh * 0.6, 0, Math.max(0, s.tilemap.worldHeight - s.vh));

  s.events = events;
  return events;
}

export { FACING };
