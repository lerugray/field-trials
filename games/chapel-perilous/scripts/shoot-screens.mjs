// shoot-screens.mjs — code-generated screen proofs for the M6 full-window review.
//
// ADDENDUM 2 retired the 416² square: the game now composes a full-window frame
// (scene viewport + persistent side HUD panel + bottom console strip) that fills
// ≥95% of BOTH window dimensions. These proofs drive the GAME'S OWN modules —
// authored tile-art + bust matrices, palette ramp + accent, renderFP, and the
// tested chrome draw-lists (buildPanel/buildKeybar/buildJournalDrawList) — through
// a minimal SVG-recording 2D context, composed into the real computeFrame() region
// layout and scaled by the shipped frameDisplay() so each file shows, to scale,
// how much of a 1440×900 window the composed surface fills (no pillarbox).
//
// Clean-room + all-code-generated + no network/binaries (CLAUDE.md hard rule 2):
// SVG is vector markup, openable in any browser, faithful where it reuses the real
// modules; the per-screen composition mirrors src/main.js. Run: node scripts/shoot-screens.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from '../src/engine/world.js';
import { createParty } from '../src/engine/party.js';
import { createDungeonKit, assembleDungeon, createCrawl } from '../src/engine/dungeon.js';
import { assembleCity, serviceGlyph } from '../src/engine/city.js';
import { createCityLife } from '../src/engine/citylife.js';
import { createWorldMapState, drawWorldmap } from '../src/engine/worldmap.js';
import { createBestiary } from '../src/engine/bestiary.js';
import { createDungeonLife } from '../src/engine/dungeonlife.js';
import { createWanderers } from '../src/engine/wanderers.js';
import { createBiomes } from '../src/engine/biomes.js';
import { createNames } from '../src/engine/names.js';
import { createProse } from '../src/engine/prose.js';
import { createPalettes } from '../src/engine/palette.js';
import { createTileArt, terrainArtId, siteArtId, ART_SIZE } from '../src/engine/tileart.js';
import { drawTile, reprShade, contrastOutlineShade } from '../src/engine/tiledraw.js';
import { SHADE_LEVELS } from '../src/engine/tiles.js';
import { ditherDensity } from '../src/engine/dither.js';
import { createBusts, bustArtId } from '../src/engine/bustart.js';
import { renderFP } from '../src/engine/fprender.js';
import { createMinimap, drawMinimap } from '../src/engine/minimap.js';
import { styleFor } from '../src/engine/dungeonregister.js';
import { computeFrame, frameDisplay } from '../src/engine/frame.js';
import { CANVAS_W, CANVAS_H, buildTitleDrawList, stripSeed, bustBoxFor } from '../src/engine/layout.js';
import { buildPanel, buildKeybar } from '../src/engine/chrome.js';
import { buildCombatDrawList, buildJournalDrawList, buildBuildingDrawList, buildSneakDrawList } from '../src/engine/panels.js';
import { createCombatProse } from '../src/engine/combatprose.js';
import combatRegister from '../data/register/combat.json' with { type: 'json' };

import master from '../data/world/master.json' with { type: 'json' };
import biomeData from '../data/world/biomes.json' with { type: 'json' };
import register from '../data/register/system.json' with { type: 'json' };
import kit from '../data/dungeon/kit.json' with { type: 'json' };
import beings from '../data/bestiary/beings.json' with { type: 'json' };
import palettesData from '../data/palettes.json' with { type: 'json' };
import pools from '../data/register/pools.json' with { type: 'json' };
import phonemes from '../data/register/phonemes.json' with { type: 'json' };
import cityRegister from '../data/register/city.json' with { type: 'json' };

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'screenshots');
const VP_W = 1440, VP_H = 900;
const TILE = 32;

const FRAME = computeFrame(VP_W, VP_H);
const SCENE = FRAME.scene, PANEL = FRAME.panel, CON = FRAME.console;

const PAL = createPalettes(palettesData);
const SCHEME = PAL.defaultId; // phosphor-green base + amber accent
const shade = (s) => PAL.shadeToColor(SCHEME, s);
const accent = (t = 1) => PAL.accentColor(SCHEME, t);
const names = createNames(phonemes);
const prose = createProse(pools);

// Dither options mirroring the shell (M8 + M12 G3 R3 LOCKED B2): world-anchored
// texture; per-family density via ditherDensity(tileId).
function tileDither(gx, gy, seed, tileId) {
  return { wx: (gx | 0) * ART_SIZE, wy: (gy | 0) * ART_SIZE, seed: seed >>> 0, amp: ditherDensity(tileId), levels: SHADE_LEVELS, sub: 2 };
}
// Bust dither (mirrors main.drawBust): busts read as stipple-engravings.
function bustDither(id) {
  let h = 0x9e37; for (let i = 0; i < id.length; i++) h = (Math.imul(h, 131) + id.charCodeAt(i)) >>> 0;
  return { wx: 0, wy: 0, seed: h, amp: 0.7, levels: SHADE_LEVELS, sub: 2 };
}
function drawBust(ctx, busts, id, px, py, size) {
  const grid = busts.get(bustArtId(id)) || busts.get('HERO');
  if (!grid) return;
  ctx.fillStyle = shade(0); ctx.fillRect(px - 3, py - 3, size + 6, size + 6);
  drawTile(ctx, grid, px, py, size, shade, bustDither(String(id)));
  ctx.strokeStyle = shade(5); ctx.lineWidth = 2; ctx.strokeRect(px - 3, py - 3, size + 6, size + 6);
}

