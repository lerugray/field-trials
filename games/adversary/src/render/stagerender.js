// stagerender.js — draws a stage with camera scrolling (DESIGN-SEED art + M12-ART register). Beyond
// the entity sprites it now paints the gothic dressing: a themed night backdrop, a slow parallax
// skyline of ruins, licensed masonry faces, sparse ground decorations (gravestones, vines, banners,
// reliefs), and warm torch pools against the dark. Pure draw over a 2d context; the sim owns state.
// The stage's `theme` id (M12) selects a shared-ramp sub-palette — never off-palette.

import { PALETTE, themeFor, hexToRgb } from './palette.js';
import {
  PLAYER_L, PLAYER_R, WALKER_L, WALKER_R, HOPPER_L, HOPPER_R, BOSS_L, BOSS_R,
  TILE_GRASS, TILE_DIRT, DROP_HEAL, CHECKPOINT, MARKER, UNLOCK,
  GRAVESTONE, BROKEN_ARCH, VINE, GRASS_TUFT, SKULL, WALL_TORCH,
} from './sprites.js';
import {
  HERO_RIG, getAsset, assetReady, groundedVisualY, groundContactGap, playerStripAssetId,
} from './assets.js';
import { computeDressing, parallaxLayout } from './dressing.js';
import { FACING } from '../sim/player.js';
import { attackVisualView } from '../sim/melee.js';
import { BOSS_PHASE, BOSS_STATS } from '../sim/boss.js';
import { PLAYER_HALF } from '../sim/player.js';
import { drawPixelText, textWidth } from './pixelfont.js';
import { FEEL } from '../config/feel.js';
import {
  applyLightPass, createLightFrame, lightBayerAt, materialFbm, materialRampKey, registerHeroLayer,
  registerLight,
} from './light.js';

let LAST_GROUND_CONTACTS = [];
let PLAYER_RENDER_TICK = 0;
let PROOF_PRESENTATION_FROZEN = false;

/** Proof-only deterministic capture control. Normal play never calls this; boot's existing
 * __proofFreeze hook uses it so repeated renders hold both animation and transient FX state. */
export function setProofPresentationFreeze(on = true) {
  PROOF_PRESENTATION_FROZEN = !!on;
  if (PROOF_PRESENTATION_FROZEN) PLAYER_RENDER_TICK = 0;
}

/** Proof-only authored-frame selector; ignored as a capture guarantee unless presentation is frozen. */
export function setProofPresentationTick(tick = 0) {
  if (PROOF_PRESENTATION_FROZEN) PLAYER_RENDER_TICK = Math.max(0, Math.floor(tick));
}
let LAST_ANIMATION_CONTACTS = [];
const STAGE_PRESENTATION = new WeakMap();
const STAGE_MATERIAL_CACHE = new Map();
const HERO_ALPHA_MASK_CACHE = new WeakMap();

function stageMaterialSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function stageMaterialField(seed, octaves = 4) {
  const key = `${seed}:${octaves}`;
  if (!STAGE_MATERIAL_CACHE.has(key)) STAGE_MATERIAL_CACHE.set(key, materialFbm(stageMaterialSeed(seed), octaves));
  return STAGE_MATERIAL_CACHE.get(key);
}

const PLAYER_ATTACK_FRAME_MAP = Object.freeze({
  katana_combo: Object.freeze([8, 0, 4, 5]),
  katana_slash: Object.freeze([0, 1, 2, 5]),
});

export const AR3B_TIMING = Object.freeze({
  idleFrameTicks: 24,
  playerFrameTicks: 4,
  walkLeadTicks: 12,
  landVisualTicks: 18,
  runStridePixels: 4,
  attackVisualTicks: 8,
  attackWindupTicks: 2,
  visualHitstopFrames: 3,
  heroHurtFrames: 10,
  trashWindupRange: 10,
  landDustFrames: 12,
  deathEchoFrames: 20,
  bossDeathFrames: 30,
  bossStepPixels: 10,
});
// Compatibility export for earlier render-only tests/callers; AR3B is the active timing record.
export const AR3A_TIMING = AR3B_TIMING;

function playerStripView(animation, frame) {
  const strip = HERO_RIG.strips[animation];
  const safeFrame = Math.max(0, Math.min(strip.frames - 1, Math.floor(frame || 0)));
  return Object.freeze({ animation, asset: playerStripAssetId(animation), frame: safeFrame });
}

/** Select an authored strip frame from render-visible state only. This preserves AR3's verb→pose
 *  boundary while replacing its old candidate-B stills with the certified 89-frame rig. */
export function playerAnimationViewFor(player, swing, renderTick = 0, options = {}) {
  const { reduceEffects = false, hurtTicks = 0, landTicks = 0, moveTicks = 0, swingType = 'normal' } = options;
  if (hurtTicks > 0) {
    const elapsed = AR3B_TIMING.heroHurtFrames - hurtTicks;
    return playerStripView('hurt', reduceEffects ? 1 : Math.floor(elapsed * HERO_RIG.strips.hurt.frames / AR3B_TIMING.heroHurtFrames));
  }
  if (swing?.active) {
    const animation = swingType === 'normal' ? 'katana_combo' : 'katana_slash';
    const map = PLAYER_ATTACK_FRAME_MAP[animation];
    return playerStripView(animation, map[swing.frame] ?? map[0]);
  }
  if ((player?.dodging || 0) > 0) {
    const elapsed = FEEL.DODGE_DURATION_TICKS - player.dodging;
    const frame = Math.round(elapsed * (HERO_RIG.strips.dash.frames - 1) / Math.max(1, FEEL.DODGE_DURATION_TICKS - 1));
    return playerStripView('dash', frame);
  }
  if (landTicks > 0 && player?.onGround) {
    const elapsed = AR3B_TIMING.landVisualTicks - landTicks;
    return playerStripView('land', Math.floor(elapsed * HERO_RIG.strips.land.frames / AR3B_TIMING.landVisualTicks));
  }
  if (!player?.onGround) {
    if (player?.airJumpUsed) {
      return playerStripView('airspin', Math.floor(renderTick / AR3B_TIMING.playerFrameTicks) % HERO_RIG.strips.airspin.frames);
    }
    const vy = player?.vy || 0;
    const frame = vy < -3 ? 0 : vy < -1 ? 1 : vy < 0 ? 2 : vy < 1.5 ? 3 : vy < 3 ? 4 : 5;
    return playerStripView('jump', frame);
  }
  if (Math.abs(player?.vx || 0) > 0.01) {
    const animation = moveTicks >= AR3B_TIMING.walkLeadTicks ? 'run' : 'walk';
    const strip = HERO_RIG.strips[animation];
    const frame = Math.floor(Math.abs(player.x || 0) / AR3B_TIMING.runStridePixels) % strip.frames;
    return playerStripView(animation, frame);
  }
  const idleFrame = reduceEffects ? 0 : Math.floor(renderTick / AR3B_TIMING.playerFrameTicks) % HERO_RIG.strips.idle.frames;
  return playerStripView('idle', idleFrame);
}

/** Compatibility wrapper retained for existing render callers/tests. */
export function playerAssetIdFor(player, swing, renderTick = 0, reduceEffects = false, hurt = false) {
  return playerAnimationViewFor(player, swing, renderTick, {
    reduceEffects, hurtTicks: hurt ? AR3B_TIMING.heroHurtFrames : 0,
  }).asset;
}

/** Presentation-only contact anticipation for trash. Contact damage is mechanically unchanged;
 *  this view begins a planted lean while an eligible enemy is approaching the overlap distance. */
export function enemyAttackPresentation(enemy, player, playerIframes = 0) {
  const halfW = enemy?.type?.body?.halfW ?? 7;
  const contactDistance = PLAYER_HALF.halfW + halfW;
  const dx = (player?.x || 0) - (enemy?.x || 0);
  const distance = Math.abs(dx);
  const facingToward = Math.sign(dx || enemy?.facing || 1) === (enemy?.facing || 1);
  if (playerIframes <= 0 && facingToward && distance <= contactDistance + AR3B_TIMING.trashWindupRange) {
    if (distance > contactDistance) {
      return Object.freeze({ phase: 'windup', lean: -(enemy.facing || 1) * 3, squash: 2, shift: 0 });
    }
    return Object.freeze({ phase: 'strike', lean: (enemy.facing || 1) * 4, squash: 1, shift: (enemy.facing || 1) * 2 });
  }
  if (enemy?.type?.hop && enemy.onGround && enemy.hopTimer >= (enemy.type.hopEvery || 48) - 8) {
    return Object.freeze({ phase: 'coil', lean: 0, squash: 3, shift: 0 });
  }
  return Object.freeze({ phase: 'idle', lean: 0, squash: 0, shift: 0 });
}

