#!/usr/bin/env node
/**
 * soak-adversary.mjs — bounded Playwright player-path soak of the shipped ADVERSARY
 * single-file artifact (Stage 1 vertical slice).
 *
 * House pattern: oddseedz soak staging/evidence + chapel-perilous keyboard endurance/heap.
 * Mutates the game only through real KeyboardEvent.code down-hold-up controls.
 * Reads window.__stage / window.__mode for assertions only — never calls debug helpers.
 *
 * Run: node scripts/soak-adversary.mjs
 * Dev override: SOAK_DURATION_MS=5000 node scripts/soak-adversary.mjs
 */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'index.html');
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build.js');
const EVIDENCE_DIR = join(ROOT, 'docs', 'soak');
const DATE = dateInZone(new Date(), 'America/New_York');
const EVIDENCE_JSON = join(EVIDENCE_DIR, `${DATE}-adversary-soak.json`);
const EVIDENCE_SUMMARY = join(EVIDENCE_DIR, `${DATE}-adversary-soak.md`);

const VIEWPORT = { width: 512, height: 480 };
const INPUT_HOLD_MS = 80;
const SETTLE_MS = 200;
const HEAP_GROWTH_FAIL_BYTES = 24 * 1024 * 1024;
const REQUIRED_HEAP_SAMPLES = 10;
const STALL_MS = 12_000;
const DEFAULT_ENDURANCE_MS = 180_000;
const ENDURANCE_MS = Number.parseInt(process.env.SOAK_DURATION_MS || '', 10) > 0
  ? Number.parseInt(process.env.SOAK_DURATION_MS, 10)
  : DEFAULT_ENDURANCE_MS;
const HEAP_SAMPLE_EVERY_MS = Math.max(500, Math.floor(ENDURANCE_MS / (REQUIRED_HEAP_SAMPLES + 2)));

const report = {
  schemaVersion: 1,
  probe: 'scripts/soak-adversary.mjs',
  startedAt: null,
  finishedAt: null,
  verdict: 'PENDING',
  enduranceMs: ENDURANCE_MS,
  enduranceDefaultMs: DEFAULT_ENDURANCE_MS,
  soakDurationEnv: process.env.SOAK_DURATION_MS || null,
  artifact: {
    source: DIST,
    staged: null,
    fileUrl: null,
    bytes: null,
    sha256: null,
    sourceSha256: null,
    stagedOutsideRepo: false,
    build: { stale: null, ran: false, output: null },
  },
  protocol: {
    source: [
      'src/boot.js',
      'src/core/input.js',
      'src/sim/player.js',
      'src/sim/stage.js',
      'src/content/campaign.js',
      'src/content/stage1.js',
    ],
    controls: [
      'LEFT: ArrowLeft / KeyA held',
      'RIGHT: ArrowRight / KeyD held',
      'JUMP: KeyK / Space held',
      'ATTACK: KeyJ held',
      'DODGE: KeyH / ShiftLeft held',
    ],
    notes: [
      'Direct boot into Stage 1 play (no title gate).',
      'window.__stage / window.__mode are read-only assertion handles.',
      'Double jump is Stage 4 kit unlock (marker J); deferred for Stage-1 soak.',
    ],
  },
  coverage: {},
  driveSteps: [],
  pathWalked: [],
  liveness: {
    samples: [],
    explicitInputPairs: [],
    advancingPairs: 0,
    stallChecks: [],
    verdict: 'PENDING',
  },
  heap: {
    samples: [],
    thresholdBytes: HEAP_GROWTH_FAIL_BYTES,
    deltaBytes: null,
    peakAboveFirstBytes: null,
    maxConsecutiveRises: null,
    verdict: 'PENDING',
  },
  endurance: {
    durationMs: ENDURANCE_MS,
    startedAt: null,
    finishedAt: null,
    iterations: 0,
    verdict: 'PENDING',
  },
  runtime: {
    browserLaunchMode: null,
    browserFallbackReason: null,
  },
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  requestFailures: [],
  failures: [],
  defectsFound: [],
};

class GateFailure extends Error {}

function dateInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function ts() {
  return new Date().toISOString();
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function addFailure(reason, { defect = false } = {}) {
  if (!report.failures.includes(reason)) report.failures.push(reason);
  if (defect && !report.defectsFound.includes(reason)) report.defectsFound.push(reason);
  console.error(`FAIL: ${reason}`);
}

function gate(condition, reason, options) {
  if (condition) return;
  addFailure(reason, options);
  throw new GateFailure(reason);
}

function cover(name, detail, result = 'PASS') {
  report.coverage[name] = { result, at: ts(), detail };
  console.log(`${result} ${name} — ${detail}`);
}

function walkFiles(path) {
  const out = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

function ensureCurrentArtifact() {
  const inputs = [BUILD_SCRIPT, ...walkFiles(join(ROOT, 'src'))];
  const stale = !existsSync(DIST) || inputs.some((path) => {
    try {
      return statSync(path).mtimeMs > statSync(DIST).mtimeMs;
    } catch {
      return true;
    }
  });
  report.artifact.build.stale = stale;
  if (!stale) return;

  const built = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  report.artifact.build.ran = true;
  report.artifact.build.output = `${built.stdout || ''}${built.stderr || ''}`.trim();
  gate(built.status === 0 && existsSync(DIST), `artifact rebuild failed: ${report.artifact.build.output}`);
}

function stageArtifact() {
  ensureCurrentArtifact();
  gate(existsSync(DIST), `shipped artifact missing: ${DIST}`);

  const stageDir = mkdtempSync(join(tmpdir(), 'adversary-soak-'));
  const stagedDir = realpathSync(stageDir);
  const staged = join(stagedDir, 'index.html');
  copyFileSync(DIST, staged);

  const sourceBytes = readFileSync(DIST);
  const stagedBytes = readFileSync(staged);
  report.artifact.sourceSha256 = sha256(sourceBytes);
  report.artifact.sha256 = sha256(stagedBytes);
  report.artifact.bytes = stagedBytes.length;
  report.artifact.staged = staged;
  report.artifact.fileUrl = pathToFileURL(staged).href;
  report.artifact.stagedOutsideRepo = !staged.startsWith(`${realpathSync(ROOT)}${sep}`);

  gate(report.artifact.stagedOutsideRepo, `staged artifact remained inside repository: ${staged}`);
  gate(report.artifact.sha256 === report.artifact.sourceSha256, 'staged artifact hash differs from dist/index.html');
  console.log(`artifact sha256: ${report.artifact.sha256}`);
  console.log(`staged file: ${staged}`);
  return stagedDir;
}

function summarizeState(s) {
  if (!s || !s.ok) return { ok: false };
  return {
    ok: true,
    mode: s.mode,
    x: round1(s.x),
    y: round1(s.y),
    onGround: s.onGround,
    facing: s.facing,
    dodging: s.dodging,
    hp: s.hp,
    xp: s.xp,
    deaths: s.deaths,
    aliveEnemies: s.aliveEnemies,
    enemyHpSum: s.enemyHpSum,
    cameraX: round1(s.cameraX),
    kitDoubleJump: s.kit?.doubleJump === true,
    attackPhase: s.attackPhase,
    attackCooldown: s.attackCooldown,
  };
}

function round1(n) {
  return typeof n === 'number' ? Math.round(n * 10) / 10 : n;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const mode = typeof window.__mode === 'function' ? window.__mode() : null;
    const s = typeof window.__stage === 'function' ? window.__stage() : null;
    if (!s || !s.player || !s.progress) {
      return { ok: false, mode };
    }
    const enemies = (s.enemies || []).map((e) => ({
      type: e.type && e.type.id,
      x: e.x,
      y: e.y,
      hp: e.hp,
      alive: e.alive,
    }));
    return {
      ok: true,
      mode,
      x: s.player.x,
      y: s.player.y,
      vx: s.player.vx,
      vy: s.player.vy,
      onGround: s.player.onGround,
      facing: s.player.facing,
      dodging: s.player.dodging,
      dodgeCooldown: s.player.dodgeCooldown,
      dodgeDir: s.player.dodgeDir,
      airJumpUsed: s.player.airJumpUsed,
      hp: s.progress.hp,
      maxHP: s.progress.stats.maxHP,
      xp: s.progress.totalXp,
      level: s.progress.level,
      deaths: s.deaths,
      cleared: s.cleared,
      dead: s.dead,
      kit: {
        charged: !!s.kit?.charged,
        downthrust: !!s.kit?.downthrust,
        doubleJump: !!s.kit?.doubleJump,
        projectile: !!s.kit?.projectile,
        subweapon: !!s.kit?.subweapon,
      },
      enemies,
      aliveEnemies: enemies.filter((e) => e.alive).length,
      enemyHpSum: enemies.filter((e) => e.alive).reduce((sum, e) => sum + (e.hp || 0), 0),
      cameraX: s.camera?.x ?? 0,
      cameraY: s.camera?.y ?? 0,
      events: (s.events || []).map((e) => e.type),
      spawnX: s.spawn?.x ?? null,
      respawnX: s.respawnPoint?.x ?? null,
      attackPhase: s.attack?.phase ?? null,
      attackCooldown: s.attack?.cooldown ?? 0,
    };
  });
}

function semanticSignature(s) {
  return sha256(JSON.stringify(summarizeState(s)));
}

async function keyHold(page, key, holdMs = INPUT_HOLD_MS) {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}

async function keyHoldLong(page, key, holdMs) {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}

async function canvasStats(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('screen');
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) {
      return { ok: false };
    }
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { ok: false };
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let lit = 0;
    let sum = 0;
    const step = Math.max(4, Math.floor(Math.min(canvas.width, canvas.height) / 64));
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const i = (y * canvas.width + x) * 4;
        const value = data[i] + data[i + 1] + data[i + 2];
        sum += value;
        if (value > 24) lit += 1;
        hash ^= data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11;
        hash = Math.imul(hash, 16777619);
      }
    }
    return { ok: true, width: canvas.width, height: canvas.height, lit, sum, hash: hash >>> 0 };
  });
}

