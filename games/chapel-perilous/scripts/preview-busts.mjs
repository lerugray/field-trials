// Headless builder-QA preview for bestiary busts (block-shaded, no canvas dep).
import { createBusts } from '../src/engine/bustart.js';
import { TRANSPARENT } from '../src/engine/tileart.js';

const RAMP = [' ', '·', '░', '▒', '▓', '█', '█'];
const chr = (s) => (s === TRANSPARENT ? '  ' : RAMP[s] + RAMP[s]);

const busts = createBusts();
for (const id of busts.ids()) {
  console.log(`\n=== ${id} ===`);
  for (const row of busts.get(id)) console.log(row.map(chr).join(''));
}