// ————————————————————————————————————————————————————————————————
// Minimal SVG-recording 2D context: the subset src/engine/* draws with.
// ————————————————————————————————————————————————————————————————
function svgCtx() {
  const els = [];
  const st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px monospace' };
  const stack = [];
  let path = [];
  let tx = 0, ty = 0;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const op = (a = st.globalAlpha) => (a < 1 ? ` opacity="${a}"` : '');
  const fontPx = () => { const m = /(\d+(?:\.\d+)?)px/.exec(st.font); return m ? parseFloat(m[1]) : 14; };
  let pend = null;
  const flush = () => {
    if (!pend) return;
    els.push(`<rect x="${r(pend.x)}" y="${r(pend.y)}" width="${r(pend.w)}" height="${r(pend.h)}" fill="${pend.fill}"${op(pend.a)}/>`);
    pend = null;
  };
  const ctx = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    save() { stack.push({ ...st, tx, ty }); },
    restore() { const s = stack.pop(); if (s) { Object.assign(st, s); tx = s.tx; ty = s.ty; } },
    translate(x, y) { tx += x; ty += y; },
    clip() { /* proof: bounded geometry, clip is a no-op */ },
    fillRect(x, y, w, h) {
      const fill = fillOf(), a = st.globalAlpha, X = x + tx, Y = y + ty;
      if (pend && pend.fill === fill && pend.a === a && pend.y === Y && pend.h === h && Math.abs(pend.x + pend.w - X) < 1e-6) {
        pend.w += w; return;
      }
      flush(); pend = { x: X, y: Y, w, h, fill, a };
    },
    strokeRect(x, y, w, h) { flush(); els.push(`<rect x="${r(x + tx)}" y="${r(y + ty)}" width="${r(w)}" height="${r(h)}" fill="none" stroke="${st.strokeStyle}" stroke-width="${st.lineWidth}"${op()}/>`); },
    beginPath() { flush(); path = []; },
    moveTo(x, y) { path.push(`M${r(x + tx)} ${r(y + ty)}`); },
    lineTo(x, y) { path.push(`L${r(x + tx)} ${r(y + ty)}`); },
    closePath() { path.push('Z'); },
    fill() { flush(); if (path.length) els.push(`<path d="${path.join(' ')}" fill="${fillOf()}"${op()}/>`); },
    stroke() { flush(); if (path.length) els.push(`<path d="${path.join(' ')}" fill="none" stroke="${st.strokeStyle}" stroke-width="${st.lineWidth}"${op()}/>`); },
    arc() { /* unused by the paths we render */ },
    fillText(t, x, y) { flush(); els.push(`<text x="${r(x + tx)}" y="${r(y + ty)}" font-family="monospace" font-size="${fontPx()}" fill="${fillOf()}"${op()}>${esc(t)}</text>`); },
    measureText(t) { return { width: String(t).length * fontPx() * 0.6 }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  function fillOf() { return typeof st.fillStyle === 'string' ? st.fillStyle : '#000'; }
  function r(n) { return Math.round(n * 100) / 100; }
  return { ctx, els, flush };
}
// Worldmap overlay needs a canvas property for drawWorldmap's centering math.
function svgCtxWorldmap() {
  const { ctx, els, flush } = svgCtx();
  ctx.canvas = { width: CANVAS_W, height: CANVAS_H };
  return { ctx, els, flush };
}

// Paint a chrome draw-list (title/panel/keybar/combat/journal) via semantic tokens.
function paintRows(ctx, rows) {
  const map = { hue: shade(6), dim: shade(3), faint: shade(2), accent: accent() };
  for (const r of rows) {
    ctx.fillStyle = map[r.color] || r.color || '#fff';
    ctx.font = `${r.size}px monospace`;
    ctx.fillText(r.text, r.x, r.y);
  }
}

// The standing side HUD panel — mirrors main.js paintPanel().
function paintPanel(ctx, { cue, place, legend = false, hp = '10/10' }) {
  ctx.save();
  ctx.globalAlpha = 0.92; ctx.fillStyle = shade(0); ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  ctx.globalAlpha = 1; ctx.strokeStyle = shade(2); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PANEL.x + 0.5, PANEL.y); ctx.lineTo(PANEL.x + 0.5, PANEL.y + PANEL.h); ctx.stroke();
  ctx.restore();
  const groups = [
    { heading: 'the stranger', color: 'hue', lines: ['The Stranger', `♥ ${hp} — you`, 'you walk alone'] },
    { heading: 'where', color: 'dim', lines: place },
    { heading: 'the record', color: 'faint', lines: ['deaths 0', 'cleared 0'] },
  ];
  const rows = buildPanel({ cue, groups, width: PANEL.w, height: PANEL.h });
  ctx.save(); ctx.translate(PANEL.x, PANEL.y); paintRows(ctx, rows); ctx.restore();
  if (legend) paintLegend(ctx);
}

