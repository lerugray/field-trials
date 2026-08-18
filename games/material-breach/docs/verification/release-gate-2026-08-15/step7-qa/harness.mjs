// step7-qa harness — real-browser defect hunt against the shipped dist/index.html.
// Read-only to src/dist/test; writes evidence only under this directory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const DIST = resolve(ROOT, 'dist', 'index.html');
const fileUrl = 'file://' + encodeURI(DIST);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)));
mkdirSync(OUT, { recursive: true });

const { chromium } = await import('playwright');

const findings = [];
let evCount = 0;
const ev = (stem) => `${String(++evCount).padStart(2, '0')}-${stem}`;

function addFinding({ severity, summary, repro, detail = '', evidence = [] }) {
  findings.push({ severity, summary, repro, detail, evidence });
}

const browser = await chromium.launch({ headless: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function newPage(viewport = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (err) => {
    addFinding({
      severity: 'MAJOR',
      summary: `Uncaught page error: ${err.message.slice(0, 80)}`,
      repro: 'Observed during Playwright-driven interaction.',
      detail: err.stack || err.message,
      evidence: [],
    });
  });
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error') {
      addFinding({
        severity: 'MAJOR',
        summary: `Console error: ${msg.text().slice(0, 80)}`,
        repro: 'Observed during Playwright-driven interaction.',
        detail: msg.text(),
        evidence: [],
      });
    }
  });
  return page;
}

async function waitBoot(page) {
  await page.waitForFunction(() => !!window.__GAME, { timeout: 10000 });
  await sleep(250);
}

async function gameState(page) {
  return page.evaluate(() => window.__GAME.state());
}

