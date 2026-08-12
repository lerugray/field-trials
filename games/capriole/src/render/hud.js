// hud.js — the M1 HUD skeleton + menus, DOM overlay (crisp text, no clipped text,
// contrast-safe per seed M6). Lands at M1 per the fold (not M5): HP pips, pods
// x/4, a par dial (pulses past the warn threshold — the par warning's first-class
// UI channel), and a jump-chain indicator (which jump you're on). Plus the pause
// menu (Esc, works everywhere) with comfort controls, and the first-boot
// Standard/Comfort preset choice (law #4). All code-generated; no font files.

// The carnival screens share the WORLD's treatment kit rather than reimplementing it,
// so the dither and the grain on an overlay are literally the same functions that
// paint the frame behind it.
import { bayerAt, noise2 } from './pixelart.js';
import { createFreshPressGate } from '../engine/freshpress.js';

// ---------------------------------------------------------------------------
// A code-drawn 5x5 pixel typeface for the sphere identity chrome (art law: no font
// files, everything generated). The interactive HUD and menus keep real DOM text —
// this is for the two plates whose type IS part of the ratified art direction.
// ---------------------------------------------------------------------------
const PIXEL_FONT = {
  A: '0111010001111111000110001', B: '1111010001111101000111110', C: '0111110000100001000001111',
  D: '1111010001100011000111110', E: '1111110000111101000011111', F: '1111110000111101000010000',
  G: '0111110000101111000101111', H: '1000110001111111000110001', I: '1111100100001000010011111',
  J: '0011100010000101001001100', K: '1000110010111001001010001', L: '1000010000100001000011111',
  M: '1000111011101011000110001', N: '1000111001101011001110001', O: '0111010001100011000101110',
  P: '1111010001111101000010000', Q: '0111010001101011001001101', R: '1111010001111101001010001',
  S: '0111110000011100000111110', T: '1111100100001000010000100', U: '1000110001100011000101110',
  V: '1000110001100010101000100', W: '1000110001101011101110001', X: '1000101010001000101010001',
  Y: '1000101010001000010000100', Z: '1111100010001000100011111',
  0: '0111010011101011100101110', 1: '0010001100001000010001110', 2: '0111010001000100010011111',
  3: '1111000001001100000111110', 4: '0001000110010101111100010', 5: '1111110000111100000111110',
  6: '0111010000111101000101110', 7: '1111100010001000100001000', 8: '0111010001011101000101110',
  9: '0111010001011110000101110',
  '/': '0000100010001000100010000', '-': '0000000000111110000000000', ':': '0000000100000000010000000',
  '·': '0000000000001000000000000', '.': '0000000000000000000000100', "'": '0010000100000000000000000',
  ' ': '0000000000000000000000000',
};
const GLYPH_ADVANCE = 6; // 5px glyph + 1px gutter, in font units

function pixelTextWidth(str, scale) {
  return String(str).length * GLYPH_ADVANCE * scale - scale;
}

function drawPixelText(g, str, x, y, color, scale, align = 'left') {
  const s = String(str).toUpperCase();
  let cx = x;
  if (align === 'right') cx -= pixelTextWidth(s, scale);
  else if (align === 'center') cx -= Math.round(pixelTextWidth(s, scale) / 2);
  g.fillStyle = color;
  for (const ch of s) {
    const bits = PIXEL_FONT[ch] || PIXEL_FONT[' '];
    for (let yy = 0; yy < 5; yy++) {
      for (let xx = 0; xx < 5; xx++) {
        if (bits[yy * 5 + xx] === '1') g.fillRect(cx + xx * scale, y + yy * scale, scale, scale);
      }
    }
    cx += GLYPH_ADVANCE * scale;
  }
}

// A code-drawn ticket glyph for the meta screen — replaces the emoji that rendered as a
// placeholder box in the headless probe font stack. Drawn as a rectangle with semicircular
// notches on the left and right edges, in the active chrome colour.
function drawTicketGlyph(g, color, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  const r = Math.max(2, h * 0.28);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(0, h / 2, r, -Math.PI / 2, Math.PI / 2); g.fill();
  g.beginPath(); g.arc(w, h / 2, r, Math.PI / 2, -Math.PI / 2); g.fill();
  g.globalCompositeOperation = 'source-over';
}

