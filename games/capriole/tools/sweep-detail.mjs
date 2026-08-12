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
  const events = [];
  for (let i = 0; i < TICKS && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    if (w.player.landedThisTick && firstLandTick < 0) firstLandTick = i;
    if (w.netTollThisTick) { tolls++; if (tolls === 1) events.push({tick:i, type:'net', pos:{...w.player.pos}, hp:w.hp}); }
    if (w.damagedThisTick && !w.netTollThisTick) events.push({tick:i, type:'enemy', pos:{...w.player.pos}, hp:w.hp, cause:w.deathCause});
    if (w.diedThisTick) deaths++;
  }
  return { firstLandTick, tolls, deaths, events, enemies: w.enemies.map(e=>({type:e.type, island:e.island, homeDist: Math.hypot(e.home.x, e.home.z)})) };
}

for (let si = 1; si <= 4; si++) {
  for (let seed = 1; seed <= 200; seed++) {
    const r = run(seed, si);
    if (r.skip) continue;
    if (r.tolls > 0 || r.deaths > 0) {
      console.log('sphere', si, 'seed', seed, JSON.stringify(r));
    }
  }
}