const ENEMY_ANIM_TICKS = 8;

/** Resolve the themed skin name for an enemy class. */
function enemySkinFor(theme, typeId) {
  const skins = themeFor(theme).enemySkins;
  return skins?.[typeId] || (typeId === 'hopper' ? 'slime_spiked' : 'zombie');
}

/** Pick the animation state for a live enemy from real sim signals. */
function enemyVisualState(e, player, iframes) {
  if (e.hitFlash > 0) return 'hit';
  const attack = enemyAttackPresentation(e, player, iframes);
  if (attack.phase !== 'idle') return 'attack';
  if (e.onGround && Math.abs(e.vx || 0) > 0.01) return 'run';
  return 'idle';
}

/** Build the asset id for an enemy's current themed skin + state. */
function enemyAssetFor(e, theme, state) {
  const typeId = e.type.id;
  const skin = enemySkinFor(theme, typeId);
  return `enemy_${typeId}_${skin}_${state}`;
}

/** Looping frame index for a multi-frame strip asset. */
function enemyFrameFor(assetId, renderTick) {
  const asset = getAsset(assetId);
  if (!asset || !asset.frames) return 0;
  return Math.floor(renderTick / ENEMY_ANIM_TICKS) % asset.frames;
}

/** Read-only proof hook: objective opaque-bottom vs surface-row measurements from the last frame. */
export function groundContactSnapshot() {
  return LAST_GROUND_CONTACTS.map((contact) => ({ ...contact }));
}

function recordGroundContact(kind, entity, drawX, drawY, visual, cam, vw, vh, frameAnchor = null) {
  if (!entity.onGround) return;
  const drawCol = Math.round(drawX - cam.x);
  const surfaceRow = Math.round(entity.y - cam.y);
  const drawRow = Math.round(drawY - cam.y);
  const width = visual?.width ?? visual?.w ?? 0;
  const height = visual?.height ?? visual?.h ?? 0;
  if (drawCol + width <= 0 || drawCol >= vw || drawRow + height <= 0 || drawRow >= vh) return;
  const bottomInset = visual?.bottomInset ?? 0;
  const opaqueBottomRow = frameAnchor
    ? drawRow + frameAnchor.y
    : drawRow + height - bottomInset - 1;
  LAST_GROUND_CONTACTS.push({
    kind,
    surfaceRow,
    opaqueBottomRow,
    gap: surfaceRow - opaqueBottomRow,
  });
}

const DRESS_SPRITE = {
  grass: GRASS_TUFT, gravestone: GRAVESTONE, brokenArch: BROKEN_ARCH,
  vine: VINE, moss: GRASS_TUFT, skull: SKULL, torch: WALL_TORCH,
  gargoyle: GRAVESTONE, banner: VINE,
};
const DRESS_ASSET = {
  gargoyle: 'env_prop_gargoyle', banner: 'env_prop_banner',
};

/** Blit a parsed sprite whose top-left is (wx,wy) in world space, offset by the camera. */
function blit(ctx, sprite, wx, wy, cam) {
  const ox = Math.round(wx - cam.x);
  const oy = Math.round(wy - cam.y);
  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.w; x++) {
      const hex = PALETTE[row[x]];
      if (hex == null) continue;
      ctx.fillStyle = hex;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

/** Blit a sprite remapping palette keys (used to tint the neutral stone tiles per theme). */
function blitTinted(ctx, sprite, wx, wy, cam, remap) {
  const ox = Math.round(wx - cam.x);
  const oy = Math.round(wy - cam.y);
  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.w; x++) {
      const key = remap[row[x]] || row[x];
      const hex = PALETTE[key];
      if (hex == null) continue;
      ctx.fillStyle = hex;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

/** Silhouette blit in a single colour (for telegraph / flash tells / parallax). */
function blitSilhouette(ctx, sprite, wx, wy, cam, hex) {
  const ox = Math.round(wx - cam.x);
  const oy = Math.round(wy - cam.y);
  ctx.fillStyle = hex;
  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.w; x++) {
      if (row[x] !== '.') ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function frameWidthFor(asset) {
  return asset?.frameWidth ?? asset?.width ?? 0;
}

/** Feet-rooted placement for one authored strip frame. The anchor is measured from the final
 *  painted pixels, so the last opaque row lands exactly one pixel above the collision surface. */
export function playerFramePlacement(asset, frame, groundX, feetY, flip = false) {
  const fw = frameWidthFor(asset);
  const anchor = asset.frameAnchors?.[frame]
    || { x: fw / 2, y: asset.height - (asset.bottomInset || 0) - 1 };
  const anchorX = flip ? fw - 1 - anchor.x : anchor.x;
  return {
    x: Math.round(groundX - anchorX),
    y: Math.round(feetY - 1 - anchor.y),
    anchor,
  };
}

/** Draw a curated PNG asset (by id) with optional horizontal flip and animation frame.
 *  Falls back to the provided code-drawn sprite function when the asset is unavailable
 *  (headless tests) or not loaded yet. Returns true if the curated asset was drawn. */
function drawAssetAlpha(ctx, id, wx, wy, cam, flip, alpha = 1, frame = 0) {
  const asset = getAsset(id);
  if (!asset || !assetReady(id)) return false;
  const fw = frameWidthFor(asset);
  const sourceX = frame * fw;
  const ox = Math.round(wx - cam.x);
  const oy = Math.round(wy - cam.y);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.translate(ox + fw, oy);
    ctx.scale(-1, 1);
    ctx.drawImage(asset.image, sourceX, 0, fw, asset.height, 0, 0, fw, asset.height);
  } else {
    ctx.drawImage(asset.image, sourceX, 0, fw, asset.height, ox, oy, fw, asset.height);
  }
  ctx.restore();
  return true;
}

function drawAsset(ctx, id, wx, wy, cam, flip, frame = 0) {
  return drawAssetAlpha(ctx, id, wx, wy, cam, flip, 1, frame);
}

/** Integer row-slice compositor. The opaque bottom is invariant: squash removes rows from the
 *  upper body and moves the shortened result down, while lean shifts only rows above the feet. */
function drawAssetPosed(ctx, id, wx, wy, cam, flip, pose = {}, frame = 0) {
  const asset = getAsset(id);
  if (!asset || !assetReady(id)) return false;
  const source = asset.image;
  if (!source) return false;
  const fw = frameWidthFor(asset);
  const sourceX = frame * fw;
  const ox = Math.round(wx - cam.x + (pose.shift || 0));
  const oy = Math.round(wy - cam.y);
  const opaqueHeight = Math.max(1, asset.height - (asset.bottomInset || 0));
  const squash = Math.max(0, Math.min(opaqueHeight - 1, Math.round(pose.squash || 0)));
  const destHeight = opaqueHeight - squash;
  const lean = Math.round(pose.lean || 0);
  ctx.save();
  ctx.globalAlpha = pose.alpha == null ? 1 : pose.alpha;
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < destHeight; row++) {
    const sourceRow = Math.min(opaqueHeight - 1, Math.floor(row * opaqueHeight / destHeight));
    const rank = destHeight <= 1 ? 0 : 1 - row / (destHeight - 1);
    const rowShift = Math.round(lean * rank);
    const dy = oy + squash + row;
    if (pose.dissolve > 0) {
      // Ordered threshold applies to the echo's own pixels while its source asset remains intact.
      // Sampling uses world coordinates, so scrolling cannot make the dissolve crawl over a body.
      for (let x = 0; x < fw; x++) {
        const worldX = Math.round(wx + rowShift + x);
        const worldY = Math.round(wy + squash + row);
        if (lightBayerAt(worldX, worldY) < pose.dissolve) continue;
        const sourcePixelX = sourceX + (flip ? fw - 1 - x : x);
        ctx.drawImage(source, sourcePixelX, sourceRow, 1, 1, ox + rowShift + x, dy, 1, 1);
      }
      continue;
    }
    if (flip) {
      ctx.save();
      ctx.translate(ox + fw + rowShift, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, sourceX, sourceRow, fw, 1, 0, dy, fw, 1);
      ctx.restore();
    } else {
      ctx.drawImage(source, sourceX, sourceRow, fw, 1, ox + rowShift, dy, fw, 1);
    }
  }
  ctx.restore();
  return true;
}

function blitPosed(ctx, sprite, wx, wy, cam, pose = {}) {
  const ox = Math.round(wx - cam.x + (pose.shift || 0));
  const oy = Math.round(wy - cam.y);
  const squash = Math.max(0, Math.min(sprite.h - 1, Math.round(pose.squash || 0)));
  const destHeight = sprite.h - squash;
  const lean = Math.round(pose.lean || 0);
  ctx.save();
  ctx.globalAlpha = pose.alpha == null ? 1 : pose.alpha;
  for (let row = 0; row < destHeight; row++) {
    const sourceRow = Math.min(sprite.h - 1, Math.floor(row * sprite.h / destHeight));
    const rank = destHeight <= 1 ? 0 : 1 - row / (destHeight - 1);
    const rowShift = Math.round(lean * rank);
    for (let x = 0; x < sprite.w; x++) {
      const key = sprite.rows[sourceRow][x];
      const hex = PALETTE[key];
      if (key === '.' || hex == null) continue;
      ctx.fillStyle = hex;
      ctx.fillRect(ox + rowShift + x, oy + squash + row, 1, 1);
    }
  }
  ctx.restore();
}

function drawCharacterPosed(ctx, id, fallback, wx, wy, cam, flip, pose = {}, frame = 0) {
  if (drawAssetPosed(ctx, id, wx, wy, cam, flip, pose, frame)) return true;
  blitPosed(ctx, fallback, wx, wy, cam, pose);
  return false;
}

/** Cache alpha for every frame in one decoded hero strip. This is a one-time asset read, never a
 * per-frame framebuffer readback; applyLightPass remains the only logical-buffer readback. */
function heroAssetAlphaMask(asset, frame) {
  if (!asset?.image || typeof document === 'undefined') return null;
  let masks = HERO_ALPHA_MASK_CACHE.get(asset);
  if (!masks) {
    const canvas = document.createElement('canvas');
    canvas.width = asset.width; canvas.height = asset.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(asset.image, 0, 0);
    const rgba = context.getImageData(0, 0, asset.width, asset.height).data;
    const frameWidth = frameWidthFor(asset);
    masks = Array.from({ length: asset.frames || 1 }, (_, frameIndex) => {
      const mask = new Uint8Array(frameWidth * asset.height);
      for (let y = 0; y < asset.height; y++) for (let x = 0; x < frameWidth; x++) {
        mask[y * frameWidth + x] = rgba[(y * asset.width + frameIndex * frameWidth + x) * 4 + 3] > 0 ? 1 : 0;
      }
      return mask;
    });
    HERO_ALPHA_MASK_CACHE.set(asset, masks);
  }
  return masks[Math.max(0, Math.min(masks.length - 1, frame))];
}

function heroFallbackAlphaMask(sprite) {
  const mask = new Uint8Array(sprite.w * sprite.h);
  for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
    mask[y * sprite.w + x] = sprite.rows[y][x] === '.' ? 0 : 1;
  }
  return mask;
}