function paintToast(ctx, line) {
  ctx.font = '13px monospace';
  const w = Math.max(180, ctx.measureText(line).width + 28), h = 34;
  const x = Math.round((FRAME.W - w) / 2), y = 16;
  ctx.globalAlpha = 0.94; ctx.fillStyle = shade(0); ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  ctx.strokeStyle = shade(5); ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = shade(6); ctx.fillText(line, x + 14, y + 22);
}

// M10 A5 map legend — bottom-anchored swatches + labels (mirrors src/main.paintLegend).
function paintLegend(ctx) {
  const art = createTileArt();
  const items = [
    { a: 'PARTY', label: 'you' },
    { a: 'WANDERER_NPC', label: 'folk' },
    { a: 'WANDERER_BEAST', label: 'beast', hostile: true },
    { a: terrainArtId('GRASS'), label: 'ground · walk' },
    { a: terrainArtId('WATER'), label: 'water · blocked' },
    { a: terrainArtId('MOUNT'), label: 'peak · blocked' },
  ];
  const sw = 14, lh = 18, padX = 10, headH = 18;
  let y = PANEL.y + PANEL.h - (headH + items.length * lh + 8);
  ctx.save();
  ctx.strokeStyle = shade(2); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PANEL.x + padX, y - 4.5); ctx.lineTo(PANEL.x + PANEL.w - padX, y - 4.5); ctx.stroke();
  ctx.fillStyle = shade(4); ctx.font = '11px monospace'; ctx.fillText('— legend —', PANEL.x + padX, y + 12);
  y += headH;
  for (const it of items) {
    drawTile(ctx, art.get(it.a), PANEL.x + padX, y, sw, shade);
    ctx.fillStyle = shade(it.hostile ? 6 : 5); ctx.font = '11px monospace';
    ctx.fillText(it.label, PANEL.x + padX + sw + 8, y + sw - 3);
    y += lh;
  }
  ctx.restore();
}

// The bottom console strip — prose line over the mode keybar (mirrors paintConsole).
function paintConsole(ctx, { mode, statusLine }) {
  ctx.save();
  ctx.globalAlpha = 0.94; ctx.fillStyle = shade(0); ctx.fillRect(CON.x, CON.y, CON.w, CON.h);
  ctx.globalAlpha = 1; ctx.strokeStyle = shade(2); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CON.x, CON.y + 0.5); ctx.lineTo(CON.x + CON.w, CON.y + 0.5); ctx.stroke();
  ctx.restore();
  const kb = buildKeybar(mode, { width: CON.w, height: CON.h });
  ctx.save(); ctx.translate(CON.x, CON.y); paintRows(ctx, kb); ctx.restore();
  ctx.save(); ctx.fillStyle = shade(5); ctx.font = '13px monospace';
  ctx.fillText(stripSeed(statusLine).slice(0, 120), CON.x + 14, CON.y + 24); ctx.restore();
}

// Centre a logical CANVAS_W×CANVAS_H card in the scene (menu/text modes).
function centered(ctx, fn) {
  const ox = SCENE.x + Math.max(0, Math.round((SCENE.w - CANVAS_W) / 2));
  const oy = SCENE.y + Math.max(0, Math.round((SCENE.h - CANVAS_H) / 2));
  ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore();
}

// ————————————————————————————————————————————————————————————————
// The six screens — each returns the composed frame's SVG element list.
// ————————————————————————————————————————————————————————————————
function screenTitle() {
  const { ctx, els, flush } = svgCtx();
  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  centered(ctx, () => {
    ctx.fillStyle = shade(0); ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    paintRows(ctx, buildTitleDrawList({
      title: stripSeed(register.title) || 'CHAPEL PERILOUS',
      subtitle: stripSeed(register.subtitle || ''),
      intro: stripSeed(register.boot || 'the map is not the territory'),
      paletteName: stripSeed(PAL.get(SCHEME).name),
    }));
  });
  paintPanel(ctx, { cue: '', place: ['the thread'] });
  paintConsole(ctx, { mode: 'title', statusLine: stripSeed(register.subtitle || 'the map is not the territory') });
  flush(); return els;
}