async function captureVisual(page, shotDir, label) {
  const filename = `${String(report.liveness.samples.length).padStart(2, '0')}-${label}.png`;
  const path = join(shotDir, filename);
  const png = await page.screenshot({ path, fullPage: true });
  const canvas = await canvasStats(page);
  gate(canvas.ok && canvas.lit > 32, `${label}: main canvas missing or near-black`, { defect: true });
  const state = summarizeState(await snapshot(page));
  const entry = {
    at: ts(),
    label,
    screenshot: path,
    screenshotBytes: png.length,
    screenshotSha256: sha256(png),
    canvas,
    state,
  };
  report.liveness.samples.push(entry);
  return entry;
}

async function driveStep(page, shotDir, name, action, predicate, { shot = true } = {}) {
  const before = await snapshot(page);
  const beforeVisual = await canvasStats(page);
  const beforeSignature = semanticSignature(before);
  await action();
  await page.waitForTimeout(SETTLE_MS);
  const after = await snapshot(page);
  const afterVisual = await canvasStats(page);
  const afterSignature = semanticSignature(after);
  const semanticChanged = beforeSignature !== afterSignature;
  const visualChanged = beforeVisual.ok && afterVisual.ok && (
    beforeVisual.hash !== afterVisual.hash || beforeVisual.sum !== afterVisual.sum
  );
  const expected = predicate ? !!predicate(before, after) : semanticChanged;
  const entry = {
    at: ts(),
    name,
    semanticChanged,
    visualChanged,
    expected,
    beforeSignature,
    afterSignature,
    before: summarizeState(before),
    after: summarizeState(after),
    beforeCanvasHash: beforeVisual.hash ?? null,
    afterCanvasHash: afterVisual.hash ?? null,
  };
  report.driveSteps.push(entry);
  report.pathWalked.push(name);
  gate(semanticChanged, `${name}: silent no-op (semantic state did not change)`, { defect: true });
  gate(visualChanged, `${name}: semantic changed but rendered screen did not`, { defect: true });
  gate(expected, `${name}: transition did not reach its expected state`, { defect: true });
  if (shot) await captureVisual(page, shotDir, name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase());
  console.log(`PASS step ${name}`);
  return { before, after, beforeVisual, afterVisual };
}

async function sampleHeap(page, label) {
  const used = await page.evaluate(() => {
    const memory = performance && performance.memory;
    return memory && Number.isFinite(memory.usedJSHeapSize) ? memory.usedJSHeapSize : null;
  });
  report.heap.samples.push({ at: ts(), label, usedJSHeapSize: used });
  return used;
}

function isBenignRequestFailure(url) {
  return /favicon\.ico$/i.test(url) || /^chrome(-extension)?:/i.test(url) || /^about:/i.test(url);
}

function installErrorTraps(page) {
  page.on('pageerror', (error) => {
    const message = String(error?.stack || error?.message || error);
    report.pageErrors.push({ at: ts(), message });
    addFailure(`pageerror: ${message}`, { defect: true });
  });
  page.on('console', (message) => {
    const item = { at: ts(), type: message.type(), text: message.text() };
    if (message.type() === 'error') {
      report.consoleErrors.push(item);
      addFailure(`console error: ${item.text}`, { defect: true });
    } else if (message.type() === 'warning') {
      report.consoleWarnings.push(item);
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (isBenignRequestFailure(url)) return;
    const item = { at: ts(), url, error: request.failure()?.errorText || 'unknown' };
    report.requestFailures.push(item);
    addFailure(`request failed: ${item.url} (${item.error})`, { defect: true });
  });
}

async function launchBrowser() {
  const normal = { headless: true, args: ['--enable-precise-memory-info'] };
  try {
    const browser = await chromium.launch(normal);
    report.runtime.browserLaunchMode = 'standard-multiprocess';
    return browser;
  } catch (error) {
    const message = String(error?.message || error);
    if (!/MachPortRendezvous|bootstrap_check_in[\s\S]*Permission denied/i.test(message)) throw error;
    report.runtime.browserLaunchMode = 'sandbox-single-process-fallback';
    report.runtime.browserFallbackReason = 'macOS sandbox denied Chromium Mach bootstrap registration';
    console.warn('Chromium multiprocess launch was sandbox-blocked; retrying with --single-process --no-zygote.');
    return chromium.launch({
      headless: true,
      args: ['--enable-precise-memory-info', '--single-process', '--no-zygote'],
    });
  }
}

async function focusGame(page) {
  await page.locator('#screen').click({ force: true }).catch(() => {});
  await page.waitForTimeout(40);
}

async function waitUntil(page, predicate, { timeoutMs = 8_000, label = 'condition' } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await snapshot(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(50);
  }
  gate(false, `${label}: timed out after ${timeoutMs}ms (last=${JSON.stringify(summarizeState(last))})`, { defect: true });
}

async function assertNotStalled(page, label) {
  const before = await snapshot(page);
  const beforeCvs = await canvasStats(page);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < STALL_MS) {
    const key = ['ArrowRight', 'ArrowLeft', 'KeyK', 'KeyJ'][i % 4];
    await keyHold(page, key, 60);
    i += 1;
    await page.waitForTimeout(40);
    const after = await snapshot(page);
    const afterCvs = await canvasStats(page);
    const semantic = semanticSignature(before) !== semanticSignature(after);
    const visual = beforeCvs.ok && afterCvs.ok && (beforeCvs.hash !== afterCvs.hash || beforeCvs.sum !== afterCvs.sum);
    if (semantic || visual) {
      const entry = { at: ts(), label, ok: true, via: semantic ? 'semantic' : 'canvas', iterations: i };
      report.liveness.stallChecks.push(entry);
      return entry;
    }
  }
  const entry = { at: ts(), label, ok: false, iterations: i };
  report.liveness.stallChecks.push(entry);
  gate(false, `stall_detection: no semantic/canvas change for ${STALL_MS}ms under continuous input (${label})`, { defect: true });
}