/** Ground-center transform puppetry for licensed characters. Integer row resampling keeps
 *  the bitmap crisp while squash/stretch, lean, shake, and lunge all pivot around planted feet. */
function drawAssetPuppet(ctx, id, groundX, feetY, cam, flip, pose = {}, frame = 0) {
  const asset = getAsset(id);
  if (!asset || !assetReady(id)) return false;
  const source = asset.image;
  if (!source) return false;
  const fw = frameWidthFor(asset);
  const sourceX = frame * fw;
  const opaqueHeight = Math.max(1, asset.height - (asset.bottomInset || 0));
  const squash = Math.round(pose.squash || 0);
  const destHeight = Math.max(1, opaqueHeight - squash + Math.round(pose.stretchY || 0));
  const destWidth = Math.max(1, fw + Math.round(pose.stretchX || 0));
  const baseX = Math.round(groundX - cam.x - destWidth / 2 + (pose.shift || 0));
  const baseY = Math.round(feetY - cam.y - destHeight);
  const lean = Math.round(pose.lean || 0);
  ctx.save();
  ctx.globalAlpha = pose.alpha == null ? 1 : pose.alpha;
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < destHeight; row++) {
    const sourceRow = Math.min(opaqueHeight - 1, Math.floor(row * opaqueHeight / destHeight));
    const rank = destHeight <= 1 ? 0 : 1 - row / (destHeight - 1);
    const rowShift = Math.round(lean * rank);
    const dy = baseY + row;
    if (flip) {
      ctx.save();
      ctx.translate(baseX + destWidth + rowShift, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, sourceX, sourceRow, fw, 1, 0, dy, destWidth, 1);
      ctx.restore();
    } else {
      ctx.drawImage(source, sourceX, sourceRow, fw, 1, baseX + rowShift, dy, destWidth, 1);
    }
  }
  ctx.restore();
  return true;
}

function drawCharacterPuppet(ctx, id, fallback, groundX, feetY, cam, flip, pose = {}, frame = 0) {
  if (!drawAssetPuppet(ctx, id, groundX, feetY, cam, flip, pose, frame)) {
    const wy = groundedVisualY(feetY, fallback);
    blitPosed(ctx, fallback, groundX - fallback.w / 2, wy, cam, pose);
  }
}

/** Pure boss render view: the 34-tick sim telegraph is deliberately much longer than the hero's
 *  two-tick wind-up, while every phase keeps the one licensed bitmap anchored at ground center. */
export function bossPuppetPose(boss, renderTick = 0, reduceEffects = false) {
  const facing = boss?.facing || 1;
  let pose;
  if (boss?.phase === BOSS_PHASE.TELEGRAPH) {
    const shake = reduceEffects ? 0 : [-1, 1, 0][Math.abs(boss.timer || 0) % 3];
    pose = { lean: -facing * 5, squash: 7, stretchX: 6, shift: shake };
  } else if (boss?.phase === BOSS_PHASE.LUNGE) {
    pose = { lean: facing * 11, stretchX: 10, stretchY: 3, shift: facing * 6 };
  } else if (boss?.phase === BOSS_PHASE.RECOVER) {
    pose = { lean: -facing * 3, squash: 4, stretchX: 2 };
  } else {
    const step = Math.floor(renderTick / 12) % 2;
    pose = { lean: facing * step, squash: step, stretchX: step };
  }
  if (boss?.hitFlash > 0) {
    pose.lean = -facing * 4;
    pose.shift = -facing * (boss.hitFlash >= 4 ? 2 : 1);
  }
  return pose;
}

function drawAttackTell(ctx, worldX, topY, cam, phase, facing, reduce, scale = 1) {
  if (phase !== 'windup' && phase !== 'coil') return;
  const pulse = reduce || Math.floor(PLAYER_RENDER_TICK / 4) % 2 === 0;
  const width = textWidth('!', scale);
  const x = Math.round(worldX - cam.x + facing * 5 - width / 2);
  const y = Math.round(topY - cam.y - (scale === 1 ? 8 : 13));
  drawPixelText(ctx, '!', x, y, pulse ? PALETTE['c'] : PALETTE['g'], scale);
}

function spawnBurst(view, type, x, y, dir = 1) {
  const count = type === 'death' ? 20 : type === 'shockwave' ? 14 : type === 'impact' ? 20 : 6;
  const life = type === 'death' ? AR3B_TIMING.deathEchoFrames
    : type === 'shockwave' ? 12 : type === 'impact' ? 9 : AR3B_TIMING.landDustFrames;
  for (let i = 0; i < count; i++) {
    const spread = ((i * 5) % 9) - 4;
    view.particles.push({
      type, x: x + spread, y: y - (type === 'death' ? (i * 7) % 18 : 1 + (i % 3)),
      ordinal: i,
      role: type === 'impact' ? (i % 5 === 0 ? 'blood' : 'spark')
        : type === 'death' ? 'ember' : type,
      vx: type === 'shockwave' ? dir * (0.8 + (i % 5) * 0.4)
        : type === 'impact' ? dir * ((i % 5 === 0 ? 0.35 : 0.8) + (i % 3) * 0.42) : spread * 0.08,
      vy: type === 'death' ? -0.35 - (i % 4) * 0.08
        : type === 'impact' ? -0.8 + (i % 5) * 0.35
          : type === 'shockwave' ? -0.15 - (i % 3) * 0.12 : -0.25,
      life, maxLife: life,
    });
  }
  if (type === 'impact' || type === 'death' || type === 'shockwave') {
    view.eventLights.push({
      kind: type, x, y, dir,
      floorY: type === 'impact' ? y + 12 : y,
      radius: type === 'impact' ? 38 : type === 'shockwave' ? 30 : 22,
      strength: type === 'impact' ? 0.78 : type === 'shockwave' ? 0.42 : 0.30,
      color: type === 'impact' ? 'c' : type === 'death' ? 'o' : 'j',
      coreColor: type === 'impact' ? '5' : undefined,
      life, maxLife: life,
    });
  }
}