// Tone helpers so the chrome tracks the sphere's committed palette (no new hues).
function hexRgb(h) {
  const s = String(h).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function toneCss(hex, t, alpha = 1) {
  const c = hexRgb(hex);
  const m = t < 0 ? c.map((v) => v * (1 + t)) : c.map((v) => v + (255 - v) * t);
  return `rgba(${m.map((v) => Math.round(v)).join(',')},${alpha})`;
}

const CSS = `
#hud { position:fixed; inset:0; pointer-events:none; z-index:50;
  font-family:ui-monospace,Menlo,Consolas,monospace; color:#fff;
  text-shadow:0 1px 2px rgba(0,0,0,0.8),0 0 6px rgba(0,0,0,0.5);
  /* M5 pass: HUD widgets are now driven from the active sphere's palette via these
     variables. The fallbacks keep the previous readable defaults before setSphere runs. */
  --hp-fill:#ff5a6a; --hp-empty:rgba(255,255,255,0.16);
  --pod-color:#ffd23f; --dial-good:#8fe36b; --dial-bg:rgba(255,255,255,0.18);
  --par-warn:#ff783c; --par-warn-glow:rgba(255,120,60,0.85);
  --jump-on:#5fc9ff; --fw-color:#ff9a4a;
  --boss-name:#ff8a7a; --boss-fill:#ffb04a; }
#hud .plate { position:absolute; left:0; right:0; display:block; image-rendering:pixelated; }
#hud .plate.top { top:0; }
#hud .plate.card { bottom:0; transition:opacity 1.1s linear; }
#hud .tl { position:absolute; left:16px; top:42px; }
#hud .pips { display:flex; gap:6px; margin-bottom:8px; }
#hud .pip { width:16px; height:16px; border-radius:50%;
  background:var(--hp-fill,#ff5a6a); box-shadow:0 0 0 2px rgba(0,0,0,0.55) inset; }
#hud .pip.empty { background:var(--hp-empty,rgba(255,255,255,0.16)); }
#hud .pods { font-size:15px; font-weight:700; letter-spacing:0.5px; }
#hud .pods b { color:var(--pod-color,#ffd23f); }
#hud .tr { position:absolute; right:16px; top:42px; text-align:right; }
#hud .dial { width:56px; height:56px; border-radius:50%;
  background:conic-gradient(var(--dial-good,#8fe36b) 0turn, var(--dial-good,#8fe36b) var(--p,0turn), var(--dial-bg,rgba(255,255,255,0.18)) var(--p,0turn));
  box-shadow:0 0 0 3px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; }
#hud .dial .cap { width:40px; height:40px; border-radius:50%; background:rgba(20,24,32,0.7);
  display:flex; align-items:center; justify-content:center; font-size:10px; }
#hud .dial.warn { animation:parpulse 0.7s ease-in-out infinite; }
@keyframes parpulse { 0%,100%{ box-shadow:0 0 0 3px rgba(0,0,0,0.5);} 50%{ box-shadow:0 0 0 6px var(--par-warn-glow,rgba(255,120,60,0.85));} }
/* While the sphere card is up, the play chrome steps above it rather than under it. */
#hud .chain, #hud .ammo, #hud .chaincount { transition:transform 0.5s ease; }
#hud.card-on .chain, #hud.card-on .ammo, #hud.card-on .chaincount { transform:translateY(-86px); }
#hud.card-on .chain, #hud.card-on .chaincount { transform:translate(-50%,-86px); }
#hud .chain { position:absolute; left:50%; bottom:36px; transform:translateX(-50%); display:flex; gap:10px; }
#hud .chain .j { width:13px; height:13px; border-radius:3px; background:rgba(255,255,255,0.18); transform:rotate(45deg); }
#hud .chain .j.on { background:var(--jump-on,#5fc9ff); box-shadow:0 0 8px var(--jump-on,#5fc9ff); }
#hud .ammo { position:absolute; right:16px; bottom:30px; text-align:right; font-size:13px; font-weight:700; letter-spacing:0.5px; }
#hud .ammo .fw { color:var(--fw-color,#ff9a4a); }
#hud .ammo .bar { display:flex; gap:4px; justify-content:flex-end; margin-top:4px; }
#hud .ammo .fwbox { width:12px; height:12px; border-radius:3px; background:var(--fw-color,#ff9a4a); box-shadow:0 0 6px var(--fw-color,rgba(255,150,70,0.7)); }
#hud .ammo .fwbox.empty { background:rgba(255,255,255,0.16); box-shadow:none; }
#hud .chaincount { position:absolute; left:50%; bottom:60px; transform:translateX(-50%); font-size:15px; font-weight:900;
  color:var(--pod-color,#ffd23f); text-shadow:0 0 10px rgba(255,210,63,0.8),0 1px 2px rgba(0,0,0,0.8); display:none; }
#hud .boss { position:absolute; left:50%; top:44px; transform:translateX(-50%); width:280px; display:none; text-align:center; }
#hud .boss .name { font-size:12px; font-weight:800; letter-spacing:2px; color:var(--boss-name,#ff8a7a); margin-bottom:3px; }
#hud .boss .track { height:12px; border-radius:6px; background:rgba(255,255,255,0.16); box-shadow:0 0 0 2px rgba(0,0,0,0.5); overflow:hidden; }
#hud .boss .fill { height:100%; width:100%; background:linear-gradient(90deg,var(--hp-fill,#ff5a4a),var(--boss-fill,#ffb04a)); transition:width 0.18s ease; }
#hud .rim { position:fixed; inset:0; pointer-events:none; z-index:45; opacity:0; }
#hud .rim.on { opacity:1; }
#hud .rim.flash { transition:opacity 0.05s ease-out; }
#hud .rim.soft { transition:opacity 0.28s ease-in-out; }
#death { position:fixed; inset:0; z-index:70; display:none; align-items:center; justify-content:center;
  background:radial-gradient(circle at 50% 45%, rgba(60,0,0,0.35), rgba(6,2,8,0.88));
  font-family:ui-monospace,Menlo,Consolas,monospace; color:#fff; text-align:center; }
#death h1 { font-size:34px; letter-spacing:6px; color:#ff6a6a; text-shadow:0 0 18px rgba(255,60,60,0.6); margin:0 0 8px; }
#death p { opacity:0.85; font-size:14px; margin:4px 0 18px; }
#death button { pointer-events:auto; cursor:pointer; font:inherit; font-size:14px; padding:10px 20px; border-radius:10px;
  border:2px solid #ff6a6a; background:#2a0c0c; color:#fff; font-weight:700; }
#death button:focus-visible { outline:3px solid #ffd23f; outline-offset:2px; }
#hud .arrow { position:absolute; color:#ffd23f; font-size:26px; font-weight:900; display:none; }
#hud .parrow { position:absolute; color:#5fe0ff; font-size:24px; font-weight:900; display:none;
  text-shadow:0 0 8px rgba(95,224,255,0.7),0 1px 2px rgba(0,0,0,0.8); }
#cap-menu { position:fixed; inset:0; z-index:60; display:none; align-items:center; justify-content:center;
  background:rgba(10,14,22,0.72); backdrop-filter:blur(2px);
  font-family:ui-monospace,Menlo,Consolas,monospace; color:#fff; }
#cap-menu .panel { background:rgba(24,30,42,0.96); border:2px solid #5fc9ff; border-radius:14px;
  padding:22px 26px; min-width:340px; box-shadow:0 12px 40px rgba(0,0,0,0.6); }
#cap-menu h1 { margin:0 0 4px; font-size:20px; letter-spacing:1px; color:#ffd23f; }
#cap-menu h2 { margin:0 0 14px; font-size:12px; font-weight:400; opacity:0.8; }
#cap-menu .row { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:10px 0; font-size:13px; }
#cap-menu input[type=range]{ width:150px; }
#cap-menu .btns { display:flex; gap:10px; margin-top:16px; }
#cap-menu button { pointer-events:auto; cursor:pointer; font:inherit; font-size:13px; padding:9px 16px; border-radius:9px;
  border:2px solid #5fc9ff; background:#123; color:#fff; }
#cap-menu button.primary { background:#5fc9ff; color:#04222e; font-weight:700; }
#cap-menu button:focus-visible { outline:3px solid #ffd23f; outline-offset:2px; }

/* ---- M5-minimal title: Crown of Heaven palette + the same native dither plate and
   code-drawn pixel type used by the ratified world/carnival treatment. ---- */
#cap-title { position:fixed; inset:0; z-index:80; display:none; align-items:center; justify-content:center;
  font-family:ui-monospace,Menlo,Consolas,monospace; color:var(--cream,#fff0d0); text-align:center; }
#cap-title .title-backdrop { position:absolute; inset:0; width:100%; height:100%;
  image-rendering:pixelated; image-rendering:crisp-edges; }
#cap-title .title-inner { position:relative; width:min(760px,calc(100vw - 40px)); padding:20px 24px 22px;
  background:var(--ink); border:2px solid var(--gold); box-shadow:0 0 0 2px var(--deep),0 18px 54px rgba(10,4,35,.68); }
#cap-title .wordmark { display:block; max-width:100%; height:auto; margin:0 auto 5px;
  image-rendering:pixelated; image-rendering:crisp-edges; }
#cap-title .tag { margin:0 0 13px; color:var(--mint); font-size:12px; letter-spacing:2px; }
#cap-title .controls { border:1px solid var(--edge); background:var(--deep); padding:12px 16px 10px; }
#cap-title .controls h2 { margin:0 0 10px; color:var(--pink); font-size:12px; letter-spacing:2px; font-weight:800; }
#cap-title .control-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px 20px; text-align:left; }
#cap-title .control { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; }
#cap-title .control span { opacity:.86; }
#cap-title kbd { min-width:112px; padding:4px 7px; border:1px solid var(--edge); background:rgba(255,255,255,.055);
  color:var(--gold); font:700 11px/1.2 ui-monospace,Menlo,Consolas,monospace; text-align:center; box-shadow:inset 0 -2px rgba(0,0,0,.22); }
#cap-title .start { pointer-events:auto; cursor:pointer; margin-top:14px; padding:9px 24px; border:2px solid var(--gold);
  background:var(--gold); color:var(--deep); font:900 13px/1 ui-monospace,Menlo,Consolas,monospace; letter-spacing:1px; }
#cap-title .start:focus-visible { outline:3px solid var(--mint); outline-offset:3px; }
#cap-title .recommendation { margin:8px 0 0; color:var(--pink); font-size:10px; opacity:.9; letter-spacing:0.3px; }
#cap-title .hint { margin:9px 0 0; font-size:10px; color:var(--cream); opacity:.72; }
@media (max-width:620px) { #cap-title .control-grid { grid-template-columns:1fr; } #cap-title .title-inner { padding:14px; } }
@media (max-height:680px) { #cap-title .title-inner { padding-top:12px; padding-bottom:12px; }
  #cap-title .tag { margin-bottom:8px; } #cap-title .controls { padding-top:8px; padding-bottom:7px; }
  #cap-title .control-grid { gap:4px 16px; } #cap-title .start { margin-top:9px; } }

/* ---- M4 caprice chips (drafted build, bottom-left) ---- */
#hud .caps { position:absolute; left:16px; bottom:20px; display:flex; flex-wrap:wrap; gap:6px; max-width:40vw; }
#hud .caps .cap { font-size:11px; font-weight:700; letter-spacing:0.3px; padding:3px 8px; border-radius:8px;
  background:rgba(255,210,63,0.18); border:1px solid rgba(255,210,63,0.7); color:#ffe08a; }

/* ---- M4 full-screen carnival screens: draft, scorecard, meta ----
   Dressed in the ART PASS's discipline, not browser defaults: every colour is a CSS
   variable driven from the ACTIVE SPHERE's committed palette (set by setSphere), the
   backdrop is a dithered ink/vignette/grain plate painted at native resolution and
   upscaled with no smoothing, and the titles are drawn in the 5x5 pixel typeface.
   The fallbacks below are act-1 tones so a screen shown before any sphere announce
   (a cold proof capture) still reads in register rather than flat. Body copy stays
   real DOM text — the legibility/a11y floor (seed M6) outranks the typeface here. */
#cap-screen { position:fixed; inset:0; z-index:65; display:none; align-items:center; justify-content:center;
  font-family:ui-monospace,Menlo,Consolas,monospace; color:var(--cream,#ffe9b0);
  --ink:#0b1020; --ink2:#1a2340; --cream:#ffe9b0; --gold:#ffd23f; --accent:#7ce0c0; --edge:#5fc9ff; }
#cap-screen .backdrop { position:absolute; inset:0; width:100%; height:100%;
  image-rendering:pixelated; image-rendering:crisp-edges; }
#cap-screen .sheet { position:relative; background:var(--ink2); border:2px solid var(--gold); border-radius:0;
  padding:26px 30px; min-width:520px; max-width:760px;
  box-shadow:0 0 0 2px var(--ink), 0 16px 50px rgba(0,0,0,0.65); }
#cap-screen .titleplate { display:block; margin:0 auto 8px; image-rendering:pixelated; image-rendering:crisp-edges; }
#cap-screen h1.sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
#cap-screen h2 { margin:0 0 18px; font-size:13px; font-weight:400; opacity:0.85; text-align:center; color:var(--cream); }
#cap-screen .cards { display:flex; gap:14px; justify-content:center; }
#cap-screen .card { pointer-events:auto; cursor:pointer; flex:1; max-width:210px; background:var(--ink);
  border:2px solid var(--edge); border-radius:0; padding:16px 14px; text-align:left; color:var(--cream); font:inherit; }
#cap-screen .card .nm { font-size:15px; font-weight:800; color:var(--accent); margin-bottom:6px; }
#cap-screen .card .ds { font-size:12px; opacity:0.9; line-height:1.4; }
#cap-screen .card .tr { margin-top:10px; font-size:10px; letter-spacing:1px; opacity:0.6; }
#cap-screen .card:focus-visible { outline:3px solid var(--gold); outline-offset:3px; border-color:var(--gold); }
#cap-screen .card.tier1 { border-color:#c08bff; } #cap-screen .card.tier1 .nm { color:#d3b0ff; }
#cap-screen .card.tier2 { border-color:#ff9a4a; } #cap-screen .card.tier2 .nm { color:#ffc389; }
#cap-screen .actions { display:flex; gap:12px; justify-content:center; margin-top:20px; }
#cap-screen button { pointer-events:auto; cursor:pointer; font:inherit; font-size:13px; padding:9px 18px; border-radius:0;
  border:2px solid var(--edge); background:var(--ink); color:var(--cream); }
#cap-screen button.primary { background:var(--gold); color:var(--ink); font-weight:800; border-color:var(--gold); }
#cap-screen button:focus-visible { outline:3px solid var(--gold); outline-offset:2px; }
#cap-screen .report { font-size:14px; line-height:1.7; margin:6px 0 4px; }
#cap-screen .report b { color:var(--gold); }
#cap-screen .line { text-align:center; font-size:13px; opacity:0.9; margin:2px 0; }
#cap-screen .tickets { text-align:center; font-size:15px; margin:14px 0 4px; }
#cap-screen .tickets .big { font-size:30px; font-weight:900; color:var(--gold); text-shadow:0 0 14px rgba(255,210,63,0.6); }
#cap-screen .breakdown { font-size:11px; opacity:0.7; text-align:center; margin-top:2px; }
#cap-screen.win .sheet { border-color:var(--accent); }
#cap-screen .shop { display:flex; flex-direction:column; gap:6px; margin:12px 0; max-height:40vh; overflow:auto; position:relative; }
#cap-screen .shop::after { content:''; position:absolute; left:0; right:0; bottom:0; height:30px; pointer-events:none;
  background:linear-gradient(to bottom, transparent, var(--ink2)); }
#cap-screen .shop .item { display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:7px 12px; border-radius:0; background:rgba(255,255,255,0.05); font-size:12px; }
#cap-screen .shop .item.owned { opacity:0.6; }
#cap-screen .shop .item .info b { color:var(--accent); }
#cap-screen .shop .item button { padding:5px 12px; font-size:11px; }
#cap-screen .shop .item button:disabled { opacity:0.4; cursor:default; }

/* ---- M5 pass: code-drawn ticket glyph used in place of the emoji in the meta screen. */
.ticket-glyph { display:inline-block; width:16px; height:12px; vertical-align:-2px; margin-left:3px;
  image-rendering:pixelated; image-rendering:crisp-edges; }
`;

export function createHud(settings, hooks = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <canvas class="plate top" id="hud-topbar" aria-hidden="true"></canvas>
    <canvas class="plate card" id="hud-card" aria-hidden="true"></canvas>
    <div id="hud-sphere-a11y" role="status" aria-live="polite"
         style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"></div>
    <div class="tl">
      <div class="pips" id="hud-pips"></div>
      <div class="pods">PODS <b><span id="hud-pods">0</span>/<span id="hud-podmax">4</span></b></div>
    </div>
    <div class="tr">
      <div class="dial" id="hud-dial"><div class="cap"><span id="hud-par">PAR</span></div></div>
    </div>
    <div class="chain" id="hud-chain"></div>
    <div class="chaincount" id="hud-chaincount"></div>
    <div class="ammo"><span class="fw">FIREWORK</span><div class="bar" id="hud-ammo"></div></div>
    <div class="boss" id="hud-boss"><div class="name">GATEKEEPER</div><div class="track"><div class="fill" id="hud-bossfill"></div></div></div>
    <div class="rim" id="hud-rim"></div>
    <div class="arrow" id="hud-arrow">▲</div>
    <div class="parrow" id="hud-podarrow">◆</div>
    <div class="caps" id="hud-caps"></div>`;
  document.body.appendChild(hud);

  // Death overlay (action-legibility law: death has a player-visible representation; the
  // causal carnival scorecard is M4). Restart hook rebuilds the run.
  const death = document.createElement('div');
  death.id = 'death';
  death.innerHTML = `<div><h1>DOWN</h1><p>The clockwork winds down. A carnival scorecard is coming (M4).</p>
    <button id="death-restart">Restart run</button></div>`;
  document.body.appendChild(death);
  death.querySelector('#death-restart').addEventListener('click', () => hooks.onRestart && hooks.onRestart());

  // M4 full-screen carnival screens (draft between spheres, scorecard on death/victory, and
  // the meta trunk/loadout screen). One overlay element whose contents swap per screen; all
  // buttons are real focusable elements (keyboard traversal + visible focus, input floor).
  const screen = document.createElement('div');
  screen.id = 'cap-screen';
  document.body.appendChild(screen);
  let screenVisible = false, screenKind = null;
  const heldScreenKeys = new Set();
  const screenPressGate = createFreshPressGate();

  // M5-minimal title overlay. Its backdrop + wordmark are canvas-drawn at runtime;
  // the controls remain semantic DOM text and a real focusable button.
  const title = document.createElement('div');
  title.id = 'cap-title';
  title.innerHTML = `<canvas class="title-backdrop" aria-hidden="true"></canvas>
    <main class="title-inner" aria-labelledby="cap-title-name">
      <h1 id="cap-title-name" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">CAPRIOLE</h1>
      <canvas class="wordmark" aria-hidden="true"></canvas>
      <p class="tag">A CLOCKWORK GOAT FALLS UPWARD</p>
      <section class="controls" aria-label="Controls">
        <h2>CONTROLS</h2>
        <div class="control-grid">
          <div class="control"><span>MOVE</span><kbd>W A S D</kbd></div>
          <div class="control"><span>LOOK</span><kbd>ARROWS / MOUSE</kbd></div>
          <div class="control"><span>TRIPLE LEAP</span><kbd>SPACE</kbd></div>
          <div class="control"><span>FIREWORK</span><kbd>F / E</kbd></div>
          <div class="control"><span>PAUSE + OPTIONS</span><kbd>ESC</kbd></div>
          <div class="control"><span>START</span><kbd>ENTER / SPACE</kbd></div>
        </div>
      </section>
      <button class="start" type="button">START THE ASCENT</button>
      <p class="recommendation">BEST PLAYED WITH A MOUSE</p>
      <p class="hint">Collect four pods. Open the gate. Keep climbing.</p>
    </main>`;
  document.body.appendChild(title);
  let titleVisible = false, titlePalette = null, titleStart = null;

  const el = (id) => hud.querySelector(id);
  const pipsEl = el('#hud-pips'), podsEl = el('#hud-pods'), podMaxEl = el('#hud-podmax');
  const capsEl = el('#hud-caps');
  const dialEl = el('#hud-dial'), parEl = el('#hud-par'), chainEl = el('#hud-chain'), arrowEl = el('#hud-arrow'), podArrowEl = el('#hud-podarrow');
  const chainCountEl = el('#hud-chaincount'), ammoEl = el('#hud-ammo'), bossEl = el('#hud-boss'), bossFillEl = el('#hud-bossfill'), rimEl = el('#hud-rim');
  let deathVisible = false, rimTimer = 0;

  // ---- Sphere identity chrome: the persistent top bar and the arrival card.
  //      Both are code-drawn pixel-type plates in the sphere's own palette.
  const topbarEl = el('#hud-topbar'), cardEl = el('#hud-card'), a11yEl = el('#hud-sphere-a11y');
  const TOP_H = 30, CARD_H = 86;
  const CARD_HOLD = 4.5, CARD_FADE = 1.1; // seconds of SIM time
  let sphereInfo = null, cardShown = false;

  // ---- Carnival-screen dressing (M4 screens × the ratified art pass).
  //
  // The four screens are DOM overlays on purpose — they carry real focusable buttons
  // and must stay crisp at any viewport, which a 300px-tall upscaled buffer cannot do.
  // What they DO adopt is the pass's presentation discipline: the active sphere's
  // palette drives every colour, titles are drawn in the 5x5 pixel typeface, and the
  // backdrop is the same ink / vignette / dithered-grain plate language as the world's
  // compositing pass — painted small and upscaled hard, so it is made of real pixels.
  //
  // Fallback palette = sphere 0's tones, for a screen opened before any announce
  // (`?demo&screen=…` proof staging does exactly that).
  const SCREEN_FALLBACK = { skyTop: '#5fc9ff', skyBot: '#ffe9b0', floatB: '#ffd23f', floatC: '#7b6bff', cap: '#68d06a' };
  const screenPalette = () => (sphereInfo && sphereInfo.palette) || SCREEN_FALLBACK;
  const BACKDROP_H = 200; // native plate height; CSS upscales it with no smoothing

  function paintTitle() {
    if (!titleVisible || !titlePalette) return;
    const pal = titlePalette;
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    const H = 300, W = Math.max(2, Math.round(H * (vw / vh)));
    const cv = title.querySelector('.title-backdrop');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H), D = img.data;
    const top = hexRgb(pal.skyTop), bot = hexRgb(pal.skyBot);
    for (let y = 0; y < H; y++) {
      const u = y / Math.max(1, H - 1);
      for (let x = 0; x < W; x++) {
        // Six hard ramp stops with Bayer selection between them, matching the world's
        // quantised sky rather than inventing a smooth DOM gradient.
        const levels = 6, q = u * (levels - 1), lo = Math.floor(q);
        const hi = Math.min(levels - 1, lo + 1);
        const pick = (q - lo) > bayerAt(x, y) ? hi : lo;
        const a = pick / (levels - 1);
        const tooth = (noise2(x * 0.41, y * 0.41, 211) - 0.5) * 7;
        const i = (y * W + x) * 4;
        D[i] = top[0] * (1 - a) + bot[0] * a + tooth;
        D[i + 1] = top[1] * (1 - a) + bot[1] * a + tooth;
        D[i + 2] = top[2] * (1 - a) + bot[2] * a + tooth;
        D[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // Crown's motivated carnival ornaments: a pixel sun, rings and rising lozenges,
    // all from its committed palette and all drawn geometry.
    g.fillStyle = pal.floatB;
    g.beginPath(); g.arc(W * 0.76, H * 0.20, Math.max(9, H * 0.045), 0, Math.PI * 2); g.fill();
    g.strokeStyle = pal.floatC; g.lineWidth = 2;
    [[.13,.22,13],[.87,.53,9],[.20,.72,7]].forEach(([x,y,r]) => { g.beginPath(); g.arc(W*x,H*y,r,0,Math.PI*2); g.stroke(); });
    g.fillStyle = pal.floatA;
    [[.08,.48,5],[.92,.30,4],[.80,.78,5]].forEach(([x,y,r]) => {
      g.save(); g.translate(W*x,H*y); g.rotate(Math.PI/4); g.fillRect(-r,-r,r*2,r*2); g.restore();
    });

    const wm = title.querySelector('.wordmark');
    let scale = 10;
    const avail = Math.min(700, vw - 72);
    while (scale > 4 && pixelTextWidth('CAPRIOLE', scale) > avail) scale--;
    const ww = pixelTextWidth('CAPRIOLE', scale) + scale * 4, wh = 5 * scale + scale * 4;
    wm.width = ww; wm.height = wh; wm.style.width = `${ww}px`; wm.style.height = `${wh}px`;
    const wg = wm.getContext('2d');
    drawPixelText(wg, 'CAPRIOLE', ww / 2 + scale, scale * 2 + scale, toneCss(pal.skyTop, -0.88, .9), scale, 'center');
    drawPixelText(wg, 'CAPRIOLE', ww / 2, scale * 2, pal.floatB, scale, 'center');
  }

  function showTitle(palette, onStart) {
    titlePalette = palette;
    titleStart = onStart;
    titleVisible = true;
    const ink = toneCss(palette.skyTop, -0.82, .94);
    title.style.setProperty('--ink', ink);
    title.style.setProperty('--deep', toneCss(palette.skyTop, -0.90, .98));
    title.style.setProperty('--cream', toneCss(palette.skyBot, .56));
    title.style.setProperty('--gold', palette.floatB);
    title.style.setProperty('--mint', palette.floatC);
    title.style.setProperty('--pink', palette.floatA);
    title.style.setProperty('--edge', palette.cap);
    title.style.display = 'flex';
    paintTitle();
    setTimeout(() => title.querySelector('.start').focus(), 0);
  }

  function hideTitle() {
    titleVisible = false;
    title.style.display = 'none';
    titleStart = null;
  }

  title.querySelector('.start').addEventListener('click', () => { if (titleVisible && titleStart) titleStart(); });

  // Capture Enter/Space before gameplay input so starting never leaks a held jump into the
  // first sim tick. This is the keyboard-only title floor; the real button covers pointer.
  window.addEventListener('keydown', (e) => {
    if (!titleVisible || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); e.stopPropagation();
    title.querySelector('.start').click();
  }, true);

  function paintScreenBackdrop(win = false) {
    const pal = screenPalette();
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    const H = BACKDROP_H, W = Math.max(2, Math.round(H * (vw / vh)));
    const cv = screen.querySelector('.backdrop');
    if (!cv) return;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H), D = img.data;
    const ink = hexRgb(pal.skyTop).map((v) => v * 0.16);       // the frame's own darkness
    const lift = hexRgb(pal.skyBot);                            // the frame's own light
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Radial fall-off toward the sheet, dithered so it steps in dots not a wash.
        const q = Math.min(1, Math.hypot((x / W - 0.5) * 1.5, (y / H - 0.42) * 1.15) * 1.35);
        let a = 0.62 + q * 0.34;
        const tooth = (noise2(x * 0.63, y * 0.63, 103) - 0.5) * 0.10;
        a = Math.max(0, Math.min(1, a + tooth * 0.5));
        // Bayer the alpha's fractional step so the gradient is quantised, not smooth.
        const steps = 12;
        const av = a * steps, ai = Math.floor(av);
        const alpha = ((av - ai > bayerAt(x, y) ? ai + 1 : ai) / steps);
        // A full clear lifts the plate's centre — the victory screen has to feel
        // different from the death screen without leaving the sphere's own palette.
        const glow = Math.max(0, 1 - q * 1.6) * (win ? 0.30 : 0.10);
        const i = (y * W + x) * 4;
        D[i] = ink[0] + lift[0] * glow;
        D[i + 1] = ink[1] + lift[1] * glow;
        D[i + 2] = ink[2] + lift[2] * glow;
        D[i + 3] = Math.round(alpha * 255);
      }
    }
    g.putImageData(img, 0, 0);
  }

  // Draw a screen's title in the pixel typeface, sized to fit the sheet (never clipped).
  function paintScreenTitle(text) {
    const cv = screen.querySelector('.titleplate');
    if (!cv) return;
    const pal = screenPalette();
    const sheet = screen.querySelector('.sheet');
    const avail = Math.max(200, (sheet ? sheet.clientWidth : 520) - 60);
    let scale = 5;
    while (scale > 2 && pixelTextWidth(text, scale) > avail) scale--;
    const w = Math.max(2, Math.ceil(pixelTextWidth(text, scale)) + scale * 2);
    const h = 5 * scale + scale * 2;
    cv.width = w; cv.height = h;
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    // Title ink follows --gold, which dressScreen has already set for this screen —
    // so a victory title shifts with the rest of the chrome instead of staying gold.
    const key = getComputedStyle(screen).getPropertyValue('--gold').trim() || toneCss(pal.floatB, 0.18);
    // A one-pixel ink shadow so the type holds against the sheet at any palette.
    drawPixelText(g, text, scale, scale + scale, toneCss(pal.skyTop, -0.85, 0.85), scale);
    drawPixelText(g, text, scale, scale, key, scale);
  }

  // Push the active sphere's palette into the screen's CSS variables, paint the plate
  // and the title. Called at the end of every show* so each screen is dressed the same.
  function dressScreen(title, win = false) {
    const pal = screenPalette();
    // A full clear swaps the chrome's key hue to the sphere's GROWTH colour (its cap
    // green) and lifts the plate — the old build signalled victory with a hardcoded
    // green wash, which read as a different game's UI; this keeps the distinction
    // strong while staying inside the sphere's committed palette.
    const key = win ? (pal.cap || pal.floatB) : pal.floatB;
    screen.style.setProperty('--ink', toneCss(pal.skyTop, -0.86));
    screen.style.setProperty('--ink2', toneCss(pal.skyTop, -0.72));
    screen.style.setProperty('--cream', toneCss(pal.skyBot, 0.55));
    screen.style.setProperty('--gold', toneCss(key, win ? 0.34 : 0.10));
    screen.style.setProperty('--accent', toneCss(win ? pal.floatB : pal.floatC, 0.28));
    screen.style.setProperty('--edge', toneCss(pal.cap || pal.floatC, 0.10));
    paintScreenBackdrop(win);
    paintScreenTitle(title);
  }

  function paintPlates() {
    if (!sphereInfo) return;
    const pal = sphereInfo.palette;
    const w = Math.max(2, window.innerWidth);
    const ink = toneCss(pal.skyTop, -0.80, 0.78);
    // M5 pass: raised from 0.62 to 0.78 so the card holds contrast over a bright cap.
    const inkCard = toneCss(pal.skyTop, -0.80, 0.78);
    const cream = toneCss(pal.skyBot, 0.55);
    const gold = toneCss(pal.floatB, 0.10);
    const accent = toneCss(pal.floatC, 0.10);
    const shadow = toneCss(pal.skyTop, -0.85, 0.70);

    // Top bar — the run's identity, always present, deliberately slim.
    topbarEl.width = w; topbarEl.height = TOP_H;
    topbarEl.style.width = `${w}px`; topbarEl.style.height = `${TOP_H}px`;
    const tg = topbarEl.getContext('2d');
    tg.clearRect(0, 0, w, TOP_H);
    tg.fillStyle = ink; tg.fillRect(0, 0, w, TOP_H - 1);
    tg.fillStyle = gold; tg.fillRect(0, TOP_H - 1, w, 1);
    drawPixelText(tg, 'CAPRIOLE', 16, 9, cream, 2);
    const n = String(sphereInfo.index + 1).padStart(2, '0');
    const total = String(sphereInfo.count).padStart(2, '0');
    drawPixelText(tg, `SPHERE ${n} / ${total}`, w - 16, 9, gold, 2, 'right');

    // Arrival card — the sphere's committed palette name, in the frame's own type.
    cardEl.width = w; cardEl.height = CARD_H;
    cardEl.style.width = `${w}px`; cardEl.style.height = `${CARD_H}px`;
    const cg = cardEl.getContext('2d');
    cg.clearRect(0, 0, w, CARD_H);
    cg.fillStyle = inkCard; cg.fillRect(0, 1, w, CARD_H - 1);
    cg.fillStyle = accent; cg.fillRect(0, 0, w, 1);
    // Scale the title down if a long name would otherwise run off a narrow viewport
    // (no clipped text — seed M6 legibility floor).
    let scale = 6;
    while (scale > 2 && pixelTextWidth(sphereInfo.name, scale) > w - 80) scale--;
    // One-pixel ink shadow so the type does not wash out where a pale island sits behind it.
    drawPixelText(cg, sphereInfo.name, 22 + scale, 18 + scale, shadow, scale);
    drawPixelText(cg, sphereInfo.name, 22, 18, cream, scale);
    drawPixelText(cg, sphereInfo.subtitle, 24 + 2, 24 + 5 * scale + 8 + 2, shadow, 2);
    drawPixelText(cg, sphereInfo.subtitle, 24, 24 + 5 * scale + 8, gold, 2);
  }

  function setSphere(info) {
    sphereInfo = info;
    cardShown = true;
    paintPlates();
    cardEl.style.display = 'block';
    cardEl.style.opacity = '1';
    hud.classList.add('card-on');
    a11yEl.textContent = `Sphere ${info.index + 1} of ${info.count}. ${info.name}. ${info.subtitle}.`;

    // M5 pass: drive the live HUD widgets from the sphere's own committed palette so the
    // chrome never drifts into default browser colours mid-ascent.
    const pal = info.palette;
    hud.style.setProperty('--hp-fill', pal.floatA);
    hud.style.setProperty('--pod-color', pal.floatB);
    hud.style.setProperty('--dial-good', pal.cap);
    hud.style.setProperty('--dial-bg', 'rgba(255,255,255,0.18)');
    hud.style.setProperty('--par-warn', pal.floatA);
    hud.style.setProperty('--par-warn-glow', toneCss(pal.floatA, 0, 0.5));
    hud.style.setProperty('--jump-on', pal.floatC);
    hud.style.setProperty('--fw-color', pal.floatA);
    hud.style.setProperty('--boss-name', pal.floatA);
    hud.style.setProperty('--boss-fill', pal.floatB);
  }

  window.addEventListener('resize', () => {
    paintPlates();
    if (titleVisible) paintTitle();
    // A carnival screen open across a resize must repaint its plate, or the backdrop
    // stretches at the wrong aspect and the pixel grid stops being square.
    if (screenVisible) { paintScreenBackdrop(); }
  });

  // Build the pause/settings + preset menu.
  const menu = document.createElement('div');
  menu.id = 'cap-menu';
  document.body.appendChild(menu);

  function slider(label, key, min, max, step) {
    return `<div class="row"><span>${label}</span>
      <span><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}"> </span></div>`;
  }
  function toggle(label, key) {
    return `<div class="row"><span>${label}</span>
      <span><input type="checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}></span></div>`;
  }

  function renderPause() {
    menu.innerHTML = `<div class="panel" role="dialog" aria-label="Paused">
      <h1>PAUSED</h1><h2>Esc to resume · motion-comfort controls</h2>
      ${slider('Camera tilt intensity', 'tiltIntensity', 0, 1, 0.05)}
      ${slider('Field of view', 'fov', 60, 100, 1)}
      ${slider('Look sensitivity', 'sensitivity', 0.3, 2, 0.05)}
      ${slider('Sound volume', 'volume', 0, 1, 0.05)}
      ${toggle('Invert look Y', 'invertY')}
      ${toggle('Screen shake', 'screenShake')}
      ${toggle('Reduce flashing', 'flashReduce')}
      ${toggle('Aim indicator', 'aimIndicator')}
      <div class="btns"><button class="primary" id="cap-resume">Resume</button></div>
    </div>`;
    wireControls();
    const r = menu.querySelector('#cap-resume');
    r.addEventListener('click', () => hooks.onResume && hooks.onResume());
    setTimeout(() => r.focus(), 0);
  }

  function wireControls() {
    menu.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', () => { settings[inp.dataset.key] = parseFloat(inp.value); hooks.onSettings && hooks.onSettings(); });
    });
    menu.querySelectorAll('input[type=checkbox]').forEach((inp) => {
      inp.addEventListener('change', () => { settings[inp.dataset.key] = inp.checked; hooks.onSettings && hooks.onSettings(); });
    });
  }

  // First-boot preset choice (law #4). Resolves once the player picks.
  function showPresetChoice(onPick) {
    menu.style.display = 'flex';
    menu.innerHTML = `<div class="panel" role="dialog" aria-label="Comfort preset">
      <h1>WELCOME</h1><h2>Pick a comfort preset — you can change it any time in Pause (Esc).</h2>
      <div class="row"><span><b>Standard</b><br><small style="opacity:.75">Full camera tip-down at apex.</small></span>
        <button class="primary" id="cap-standard">Standard</button></div>
      <div class="row"><span><b>Comfort</b><br><small style="opacity:.75">Gentler tilt; the landing ring guides you.</small></span>
        <button id="cap-comfort">Comfort</button></div>
    </div>`;
    const std = menu.querySelector('#cap-standard'), cmf = menu.querySelector('#cap-comfort');
    std.addEventListener('click', () => { onPick('standard'); });
    cmf.addEventListener('click', () => { onPick('comfort'); });
    setTimeout(() => std.focus(), 0);
  }

  // Point an edge-arrow element toward an off-screen projected target (landing or pod).
  // `target` = {onScreen, x, y, behind}; hidden when on-screen or absent.
  function placeEdgeArrow(elm, target, radiusFrac, rotate) {
    if (!target || target.onScreen) { elm.style.display = 'none'; return; }
    elm.style.display = 'block';
    const w = window.innerWidth, h = window.innerHeight;
    const nx = target.behind ? -target.x : target.x, ny = target.behind ? -target.y : target.y;
    const ang = Math.atan2(ny, nx);
    const px = w / 2 + Math.cos(ang) * (w * radiusFrac);
    const py = h / 2 - Math.sin(ang) * (h * radiusFrac);
    elm.style.left = `${px - 13}px`;
    elm.style.top = `${py - 13}px`;
    elm.style.transform = rotate ? `rotate(${90 - ang * 180 / Math.PI}deg)` : 'none';
  }

  let pauseVisible = false;
  function showPause(v) {
    pauseVisible = v;
    if (v) { renderPause(); menu.style.display = 'flex'; }
    else { menu.style.display = 'none'; }
  }
  function hideMenu() { menu.style.display = 'none'; }

  function showDeath(v) {
    deathVisible = v;
    death.style.display = v ? 'flex' : 'none';
    if (v) setTimeout(() => { const b = death.querySelector('#death-restart'); if (b) b.focus(); }, 0);
  }

  // ---- M4 carnival screens (draft / scorecard / meta). Escape text; keyboard-navigable.
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function hideScreen() {
    screenVisible = false; screenKind = null; screen.style.display = 'none'; screen.className = '';
    screenPressGate.close();
  }

  // The between-sphere caprice draft. `offer` = [{id,name,desc,tier}]; hooks.onPick(i)/onSkip().
  function showDraft(offer, dhooks) {
    screenKind = 'draft'; screenVisible = true; screen.className = ''; screen.style.display = 'flex';
    screenPressGate.open(heldScreenKeys);
    const cards = (offer || []).map((c, i) => `<button class="card tier${c.tier}" data-i="${i}">
        <div class="nm">${esc(c.name)}</div><div class="ds">${esc(c.desc)}</div>
        <div class="tr">CAPRICE${c.tier ? ` · TIER ${c.tier + 1}` : ''}</div></button>`).join('');
    screen.innerHTML = `<canvas class="backdrop" aria-hidden="true"></canvas>
      <div class="sheet" role="dialog" aria-label="Draft a caprice">
      <h1 class="sr">DRAFT A CAPRICE</h1>
      <canvas class="titleplate" aria-hidden="true"></canvas>
      <h2>Bend the ascent — take one, or skip for a ticket.  (← → choose · Enter take · S skip)</h2>
      <div class="cards">${cards || '<div class="line">no caprices left in the pool — skip on</div>'}</div>
      <div class="actions"><button id="cap-skip">Skip (+1 ticket)</button></div></div>`;
    screen.querySelectorAll('.card').forEach((b) => b.addEventListener('click', () => dhooks.onPick(parseInt(b.dataset.i, 10))));
    screen.querySelector('#cap-skip').addEventListener('click', () => dhooks.onSkip());
    dressScreen('DRAFT A CAPRICE');
    setTimeout(() => (screen.querySelector('.card') || screen.querySelector('#cap-skip')).focus(), 0);
  }

  // The carnival scorecard (death) / victory report. `sc` is the sim scorecard object.
  function showScorecard(sc, shooks) {
    screenKind = 'score'; screenVisible = true; screen.className = sc.outcome === 'victory' ? 'win' : ''; screen.style.display = 'flex';
    screenPressGate.open(heldScreenKeys);
    const t = sc.tickets;
    const causeLine = sc.outcome === 'death'
      ? `Felled by <b>${esc(sc.causeLabel || 'the sky itself')}</b> on <b>sphere ${sc.sphereNumber}</b> (act ${sc.act}).`
      : `You crowned the vault — <b>all ${sc.spheresCleared} spheres</b> cleared.`;
    const scTitle = sc.outcome === 'victory' ? 'THE VAULT IS YOURS' : 'CARNIVAL SCORECARD';
    screen.innerHTML = `<canvas class="backdrop" aria-hidden="true"></canvas>
      <div class="sheet" role="dialog" aria-label="Scorecard">
      <h1 class="sr">${scTitle}</h1>
      <canvas class="titleplate" aria-hidden="true"></canvas>
      <h2>${sc.outcome === 'victory' ? 'a full ascent — the premium payout' : 'a causal report of the run'}</h2>
      <div class="report">
        <div class="line">${causeLine}</div>
        <div class="line">Spheres cleared: <b>${sc.spheresCleared}</b></div>
        <div class="line">Caprice line: <b>${esc(sc.capriceLine)}</b></div>
      </div>
      <div class="tickets"><div class="big">+${t.total}</div>TICKETS BANKED</div>
      <div class="breakdown">depth ${t.base} · bosses ${t.bossBonus} · skips ${t.skip}${t.mult > 1 ? ` · ×${t.mult} victory` : ''}</div>
      <div class="actions"><button class="primary" id="cap-continue">Continue</button></div></div>`;
    screen.querySelector('#cap-continue').addEventListener('click', () => shooks.onContinue());
    dressScreen(scTitle, sc.outcome === 'victory');
    setTimeout(() => screen.querySelector('#cap-continue').focus(), 0);
  }

  // The between-runs meta screen (the TRUNK). `data` = { tickets, items:[{id,name,desc,tier,owned,cost,affordable}] };
  // hooks.onUnlock(id) / onStart().
  function showMeta(data, mhooks) {
    screenKind = 'meta'; screenVisible = true; screen.className = ''; screen.style.display = 'flex';
    screenPressGate.open(heldScreenKeys);
    const ticketGlyph = '<canvas class="ticket-glyph" width="16" height="12" aria-label="tickets"></canvas>';
    const items = (data.items || []).map((it) => `<div class="item ${it.owned ? 'owned' : ''}">
        <span class="info"><b>${esc(it.name)}</b> — ${esc(it.desc)}${it.tier ? ` <small>(tier ${it.tier + 1})</small>` : ''}</span>
        ${it.owned ? '<span>owned</span>' : `<button data-id="${esc(it.id)}" ${it.affordable ? '' : 'disabled'}>${it.cost} ${ticketGlyph}</button>`}
      </div>`).join('');
    screen.innerHTML = `<canvas class="backdrop" aria-hidden="true"></canvas>
      <div class="sheet" role="dialog" aria-label="Between runs">
      <h1 class="sr">THE TRUNK</h1>
      <canvas class="titleplate" aria-hidden="true"></canvas>
      <h2>Banked tickets: <b style="color:var(--gold)">${data.tickets} ${ticketGlyph}</b> — unlock caprices into your draft pool</h2>
      <div class="shop">${items || '<div class="line">every caprice unlocked</div>'}</div>
      <div class="actions"><button class="primary" id="cap-start">Start the ascent</button></div></div>`;
    screen.querySelectorAll('.shop button[data-id]').forEach((b) => b.addEventListener('click', () => mhooks.onUnlock(b.dataset.id)));
    screen.querySelector('#cap-start').addEventListener('click', () => mhooks.onStart());
    dressScreen('THE TRUNK');
    paintTicketGlyphs();
    setTimeout(() => screen.querySelector('#cap-start').focus(), 0);
  }

  function paintTicketGlyphs() {
    const color = getComputedStyle(screen).getPropertyValue('--gold').trim() || '#ffd23f';
    screen.querySelectorAll('.ticket-glyph').forEach((cv) => {
      const g = cv.getContext('2d');
      drawTicketGlyph(g, color, cv.width, cv.height);
    });
  }

  // One capture-phase key handler for whatever screen is up: arrows move focus, Enter/Space
  // activate, digits pick a draft card, S skips. Runs before main's handler and swallows the
  // keys it uses so movement/pause don't leak through (input floor: keyboard-only, focus-visible).
  function screenKeyHandler(e) {
    const code = e.code || e.key;
    const alreadyHeld = heldScreenKeys.has(code);
    heldScreenKeys.add(code);
    if (!screenVisible) return;
    const focusables = [...screen.querySelectorAll('button, .card')];
    if (!focusables.length) return;
    const idx = focusables.indexOf(document.activeElement);
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { stop(); focusables[(Math.max(0, idx) + 1) % focusables.length].focus(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { stop(); focusables[(idx <= 0 ? focusables.length - 1 : idx - 1)].focus(); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      stop();
      if (!screenPressGate.keyDown(code, !!e.repeat || alreadyHeld)) return;
      if (screen.contains(document.activeElement)) document.activeElement.click();
      return;
    }
    if (e.key === 'Escape') { stop(); return; } // screens resolve by explicit choice — no pause-over
    if (screenKind === 'draft') {
      if (/^[1-9]$/.test(e.key)) {
        const c = screen.querySelector(`.card[data-i="${parseInt(e.key, 10) - 1}"]`);
        if (c) { stop(); if (screenPressGate.keyDown(code, !!e.repeat || alreadyHeld)) c.click(); }
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        const sk = screen.querySelector('#cap-skip');
        if (sk) { stop(); if (screenPressGate.keyDown(code, !!e.repeat || alreadyHeld)) sk.click(); }
      }
    }
  }
  function screenKeyUpHandler(e) {
    const code = e.code || e.key;
    const carriedIntoScreen = screenPressGate.isBlocked(code);
    heldScreenKeys.delete(code);
    screenPressGate.keyUp(code);
    // In particular, swallow the keyup half of a Space press that began in
    // gameplay before focus moved to the draft's default card.
    if (screenVisible && carriedIntoScreen && (e.key === 'Enter' || e.key === ' ' || e.key === 's' || e.key === 'S' || /^[1-9]$/.test(e.key))) {
      e.preventDefault(); e.stopPropagation();
    }
  }
  window.addEventListener('keydown', screenKeyHandler, true);
  window.addEventListener('keyup', screenKeyUpHandler, true);

  return {
    menuEl: menu, deathEl: death, screenEl: screen, titleEl: title,
    get pauseVisible() { return pauseVisible; },
    get deathVisible() { return deathVisible; },
    get screenVisible() { return screenVisible; },
    get screenKind() { return screenKind; },
    get titleVisible() { return titleVisible; },
    showPause, hideMenu, showPresetChoice, showDeath, setSphere,
    showTitle, hideTitle, showDraft, showScorecard, showMeta, hideScreen,

    // state: { hp, maxHp, pods, maxPods, parFrac, parWarn, jumpChain, jumpMax, landing, podArrow,
    //   ammo, ammoMax, chain, boss:{hp,hpMax}|null, damaged, hitDir:{x,z}, flashReduce, dead, dt }
    update(state) {
      // Sphere arrival card: holds, then fades — timed off the SIM clock, so a proof
      // capture at a given tick always finds it in the same state.
      if (cardShown && typeof state.sphereElapsed === 'number' && state.sphereElapsed > CARD_HOLD) {
        cardShown = false;
        cardEl.style.opacity = '0';
        hud.classList.remove('card-on');
        setTimeout(() => { if (!cardShown) cardEl.style.display = 'none'; }, CARD_FADE * 1000);
      } else if (cardShown) {
        cardEl.style.display = 'block';
      }

      // HP pips.
      if (pipsEl.childElementCount !== state.maxHp) {
        pipsEl.innerHTML = '';
        for (let i = 0; i < state.maxHp; i++) { const d = document.createElement('div'); d.className = 'pip'; pipsEl.appendChild(d); }
      }
      [...pipsEl.children].forEach((c, i) => c.classList.toggle('empty', i >= state.hp));

      podsEl.textContent = state.pods;
      podMaxEl.textContent = state.maxPods;

      // Par dial fills as par is consumed; pulses past the warn threshold.
      const frac = Math.max(0, Math.min(1, state.parFrac));
      dialEl.style.setProperty('--p', `${frac}turn`);
      dialEl.classList.toggle('warn', !!state.parWarn);
      parEl.textContent = state.parWarn ? 'CLOSING' : 'PAR';

      // Jump-chain indicator (which jump you're on).
      if (chainEl.childElementCount !== state.jumpMax) {
        chainEl.innerHTML = '';
        for (let i = 0; i < state.jumpMax; i++) { const d = document.createElement('div'); d.className = 'j'; chainEl.appendChild(d); }
      }
      [...chainEl.children].forEach((c, i) => c.classList.toggle('on', i < state.jumpChain));

      // Firework ammo (whole charges shown as boxes).
      const ammoMax = state.ammoMax || 0, ammo = Math.floor(state.ammo || 0);
      if (ammoEl.childElementCount !== ammoMax) {
        ammoEl.innerHTML = '';
        for (let i = 0; i < ammoMax; i++) { const d = document.createElement('div'); d.className = 'fwbox'; ammoEl.appendChild(d); }
      }
      [...ammoEl.children].forEach((c, i) => c.classList.toggle('empty', i >= ammo));

      // Stomp-chain counter — appears only while a chain is live (skill-ceiling feedback).
      if (state.chain > 1) { chainCountEl.style.display = 'block'; chainCountEl.textContent = `×${state.chain} CHAIN`; }
      else chainCountEl.style.display = 'none';

      // Boss HP bar — only while a boss is present (act gate).
      if (state.boss) { bossEl.style.display = 'block'; bossFillEl.style.width = `${Math.max(0, 100 * state.boss.hp / state.boss.hpMax)}%`; }
      else bossEl.style.display = 'none';

      // Directional damage rim flash from the threat direction (M3). Photosensitivity policy:
      // a hard flash by default, but a slower fade (never faster than ~3/sec) when Reduce
      // flashing is on. The rim gradient points from the hit direction (hitDir = where it came from).
      if (state.damaged) {
        const d = state.hitDir || { x: 0, z: 0 };
        // Map world XZ to a screen side: -Z is "ahead" (top), +X is right.
        const ang = Math.atan2(d.x, -d.z); // 0 = top, +right
        const gx = 50 + Math.sin(ang) * 50, gy = 50 - Math.cos(ang) * 50;
        rimEl.style.background = `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,40,40,0.55), rgba(255,40,40,0) 55%)`;
        rimEl.classList.toggle('soft', !!state.flashReduce);
        rimEl.classList.toggle('flash', !state.flashReduce);
        rimEl.classList.add('on');
        rimTimer = state.flashReduce ? 0.5 : 0.16; // soft holds longer but fades gently (≤3/sec)
      } else if (rimTimer > 0) {
        rimTimer -= (state.dt || 0.016);
        if (rimTimer <= 0) rimEl.classList.remove('on');
      }

      // Drafted-caprice chips (the run's build, bottom-left). Rebuilt only when it changes.
      if (state.caprices) {
        const sig = state.caprices.join('|');
        if (capsEl.dataset.sig !== sig) {
          capsEl.dataset.sig = sig;
          capsEl.innerHTML = state.caprices.map((n) => `<span class="cap">${esc(n)}</span>`).join('');
        }
      }

      // Landing edge-arrow when the predicted landing is off-screen (law #2), and the
      // nearest-uncollected-pod edge-arrow (wayfinding fold) — a distinct channel/colour.
      placeEdgeArrow(arrowEl, state.landing, 0.42, true);   // rotates the ▲ toward the point
      placeEdgeArrow(podArrowEl, state.podArrow, 0.38, false); // ◆ marker, no rotation
    },
  };
}