async function approachFirstWalker(page, shotDir) {
  // Stage 1: player ~col3, first walker ~col10 (src/content/stage1.js).
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const now = await snapshot(page);
    gate(now.ok && now.mode === 'play', 'lost play mode while approaching walker', { defect: true });
    const walker = (now.enemies || []).find((e) => e.alive && e.type === 'walker');
    gate(walker, 'no live walker remains to approach', { defect: true });
    const dx = walker.x - now.x;
    if (Math.abs(dx) <= 22) {
      cover('reach_enemy', `player x=${now.x.toFixed(1)} within range of walker x=${walker.x.toFixed(1)}`);
      await captureVisual(page, shotDir, 'near-first-walker');
      return { player: now, walker };
    }
    await driveStep(
      page,
      shotDir,
      `approach walker step ${attempt + 1}`,
      () => keyHoldLong(page, dx > 0 ? 'ArrowRight' : 'ArrowLeft', 180),
      (before, after) => Math.abs(after.x - walker.x) < Math.abs(before.x - walker.x),
      { shot: attempt % 4 === 0 },
    );
  }
  gate(false, 'failed to approach first walker within step budget', { defect: true });
}

async function proveDamageTaken(page, shotDir) {
  const before = await snapshot(page);
  gate(before.hp === before.maxHP || before.hp > 4, 'player HP already too low to prove contact damage safely', { defect: true });

  // Walk into the nearest live enemy; contact damage is flat per type (enemy.js).
  let proved = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const cur = await snapshot(page);
    const foe = (cur.enemies || []).find((e) => e.alive);
    gate(foe, 'no live enemy for contact-damage proof', { defect: true });
    const toward = foe.x >= cur.x ? 'ArrowRight' : 'ArrowLeft';
    const result = await driveStep(
      page,
      shotDir,
      `contact probe ${attempt + 1}`,
      () => keyHoldLong(page, toward, 220),
      (b, a) => a.hp < b.hp || Math.abs(a.x - foe.x) < Math.abs(b.x - foe.x) || a.deaths > b.deaths,
      { shot: false },
    );
    if (result.after.hp < result.before.hp) {
      proved = result;
      break;
    }
    // Brief pause so hitstun iframes can clear if we brushed and bounced.
    await page.waitForTimeout(550);
  }
  gate(proved && proved.after.hp < proved.before.hp, 'contact damage not observed against a live enemy', { defect: true });
  cover(
    'damage_taken',
    `HP ${proved.before.hp}→${proved.after.hp} via real enemy contact (no debug mutation)`,
  );
  await captureVisual(page, shotDir, 'damage-taken');
  return proved;
}

