import { generateSphere } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/generate.js';
import { spawnEnemies } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/enemies.js';
import { tuning } from '/Users/rayweiss/Desktop/Dev Work/capriole/src/sim/tuning.js';

const safety = tuning.enemies.spawnSafetyRadius;
let fallbackCount = 0, total = 0;
let minEligible = Infinity, maxEligible = 0;
for (let seed = 1; seed <= 200; seed++) {
  for (let si = 1; si < 9; si++) {
    const g = generateSphere(seed, si);
    const chain = g.islands.slice(1);
    const eligible = chain.filter(isl => Math.hypot(isl.cx, isl.cz) >= safety);
    minEligible = Math.min(minEligible, eligible.length);
    maxEligible = Math.max(maxEligible, eligible.length);
    const enemies = spawnEnemies(seed, si, g.islands);
    total++;
    if (enemies.every(e => e.island === g.islands.length - 1)) fallbackCount++;
  }
}
console.log({safety, total, fallbackCount, minEligible, maxEligible});
