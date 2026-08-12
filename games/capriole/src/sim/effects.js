// effects.js — SPARKS + the FIREWORK secondary (M3). Enemy deaths drop sparks (code-drawn
// motes) that, when collected, feed the par clock (+seconds, pushing back the hazard ramp),
// bank pip-fragments (fragmentsPerPip → 1 HP pip), and refill the firework. The firework is
// the modest ranged secondary (laws: not a shooter) — a short-lived projectile that kills a
// normal enemy and chips the boss. Pure sim: deterministic scatter (golden-angle from a
// per-drop counter, no RNG stream, no wall clock).

import { killEnemy } from './world.js';
import { projectileDirection } from './aim.js';

const GOLDEN = 2.399963229728653; // radians — even angular scatter without RNG

// Drop sparks from a killed enemy at `en.pos`. Chains multiply the drop (chainBonus per link
// of the current stomp chain); the boss drops a premium burst. Deterministic scatter.
export function dropSparks(world, en) {
  const s = world.tune.spark;
  const chain = Math.max(0, world.stompChain - 1);
  const count = en.boss ? s.bossDrop : s.perKill + s.chainBonus * chain;
  for (let k = 0; k < count; k++) {
    const a = (world._sparkCounter++ >>> 0) * GOLDEN;
    world.sparks.push({
      pos: { x: en.pos.x + Math.cos(a) * 0.4, y: en.pos.y + 0.4, z: en.pos.z + Math.sin(a) * 0.4 },
      vel: { x: Math.cos(a) * s.drift, y: s.riseSpeed, z: Math.sin(a) * s.drift },
      life: s.lifeSec, alive: true,
    });
  }
}

// Advance sparks: gentle rise + outward drift decaying to a float, life decay, and pickup
// within collectRadius of the player. Each collected spark adds par seconds, a pip-fragment
// (fragmentsPerPip → a pip if below max), and firework charge. Sets world.sparkCollectedThisTick.
export function updateSparks(world, dt) {
  const s = world.tune.spark;
  const p = world.player;
  let collected = 0;
  for (const sp of world.sparks) {
    if (!sp.alive) continue;
    sp.life -= dt;
    if (sp.life <= 0) { sp.alive = false; continue; }
    // Drift eases out; a steady gentle rise keeps them legible as collectible motes.
    sp.vel.x *= 0.92; sp.vel.z *= 0.92;
    sp.pos.x += sp.vel.x * dt; sp.pos.y += sp.vel.y * dt; sp.pos.z += sp.vel.z * dt;
    const d = Math.hypot(p.pos.x - sp.pos.x, p.pos.y - sp.pos.y, p.pos.z - sp.pos.z);
    if (d <= s.collectRadius) {
      sp.alive = false;
      collected++;
      // Par relief: sparks add time (reduce elapsed toward zero, never negative).
      world.par.elapsed = Math.max(0, world.par.elapsed - world.tune.par.sparkParSec);
      // Pip-fragments → a pip when full and below max.
      world.fragments += 1;
      if (world.fragments >= world.tune.hp.fragmentsPerPip && world.hp < world.hpMax) {
        world.fragments -= world.tune.hp.fragmentsPerPip;
        world.hp += 1;
        world.pipGainedThisTick = true;
      }
      // Refill the secondary.
      world.firework.ammo = Math.min(world.tune.firework.ammoMax, world.firework.ammo + world.tune.firework.ammoPerSpark);
    }
  }
  world.sparkCollectedThisTick = collected;
  // Compact the array occasionally so dead sparks don't accrue unbounded across a long run.
  if (world.sparks.length > 256) world.sparks = world.sparks.filter((x) => x.alive);
}

// Fire + advance the firework secondary. `input.fire` is the HELD button; `input.aimPitch`
// (radians, optional) tilts the shot up/down (the renderer feeds the camera pitch so you can
// pop a swooper overhead). A press with ammo and no cooldown spawns a projectile along the
// player's facing; projectiles fly, decay, and kill the first enemy they reach.
export function updateFirework(world, input, dt) {
  const fw = world.tune.firework;
  const p = world.player;
  const f = world.firework;
  world.fireworkFiredThisTick = false;
  world.fireworkHitThisTick = -1;
  if (f.cooldown > 0) f.cooldown = Math.max(0, f.cooldown - dt);

  const held = !!input.fire;
  const pressed = held && !f.prevHeld;
  f.prevHeld = held;
  f.charging = held && !world.dead && f.cooldown <= 0 && f.ammo >= 1;
  if (pressed && f.ammo >= 1 && f.cooldown <= 0 && !world.dead) {
    f.ammo -= 1;
    f.cooldown = fw.cooldownSec;
    const pitch = typeof input.aimPitch === 'number' ? input.aimPitch : 0;
    // Facing: yaw 0 → -Z (matches moveBasis.forward). Pitch tilts vertical.
    const dir = projectileDirection(p.yaw, pitch);
    world.projectiles.push({
      pos: { x: p.pos.x, y: p.pos.y + world.tune.camera.eyeHeight, z: p.pos.z },
      vel: { x: dir.x * fw.speed, y: dir.y * fw.speed, z: dir.z * fw.speed },
      life: fw.lifeSec, alive: true,
    });
    world.fireworkFiredThisTick = true;
  }

  // Advance projectiles + resolve enemy hits (first enemy within hitRadius).
  for (const pr of world.projectiles) {
    if (!pr.alive) continue;
    pr.life -= dt;
    if (pr.life <= 0) { pr.alive = false; continue; }
    pr.pos.x += pr.vel.x * dt; pr.pos.y += pr.vel.y * dt; pr.pos.z += pr.vel.z * dt;
    for (let i = 0; i < world.enemies.length; i++) {
      const en = world.enemies[i];
      if (!en.alive) continue;
      const d = Math.hypot(pr.pos.x - en.pos.x, pr.pos.y - en.pos.y, pr.pos.z - en.pos.z);
      if (d <= fw.hitRadius + en.r) {
        pr.alive = false;
        world.fireworkHitThisTick = i;
        if (en.boss && en.invuln > 0) break; // boss i-frame: projectile fizzles, no double-dip
        en.hp -= fw.damage;
        en.hitThisTick = true;
        if (en.boss) en.invuln = world.tune.enemies.boss.hitInvulnMs / 1000;
        if (en.hp <= 0) killEnemy(world, en, i);
        break;
      }
    }
  }
  if (world.projectiles.length > 64) world.projectiles = world.projectiles.filter((x) => x.alive);
}

export default { dropSparks, updateSparks, updateFirework };
