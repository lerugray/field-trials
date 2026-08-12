#!/usr/bin/env node
/**
 * soak-chp.mjs — bounded Playwright soak of the combat-talk single-file artifact.
 *
 * Constraints (operator brief):
 *  - Import chromium by this exact ESM path (flattop-digital's playwright).
 *  - Drive the artifact over file:// only.
 *  - Do NOT use the boot return / __CHP as a control conduit.
 *  - Do NOT call internal helpers to fake modes; random-world discovery is a player path.
 *  - Screenshots under /tmp only. Exit nonzero on any failure.
 *
 * Run: node scripts/soak-chp.mjs
 */

import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The staged artifact to soak. Defaults to the single-file build this repo produces
// (`node scripts/build-singlefile.mjs` writes chapel-perilous.html at the repo root);
// override with CHP_SOAK_ARTIFACT=<path> to soak a specific dated build instead.
const ARTIFACT = process.env.CHP_SOAK_ARTIFACT
  || new URL('../chapel-perilous.html', import.meta.url).pathname;
const SHOT_DIR = '/tmp/chapel-perilous-soak';
const FILE_URL = pathToFileURL(ARTIFACT).href;

/** Conservative heap growth fail: >24 MiB net rise with ≥5 consecutive rises. */
const HEAP_GROWTH_FAIL_BYTES = 24 * 1024 * 1024;
const HEAP_SAMPLE_MS = 30_000;
const HEAP_INTERVAL_MS = 2_000;
const STALL_MS = 10_000;
const STEP_PAUSE_MS = 50;
const GLOBAL_DEADLINE_MS = 210_000;

const report = {
  startedAt: null,
  finishedAt: null,
  artifact: ARTIFACT,
  fileUrl: FILE_URL,
  sha256: null,
  coverage: {},
  errors: [],
  consoleErrors: [],
  pageErrors: [],
  liveness: { samples: [], verdict: 'PENDING' },
  heap: { samples: [], verdict: 'PENDING', thresholdBytes: HEAP_GROWTH_FAIL_BYTES },
  systems: {
    enemySource: null,
    dialogue: { flags: [], classes: [], lines: [] },
    persistence: { keys: [], saveStatus: null, reloadStatus: null },
    modesSeen: [],
    audio: null,
  },
  fuzz: null,
  resizeBlur: null,
  failed: false,
  failReasons: [],
};

function ts() {
  return new Date().toISOString();
}

function fail(reason) {
  report.failed = true;
  report.failReasons.push(reason);
  report.errors.push({ at: ts(), reason });
  console.error(`FAIL: ${reason}`);
}

function pass(name, detail) {
  report.coverage[name] = { result: 'PASS', at: ts(), detail: detail || null };
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function markFail(name, detail) {
  report.coverage[name] = { result: 'FAIL', at: ts(), detail: detail || null };
  fail(`${name}: ${detail || 'failed'}`);
}

function noteMode(mode) {
  if (mode && !report.systems.modesSeen.includes(mode)) report.systems.modesSeen.push(mode);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function statusText(page) {
  return page.locator('#status').innerText().catch(() => '');
}

async function canvasStats(page) {
  return page.evaluate(() => {
    const c = document.getElementById('screen');
    if (!c || !(c instanceof HTMLCanvasElement)) return { ok: false };
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false };
    const { width: w, height: h } = c;
    const data = ctx.getImageData(0, 0, w, h).data;
    let lit = 0;
    let sum = 0;
    const step = 8;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const v = data[i] + data[i + 1] + data[i + 2];
        sum += v;
        if (v > 24) lit++;
      }
    }
    let hash = 2166136261;
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        const i = (y * w + x) * 4;
        hash ^= data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11;
        hash = Math.imul(hash, 16777619);
      }
    }
    return { ok: true, w, h, lit, sum, hash: hash >>> 0 };
  });
}

