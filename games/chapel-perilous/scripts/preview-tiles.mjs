// Headless builder-QA preview: prints every authored tile as a block-shaded
// grid in the terminal so the silhouette can be eyeballed without a browser
// (no canvas dependency — clean-room / no-deps rule). The browser gallery
// (gallery.html) remains the operator's colour QA surface.
import { createTileArt, TRANSPARENT } from '../src/engine/tileart.js';

// 0..6 shade -> block char (dark→light); TRANSPARENT -> space.
const RAMP = [' ', '·', '░', '▒', '▓', '█', '█'];
const chr = (s) => (s === TRANSPARENT ? '  ' : RAMP[s] + RAMP[s]);

const art = createTileArt();
for (const id of art.ids()) {
  const g = art.get(id);
  console.log(`\n=== ${id} ===`);
  for (const row of g) console.log(row.map(chr).join(''));
}