function nearestThreat(s) {
  const threats = [...(s.enemies || []).filter((enemy) => enemy.alive)];
  if (s.boss?.alive) threats.push(s.boss);
  let nearest = null;
  for (const threat of threats) {
    const distance = Math.abs(threat.x - s.player.x);
    if (!nearest || distance < nearest.distance) nearest = { threat, distance };
  }
  return nearest?.threat || null;
}

function nearestThreatDirection(s) {
  const threat = nearestThreat(s);
  if (!threat) return -s.player.facing;
  return s.player.x < threat.x ? -1 : 1;
}

/** Advance presentation-only FX from stage state. Exported for headless render-boundary tests. */
export function presentationFor(s, rawSwing) {
  let view = STAGE_PRESENTATION.get(s);
  if (!view) {
    view = {
      tick: 0, lastEvents: null, lastOnGround: s.player.onGround, lastDodge: 0,
      hurt: 0, hurtDir: 0, hitstop: 0, heldSwingFrame: -1,
      trashStrike: 0, strikeTarget: null, particles: [], deathEchoes: [], bossDeathEchoes: [],
      trashDeathEchoes: [], eventLights: [],
      lastRunBeat: -1, lastBossPhase: s.boss?.phase || null, lastBossStep: null,
      lastAirJumpSerial: 0, land: 0, moveTicks: 0,
    };
    STAGE_PRESENTATION.set(s, view);
  }
  if (view.lastEvents !== s.events) {
    view.lastEvents = s.events;
    for (const event of s.events || []) {
      if (event.type === 'hurt') {
        view.hurt = AR3B_TIMING.heroHurtFrames;
        view.hurtDir = nearestThreatDirection(s);
        const threat = nearestThreat(s);
        if (threat && threat !== s.boss) {
          view.trashStrike = 4;
          view.strikeTarget = threat;
        }
        spawnBurst(view, 'impact', s.player.x, s.player.y - 11, view.hurtDir);
      } else if (event.type === 'hit') {
        view.hitstop = AR3B_TIMING.visualHitstopFrames;
        view.heldSwingFrame = rawSwing.active ? Math.max(1, rawSwing.frame) : 2;
        const target = event.enemy === 'boss'
          ? s.boss
          : (s.enemies || []).find((enemy) => enemy.type.id === event.enemy && enemy.hitFlash > 0);
        if (target) spawnBurst(view, 'impact', target.x, target.y - (event.enemy === 'boss' ? 25 : 11), s.player.facing);
      } else if (event.type === 'death') {
        view.deathEchoes.push({ x: event.at.x, y: event.at.y, facing: s.player.facing, life: AR3B_TIMING.deathEchoFrames });
        spawnBurst(view, 'death', event.at.x, event.at.y, s.player.facing);
      } else if (event.type === 'kill') {
        view.trashDeathEchoes.push({
          x: event.at.x, y: event.at.y, facing: event.facing || 1, enemy: event.enemy,
          life: AR3B_TIMING.deathEchoFrames,
        });
        spawnBurst(view, 'death', event.at.x, event.at.y, event.facing || 1);
      } else if (event.type === 'boss-defeat' && s.boss) {
        view.bossDeathEchoes.push({
          x: s.boss.x, y: s.boss.y, facing: s.boss.facing, life: AR3B_TIMING.bossDeathFrames,
        });
        spawnBurst(view, 'death', s.boss.x, s.boss.y - 24, s.boss.facing);
      }
    }
  }
  // Durable air-jump dust: serial + stored coords survive catch-up ticks that replace s.events.
  // Audio continues to use the immediate stage event; this path must not duplicate on re-entry.
  const airJump = s.airJumpPresentation;
  if (airJump && airJump.serial > view.lastAirJumpSerial) {
    view.lastAirJumpSerial = airJump.serial;
    spawnBurst(view, 'dust', airJump.x, airJump.y + 4, -s.player.facing);
  }
  if (!view.lastOnGround && s.player.onGround) {
    view.land = AR3B_TIMING.landVisualTicks;
    spawnBurst(view, 'dust', s.player.x, s.player.y, -s.player.facing);
  }
  view.lastOnGround = s.player.onGround;
  if (s.player.onGround && Math.abs(s.player.vx || 0) > 0.01 && s.player.dodging <= 0) view.moveTicks++;
  else view.moveTicks = 0;
  if (s.player.dodging > 0 && (view.tick % 2 === 0 || view.lastDodge <= 0)) {
    spawnBurst(view, 'dust', s.player.x - s.player.dodgeDir * 7, s.player.y, -s.player.dodgeDir);
  }
  view.lastDodge = s.player.dodging;
  const runBeat = s.player.onGround && Math.abs(s.player.vx || 0) > 0.01
    ? Math.floor(Math.abs(s.player.x || 0) / AR3B_TIMING.runStridePixels) % 2 : -1;
  if (runBeat === 0 && view.lastRunBeat !== 0) {
    spawnBurst(view, 'dust', s.player.x - s.player.facing * 3, s.player.y, -s.player.facing);
  }
  view.lastRunBeat = runBeat;
  if (s.boss?.alive) {
    if (view.lastBossPhase !== s.boss.phase && s.boss.phase === BOSS_PHASE.LUNGE) {
      spawnBurst(view, 'shockwave', s.boss.x + s.boss.facing * 22, s.boss.y, s.boss.facing);
    }
    view.lastBossPhase = s.boss.phase;
    const bossStep = s.boss.phase === BOSS_PHASE.IDLE && Math.abs(s.boss.vx || 0) > 0.01
      ? Math.floor(Math.abs(s.boss.x || 0) / AR3B_TIMING.bossStepPixels) : null;
    if (bossStep != null && view.lastBossStep != null && bossStep !== view.lastBossStep) {
      spawnBurst(view, 'dust', s.boss.x - s.boss.facing * 18, s.boss.y, -s.boss.facing);
    }
    view.lastBossStep = bossStep;
  }
  return view;
}

