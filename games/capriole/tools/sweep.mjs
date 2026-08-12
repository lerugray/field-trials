import { createWorld, stepOnce, advanceSphere, resolveDraft } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/world.js';

const NO_INPUT = { left:false,right:false,up:false,down:false,jump:false,jumpHeld:false,fire:false };
const TICKS = 60 * 30;

function run(seed, sphereIndex) {
  const w = createWorld(seed, 0, []);
  w.phase = 'play';
  for (let s = 0; s < sphereIndex; s++) {
    advanceSphere(w);
    if (w.phase !== 'draft') return { skip: true };
    resolveDraft(w, -1);
  }
  let firstLandTick = -1, tolls = 0, deaths = 0;
  for (let i = 0; i < TICKS && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    if (w.player.landedThisTick && firstLandTick < 0) firstLandTick = i;
    if (w.netTollThisTick) tolls++;
    if (w.diedThisTick) deaths++;
  }
  return { firstLandTick, tolls, deaths };
}

let total = 0, tollSeeds = 0, deathSeeds = 0, noLandSeeds = 0, multiToll = 0;
const SEEDS = 2000;
for (let si = 1; si <= 4; si++) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = run(seed, si);
    if (r.skip) continue;
    total++;
    if (r.firstLandTick < 0) noLandSeeds++;
    if (r.tolls > 0) tollSeeds++;
    if (r.deaths > 0) deathSeeds++;
    if (r.tolls >= 2) multiToll++;
  }
}
console.log({total, noLandSeeds, tollSeeds, deathSeeds, multiToll});