async function canvasRect(page) {
  return page.evaluate(() => {
    const c = document.getElementById('screen');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

async function clickBuffer(page, bx, by) {
  const r = await canvasRect(page);
  const x = r.left + bx * (r.width / 640);
  const y = r.top + by * (r.height / 360);
  await page.mouse.click(x, y);
}

async function clickButton(page, id) {
  const s = await gameState(page);
  const b = s.buttons.find((b) => b.id === id);
  if (!b) throw new Error(`button ${id} not available (overlay=${s.overlay}, status=${s.status})`);
  const r = await canvasRect(page);
  const x = r.left + (b.x + b.w / 2) * (r.width / 640);
  const y = r.top + (b.y + b.h / 2) * (r.height / 360);
  await page.mouse.click(x, y);
}

async function capture(page, stem) {
  await sleep(180);
  const name = ev(stem) + '.png';
  await page.screenshot({ path: resolve(OUT, name) });
  return name;
}

async function clearStorage(page) {
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}

async function gotoGame(page) {
  await page.goto(fileUrl);
  await waitBoot(page);
}

async function signOver(page) {
  await clickButton(page, 'sign');
  await sleep(200);
  await clickButton(page, 'confirm');
  await sleep(250);
  // skip any replay quickly
  let s = await gameState(page);
  let guard = 0;
  while (s.overlay === 'raid' && guard < 30) {
    await clickButton(page, 'skip-replay');
    await sleep(200);
    s = await gameState(page);
    guard++;
  }
  return s;
}

// ------------------------------------------------------------------
// Scenario 1 — menus, documented input verbs, rapid input
// ------------------------------------------------------------------
async function scenario1() {
  const page = await newPage();
  await clearStorage(page);
  await gotoGame(page);

  await capture(page, 's1-title');

  // Open options via mouse, then back via keyboard X
  await clickButton(page, 'options');
  await capture(page, 's1-options');
  await page.keyboard.press('x');
  await sleep(150);

  // Provenance via keyboard P, back via mouse
  await page.keyboard.press('p');
  await sleep(150);
  await capture(page, 's1-provenance');
  await clickButton(page, 'totitle');
  await sleep(150);

  // Enter premises -> orientation
  await clickButton(page, 'enter');
  await capture(page, 's1-orientation');

  // Begin administration
  await clickButton(page, 'begin');
  await capture(page, 's1-admin');

  // Pause and resume from admin
  await page.keyboard.press('Escape');
  await capture(page, 's1-pause-from-admin');
  await page.keyboard.press('Escape');
  await sleep(150);

  // Pan with keys (state().geo reflects pan via ox/oy)
  const geo0 = await gameState(page).then((s) => s.geo);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('w');
  const geo1 = await gameState(page).then((s) => s.geo);
  if (geo1.ox === geo0.ox && geo1.oy === geo0.oy) {
    addFinding({ severity: 'MINOR', summary: 'Keyboard pan did not change the camera geometry', repro: 'Press ArrowRight/W in admin; read state().geo before/after.', evidence: [await capture(page, 's1-pan-check')] });
  }

  // Spiral search for a valid rock cell to excavate
  const beforeState = await gameState(page);
  const beforeOrders = beforeState.ordersOpen;
  const beforeGold = beforeState.treasury;
  const centre = { x: 180, y: 160 };
  let found = false;
  for (let radius = 20; radius <= 140 && !found; radius += 20) {
    for (let a = 0; a < 8 && !found; a++) {
      const ang = (a * Math.PI) / 4;
      const bx = centre.x + Math.cos(ang) * radius;
      const by = centre.y + Math.sin(ang) * radius;
      await clickBuffer(page, bx, by);
      await sleep(60);
      const sNow = await gameState(page);
      if (sNow.ordersOpen > beforeOrders || sNow.treasury < beforeGold) {
        found = true;
      }
    }
  }
  if (!found) {
    addFinding({ severity: 'BLOCKER', summary: 'Grid click excavation did not raise any works order', repro: 'With Tool: Excavate active, spiral-click cells inside the cutaway.', evidence: [await capture(page, 's1-excavate-failed')] });
  } else {
    // Verify the order completes into an excavated cell after one sign-over
    const beforeExc = (await gameState(page)).excavated;
    await signOver(page);
    const afterExc = (await gameState(page)).excavated;
    if (afterExc <= beforeExc) {
      addFinding({ severity: 'BLOCKER', summary: 'Queued excavation did not complete after signing the cycle over', repro: 'Queue an excavation, sign the cycle over, check excavated count.', evidence: [await capture(page, 's1-excavate-not-done')] });
    }
  }

  // Cycle tool to Fabrication and designate a claimed floor cell
  for (let i = 0; i < 3; i++) await page.keyboard.press('t');
  const rooms0 = (await gameState(page)).rooms;
  await clickBuffer(page, 180, 160);
  await sleep(100);
  const rooms1 = (await gameState(page)).rooms;
  if (rooms1 <= rooms0) {
    addFinding({ severity: 'MAJOR', summary: 'Tool designation to Fabrication did not create a room', repro: 'Cycle tool to Fabrication, click a claimed floor cell near the centre.', evidence: [await capture(page, 's1-designate-failed')] });
  }

  // Sign over once and come back to admin
  await signOver(page);
  await capture(page, 's1-after-first-cycle');

  // Fabricate should now be available
  const sFab = await gameState(page);
  const hasFabBtn = sFab.buttons.some((b) => b.id === 'fabricate');
  if (hasFabBtn && sFab.treasury.gold >= 35) {
    const gold0 = sFab.treasury.gold;
    await clickButton(page, 'fabricate');
    const gold1 = (await gameState(page)).treasury.gold;
    if (gold0 - gold1 !== 35) {
      addFinding({ severity: 'MAJOR', summary: 'Fabricate button cost mismatch', repro: 'Click Fabricate 35g; compare treasury before/after.', detail: `before=${gold0} after=${gold1}`, evidence: [await capture(page, 's1-fabricate-cost')] });
    }
  }

  // Rapid mashed input
  const mashPromises = [];
  for (let i = 0; i < 20; i++) {
    mashPromises.push(page.keyboard.press(['Enter', 'Escape', 'x', 't', 'f', 'r'][i % 6]));
    mashPromises.push(clickBuffer(page, 100 + (i * 10) % 400, 100 + (i * 17) % 200));
  }
  await Promise.all(mashPromises.map((p) => p.catch(() => {})));
  await sleep(400);
  await capture(page, 's1-after-mash');

  await page.close();
}

// ------------------------------------------------------------------
// Scenario 2 — edge states: resize, tab-away, pause during transitions
// ------------------------------------------------------------------
async function scenario2() {
  const page = await newPage();
  await clearStorage(page);
  await gotoGame(page);

  await clickButton(page, 'enter');
  await clickButton(page, 'begin');
  await sleep(200);

  // Resize mid-admin
  await page.setViewportSize({ width: 800, height: 600 });
  await sleep(300);
  await capture(page, 's2-resize-admin');

  // Tab away / refocus via visibilitychange
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(300);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(200);
  await capture(page, 's2-tab-away');

  // Sign over and try to pause/resize during replay
  await clickButton(page, 'sign');
  await clickButton(page, 'confirm');
  await sleep(200);
  const s2 = await gameState(page);
  if (s2.overlay === 'raid') {
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1024, height: 768 });
    await sleep(200);
    await capture(page, 's2-resize-replay');
    await clickButton(page, 'skip-replay');
  }
  await sleep(300);
  await capture(page, 's2-after-replay');

  // Pause during admin after replay
  await page.keyboard.press('Escape');
  await capture(page, 's2-pause-admin');
  await page.keyboard.press('Escape');

  await page.close();
}

// ------------------------------------------------------------------
// Scenario 3 — savegame tampering
// ------------------------------------------------------------------
async function scenario3(closedSaveJson) {
  const page = await newPage();
  await clearStorage(page);
  await gotoGame(page);

  // Corrupt save
  await page.evaluate(() => localStorage.setItem('material-breach:save', '{"v":1,"facility":broken}'));
  await page.reload();
  await waitBoot(page);
  const overlay = (await gameState(page)).overlay;
  if (overlay !== 'title' && overlay !== 'error') {
    addFinding({ severity: 'MAJOR', summary: 'Corrupted save did not land on title/error surface', repro: 'Set material-breach:save to invalid JSON and reload.', detail: `overlay=${overlay}`, evidence: [await capture(page, 's3-corrupt-landing')] });
  }
  if (overlay !== 'error') {
    addFinding({ severity: 'MAJOR', summary: 'Corrupted localStorage save is silently ignored; no LOUD notice surfaced', repro: 'Set material-breach:save to malformed JSON and reload the game.', detail: 'The load() helper returns ok:false and logs, but the player sees only the title.', evidence: [await capture(page, 's3-corrupt-silent')] });
  }

  // Closed-tenure save should not be offered for resumption
  if (closedSaveJson) {
    await page.evaluate((json) => localStorage.setItem('material-breach:save', json), closedSaveJson);
    await page.reload();
    await waitBoot(page);
    const s = await gameState(page);
    if (s.resumable) {
      addFinding({ severity: 'MAJOR', summary: 'A closed tenure is offered for resumption', repro: 'Save a facility with status !== active and reload.', evidence: [await capture(page, 's3-closed-resumable')] });
    }
  }

  await page.close();
}

// ------------------------------------------------------------------
// Scenario 4 — consecutive runs, arithmetic consistency, state bleed
// ------------------------------------------------------------------
async function scenario4() {
  const page = await newPage();
  await clearStorage(page);
  await gotoGame(page);

  let closedSaveJson = null;
  const runSummaries = [];

  for (let run = 0; run < 3; run++) {
    // start a fresh tenure
    if (run > 0) {
      await clickButton(page, 'newtenure');
      await clickButton(page, 'begin');
    } else {
      await clickButton(page, 'enter');
      await clickButton(page, 'begin');
    }
    await sleep(200);
    let startState = await gameState(page);
    if (startState.cycle !== 1 || startState.treasury !== 400 || startState.ladderRung !== 'none' || startState.ordersOpen !== 0) {
      addFinding({ severity: 'BLOCKER', summary: `State bleed into run ${run + 1}: new tenure did not reset`, repro: 'Begin a new tenure after a closed one and inspect state().', detail: JSON.stringify(startState), evidence: [await capture(page, `s4-run${run + 1}-not-reset`)] });
    }

    // play until closed
    let cycleCount = 0;
    let answered = false;
    for (let i = 0; i < 35; i++) {
      const s = await gameState(page);
      if (s.status !== 'active') break;
      cycleCount = s.cycle;

      // opportunistic fortify
      if (s.treasury.gold >= 50) {
        await clickButton(page, 'fortify');
        await sleep(50);
      }

      // answer a served notice and check cost arithmetic
      if (s.noticesServed > 0 && !answered && s.treasury.gold >= 9) {
        const ansBtn = s.buttons.find((b) => b.id === 'answer');
        const labelCost = ansBtn ? parseInt(ansBtn.label.match(/\d+/)?.[0] || '0', 10) : 0;
        const gold0 = s.treasury.gold;
        await clickButton(page, 'answer');
        const gold1 = (await gameState(page)).treasury.gold;
        if (gold0 - gold1 !== labelCost) {
          addFinding({ severity: 'MAJOR', summary: 'Answer-notice cost does not match button label', repro: 'Click Answer when a notice is served; compare treasury delta to label cost.', detail: `label=${labelCost} delta=${gold0 - gold1}`, evidence: [await capture(page, `s4-run${run + 1}-answer-cost`)] });
        }
        answered = true;
      }

      await signOver(page);
      await sleep(100);
    }

    const endState = await gameState(page);
    await capture(page, `s4-run${run + 1}-closed`);
    runSummaries.push({ run: run + 1, status: endState.status, cycle: endState.cycle, score: endState.score, treasury: endState.treasury });

    // Score formula check: (cycle-1)*10 + max(0,treasury)
    if (endState.score !== null) {
      const expected = (endState.cycle - 1) * 10 + Math.max(0, endState.treasury);
      if (endState.score !== expected) {
        addFinding({ severity: 'MAJOR', summary: 'Closing score does not match tenure+solven cy formula', repro: 'Let a tenure close and compare state().score to (cycle-1)*10 + treasury.', detail: `score=${endState.score} expected=${expected}`, evidence: [await capture(page, `s4-run${run + 1}-score`)] });
      }
    }

    // Grab the closed save for scenario 3
    if (run === 0) {
      closedSaveJson = await page.evaluate(() => localStorage.getItem('material-breach:save'));
    }
  }

  await page.close();
  return { closedSaveJson, runSummaries };
}

// ------------------------------------------------------------------
// Run all scenarios
// ------------------------------------------------------------------
try {
  await scenario1();
  await scenario2();
  const { closedSaveJson } = await scenario4();
  await scenario3(closedSaveJson);
} catch (err) {
  addFinding({ severity: 'BLOCKER', summary: 'Harness crashed', repro: 'The QA script itself threw.', detail: err.stack || err.message });
}

await browser.close();

// Write findings
writeFileSync(resolve(OUT, 'findings.json'), JSON.stringify(findings, null, 2));

const mdLines = [
  '# Release Gate STEP 7 — QA sweep findings',
  `Generated: ${new Date().toISOString()}`,
  `Artifact: ${DIST}`,
  ``,
  findings.length === 0
    ? 'No findings recorded.'
    : findings
        .sort((a, b) => {
          const rank = { BLOCKER: 0, MAJOR: 1, MINOR: 2, COSMETIC: 3 };
          return rank[a.severity] - rank[b.severity];
        })
        .map((f, i) => {
          const evs = f.evidence.length ? f.evidence.join(', ') : 'none';
          return `${i + 1}. **[${f.severity}]** ${f.summary}\n   - Repro: ${f.repro}\n   - Evidence: ${evs}${f.detail ? '\n   - Detail: ' + f.detail : ''}`;
        })
        .join('\n\n'),
];
writeFileSync(resolve(OUT, 'findings.md'), mdLines.join('\n'));

console.log(`findings: ${findings.length}`);
console.log('evidence files:', evCount);
