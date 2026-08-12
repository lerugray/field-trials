import { createWorld, stepOnce, advanceSphere, resolveDraft } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/world.js';

const NO_INPUT = { left:false,right:false,up:false,down:false,jump:false,jumpHeld:false,fire:false };

function trace(seed, sphere) {
  const w = createWorld(seed, 0, []);
  w.phase = 'play';
  // Load target sphere directly by advancing through drafts with no picks.
  for (let s = 0; s < sphere; s++) {
    advanceSphere(w);
    if (w.phase !== 'draft') { console.log('no draft at', s); return; }
    resolveDraft(w, -1); // skip draft
  }
  console.log('seed', seed, 'sphere', sphere, 'phase', w.phase);
  console.log('islands', JSON.stringify(w.islands));
  console.log('spawn', JSON.stringify(w.spawn));
  console.log('killPlaneY', w.killPlaneY);
  console.log('player start', JSON.stringify(w.player.pos), 'grounded', w.player.grounded);
  for (let i = 0; i < 240 && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    const p = w.player;
    console.log(`tick ${i}: pos=${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)},${p.pos.z.toFixed(3)} vel=${p.vel.x.toFixed(3)},${p.vel.y.toFixed(3)},${p.vel.z.toFixed(3)} grounded=${p.grounded} landed=${p.landedThisTick} net=${w.netTollThisTick}`);
    if (p.grounded && i > 5) break;
  }
}

trace(98, 1);