function classifyStatus(s) {
  const t = (s || '').trim();
  if (!t) return { modeHint: 'blank', combat: false, talkish: false, titleish: false, deathish: false, killBeat: false, text: t };
  const lower = t.toLowerCase();
  const titleish = /chapel perilous/i.test(t) && /map is not the territory/i.test(t);
  const combat = /^round\s+\d+/i.test(t) || /pattern asserts itself/i.test(t);
  const killBeat = /pattern breaks/i.test(t);
  const deathish = /^deaths:\s*\d+/i.test(t) || (/cleared:/i.test(t) && /deaths:/i.test(t));
  const talkish =
    !combat &&
    !titleish &&
    !deathish &&
    !killBeat &&
    (
      /answers|tells you|speaks|trade|joins you|refuses|half-believe|greeting|farewell|parley|no one answers|keeps your things|grey coins/i.test(t) ||
      (t.length > 18 && !/open country|filed|reinstated|pattern asserts|chapel perilous|grass\.|ordinary/i.test(t))
    );
  let modeHint = 'unknown';
  if (titleish) modeHint = 'title';
  else if (deathish) modeHint = 'death';
  else if (combat) modeHint = 'combat';
  else if (killBeat) modeHint = 'combat-resolution';
  else if (/manual bars|threshold/i.test(t)) modeHint = 'overworld-gated';
  else if (/filed|reinstated|no such record/i.test(t)) modeHint = 'persistence';
  else if (talkish) modeHint = 'dialogue';
  else modeHint = 'play';
  return { modeHint, combat, talkish, titleish, deathish, killBeat, text: t };
}

async function focusGame(page) {
  await page.locator('#screen').click({ force: true }).catch(() => {});
  await sleep(40);
}

async function press(page, key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await sleep(STEP_PAUSE_MS);
  }
}

async function shot(page, label) {
  const file = `${SHOT_DIR}/${String(report.liveness.samples.length).padStart(3, '0')}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  const st = await statusText(page);
  const cvs = await canvasStats(page);
  const entry = {
    at: ts(),
    label,
    file,
    status: st,
    classified: classifyStatus(st),
    canvas: cvs,
  };
  report.liveness.samples.push(entry);
  if (!cvs.ok) fail(`canvas missing at ${label}`);
  else if (cvs.lit < 8) fail(`black/near-black canvas at ${label} (lit=${cvs.lit})`);
  return entry;
}

/** Stall watch: keep sending input; require status or canvas change (movement or palette). */
async function assertNotStalled(page, { timeoutMs = STALL_MS } = {}) {
  const beforeSt = await statusText(page);
  const beforeCvs = await canvasStats(page);
  const t0 = Date.now();
  let i = 0;
  const dirs = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'w', 'd', 's', 'a'];
  while (Date.now() - t0 < timeoutMs) {
    const key = i > 12 ? 'p' : dirs[i % dirs.length]; // palette is a guaranteed paint change
    await page.keyboard.press(key);
    i++;
    await sleep(60);
    const st = await statusText(page);
    const cvs = await canvasStats(page);
    if (st !== beforeSt) return { ok: true, via: 'status', st, cvs };
    if (cvs.ok && beforeCvs.ok && (cvs.hash !== beforeCvs.hash || cvs.sum !== beforeCvs.sum)) {
      return { ok: true, via: key === 'p' ? 'palette-canvas' : 'canvas', st, cvs };
    }
  }
  markFail('stall_detection', `no status/canvas change for ${timeoutMs}ms under continuous input`);
  return { ok: false };
}

async function storageSnapshot(page) {
  return page.evaluate(() => {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('chapel-perilous')) out[k] = localStorage.getItem(k);
      }
    } catch (_) {}
    return out;
  });
}

async function audioProbe(page) {
  return page.evaluate(() => {
    const list = window.__soakAudio || [];
    return list.map((ctx) => ({
      state: ctx.state,
      sampleRate: ctx.sampleRate,
      currentTime: ctx.currentTime,
    }));
  });
}

async function drawnText(page) {
  return page.evaluate(() => (window.__soakDrawText || []).slice());
}

async function installAudioHook(context) {
  await context.addInitScript(() => {
    const g = window;
    g.__soakAudio = [];
    g.__soakDrawText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function soakFillText(text, ...args) {
      try {
        g.__soakDrawText.push(String(text));
        if (g.__soakDrawText.length > 2000) g.__soakDrawText.splice(0, 1000);
      } catch (_) {}
      return fillText.call(this, text, ...args);
    };
    const Native = g.AudioContext || g.webkitAudioContext;
    if (!Native) return;
    function Wrap(Base) {
      return class extends Base {
        constructor(...args) {
          super(...args);
          try { g.__soakAudio.push(this); } catch (_) {}
        }
      };
    }
    try {
      g.AudioContext = Wrap(Native);
      if (g.webkitAudioContext) g.webkitAudioContext = g.AudioContext;
    } catch (_) {}
  });
}

async function installErrorTraps(page) {
  page.on('pageerror', (err) => {
    const msg = String(err && err.message ? err.message : err);
    report.pageErrors.push({ at: ts(), msg });
    fail(`pageerror: ${msg}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      report.consoleErrors.push({ at: ts(), text });
      fail(`console error: ${text}`);
    }
  });
}

