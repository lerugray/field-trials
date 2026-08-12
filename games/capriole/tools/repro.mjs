// Repro sweep: for each seed, simulate the sphere-1-clear -> draft -> sphere 2 path,
// with and without long-coyote, no input, 30 sim-seconds. Record net tolls / death.
import { createWorld, stepOnce, advanceSphere, resolveDraft } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/world.js';

const NO_INPUT = { left:false,right:false,up:false,down:false,jump:false,jumpHeld:false,fire:false };
const TICKS = 60 * 30;

function runCase(seed, pickLongCoyote) {
  const w = createWorld(seed, 0, []);
  w.phase = 'play';
  advanceSphere(w); // clear sphere 0 -> opens draft for sphere 1... (mirrors main.js screenStage flow)
  if (w.phase !== 'draft') return { skip: 'no draft' };
  const offer = w.draft.offer;
  let choice = -1;
  if (pickLongCoyote) {
    choice = offer.indexOf('long-coyote');
    if (choice < 0) return { skip: 'long-coyote not offered' };
  }
  resolveDraft(w, choice);
  let tolls = 0, landed = false, minY = Infinity;
  for (let i = 0; i < TICKS && !w.dead; i++) {
    stepOnce(w, NO_INPUT);
    if (w.netTollThisTick) tolls++;
    if (w.player.landedThisTick) landed = true;
    if (w.player.pos.y < minY) minY = w.player.pos.y;
  }
  return { tolls, landed, dead: !!w.dead, hp: w.hp, y: +w.player.pos.y.toFixed(1), minY: +minY.toFixed(1) };
}

let bad = [];
for (let seed = 1; seed <= 400; seed++) {
  const a = runCase(seed, true);
  if (a.skip) continue;
  if (a.dead || a.tolls > 0 || !a.landed) {
    const b = runCase(seed, false);
    bad.push({ seed, withPerk: a, without: b });
  }
}
console.log('bad seeds:', bad.length);
console.log(JSON.stringify(bad.slice(0, 6), null, 1));
