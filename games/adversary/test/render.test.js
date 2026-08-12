import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PALETTE, PALETTE_KEYS, RAMPS, THEMES, shade, themeFor, hexToRgb, rgbaOf, contrastRatio,
} from '../src/render/palette.js';
import { parseSprite, rasterize, flipH, toImageData, padRows } from '../src/render/sprite.js';
import { computeIntegerScale, LOGICAL_W, LOGICAL_H } from '../src/render/canvas.js';
import {
  PIXEL_FONT_GLYPHS, PIXEL_GLYPH_HEIGHT, drawPixelText, fitPixelText, textWidth, wrapPixelText,
} from '../src/render/pixelfont.js';
import {
  HERO_HAND_ANCHORS, HERO_RIG, PLAYER_HEADGEAR, PLAYER_HEADGEAR_OPTIONS,
  groundedVisualY, groundContactGap, playerStripAssetId,
} from '../src/render/assets.js';
import {
  AR3A_TIMING, AR3B_TIMING, bossPuppetPose, enemyAttackPresentation, playerAssetIdFor,
  playerAnimationViewFor, playerFramePlacement, presentationFor,
} from '../src/render/stagerender.js';
import { TABS, TAB_LABEL } from '../src/sim/menu.js';
import { WEAPONS } from '../src/sim/equipment.js';
import { UNIQUES } from '../src/sim/uniques.js';
import { KIT_MOVES } from '../src/sim/kit.js';
import { createStage, stepStage } from '../src/sim/stage.js';

test('palette: transparent key and hex resolution', () => {
  assert.equal(PALETTE['.'], null);
  assert.deepEqual(rgbaOf('.'), [0, 0, 0, 0]);
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
  assert.deepEqual(rgbaOf('5'), [255, 255, 255, 255]);
  assert.ok(!PALETTE_KEYS.includes('.'), 'drawable keys exclude transparent');
});

test('palette: every ramp key resolves to a real palette color', () => {
  for (const [name, keys] of Object.entries(RAMPS)) {
    assert.ok(keys.length >= 2, `ramp ${name} has at least 2 shades`);
    for (const k of keys) {
      assert.ok(PALETTE[k] != null, `ramp ${name} key '${k}' is a drawable palette color`);
    }
  }
});

test('palette: shade clamps and maps integer + fractional levels', () => {
  assert.equal(shade('stone', 0), '1');           // darkest
  assert.equal(shade('stone', 4), '4');           // lightest
  assert.equal(shade('stone', 99), '4');          // clamps high
  assert.equal(shade('stone', -5), '1');          // clamps low
  assert.equal(shade('stone', 0.5), '7');         // mid of a 5-ramp (idx 2)
  assert.equal(shade('moss', 1), 'e');
  assert.throws(() => shade('nope', 0), /unknown ramp/);
});

test('palette: themes reference only real palette keys and default sanely', () => {
  for (const [id, th] of Object.entries(THEMES)) {
    assert.ok(typeof th.name === 'string' && th.name.length, `${id} has a name`);
    const keys = [
      ...th.sky, ...th.backdrop, th.gap, th.far, th.near,
      th.ground, th.groundDark, th.groundHi, th.tileWash, th.edge,
      th.moss, th.accent, th.torch,
    ];
    for (const k of keys) assert.ok(PALETTE[k] != null, `${id} key '${k}' is drawable`);
    assert.match(th.tileAsset, /^env_tile_/, `${id} selects a curated environment face`);
    assert.ok(th.enemySkins, `${id} has enemySkins map`);
    assert.ok(th.enemySkins.walker, `${id} walker skin mapped`);
    assert.ok(th.enemySkins.hopper, `${id} hopper skin mapped`);
    assert.ok(Array.isArray(th.dressing) && th.dressing.length, `${id} lists dressing`);
  }
  assert.equal(themeFor('crypt'), THEMES.crypt);
  assert.equal(themeFor('missing'), THEMES.cemetery); // safe default
});

