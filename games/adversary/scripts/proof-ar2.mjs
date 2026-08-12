// proof-ar2.mjs — captures the AR2 environment pass from the shipped file:// build.
// Positions intentionally match proof-ar1.mjs for direct comparison. Fixed 512x480 viewport;
// dated operator-facing filenames are never overwritten. Also builds the required curated-asset
// contact sheet directly from the shipped PNG copies (no generated imagery).
//
// Usage: node scripts/proof-ar2.mjs [YYYYMMDD or YYYYMMDDx recapture stamp]

import { chromium } from 'playwright';
import { writeBuild } from './build.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 512, height: 480 };
const ENVIRONMENT_ASSETS = [
  ['env_tile_cemetery.png', 'CEMETERY STONE'],
  ['env_tile_crypt.png', 'CRYPT MASONRY'],
  ['env_tile_keep.png', 'KEEP MASONRY'],
  ['env_prop_banner.png', 'HANGING BANNER'],
  ['env_prop_gargoyle.png', 'WALL RELIEF'],
];

function stamp() {
  const arg = process.argv[2];
  if (arg && /^\d{8}[a-z]?$/.test(arg)) return arg; // suffix = re-capture round, never overwrite
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function fresh(path) {
  if (existsSync(path)) throw new Error(`refusing to overwrite proof: ${path}`);
  return path;
}

async function captureContactSheet(page, outputPath) {
  await page.setViewportSize({ width: 512, height: 240 });
  await page.setContent('<!doctype html><canvas id="sheet" width="512" height="240"></canvas>');
  const items = ENVIRONMENT_ASSETS.map(([file, label]) => ({
    label,
    src: `data:image/png;base64,${readFileSync(join(ROOT, 'assets', 'art', file)).toString('base64')}`,
  }));
  await page.evaluate(async (assets) => {
    const canvas = document.querySelector('#sheet');
    document.body.style.cssText = 'margin:0;background:#0b0c12;overflow:hidden';
    canvas.style.cssText = 'display:block;image-rendering:pixelated';
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#14151e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e6dcbf';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('AR2 CURATED ENVIRONMENT', 16, 24);
    ctx.fillStyle = '#8b90a6';
    ctx.font = '10px monospace';
    ctx.fillText('WILLIBAB / MONSTERETROPE · CC BY', 16, 41);
    const loaded = await Promise.all(assets.map((asset) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ ...asset, image });
      image.src = asset.src;
    })));
    const cellW = 96;
    for (let i = 0; i < loaded.length; i++) {
      const asset = loaded[i];
      const x = 16 + i * cellW;
      const y = 62;
      ctx.fillStyle = '#23242f';
      ctx.fillRect(x, y, 80, 116);
      ctx.strokeStyle = '#5c6070';
      ctx.strokeRect(x + 0.5, y + 0.5, 79, 115);
      const scale = asset.image.height > 16 ? 3 : 4;
      const w = asset.image.width * scale;
      const h = asset.image.height * scale;
      ctx.drawImage(asset.image, x + Math.floor((80 - w) / 2), y + 12, w, h);
      ctx.fillStyle = '#f0c84a';
      ctx.font = '9px monospace';
      const words = asset.label.split(' ');
      words.forEach((word, row) => ctx.fillText(word, x + 5, y + 92 + row * 11));
    }
    ctx.fillStyle = '#5c6070';
    ctx.font = '9px monospace';
    ctx.fillText('CURATED CROPS ONLY · SOURCE COORDINATES IN assets/art/MANIFEST.json', 16, 218);
  }, items);
  await page.screenshot({ path: fresh(outputPath) });
}