function drawPresentationEffects(ctx, view, cam, theme, reduce) {
  for (const echo of view.deathEchoes) {
    const progress = 1 - echo.life / AR3B_TIMING.deathEchoFrames;
    const assetId = playerStripAssetId('death');
    const visual = getAsset(assetId) || PLAYER_R;
    const frame = Math.min(HERO_RIG.strips.death.frames - 1, Math.floor(progress * HERO_RIG.strips.death.frames));
    const flip = echo.facing === FACING.RIGHT;
    const placement = visual.frameAnchors
      ? playerFramePlacement(visual, frame, echo.x, echo.y, flip)
      : { x: echo.x - visual.w / 2, y: groundedVisualY(echo.y, visual) };
    const fallback = echo.facing === FACING.LEFT ? PLAYER_L : PLAYER_R;
    drawCharacterPosed(ctx, assetId, fallback, placement.x, placement.y, cam, flip, {
      alpha: Math.max(0.55, echo.life / AR3B_TIMING.deathEchoFrames),
    }, frame);
  }
  for (const echo of view.bossDeathEchoes) {
    const progress = 1 - echo.life / AR3B_TIMING.bossDeathFrames;
    const fallback = echo.facing === FACING.LEFT ? BOSS_L : BOSS_R;
    drawCharacterPuppet(ctx, 'boss', fallback, echo.x, echo.y, cam, echo.facing === FACING.LEFT, {
      lean: echo.facing * Math.round(progress * 8),
      squash: Math.round(progress * 40),
      stretchX: Math.round(progress * 12),
      alpha: Math.max(0.10, echo.life / AR3B_TIMING.bossDeathFrames),
    });
  }
  for (const echo of view.trashDeathEchoes) {
    const progress = 1 - echo.life / AR3B_TIMING.deathEchoFrames;
    const isHopper = echo.enemy === 'hopper';
    const skin = enemySkinFor(theme, echo.enemy);
    const assetId = `enemy_${echo.enemy}_${skin}_death`;
    const fallback = echo.facing === FACING.LEFT
      ? (isHopper ? HOPPER_L : WALKER_L)
      : (isHopper ? HOPPER_R : WALKER_R);
    const asset = getAsset(assetId) || fallback;
    const fw = asset.frameWidth || asset.width || asset.w;
    const wy = groundedVisualY(echo.y, asset);
    const frame = Math.min(
      (asset.frames ? asset.frames - 1 : 0),
      Math.floor(progress * (asset.frames || 1)),
    );
    drawCharacterPosed(ctx, assetId, fallback, echo.x - fw / 2, wy, cam, echo.facing === FACING.LEFT, {
      lean: echo.facing * Math.round(progress * 5),
      squash: Math.round(progress * 9),
      alpha: Math.max(0.32, echo.life / AR3B_TIMING.deathEchoFrames),
      dissolve: Math.min(0.82, progress * 0.92),
    }, frame);
  }
  // Event bodies: a white-hot impact core, an ordered compression ring, and a floor-bound
  // shockwave. The compositor below turns these same events into actual scene lights.
  for (const emitter of view.eventLights) {
    const sx = Math.round(emitter.x - cam.x); const sy = Math.round(emitter.y - cam.y);
    const progress = 1 - emitter.life / emitter.maxLife;
    if (emitter.kind === 'impact') {
      const ringX = 5 + progress * 14; const ringY = 3 + progress * 8;
      ctx.fillStyle = PALETTE[reduce ? 'j' : 'p'];
      for (let step = 0; step < 56; step++) {
        const angle = step / 56 * Math.PI * 2;
        const px = Math.round(sx + Math.cos(angle) * ringX);
        const py = Math.round(sy + Math.sin(angle) * ringY);
        if (lightBayerAt(px + cam.x, py + cam.y) < (reduce ? 0.46 : 0.72)) ctx.fillRect(px, py, 1, 1);
      }
      if (emitter.life >= emitter.maxLife - (reduce ? 1 : 3)) {
        ctx.fillStyle = PALETTE[reduce ? 'p' : '5'];
        ctx.fillRect(sx - 1, sy - 1, 3, 3);
      }
    } else if (emitter.kind === 'shockwave') {
      ctx.fillStyle = PALETTE[reduce ? '7' : 'j'];
      const reach = Math.round(4 + progress * 22);
      ctx.fillRect(sx - reach, sy - 1, reach * 2 + 1, 1);
      ctx.fillRect(sx - Math.round(reach * 0.65), sy - 2, Math.round(reach * 1.3), 1);
    }
  }
  for (const particle of view.particles) {
    const fade = particle.life / particle.maxLife;
    if (reduce && particle.role === 'ember' && particle.ordinal % 2) continue;
    ctx.globalAlpha = Math.max(0.18, fade) * (reduce ? 0.72 : 1);
    ctx.fillStyle = particle.role === 'blood' ? PALETTE[particle.ordinal % 2 ? 'f' : 'g']
      : particle.role === 'ember' ? PALETTE[particle.ordinal % 3 ? 'g' : 'o']
      : particle.type === 'impact' ? PALETTE[reduce ? 'j' : (particle.ordinal % 3 ? 'c' : 'p')]
      : particle.type === 'shockwave' ? (particle.life % 2 ? PALETTE['j'] : PALETTE['7'])
      : particle.type === 'death' ? PALETTE['g']
        : PALETTE['7'];
    const px = Math.round(particle.x - cam.x); const py = Math.round(particle.y - cam.y);
    if (particle.role === 'spark') {
      const tail = Math.max(1, Math.round(Math.abs(particle.vx) * 2));
      ctx.fillRect(px - Math.sign(particle.vx) * tail, py, tail + 1, 1);
    } else {
      const size = particle.type === 'shockwave' && particle.life > particle.maxLife - 3 ? 2 : 1;
      ctx.fillRect(px, py, size, size);
    }
  }
  ctx.globalAlpha = 1;
}

function advancePresentation(view) {
  view.tick++;
  if (view.hurt > 0) view.hurt--;
  if (view.land > 0) view.land--;
  if (view.hitstop > 0) view.hitstop--;
  if (view.trashStrike > 0) view.trashStrike--;
  else view.strikeTarget = null;
  for (const echo of view.deathEchoes) echo.life--;
  view.deathEchoes = view.deathEchoes.filter((echo) => echo.life > 0);
  for (const echo of view.bossDeathEchoes) echo.life--;
  view.bossDeathEchoes = view.bossDeathEchoes.filter((echo) => echo.life > 0);
  for (const echo of view.trashDeathEchoes) echo.life--;
  view.trashDeathEchoes = view.trashDeathEchoes.filter((echo) => echo.life > 0);
  for (const particle of view.particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += particle.type === 'dust' || particle.type === 'shockwave' ? 0.02 : 0.06;
    particle.life--;
  }
  view.particles = view.particles.filter((particle) => particle.life > 0);
  for (const emitter of view.eventLights) emitter.life--;
  view.eventLights = view.eventLights.filter((emitter) => emitter.life > 0);
}

const AR3B_STRIP_FRAMES = Object.freeze({
  hero: Object.freeze([
    { label: 'IDLE', animation: 'idle', frame: 0, pose: {} },
    { label: 'WALK', animation: 'walk', frame: 2, pose: {}, dust: true },
    { label: 'RUN', animation: 'run', frame: 4, pose: {}, dust: true },
    { label: 'DASH', animation: 'dash', frame: 3, pose: {}, dust: true },
    { label: 'COMBO A', animation: 'katana_combo', frame: 0, pose: {} },
    { label: 'COMBO B', animation: 'katana_combo', frame: 4, pose: {}, impact: true },
    { label: 'HURT', animation: 'hurt', frame: 2, pose: {}, impact: true },
    { label: 'DEATH', animation: 'death', frame: 9, pose: {} },
  ]),
  walker: Object.freeze([
    { label: 'IDLE', pose: {} },
    { label: 'PATROL', pose: { lean: 1 } },
    { label: 'WIND-UP A', pose: { lean: -2, squash: 1 }, tell: true },
    { label: 'WIND-UP B', pose: { lean: -3, squash: 2 }, tell: true },
    { label: 'STRIKE', pose: { lean: 4, squash: 1, shift: 2 } },
    { label: 'HITSTOP', pose: { lean: 4, shift: 2 }, impact: true },
    { label: 'HURT', pose: { lean: -4 }, impact: true },
    { label: 'DISSOLVE', pose: { lean: -3, squash: 5, alpha: 0.45 }, dissolve: true },
  ]),
  hopper: Object.freeze([
    { label: 'IDLE', pose: {} },
    { label: 'HOP', pose: { lean: 2 } },
    { label: 'COIL A', pose: { squash: 2 }, tell: true },
    { label: 'COIL B', pose: { squash: 3 }, tell: true },
    { label: 'STRIKE', pose: { lean: 4, squash: 1, shift: 2 } },
    { label: 'HITSTOP', pose: { lean: 4, shift: 2 }, impact: true },
    { label: 'HURT', pose: { lean: -4 }, impact: true },
    { label: 'DISSOLVE', pose: { squash: 5, alpha: 0.45 }, dissolve: true },
  ]),
  boss: Object.freeze([
    { label: 'IDLE', pose: {} },
    { label: 'WEIGHT STEP', pose: { lean: 1, squash: 1, stretchX: 1 }, dust: true },
    { label: 'WIND-UP A', pose: { lean: -4, squash: 6, stretchX: 5, shift: -1 }, tell: true },
    { label: 'WIND-UP B', pose: { lean: -5, squash: 7, stretchX: 6, shift: 1 }, tell: true },
    { label: 'ATTACK', pose: { lean: 11, stretchX: 10, stretchY: 3, shift: 6 }, shockwave: true },
    { label: 'IMPACT', pose: { lean: 8, stretchX: 7, shift: 4 }, impact: true, shockwave: true },
    { label: 'HURT', pose: { lean: -4, shift: -2 }, impact: true },
    { label: 'DEATH', pose: { lean: -6, squash: 40, stretchX: 12, alpha: 0.36 }, dissolve: true },
  ]),
});

function proofCharacter(kind) {
  if (kind === 'hero') return { asset: playerStripAssetId('idle'), fallback: PLAYER_R };
  if (kind === 'hopper') return { asset: 'enemy_hopper', fallback: HOPPER_R };
  if (kind === 'boss') return { asset: 'boss', fallback: BOSS_R };
  return { asset: 'enemy_walker', fallback: WALKER_R };
}

function drawProofBurst(ctx, x, y, facing, dissolve = false) {
  ctx.fillStyle = dissolve ? PALETTE['g'] : PALETTE['5'];
  for (let i = 0; i < 7; i++) {
    const dx = dissolve ? ((i * 5) % 11) - 5 : facing * (5 + (i % 3) * 3);
    const dy = dissolve ? -((i * 7) % 22) : -5 + i * 2;
    ctx.fillRect(Math.round(x + dx), Math.round(y + dy), i % 3 === 0 ? 2 : 1, 1);
  }
}

function drawProofDust(ctx, x, y, facing) {
  ctx.fillStyle = PALETTE['7'];
  ctx.fillRect(Math.round(x - facing * 2), Math.round(y - 1), 4, 1);
  ctx.fillRect(Math.round(x - facing * 5), Math.round(y - 2), 2, 1);
  ctx.fillStyle = PALETTE['4'];
  ctx.fillRect(Math.round(x - facing * 7), Math.round(y - 3), 1, 1);
}