async function proveDodge(page, shotDir) {
  // Ensure we are not mid-iframes spam; wait a beat, then dodge with KeyH while holding a direction.
  await page.waitForTimeout(400);
  const before = await snapshot(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(40);
  const result = await driveStep(
    page,
    shotDir,
    'dodge KeyH',
    async () => {
      await page.keyboard.down('KeyH');
      await page.waitForTimeout(90);
      // Sample mid-dodge while the hold is still live so dodging>0 is observable.
      const mid = await snapshot(page);
      report.pathWalked.push('dodge mid-sample');
      gate(mid.dodging > 0, `dodge: dodging counter was ${mid.dodging} during KeyH hold`, { defect: true });
      await page.keyboard.up('KeyH');
      await page.waitForTimeout(40);
      await page.keyboard.up('ArrowRight');
    },
    (b, a) => Math.abs(a.x - b.x) >= 8 || a.dodgeCooldown > 0 || a.dodging > 0,
  );
  // Position proof: dodge dash is 24px over 8 ticks (feel.js); require net displacement.
  gate(
    Math.abs(result.after.x - before.x) >= 8 || result.after.dodgeCooldown > 0,
    `dodge: insufficient position/state proof (dx=${(result.after.x - before.x).toFixed(2)}, cooldown=${result.after.dodgeCooldown})`,
    { defect: true },
  );
  cover(
    'dodge',
    `KeyH dodge observed; x ${before.x.toFixed(1)}→${result.after.x.toFixed(1)}; cooldown=${result.after.dodgeCooldown}`,
  );
  return result;
}

async function proveDamageDealt(page, shotDir) {
  // Mirror scripts/smoke.mjs: advance right on the starting ground and swing KeyJ until a real
  // hit lands (xp gain / enemy HP drop). Sample mid-swing because cooldown recovers quickly.
  const beforeAll = await snapshot(page);
  let proved = null;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const before = await snapshot(page);
    gate(before.ok && before.mode === 'play', 'lost play mode during damage-dealt proof', { defect: true });
    gate(before.aliveEnemies >= 1, 'no live enemies remain for damage-dealt proof', { defect: true });

    const beforeVisual = await canvasStats(page);
    const beforeHpSum = before.enemyHpSum;
    const beforeAlive = before.aliveEnemies;
    const beforeXp = before.xp;

    // Advance toward the Stage 1 trash line, then swing.
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(160);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(40);

    await page.keyboard.down('KeyJ');
    await page.waitForTimeout(70);
    const mid = await snapshot(page);
    await page.waitForTimeout(40);
    await page.keyboard.up('KeyJ');
    await page.waitForTimeout(140);
    const after = await snapshot(page);
    const afterVisual = await canvasStats(page);

    const hit = after.enemyHpSum < beforeHpSum
      || after.aliveEnemies < beforeAlive
      || after.xp > beforeXp
      || mid.enemyHpSum < beforeHpSum
      || mid.aliveEnemies < beforeAlive
      || mid.xp > beforeXp
      || (mid.events || []).some((t) => t === 'hit' || t === 'kill');

    const visualChanged = beforeVisual.ok && afterVisual.ok && (
      beforeVisual.hash !== afterVisual.hash || beforeVisual.sum !== afterVisual.sum
      || after.x !== before.x
    );
    // Movement alone also changes the screen; require visual change across the step.
    const screenChanged = visualChanged || (beforeVisual.ok && afterVisual.ok && beforeVisual.hash !== afterVisual.hash);

    report.driveSteps.push({
      at: ts(),
      name: `attack KeyJ attempt ${attempt + 1}`,
      hit,
      visualChanged: screenChanged,
      before: summarizeState(before),
      mid: summarizeState(mid),
      after: summarizeState(after),
    });
    report.pathWalked.push(`attack KeyJ attempt ${attempt + 1}`);

    if (hit) {
      gate(screenChanged || after.x !== before.x || mid.x !== before.x,
        'attack KeyJ: damage landed but no rendered/position change observed', { defect: true });
      // Capture a dedicated before/after visual pair around the successful hit.
      proved = {
        before: beforeAll,
        after: after.xp > beforeXp || after.enemyHpSum < beforeHpSum || after.aliveEnemies < beforeAlive ? after : mid,
        beforeHpSum,
        beforeAlive,
        beforeXp,
      };
      console.log(`PASS step attack KeyJ attempt ${attempt + 1}`);
      break;
    }
  }

  gate(proved, 'attack did not reduce enemy HP / alive count / or grant XP after retries', { defect: true });
  await captureVisual(page, shotDir, 'damage-dealt');
  cover(
    'damage_dealt',
    `KeyJ hit: enemyHpSum ${proved.beforeHpSum}→${proved.after.enemyHpSum}, alive ${proved.beforeAlive}→${proved.after.aliveEnemies}, xp ${proved.beforeXp}→${proved.after.xp}`,
  );
  return proved;
}