test('palette: overlay text pairs clear WCAG AA on the opaque carved scrim', () => {
  // The pause / menu / clear overlays now share the bottom HUD's opaque '1' scrim backing.
  const bg = '1';
  const pairs = [
    ['j', bg, 'body text'],
    ['c', bg, 'selected/gold text'],
    ['5', bg, 'title/white text'],
    ['4', bg, 'dimmed locked row'],
    ['c', bg, 'positive delta'],
    ['o', bg, 'negative delta'],
    ['b', bg, 'kind-change note'],
  ];
  for (const [fg, back, name] of pairs) {
    const ratio = contrastRatio(fg, back);
    assert.ok(ratio >= 4.5, `${name} (${fg} on ${back}) = ${ratio.toFixed(2)}:1, must clear 4.5:1`);
  }
});

test('sprite: parse validates rectangularity and palette membership', () => {
  const s = parseSprite(['..5..', '.555.', '55555']);
  assert.equal(s.w, 5);
  assert.equal(s.h, 3);
  assert.throws(() => parseSprite(['55', '5']), /ragged/);
  assert.throws(() => parseSprite(['5Z']), /unknown palette key/);
  assert.throws(() => parseSprite([]), /empty/);
});

test('sprite: rasterize produces correct RGBA bytes', () => {
  const s = parseSprite(['5.', '.0']);
  const px = rasterize(s);
  assert.equal(px.length, 2 * 2 * 4);
  // (0,0) white opaque
  assert.deepEqual([...px.slice(0, 4)], [255, 255, 255, 255]);
  // (1,0) transparent
  assert.deepEqual([...px.slice(4, 8)], [0, 0, 0, 0]);
  // (0,1) transparent
  assert.deepEqual([...px.slice(8, 12)], [0, 0, 0, 0]);
  // (1,1) black opaque
  assert.deepEqual([...px.slice(12, 16)], [0, 0, 0, 255]);
});

test('sprite: padRows squares ragged art with transparent columns', () => {
  const p = padRows(['55', '5', '555']);
  assert.deepEqual(p, ['55.', '5..', '555']);
  const s = parseSprite(p);
  assert.equal(s.w, 3);
  assert.equal(s.h, 3);
});

test('sprite: flipH mirrors columns', () => {
  const s = parseSprite(['5.0']);
  const f = flipH(s);
  assert.deepEqual(f.rows, ['0.5']);
});

test('sprite: toImageData headless shape', () => {
  const s = parseSprite(['55', '55']);
  const img = toImageData(s, null);
  assert.equal(img.width, 2);
  assert.equal(img.height, 2);
  assert.equal(img.data.length, 16);
});

test('canvas: integer scale picks the largest fitting integer and centers', () => {
  // Exactly 2x fits.
  let r = computeIntegerScale(512, 480);
  assert.equal(r.scale, 2);
  assert.equal(r.offsetX, 0);
  assert.equal(r.offsetY, 0);

  // 3.x available in width but height caps it → floor, letterbox horizontally.
  r = computeIntegerScale(1000, 480);
  assert.equal(r.scale, 2); // 480/240 = 2
  assert.equal(r.drawW, LOGICAL_W * 2);
  assert.ok(r.offsetX > 0, 'horizontal letterbox');

  // Never below 1x even if the window is tiny.
  r = computeIntegerScale(10, 10);
  assert.equal(r.scale, 1);
});

test('canvas: logical resolution is 256x240', () => {
  assert.equal(LOGICAL_W, 256);
  assert.equal(LOGICAL_H, 240);
});