// Shared overworld composer (mirrors src/main.renderOverworld incl. M9 biome
// dressing). Centers the party on (px,py); `biomes` supplies per-cell dressing +
// the local wanderer mix. Returns the site under the party, if any.
//
// Optional: `rect` = draw into a sub-rect (default SCENE); `tilePx` = custom tile
// size (default TILE); `skipEntities` = terrain-only (no party / wanderer icons).
function paintOverworld(ctx, { world, art, biomes, px, py, rect = SCENE, tilePx = TILE, skipEntities = false }) {
  const party = createParty(world, world.nearestOpen(px, py));
  world.streamAround(party.x, party.y);
  ctx.fillStyle = '#000'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const cols = Math.max(1, Math.floor(rect.w / tilePx));
  const rows = Math.max(1, Math.floor(rect.h / tilePx));
  const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
  const ox = rect.x + Math.floor((rect.w - cols * tilePx) / 2);
  const oy = rect.y + Math.floor((rect.h - rows * tilePx) / 2);
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const gx = party.x + vx - cx, gy = party.y + vy - cy;
      const tile = world.tileAt(gx, gy);
      const d = tileDither(gx, gy, world.seed, tile.id);
      const biome = biomes ? biomes.biomeAt(gx, gy) : null;
      const artId = biome ? biomes.dressFor(biome, tile.id, terrainArtId(tile.id)) : terrainArtId(tile.id);
      if ((tile.id === 'DEEP' || tile.id === 'WATER') && artId === terrainArtId(tile.id)) d.accent = { color: accent(0.95), shades: tile.id === 'DEEP' ? [2, 3] : [3, 4], chance: 0.2 };
      drawTile(ctx, art.get(artId), ox + vx * tilePx, oy + vy * tilePx, tilePx, shade, d);
      const st = world.siteAt(gx, gy);
      if (st) drawTile(ctx, art.get(siteArtId(st.kind, st.id)), ox + vx * tilePx, oy + vy * tilePx, tilePx, shade, tileDither(gx, gy, world.seed, tile.id));
    }
  }
  if (skipEntities) return { party, here: world.siteAt(party.x, party.y) };
  // M10 A4 visibility halo — the far-ramp outline shade for whatever ground an
  // entity stands on (mirrors src/main.groundOutlineAt).
  const outlineAt = (gx, gy) => {
    const tile = world.tileAt(gx, gy);
    const b = biomes ? biomes.biomeAt(gx, gy) : null;
    const aId = b ? biomes.dressFor(b, tile.id, terrainArtId(tile.id)) : terrainArtId(tile.id);
    return { shade: contrastOutlineShade(reprShade(art.get(aId))) };
  };
  const wanderers = createWanderers({ world, bestiary: createBestiary(beings), names, biomes, seed: (world.seed ^ 0x3a2d) >>> 0 });
  wanderers.populate(party.x, party.y);
  for (const m of wanderers.list()) {
    const wvx = cx + (m.x - party.x), wvy = cy + (m.y - party.y);
    if (wvx < 0 || wvy < 0 || wvx >= cols || wvy >= rows) continue;
    const dx = ox + wvx * tilePx, dy = oy + wvy * tilePx;
    // Beast danger tips glint in the accent hue as a designed sprite element
    // (the accentPixel FILL channel) — never a bare stroked box (M8 REOPEN). The
    // A4 contrast halo keeps the sprite legible on same-shade ground.
    drawTile(ctx, art.get(m.kind === 'beast' ? 'WANDERER_BEAST' : 'WANDERER_NPC'), dx, dy, tilePx, shade, tileDither(m.x, m.y, world.seed, world.tileAt(m.x, m.y).id), m.kind === 'beast' ? { shade: 4, color: accent(0.85) } : null, outlineAt(m.x, m.y));
  }
  drawTile(ctx, art.get('PARTY'), ox + cx * tilePx, oy + cy * tilePx, tilePx, shade, null, null, outlineAt(party.x, party.y));
  return { party, here: world.siteAt(party.x, party.y) };
}

function screenOverworld() {
  const { ctx, els, flush } = svgCtx();
  const art = createTileArt();
  const world = createWorld(master);
  const biomes = createBiomes(biomeData);
  // Open country: center on the start tile (outside every biome) so the base
  // procedural world reads against the dressed biome proofs.
  const { party } = paintOverworld(ctx, { world, art, biomes, px: master.start.x, py: master.start.y });
  paintPanel(ctx, { cue: 'OVERWORLD', place: [`(${party.x},${party.y})`, 'the open country'], legend: true });
  paintConsole(ctx, { mode: 'overworld', statusLine: 'the open country hums a bureaucratic hymn' });
  paintToast(ctx, 'follower capacity 2 → 3');
  flush(); return els;
}

// M9 per-biome proof: center on the biome, show its terrain dressing + local
// wanderer mix + the register/vibe status line.
function screenBiome(biomeId) {
  return () => {
    const { ctx, els, flush } = svgCtx();
    const art = createTileArt();
    const world = createWorld(master);
    const biomes = createBiomes(biomeData);
    const b = biomes.get(biomeId);
    const { party } = paintOverworld(ctx, { world, art, biomes, px: b.center.x, py: b.center.y });
    const name = stripSeed(b.name);
    paintPanel(ctx, { cue: 'OVERWORLD', place: [`(${party.x},${party.y})`, name], legend: true });
    paintConsole(ctx, { mode: 'overworld', statusLine: `${name} — ${stripSeed(b.blurb)}` });
    flush(); return els;
  };
}

