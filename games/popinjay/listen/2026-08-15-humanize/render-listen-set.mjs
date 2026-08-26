// Offline Popinjay listen-set renderer. BEFORE is materialized from the actual
// pre-backport commit; AFTER uses the working tree. Requires node-web-audio-api,
// but no audio device or network access.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createBand, LOOKAHEAD } from '../../src/engine/band.js';
import { POPINJAY_BAND_OVERRIDES } from '../../src/engine/audio-posture.js';
import { SCORE_PERFORMANCE, TRACKS } from '../../src/engine/score.js';
import { createBand as createBeforeBand } from './before-engine/band.js';
import { hash2 as beforeHash2 } from './before-engine/prng.js';
import { TRACKS as beforeTracks } from './before-engine/score.js';

const BEFORE_COMMIT = '7a0cc5c';
const outDir = dirname(fileURLToPath(import.meta.url));
const webAudioEntry = process.env.HOUSE_BAND_WEBAUDIO
  || '/home/ray/house-band/node_modules/node-web-audio-api/index.js';
const { OfflineAudioContext } = await import(pathToFileURL(webAudioEntry));

const sampleRate = 44100;
const seed = 20260815;
const tailSeconds = 5;
const cues = Object.freeze({
  title: { passes: 4, params: {} },
  stage: { passes: 8, params: {} },
  waltz: { passes: 8, params: {} },
  panic: { passes: 8, params: { heat: 0.75 } },
});

function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const blockAlign = channels * 2;
  const dataSize = frames * blockAlign;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(buffer.sampleRate, 24);
  wav.writeUInt32LE(buffer.sampleRate * blockAlign, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][frame]));
      wav.writeInt16LE(sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff), offset);
      offset += 2;
    }
  }
  return wav;
}

function verifyBeforeSnapshot() {
  const provenance = JSON.parse(readFileSync(join(outDir, 'before-engine/PROVENANCE.json'), 'utf8'));
  if (provenance.commit !== BEFORE_COMMIT) throw new Error('before-engine commit provenance mismatch');
  for (const [file, expected] of Object.entries(provenance.files)) {
    const actual = createHash('sha256').update(readFileSync(join(outDir, 'before-engine', file))).digest('hex');
    if (actual !== expected) throw new Error(`before-engine/${file} does not match ${BEFORE_COMMIT}`);
  }
}

async function renderBefore(name, before) {
  const track = before.TRACKS[name];
  const cue = cues[name];
  const stepSeconds = 60 / track.bpm / 4;
  const totalSteps = track.len * cue.passes;
  const musicSeconds = totalSteps * stepSeconds;
  const frames = Math.ceil((musicSeconds + tailSeconds) * sampleRate);
  const ctx = new OfflineAudioContext(2, frames, sampleRate);
  const band = before.createBand({ ctx, seed, gain: 0.5 });

  // The old scheduler had no injectable offline clock. Open its real track bus,
  // then drive the old pure score directly for the exact requested number of steps.
  band.registerTrack('__offline_bus__', { bpm: track.bpm, len: 1, vol: track.vol, step() {} });
  band.setTrack('__offline_bus__');
  for (let n = 0; n < totalSteps; n++) {
    const i = n % track.len;
    track.step(i, 0.03 + n * stepSeconds, {
      v: band.voices,
      i,
      n,
      bar: (i / 16) | 0,
      params: cue.params,
      rand: (salt = 0) => before.hash2(n, salt | 0, seed),
    });
  }
  const rendered = await ctx.startRendering();
  band.dispose();
  return { wav: encodeWav(rendered), musicSeconds };
}

async function renderAfter(name) {
  const track = TRACKS[name];
  const cue = cues[name];
  const stepSeconds = 60 / track.bpm / 4;
  const totalSteps = track.len * cue.passes;
  const musicSeconds = totalSteps * stepSeconds;
  const frames = Math.ceil((musicSeconds + tailSeconds) * sampleRate);
  const ctx = new OfflineAudioContext(2, frames, sampleRate);
  let now = 0;
  const band = createBand({
    ctx,
    seed,
    gain: 0.5,
    ...POPINJAY_BAND_OVERRIDES,
    performance: SCORE_PERFORMANCE,
    nowFn: () => now,
    strict: true,
    disconnectRetired: false,
  });
  band.registerTrack(name, {
    ...track,
    step(i, t, s) {
      if (s.n < totalSteps) track.step(i, t, s);
    },
  });
  band.setParams(cue.params);
  band.setTrack(name, { now });
  const clockStep = LOOKAHEAD / 2;
  while (band.step < totalSteps) {
    now += clockStep;
    band.tick(now);
  }
  if (band.stepErrors.length) throw new AggregateError(band.stepErrors, `${name}: scheduling failed`);
  const rendered = await ctx.startRendering();
  band.dispose();
  return { wav: encodeWav(rendered), musicSeconds };
}

const manifest = {
  date: '2026-08-15',
  seed,
  sampleRate,
  tailSeconds,
  comparison: `before uses ${BEFORE_COMMIT}'s engine + score; after uses the current engine + Popinjay overrides + SCORE_PERFORMANCE`,
  beforeCommit: BEFORE_COMMIT,
  afterEngine: 'working tree',
  bandOverrides: POPINJAY_BAND_OVERRIDES,
  performance: SCORE_PERFORMANCE,
  files: [],
};

verifyBeforeSnapshot();
const before = { createBand: createBeforeBand, TRACKS: beforeTracks, hash2: beforeHash2 };
for (const [name, cue] of Object.entries(cues)) {
  for (const posture of ['before', 'after']) {
    const { wav, musicSeconds } = posture === 'before'
      ? await renderBefore(name, before)
      : await renderAfter(name);
    const filename = `${name}-${posture}.wav`;
    writeFileSync(join(outDir, filename), wav);
    manifest.files.push({
      filename,
      cue: name,
      posture,
      engine: posture === 'before' ? BEFORE_COMMIT : 'working tree',
      passes: cue.passes,
      params: cue.params,
      musicSeconds,
      bytes: wav.length,
      sha256: createHash('sha256').update(wav).digest('hex'),
    });
  }
}

writeFileSync(join(outDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