test('pixel font: covers the complete live UI character inventory', () => {
  const inventory = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 /!? :.,-+%<>()[]\'\u00b7\u2014\u2190\u2192\u2191\u2193';
  for (const char of inventory) {
    assert.ok(PIXEL_FONT_GLYPHS[char], `missing pixel-font glyph '${char}'`);
    assert.equal(PIXEL_FONT_GLYPHS[char].length, PIXEL_GLYPH_HEIGHT);
    for (const row of PIXEL_FONT_GLYPHS[char]) assert.match(row, /^[.#]{4}$/);
  }
});

test('pixel font: measures 4px glyphs, 1px spacing, and integer scaling', () => {
  assert.equal(textWidth(''), 0);
  assert.equal(textWidth('A'), 4);
  assert.equal(textWidth('ABC'), 14);
  assert.equal(textWidth('ABC', 2), 28);
  assert.equal(textWidth('abc'), textWidth('ABC'));
});

test('pixel font: draws lowercase as crisp uppercase integer rectangles', () => {
  const rects = [];
  const ctx = {
    fillStyle: null,
    fillRect(...args) { rects.push(args); },
  };
  assert.equal(drawPixelText(ctx, 'a', 1.4, 2.6, '#fff', 1), 4);
  assert.equal(ctx.fillStyle, '#fff');
  assert.ok(rects.length > 0);
  assert.ok(rects.every((rect) => rect.every(Number.isInteger)));
  assert.deepEqual(rects[0], [2, 3, 2, 1]);
});

test('character ground anchor uses the opaque bottom, not transparent asset padding', () => {
  const feetY = 176;
  for (const visual of [
    { height: 18, bottomInset: 0 }, // licensed candidate-B hero
    { height: 24, bottomInset: 2 }, // walker / hopper
    { height: 56, bottomInset: 1 }, // boss
    { h: 26 },                     // code-drawn fallback
  ]) {
    const drawY = groundedVisualY(feetY, visual);
    assert.equal(groundContactGap(feetY, drawY, visual), 1);
  }
});

test('certified hero verb mapping covers all 11 strips and both katana sets', () => {
  const grounded = { onGround: true, vx: 0, x: 0, dodging: 0, airJumpUsed: false, vy: 0 };
  const view = (player, swing = { active: false }, tick = 0, options = {}) => (
    playerAnimationViewFor(player, swing, tick, options)
  );
  assert.equal(PLAYER_HEADGEAR, 'bareheaded');
  assert.deepEqual(PLAYER_HEADGEAR_OPTIONS, ['bareheaded', 'hooded', 'helmed']);
  assert.equal(playerStripAssetId('idle', 'hooded'), 'player_hooded_idle');
  assert.equal(HERO_RIG.stripCount, 11);
  assert.equal(HERO_RIG.frameCount, 89);
  assert.equal(view(grounded).animation, 'idle');
  assert.equal(view({ ...grounded, vx: 1 }, undefined, 0, { moveTicks: 0 }).animation, 'walk');
  assert.equal(view({ ...grounded, vx: 1 }, undefined, 0, { moveTicks: AR3B_TIMING.walkLeadTicks }).animation, 'run');
  assert.equal(view({ ...grounded, dodging: 8 }).animation, 'dash');
  assert.equal(view({ ...grounded, onGround: false, vy: -4 }).animation, 'jump');
  assert.equal(view({ ...grounded, onGround: false, airJumpUsed: true }).animation, 'airspin');
  assert.equal(view(grounded, undefined, 0, { landTicks: 8 }).animation, 'land');
  assert.equal(view(grounded, undefined, 0, { hurtTicks: 8 }).animation, 'hurt');
  assert.equal(view(grounded, { active: true, frame: 2 }, 0, { swingType: 'normal' }).animation, 'katana_combo');
  assert.equal(view(grounded, { active: true, frame: 2 }, 0, { swingType: 'charged' }).animation, 'katana_slash');
  assert.equal(playerAssetIdFor(grounded, { active: false }), 'player_bareheaded_idle');
  assert.equal(AR3A_TIMING, AR3B_TIMING, 'legacy timing export aliases the active AR3B record');
  assert.ok(HERO_HAND_ANCHORS.katana_combo['0'].hand);
  assert.notDeepEqual(HERO_HAND_ANCHORS.katana_combo['0'].bladeTip, HERO_HAND_ANCHORS.katana_combo['0'].hand);
});

test('certified hero frame placement keeps every supplied anchor at one-pixel ground contact', () => {
  for (const strip of Object.values(HERO_RIG.strips)) {
    const asset = { frameWidth: strip.frameW, width: strip.frameW * strip.frames, height: strip.frameH, frameAnchors: strip.frameAnchors };
    for (let frame = 0; frame < strip.frames; frame++) {
      for (const flip of [false, true]) {
        const placement = playerFramePlacement(asset, frame, 100, 176, flip);
        assert.equal(176 - (placement.y + placement.anchor.y), 1, `${strip.verb} f${frame} flip=${flip}`);
      }
    }
  }
});

test('AR3B single-sprite enemy presentations warn and transform without mutating entity state', () => {
  const type = { body: { halfW: 7 }, hop: false };
  const enemy = { type, x: 100, facing: 1, onGround: true, hopTimer: 0 };
  const snapshot = structuredClone(enemy);
  assert.equal(enemyAttackPresentation(enemy, { x: 124 }, 0).phase, 'windup');
  assert.equal(enemyAttackPresentation(enemy, { x: 114 }, 0).phase, 'strike');
  assert.equal(enemyAttackPresentation(enemy, { x: 124 }, 5).phase, 'idle');
  assert.deepEqual(enemy, snapshot, 'presentation query is render-only');
  const boss = { phase: 'telegraph', facing: 1, timer: 20, hitFlash: 0 };
  const bossSnapshot = structuredClone(boss);
  const windup = bossPuppetPose(boss, 0, true);
  assert.ok(windup.squash >= 6 && windup.stretchX > 0, 'boss telegraph visibly crouches and braces');
  assert.deepEqual(boss, bossSnapshot, 'boss puppetry query is render-only');
});

test('pixel text fitting and wrapping never exceed their measured bounds', () => {
  const fitted = fitPixelText('AN EXTREMELY LONG PANEL LABEL', 79);
  assert.ok(textWidth(fitted) <= 79);
  assert.match(fitted, /\.\.\.$/);
  const lines = wrapPixelText('QUAKE HAMMER — DOWNTHRUST LANDS HARDER AND BOUNCES HIGHER', 244);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => textWidth(line) <= 244));
});

