// projectile.js — projectiles (DESIGN-SEED kit: full-health projectile; sub-weapon slot). A flying
// hitbox owned by the player: travels straight, dies on a solid tile, a hit, or its lifetime. Pure
// and deterministic. The stage spawns them (full-HP beam on a normal swing; sub-weapon on up+B
// consuming a resource), steps them, and resolves their hits.

const DEFAULT_LIFE = 90; // ticks (~1.5s)

/** Create a player-owned projectile travelling at (vx, vy). */
export function createProjectile({ x, y, vx, vy = 0, damage, life = DEFAULT_LIFE, w = 8, h = 6, kind = 'beam' }) {
  return { x, y, vx, vy, damage, life, w, h, kind, dead: false };
}

/** Projectile hit AABB (centered on x,y). */
export function projectileAabb(p) {
  return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
}

/** Advance a projectile one tick; dies on a solid tile or when its life runs out. */
export function stepProjectile(p, tilemap) {
  if (p.dead) return p;
  p.x += p.vx;
  p.y += p.vy;
  if (--p.life <= 0) { p.dead = true; return p; }
  if (tilemap && tilemap.solidAtPx(p.x, p.y)) p.dead = true;
  return p;
}