async function proveDeathAndRespawn(page, shotDir) {
  // Prefer Stage 1 pit at cols 26–27 (stage1.js): walk into it without jumping.
  // Fallback: soak contact damage until HP death. Both paths call respawnPlayer (stage.js).
  const before = await snapshot(page);
  const deathsBefore = before.deaths;
  const spawnX = before.spawnX;

  let fell = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const now = await snapshot(page);
    if (now.deaths > deathsBefore) {
      fell = true;
      break;
    }
    // Hold right; if airborne near the pit, do not jump — let gravity drop us in.
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(180);
    await page.keyboard.up('ArrowRight');
    // Nudge past trash with short attacks so we don't soft-lock on walkers.
    if (attempt % 3 === 2) {
      await keyHold(page, 'KeyJ', 70);
      await page.waitForTimeout(120);
    }
    // Occasional short hop only when clearly before the pit and grounded, to clear ledges —
    // but never while x is near pit columns (~416–448).
    if (now.x < 380 && now.onGround && attempt % 7 === 0) {
      await keyHold(page, 'KeyK', 90);
      await page.waitForTimeout(200);
    }
  }

  if (!fell) {
    // Contact-death fallback: stand on a live enemy until HP depletes.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const now = await snapshot(page);
      if (now.deaths > deathsBefore) {
        fell = true;
        break;
      }
      const foe = (now.enemies || []).find((e) => e.alive);
      if (!foe) break;
      const toward = foe.x >= now.x ? 'ArrowRight' : 'ArrowLeft';
      await keyHoldLong(page, toward, 240);
      await page.waitForTimeout(520); // wait out hitstun iframes
    }
  }

  const after = await waitUntil(
    page,
    (s) => s.ok && s.deaths > deathsBefore && s.hp === s.maxHP,
    { timeoutMs: 6_000, label: 'automatic respawn after death' },
  );

  await captureVisual(page, shotDir, 'after-death-respawn');
  gate(after.deaths === deathsBefore + 1 || after.deaths > deathsBefore, `deaths did not increase (${deathsBefore}→${after.deaths})`, { defect: true });
  gate(after.hp === after.maxHP, `respawn HP not restored (hp=${after.hp}/${after.maxHP})`, { defect: true });
  // Respawn returns to respawnPoint (spawn until checkpoint). Prove we are back near spawn.
  gate(
    Math.abs(after.x - (after.respawnX ?? spawnX)) < 48,
    `respawn position not near respawn point (x=${after.x}, respawn=${after.respawnX}, spawn=${spawnX})`,
    { defect: true },
  );
  cover(
    'death_respawn',
    `deaths ${deathsBefore}→${after.deaths}; HP restored to ${after.hp}; x=${after.x.toFixed(1)} near respawn ${after.respawnX}`,
  );
  report.pathWalked.push('death_respawn');
  return after;
}

function deferDoubleJump() {
  // Source-grounded: kit unlock marker J is placed on Stage 4 (campaign.js STAGE4 unlocks
  // [['D',24],['J',46]]); Stage 1 authored layout (stage1.js) has C/S unlocks only.
  // player.js air jump requires intent.doubleJump from stage kit ownership.
  cover(
    'double_jump',
    'DEFERRED: doubleJump is a Stage 4 kit unlock (campaign STAGE4 marker J @ col 46; stage.js UNLOCK_MARKERS J→doubleJump; player.js requires intent.doubleJump). Unreasonable for a bounded Stage 1 soak — not faked.',
    'DEFERRED',
  );
}

async function runEndurance(page, shotDir) {
  report.endurance.startedAt = ts();
  const t0 = Date.now();
  let iteration = 0;
  let lastHeapAt = 0;
  await sampleHeap(page, 'endurance-start');
  await captureVisual(page, shotDir, 'endurance-start');

  while (Date.now() - t0 < ENDURANCE_MS) {
    const phase = iteration % 8;
    if (phase === 0) await keyHoldLong(page, 'ArrowRight', 220);
    else if (phase === 1) await keyHoldLong(page, 'ArrowLeft', 180);
    else if (phase === 2) await keyHold(page, 'KeyK', 100);
    else if (phase === 3) await keyHold(page, 'KeyJ', 80);
    else if (phase === 4) await keyHold(page, 'KeyH', 90);
    else if (phase === 5) await keyHoldLong(page, 'ArrowRight', 260);
    else if (phase === 6) {
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(40);
      await keyHold(page, 'KeyH', 90);
      await page.keyboard.up('ArrowLeft');
    } else {
      await keyHoldLong(page, 'ArrowRight', 140);
      await keyHold(page, 'KeyK', 80);
    }
    iteration += 1;
    report.endurance.iterations = iteration;

    if (Date.now() - lastHeapAt >= HEAP_SAMPLE_EVERY_MS) {
      await sampleHeap(page, `endurance-${iteration}`);
      lastHeapAt = Date.now();
      const live = await snapshot(page);
      const cvs = await canvasStats(page);
      gate(live.ok && live.mode === 'play', `endurance lost play mode at iteration ${iteration}`, { defect: true });
      gate(cvs.ok && cvs.lit > 32, `endurance canvas dead at iteration ${iteration}`, { defect: true });
    }

    if (iteration % 25 === 0) {
      await assertNotStalled(page, `endurance-iter-${iteration}`);
    }
    await page.waitForTimeout(40);
  }

  report.endurance.finishedAt = ts();
  await sampleHeap(page, 'endurance-end');
  await captureVisual(page, shotDir, 'endurance-end');
  const elapsed = Date.now() - t0;
  gate(elapsed >= ENDURANCE_MS * 0.95, `endurance cut short (${elapsed}ms < ${ENDURANCE_MS}ms)`);
  gate(iteration >= 20, `endurance completed too few input iterations (${iteration})`);
  report.endurance.verdict = 'PASS';
  cover('endurance', `${iteration} input iterations over ${elapsed}ms (target ${ENDURANCE_MS}ms)`);
}