function screenDungeon() {
  const { ctx, els, flush } = svgCtx();
  const dk = createDungeonKit(kit);
  const dungeon = assembleDungeon(dk, { seed: 20260802, cells: 5 });
  const crawl = createCrawl(dungeon);
  const busts = createBusts();
  const life = createDungeonLife(dungeon, { bestiary: createBestiary(beings), seed: 0x11fe, max: 3 });
  const foe = life.list()[0];
  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  ctx.save(); ctx.translate(SCENE.x, SCENE.y);
  renderFP(ctx, SCENE.w, SCENE.h, { dungeon, crawl }, shade);
  // A visible enemy standing in the corridor ahead (M8 §5), as in renderDungeon.
  if (foe) {
    const size = Math.round(Math.min(SCENE.h * 0.42, SCENE.w * 0.3, 150));
    drawBust(ctx, busts, foe.beingId, Math.round(SCENE.w / 2 - size / 2), Math.round(SCENE.h * 0.24), size);
  }
  ctx.restore();
  paintPanel(ctx, { cue: 'DUNGEON', place: ['a hollow site', 'cyclopean stone', `facing ${crawl.facing}`], legend: true });
  paintConsole(ctx, { mode: 'dungeon', statusLine: foe ? `the corridor is not empty · ${stripSeed(foe.name)} ahead — confront, or slip past` : 'the chamber remembers a shape you do not' });
  flush(); return els;
}

// The confront/sneak prompt for the visible dungeon enemy (M8 §5).
function screenDungeonMinimap() {
  const { ctx, els, flush } = svgCtx();
  const dk = createDungeonKit(kit);
  const dungeon = assembleDungeon(dk, { seed: 20260803, cells: 5 });
  const crawl = createCrawl(dungeon);
  const minimap = createMinimap();
  minimap.markAround(dungeon, crawl.x, crawl.y);
  // Reveal a short walk so fog vs explored reads clearly.
  crawl.forward(); minimap.markAround(dungeon, crawl.x, crawl.y);
  crawl.forward(); minimap.markAround(dungeon, crawl.x, crawl.y);
  crawl.turnRight(); minimap.markAround(dungeon, crawl.x, crawl.y);
  crawl.forward(); minimap.markAround(dungeon, crawl.x, crawl.y);
  crawl.turnLeft(); minimap.markAround(dungeon, crawl.x, crawl.y);
  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  ctx.save(); ctx.translate(SCENE.x, SCENE.y);
  renderFP(ctx, SCENE.w, SCENE.h, { dungeon, crawl, register: styleFor(dungeon.seed) }, shade);
  ctx.restore();
  drawMinimap(ctx, {
    dungeon, crawl, minimap, shadeColor: shade,
    x: SCENE.x + 12, y: SCENE.y + 12, maxSize: 120,
  });
  paintPanel(ctx, { cue: 'DUNGEON', place: ['a hollow site', stripSeed(styleFor(dungeon.seed).name), `facing ${crawl.facing}`], legend: true });
  paintConsole(ctx, { mode: 'dungeon', statusLine: 'the map remembers where you have been — [N] to hide it' });
  flush(); return els;
}

function screenSneak() {
  const { ctx, els, flush } = svgCtx();
  const busts = createBusts();
  const bestiary = createBestiary(beings);
  const dk = createDungeonKit(kit);
  const dungeon = assembleDungeon(dk, { seed: 20260802, cells: 5 });
  const life = createDungeonLife(dungeon, { bestiary, seed: 0x11fe, max: 3 });
  const foe = life.list()[0] || { beingId: bestiary.all()[0].id, name: bestiary.all()[0].name };
  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  centered(ctx, () => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const b = bustBoxFor('combat');
    drawBust(ctx, busts, foe.beingId, b.x, b.y, b.size);
    paintRows(ctx, buildSneakDrawList({ name: stripSeed(foe.name), note: 'it has not seen you — yet', chance: 0.67 }));
  });
  paintPanel(ctx, { cue: 'IN YOUR PATH', place: ['a hollow site', 'the corridor'] });
  paintConsole(ctx, { mode: 'dungeon', statusLine: 'something blocks the corridor — [F] confront · [S] slip past (NERVE) · [Esc] back away' });
  flush(); return els;
}

