// aim.js — the firework's straight-line aim as pure shared math. The sim uses the
// direction to launch; the renderer uses the point to place its small armed reticle.
// Keeping both on this one basis prevents the affordance from drifting away from the shot.

export function projectileDirection(yaw = 0, pitch = 0) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function projectileAimPoint(pos, yaw = 0, pitch = 0, eyeHeight = 0, distance = 1) {
  const dir = projectileDirection(yaw, pitch);
  return {
    x: pos.x + dir.x * distance,
    y: pos.y + eyeHeight + dir.y * distance,
    z: pos.z + dir.z * distance,
  };
}

export default { projectileDirection, projectileAimPoint };
