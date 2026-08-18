import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const EVIDENCE = resolve(dirname(fileURLToPath(import.meta.url)));
const ARTIFACT = resolve(EVIDENCE, '../../../../dist/index.html');
const DIST_URL = 'file://' + ARTIFACT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  return chromium.launch({ headless: true });
}

async function newContext(browser) {
  return browser.newContext({ viewport: { width: 640, height: 360 } });
}

async function waitForBoot(page) {
  await page.goto(DIST_URL);
  await page.waitForFunction(() => window.__GAME && typeof window.__GAME.state === 'function', { timeout: 10000 });
  await sleep(200);
}

async function state(page) {
  return page.evaluate(() => window.__GAME.state());
}

async function screenshot(page, name) {
  const path = resolve(EVIDENCE, name + '.png');
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function signCycle(page) {
  await page.keyboard.press('Enter');
  await sleep(60);
  await page.keyboard.press('Enter');
  await sleep(60);
}

async function skipReplay(page) {
  const s = await state(page);
  if (s.overlay === 'raid') {
    await page.keyboard.press('Enter');
    await sleep(60);
  }
}

async function enterGame(page) {
  await page.keyboard.press('Enter'); // title -> orientation
  await sleep(80);
  await page.keyboard.press('Enter'); // orientation -> admin
  await sleep(80);
}

async function clickCell(page, gx, gy) {
  const st = await state(page);
  const x = st.geo.ox + gx * st.geo.cell + st.geo.cell / 2;
  const y = st.geo.oy + gy * st.geo.cell + st.geo.cell / 2;
  await page.mouse.click(x, y);
  await sleep(10);
}

async function playUntilClosed(page, policy, shots) {
  const log = [];
  for (let step = 0; step < 80; step++) {
    let s = await state(page);
    if (s.overlay === 'closed') break;
    if (s.overlay === 'raid') {
      await skipReplay(page);
      continue;
    }
    if (s.overlay === 'checklist') {
      await page.keyboard.press('Enter');
      await sleep(60);
      continue;
    }
    if (s.overlay === 'orientation') {
      await page.keyboard.press('Enter');
      await sleep(60);
      continue;
    }
    await policy(page, s, step, shots);
    await signCycle(page);
  }
  const final = await state(page);
  log.push(`closed=${final.status} cycle=${final.cycle} score=${final.score} rubric=${JSON.stringify(final.rubric)}`);
  return { final, log };
}

// ---- policies ----

async function zeroInputPolicy() {
  // nothing; just sign over
}

async function completionPolicy(page, s, step, shots) {
  const cfg = { answerCost: { surveyor: 9, auditor: 12, inspector: 15 }, fortifyCost: 50, excavateCost: 15 };
  // answer any served notice if we can cover the highest answer cost (inspector 15g)
  if (s.noticesServed > 0 && s.treasury >= 15) {
    await page.keyboard.press('a');
    await sleep(40);
  }
  // excavate a 7x7 pattern around the centre each cycle
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const st = await state(page);
      if (st.treasury >= cfg.excavateCost) await clickCell(page, 12 + dx, 8 + dy);
    }
  }
  // fortify while a buffer remains
  let st = await state(page);
  while (st.treasury >= cfg.fortifyCost + 50 && st.status === 'active' && st.overlay === null) {
    await page.keyboard.press('f');
    await sleep(30);
    st = await state(page);
  }
  if (s.cycle === 8 && !shots.surveyorServed) {
    shots.surveyorServed = true;
    await screenshot(page, '02-mastered-surveyor-served');
  }
  if (s.cycle === 13 && !shots.auditorServed) {
    shots.auditorServed = true;
    await screenshot(page, '03-mastered-auditor-served');
  }
  if (s.cycle === 18 && !shots.inspectorServed) {
    shots.inspectorServed = true;
    await screenshot(page, '04-mastered-inspector-served');
  }
}

