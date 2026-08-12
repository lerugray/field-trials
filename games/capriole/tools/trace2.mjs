import { createWorld, stepOnce, advanceSphere, resolveDraft } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/world.js';

const NO_INPUT = { left:false,right:false,up:false,down:false,jump:false,jumpHeld:false,fire:false };

function trace(seed) {
  const w = createWorld(seed, 0, []);
  w.phase = 'play';
  advanceSphere(w);
  resolveDraft(w, -1);
  const p = w.player;
  console.log('enemies:', w.enemies.map(e => ({type:e.type, pos:e.pos, r:e.r, alive:e.alive})));
  for (let i = 0; i < 400 && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    if ((i >= 300 && i <= 330) || w.netTollThisTick || w.damagedThisTick || w.diedThisTick) {
      console.log(`tick ${i}: pos=${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)},${p.pos.z.toFixed(3)} vel=${p.vel.x.toFixed(3)},${p.vel.y.toFixed(3)},${p.vel.z.toFixed(3)} grounded=${p.grounded} landed=${p.landedThisTick} net=${w.netTollThisTick} damaged=${w.damagedThisTick} hp=${w.hp}`);
    }
  }
}

trace(98);
