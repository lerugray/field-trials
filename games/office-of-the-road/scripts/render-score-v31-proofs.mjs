// render-score-v31-proofs.mjs — listen set for OOR score V3.1 (tempo-only).
// Full-cycle WAVs at proof/score-v3.1-20260813/ (exactly five top-level files).
// Per-section stems in proof/score-v3.1-20260813/sections/.
// Full cycles are assembled by concatenating section renders (keeps Offline
// buffers tractable at minute-scale lengths). Never writes into the V3 dir.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { TRACKS, SECTION_BARS, SECTION_COUNT, cycleSeconds } from '../src/score.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATE = '20260813';
const OUT_DIR = resolve(ROOT, 'proof', `score-v3.1-${DATE}`);
const SECTION_DIR = resolve(OUT_DIR, 'sections');
const SEED = 20260813;
const SAMPLE_RATE = 44100;
const SECTION_LABELS = ['A', 'B', 'C'];
const FULL_NAMES = {
  office: '01-office-fullcycle-v31.wav',
  town: '02-town-fullcycle-v31.wav',
  march: '03-march-fullcycle-v31.wav',
  report: '04-report-fullcycle-v31.wav',
  combat: '05-combat-fullcycle-v31.wav',
};
const TRACK_ORDER = ['office', 'town', 'march', 'report', 'combat'];

function stripImports(src) {
  return src.split('\n').filter((line) => !/^\s*import\b[^;]*?\bfrom\s*['"]/.test(line)).join('\n');
}

function buildModulePayload() {
  const prng = readFileSync(resolve(ROOT, 'src', 'prng.js'), 'utf8');
  const band = readFileSync(resolve(ROOT, 'src', 'band.js'), 'utf8');
  const score = readFileSync(resolve(ROOT, 'src', 'score.js'), 'utf8');
  const renderImpl = `
window.renderTrackSlice = async function(name, durationSec, seed, startStep) {
  const spec = TRACKS[name];
  if (!spec) throw new Error('unknown track: ' + name);
  const sampleRate = ${SAMPLE_RATE};
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * durationSec), sampleRate);
  const band = createBand({
    ctx,
    destination: ctx.destination,
    seed,
    gain: 0.6,
    reverb: { seconds: 3.4, decay: 2.6 },
    lookahead: 0.22,
    fadeOut: 1.1,
    fadeIn: 0.05,
  });
  const original = spec.step;
  const offset = startStep | 0;
  band.registerTrack(name, {
    bpm: spec.bpm,
    len: spec.len,
    vol: spec.vol,
    step(i, t, s) {
      const absN = offset + s.n;
      const absI = absN % spec.len;
      original.call(spec, absI, t, Object.assign({}, s, {
        i: absI,
        n: absN,
        bar: (absI / 16) | 0,
      }));
    },
  });
  band.setTrack(name);
  for (let now = 0; now < durationSec + 1.5; now += 0.1) band.tick(now);
  const buf = await ctx.startRendering();
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.getChannelData(1);
  const interleaved = new Float32Array(ch0.length * 2);
  for (let i = 0; i < ch0.length; i++) {
    interleaved[i * 2] = ch0[i];
    interleaved[i * 2 + 1] = ch1[i];
  }
  const bytes = new Uint8Array(interleaved.buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return { samples: btoa(binary), frames: ch0.length, sampleRate };
};
`;
  return `${stripImports(prng)}\n${stripImports(band)}\n${stripImports(score)}\n${renderImpl}`;
}

function encodeWav(floatInterleaved, frames, sampleRate, numChannels = 2) {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  const writeString = (str, o) => { for (let i = 0; i < str.length; i++) view.setUint8(o + i, str.charCodeAt(i)); };
  writeString('RIFF', 0);
  view.setUint32(4, 36 + dataSize, true);
  writeString('WAVE', 8);
  writeString('fmt ', 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString('data', 36);
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = floatInterleaved[i * numChannels + c] || 0;
      sample = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(44 + i * blockAlign + c * 2, sample | 0, true);
    }
  }
  return Buffer.from(arrayBuffer);
}

async function renderSlice(page, name, durationSec, startStep) {
  const result = await page.evaluate(
    ({ n, d, seed, start }) => window.renderTrackSlice(n, d, seed, start),
    { n: name, d: durationSec, seed: SEED, start: startStep },
  );
  const buf = Buffer.from(result.samples, 'base64');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return {
    floats: new Float32Array(ab),
    frames: result.frames,
    sampleRate: result.sampleRate,
  };
}

async function main() {
  mkdirSync(SECTION_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(300000);
  await page.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
  await page.addScriptTag({ content: buildModulePayload(), type: 'module' });

  const stepsPerSection = 16 * SECTION_BARS;
  const written = [];

  for (const name of TRACK_ORDER) {
    const spec = TRACKS[name];
    const fullDur = cycleSeconds(spec);
    const sectionDur = fullDur / SECTION_COUNT;
    const sectionFloats = [];
    let sampleRate = SAMPLE_RATE;

    for (let s = 0; s < SECTION_COUNT; s++) {
      const label = SECTION_LABELS[s];
      console.log(`[render] ${name} section ${label} (~${sectionDur.toFixed(1)}s)...`);
      const slice = await renderSlice(page, name, sectionDur, s * stepsPerSection);
      sampleRate = slice.sampleRate;
      sectionFloats.push(slice);
      const wav = encodeWav(slice.floats, slice.frames, sampleRate);
      const filename = `oor-${name}-section${label}-${DATE}.wav`;
      writeFileSync(resolve(SECTION_DIR, filename), wav);
      written.push(`sections/${filename}`);
      console.log(`[render] wrote sections/${filename} (${(wav.length / 1024).toFixed(1)} KB)`);
    }

    const totalFrames = sectionFloats.reduce((n, s) => n + s.frames, 0);
    const full = new Float32Array(totalFrames * 2);
    let cursor = 0;
    for (const slice of sectionFloats) {
      full.set(slice.floats, cursor);
      cursor += slice.floats.length;
    }
    const fullWav = encodeWav(full, totalFrames, sampleRate);
    const fullName = FULL_NAMES[name];
    writeFileSync(resolve(OUT_DIR, fullName), fullWav);
    written.push(fullName);
    console.log(`[render] wrote ${fullName} (${(fullWav.length / 1024).toFixed(1)} KB, ${fullDur.toFixed(1)}s cycle)`);
  }

  await browser.close();
  console.log(`[render] ${written.length} listen-set WAVs in ${OUT_DIR}`);
  for (const f of written) console.log(`  - ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
