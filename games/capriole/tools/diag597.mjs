import { createWorld, stepOnce, advanceSphere, resolveDraft } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/world.js';

const NO_INPUT = { left:false,right:false,up:false,down:false,jump:false,jumpHeld:false,fire:false };
const TICKS = 60 * 30;

function run(seed, sphereIndex) {
  const w = createWorld(seed, 0, []);
  w.phase = 'play';
  for (let s = 0; s < sphereIndex; s++) {
    advanceSphere(w);
    if (w.phase !== 'draft') return { skip: 'no draft at ' + s };
    resolveDraft(w, -1);
  }
  let firstLandTick = -1, tolls = 0, deaths = 0;
  for (let i = 0; i < TICKS && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    if (w.player.landedThisTick && firstLandTick < 0) firstLandTick = i;
    if (w.netTollThisTick) tolls++;
    if (w.diedThisTick) deaths++;
  }
  return { seed, sphereIndex, firstLandTick, tolls, deaths, hp: w.hp, alive: !w.dead, islands0: w.islands[0], spawn: w.spawn, enemies: w.enemies.map(e=>e.type) };
}

for (let si = 1; si <= 4; si++) {
  console.log('seed 597 sphere', si, JSON.stringify(run(597, si)));
}