async function dismissOverlays(page) {
  for (const k of ['Escape', 'Escape', 'Space']) {
    await page.keyboard.press(k);
    await sleep(40);
  }
}

async function bootTitle(page) {
  await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#screen', { timeout: 15_000 });
  await page.waitForSelector('#status', { timeout: 15_000 });
  await sleep(250);
  await focusGame(page);
  const st = await statusText(page);
  const cls = classifyStatus(st);
  if (!cls.titleish && !/chapel perilous/i.test(st)) {
    const cvs = await canvasStats(page);
    if (!cvs.ok || cvs.lit < 8) markFail('title_start', `no title signal; status=${JSON.stringify(st)}`);
    else pass('title_start', `canvas live; status=${JSON.stringify(st)}`);
  } else {
    pass('title_start', st);
  }
  noteMode('title');
  await shot(page, 'title');
}

async function startNewWorld(page) {
  await focusGame(page);
  await press(page, 'n');
  await sleep(150);
  await press(page, 'Enter');
  await sleep(150);
  // Nature explainer captures one key.
  await press(page, 'Space');
  await sleep(120);
  await dismissOverlays(page);
  await focusGame(page);
  const st = await statusText(page);
  const cvs = await canvasStats(page);
  if (!cvs.ok || cvs.lit < 8) markFail('creation_to_play', 'canvas dead after start');
  else pass('creation_to_play', `status=${JSON.stringify(st)}`);
  noteMode('overworld-or-play');
  await shot(page, 'after-start');
}

async function leaveCombatIfNeeded(page) {
  let st = await statusText(page);
  let cls = classifyStatus(st);
  for (let i = 0; i < 40; i++) {
    if (cls.deathish) {
      await page.keyboard.press('Space'); // take up the thread
      await sleep(100);
      await page.keyboard.press('Enter');
      await sleep(60);
      await page.keyboard.press('Space');
      await sleep(100);
    } else if (cls.killBeat) {
      await page.keyboard.press('Space');
      await sleep(70);
    } else if (cls.combat) {
      // Prefer flee; if locked in, strike a bit then flee again.
      await page.keyboard.press(i % 4 === 3 ? 'f' : 'Escape');
      await sleep(70);
    } else {
      break;
    }
    st = await statusText(page);
    cls = classifyStatus(st);
  }
  return cls;
}