function assessHeap() {
  const values = report.heap.samples
    .map((sample) => sample.usedJSHeapSize)
    .filter((value) => Number.isFinite(value));
  if (values.length < REQUIRED_HEAP_SAMPLES) {
    report.heap.verdict = 'FAIL';
    addFailure(`heap: only ${values.length} usable samples (need ${REQUIRED_HEAP_SAMPLES})`);
    return;
  }
  let riseRun = 0;
  let maxRiseRun = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[i - 1]) {
      riseRun += 1;
      maxRiseRun = Math.max(maxRiseRun, riseRun);
    } else {
      riseRun = 0;
    }
  }
  const delta = values.at(-1) - values[0];
  const peakAboveFirst = Math.max(...values) - values[0];
  const leaking = delta > HEAP_GROWTH_FAIL_BYTES && maxRiseRun >= 5;
  report.heap.deltaBytes = delta;
  report.heap.peakAboveFirstBytes = peakAboveFirst;
  report.heap.maxConsecutiveRises = maxRiseRun;
  report.heap.verdict = leaking ? 'FAIL' : 'PASS';
  if (leaking) {
    addFailure(`heap: ${delta} byte net rise with ${maxRiseRun} consecutive rises (threshold ${HEAP_GROWTH_FAIL_BYTES})`, { defect: true });
  } else {
    cover('heap', `${values.length} samples; delta=${delta} bytes; peakAboveFirst=${peakAboveFirst}; maxRiseRun=${maxRiseRun}`);
  }
}

function assessLiveness() {
  const samples = report.liveness.samples;
  let advancing = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].screenshotSha256 !== samples[i - 1].screenshotSha256) advancing += 1;
  }
  report.liveness.advancingPairs = advancing;
  const stallOk = report.liveness.stallChecks.length === 0
    || report.liveness.stallChecks.every((c) => c.ok);
  const ok = samples.length >= 8 && advancing >= 5 && stallOk;
  report.liveness.verdict = ok ? 'PASS' : 'FAIL';
  if (!ok) {
    addFailure(`liveness: samples=${samples.length}, advancingPairs=${advancing}, stallOk=${stallOk}`, { defect: true });
  } else {
    cover('visual_liveness', `${samples.length} screenshots, ${advancing} advancing pairs, stall checks ok`);
  }
}

function assessErrorSurface() {
  if (report.consoleErrors.length || report.pageErrors.length || report.requestFailures.length) {
    addFailure(`zero-error gate: console=${report.consoleErrors.length}, page=${report.pageErrors.length}, requests=${report.requestFailures.length}`, { defect: true });
  } else {
    cover('zero_console_errors', '0 console errors, 0 page errors, 0 failed requests');
  }
}

function requiredCoverageGate() {
  const requiredPass = [
    'boot_play',
    'move_left',
    'move_right',
    'jump',
    'reach_enemy',
    'damage_dealt',
    'damage_taken',
    'dodge',
    'death_respawn',
    'endurance',
    'heap',
    'visual_liveness',
    'zero_console_errors',
  ];
  const missing = requiredPass.filter((name) => report.coverage[name]?.result !== 'PASS');
  if (missing.length) addFailure(`coverage gate missing: ${missing.join(', ')}`);

  const deferred = report.coverage.double_jump;
  if (!deferred || deferred.result !== 'DEFERRED') {
    addFailure('coverage gate missing structured DEFERRED double_jump entry');
  }
}

function writeEvidence() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(EVIDENCE_JSON, `${JSON.stringify(report, null, 2)}\n`);
  const reached = Object.entries(report.coverage)
    .map(([name, value]) => `- ${name}: ${value.result} — ${value.detail}`)
    .join('\n');
  const failures = report.failures.length
    ? report.failures.map((reason) => `- ${reason}`).join('\n')
    : '- None.';
  const defects = report.defectsFound.length
    ? report.defectsFound.map((reason) => `- ${reason}`).join('\n')
    : '- None found.';
  const shots = report.liveness.samples
    .map((s) => `- ${s.label}: \`${s.screenshot}\` sha256=\`${s.screenshotSha256}\``)
    .join('\n');
  const summary = `# ADVERSARY player-path soak — ${DATE}\n\n` +
    `Verdict: **${report.verdict}**\n\n` +
    `Artifact SHA-256: \`${report.artifact.sha256 || 'unavailable'}\`\n\n` +
    `Loaded from staged out-of-repo copy: \`${report.artifact.staged || 'unavailable'}\`\n\n` +
    `Endurance: ${report.endurance.durationMs}ms (default ${DEFAULT_ENDURANCE_MS}ms; env SOAK_DURATION_MS=${report.soakDurationEnv || 'unset'})\n\n` +
    `## Path walked\n\n${report.pathWalked.map((p) => `- ${p}`).join('\n') || '- None.'}\n\n` +
    `## Coverage\n\n${reached || '- No states reached.'}\n\n` +
    `## Evidence gates\n\n` +
    `- Visual liveness: ${report.liveness.verdict} (${report.liveness.samples.length} samples, ${report.liveness.advancingPairs} advancing pairs)\n` +
    `- Heap: ${report.heap.verdict} (${report.heap.samples.length} samples, delta ${report.heap.deltaBytes ?? 'n/a'} bytes, threshold ${report.heap.thresholdBytes} bytes)\n` +
    `- Endurance: ${report.endurance.verdict} (${report.endurance.iterations} iterations)\n` +
    `- Console/page/request errors: ${report.consoleErrors.length}/${report.pageErrors.length}/${report.requestFailures.length}\n\n` +
    `## Screenshots (temp)\n\n${shots || '- None.'}\n\n` +
    `## Failures\n\n${failures}\n\n` +
    `## Defects found\n\n${defects}\n\n` +
    `Machine-readable evidence: [${basename(EVIDENCE_JSON)}](./${basename(EVIDENCE_JSON)})\n`;
  writeFileSync(EVIDENCE_SUMMARY, summary);
}

