// render-score-proofs.mjs — render 20-30s WAV proofs of each OOR track.
// Uses Playwright + Chromium + OfflineAudioContext to run the actual band kit
// and score.js; no new dependencies. The resulting WAVs land in
// proof/score-parts-20260812/ for Ray's ear-gate.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'proof', 'score-parts-20260812');

const TRACKS = ['office', 'march', 'town', 'combat', 'report'];
const DURATION = 24; // seconds; each proof lands in the 20-30s window
const SEED = 20260812;
const SAMPLE_RATE = 44100;

function stripImports(src) {
  // Remove ES module import lines so prng/band/score can live in one module.
  return src.split('\n').filter((line) => !/^\s*import\b[^;]*?\bfrom\s*['"]/.test(line)).join('\n');
}

function buildModulePayload() {
  const prng = readFileSync(resolve(ROOT, 'src', 'prng.js'), 'utf8');
  const band = readFileSync(resolve(ROOT, 'src', 'band.js'), 'utf8');
  const score = readFileSync(resolve(ROOT, 'src', 'score.js'), 'utf8');
  const renderImpl = `
const SAMPLE_RATE = 44100;
window.renderTrack = async function(name, durationSec, seed) {
  const spec = TRACKS[name];
  if (!spec) throw new Error('unknown track: ' + name);
  const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * durationSec), SAMPLE_RATE);
  const band = createBand({
    ctx,
    destination: ctx.destination,
    seed,
    gain: 0.6,
    reverb: { seconds: 3.4, decay: 2.6 },
    lookahead: 0.22,
    fadeOut: 1.1,
    fadeIn: 2.2,
  });
  band.registerTrack(name, spec);
  band.setTrack(name);
  // Schedule every step that falls inside the render window.
  for (let now = 0; now < durationSec + 1.0; now += 0.1) band.tick(now);
  const buf = await ctx.startRendering();

  // Encode PCM16LE stereo WAV.
  const numChannels = buf.numberOfChannels;
  const length = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  const writeString = (s, o) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeString('RIFF', 0);
  view.setUint32(4, 36 + dataSize, true);
  writeString('WAVE', 8);
  writeString('fmt ', 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString('data', 36);
  view.setUint32(40, dataSize, true);
  const offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = buf.getChannelData(c)[i];
      sample = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset + i * blockAlign + c * 2, sample, true);
    }
  }
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};
`;
  return `${stripImports(prng)}\n${stripImports(band)}\n${stripImports(score)}\n${renderImpl}`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
  const payload = buildModulePayload();
  await page.addScriptTag({ content: payload, type: 'module' });

  for (const name of TRACKS) {
    const b64 = await page.evaluate((n) => window.renderTrack(n, 24, 20260812), name);
    const buf = Buffer.from(b64, 'base64');
    const out = resolve(OUT_DIR, `oor-${name}-parts.wav`);
    writeFileSync(out, buf);
    const kb = (buf.length / 1024).toFixed(1);
    console.log(`[render] ${name}: ${out} (${kb} KB)`);
  }

  await browser.close();
  console.log('[render] all score-part proofs written to ' + OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