/** Proof-only renderer for the operator certification strips. It uses the same curated assets,
 *  integer pose compositor, arc, tell, impact, and contact math as the live stage renderer. */
export function drawAnimationProofStrip(canvas, kind) {
  const frames = AR3B_STRIP_FRAMES[kind];
  if (!canvas || !frames) throw new Error(`unknown animation strip kind: ${kind}`);
  canvas.width = 640;
  canvas.height = 132;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PALETTE['0'];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = PALETTE['1'];
  ctx.fillRect(0, 17, canvas.width, 99);
  drawPixelText(ctx, `${kind.toUpperCase()} ACTION STRIP · AR3B`, 8, 12, PALETTE['5']);
  const surfaceY = 96;
  const cellW = 80;
  const base = proofCharacter(kind);
  LAST_ANIMATION_CONTACTS = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const assetId = frame.animation ? playerStripAssetId(frame.animation) : (frame.asset || base.asset);
    const fallback = kind === 'hero' ? PLAYER_R : base.fallback;
    const visual = (assetReady(assetId) && getAsset(assetId)) || fallback;
    const width = frameWidthFor(visual) || visual.w;
    const x = i * cellW + Math.floor(cellW / 2);
    let wx = Math.round(x - width / 2);
    let wy = groundedVisualY(surfaceY, visual);
    ctx.fillStyle = i % 2 ? PALETTE['2'] : PALETTE['1'];
    ctx.fillRect(i * cellW, 18, cellW, surfaceY - 18);
    const flip = kind === 'hero'; // certified canonical-left strip; proof action faces right.
    let frameAnchor = null;
    if (kind === 'hero' && visual.frameAnchors) {
      const placement = playerFramePlacement(visual, frame.frame || 0, x, surfaceY, flip);
      wx = placement.x;
      wy = placement.y;
      frameAnchor = placement.anchor;
    }
    if (kind === 'boss') drawCharacterPuppet(ctx, assetId, fallback, x, surfaceY, { x: 0, y: 0 }, false, frame.pose);
    else drawCharacterPosed(ctx, assetId, fallback, wx, wy, { x: 0, y: 0 }, flip, frame.pose, frame.frame || 0);
    if (frame.tell) drawAttackTell(ctx, x, wy, { x: 0, y: 0 }, 'windup', 1, true, kind === 'boss' ? 2 : 1);
    if (frame.dust) drawProofDust(ctx, x - 3, surfaceY, 1);
    if (frame.shockwave) drawProofBurst(ctx, x + 18, surfaceY, 1, false);
    if (frame.impact) drawProofBurst(ctx, x, surfaceY - Math.max(8, Math.floor((visual.height || visual.h) / 2)), 1, false);
    if (frame.dissolve) drawProofBurst(ctx, x, surfaceY, 1, true);
    ctx.fillStyle = PALETTE['6'];
    ctx.fillRect(i * cellW, surfaceY, cellW, 1);
    ctx.fillStyle = PALETTE['8'];
    ctx.fillRect(i * cellW, surfaceY + 1, cellW, 15);
    const labelX = i * cellW + Math.max(2, Math.floor((cellW - textWidth(frame.label)) / 2));
    drawPixelText(ctx, frame.label, labelX, 126, frame.tell ? PALETTE['c'] : PALETTE['6']);
    const bottomInset = visual.bottomInset || 0;
    const opaqueBottomRow = frameAnchor
      ? Math.round(wy + frameAnchor.y)
      : Math.round(wy + (visual.height || visual.h) - bottomInset - 1);
    LAST_ANIMATION_CONTACTS.push({
      kind, pose: frame.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      surfaceRow: surfaceY, opaqueBottomRow, gap: surfaceY - opaqueBottomRow,
    });
  }
  return LAST_ANIMATION_CONTACTS.map((contact) => ({ ...contact }));
}

export function animationContactSnapshot() {
  return LAST_ANIMATION_CONTACTS.map((contact) => ({ ...contact }));
}

/** Build the tile key-remap for a theme: recolor neutral stone/moss keys into the sub-palette. */
function tileRemap(theme) {
  return {
    '7': theme.ground, '8': theme.groundDark, '6': theme.groundHi, '1': theme.sky[1],
    e: theme.moss, d: theme.groundDark, q: theme.accent,
  };
}

/** Draw one curated Willibab masonry face, then give each world tile its own wear, room tint, and
 * ambient drop. The licensed face is still blitted unmodified; material is composited around/over
 * it, as approved by the PoC. */
function drawEnvironmentTile(ctx, theme, fallback, wx, wy, cam, surface, tx, ty, remap) {
  const ox = Math.round(wx - cam.x);
  const oy = Math.round(wy - cam.y);
  if (drawAsset(ctx, theme.tileAsset, wx, wy, cam, false)) {
    // Curated payload has already landed byte-for-byte. Everything below is a deterministic
    // world-space material/light response; identical source tiles no longer read as wallpaper.
  } else {
    blitTinted(ctx, fallback, wx, wy, cam, remap);
  }
  const coarse = stageMaterialField(`${theme.name}:ground:coarse`, 4);
  const fine = stageMaterialField(`${theme.name}:ground:fine`, 3);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = PALETTE[theme.gap];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const worldX = wx + x; const worldY = wy + y;
    const wear = coarse(worldX * 0.055, worldY * 0.09) - 0.5;
    const tileWear = ((((tx * 37 + ty * 19) >>> 0) % 11) - 5) * 0.012;
    ctx.globalAlpha = Math.max(0.30, Math.min(0.80, 0.44 + y / 16 * 0.30 - wear * 0.20 + tileWear));
    ctx.fillRect(ox + x, oy + y, 1, 1);
  }
  ctx.restore();
  // Fine pitting and worn catches are ordered-dithered in world space.
  ctx.save();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const worldX = wx + x; const worldY = wy + y;
    const pit = fine(worldX * 0.31, worldY * 0.31);
    if (pit > 0.66 && lightBayerAt(worldX, worldY) < (pit - 0.66) * 2.2) {
      ctx.globalAlpha = 0.26; ctx.fillStyle = PALETTE[theme.groundDark]; ctx.fillRect(ox + x, oy + y, 1, 1);
    } else if (pit < 0.34 && lightBayerAt(worldX, worldY) > 0.72) {
      ctx.globalAlpha = 0.13; ctx.fillStyle = PALETTE[theme.groundHi]; ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  ctx.restore();
  if (!surface) return;
  ctx.fillStyle = PALETTE[theme.edge];
  ctx.fillRect(ox, oy, 16, 1);               // lit standable lip survives the ambient drop
  ctx.fillStyle = PALETTE[theme.groundHi];
  ctx.fillRect(ox, oy + 1, 16, 1);
  // Contact AO under the lip is the walkable-vs-blocked depth cue at gameplay camera scale.
  ctx.save();
  ctx.fillStyle = PALETTE['0'];
  for (let y = 2; y < 9; y++) {
    ctx.globalAlpha = 0.32 * (1 - (y - 2) / 7);
    ctx.fillRect(ox, oy + y, 16, 1);
  }
  ctx.restore();
  // One restrained moss cluster per tile, offset by world tile coordinates.
  ctx.fillStyle = PALETTE[theme.moss];
  const mx = 2 + ((tx * 5 + ty * 3) % 10);
  ctx.fillRect(ox + mx, oy + 1, 3, 1);
}

