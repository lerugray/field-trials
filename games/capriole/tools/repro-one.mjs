import { createWorld, stepOnce, advanceSphere, resolveDraft } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/world.js';

const NO_INPUT = { left:false,right:false,up:false,down:false,jump:false,jumpHeld:false,fire:false };
const TICKS = 60 * 30;

function runCase(seed, pickLongCoyote) {
  const w = createWorld(seed, 0, []);
  w.phase = 'play';
  advanceSphere(w);
  if (w.phase !== 'draft') return { skip: 'no draft' };
  const offer = w.draft.offer;
  console.log('seed', seed, 'offer', offer);
  let choice = -1;
  if (pickLongCoyote) {
    choice = offer.indexOf('long-coyote');
    if (choice < 0) return { skip: 'long-coyote not offered' };
  }
  resolveDraft(w, choice);
  console.log('after draft: sphere', w.sphereIndex, 'islands[0]', JSON.stringify(w.islands[0]), 'spawn', JSON.stringify(w.spawn), 'killPlaneY', w.killPlaneY);
  let tolls = 0, landed = false, minY = Infinity;
  for (let i = 0; i < TICKS && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    if (w.netTollThisTick) { tolls++; console.log('NET TOLL at tick', i, 'player', JSON.stringify(w.player.pos)); }
    if (w.player.landedThisTick) { landed = true; console.log('LANDED at tick', i, 'player', JSON.stringify(w.player.pos)); }
    if (w.player.pos.y < minY) minY = w.player.pos.y;
  }
  return { tolls, landed, dead: !!w.dead, hp: w.hp, y: +w.player.pos.y.toFixed(1), minY: +minY.toFixed(1) };
}

console.log('WITHOUT LONG-COYOTE');
console.log(runCase(98, false));
console.log('WITH LONG-COYOTE');
console.log(runCase(98, true));