async function captureHudCloseup(page, outputPath) {
  // The display canvas is exactly 2x logical at this proof viewport. Crop logical (4,4)-(252,60)
  // from that display and scale it another 2x with smoothing disabled: 4x logical pixels total.
  const dataUrl = await page.evaluate(() => {
    const source = document.querySelector('#screen');
    const crop = document.createElement('canvas');
    crop.width = 248 * 4;
    crop.height = 56 * 4;
    const ctx = crop.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 8, 8, 496, 112, 0, 0, crop.width, crop.height);
    return crop.toDataURL('image/png');
  });
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
  writeFileSync(fresh(outputPath), Buffer.from(payload, 'base64'));
}

async function captureAnimationStrip(page, kind, outputPath) {
  await page.setViewportSize({ width: 1280, height: 264 });
  const contacts = await page.evaluate((stripKind) => {
    let canvas = document.querySelector('#animation-strip');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'animation-strip';
      document.body.replaceChildren(canvas);
    }
    document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
    canvas.style.cssText = 'display:block;width:1280px;height:264px;image-rendering:pixelated';
    return window.__drawAnimationStrip(canvas, stripKind);
  }, kind);
  await page.locator('#animation-strip').screenshot({ path: fresh(outputPath) });
  return contacts;
}

async function launchProofBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.includes('MachPortRendezvousServer') || !message.includes('Permission denied')) throw error;
    // Managed macOS hosts can forbid Chromium's child-process Mach rendezvous while still allowing
    // the same local engine to render. Single-process mode changes only browser process topology;
    // the proof still loads the shipped file:// build and captures its real canvas output.
    console.warn('default Chromium launch denied Mach rendezvous; retrying single-process proof mode');
    return chromium.launch({ args: ['--single-process', '--no-zygote'] });
  }
}

