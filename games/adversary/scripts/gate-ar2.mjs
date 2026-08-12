// gate-ar2.mjs — mandatory objective gates for the AR2 environment/readability round.
// Measures shipped PNG luminance, standable-edge separation, dither-like alternation, enemy
// visibility on every stage ground, provenance, bundle inclusion, and the rendering-only boundary.
//
// Usage: node scripts/gate-ar2.mjs

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PALETTE, THEMES, hexToRgb } from '../src/render/palette.js';
import {
  BOTTOM_HUD_ASSIST_TEXT, BOTTOM_HUD_CONTROL_TEXT, BOTTOM_HUD_SCRIM_KEY,
  BOTTOM_HUD_SCRIM_OPACITY, BOTTOM_HUD_TEXT_KEY, BOTTOM_HUD_UTILITY_TEXT,
  MARKER_LABEL_SCRIM_KEY, MARKER_LABEL_SCRIM_OPACITY, MARKER_LABEL_TEXT, MARKER_LABEL_TEXT_KEY,
  WAYPOINT_FLOATER_KIND, bottomHudLayout, bottomHudModel, floaterRenderModel, markerLabelLayout,
  markerLabelModel,
} from '../src/render/hud.js';
import { CAMPAIGN_NODES } from '../src/content/campaign.js';
import { createStage } from '../src/sim/stage.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORM_THRESHOLD = 0.075;
const EDGE_THRESHOLD = 0.080;
const ENEMY_THRESHOLD = 0.080;
const DITHER_MAX = 0.120;
const WASH_ALPHA = 0.20;