async function main() {
  report.startedAt = ts();
  const stageDir = stageArtifact();
  const shotDir = join(stageDir, 'screenshots');
  mkdirSync(shotDir, { recursive: true });

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try {
      localStorage.removeItem('adversary.run');
      localStorage.removeItem('adversary.binds');
      localStorage.clear();
    } catch (_) { /* ignore */ }
  });
  const page = await context.newPage();
  installErrorTraps(page);

  try {
    await page.goto(report.artifact.fileUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#screen').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(400);
    await focusGame(page);

    const boot = await waitUntil(
      page,
      (s) => s.ok && s.mode === 'play' && s.aliveEnemies >= 1,
      { timeoutMs: 8_000, label: 'direct-boot Stage 1 play' },
    );
    gate(!boot.kit.doubleJump, 'clean Stage 1 boot unexpectedly owns doubleJump', { defect: true });
    cover('boot_play', `clean boot reached mode=play with ${boot.aliveEnemies} live enemies; hp=${boot.hp}`);
    await captureVisual(page, shotDir, 'boot-play');
    await sampleHeap(page, 'boot');
    deferDoubleJump();

    const left = await driveStep(
      page,
      shotDir,
      'move left',
      () => keyHoldLong(page, 'ArrowLeft', 320),
      (before, after) => after.x < before.x - 4,
    );
    cover('move_left', `x ${left.before.x.toFixed(1)}→${left.after.x.toFixed(1)}`);

    const right = await driveStep(
      page,
      shotDir,
      'move right',
      () => keyHoldLong(page, 'ArrowRight', 360),
      (before, after) => after.x > before.x + 4,
    );
    cover('move_right', `x ${right.before.x.toFixed(1)}→${right.after.x.toFixed(1)}`);

    const jump = await driveStep(
      page,
      shotDir,
      'jump',
      async () => {
        // Poll while KeyK is held until the sim shows airborne — fixed sleeps race the 60Hz step.
        await page.keyboard.down('KeyK');
        const airborne = await waitUntil(
          page,
          (s) => s.ok && (!s.onGround || s.vy < 0),
          { timeoutMs: 750, label: 'jump leave ground' },
        );
        gate(airborne.y < 208, `jump: airborne but y did not rise (y=${airborne.y})`, { defect: true });
        await page.keyboard.up('KeyK');
        // Keep the driveStep "after" snapshot while still airborne.
        await page.waitForTimeout(30);
      },
      (before, after) => !after.onGround && after.y < before.y - 1,
    );
    cover('jump', `KeyK jump airborne; y ${jump.before.y.toFixed(1)}→${jump.after.y.toFixed(1)}; onGround ${jump.before.onGround}→${jump.after.onGround}`);
    await page.waitForTimeout(450);

    await approachFirstWalker(page, shotDir);
    await proveDamageDealt(page, shotDir);
    await sampleHeap(page, 'after-damage-dealt');
    await proveDamageTaken(page, shotDir);
    await sampleHeap(page, 'after-damage-taken');
    await proveDodge(page, shotDir);
    await sampleHeap(page, 'after-dodge');
    await proveDeathAndRespawn(page, shotDir);
    await sampleHeap(page, 'after-respawn');
    await assertNotStalled(page, 'post-respawn');

    await runEndurance(page, shotDir);
    await sampleHeap(page, 'final');
  } catch (error) {
    if (!(error instanceof GateFailure)) {
      addFailure(`uncaught probe error: ${error?.stack || error}`);
    }
    try {
      await captureVisual(page, shotDir, 'failure-state');
    } catch (_) { /* best-effort */ }
  } finally {
    await browser.close().catch(() => {});
  }

  assessHeap();
  assessLiveness();
  assessErrorSurface();
  requiredCoverageGate();
  report.finishedAt = ts();
  report.verdict = report.failures.length ? 'FAIL' : 'PASS';
  writeEvidence();
  console.log(`verdict: ${report.verdict}`);
  console.log(`evidence: ${EVIDENCE_JSON}`);
  console.log(`summary: ${EVIDENCE_SUMMARY}`);
  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  addFailure(`fatal probe error: ${error?.stack || error}`);
  report.finishedAt = ts();
  report.verdict = 'FAIL';
  try { writeEvidence(); } catch (_) { /* ignore */ }
  process.exitCode = 1;
});