async function insolvencyPolicy(page, s, step, shots) {
  const cfg = { answerCost: { surveyor: 9 }, fortifyCost: 50, excavateCost: 15 };
  const path = [
    { x: 14, y: 8 },
    { x: 15, y: 8 },
    { x: 15, y: 7 },
    { x: 15, y: 6 },
    { x: 15, y: 5 },
  ];
  const hasAuditor = await page.evaluate(() => {
    const f = window.__GAME.state();
    // ladder rung exposed; served status not exposed in state(), so infer from ladder rung and notices served count
    return f.ladderRung === 'auditor' || f.ladderRung === 'inspector';
  });
  const ignore = hasAuditor;
  if (!ignore && s.noticesServed > 0) {
    await page.keyboard.press('a');
    await sleep(40);
  }
  // excavate the next path cell
  for (const p of path) {
    const st = await state(page);
    if (st.treasury >= cfg.excavateCost) await clickCell(page, p.x, p.y);
  }
  if (!ignore) {
    let st = await state(page);
    while (st.treasury >= cfg.fortifyCost + 30 && st.overlay === null) {
      await page.keyboard.press('f');
      await sleep(30);
      st = await state(page);
    }
  } else {
    // spend everything on fortification, then one cheap excavation to get treasury <=3
    let st = await state(page);
    while (st.treasury >= cfg.fortifyCost && st.overlay === null) {
      await page.keyboard.press('f');
      await sleep(30);
      st = await state(page);
    }
    st = await state(page);
    if (st.treasury >= cfg.excavateCost && st.treasury - cfg.excavateCost <= 3) {
      await clickCell(page, 15, 4);
    }
  }
}

// ---- scenario runners ----

async function runZeroInput(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await waitForBoot(page);
  await screenshot(page, '01-zero-title');
  await enterGame(page);
  await screenshot(page, '01-zero-orientation');
  const { final } = await playUntilClosed(page, zeroInputPolicy, {});
  await screenshot(page, '01-zero-closed-condemned');
  await page.close();
  await context.close();
  return { scenario: 'failure-condemnation', status: final.status, cycle: final.cycle, score: final.score, rubric: final.rubric };
}

async function runCompletionTiers(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await waitForBoot(page);
  await enterGame(page);
  const shots = {};
  const { final } = await playUntilClosed(page, completionPolicy, shots);
  await screenshot(page, '05-mastered-closed-tiers');
  // restart from the closed report
  await page.keyboard.press('Enter');
  await sleep(80);
  await screenshot(page, '06-restart-orientation');
  await page.keyboard.press('Enter');
  await sleep(80);
  const restarted = await state(page);
  await screenshot(page, '06-restart-admin');
  await page.close();
  await context.close();
  return {
    scenario: 'completion-tiers',
    status: final.status,
    cycle: final.cycle,
    score: final.score,
    rubric: final.rubric,
    restartCycle: restarted.cycle,
  };
}

async function runInsolvency(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await waitForBoot(page);
  await enterGame(page);
  const { final } = await playUntilClosed(page, insolvencyPolicy, {});
  await screenshot(page, '07-insolvency-closed');
  await page.close();
  await context.close();
  return { scenario: 'failure-insolvency', status: final.status, cycle: final.cycle, score: final.score, rubric: final.rubric };
}

async function runSaveContinue(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await waitForBoot(page);
  await enterGame(page);
  // sign over 3 cycles
  for (let i = 0; i < 3; i++) {
    await signCycle(page);
    await skipReplay(page);
  }
  const before = await state(page);
  await screenshot(page, '08-save-before-reload');

  // quit (close page) and return
  await page.close();
  const page2 = await context.newPage();
  await waitForBoot(page2);
  const afterReturn = await state(page2);
  await screenshot(page2, '09-save-return-title');

  // resume
  await page2.keyboard.press('Enter');
  await sleep(80);
  const resumed = await state(page2);
  await screenshot(page2, '10-save-resumed');
  await page2.close();
  await page2.close();
  await context.close();
  return {
    scenario: 'save-continue',
    beforeReloadCycle: before.cycle,
    resumableAfterReturn: afterReturn.resumable,
    resumedCycle: resumed.cycle,
  };
}

async function main() {
  const browser = await launch();
  const results = [];
  try {
    results.push(await runZeroInput(browser));
    results.push(await runCompletionTiers(browser));
    results.push(await runInsolvency(browser));
    results.push(await runSaveContinue(browser));
  } finally {
    await browser.close();
  }
  const report = {
    artifact: ARTIFACT,
    date: new Date().toISOString(),
    results,
  };
  await import('fs').then((fs) => fs.promises.writeFile(resolve(EVIDENCE, 'report.json'), JSON.stringify(report, null, 2)));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