test('measured fixed UI copy fits its corrected panel insets', () => {
  const pauseInterior = 178;
  for (const line of [
    'ASSIST: XP NEVER DROPS',
    'LONGER I-FRAMES · SAME DROPS',
    '↑↓ select   K confirm   Esc resume',
    'PRESS K TO START A NEW RUN',
  ]) assert.ok(textWidth(line) <= pauseInterior, `${line} fits pause/clear panel`);
  assert.ok(textWidth('↑↓ select  ←→ tab  J confirm  Enter close') <= 210, 'menu footer fits interior');
  for (const line of [
    '←→/AD MOVE · K/SPACE JUMP · J ATTACK',
    'ENTER MENU · ESC OPTIONS · ↓ REST AT WAYPOINT',
    'STRUGGLING? ESC → ASSIST (HONEST HELP)',
    'ART: WILLIBAB / MONSTERETROPE',
    'ANOKOLISA / ADMURIN · SEE MANIFEST',
  ]) assert.ok(textWidth(line) <= 252, `${line} fits the 2px screen insets`);
});

test('tab, weapon, and prompt inventories satisfy their measured live bounds', () => {
  let tabX = 28;
  for (const tab of TABS) {
    const width = textWidth(TAB_LABEL[tab]);
    assert.ok(tabX - 3 >= 23, `${tab} active plate clears left panel inset`);
    assert.ok(tabX + width + 3 <= 233, `${tab} active plate clears right panel inset`);
    tabX += width + 8;
  }
  for (const weapon of [...Object.values(WEAPONS), ...Object.values(UNIQUES)]) {
    assert.ok(textWidth(weapon.name) <= 79, `${weapon.id} fits text-only HUD weapon row`);
  }
  const prompts = [
    ...KIT_MOVES.map((move) => `${move.name} — ${move.input}`),
    ...Object.values(UNIQUES).map((weapon) => `${weapon.name} — ${weapon.rule}`),
  ];
  for (const prompt of prompts) {
    assert.ok(wrapPixelText(prompt, 244).every((line) => textWidth(line) <= 244), `${prompt} wraps inside banner`);
  }
});

