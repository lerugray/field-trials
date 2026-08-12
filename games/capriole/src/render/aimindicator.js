// aimindicator.js — pure render state for the straight-flying firework reticle.
// Kept DOM/WebGL-free so probe coverage can assert the exact world position.

import { projectileAimPoint } from '../sim/aim.js';

export function aimIndicatorState(world, cameraState = {}) {
  const p = world.player;
  const point = projectileAimPoint(
    p.pos, p.yaw, cameraState.aimPitch || 0,
    world.tune.camera.eyeHeight, world.tune.firework.indicatorDistance,
  );
  const fw = world.firework || {};
  return {
    visible: cameraState.showAimIndicator !== false && world.phase === 'play' &&
      !world.dead && fw.ammo >= 1 && fw.charging === true,
    ...point,
  };
}

export default aimIndicatorState;