async function main() {
  const outPath = writeBuild();
  const browser = await launchProofBrowser();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(pathToFileURL(outPath).href);
  await page.waitForTimeout(400);

  const date = stamp();
  const dir = join(ROOT, 'docs', 'proofs', `reskin2-${date}`);
  mkdirSync(dir, { recursive: true });
  const readmePath = join(dir, 'README.md');
  const heroSelected = date.localeCompare('20260808f') >= 0;
  const heroIntegrated = date.localeCompare('20260810i') >= 0;
  const heroNote = heroIntegrated
    ? 'Ray-certified paint-over Variant B (bare-headed) is the selected protagonist'
    : heroSelected
    ? 'Hero candidate B (red/orange shield fighter) is the selected protagonist'
    : 'Hero remains the current big knight pending the operator pick';
  const readme = heroIntegrated
    ? `${heroNote}; hooded and helmed remain loadable alternates.\n` +
      'The former Willibab candidate B is retained under assets/art/backup/willibab-candidate-b/.\n'
    : heroSelected
    ? `${heroNote}; candidate C (blue hooded caster) is the named backup.\n` +
      'The operator-pick strip is in ../ar2d-20260808e/hero-candidates-20260808e.png.\n'
    : `${heroNote}; these frames verify ground contact and text layout only.\n` +
      `The design-only candidate strip is in ../ar2d-${date}/hero-candidates-${date}.png.\n`;
  if (!existsSync(readmePath)) writeFileSync(readmePath, readme);
  else if (!readFileSync(readmePath, 'utf8').includes(heroNote)) {
    throw new Error(`README exists without hero-decision note: ${readmePath}`);
  }
  const problems = [];
  const shots = [];
  const contactCases = [];
  const animationCases = [];
  const findDef = (id) => page.evaluate((nodeId) => {
    for (const node of window.__nodes) {
      if (node.id === nodeId && node.stage) return (window.__pick = node.stage, true);
      if (node.branch) {
        if (node.branch.left.id === nodeId) return (window.__pick = node.branch.left.stage, true);
        if (node.branch.right.id === nodeId) return (window.__pick = node.branch.right.stage, true);
      }
    }
    return false;
  }, id);

  for (const [id, expectedTheme] of [['s1', 'cemetery'], ['s4', 'crypt'], ['s6', 'keep']]) {
    if (!await findDef(id)) { problems.push(`${id}: stage def not found`); continue; }
    const theme = await page.evaluate(() => {
      const stage = window.__loadStageDef(window.__pick);
      stage.player.x = Math.min(stage.player.x + 100, stage.tilemap.worldWidth - 40);
      // Keep the hero clear of patrols during the settle frames: a contact hit sets
      // i-frames, and the blink can hide the PROTAGONIST in the captured still
      // (operator-caught 2026-08-08 — the first AR2 s1 frame shipped hero-less).
      for (const e of stage.enemies ?? []) {
        if (Math.abs(e.x - stage.player.x) < 40) stage.player.x = e.x - 56;
      }
      stage.iframes = 0;
      stage.camera.x = Math.max(0, Math.min(stage.player.x - 128, stage.tilemap.worldWidth - 256));
      return stage.theme;
    });
    if (theme !== expectedTheme) problems.push(`${id}: theme ${theme} != ${expectedTheme}`);
    await page.waitForTimeout(180);
    const shot = fresh(join(dir, `ar2-${id}-${date}.png`));
    await page.screenshot({ path: shot });
    shots.push(shot);
  }

  // Dedicated 4x nearest-neighbor HUD inspection crop, captured without an overlay dimming it.
  await findDef('s1');
  await page.evaluate(() => window.__loadStageDef(window.__pick));
  await page.waitForTimeout(80);
  const hudCloseup = fresh(join(dir, `ar2-hud-closeup-${date}.png`));
  await captureHudCloseup(page, hudCloseup);
  shots.push(hudCloseup);

  await findDef('s1');
  await page.evaluate(() => {
    const stage = window.__loadStageDef(window.__pick);
    const enemy = stage.enemies.find((candidate) => candidate.type.id === 'walker');
    if (enemy) {
      const surfaceY = stage.player.y;
      for (const candidate of stage.enemies) candidate.alive = candidate === enemy;
      Object.assign(stage.player, { x: 112, y: surfaceY, vx: 0, vy: 0, onGround: true, facing: 1 });
      Object.assign(enemy, { x: 132, y: surfaceY, vx: 0, vy: 0, onGround: true, hp: 999 });
      stage.camera.x = 0;
    }
    stage.progress.hp = stage.progress.stats.maxHP;
  });
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(40);
  await page.keyboard.up('KeyJ');
  await page.waitForFunction(() => window.__floaters?.().some((f) => /^-[0-9]+$/.test(f.txt)), null, { timeout: 1000 });
  const combat = fresh(join(dir, `ar2-combat-${date}.png`));
  await page.screenshot({ path: combat });
  shots.push(combat);
  contactCases.push({
    context: 'combat',
    frame: `ar2-combat-${date}.png`,
    requiredKinds: ['hero', 'walker'],
    contacts: await page.evaluate(() => window.__groundContacts?.() || []),
  });

  // Objective contact frame: all grounded character classes share one real stage floor. The
  // renderer's proof hook reports the last opaque sprite row and the tile-surface row represented
  // in this exact frame; the proof gate rejects missing classes or a distance greater than 1px.
  await findDef('s1');
  const contactSetup = await page.evaluate(() => {
    const stage = window.__loadStageDef(window.__pick);
    const walker = stage.enemies.find((enemy) => enemy.type.id === 'walker');
    const hopper = stage.enemies.find((enemy) => enemy.type.id === 'hopper');
    for (const enemy of stage.enemies) enemy.alive = enemy === walker || enemy === hopper;
    const surfaceY = stage.player.y;
    stage.settings.reduceEffects = true;
    stage.iframes = 0;
    stage.camera.x = 0;
    stage.camera.y = 0;
    Object.assign(stage.player, { x: 38, y: surfaceY, vx: 0, vy: 0, onGround: true });
    if (walker) Object.assign(walker, { x: 84, y: surfaceY, vx: 0, vy: 0, onGround: true, hopTimer: 0 });
    if (hopper) Object.assign(hopper, { x: 124, y: surfaceY, vx: 0, vy: 0, onGround: true, hopTimer: 0 });
    if (stage.boss) Object.assign(stage.boss, { x: 196, homeX: 196, y: surfaceY, vx: 0, vy: 0, onGround: true });
    return { walker: !!walker, hopper: !!hopper, boss: !!stage.boss };
  });
  if (!contactSetup.walker || !contactSetup.hopper || !contactSetup.boss) {
    problems.push(`ground-contact setup incomplete: ${JSON.stringify(contactSetup)}`);
  }
  await page.waitForTimeout(40);
  const contactFrame = fresh(join(dir, `ar2-ground-contact-${date}.png`));
  await page.screenshot({ path: contactFrame });
  shots.push(contactFrame);
  contactCases.push({
    context: 'stage',
    frame: `ar2-ground-contact-${date}.png`,
    requiredKinds: ['hero', 'walker', 'hopper', 'boss'],
    contacts: await page.evaluate(() => window.__groundContacts?.() || []),
  });

  for (const proofCase of contactCases) {
    for (const kind of proofCase.requiredKinds) {
      const contacts = proofCase.contacts.filter((contact) => contact.kind === kind);
      if (!contacts.length) problems.push(`${proofCase.context}: missing grounded ${kind} measurement`);
      for (const contact of contacts) {
        if (Math.abs(contact.surfaceRow - contact.opaqueBottomRow) > 1 || Math.abs(contact.gap) > 1) {
          problems.push(`${proofCase.context}/${kind}: opaque bottom ${contact.opaqueBottomRow}, surface ${contact.surfaceRow}, gap ${contact.gap}`);
        }
      }
    }
  }
  await findDef('s1');
  await page.evaluate(() => {
    const stage = window.__loadStageDef(window.__pick);
    stage.player.x = Math.min(stage.player.x + 60, stage.tilemap.worldWidth - 40);
    stage.camera.x = Math.max(0, Math.min(stage.player.x - 128, stage.tilemap.worldWidth - 256));
    stage.menu.open = true;
    stage.menu.tab = 1;
    stage.menu.cursor = 0;
  });
  await page.waitForTimeout(100);
  const menu = fresh(join(dir, `ar2-hud-menu-${date}.png`));
  await page.screenshot({ path: menu });
  shots.push(menu);

  if (date.localeCompare('20260808g') >= 0) {
    const animationRound = date.localeCompare('20260808h') >= 0 ? 'ar3b' : 'ar3a';
    for (const kind of ['hero', 'walker', 'hopper', 'boss']) {
      const file = `${animationRound}-animation-${kind}-${date}.png`;
      const contacts = await captureAnimationStrip(page, kind, join(dir, file));
      shots.push(join(dir, file));
      animationCases.push({ context: `animation-${kind}`, frame: file, requiredKinds: [kind], contacts });
      if (contacts.length !== 8) problems.push(`${kind} strip: expected 8 pose contacts, found ${contacts.length}`);
      for (const contactRow of contacts) {
        if (Math.abs(contactRow.surfaceRow - contactRow.opaqueBottomRow) > 1 || Math.abs(contactRow.gap) > 1) {
          problems.push(`${kind}/${contactRow.pose}: opaque bottom ${contactRow.opaqueBottomRow}, surface ${contactRow.surfaceRow}, gap ${contactRow.gap}`);
        }
      }
    }
  }
  const contact = join(dir, `ar2-environment-contact-sheet-${date}.png`);
  await captureContactSheet(page, contact);
  shots.push(contact);
  const contactsPath = fresh(join(dir, `ar2-ground-contact-${date}.json`));
  writeFileSync(contactsPath, `${JSON.stringify({ stamp: date, cases: [...contactCases, ...animationCases] }, null, 2)}\n`);
  await browser.close();

  if (errors.length) problems.push(`console/page errors: ${errors.join(' | ')}`);
  if (problems.length) {
    console.error(`PROOF FAILED:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`proof OK — ${shots.length} frames captured in ${dir}:`);
  for (const shot of shots) console.log(`  ${shot}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
