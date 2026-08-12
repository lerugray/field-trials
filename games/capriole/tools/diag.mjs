import { createWorld, stepOnce, advanceSphere, resolveDraft } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/world.js';

const NO_INPUT = { left:false,right:false,up:false,down:false,jump:false,jumpHeld:false,fire:false };
const TICKS = 60 * 30;

function runCase(seed) {
  const w = createWorld(seed, 0, []);
  w.phase = 'play';
  advanceSphere(w);
  if (w.phase !== 'draft') return { skip: 'no draft' };
  resolveDraft(w, -1);
  let firstLandTick = -1, tolls = 0, deaths = 0, damageEvents = [];
  for (let i = 0; i < TICKS && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    if (w.player.landedThisTick && firstLandTick < 0) firstLandTick = i;
    if (w.netTollThisTick) { tolls++; if (tolls === 1) damageEvents.push({tick:i, type:'net', pos:{...w.player.pos}, hp:w.hp}); }
    if (w.damagedThisTick && !w.netTollThisTick) damageEvents.push({tick:i, type:'enemy', pos:{...w.player.pos}, hp:w.hp, cause:w.deathCause});
    if (w.diedThisTick) deaths++;
  }
  return { seed, firstLandTick, tolls, deaths, hp: w.hp, damageEvents: damageEvents.slice(0, 4), alive: !w.dead };
}

for (let seed = 1; seed <= 400; seed++) {
  const r = runCase(seed);
  if (r.tolls > 0 || r.deaths > 0 || r.firstLandTick < 0) {
    console.log(JSON.stringify(r));
  }
}
