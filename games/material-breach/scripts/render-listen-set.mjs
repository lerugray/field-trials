// render-listen-set.mjs — renders THE LISTEN SET: the score, as audio files, for Ray's ear.
//
// The score is gated on the operator's ear and is not closed by the builder (DESIGN-SEED §10), so
// the listen set is a first-class deliverable rather than a by-product. It is rendered through the
// GAME'S OWN MODULES — a real browser's WebAudio, an OfflineAudioContext, src/band.js and
// src/score.js exactly as shipped — so what Ray hears is what the game plays, not a re-recording of
// something adjacent to it.
//
// Why a browser at all: WebAudio is the synthesis engine. Reimplementing the voices in node to
// render them would mean listening to a second implementation and drawing conclusions about the
// first, which is the shape of mistake that makes an entire listening round worthless.
//
// Why a local http server: Chromium refuses ES module imports over file://, so the harness page and
// the src/ modules are served over 127.0.0.1 on an ephemeral port. The rendered WAV is PUT straight
// back to that server, which writes it to disk — the bytes never cross the CDP bridge as JSON,
// which for a four-minute stereo render is the difference between seconds and minutes.
//
// Loudness: renders come out quiet. Every file is normalised with ffmpeg's two-pass loudnorm to
// -16 LUFS, which is the level Ray's other listen sets sit at.
//
// Run:  node scripts/render-listen-set.mjs [outDir]
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'docs', 'listen', '2026-08-17-humanize');
const TMP = join(OUT, '_wav');

const pwBase = process.env.PW_PATH || join(ROOT, 'node_modules');
const require = createRequire(join(pwBase, 'noop.js'));
const { chromium } = require('playwright');

await mkdir(TMP, { recursive: true });

// ---- the jobs -------------------------------------------------------------------------------------
// "At least two full form cycles per context" is the directive's bar, so the lobby renders 2 x 512
// steps at 66 BPM (about 3:53) and the closing cue 2 x 192 steps at 54 BPM. Long enough that the
// question "would this irritate at minute twenty?" can actually be asked of it.
const LOBBY_CYCLE = (512 * 60) / 66 / 4; // steps x seconds-per-sixteenth
const CLOSING_CYCLE = (192 * 60) / 54 / 4;

const JOBS = [
  {
    file: '01-the-lobby-two-full-cycles.wav',
    track: 'lobby',
    seconds: LOBBY_CYCLE * 2 + 2,
    // A healthy facility: the music has nothing to be sour about yet.
    sourAt: '(t, total) => ({ sour: 0, pressure: 0 })',
    note: 'the whole form, twice, with the facility in good order',
  },
  {
    file: '02-the-lobby-souring-across-a-tenure.wav',
    track: 'lobby',
    seconds: LOBBY_CYCLE * 2 + 2,
    // The curdle, made audible as a process: sour climbs 0 -> 1 across the render.
    sourAt: '(t, total) => ({ sour: Math.min(1, t / (total * 0.85)), pressure: t / total * 0.5 })',
    note: 'the same form and the same band, souring from 0 to 1 as the building fails',
  },
  {
    file: '03-the-lobby-during-an-incident.wav',
    track: 'lobby',
    seconds: LOBBY_CYCLE + 2,
    sourAt: '(t, total) => ({ sour: 1, pressure: 0.9 })',
    note: 'pinned fully sour, the desk typing hard: what a raid sounds like',
  },
  {
    file: '04-tenure-closed.wav',
    track: 'closed',
    seconds: CLOSING_CYCLE * 2 + 2,
    sourAt: '(t, total) => ({ sour: 0.8, pressure: 0 })',
    note: 'the closing cue, twice through its three sections',
  },
  { file: '05-the-desk-sound-effects.wav', kind: 'sfx', note: 'stamp, drawer, structural, pen, refused' },
];

// ---- a tiny static server + a write sink -----------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'PUT' && req.url.startsWith('/out/')) {
      const name = req.url.slice(5).replace(/[^A-Za-z0-9._-]/g, '');
      const chunks = [];
      for await (const c of req) chunks.push(c);
      await writeFile(join(TMP, name), Buffer.concat(chunks));
      res.writeHead(200).end('ok');
      return;
    }
    const path = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!path.startsWith(ROOT) || !existsSync(path)) {
      res.writeHead(404).end('no');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch (err) {
    res.writeHead(500).end(String(err && err.message));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- render -----------------------------------------------------------------------------------------

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.error('  page error:', m.text());
});
await page.goto(`${base}/scripts/_listen-harness.html`);
await page.waitForFunction(() => window.__READY === true, null, { timeout: 30000 });

const measured = [];
for (const job of JOBS) {
  process.stdout.write(`rendering ${job.file} ... `);
  const m = await page.evaluate(async (j) => {
    const spec = { ...j };
    // The ramp arrives as source so each job can carry its own curve without a second round trip.
    spec.sourAt = j.sourAt ? eval(j.sourAt) : () => ({ sour: 0, pressure: 0 });
    return window.__renderOne(spec);
  }, job);
  measured.push({ ...job, ...m });
  console.log(`${m.seconds.toFixed(1)}s  peak ${m.peak.toFixed(3)}  rms ${m.rms.toFixed(4)}`);
}

const form = await page.evaluate(() => window.__formData());
await browser.close();
server.close();

// ---- loudness-normalise ------------------------------------------------------------------------------
// Two-pass loudnorm: measure, then correct. One pass is a guess; the game's own dynamic range
// (a bed that thins to almost nothing in THE HOLD) is exactly the case a single pass gets wrong.

async function normalise(src, dst) {
  const probe = await run('ffmpeg', ['-hide_banner', '-i', src, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).catch((e) => e);
  const text = String(probe.stderr || '');
  const json = text.slice(text.lastIndexOf('{'), text.lastIndexOf('}') + 1);
  let stats = null;
  try {
    stats = JSON.parse(json);
  } catch {
    stats = null;
  }
  const filter = stats
    ? `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`
    : 'loudnorm=I=-16:TP=-1.5:LRA=11';
  await run('ffmpeg', ['-hide_banner', '-y', '-i', src, '-af', filter, '-ar', '44100', '-b:a', '192k', '-codec:a', 'libmp3lame', dst]);
  // Re-measure the finished file so the report states what shipped, not what was asked for.
  const after = await run('ffmpeg', ['-hide_banner', '-i', dst, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']).catch((e) => e);
  const t2 = String(after.stderr || '');
  try {
    return JSON.parse(t2.slice(t2.lastIndexOf('{'), t2.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

console.log('\nnormalising to -16 LUFS:');
const report = [];
for (const j of measured) {
  const src = join(TMP, j.file);
  const dst = join(OUT, j.file.replace(/\.wav$/, '.mp3'));
  const after = await normalise(src, dst);
  const lufs = after ? Number(after.input_i) : null;
  console.log(`  ${j.file.replace(/\.wav$/, '.mp3')}  ->  ${lufs === null ? 'unmeasured' : lufs.toFixed(1) + ' LUFS'}`);
  report.push({ ...j, lufs });
}

await writeFile(join(OUT, '_render-report.json'), JSON.stringify({ generated: '2026-08-17', files: report, form }, null, 2));
console.log(`\nlisten set in ${OUT}`);
