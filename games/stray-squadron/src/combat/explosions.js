// Explosion VFX model — pure timeline data; the renderer turns it into a burst of
// flying shards and (optionally) a brief screen flash. Kept out of the render code
// so the lifetime, the flash CAP, and the reduced-motion behavior are all
// headless-testable.
//
// Accessibility law (hard rule 8): the screen flash is HARD-CAPPED at flashCap and
// is fully suppressed under reduced-motion — but the shard burst still plays, so a
// kill always has a visible, non-flashing confirmation (never flash-only feedback).

export const EXPLOSION = {
  dur: 0.5,        // seconds
  expand: 3.4,     // how far shards travel by end of life (rail units, at scale 1)
  shardCount: 11,
  flashCap: 0.34,  // MAX screen-flash alpha, ever (accessibility law)
};

// A deterministic unit-sphere direction table (no RNG — explosions are runtime VFX,
// not seeded-world state). Fibonacci spiral gives an even spread.
export const SHARD_DIRS = (() => {
  const n = EXPLOSION.shardCount;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2; // 1..-1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return out;
})();

export function createExplosions() {
  return { list: [], nextId: 1 };
}

// Spawn at a rail-relative point. scale grows the burst (bigger enemy -> bigger).
export function spawnExplosion(pool, { s, lat, vert, scale = 1 }) {
  const e = { id: pool.nextId++, s, lat, vert, scale, t: 0 };
  pool.list.push(e);
  return e;
}

export function stepExplosions(pool, dt) {
  dt = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
  for (const e of pool.list) e.t += dt / EXPLOSION.dur;
  pool.list = pool.list.filter((e) => e.t < 1);
  return pool;
}

// The capped screen-flash alpha this frame: the strongest active explosion's flash
// (peaks at spawn, decays over the first third of life), clamped to flashCap and
// killed entirely under reduced motion.
export function explosionFlash(pool, reducedMotion) {
  if (reducedMotion) return 0;
  let peak = 0;
  for (const e of pool.list) {
    const f = Math.max(0, 1 - e.t / 0.34) * e.scale; // fast fade
    if (f > peak) peak = f;
  }
  const a = peak * EXPLOSION.flashCap;
  return a > EXPLOSION.flashCap ? EXPLOSION.flashCap : a;
}

// WHICH explosion is driving the flash this frame (or null). The caller projects it to
// screen so the flash blooms where the kill actually happened instead of washing the
// whole view — a uniform full-screen tint reads as the screen changing colour, not as a
// kill (operator, 2026-08-07: "the screen is flashing brown randomly and im not sure
// why"). Same selection rule as explosionFlash, so the two always name one source.
export function strongestFlash(pool, reducedMotion) {
  if (reducedMotion) return null;
  let peak = 0, best = null;
  for (const e of pool.list) {
    const f = Math.max(0, 1 - e.t / 0.34) * e.scale;
    if (f > peak) { peak = f; best = e; }
  }
  return peak > 0 ? best : null;
}