function screenCombat() {
  const { ctx, els, flush } = svgCtx();
  const busts = createBusts();
  const bestiary = createBestiary(beings);
  const cp = createCombatProse(combatRegister);
  const foe = bestiary.get('five-eyed-auditor') || bestiary.all()[3] || bestiary.all()[0];
  // M11 tactical verb list — the LIVE options, bright with the › marker; the gambit is
  // shown spent (faint), and PARLEY greyed (blows have landed → talk hardened).
  const verbs = [
    { key: 'F', label: cp.label('attack'), enabled: true },
    { key: 'G', label: cp.label('defend'), enabled: true },
    { key: 'R', label: cp.label('item'), enabled: true },
    { key: 'V', label: cp.label('subterfuge'), enabled: false },
    { key: 'T', label: cp.label('talk'), enabled: false },
  ];
  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  centered(ctx, () => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    paintRows(ctx, buildCombatDrawList({
      foes: [{ name: stripSeed(foe.name), hp: 9, maxHp: foe.hp }],
      party: [{ name: 'The Stranger', hp: 8, maxHp: 12 }],
      round: 2, menu: 'root', verbs,
      note: stripSeed(cp.beat('defend', 3)),
      // the log grows to wrapped lines; a caster telegraph + an adaptive-defense beat.
      log: [
        'The Stranger braces (absorb)',
        'the Auditor gathers a rite',
        'the Auditor looses the rite',
        'the Stranger hits it for 5 (salvaged red pen) [absorb −2]',
      ],
    }));
    const b = bustBoxFor('combat');
    drawBust(ctx, busts, foe.id, b.x, b.y, b.size);
    // the name+HP caption clustered under the bust (UI-critique #4)
    const cx = b.x + b.size / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = shade(6); ctx.font = '12px monospace';
    ctx.fillText(stripSeed(foe.name), cx, b.y + b.size + 14);
    ctx.fillStyle = shade(3); ctx.font = '11px monospace';
    ctx.fillText('[9/' + foe.hp + ']', cx, b.y + b.size + 28);
    ctx.restore();
  });
  paintPanel(ctx, { cue: 'ENCOUNTER', place: ['a hollow site', 'round 2'], hp: '7/10' });
  paintConsole(ctx, { mode: 'combat', statusLine: 'round 2 — the pattern asserts itself' });
  flush(); return els;
}

function screenCity() {
  const { ctx, els, flush } = svgCtx();
  const art = createTileArt();
  const c = assembleCity({ seed: 20260802 });
  const life = createCityLife(c, { seed: c.seed, names, prose, cityRegister });
  const citizens = life.citizens(4);
  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  const t = Math.max(4, Math.floor(Math.min(SCENE.w / c.width, SCENE.h / c.height)));
  const ox = SCENE.x + Math.floor((SCENE.w - c.width * t) / 2), oy = SCENE.y + Math.floor((SCENE.h - c.height * t) / 2);
  const doors = new Set(c.buildings.map((b) => `${b.door.x},${b.door.y}`));
  const gateKey = `${c.gate.x},${c.gate.y}`;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      let a;
      if (`${x},${y}` === gateKey) a = 'CITY_GATE';
      else if (doors.has(`${x},${y}`)) a = 'CITY_DOOR';
      else if (c.passable(x, y)) a = 'CITY_STREET';
      else if (x === 0 || y === 0 || x === c.width - 1 || y === c.height - 1) a = 'CITY_WALL';
      else a = 'CITY_BUILDING';
      drawTile(ctx, art.get(a), ox + x * t, oy + y * t, t, shade, tileDither(x, y, (c.seed ^ 0xc17e) >>> 0));
    }
  }
  // Service glyphs float above each door so the trade is readable without
  // obscuring the door art (mirrors the live renderCity path).
  ctx.fillStyle = shade(6); ctx.font = `${Math.max(8, Math.floor(t * 0.7))}px monospace`; ctx.textAlign = 'center';
  for (const b of c.buildings) {
    const gx = ox + b.door.x * t + t / 2;
    const gy = oy + (b.door.y - 1) * t + t * 0.85;
    ctx.fillText(serviceGlyph(b.service), gx, gy);
  }
  ctx.textAlign = 'left';
  for (const cit of citizens) drawTile(ctx, art.get('WANDERER_NPC'), ox + cit.x * t, oy + cit.y * t, t, shade, tileDither(cit.x, cit.y, (c.seed ^ 0xc17e) >>> 0));
  drawTile(ctx, art.get('PARTY'), ox + c.gate.x * t, oy + c.gate.y * t, t, shade);
  paintPanel(ctx, { cue: 'CITY', place: [stripSeed(c.name || 'a walled town'), `a ${c.archetype} town`] });
  paintConsole(ctx, { mode: 'city', statusLine: stripSeed(life.townBlurb()) });
  flush(); return els;
}

// Town INTERIOR (M8 §5): a building's greeting card — the proprietor + the town's
// per-building generated line make two same-trade interiors read differently.
function screenTownInterior() {
  const { ctx, els, flush } = svgCtx();
  const c = assembleCity({ seed: 20260802 });
  const life = createCityLife(c, { seed: c.seed, names, prose, cityRegister });
  // Pick a shrine building if the town has one, else the first building.
  const b = c.buildings.find((x) => x.service === 'shrine') || c.buildings.find((x) => x.service === 'inn') || c.buildings[0];
  const ident = life.identity(b);
  const svc = cityRegister.services[b.service] || {};
  const name = `${stripSeed(svc.name || b.service)} — kept by ${ident.proprietor}`;
  const lines = [ident.line, svc.greeting, '[SEED] you take what the house offers; the house takes note'];
  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  centered(ctx, () => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    paintRows(ctx, buildBuildingDrawList({ name, lines, glyph: serviceGlyph(b.service), glyphColor: shade(5) }));
  });
  paintPanel(ctx, { cue: 'INTERIOR', place: [stripSeed(c.name || 'a walled town'), stripSeed(svc.name || b.service)] });
  paintConsole(ctx, { mode: 'building', statusLine: `${stripSeed(svc.name || b.service)} · ${b.service} — [Esc] back to the street` });
  flush(); return els;
}

