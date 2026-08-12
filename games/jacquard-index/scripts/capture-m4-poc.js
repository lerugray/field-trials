// Reproducible proof capture for the M4 pattern-room screenshot verdict gate.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { App } from '../src/engine/app.js';
import { makeIndexScene } from '../src/scenes/indexScene.js';
import { encodePNG } from './png.js';

const output = process.argv[2];
if (!output || !path.isAbsolute(output)) {
  throw new Error('usage: node scripts/capture-m4-poc.js /absolute/path/to/proof.png');
}

const app = new App(640, 360);
app.setScene(makeIndexScene());
app.step(16);
app.render();
writeFileSync(output, encodePNG(app.fb));
console.log(`captured ${output}`);
