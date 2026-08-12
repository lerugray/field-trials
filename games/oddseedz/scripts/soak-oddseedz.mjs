#!/usr/bin/env node
/**
 * Bounded player-path soak for the shipped Oddseedz single-file artifact.
 *
 * The probe deliberately drives only controls wired in src/ui/app.js. It never
 * calls game functions or mutates game state. Every player action must produce
 * an observable semantic transition, and PASS requires the staged artifact,
 * core-loop, persistence, visual-liveness, heap, and zero-console gates.
 *
 * Run: node scripts/soak-oddseedz.mjs
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
const DIST = join(ROOT, 'dist', 'game', 'index.html');
const BUILD_SCRIPT = join(ROOT, 'scripts', 'build-singlefile.mjs');
const EVIDENCE_DIR = join(ROOT, 'docs', 'soak');
const DATE = dateInZone(new Date(), 'America/New_York');
const EVIDENCE_JSON = join(EVIDENCE_DIR, `${DATE}-oddseedz-soak.json`);
const EVIDENCE_SUMMARY = join(EVIDENCE_DIR, `${DATE}-oddseedz-soak.md`);

const INPUT_HOLD_MS = 80;
const SETTLE_MS = 180;
const BATTLE_ROUND_LIMIT = 80;
const HEAP_GROWTH_FAIL_BYTES = 24 * 1024 * 1024;
const HEAP_CHURN_MS = 20_000;
const REQUIRED_HEAP_SAMPLES = 10;

const report = {
  schemaVersion: 1,
  probe: 'scripts/soak-oddseedz.mjs',
  startedAt: null,
  finishedAt: null,
  verdict: 'PENDING',
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
    source: ['src/ui/app.js', 'src/engine/battle.js', 'src/engine/save.js', 'src/engine/saveio.js'],
    controls: [
      'Begin button: #title-begin click',
      'Summon input: #phrase + held Enter',
      'Care: [data-do=pet] click / #scene pointer input',
      'Week planning: [data-act], #endweek, #fastfwd clicks',
      'Battle: #to-ring, [data-move], [data-close] clicks',
      'Save restore: #settings-open, [data-importfield], two [data-loadsave] clicks',
      'Overlay close: held Escape',
      'Fresh-line restart: new #phrase + held Enter',
    ],
  },
  coverage: {},
  driveSteps: [],
  liveness: {
    samples: [],
    explicitInputPairs: [],
    advancingPairs: 0,
    verdict: 'PENDING',
  },
  heap: {
    samples: [],
    thresholdBytes: HEAP_GROWTH_FAIL_BYTES,
    churnWindowMs: HEAP_CHURN_MS,
    deltaBytes: null,
    peakAboveFirstBytes: null,
    maxConsecutiveRises: null,
    verdict: 'PENDING',
  },
  persistence: {
    storageKey: 'oddseedz.save.v1',
    exportedTokenChars: null,
    restoredAge: null,
    reloadRetained: null,
    restartPhrase: null,
  },
  battles: [],
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

function cover(name, detail) {
  report.coverage[name] = { result: 'PASS', at: ts(), detail };
  console.log(`PASS ${name} — ${detail}`);
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
  const inputs = [join(ROOT, 'index.html'), BUILD_SCRIPT, ...walkFiles(join(ROOT, 'src'))];
  const stale = !existsSync(DIST) || inputs.some((path) => statSync(path).mtimeMs > statSync(DIST).mtimeMs);
  report.artifact.build.stale = stale;
  if (!stale) return;

  const built = spawnSync(process.execPath, [BUILD_SCRIPT], {
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

  const stageDir = mkdtempSync(join(tmpdir(), 'oddseedz-soak-'));
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
  gate(report.artifact.sha256 === report.artifact.sourceSha256, 'staged artifact hash differs from dist/game/index.html');
  console.log(`artifact sha256: ${report.artifact.sha256}`);
  console.log(`staged file: ${staged}`);
  return stagedDir;
}

function summarizeState(snapshot) {
  return {
    titleVisible: snapshot.titleVisible,
    overlays: snapshot.overlays,
    creature: snapshot.creature,
    queuedActions: snapshot.queuedActions,
    battle: snapshot.battle,
    settings: snapshot.settings,
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const visible = (node) => !!node && !node.hidden && getComputedStyle(node).display !== 'none';
    const labels = (root) => root
      ? [...root.querySelectorAll('.bt-text[aria-label], [role="text"][aria-label]')]
          .map((node) => node.getAttribute('aria-label'))
          .filter(Boolean)
          .slice(-16)
      : [];
    let save = null;
    let saveRaw = null;
    try {
      saveRaw = localStorage.getItem('oddseedz.save.v1');
      save = saveRaw ? JSON.parse(saveRaw) : null;
    } catch (_) {}
    const creature = save && save.creature;
    const estate = (save && save.estate) || {};
    const battle = document.getElementById('battle');
    const settings = document.getElementById('settings');
    const result = battle && battle.querySelector('[data-result]');
    const barWidth = (id) => battle?.querySelector(`[data-bar="${id}"] span`)?.style.width || null;
    return {
      titleVisible: visible(document.getElementById('title')),
      overlays: {
        battle: visible(battle),
        meadow: visible(document.getElementById('meadow')),
        codex: visible(document.getElementById('codex')),
        settings: visible(settings),
      },
      phraseInput: document.getElementById('phrase')?.value || '',
      hasSave: !!saveRaw,
      creature: creature ? {
        name: creature.name,
        phrase: creature.phrase,
        species: creature.species?.name,
        rarity: creature.rarity,
        age: creature.age,
        bond: creature.bond,
        stress: creature.stress,
        fatigue: creature.fatigue,
        stats: creature.stats,
        createdAt: save.createdAt,
        money: estate.money,
        record: estate.record,
        rank: estate.career?.rank,
        meadowCount: estate.meadow?.length || 0,
      } : null,
      queuedActions: document.querySelectorAll('#plan .qchip').length,
      planLabels: labels(document.getElementById('plan')),
      cardLabels: labels(document.getElementById('card')),
      battle: {
        visible: visible(battle),
        logLines: battle?.querySelectorAll('.logline').length || 0,
        resultClass: result?.className || null,
        resultLabels: labels(result),
        playerHp: barWidth('you-hp'),
        foeHp: barWidth('foe-hp'),
        playerStamina: barWidth('you-stam'),
      },
      settings: {
        visible: visible(settings),
        restoreArmed: !!settings?.querySelector('[data-loadsave].confirm'),
        importChars: settings?.querySelector('[data-importfield]')?.value.length || 0,
        motionReduced: window.__oddseedzReduceMotion === true,
      },
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

async function playerClick(locator, holdMs = INPUT_HOLD_MS) {
  await locator.waitFor({ state: 'visible', timeout: 8_000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  gate(box && box.width > 0 && box.height > 0, `control has no clickable bounds: ${await locator.evaluate((n) => n.outerHTML.slice(0, 180))}`);
  await locator.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await locator.page().mouse.down();
  await locator.page().waitForTimeout(holdMs);
  await locator.page().mouse.up();
}

async function driveStep(page, name, action, predicate, detail) {
  const before = await snapshot(page);
  const beforeSignature = semanticSignature(before);
  await action();
  await page.waitForTimeout(SETTLE_MS);
  const after = await snapshot(page);
  const afterSignature = semanticSignature(after);
  const changed = beforeSignature !== afterSignature;
  const expected = predicate ? !!predicate(before, after) : changed;
  const entry = {
    at: ts(),
    name,
    changed,
    expected,
    beforeSignature,
    afterSignature,
    before: summarizeState(before),
    after: summarizeState(after),
    detail: detail || null,
  };
  report.driveSteps.push(entry);
  gate(changed, `${name}: silent no-op (semantic state did not change)`, { defect: true });
  gate(expected, `${name}: transition did not reach its expected state`, { defect: true });
  console.log(`PASS step ${name}`);
  return { before, after };
}

async function canvasStats(page, selector = '#scene') {
  return page.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) return { ok: false };
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
  }, selector);
}

async function captureVisual(page, shotDir, label) {
  const filename = `${String(report.liveness.samples.length).padStart(2, '0')}-${label}.png`;
  const path = join(shotDir, filename);
  const png = await page.screenshot({ path, fullPage: true });
  const canvas = await canvasStats(page);
  gate(canvas.ok && canvas.lit > 32, `${label}: main canvas missing or near-black`, { defect: true });
  const entry = {
    at: ts(),
    label,
    screenshot: path,
    screenshotBytes: png.length,
    screenshotSha256: sha256(png),
    canvas,
    state: summarizeState(await snapshot(page)),
  };
  report.liveness.samples.push(entry);
  return entry;
}

async function sampleHeap(page, label) {
  const used = await page.evaluate(() => {
    const memory = performance && performance.memory;
    return memory && Number.isFinite(memory.usedJSHeapSize) ? memory.usedJSHeapSize : null;
  });
  report.heap.samples.push({ at: ts(), label, usedJSHeapSize: used });
  return used;
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
    const item = { at: ts(), url: request.url(), error: request.failure()?.errorText || 'unknown' };
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

async function resolveBattle(page, shotDir, label) {
  const beforeOpen = await snapshot(page);
  const recordBefore = (beforeOpen.creature?.record?.wins || 0) + (beforeOpen.creature?.record?.losses || 0);
  await driveStep(
    page,
    `${label}: open bout`,
    () => playerClick(page.locator('#to-ring')),
    (_before, after) => after.overlays.battle && after.battle.logLines >= 1,
  );
  const opened = await captureVisual(page, shotDir, `${label}-battle-open`);
  cover(`${label}_battle_open`, `arena visible with ${opened.state.battle.logLines} intro line`);

  const rounds = [];
  const moveOrder = ['surge', 'strike', 'guard', 'dash'];
  for (let round = 0; round < BATTLE_ROUND_LIMIT; round += 1) {
    const current = await snapshot(page);
    if (/\b(win|loss)\b/.test(current.battle.resultClass || '')) break;
    let move = moveOrder[round % moveOrder.length];
    let button = page.locator(`[data-move="${move}"]`);
    if (await button.isDisabled().catch(() => true)) {
      move = 'strike';
      button = page.locator('[data-move="strike"]');
    }
    const result = await driveStep(
      page,
      `${label}: round ${round + 1} ${move}`,
      () => playerClick(button, 55),
      (before, after) => after.battle.logLines > before.battle.logLines,
    );
    rounds.push({
      round: round + 1,
      move,
      before: result.before.battle,
      after: result.after.battle,
    });
  }

  const resolved = await snapshot(page);
  gate(/\b(win|loss)\b/.test(resolved.battle.resultClass || ''), `${label}: battle did not resolve within ${BATTLE_ROUND_LIMIT} rounds`, { defect: true });
  const resultKind = resolved.battle.resultClass.includes('win') ? 'win' : 'loss';
  await captureVisual(page, shotDir, `${label}-battle-resolution`);
  report.battles.push({ label, result: resultKind, rounds });
  cover(`${label}_battle_resolution`, `${resultKind} after ${rounds.length} player-commanded rounds`);

  await driveStep(
    page,
    `${label}: claim result and leave`,
    () => playerClick(page.locator('[data-close]')),
    (_before, after) => {
      const total = (after.creature?.record?.wins || 0) + (after.creature?.record?.losses || 0);
      return !after.overlays.battle && total === recordBefore + 1;
    },
  );
  await captureVisual(page, shotDir, `${label}-career-after-battle`);
  return resultKind;
}

async function explicitPersistencePath(page, shotDir) {
  await driveStep(
    page,
    'open settings for save export',
    () => playerClick(page.locator('#settings-open')),
    (_before, after) => after.overlays.settings,
  );
  const token = await page.locator('[data-savefield]').inputValue();
  const saved = await snapshot(page);
  gate(token.length > 100 && !!saved.creature, 'settings save export was missing or implausibly short', { defect: true });
  report.persistence.exportedTokenChars = token.length;
  cover('save_export', `player-visible save token captured (${token.length} chars)`);
  await captureVisual(page, shotDir, 'save-export-settings');

  await driveStep(
    page,
    'close settings with Escape',
    () => keyHold(page, 'Escape'),
    (_before, after) => !after.overlays.settings,
  );
  const savedAge = saved.creature.age;
  await driveStep(
    page,
    'advance state before restore',
    () => playerClick(page.locator('#fastfwd')),
    (_before, after) => after.creature?.age === savedAge + 1,
  );

  await driveStep(
    page,
    'reopen settings for restore',
    () => playerClick(page.locator('#settings-open')),
    (_before, after) => after.overlays.settings,
  );
  await page.locator('[data-importfield]').fill(token);
  await driveStep(
    page,
    'arm restore confirmation',
    () => playerClick(page.locator('[data-loadsave]')),
    (_before, after) => after.settings.restoreArmed && after.settings.importChars === token.length,
  );
  await driveStep(
    page,
    'confirm save restore',
    () => playerClick(page.locator('[data-loadsave]')),
    (_before, after) => !after.overlays.settings && after.creature?.age === savedAge,
  );
  report.persistence.restoredAge = (await snapshot(page)).creature?.age;
  cover('save_restore', `two-step restore returned the creature to week ${savedAge}`);
  await captureVisual(page, shotDir, 'restored-save');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#scene').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  const reloaded = await snapshot(page);
  gate(!reloaded.titleVisible && reloaded.creature?.age === savedAge && reloaded.creature?.phrase === saved.creature.phrase,
    'page reload did not retain the restored save', { defect: true });
  report.persistence.reloadRetained = true;
  cover('reload_persistence', `reload retained ${reloaded.creature.name} at week ${savedAge}`);
  await captureVisual(page, shotDir, 'reload-retained-save');
}

async function freshLineRestart(page, shotDir) {
  const phrase = `soak restart ${DATE}`;
  await page.locator('#phrase').fill(phrase);
  await driveStep(
    page,
    'fresh-line restart via summon Enter',
    () => keyHold(page, 'Enter'),
    (before, after) => after.creature?.phrase === phrase && after.creature?.age === 1 && after.creature?.createdAt !== before.creature?.createdAt,
  );
  report.persistence.restartPhrase = phrase;
  cover('fresh_line_restart', `new player-entered phrase reset the active line to week 1`);
  await captureVisual(page, shotDir, 'fresh-line-restart');

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#scene').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(400);
  const reloaded = await snapshot(page);
  gate(reloaded.creature?.phrase === phrase && reloaded.creature?.age === 1 && !reloaded.titleVisible,
    'fresh-line restart did not survive reload', { defect: true });
  cover('restart_reload', `fresh line survived reload at week 1`);
}

async function heapChurn(page, shotDir) {
  const start = Date.now();
  let iteration = 0;
  while (Date.now() - start < HEAP_CHURN_MS) {
    const action = ['drill_pow', 'rest', 'play'][iteration % 3];
    await driveStep(
      page,
      `heap churn ${iteration + 1}: queue ${action}`,
      () => playerClick(page.locator(`[data-act="${action}"]`), 40),
      (before, after) => after.queuedActions === before.queuedActions + 1,
    );
    await sampleHeap(page, `churn-${iteration + 1}-queued`);
    await driveStep(
      page,
      `heap churn ${iteration + 1}: clear plan`,
      () => playerClick(page.locator('#clearplan'), 40),
      (before, after) => before.queuedActions > 0 && after.queuedActions === 0,
    );
    iteration += 1;
    await page.waitForTimeout(650);
  }
  gate(iteration >= 8, `heap churn completed too few iterations (${iteration})`);
  cover('bounded_ui_churn', `${iteration} plan-preview/render/reset cycles over ${Date.now() - start}ms`);
  await captureVisual(page, shotDir, 'post-heap-churn');
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
  const explicit = report.liveness.explicitInputPairs.filter((pair) => pair.changed);
  const ok = samples.length >= 10 && advancing >= 7 && explicit.length >= 1;
  report.liveness.verdict = ok ? 'PASS' : 'FAIL';
  if (!ok) {
    addFailure(`liveness: samples=${samples.length}, advancingPairs=${advancing}, explicitInputChanges=${explicit.length}`, { defect: true });
  } else {
    cover('visual_liveness', `${samples.length} screenshots, ${advancing} advancing pairs, ${explicit.length} explicit input-driven screen change`);
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
  const required = [
    'boot_title',
    'settings_motion',
    'summon',
    'care_input_liveness',
    'week_plan_preview',
    'week_resolution',
    'first_battle_resolution',
    'save_export',
    'save_restore',
    'reload_persistence',
    'fresh_line_restart',
    'restart_reload',
    'second_battle_resolution',
    'bounded_ui_churn',
    'heap',
    'visual_liveness',
    'zero_console_errors',
  ];
  const missing = required.filter((name) => report.coverage[name]?.result !== 'PASS');
  if (missing.length) addFailure(`coverage gate missing: ${missing.join(', ')}`);
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
  const summary = `# Oddseedz player-path soak — ${DATE}\n\n` +
    `Verdict: **${report.verdict}**\n\n` +
    `Artifact SHA-256: \`${report.artifact.sha256 || 'unavailable'}\`\n\n` +
    `Loaded from staged out-of-repo copy: \`${report.artifact.staged || 'unavailable'}\`\n\n` +
    `## Coverage\n\n${reached || '- No states reached.'}\n\n` +
    `## Evidence gates\n\n` +
    `- Visual liveness: ${report.liveness.verdict} (${report.liveness.samples.length} samples, ${report.liveness.advancingPairs} advancing pairs)\n` +
    `- Heap: ${report.heap.verdict} (${report.heap.samples.length} samples, delta ${report.heap.deltaBytes ?? 'n/a'} bytes, threshold ${report.heap.thresholdBytes} bytes)\n` +
    `- Console/page/request errors: ${report.consoleErrors.length}/${report.pageErrors.length}/${report.requestFailures.length}\n` +
    `- Resolved battles: ${report.battles.length}\n\n` +
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  installErrorTraps(page);

  try {
    await page.goto(report.artifact.fileUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#scene').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('#title-begin').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(400);
    const boot = await snapshot(page);
    gate(boot.titleVisible && !boot.creature, 'clean profile did not reach the authored title screen', { defect: true });
    cover('boot_title', 'clean boot reached visible title with no active creature');
    await captureVisual(page, shotDir, 'boot-title');
    await sampleHeap(page, 'boot-title');

    await driveStep(
      page,
      'dismiss title with Begin',
      () => playerClick(page.locator('#title-begin')),
      (_before, after) => !after.titleVisible,
    );
    await driveStep(
      page,
      'open settings',
      () => playerClick(page.locator('#settings-open')),
      (_before, after) => after.overlays.settings,
    );
    await driveStep(
      page,
      'select reduced motion',
      () => playerClick(page.locator('[data-motion="reduced"]')),
      (_before, after) => after.settings.motionReduced,
    );
    cover('settings_motion', 'player settings changed ambient rendering to reduced motion');
    await driveStep(
      page,
      'close settings after motion choice',
      () => keyHold(page, 'Escape'),
      (_before, after) => !after.overlays.settings,
    );

    const phrase = `oddseedz soak ${DATE}`;
    await page.locator('#phrase').fill(phrase);
    await driveStep(
      page,
      'summon first creature with held Enter',
      () => keyHold(page, 'Enter'),
      (_before, after) => after.creature?.phrase === phrase && after.creature?.age === 1,
    );
    cover('summon', `real summon created ${(await snapshot(page)).creature.name} at week 1`);
    await captureVisual(page, shotDir, 'summoned-creature');
    await sampleHeap(page, 'after-summon');

    await page.waitForTimeout(500);
    const beforeCare = await captureVisual(page, shotDir, 'before-care-input');
    await driveStep(
      page,
      'pet creature',
      () => playerClick(page.locator('[data-do="pet"]')),
      (before, after) => !!before.creature && !!after.creature && (
        after.creature.bond !== before.creature.bond ||
        after.creature.stress !== before.creature.stress ||
        after.creature.fatigue !== before.creature.fatigue
      ),
    );
    const afterCare = await captureVisual(page, shotDir, 'after-care-input');
    const screenshotChanged = beforeCare.screenshotSha256 !== afterCare.screenshotSha256;
    const canvasChanged = beforeCare.canvas.hash !== afterCare.canvas.hash || beforeCare.canvas.sum !== afterCare.canvas.sum;
    const careChanged = screenshotChanged;
    report.liveness.explicitInputPairs.push({
      input: 'Pet button pointer down-hold-up',
      before: beforeCare.label,
      after: afterCare.label,
      beforeScreenshotSha256: beforeCare.screenshotSha256,
      afterScreenshotSha256: afterCare.screenshotSha256,
      beforeCanvasHash: beforeCare.canvas.hash,
      afterCanvasHash: afterCare.canvas.hash,
      screenshotChanged,
      canvasChanged,
      changed: careChanged,
    });
    gate(careChanged, 'care input changed save state but did not change the rendered screen', { defect: true });
    cover('care_input_liveness', 'petting changed creature vitals and the rendered screen');
    await sampleHeap(page, 'after-care');

    await driveStep(
      page,
      'queue power drill',
      () => playerClick(page.locator('[data-act="drill_pow"]')),
      (before, after) => after.queuedActions === before.queuedActions + 1,
    );
    await driveStep(
      page,
      'queue rest',
      () => playerClick(page.locator('[data-act="rest"]')),
      (before, after) => after.queuedActions === before.queuedActions + 1,
    );
    cover('week_plan_preview', 'two ordered actions reached the live planner preview');
    await captureVisual(page, shotDir, 'week-plan-preview');
    const beforeWeek = await snapshot(page);
    await driveStep(
      page,
      'resolve planned week',
      () => playerClick(page.locator('#endweek')),
      (_before, after) => after.creature?.age === beforeWeek.creature.age + 1 && after.queuedActions === 0,
    );
    cover('week_resolution', `planned week advanced age ${beforeWeek.creature.age}→${beforeWeek.creature.age + 1}`);
    await captureVisual(page, shotDir, 'week-resolved');
    await sampleHeap(page, 'after-week');

    await resolveBattle(page, shotDir, 'first');
    await sampleHeap(page, 'after-first-battle');
    await explicitPersistencePath(page, shotDir);
    await sampleHeap(page, 'after-save-reload');
    await freshLineRestart(page, shotDir);
    await sampleHeap(page, 'after-restart');

    for (let week = 0; week < 6; week += 1) {
      await driveStep(
        page,
        `post-restart raised week ${week + 1}`,
        () => playerClick(page.locator('#fastfwd')),
        (before, after) => after.creature?.age === before.creature?.age + 1,
      );
      await sampleHeap(page, `post-restart-week-${week + 1}`);
    }
    cover('post_restart_raising', 'fresh line completed six auto-planned raising weeks');
    await captureVisual(page, shotDir, 'post-restart-raised');
    await resolveBattle(page, shotDir, 'second');
    await sampleHeap(page, 'after-second-battle');

    await heapChurn(page, shotDir);
    await sampleHeap(page, 'final');
  } catch (error) {
    if (!(error instanceof GateFailure)) {
      addFailure(`uncaught probe error: ${error?.stack || error}`);
    }
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
  writeEvidence();
  process.exitCode = 1;
});