function screenJournal() {
  const { ctx, els, flush } = svgCtx();
  ctx.fillStyle = '#000'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  const entries = [
    { when: 2, where: 'The Chapel Perilous', text: 'the door was where the map said it would be. i no longer trust the map.', corruption: 0, origin: 'player' },
    { when: 4, where: 'Waystation 23', text: 'the clerk stamped a form i did not fill out. it had my name on it already.', corruption: 1, origin: 'player' },
    { when: 6, where: 'the margin', text: 'you have written this before. you will write it again. fnord.', corruption: 0, origin: 'ghost' },
  ];
  centered(ctx, () => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    paintRows(ctx, buildJournalDrawList({ entries, writing: false, draft: '', place: 'The Chapel Perilous' }));
  });
  paintPanel(ctx, { cue: 'JOURNAL', place: ['the record', '3 of your notes'] });
  paintConsole(ctx, { mode: 'journal', statusLine: '3 of your notes · the record is not to be trusted' });
  flush(); return els;
}

// Wrap the composed frame (frame.W×frame.H) in a to-scale 1440×900 viewport.
function frame(title, els) {
  const { cssW, cssH, fillW, fillH } = frameDisplay(VP_W, VP_H);
  const sx = cssW / FRAME.W, sy = cssH / FRAME.H;
  const cx = Math.round((VP_W - cssW) / 2), cy = Math.round((VP_H - cssH) / 2);
  const pct = `${(fillW * 100).toFixed(1)}%×${(fillH * 100).toFixed(1)}%`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${VP_W}" height="${VP_H}" viewBox="0 0 ${VP_W} ${VP_H}">
  <rect width="${VP_W}" height="${VP_H}" fill="#000"/>
  <text x="16" y="28" font-family="monospace" font-size="16" fill="#888">${title} — viewport ${VP_W}×${VP_H}, composed surface fills ${pct} of the window (gate ≥95% BOTH dims)</text>
  <g transform="translate(${cx} ${cy}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})">
    <rect x="0" y="0" width="${FRAME.W}" height="${FRAME.H}" fill="#000"/>
    ${els.join('\n    ')}
    <rect x="0" y="0" width="${FRAME.W}" height="${FRAME.H}" fill="none" stroke="#333" stroke-width="1"/>
  </g>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
const DATE = process.argv[2] || '2026-08-02';

// One-shot: B2-locked default proof (avoids regenerating every other screenshot).
// Usage: node scripts/shoot-screens.mjs dither-B2-default
if (process.argv[2] === 'dither-B2-default') {
  const file = join(OUT, '2026-08-03-m12-dither-B2-default-1440x900.svg');
  writeFileSync(file, frame('B2 locked default 2026-08-03 — overworld via default paintOverworld', screenDitherB2Default()));
  console.log(`wrote ${file}`);
  process.exit(0);
}

// M10 Part B — the [I] pack overlay (mirrors src/main.paintInventory).
function screenInventory() {
  const { ctx, els, flush } = svgCtx();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VP_W, VP_H);
  centered(ctx, () => {
    ctx.globalAlpha = 0.92; ctx.fillStyle = shade(0); ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); ctx.globalAlpha = 1;
    ctx.strokeStyle = shade(5); ctx.lineWidth = 2; ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    let y = 40;
    ctx.fillStyle = shade(6); ctx.font = '18px monospace'; ctx.fillText('— the pack —', 28, y); y += 30;
    ctx.fillStyle = shade(5); ctx.font = '13px monospace';
    ctx.fillText('wielding: a bent letter-opener  [2–4]', 28, y); y += 26;
    const items = [
      ['▸ salvaged fivefold bite  [3–6]', 6],
      ['  Hagbard’s Compass  ✦', 4],
      ['  a coin that always lands on its edge  ·', 4],
    ];
    for (const [t, sh] of items) { ctx.fillStyle = shade(sh); ctx.font = '13px monospace'; ctx.fillText(t, 28, y); y += 20; }
    y += 14; ctx.fillStyle = shade(4); ctx.font = '12px monospace';
    ctx.fillText('[W]/[S] pick   [E] equip   [X] drop   [I]/[Esc] close', 28, y);
  });
  paintPanel(ctx, { cue: 'OVERWORLD', place: ['(5,4)', 'the open country'], legend: true });
  paintConsole(ctx, { mode: 'overworld', statusLine: 'you turn out the pack' });
  flush(); return els;
}