function luminance(hex) {
  const channels = hexToRgb(hex).map((value) => value / 255).map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function fixed(value) { return Number(value).toFixed(3); }

function contrastRatio(first, second) {
  const high = Math.max(first, second); const low = Math.min(first, second);
  return (high + 0.05) / (low + 0.05);
}

/** Every playable stage definition in the campaign, both fork branches included. */
function campaignStageDefs() {
  const defs = [];
  for (const node of CAMPAIGN_NODES) {
    if (node.stage) defs.push([node.id, node.stage]);
    if (node.branch) {
      defs.push([node.branch.left.id, node.branch.left.stage]);
      defs.push([node.branch.right.id, node.branch.right.stage]);
    }
  }
  return defs;
}

function fail(message, failures) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

function pass(message) { console.log(`PASS  ${message}`); }

const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/art/MANIFEST.json'), 'utf8'));
const helperRequest = {
  root: join(ROOT, 'assets', 'art'),
  washAlpha: WASH_ALPHA,
  themes: Object.fromEntries(Object.entries(THEMES).map(([id, theme]) => [id, {
    file: `${theme.tileAsset}.png`, wash: PALETTE[theme.tileWash],
  }])),
  enemies: {
    walker: 'enemy_walker.png', hopper: 'enemy_hopper.png', boss: 'boss.png',
  },
};
const helper = spawnSync('python3', [join(ROOT, 'scripts/gate-ar2-assets.py')], {
  input: JSON.stringify(helperRequest), encoding: 'utf8',
});
if (helper.status !== 0) {
  console.error(helper.stderr || helper.stdout);
  process.exit(helper.status || 1);
}
const metrics = JSON.parse(helper.stdout);
const failures = [];

console.log('AR2 CONTRAST GATE');
console.log(`thresholds: platform ΔL≥${PLATFORM_THRESHOLD}; edge ΔL≥${EDGE_THRESHOLD}; enemy ΔL≥${ENEMY_THRESHOLD}`);
for (const [id, theme] of Object.entries(THEMES)) {
  const background = luminance(PALETTE[theme.gap]);
  const face = metrics.tiles[id].meanLuminance;
  const faceDelta = Math.abs(face - background);
  const edgeDelta = Math.abs(luminance(PALETTE[theme.edge]) - background);
  if (faceDelta < PLATFORM_THRESHOLD) fail(`${id} platform face ΔL=${fixed(faceDelta)}`, failures);
  else pass(`${id} platform face ΔL=${fixed(faceDelta)} (local background L=${fixed(background)})`);
  if (edgeDelta < EDGE_THRESHOLD) fail(`${id} standable edge ΔL=${fixed(edgeDelta)}`, failures);
  else pass(`${id} standable edge ΔL=${fixed(edgeDelta)}`);
}

console.log('\nAR2 DITHER AUDIT');
const spriteSource = readFileSync(join(ROOT, 'src/render/sprites.js'), 'utf8');
const removedPatterns = ['7876787678767876', '8767876787678767', '7678767876787678'];
for (const pattern of removedPatterns) {
  if (spriteSource.includes(pattern)) fail(`legacy shore/ground alternation remains: ${pattern}`, failures);
}
if (!removedPatterns.some((pattern) => spriteSource.includes(pattern))) {
  pass('legacy checkerboard shore/ground banding is absent');
}
for (const [id, tile] of Object.entries(metrics.tiles)) {
  if (tile.checkerboardScore > DITHER_MAX) {
    fail(`${id} tile ABA alternation=${fixed(tile.checkerboardScore)} > ${DITHER_MAX}`, failures);
  } else {
    pass(`${id} tile ABA alternation=${fixed(tile.checkerboardScore)} (sparse source highlights only)`);
  }
}

console.log('\nAR2 ENEMY VISIBILITY GATE');
for (const [enemy, data] of Object.entries(metrics.enemies)) {
  for (const [theme, tile] of Object.entries(metrics.tiles)) {
    const delta = Math.abs(data.meanLuminance - tile.meanLuminance);
    if (delta < ENEMY_THRESHOLD) fail(`${enemy} vs ${theme} ground ΔL=${fixed(delta)}`, failures);
    else pass(`${enemy} vs ${theme} ground ΔL=${fixed(delta)}`);
  }
}

console.log('\nAR2 BOTTOM HUD CONTRAST GATE');
const hudTextLuminance = luminance(PALETTE[BOTTOM_HUD_TEXT_KEY]);
const hudScrimLuminance = luminance(PALETTE[BOTTOM_HUD_SCRIM_KEY]);
const hudContrast = contrastRatio(hudTextLuminance, hudScrimLuminance);
const keepPeak = metrics.tiles.keep.maxLuminance;
if (BOTTOM_HUD_SCRIM_OPACITY !== 1) {
  fail(`bottom HUD scrim opacity ${BOTTOM_HUD_SCRIM_OPACITY} is not terrain-isolating`, failures);
} else if (hudContrast < 7) {
  fail(`bottom HUD text/backing contrast ${hudContrast.toFixed(2)}:1 < 7:1`, failures);
} else {
  const hudFailures = [];
  for (const [id, def] of campaignStageDefs()) {
    const stage = createStage(def, { seed: `gate-bottom-hud-${id}` });
    const normal = bottomHudModel('play', stage);
    if (normal.length !== 2 || normal[0] !== BOTTOM_HUD_CONTROL_TEXT
      || normal[1] !== BOTTOM_HUD_UTILITY_TEXT) {
      hudFailures.push(`${id}: normal play does not produce the shipped two-line control + utility hint`);
    }
    const normalLayout = bottomHudLayout(256, 240, normal.length);
    if (normalLayout.y < 0 || normalLayout.y + normalLayout.h > 240) {
      hudFailures.push(`${id}: normal bottom HUD leaves the logical frame`);
    }

    stage.deaths = 3; stage.settings.assist = false;
    const struggling = bottomHudModel('play', stage);
    if (struggling.length !== 3 || struggling[0] !== BOTTOM_HUD_ASSIST_TEXT
      || struggling[1] !== BOTTOM_HUD_CONTROL_TEXT || struggling[2] !== BOTTOM_HUD_UTILITY_TEXT) {
      hudFailures.push(`${id}: repeated deaths do not produce the shipped three-line assistance state`);
    }
    const strugglingLayout = bottomHudLayout(256, 240, struggling.length);
    if (strugglingLayout.y < 0 || strugglingLayout.y + strugglingLayout.h > 240
      || strugglingLayout.h <= normalLayout.h) {
      hudFailures.push(`${id}: repeated-death bottom HUD does not grow safely inside the frame`);
    }

    // Both conditional surfaces must disappear in their real suppressing states.
    stage.settings.assist = true;
    const assisted = bottomHudModel('play', stage);
    if (assisted.length !== 2 || assisted.includes(BOTTOM_HUD_ASSIST_TEXT)
      || assisted[0] !== BOTTOM_HUD_CONTROL_TEXT || assisted[1] !== BOTTOM_HUD_UTILITY_TEXT) {
      hudFailures.push(`${id}: assistance line survives after Assist is enabled`);
    }
    stage.cleared = true;
    if (bottomHudModel('play', stage).length) hudFailures.push(`${id}: bottom HUD survives stage clear`);
    stage.cleared = false;
    if (bottomHudModel('campaign-clear', stage).length) hudFailures.push(`${id}: bottom HUD survives campaign clear`);
  }
  if (hudFailures.length) {
    for (const problem of hudFailures) fail(`bottom HUD: ${problem}`, failures);
  } else {
    pass(`bottom HUD text/backing ${hudContrast.toFixed(2)}:1 over opaque scrim (brightest keep tile L=${fixed(keepPeak)})`);
    pass('bottom HUD drives every real campaign stage: two/three-line states, Assist suppression, and clear-state disappearance');
  }
}

console.log('\nAR2 MARKER LABEL CONTRAST GATE');
const markerTextLuminance = luminance(PALETTE[MARKER_LABEL_TEXT_KEY]);
const markerScrimLuminance = luminance(PALETTE[MARKER_LABEL_SCRIM_KEY]);
const markerContrast = contrastRatio(markerTextLuminance, markerScrimLuminance);
if (MARKER_LABEL_SCRIM_OPACITY !== 1) {
  fail(`marker label scrim opacity ${MARKER_LABEL_SCRIM_OPACITY} is not terrain-isolating`, failures);
} else if (markerContrast < 7) {
  fail(`marker label text/backing contrast ${markerContrast.toFixed(2)}:1 < 7:1`, failures);
} else {
  // Behavioural, over the real campaign stage definitions: the previous check was a source-string
  // grep for the call site, which still passed with the call site made unreachable — a dead feature
  // shipped green. This drives the game's own marker model at the real waypoints instead.
  const markerFailures = [];
  for (const [id, def] of campaignStageDefs()) {
    const stage = createStage(def, { seed: `gate-marker-${id}` });
    if (!stage.checkpoints.length) { markerFailures.push(`${id}: stage has no waypoint to label`); continue; }
    for (let index = 0; index < stage.checkpoints.length; index++) {
      const checkpoint = stage.checkpoints[index];
      // Stand exactly where the sim lets the player rest.
      stage.player.x = checkpoint.x; stage.player.y = checkpoint.y;
      stage.camera.x = Math.max(0, Math.min(checkpoint.x - 128, stage.tilemap.worldWidth - 256));
      stage.camera.y = 0;
      const model = markerLabelModel(stage);
      if (!model) { markerFailures.push(`${id} waypoint ${index}: no label where the player can rest`); continue; }
      if (model.text !== MARKER_LABEL_TEXT) markerFailures.push(`${id} waypoint ${index}: unexpected label copy`);
      const waypointFloater = { txt: 'WAYPOINT', kind: WAYPOINT_FLOATER_KIND };
      const restedFloater = { txt: 'RESTED' };
      const visibleAtPlate = floaterRenderModel([waypointFloater, restedFloater], model);
      if (visibleAtPlate.includes(waypointFloater)) {
        markerFailures.push(`${id} waypoint ${index}: waypoint floater survives while plate is visible`);
      }
      if (!visibleAtPlate.includes(restedFloater)) {
        markerFailures.push(`${id} waypoint ${index}: plate suppresses unrelated transient feedback`);
      }
      for (const lines of [2, 3]) {
        const bottom = bottomHudLayout(256, 240, lines);
        const layout = markerLabelLayout(model.text, model.anchorX, model.anchorY, 256, bottom.y);
        if (layout.y + layout.h > bottom.y - 2) {
          markerFailures.push(`${id} waypoint ${index}: plate collides with the ${lines}-line bottom bar`);
        }
        if (layout.x < 0 || layout.x + layout.w > 256 || layout.y < 0) {
          markerFailures.push(`${id} waypoint ${index}: plate leaves the ${lines}-line frame`);
        }
      }
      // ...and it must not linger once the player has walked out of resting range.
      stage.player.x = checkpoint.x + 64;
      const hiddenModel = markerLabelModel(stage);
      if (hiddenModel) markerFailures.push(`${id} waypoint ${index}: label survives 64px away`);
      if (!floaterRenderModel([waypointFloater], hiddenModel).includes(waypointFloater)) {
        markerFailures.push(`${id} waypoint ${index}: waypoint floater stays suppressed after plate clears`);
      }
    }
  }
  if (markerFailures.length) {
    for (const problem of markerFailures) fail(`marker label: ${problem}`, failures);
  } else {
    pass(`marker label text/backing ${markerContrast.toFixed(2)}:1 over opaque scrim (brightest keep tile L=${fixed(keepPeak)})`);
    pass(`marker label appears at every real campaign waypoint and clears 64px away, both 2-line and 3-line bottom-bar heights`);
    pass('waypoint floater is suppressed only while the marker plate is visible');
  }
}

console.log('\nAR2 PROVENANCE / BOUNDARY / DIST GATE');
const ar2Assets = manifest.assets.filter((asset) => asset.round === 'AR2');
if (ar2Assets.length !== 5) fail(`expected 5 AR2 curated assets, found ${ar2Assets.length}`, failures);
else pass('5 AR2 environment assets are individually manifested');
for (const asset of ar2Assets) {
  if (asset.license !== 'CC BY') fail(`${asset.file}: license is not CC BY`, failures);
  if (!existsSync(join(ROOT, 'assets', 'art', asset.file))) fail(`${asset.file}: curated copy missing`, failures);
}
if (ar2Assets.every((asset) => asset.license === 'CC BY')) pass('all AR2 assets retain CC BY provenance');
const heroAssets = manifest.assets.filter((asset) => asset.round === 'HERO-INTEGRATION');
const stripNames = Object.keys(manifest.hero.strips);
const expectedHeroFiles = manifest.hero.headgearOptions.flatMap((headgear) => (
  stripNames.map((animation) => `player_${headgear}_${animation}.png`)
));
if (manifest.hero.defaultHeadgear !== 'bareheaded' || manifest.hero.variant !== 'B') {
  fail('Ray-certified Variant B bare-headed default is not recorded', failures);
} else pass('Ray-certified Variant B bare-headed default is recorded');
if (expectedHeroFiles.length !== 33 || manifest.hero.frameCount !== 89) {
  fail(`expected 33 loadable strips / 89 frames, found ${expectedHeroFiles.length} / ${manifest.hero.frameCount}`, failures);
} else pass('all 11 certified strips are loadable for all three headgear variants');
for (const file of expectedHeroFiles) {
  const asset = heroAssets.find((item) => item.file === file);
  if (!asset) { fail(`${file}: missing HERO-INTEGRATION manifest record`, failures); continue; }
  if (asset.sourcePack !== '2D-Pixel-Art-Character-Template paint-over') {
    fail(`${file}: paint-over source provenance is incomplete`, failures);
  }
  if (asset.licenseSource !== 'docs/hero-draft/PROVENANCE.md' || !asset.license.includes('commercial')) {
    fail(`${file}: closed operator license ruling is not linked`, failures);
  }
  const animation = file.replace(/^player_(bareheaded|hooded|helmed)_/, '').replace('.png', '');
  const strip = manifest.hero.strips[animation];
  const png = readFileSync(join(ROOT, 'assets', 'art', file));
  if (png.readUInt32BE(16) !== strip.frameW * strip.frames || png.readUInt32BE(20) !== strip.frameH) {
    fail(`${file}: strip geometry does not match rig metadata`, failures);
  }
}
const backups = manifest.assets.filter((asset) => asset.runtime === false);
if (backups.length !== 12 || backups.some((asset) => !existsSync(join(ROOT, 'assets', 'art', asset.file)))) {
  fail('complete 12-file Willibab candidate-B backup is not retained', failures);
} else pass('complete 12-file Willibab candidate-B backup remains recorded and present');
const anchors = manifest.heroHandAnchors;
if (!anchors?.coordinateSpace?.includes('canonical-left') || !anchors?.coordinateSpace?.includes('class masks')) {
  fail('certified hand-anchor coordinate space is missing or ambiguous', failures);
}
for (const animation of ['katana_slash', 'katana_combo']) {
  const frames = Object.values(anchors?.[animation] || {});
  if (!frames.length) fail(`${animation}: missing hand/blade-tip class metadata`, failures);
  for (const anchor of frames) {
    const points = [anchor?.hand?.x, anchor?.hand?.y, anchor?.bladeTip?.x, anchor?.bladeTip?.y];
    if (!points.every(Number.isInteger)) fail(`${animation}: non-integer hand/blade-tip anchor`, failures);
  }
}
if (anchors.katana_slash && anchors.katana_combo) pass('rig-class hand/blade-tip metadata covers both katana strips');
const facing = manifest.hero.facingAudit;
if (facing.rawDashTrailOffset >= 0 || facing.normalisedDashTrailOffset <= 0 || facing.normalisedTrailSide !== 'right') {
  fail('dash trail does not remain backward through canonical-left normalization', failures);
} else pass('physics facing guard: dash trail streams backward from canonical-left hero');
const status = spawnSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).stdout;
const simChanges = status.split('\n').filter((line) => line.includes('src/sim/'));
if (simChanges.length) fail(`sim files changed: ${simChanges.join(', ')}`, failures);
else pass('rendering-only boundary: no src/sim changes');
const dist = readFileSync(join(ROOT, 'dist/index.html'), 'utf8');
const missingFromDist = Object.values(THEMES).map((theme) => theme.tileAsset).filter((id) => !dist.includes(`'${id}'`));
if (missingFromDist.length) fail(`dist missing assets: ${missingFromDist.join(', ')}`, failures);
else pass('rebuilt dist contains all curated environment faces');
const missingHeroFromDist = expectedHeroFiles.map((file) => file.replace('.png', '')).filter((id) => !dist.includes(`'${id}'`));
if (missingHeroFromDist.length) fail(`dist missing protagonist frames: ${missingHeroFromDist.join(', ')}`, failures);
else pass('rebuilt dist contains the complete curated protagonist frame set');

if (failures.length) {
  console.error(`\nAR2 GATES FAILED (${failures.length})`);
  process.exit(1);
}
console.log('\nAR2 GATES PASS');