async function exploreWalk(page, { maxSteps = 80, label = 'explore' } = {}) {
  const dirs = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  let steps = 0;
  let changes = 0;
  let lastSt = await statusText(page);
  let lastCvs = await canvasStats(page);
  await shot(page, `${label}-begin`);
  const t0 = Date.now();
  while (steps < maxSteps && Date.now() - t0 < GLOBAL_DEADLINE_MS) {
    const key = dirs[Math.floor(steps / 5) % 4];
    await page.keyboard.press(key);
    await sleep(STEP_PAUSE_MS);
    steps++;
    if (steps % 10 === 0) {
      await page.keyboard.press('t');
      await sleep(30);
    }
    if (steps % 12 === 0) {
      await page.keyboard.press('e');
      await sleep(30);
    }
    const st = await statusText(page);
    const cvs = await canvasStats(page);
    const cls = classifyStatus(st);
    if (cls.combat) noteMode('combat');
    if (cls.talkish) noteMode('dialogue');
    if (st !== lastSt || (cvs.ok && lastCvs.ok && cvs.hash !== lastCvs.hash)) {
      changes++;
      lastSt = st;
      lastCvs = cvs;
    }
    if (cls.combat || cls.killBeat) {
      await shot(page, `${label}-combat-interrupt`);
      return { ok: true, steps, changes, st, cls, interrupted: 'combat' };
    }
  }
  await shot(page, `${label}-end`);
  return { ok: changes >= 1, steps, changes, st: lastSt, cls: classifyStatus(lastSt) };
}

async function huntCombat(page) {
  // Leave safe radius and walk; also try site entry + confront.
  for (let wave = 0; wave < 4; wave++) {
    const walk = await exploreWalk(page, { maxSteps: 160, label: `hunt-combat-w${wave}` });
    if (walk.interrupted === 'combat' || walk.cls?.combat) {
      report.systems.enemySource = report.systems.enemySource || 'overworld-ambush-or-wanderer-contact';
      pass('combat', `status=${JSON.stringify(walk.st)} steps=${walk.steps}`);
      noteMode('combat');
      await shot(page, 'combat');
      return { ok: true, st: walk.st, cls: walk.cls };
    }
    // Site spiral: press E often; dungeon confront with F.
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'][i % 4]);
      await sleep(35);
      if (i % 2 === 0) await page.keyboard.press('e');
      await sleep(25);
      let st = await statusText(page);
      let cls = classifyStatus(st);
      if (/confront|slip past|blocks the corridor|in your path/i.test(st)) {
        await page.keyboard.press('f');
        await sleep(90);
        st = await statusText(page);
        cls = classifyStatus(st);
      }
      if (cls.combat) {
        report.systems.enemySource = 'dungeon-visible-or-ambush';
        pass('combat', st);
        noteMode('combat');
        await shot(page, 'combat');
        return { ok: true, st, cls };
      }
      // Crawl deeper if we entered a dungeon (Esc later).
      if (i % 7 === 0) {
        await page.keyboard.press('w');
        await sleep(35);
      }
    }
    await dismissOverlays(page);
  }
  markFail('combat', 'not reached after exploration waves');
  return { ok: false };
}

async function huntDialogue(page) {
  await leaveCombatIfNeeded(page);
  await dismissOverlays(page);

  // City-biased: walk + E + T. Citizens are denser than overworld wanderers.
  // Also accept combat-parley lines (T in combat → approach) as dialogue evidence
  // only when a visible talk/outcome line lands in #status — still player-keyed.
  for (let n = 0; n < 360; n++) {
    await page.keyboard.press(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][n % 4]);
    await sleep(35);
    if (n % 4 === 0) {
      await page.keyboard.press('e');
      await sleep(30);
    }
    // In city streets, linger and T-scan neighbors.
    if (n % 2 === 0) {
      const beforeTalk = await statusText(page);
      await page.keyboard.press('t');
      await sleep(50);
      let st = await statusText(page);
      let cls = classifyStatus(st);
      if (cls.deathish || cls.combat || cls.killBeat) {
        if (cls.combat) {
          // Try parley once for dialogue surface, then leave.
          await page.keyboard.press('t');
          await sleep(80);
          st = await statusText(page);
          cls = classifyStatus(st);
          // Approach pick 1 if talk submenu opened (status may stay round N).
          await page.keyboard.press('1');
          await sleep(80);
          st = await statusText(page);
          cls = classifyStatus(st);
          if (cls.talkish || /parley|overawe|impress|bargain|bind|refuses|joins|tells you/i.test(st)) {
            report.systems.dialogue.lines.push(st);
            report.systems.dialogue.classes.push('combat-talk-or-social');
            report.systems.dialogue.flags.push('player-T-combat-or-adjacent');
            pass('talk_dialogue', st);
            noteMode('dialogue');
            await shot(page, 'dialogue');
            await leaveCombatIfNeeded(page);
            return { ok: true, st, cls };
          }
          report.systems.enemySource = report.systems.enemySource || 'contact-during-talk-hunt';
          noteMode('combat');
        }
        await leaveCombatIfNeeded(page);
        continue;
      }
      if (st !== beforeTalk && cls.talkish && !/no one answers/i.test(st)) {
        report.systems.dialogue.lines.push(st);
        if (/trade|want|coins/i.test(st)) report.systems.dialogue.classes.push('barter-ish');
        else if (/join/i.test(st)) report.systems.dialogue.classes.push('join-ish');
        else if (/refuse/i.test(st)) report.systems.dialogue.classes.push('refuse-ish');
        else report.systems.dialogue.classes.push('talk-line');
        report.systems.dialogue.flags.push('player-T-adjacent');
        pass('talk_dialogue', st);
        noteMode('dialogue');
        await shot(page, 'dialogue');
        return { ok: true, st, cls };
      }
    }
  }
  markFail('talk_dialogue', `no dialogue line observed (last=${JSON.stringify(await statusText(page))})`);
  return { ok: false };
}