function drawBackdropMaterial(ctx, theme, cam, vw, vh, horizon, seed) {
  const image = ctx.createImageData(vw, vh);
  const data = image.data;
  const clouds = stageMaterialField(`${seed}:${theme.name}:clouds`, 4);
  const skyRamp = theme.backdrop;
  const gapRgb = hexToRgb(PALETTE[theme.gap]);
  for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
    const index = (y * vw + x) * 4;
    let rgb = gapRgb;
    if (y < horizon) {
      // Backdrop has its own slow world plane. Camera and material advance together, so neither
      // fbm nor the Bayer threshold can shimmer in screen space.
      const worldX = x + Math.round(cam.x * 0.08);
      const worldY = y + Math.round(cam.y * 0.08);
      const vertical = 0.05 + y / Math.max(1, horizon - 1) * 0.84;
      const band = Math.max(0, 1 - Math.abs(y - horizon * 0.61) / (horizon * 0.55));
      const cloud = (clouds(worldX * 0.020, worldY * 0.055) - 0.5) * 0.42 * band;
      rgb = hexToRgb(PALETTE[materialRampKey(skyRamp, Math.max(0, Math.min(1, vertical + cloud)), worldX, worldY)]);
    }
    data[index] = rgb[0]; data[index + 1] = rgb[1]; data[index + 2] = rgb[2]; data[index + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function drawRuinMaterialShape(ctx, sil, sx, top, ramp, layerSeed) {
  const noise = stageMaterialField(`${layerSeed}:${sil.kind}:${sil.x}`, 4);
  const paint = (screenX, screenY, localX, localY, width, height) => {
    const worldX = Math.round(sil.x + localX);
    const worldY = Math.round(top + localY);
    const u = localX / Math.max(1, width - 1); const v = localY / Math.max(1, height - 1);
    let amount = 0.30 + (1 - v) * 0.18 + (1 - u) * 0.08;
    amount += (noise(worldX * 0.085, worldY * 0.085) - 0.5) * 0.34;
    amount += (noise(worldX * 0.36, worldY * 0.36) - 0.5) * 0.12;
    if ((worldY % 7 + 7) % 7 === 0) amount -= 0.20;
    if ((worldX + Math.floor(worldY / 7) * 5) % 13 === 0) amount -= 0.10;
    if (localX === 0) amount += 0.14; // cold rim on the key-facing edge
    ctx.fillStyle = PALETTE[materialRampKey(ramp, Math.max(0, Math.min(1, amount)), worldX, worldY)];
    ctx.fillRect(screenX, screenY, 1, 1);
  };
  const rect = (x, y, w, h) => {
    for (let localY = 0; localY < h; localY++) for (let localX = 0; localX < w; localX++) {
      paint(x + localX, y + localY, x - sx + localX, y - top + localY, sil.w, sil.h);
    }
  };
  if (sil.kind === 'spire') {
    for (let row = 0; row < sil.h; row++) {
      const progress = row / sil.h;
      const width = Math.max(2, Math.round(sil.w * (0.22 + 0.78 * progress)));
      const offset = Math.round((sil.w - width) / 2);
      for (let x = 0; x < width; x++) paint(sx + offset + x, top + row, offset + x, row, sil.w, sil.h);
    }
    return;
  }
  if (sil.kind === 'arch') {
    const pier = Math.max(3, Math.floor(sil.w / 5));
    rect(sx, top + 6, pier, sil.h - 6);
    rect(sx + sil.w - pier, top + 6, pier, sil.h - 6);
    rect(sx, top, sil.w, 7);
    // Pointed spandrel leaves a genuine lancet void showing the dithered sky behind it.
    const inner = sil.w / 2 - pier; const span = Math.min(14, sil.h - 7);
    for (let row = 0; row < span; row++) {
      const voidHalf = inner * Math.min(1, Math.pow(row / Math.max(1, span), 0.62));
      for (let x = -Math.floor(inner); x <= Math.floor(inner); x++) {
        if (Math.abs(x) < voidHalf) continue;
        paint(Math.round(sx + sil.w / 2 + x), top + 7 + row, Math.round(sil.w / 2 + x), 7 + row, sil.w, sil.h);
      }
    }
    return;
  }
  rect(sx, top, sil.w, sil.h);
  if (sil.kind === 'tomb') rect(sx + 2, top - 3, Math.max(1, sil.w - 4), 3);
  else {
    const merlonWidth = sil.kind === 'tower' ? 4 : 6;
    for (let x = 0; x < sil.w; x += merlonWidth * 2) {
      // Fixed missing teeth keep the silhouette ruined rather than kit-like.
      if (((x / merlonWidth) + sil.x) % 5 === 0) continue;
      rect(sx + x, top - 4, Math.min(merlonWidth, sil.w - x), 4);
    }
  }
}

/** Textured masonry silhouettes with courses, broken merlons, cold rims, and open lancet voids. */
function drawRuinLayer(ctx, layout, cameraX, factor, baseY, ramp, alpha, vw, layerSeed) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const sil of layout) {
    const sx = Math.round(sil.x - cameraX * factor);
    if (sx + sil.w < 0 || sx > vw) continue;
    const top = baseY - sil.h;
    drawRuinMaterialShape(ctx, sil, sx, top, ramp, layerSeed);
  }
  ctx.restore();
}