test('render: durable air-jump serial drives existing dust burst (no new assets)', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/render/stagerender.js', import.meta.url)), 'utf8');
  assert.match(src, /airJumpPresentation/, 'presentationFor reads durable airJumpPresentation hook');
  assert.match(src, /lastAirJumpSerial/, 'WeakMap presentation state tracks air-jump serial');
  assert.match(
    src,
    /spawnBurst\(\s*view,\s*['"]dust['"],\s*[^,]+,\s*[^,]+\s*\+\s*4,\s*-s\.player\.facing\s*\)/,
    'air jump reuses existing dust burst at stored coordinates',
  );
  // Procedural-only: no asset id, image constructor, or getAsset tied to air-jump presentation.
  const hookIdx = src.indexOf('airJumpPresentation');
  assert.ok(hookIdx >= 0, 'airJumpPresentation string present');
  const window = src.slice(Math.max(0, hookIdx - 80), hookIdx + 220);
  assert.doesNotMatch(window, /getAsset|new Image|loadImage|Image\(|\.png|\.gif|\.webp|player_|enemy_|boss_/);
});

test('render: new enemy strip assets expose frames and frameWidth', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/render/assets.js', import.meta.url)), 'utf8');
  for (const aid of [
    'enemy_walker_zombie_idle', 'enemy_walker_zombie_run', 'enemy_walker_zombie_attack',
    'enemy_hopper_bat_idle', 'enemy_hopper_bat_run', 'enemy_hopper_bat_attack',
    'enemy_walker_bones_gladiator_death', 'enemy_walker_zombslime_death',
    'enemy_hopper_rat_death',
  ]) {
    const re = new RegExp(`'${aid}': \\{[^}]*frames: (\\d+), frameWidth: (\\d+)`);
    const m = src.match(re);
    assert.ok(m, `${aid} has frames and frameWidth`);
    assert.ok(Number(m[1]) > 0, `${aid} has positive frame count`);
    assert.ok(Number(m[2]) > 0, `${aid} has positive frameWidth`);
  }
});

test('render: kill event spawns a trash death echo in presentationFor', () => {
  const s = createStage(
    { rows: ['.'.repeat(20), '.'.repeat(20), '.'.repeat(20), '#'.repeat(20)] },
    { seed: 'kill-echo' },
  );
  s.events = [{ type: 'kill', enemy: 'walker', xp: 10, gold: 5, at: { x: 64, y: 48 }, facing: 1 }];
  const view = presentationFor(s, { active: false, frame: 0 });
  assert.ok(view.trashDeathEchoes.length >= 1, 'kill created trashDeathEchoes');
  const echo = view.trashDeathEchoes[0];
  assert.equal(echo.enemy, 'walker');
  assert.equal(echo.x, 64);
  assert.equal(echo.y, 48);
  assert.equal(echo.facing, 1);
  assert.ok(echo.life > 0);
});

test('render: air-jump dust remains observable after later ticks replace s.events', () => {
  const W = 20;
  const row = (() => {
    const a = Array(W).fill('.');
    a[2] = 'p'; a[16] = 'x';
    return a.join('');
  })();
  const s = createStage(
    { rows: ['.'.repeat(W), '.'.repeat(W), row, '#'.repeat(W)], kit: { doubleJump: true } },
    { seed: 'dj-dust' },
  );
  for (let i = 0; i < 5; i++) stepStage(s, { moveDir: 0 });
  stepStage(s, { jumpPressed: true, jumpHeld: true });
  stepStage(s, { jumpPressed: true, jumpHeld: true });
  assert.ok(s.airJumpPresentation?.serial >= 1);
  const { serial, x, y } = s.airJumpPresentation;
  stepStage(s, { moveDir: 0 }); // wipe tick events
  assert.equal(s.events.filter((e) => e.type === 'double-jump').length, 0);

  const view = presentationFor(s, { active: false, frame: 0 });
  const dustAtJump = view.particles.filter(
    (p) => p.type === 'dust' && Math.abs(p.x - x) <= 8 && Math.abs(p.y - (y + 4)) <= 8,
  );
  assert.ok(dustAtJump.length >= 6, 'exactly one dust burst at stored air-jump point');
  assert.equal(view.lastAirJumpSerial, serial);

  const countAfter = view.particles.filter((p) => p.type === 'dust').length;
  presentationFor(s, { active: false, frame: 0 });
  assert.equal(
    view.particles.filter((p) => p.type === 'dust').length,
    countAfter,
    'same serial must not spawn a second dust burst',
  );
});