async function sampleHeap(page) {
  await leaveCombatIfNeeded(page);
  await dismissOverlays(page);
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < HEAP_SAMPLE_MS) {
    const used = await page.evaluate(() => {
      const m = performance && performance.memory;
      return m ? m.usedJSHeapSize : null;
    });
    samples.push({ at: ts(), usedJSHeapSize: used });
    await page.keyboard.press(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][samples.length % 4]);
    await sleep(HEAP_INTERVAL_MS);
  }
  report.heap.samples = samples;
  const nums = samples.map((s) => s.usedJSHeapSize).filter((n) => typeof n === 'number');
  if (nums.length < 5) {
    markFail('heap', 'performance.memory unavailable or too few samples');
    report.heap.verdict = 'FAIL';
    return;
  }
  let rises = 0;
  let maxRun = 0;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > nums[i - 1]) {
      rises++;
      maxRun = Math.max(maxRun, rises);
    } else rises = 0;
  }
  const delta = nums[nums.length - 1] - nums[0];
  const grossMonotonic = maxRun >= 5 && delta > HEAP_GROWTH_FAIL_BYTES;
  if (grossMonotonic) {
    report.heap.verdict = 'FAIL';
    markFail(
      'heap',
      `monotonic growth delta=${delta} bytes (threshold ${HEAP_GROWTH_FAIL_BYTES}), maxRiseRun=${maxRun}`,
    );
  } else {
    report.heap.verdict = 'PASS';
    pass(
      'heap',
      `delta=${delta} bytes over ~${HEAP_SAMPLE_MS}ms; maxRiseRun=${maxRun}; threshold=${HEAP_GROWTH_FAIL_BYTES}`,
    );
  }
}

async function rapidFuzz(page) {
  const before = await statusText(page);
  const keys = ['t', 'f', 'g', 'r', 'v', 'Escape', '1', '2', 'w', 'a', 's', 'd', 'e', 'Space'];
  const errBefore = report.consoleErrors.length + report.pageErrors.length;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(keys[i % keys.length]);
    if (i % 3 !== 0) await sleep(12);
  }
  await sleep(200);
  const after = await statusText(page);
  const cvs = await canvasStats(page);
  const errAfter = report.consoleErrors.length + report.pageErrors.length;
  report.fuzz = { before, after, lit: cvs.lit, at: ts(), newErrors: errAfter - errBefore };
  if (!cvs.ok || cvs.lit < 8) markFail('rapid_fuzz', 'canvas dead after fuzz');
  else pass('rapid_fuzz', `survived 40 rapid keys; status now ${JSON.stringify(after)}; newErrors=${errAfter - errBefore}`);
}