export function drawStage(ctx, s, vw, vh) {
  LAST_GROUND_CONTACTS = [];
  const cam = s.camera;
  const tm = s.tilemap;
  const ts = tm.tileSize;
  const reduce = !!(s.settings && s.settings.reduceEffects); // flash/strobe caps (accessibility)
  const theme = themeFor(s.theme);
  const remap = tileRemap(theme);
  const rawSwing = attackVisualView(s.attack);
  const presentation = presentationFor(s, rawSwing);
  const lightFrame = createLightFrame(theme, cam, vw, vh, reduce);

  // --- Backdrop material: ordered night ramp + fbm cloud band, keyed to its slow world plane. ---
  const horizon = Math.floor(vh * 0.6);
  drawBackdropMaterial(ctx, theme, cam, vw, vh, horizon, s.seed || 'backdrop');

  // Two architectural depths with distinct parallax rates and values.
  if (!s._parallaxFar) s._parallaxFar = parallaxLayout(tm.worldWidth, s.theme, `${s.seed || 'p'}:far`);
  if (!s._parallaxNear) s._parallaxNear = parallaxLayout(tm.worldWidth, s.theme, `${s.seed || 'p'}:near`);
  drawRuinLayer(ctx, s._parallaxFar, cam.x, 0.16, horizon + 12,
    [theme.gap, theme.far, theme.backdrop[theme.backdrop.length - 1]], 0.78, vw, `${s.seed}:far`);
  drawRuinLayer(ctx, s._parallaxNear, cam.x, 0.38, horizon + 24,
    [theme.gap, theme.near, theme.groundDark, theme.ground], 0.96, vw, `${s.seed}:near`);

  // --- Tiles (themed tint; only the visible window). ---
  const tx0 = Math.max(0, Math.floor(cam.x / ts));
  const tx1 = Math.min(tm.w - 1, Math.floor((cam.x + vw) / ts));
  const ty0 = Math.max(0, Math.floor(cam.y / ts));
  const ty1 = Math.min(tm.h - 1, Math.floor((cam.y + vh) / ts));
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!tm.solidAt(tx, ty)) continue;
      const surface = !tm.solidAt(tx, ty - 1); // exposed top → mossy cap
      drawEnvironmentTile(
        ctx, theme, surface ? TILE_GRASS : TILE_DIRT,
        tx * ts, ty * ts, cam, surface, tx, ty, remap,
      );
    }
  }

  // --- Ground dressing (deterministic, theme-gated). Drawn before entities so props sit behind. ---
  if (!s._dressing) s._dressing = computeDressing(tm, s.theme, s.seed || 'd');
  for (const dec of s._dressing) {
    const spr = DRESS_SPRITE[dec.kind];
    if (!spr) continue;
    // Wall torches throw a warm pool.
    if (dec.kind === 'torch') {
      registerLight(lightFrame, {
        kind: 'torch', x: dec.x, y: dec.y - spr.h + 2, floorY: dec.y,
        radius: 24, strength: 0.48, color: theme.torch, coreColor: 'p', seed: dec.seed,
      });
    }
    const assetId = DRESS_ASSET[dec.kind];
    const asset = assetId && getAsset(assetId);
    const alpha = dec.kind === 'gargoyle' ? 0.72 : 0.92;
    if (!asset || !drawAssetAlpha(
      ctx, assetId, dec.x - asset.width / 2, dec.y - asset.height, cam, false, alpha,
    )) {
      blit(ctx, spr, dec.x - spr.w / 2, dec.y - spr.h, cam);
    }
  }

  // Checkpoints register a practical light; the active one has the stronger rig.
  for (let i = 0; i < s.checkpoints.length; i++) {
    const cp = s.checkpoints[i];
    registerLight(lightFrame, {
      kind: 'checkpoint', x: cp.x, y: cp.y - CHECKPOINT.h + 4, floorY: cp.y,
      radius: i === s.activeCheckpoint ? 34 : 26,
      strength: i === s.activeCheckpoint ? 0.62 : 0.38,
      color: theme.torch, coreColor: 'p', seed: i + 31,
    });
    if (i === s.activeCheckpoint) blitSilhouette(ctx, CHECKPOINT, cp.x - CHECKPOINT.w / 2, cp.y - CHECKPOINT.h, cam, PALETTE['c']);
    else blit(ctx, CHECKPOINT, cp.x - CHECKPOINT.w / 2, cp.y - CHECKPOINT.h, cam);
  }

  // Death marker (pulses; spectral glow).
  if (s.marker) {
    const pulse = Math.floor(cam.x + s.marker.x) % 24 < 12 ? PALETTE['u'] : PALETTE['5'];
    registerLight(lightFrame, {
      kind: 'marker', x: s.marker.x, y: s.marker.y - MARKER.h - 6, floorY: s.marker.y,
      radius: 30, strength: 0.52, color: 't', coreColor: 'u', seed: 73,
    });
    blitSilhouette(ctx, MARKER, s.marker.x - MARKER.w / 2, s.marker.y - MARKER.h - 6, cam, pulse);
  }

  // Kit-unlock pickups.
  for (const u of s.unlockPickups) {
    if (u.collected) continue;
    blit(ctx, UNLOCK, u.x - UNLOCK.w / 2, u.y - UNLOCK.h, cam);
  }

  // Projectiles.
  for (const pr of s.projectiles) {
    ctx.fillStyle = pr.kind === 'sub' ? PALETTE['b'] : PALETTE['5'];
    ctx.fillRect(Math.round(pr.x - pr.w / 2 - cam.x), Math.round(pr.y - pr.h / 2 - cam.y), pr.w, pr.h);
  }

  // Drops.
  for (const d of s.drops) {
    if (d.collected) continue;
    blit(ctx, DROP_HEAL, d.x - DROP_HEAL.w / 2, d.y - DROP_HEAL.h, cam);
  }

  // Enemies. Themed skins + multi-frame strips; states wired to real sim signals.
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const isHopper = e.type.id === 'hopper';
    const state = enemyVisualState(e, s.player, s.iframes);
    const assetId = enemyAssetFor(e, s.theme, state);
    const fallback = e.facing === FACING.LEFT
      ? (isHopper ? HOPPER_L : WALKER_L)
      : (isHopper ? HOPPER_R : WALKER_R);
    const asset = assetReady(assetId) ? getAsset(assetId) : null;
    const visual = asset || fallback;
    const fw = asset ? (asset.frameWidth || asset.width) : fallback.w;
    const attackPose = presentation.trashStrike > 0 && presentation.strikeTarget === e
      ? { phase: 'strike', lean: e.facing * 4, squash: 1, shift: e.facing * 2 }
      : enemyAttackPresentation(e, s.player, s.iframes);
    const recoil = !reduce && e.hitFlash > 0 ? Math.sign(e.x - s.player.x || -e.facing) * (e.hitFlash >= 4 ? 2 : 1) : 0;
    const wx = e.x - fw / 2 + recoil;
    const wy = groundedVisualY(e.y, visual);
    const flip = e.facing === FACING.LEFT;
    const posed = { ...attackPose };
    if (e.hitFlash > 0) {
      posed.lean = Math.sign(e.x - s.player.x || -e.facing) * 4;
    }
    const frame = enemyFrameFor(assetId, PLAYER_RENDER_TICK);
    drawCharacterPosed(ctx, assetId, fallback, wx, wy, cam, flip, posed, frame);
    drawAttackTell(ctx, e.x, wy, cam, attackPose.phase, e.facing, reduce);
    recordGroundContact(isHopper ? 'hopper' : 'walker', e, wx + (posed.shift || 0), wy, visual, cam, vw, vh);
  }

  // Boss with its telegraph tell.
  if (s.boss && s.boss.alive) {
    const b = s.boss;
    const bossAssetId = 'boss';
    const fallback = b.facing === FACING.LEFT ? BOSS_L : BOSS_R;
    const bossAsset = assetReady(bossAssetId) ? getAsset(bossAssetId) : null;
    const bossVisual = bossAsset || fallback;
    const bw = bossAsset ? bossAsset.width : fallback.w;
    const wx = b.x - bw / 2;
    const wy = groundedVisualY(b.y, bossVisual);
    const flip = b.facing === FACING.LEFT;
    const bossPose = bossPuppetPose(b, PLAYER_RENDER_TICK, reduce);
    drawCharacterPuppet(ctx, bossAssetId, fallback, b.x, b.y, cam, flip, bossPose);
    recordGroundContact('boss', b, wx, wy, bossVisual, cam, vw, vh);
    if (b.phase === BOSS_PHASE.TELEGRAPH) {
      drawAttackTell(ctx, b.x, wy, cam, 'windup', b.facing, reduce, 2);
    }
    // Boss HP pip bar above (chunky border in the register).
    const pipW = 24;
    const pips = Math.ceil((b.hp / BOSS_STATS.hp) * pipW);
    ctx.fillStyle = PALETTE['0'];
    ctx.fillRect(Math.round(b.x - cam.x - pipW / 2 - 1), Math.round(wy - cam.y - 13), pipW + 2, 5);
    ctx.fillStyle = PALETTE['8'];
    ctx.fillRect(Math.round(b.x - cam.x - pipW / 2), Math.round(wy - cam.y - 12), pipW, 3);
    ctx.fillStyle = PALETTE['g'];
    ctx.fillRect(Math.round(b.x - cam.x - pipW / 2), Math.round(wy - cam.y - 12), Math.max(0, pips), 3);
  }

  // Player (blink during i-frames).
  const swing = presentation.hitstop > 0 && presentation.heldSwingFrame >= 0
    ? { active: true, frame: presentation.heldSwingFrame }
    : rawSwing;
  const swingFrame = reduce && swing.active ? 2 : swing.frame;
  const hurt = presentation.hurt > 0;
  const playerAnimation = playerAnimationViewFor(
    s.player,
    swing.active ? { active: true, frame: swingFrame } : swing,
    PLAYER_RENDER_TICK,
    {
      reduceEffects: reduce,
      hurtTicks: hurt ? presentation.hurt : 0,
      landTicks: presentation.land,
      moveTicks: presentation.moveTicks,
      swingType: s.attack?.swingType || 'normal',
    },
  );
  const playerAssetId = playerAnimation.asset;
  const pFallback = s.player.facing === FACING.LEFT ? PLAYER_L : PLAYER_R;
  const playerAsset = assetReady(playerAssetId) ? getAsset(playerAssetId) : null;
  const playerVisual = playerAsset || pFallback;
  const playerPose = {};
  // Certified strips are authored canonical-left. The whole frame—including face, blade, slash
  // arc, and dash trail—is mirrored as one unit for right-facing play.
  const playerFlip = s.player.facing === FACING.RIGHT;
  const placement = playerAsset
    ? playerFramePlacement(playerAsset, playerAnimation.frame, s.player.x, s.player.y, playerFlip)
    : { x: s.player.x - pFallback.w / 2, y: groundedVisualY(s.player.y, pFallback), anchor: null };
  const pwx = placement.x;
  const pwy = placement.y;
  // I-frame feedback: a blink normally; under reduce-effects, draw steadily (no strobe) — the HUD
  // and knockback already signal the hit.
  let playerDrawn = false;
  let playerAssetDrawn = false;
  if (hurt) {
    playerAssetDrawn = drawCharacterPosed(ctx, playerAssetId, pFallback, pwx, pwy, cam, playerFlip, playerPose, playerAnimation.frame);
    playerDrawn = true;
  } else if (reduce || !(s.iframes > 0 && Math.floor(s.iframes / 3) % 2 === 0)) {
    playerAssetDrawn = drawCharacterPosed(ctx, playerAssetId, pFallback, pwx, pwy, cam, playerFlip, playerPose, playerAnimation.frame);
    playerDrawn = true;
  }
  if (playerDrawn && !s._proofDisableHeroConform) {
    const alphaMask = playerAssetDrawn
      ? heroAssetAlphaMask(playerAsset, playerAnimation.frame)
      : heroFallbackAlphaMask(pFallback);
    if (alphaMask) registerHeroLayer(lightFrame, {
      x: pwx, y: pwy,
      width: playerAssetDrawn ? frameWidthFor(playerAsset) : pFallback.w,
      height: playerAssetDrawn ? playerAsset.height : pFallback.h,
      alphaMask,
      flip: playerAssetDrawn ? playerFlip : false,
    });
  }
  if (swing.active && !hurt) {
    if (swingFrame === 0) drawAttackTell(ctx, s.player.x, pwy, cam, 'windup', s.player.facing, reduce);
  }
  recordGroundContact('hero', s.player, pwx, pwy, playerVisual, cam, vw, vh, placement.anchor);
  drawPresentationEffects(ctx, presentation, cam, s.theme, reduce);
  for (const emitter of presentation.eventLights) registerLight(lightFrame, emitter);
  applyLightPass(ctx, lightFrame);
  if (!PROOF_PRESENTATION_FROZEN) {
    PLAYER_RENDER_TICK++;
    advancePresentation(presentation);
  }
}
