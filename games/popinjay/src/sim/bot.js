// bot.js — a deterministic clearance BOT (DESIGN-SEED M2 validation contract:
// bot-proven clearability; M4 farm/finale probes reuse it). Pure sim, no renderer.
//
// The heuristic: track the LOWEST live balloon, walk under it, and fire only when
// SOME balloon sits in a low catch band just above the muzzle and is horizontally
// aligned — so the fast wire reaches it before class hspeed drifts it out of column.
// Balloons bouncing high on platforms are left alone; because platforms are finite
// and balloons drift horizontally at constant speed, every balloon eventually walks
// off its platform edge and falls to a lower surface, so a ground bot can clear any
// structurally-valid stage (given enough ticks).

export function botInput(world) {
  const input = { fire: false };
  let target = null;
  for (const b of world.balloons) if (!target || b.y > target.y) target = b; // lowest
  if (!target) return input;

  if (target.x > world.player.x + 1) input.right = true;
  else if (target.x < world.player.x - 1) input.left = true;

  if (!world.wire && world.fireBuffer === 0 && !world.prevFire) {
    for (const b of world.balloons) {
      const above = world.player.muzzleY - b.y;   // >0 ⇒ above the muzzle (catchable)
      const band = b.radius + 130;                // low window ⇒ short wire flight
      if (Math.abs(b.x - world.player.x) <= b.radius * 0.5 && above > 8 && above <= band) { input.fire = true; break; }
    }
  }
  return input;
}

// A mortal SURVIVAL bot for the Panic Finale baseline: dodge the nearest close threat,
// otherwise track + pop the lowest balloon. A naive reference (a real player/stronger
// bot survives more) — used to keep the finale survivable-but-not-trivial.
export function finaleSurvivalInput(w) {
  const i = { fire: false, left: false, right: false };
  let threat = null, td = Infinity;
  for (const b of w.balloons) { const d = Math.hypot(b.x - w.player.x, b.y - (w.player.feetY - 15)); if (d < td) { td = d; threat = b; } }
  if (threat && td < 95) { if (threat.x >= w.player.x) i.left = true; else i.right = true; } // flee
  else { let low = null; for (const b of w.balloons) if (!low || b.y > low.y) low = b; if (low) { if (low.x > w.player.x + 1) i.right = true; else if (low.x < w.player.x - 1) i.left = true; } }
  if (!w.wire && w.fireBuffer === 0 && !w.prevFire) {
    for (const b of w.balloons) { const above = w.player.muzzleY - b.y; if (Math.abs(b.x - w.player.x) <= b.radius * 0.6 && above > 8 && above <= b.radius + 150) { i.fire = true; break; } }
  }
  return i;
}

// Play the finale MORTAL with the survival bot; returns true if it survived the clock.
export function botSurviveFinale(world, maxTicks) {
  for (let t = 0; t < maxTicks && !world.dead && !world.finaleWon; t++) world.step(finaleSurvivalInput(world));
  return world.finaleWon === true;
}

// Drive a World to a clear (or the tick cap). Returns { cleared, ticks, pops }. The
// clearance bot proves a roster is RESOLVABLE, not survivable — it plays invincible
// (pass {mortal:true} to measure survival, e.g. the M4 finale baseline).
export function botPlay(world, maxTicks = 30000, { mortal = false } = {}) {
  if (!mortal) world.invincible = true;
  let pops = 0;
  for (let t = 0; t < maxTicks && !world.cleared; t++) {
    world.step(botInput(world));
    const evs = world.drainEvents();
    for (const e of evs) if (e.type === 'pop') pops++;
  }
  return { cleared: world.cleared, ticks: world.tick, pops };
}