// M12 G3 R3 — proof that B2 per-family density is the shipped default path
// (same paintOverworld as screenOverworld; banner notes the lock).
function screenDitherB2Default() {
  const { ctx, els, flush } = svgCtx();
  const art = createTileArt();
  const world = createWorld(master);
  const biomes = createBiomes(biomeData);
  const { party } = paintOverworld(ctx, { world, art, biomes, px: master.start.x, py: master.start.y });
  ctx.fillStyle = shade(6); ctx.font = '16px monospace';
  ctx.fillText('B2 locked default 2026-08-03', SCENE.x + 12, SCENE.y + 24);
  paintPanel(ctx, { cue: 'OVERWORLD', place: [`(${party.x},${party.y})`, 'B2 default'], legend: true });
  paintConsole(ctx, { mode: 'overworld', statusLine: 'R3 locked — B2 Cyclopean-strength per-family density is the shipped default' });
  flush(); return els;
}

// cp-020: the worldmap overlay, exercised with a label pushed against the top
// of the map card so the HUD-bleed guard is visible.
function screenWorldmap() {
  const { ctx, els, flush } = svgCtxWorldmap();
  const world = createWorld(master);
  const biomes = createBiomes(biomeData);
  const party = createParty(world, world.nearestOpen(master.start.x, master.start.y));
  const mapState = createWorldMapState();
  // Explore a small area and add a discovered site label near the top edge.
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) mapState.visit(party.x + dx, party.y + dy);
  }
  const here = world.siteAt(party.x, party.y);
  if (here) mapState.knowSite(here);
  mapState.addLabel(party.x, party.y - 2, 'the edge', 'note');
  // Dim the full composed frame, then centre the map card exactly as the live
  // overlay does (the panel and console are underneath, so the legend must stay
  // inside the card).
  ctx.globalAlpha = 0.96; ctx.fillStyle = shade(0); ctx.fillRect(0, 0, FRAME.W, FRAME.H); ctx.globalAlpha = 1;
  const ox = Math.round((FRAME.W - CANVAS_W) / 2);
  const oy = Math.round((FRAME.H - CANVAS_H) / 2);
  ctx.save(); ctx.translate(ox, oy);
  ctx.fillStyle = shade(0); ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = shade(5); ctx.lineWidth = 2; ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
  drawWorldmap(ctx, {
    world, biomes, mapState, party, start: master.start, shadeColor: shade, accentColor: accent,
    maxW: CANVAS_W - 48, maxH: CANVAS_H - 130,
  });
  const legend = [['●', 'you'], ['⌂', 'town'], ['▪', 'site'], ['▫', 'gate shut'], ['▫', 'gate open'], ['·', 'route']];
  ctx.fillStyle = shade(4); ctx.font = '11px monospace';
  ctx.fillText('— legend —', 28, CANVAS_H - 74);
  for (let i = 0; i < legend.length; i++) {
    const x = 28 + (i % 3) * 122, y = CANVAS_H - 66 + Math.floor(i / 3) * 16;
    ctx.fillStyle = (i === 0 || i === 4) ? accent() : shade(6); ctx.fillText(legend[i][0], x, y);
    ctx.fillStyle = shade(5); ctx.fillText(legend[i][1], x + 16, y);
  }
  ctx.fillStyle = shade(4); ctx.font = '12px monospace';
  ctx.fillText('[U]/[Esc] close', 28, CANVAS_H - 24);
  ctx.restore();
  flush(); return els;
}

const shots = [
  ['title', 'TITLE', screenTitle],
  ['overworld', 'OVERWORLD — open country (visible wanderers + water glint)', screenOverworld],
  ['biome-perilous-verge', 'BIOME — The Perilous Verge (Chapel anchor)', screenBiome('perilous-verge')],
  ['biome-pine-barrens', 'BIOME — The Pine Barrens', screenBiome('pine-barrens')],
  ['biome-salt-flats', 'BIOME — The Salt Flats', screenBiome('salt-flats')],
  ['biome-drowned-fen', 'BIOME — The Drowned Fen', screenBiome('drowned-fen')],
  ['town-interior', 'TOWN INTERIOR', screenTownInterior],
  ['dungeon-visible-enemy', 'DUNGEON — visible enemy ahead', screenDungeon],
  ['dungeon-minimap', 'DUNGEON — first-person minimap (cp-017)', screenDungeonMinimap],
  ['dungeon-sneak', 'DUNGEON — confront / sneak', screenSneak],
  ['combat', 'COMBAT — M11 tactical verbs (strike/guard/reach/gambit/parley) + foe cluster + wrapped log', screenCombat, 'm11'],
  ['inventory', 'INVENTORY — the pack (equip / drop)', screenInventory],
  ['city', 'CITY — archetype + citizens', screenCity],
  ['journal', 'JOURNAL', screenJournal],
  ['worldmap', 'WORLDMAP — labels clamped inside the card', screenWorldmap],
];
for (const [name, label, fn, milestone] of shots) {
  const file = join(OUT, `${DATE}-${milestone || 'm10'}-${name}-1440x900.svg`);
  writeFileSync(file, frame(label, fn()));
  console.log(`wrote ${file}`);
}
console.log(`\n${shots.length} full-window proofs at ${VP_W}×${VP_H}. Open in a browser to eyeball the fill + chrome.`);
