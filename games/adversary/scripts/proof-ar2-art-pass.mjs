// proof-ar2-art-pass.mjs — capture AR2 art-pass integration proofs.
// Gates: one full level per biome, one combat moment per enemy skin showing
// attack / hit / death. Dated operator-facing filenames are never overwritten.
//
// Usage: node scripts/proof-ar2-art-pass.mjs [YYYYMMDD] [--hero-only]

import { chromium } from 'playwright';
import { writeBuild } from './build.js';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 512, height: 480 };

function stamp() {
  const arg = process.argv[2];
  if (arg && /^\d{8}[a-z]?$/.test(arg)) return arg;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function fresh(path) {
  if (existsSync(path)) throw new Error(`refusing to overwrite proof: ${path}`);
  return path;
}

async function launchProofBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.includes('MachPortRendezvousServer') || !message.includes('Permission denied')) throw error;
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
  const dir = join(ROOT, 'proofs', `ar2-art-pass-${date}`);
  mkdirSync(dir, { recursive: true });
  const problems = [];
  const shots = [];

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

  // Certified protagonist integration lane. This stays in the f958c59 proof harness so asset
  // loading, the real bundled renderer, integer scaling, error collection, and no-overwrite rule
  // are identical to the established art-pass captures.
  if (process.argv.includes('--hero-only')) {
    const heroDir = join(ROOT, 'docs', 'proofs', `hero-integration-${date}`);
    mkdirSync(heroDir, { recursive: true });
    await findDef('s1');
    const prepare = () => page.evaluate(() => {
      const stage = window.__loadStageDef(window.__pick);
      const surfaceY = stage.player.y;
      stage.dead = true; // freeze sim while preserving the real stage renderer and proof hooks
      stage.camera.x = 0;
      stage.camera.y = 0;
      stage.iframes = 0;
      stage.events = [];
      for (const enemy of stage.enemies) enemy.alive = false;
      if (stage.boss) stage.boss.alive = false;
      Object.assign(stage.player, {
        x: 108, y: surfaceY, vx: 0, vy: 0, onGround: true, facing: 1,
        dodging: 0, dodgeDir: 1, airJumpUsed: false,
      });
      window.__render();
      return surfaceY;
    });
    const capture = async (name) => {
      const path = fresh(join(heroDir, `hero-${name}-${date}.png`));
      await page.screenshot({ path });
      shots.push(path);
    };

    await prepare();
    await capture('idle');

    await prepare();
    await page.evaluate(() => {
      const stage = window.__stage();
      stage.player.vx = 1.5;
      for (let i = 0; i < 14; i++) window.__render();
    });
    await capture('run');

    await prepare();
    await page.evaluate(() => {
      const stage = window.__stage();
      Object.assign(stage.attack, { visualTimer: 3, swingType: 'normal' });
      window.__render();
    });
    await capture('katana-combo');

    await prepare();
    await page.evaluate(() => {
      const stage = window.__stage();
      Object.assign(stage.player, { dodging: 5, dodgeDir: 1, vx: 5, facing: 1 });
      window.__render();
    });
    await capture('dash-facing-right-trail-left');

    const surfaceY = await prepare();
    await page.evaluate(({ y }) => {
      const stage = window.__stage();
      stage.player.x = 184;
      stage.iframes = 2; // hide the respawn body so the authored death strip is unambiguous
      stage.events = [{ type: 'death', at: { x: 108, y }, marker: true }];
      for (let i = 0; i < 15; i++) window.__render();
    }, { y: surfaceY });
    await capture('death');

    await browser.close();
    if (errors.length) problems.push(`console/page errors: ${errors.join(' | ')}`);
    if (problems.length) {
      console.error(`PROOF FAILED:\n - ${problems.join('\n - ')}`);
      process.exit(1);
    }
    console.log(`hero proof OK — ${shots.length} frames captured in ${heroDir}:`);
    for (const shot of shots) console.log(`  ${shot}`);
    return;
  }

  // Full level per biome.
  for (const [id, expectedTheme] of [['s1', 'cemetery'], ['s4', 'crypt'], ['s6', 'keep']]) {
    if (!await findDef(id)) { problems.push(`${id}: stage def not found`); continue; }
    const theme = await page.evaluate(() => {
      const stage = window.__loadStageDef(window.__pick);
      stage.player.x = Math.min(stage.player.x + 100, stage.tilemap.worldWidth - 40);
      for (const e of stage.enemies ?? []) {
        if (Math.abs(e.x - stage.player.x) < 40) stage.player.x = e.x - 56;
      }
      stage.iframes = 0;
      stage.camera.x = Math.max(0, Math.min(stage.player.x - 128, stage.tilemap.worldWidth - 256));
      return stage.theme;
    });
    if (theme !== expectedTheme) problems.push(`${id}: theme ${theme} != ${expectedTheme}`);
    await page.waitForTimeout(180);
    const shot = fresh(join(dir, `ar2ap-level-${theme}-${date}.png`));
    await page.screenshot({ path: shot });
    shots.push(shot);
  }

  // Per-enemy combat moments: attack, hit, death.
  // Themes map to skins: cemetery zombie/slime, crypt zombslime/bat, keep gladiator/rat.
  const cases = [
    { theme: 'cemetery', def: 's1', typeId: 'walker', skin: 'zombie', label: 'walker-zombie' },
    { theme: 'cemetery', def: 's1', typeId: 'hopper', skin: 'slime_spiked', label: 'hopper-slime' },
    { theme: 'crypt', def: 's4', typeId: 'walker', skin: 'zombslime', label: 'walker-zombslime' },
    { theme: 'crypt', def: 's4', typeId: 'hopper', skin: 'bat', label: 'hopper-bat' },
    { theme: 'keep', def: 's6', typeId: 'walker', skin: 'bones_gladiator', label: 'walker-gladiator' },
    { theme: 'keep', def: 's6', typeId: 'hopper', skin: 'rat', label: 'hopper-rat' },
  ];

  for (const c of cases) {
    if (!await findDef(c.def)) { problems.push(`${c.label}: stage def not found`); continue; }

    // Attack: player stands in windup range, enemy faces player.
    await page.evaluate((typeId) => {
      const stage = window.__loadStageDef(window.__pick);
      const surfaceY = stage.player.y;
      let enemy = stage.enemies.find((e) => e.type.id === typeId);
      if (!enemy) {
        // If the stage has no enemy of this class, repurpose the first living enemy.
        enemy = stage.enemies.find((e) => e.alive);
        if (enemy) enemy.type = { ...enemy.type, id: typeId };
      }
      for (const e of stage.enemies) if (e !== enemy) e.alive = false;
      Object.assign(stage.player, { x: 80, y: surfaceY, vx: 0, vy: 0, onGround: true, facing: 1 });
      if (enemy) Object.assign(enemy, { x: 110, y: surfaceY, vx: 0, vy: 0, onGround: true, facing: -1, hitFlash: 0 });
      stage.camera.x = 0;
      stage.iframes = 0;
      stage.progress.hp = stage.progress.stats.maxHP;
      window.__render();
    }, c.typeId);
    const attackShot = fresh(join(dir, `ar2ap-${c.label}-attack-${date}.png`));
    await page.screenshot({ path: attackShot });
    shots.push(attackShot);

    // Hit: enemy in hitFlash with a strike echo.
    await page.evaluate((typeId) => {
      const stage = window.__loadStageDef(window.__pick);
      const surfaceY = stage.player.y;
      let enemy = stage.enemies.find((e) => e.type.id === typeId);
      if (!enemy) {
        enemy = stage.enemies.find((e) => e.alive);
        if (enemy) enemy.type = { ...enemy.type, id: typeId };
      }
      for (const e of stage.enemies) if (e !== enemy) e.alive = false;
      Object.assign(stage.player, { x: 80, y: surfaceY, vx: 0, vy: 0, onGround: true, facing: 1 });
      if (enemy) Object.assign(enemy, { x: 110, y: surfaceY, vx: 0, vy: 0, onGround: true, facing: -1, hitFlash: 12 });
      stage.camera.x = 0;
      window.__render();
    }, c.typeId);
    const hitShot = fresh(join(dir, `ar2ap-${c.label}-hit-${date}.png`));
    await page.screenshot({ path: hitShot });
    shots.push(hitShot);

    // Death: inject a kill event and render one frame so the trash death echo appears before
    // the next stepStage tick replaces stage.events.
    await page.evaluate((typeId) => {
      const stage = window.__loadStageDef(window.__pick);
      const surfaceY = stage.player.y;
      let enemy = stage.enemies.find((e) => e.type.id === typeId);
      if (!enemy) {
        enemy = stage.enemies.find((e) => e.alive);
        if (enemy) enemy.type = { ...enemy.type, id: typeId };
      }
      for (const e of stage.enemies) if (e !== enemy) e.alive = false;
      Object.assign(stage.player, { x: 80, y: surfaceY, vx: 0, vy: 0, onGround: true, facing: 1 });
      if (enemy) {
        enemy.alive = false;
        enemy.x = 110; enemy.y = surfaceY;
        stage.events = [{
          type: 'kill', enemy: typeId, xp: enemy.type.xp, gold: enemy.type.gold,
          at: { x: enemy.x, y: enemy.y }, facing: enemy.facing,
        }];
      }
      stage.camera.x = 0;
      window.__render();
    }, c.typeId);
    const deathShot = fresh(join(dir, `ar2ap-${c.label}-death-${date}.png`));
    await page.screenshot({ path: deathShot });
    shots.push(deathShot);
  }

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