async function combatTalkPath(page) {
  const st = await statusText(page);
  if (!classifyStatus(st).combat) {
    return false;
  }
  await page.evaluate(() => { window.__soakDrawText = []; });
  const before = await canvasStats(page);
  await page.keyboard.press('t');
  await sleep(100);
  const opened = await canvasStats(page);
  const openText = await drawnText(page);
  await shot(page, 'combat-talk-open');
  await page.keyboard.press('1');
  await sleep(140);
  const resolved = await canvasStats(page);
  const resolvedText = await drawnText(page);
  await shot(page, 'combat-talk-resolved');
  const changedOpen = opened.ok && before.ok && opened.hash !== before.hash;
  const changedResolved = resolved.ok && opened.ok && resolved.hash !== opened.hash;
  const numberedApproach = openText.some((s) => /^\s*(?:\[[1-9]\]|[1-9][.)]?)\s/.test(s));
  const newLines = [...new Set(resolvedText.filter((s) => !openText.includes(s) && s.trim().length > 3))];
  const outcomeClass = newLines.some((s) => /\bjoins you\b/i.test(s))
    ? 'combat-recruit-response'
    : newLines.some((s) => /\brefus|harden|no approach\b/i.test(s))
      ? 'combat-refusal-or-hardened'
      : numberedApproach ? 'combat-approach-response' : 'combat-talk-response';
  if (!changedOpen && !changedResolved) {
    return false;
  } else {
    report.systems.dialogue.flags.push('combat-T');
    report.systems.dialogue.classes.push(outcomeClass);
    report.systems.dialogue.lines.push(...newLines.slice(-4));
    pass(
      'combat_talk_dialogue',
      `T changed=${changedOpen}; approach-menu=${numberedApproach}; resolve changed=${changedResolved}; new draw text=${JSON.stringify(newLines.slice(-4))}`,
    );
    return true;
  }
}

async function resizeBlurFocus(page) {
  const before = await canvasStats(page);
  await page.setViewportSize({ width: 1100, height: 720 });
  await sleep(200);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(100);
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await focusGame(page);
  await page.keyboard.press('ArrowRight');
  await sleep(100);
  const after = await canvasStats(page);
  report.resizeBlur = {
    at: ts(),
    beforeLit: before.lit,
    afterLit: after.lit,
    beforeHash: before.hash,
    afterHash: after.hash,
  };
  if (!after.ok || after.lit < 8) markFail('resize_blur_focus', 'canvas dead after resize/blur/focus');
  else pass('resize_blur_focus', `lit ${before.lit}→${after.lit}`);
}

async function audioCheck(page) {
  await focusGame(page);
  await page.keyboard.press('m');
  await sleep(100);
  await page.keyboard.press('m');
  await sleep(150);
  const states = await audioProbe(page);
  report.systems.audio = { at: ts(), contexts: states };
  if (!states.length) markFail('audio_gesture', 'no AudioContext constructed after keyboard gesture');
  else if (states.some((s) => s.state === 'running')) pass('audio_gesture', `AudioContext running (${states.length})`);
  else {
    await focusGame(page);
    await page.keyboard.press('Space');
    await sleep(200);
    const states2 = await audioProbe(page);
    report.systems.audio.afterClick = states2;
    if (states2.some((s) => s.state === 'running')) pass('audio_gesture', 'AudioContext running after click+key');
    else if (states2.length) pass('audio_gesture', `AudioContext present state=${states2.map((s) => s.state).join(',')}`);
    else markFail('audio_gesture', 'AudioContext missing after gestures');
  }
}

async function persistencePath(page) {
  await leaveCombatIfNeeded(page);
  await dismissOverlays(page);
  await focusGame(page);
  await page.keyboard.press('k');
  await sleep(150);
  let st = await statusText(page);
  report.systems.persistence.saveStatus = st;
  const store1 = await storageSnapshot(page);
  const keys = Object.keys(store1);
  report.systems.persistence.keys = keys;
  if (!keys.some((k) => k.startsWith('chapel-perilous.world-save.') || k === 'chapel-perilous.worlds')) {
    markFail('save_persistence', `no chapel-perilous keys after K; status=${JSON.stringify(st)}`);
  } else {
    pass('save_persistence', `keys=${keys.join(',')} status=${JSON.stringify(st)}`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(300);
  await focusGame(page);
  await shot(page, 'reload-after-save');
  await page.keyboard.press('ArrowDown');
  await sleep(80);
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.press('Space');
  await sleep(150);
  st = await statusText(page);
  report.systems.persistence.reloadStatus = st;
  const store2 = await storageSnapshot(page);
  if (!Object.keys(store2).length) markFail('save_persistence_reload', 'localStorage empty after reload+continue');
  else pass('reload_after_save', `status=${JSON.stringify(st)}`);
}

async function reloadDuringDialogueOrCombat(page) {
  let st = await statusText(page);
  let cls = classifyStatus(st);
  if (!cls.combat && !cls.talkish) {
    await page.keyboard.press('t');
    await sleep(80);
    st = await statusText(page);
    cls = classifyStatus(st);
  }
  const phase = cls.combat ? 'combat' : cls.talkish ? 'dialogue' : 'play';
  await shot(page, `pre-reload-${phase}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(300);
  await focusGame(page);
  const st2 = await statusText(page);
  const cvs = await canvasStats(page);
  if (!cvs.ok || cvs.lit < 8) markFail('reload_mid_flow', `dead canvas after reload during ${phase}`);
  else pass('reload_mid_flow', `reloaded during ${phase}; status=${JSON.stringify(st2)}`);
  await page.keyboard.press('ArrowDown');
  await sleep(50);
  await page.keyboard.press('Enter');
  await sleep(120);
  await page.keyboard.press('Space');
  await sleep(100);
}

async function deathRestartPath(page) {
  // Pursue death across multiple combats. Death status: "deaths: N · cleared: M".
  for (let fight = 0; fight < 8; fight++) {
    let cls = classifyStatus(await statusText(page));
    if (!cls.combat) {
      const c = await huntCombat(page);
      if (!c.ok) break;
    }
    await shot(page, `death-push-fight-${fight}`);
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('f');
      await sleep(65);
      const st = await statusText(page);
      cls = classifyStatus(st);
      if (cls.deathish) {
        noteMode('death');
        await shot(page, 'death');
        await page.keyboard.press('Space'); // take up the thread
        await sleep(150);
        await page.keyboard.press('Enter');
        await sleep(100);
        await page.keyboard.press('Space');
        await sleep(150);
        const st2 = await statusText(page);
        const cvs = await canvasStats(page);
        if (!cvs.ok || cvs.lit < 8) markFail('death_restart', 'dead canvas after restart');
        else pass('death_restart', `restarted after death; status=${JSON.stringify(st2)}`);
        return;
      }
      if (cls.killBeat) {
        // Won this fight — dismiss resolution and hunt a harder one.
        await page.keyboard.press('Space');
        await sleep(80);
        break;
      }
    }
    await leaveCombatIfNeeded(page);
    await dismissOverlays(page);
  }
  markFail(
    'death_restart',
    `no death screen after multi-fight strike sequences; status=${JSON.stringify(await statusText(page))}`,
  );
}

async function livenessVerdict() {
  const samples = report.liveness.samples;
  if (samples.length < 4) {
    report.liveness.verdict = 'FAIL';
    markFail('liveness', 'too few screenshot samples');
    return;
  }
  let changed = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const statusAdv = a.status !== b.status;
    const pix =
      a.canvas?.ok && b.canvas?.ok && (a.canvas.hash !== b.canvas.hash || a.canvas.lit !== b.canvas.lit);
    if (statusAdv || pix) changed++;
  }
  const black = samples.filter((s) => s.canvas?.ok && s.canvas.lit < 8);
  if (black.length) {
    report.liveness.verdict = 'FAIL';
    markFail('liveness', `${black.length} black/near-black frames`);
  } else if (changed < 2) {
    report.liveness.verdict = 'FAIL';
    markFail('liveness', `insufficient advancing frames (changed=${changed})`);
  } else {
    report.liveness.verdict = 'PASS';
    pass('liveness', `samples=${samples.length} advancingPairs=${changed}`);
  }
}

async function continueFromTitle(page) {
  await focusGame(page);
  await page.keyboard.press('ArrowDown');
  await sleep(50);
  await page.keyboard.press('Enter');
  await sleep(120);
  await page.keyboard.press('Space');
  await sleep(100);
}

async function main() {
  report.startedAt = ts();
  mkdirSync(SHOT_DIR, { recursive: true });
  if (!existsSync(ARTIFACT)) {
    fail(`artifact missing: ${ARTIFACT}`);
    report.finishedAt = ts();
    writeFileSync(`${SHOT_DIR}/soak-raw.json`, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const s = createReadStream(ARTIFACT);
    s.on('data', (c) => hash.update(c));
    s.on('end', resolve);
    s.on('error', reject);
  });
  report.sha256 = hash.digest('hex');
  console.log(`artifact sha256: ${report.sha256}`);
  console.log(`file url: ${FILE_URL}`);
  console.log(`started: ${report.startedAt}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await installAudioHook(context);
  const page = await context.newPage();
  await installErrorTraps(page);

  try {
    await bootTitle(page);
    await audioCheck(page);
    await startNewWorld(page);

    const explored = await exploreWalk(page, { maxSteps: 50, label: 'explore-liveness' });
    if (explored.ok || explored.changes >= 1 || explored.interrupted) {
      pass('exploration', `steps=${explored.steps} changes=${explored.changes} interrupted=${explored.interrupted || 'none'}`);
    } else {
      await leaveCombatIfNeeded(page);
      const stall = await assertNotStalled(page);
      if (stall.ok) pass('exploration', `recovered via stall-watch (${stall.via})`);
      else markFail('exploration', 'canvas/status did not advance during walk');
    }
    // Bounded stall probe on a nav surface (not inside combat/death).
    await leaveCombatIfNeeded(page);
    await dismissOverlays(page);
    if (!report.coverage.stall_detection) {
      const stall = await assertNotStalled(page);
      if (stall.ok) pass('stall_detection', `liveness via ${stall.via}`);
    }

    await huntDialogue(page);
    await reloadDuringDialogueOrCombat(page);
    await continueFromTitle(page);

    const combat = await huntCombat(page);
    let combatTalkCovered = combat && combat.ok ? await combatTalkPath(page) : false;
    for (let attempt = 1; !combatTalkCovered && attempt < 5; attempt++) {
      await leaveCombatIfNeeded(page);
      await dismissOverlays(page);
      const retryCombat = await huntCombat(page);
      if (retryCombat.ok) combatTalkCovered = await combatTalkPath(page);
    }
    if (!combatTalkCovered) {
      markFail('combat_talk_dialogue', 'no painted T/approach transition across five combats');
    }
    await rapidFuzz(page);

    if (combat && combat.ok) {
      await shot(page, 'pre-reload-after-combat');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await sleep(300);
      await focusGame(page);
      const cvs = await canvasStats(page);
      if (!cvs.ok || cvs.lit < 8) markFail('reload_after_combat', 'dead canvas');
      else pass('reload_after_combat', 'booted after combat-phase reload');
      await continueFromTitle(page);
    } else {
      markFail('reload_after_combat', 'skipped — combat never entered');
    }

    await resizeBlurFocus(page);
    await persistencePath(page);
    await continueFromTitle(page);
    await deathRestartPath(page);
    await sampleHeap(page);
    await livenessVerdict();
  } catch (err) {
    fail(`uncaught: ${err && err.stack ? err.stack : err}`);
  } finally {
    report.finishedAt = ts();
    writeFileSync(`${SHOT_DIR}/soak-raw.json`, JSON.stringify(report, null, 2));
    await browser.close().catch(() => {});
  }

  console.log(`finished: ${report.finishedAt}`);
  console.log(`failed=${report.failed} reasons=${report.failReasons.length}`);
  // Explicit nonzero on any failure (including zero-tolerance console/page errors).
  process.exit(report.failed ? 1 : 0);
}

main();
