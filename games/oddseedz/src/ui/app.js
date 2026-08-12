// The shell: a summon bar, the cozy canvas scene with the living pet, a stat
// card, and — new at M2 — the WEEK PLANNER: a thinning action budget the player
// spends on drills/rest/play, with the resulting stat and vital changes PREVIEWED
// before the week is confirmed. Browser-only (DOM + canvas); the deterministic
// engine underneath is what the tests cover.

import { summon, STAT_KEYS, STAT_LABELS, renameCreature, NAME_MAX } from '../engine/summon.js';
import { newGame, newGameFromEgg, saveGame, loadGame } from '../engine/save.js';
// drawCreature is still the albedo renderer for the codex grid and the printed
// certificate (both flat surfaces by design); the lit surfaces reach it through
// render/lit-creature.js instead.
import { drawCreature, vfxForCreature } from '../render/creature.js';
import { SPECIES, SPECIES_BY_RARITY, RARITIES, affinityOf } from '../data/roster.js';
import { moodOf } from '../engine/mood.js';
import {
  interact,
  buyToy,
  ownsToy,
  SNACKS,
  TOYS,
  SNACK_COST,
  SNACK_BY_ID,
  TOY_BY_ID,
} from '../engine/care.js';
import {
  resolveWeek,
  weekBudget,
  lifeStage,
  ACTIONS,
  DRILL_IDS,
  BOND_MAX,
  STRESS_MAX,
  FATIGUE_MAX,
  STAT_CAP,
  LIFESPAN_WEEKS,
} from '../engine/raise.js';
import {
  MOVES,
  MOVE_IDS,
  startBattle,
  stepBattle,
  makeOpponent,
  settleBattle,
  canUse,
  obedienceChance,
  battleIntro,
} from '../engine/battle.js';
import {
  resolveEntry,
  payEntry,
  recordBout,
  advanceCalendar,
  winsToPromote,
  weeksToMandatory,
  isMandatoryDue,
  isTopRank,
} from '../engine/career.js';
import {
  isRetirementDue,
  retireCreature,
  breedEgg,
  freshBaseline,
  inheritedDeltas,
} from '../engine/lineage.js';
import { mountBtObserver } from './bmptext.js';
import { drawText, measure } from '../render/font.js';
import { PALETTE } from '../render/palette.js';
import {
  loadSettings,
  saveSettings,
  shouldReduceMotion,
  MOTION_MODES,
} from '../engine/settings.js';
// Named imports (not `import * as audio`, and NOT aliased) so the single-file
// build resolves them: it strips import lines and flattens every module into one
// scope, so an imported name must match its export name exactly. The audio
// exports are already uniquely named (playSfx/setSfxMuted/isSfxMuted).
import { playSfx, setSfxMuted, isSfxMuted } from './audio.js';
import { encodeSave, decodeSave } from '../engine/saveio.js';
import { certificateSpec, certificateFilename } from '../render/certificate.js';
import { meterCells } from '../render/meter.js';
import { createDebugLog } from '../engine/debuglog.js';
import { summonAllowed } from './battle-gate.js';
import { battleTellView } from './battle-tell.js';
import { LitStage } from '../render/lit-stage.js';
import {
  toyRoomLayout, toyRoomLights, drawToyRoom, drawHandCursor, drawCareHearts,
  tournamentLayout, tournamentLights, drawTournament, drawImpactFlash,
  meadowLayout, meadowLights, drawMeadow,
} from '../render/scene.js';
import { drawLitCreature, drawLitVfx, fitScale, crowdDescriptor } from '../render/lit-creature.js';

// ---- the two operator-approved leans, both reversible by one flag ----------
//
// LEAN A: the pointer becomes an IN-WORLD HAND you reach into the room with, as
// it appears in the ratified PoC frame — the Oddballz register. Set false and
// the system cursor comes back and the hand is never drawn; nothing else changes.
const HAND_CURSOR = true;
// LEAN B: the tournament stands are filled with the player's OWN Memory Meadow
// retirees — each seat takes its silhouette from a retiree's archetype and its
// eyeshine from that retiree's hue, so the line you retired comes to watch. Set
// false and the crowd is generated procedurally as in the PoC. Nothing about the
// bout changes either way; this is the crowd's identity only.
const CROWD_FROM_MEADOW = true;

const RARITY_COLORS = {
  common: '#9aa4b2',
  uncommon: '#4fbf6b',
  rare: '#3f8cff',
  epic: '#b061ff',
  legendary: '#ffb020',
};

const SEED_SUGGESTIONS = [
  'moonlit tuesday',
  "grandma's attic",
  'a very good dog',
  'thunder & fizz',
  'the last cookie',
];

// Action buttons, in the order the player reads them: the five drills, then the
// two sinks (rest, play). glyphs come from the engine's ACTIONS table.
const ACTION_ORDER = [...DRILL_IDS, 'rest', 'play'];

const el = (id) => document.getElementById(id);

let state = null; // full game state (creature + estate), or null before first summon
let plan = []; // queued action ids for the week being planned
const debuglog = createDebugLog({ version: '0.1.0' });
let settingsErrorBadge = false; // true when the flight recorder has captured an error
let preview = null; // resolveWeek(state, plan) — the honest before/after
let reaction = null; // last toy-room reaction { effect, t0 } fed to the renderer
let stageEl, canvas, ctx, dpr;
// pointer state for direct-manipulation care: a tap = pet, a drag = scoop up.
let press = null; // { x0, y0, moved } while the pointer is down on the pet
const drag = { active: false, x: 0, y: 0 };
// where the pointer is over the stage, in CSS px — LEAN A draws the hand there
const hover = { on: false, x: 0, y: 0 };
// The lit surfaces. Each owns a native-res buffer and a baked static scene; see
// src/render/lit-stage.js. Created lazily so a headless import never touches DOM.
let sceneStage = null;

// ---- tournament battle state (M4) ------------------------------------------
let battle = null; // active battle state from startBattle, or null when not in a bout
let battleFoe = null; // the opponent creature (for the arena renderer)
let battleSettled = false; // has the finished battle's prize been folded back in
let lastOutcome = null; // {forfeit,won,reward,promoted,newRank} of the just-settled bout, for the close toast
let battleRank = 'E'; // the rung this bout is being fought at (M5 ladder)
let arenaCtx = null, arenaCanvas = null, arenaStage = null;
// hit-feedback: which side lunged/shook this exchange and when it started, plus
// per-side affinity VFX bursts (M7) spawned on the opponent when a hit lands.
const arenaFx = { pT0: -1, fT0: -1, shakeT0: -1, shakeSide: null, pVfx: null, fVfx: null, koT0: -1 };
// the Buddies codex (M7): a browsable, live-animated grid of all 70 species
let codexCanvas = null, codexCtx = null, codexFilter = 'all', codexList = [];
let titleStage = null; // the splash diorama's lit stage

// ---- Memory Meadow + inheritance state (M6) --------------------------------
let meadowCtx = null, meadowCanvas = null, meadowStage = null; // the frolicking-retirees canvas in the overlay
let inheritSel = []; // retiree ids chosen as parents (max 2)
let inheritSalt = 0; // re-roll knob: same parents, a distinct heir per salt
let retireArmed = false; // early-retire (M12) two-step confirm: armed after first click
// A calm, at-peace face for retirees frolicking in the Meadow (they have no live
// vitals; retirement is graduation, so they read content, not neglected).
const MEADOW_MOOD = { id: 'content', mouth: 'smile', eyes: 'open', brow: 0, bounce: 1 };
const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

const creatureOf = () => (state ? state.creature : null);

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

// App-relative clock, the same base the render loop feeds drawCreature — so a
// reaction stamped now animates correctly against the loop's t.
const appNow = () => nowMs() - t0;

// --- accessibility settings (M8 reduced-motion; M10 full panel) --------------
// The always-on ambient idle bob freezes to a calm held mid-pose whenever motion
// is reduced, so nothing oscillates continuously. Triggered, transient battle
// feedback (attack/hit/KO poses) stays — it is essential, not decorative. M8
// honored the OS pref; M10 adds the in-app panel: `settings.motion` is
// 'auto' (follow OS), 'full', or 'reduced', and shouldReduceMotion() resolves
// the three-way against the live OS query. `reduceMotion`/flashes are re-derived
// by applySettings(). Exposed on window so a smoke test can read them.
const RM_QUERY = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let settings = { sound: true, motion: 'auto', flashes: true };
let osReduced = !!(RM_QUERY && RM_QUERY.matches);
let reduceMotion = osReduced;
let flashesOn = true;

// Re-derive every live-applied setting and push mute into the audio player.
function applySettings() {
  reduceMotion = shouldReduceMotion(settings, osReduced);
  flashesOn = settings.flashes;
  setSfxMuted(!settings.sound);
}

if (RM_QUERY) {
  const onChange = (e) => { osReduced = e.matches; applySettings(); };
  if (RM_QUERY.addEventListener) RM_QUERY.addEventListener('change', onChange);
  else if (RM_QUERY.addListener) RM_QUERY.addListener(onChange); // older engines
}
// Debug affordances (the spec's "debug skip") are opt-in via ?debug in the URL,
// so they never clutter a normal play session.
const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search || '');

// A pleasant held frame (not t=0, which can read as a flat startup pose).
const AMBIENT_STILL_T = 900;
function ambientTime() { return reduceMotion ? AMBIENT_STILL_T : (nowMs() - t0); }
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__oddseedzReduceMotion', { get: () => reduceMotion });
  Object.defineProperty(window, '__oddseedzFlashes', { get: () => flashesOn });
  Object.defineProperty(window, '__oddseedzMuted', { get: () => isSfxMuted() });
}

// Play a creature-voiced sound for the active pet (its archetype + seed give the
// voice). No-op when muted or when there is no pet. `arch`/`seed` can be passed
// for a specific creature (e.g. the battle foe).
function sfx(event, arch, seed) {
  const c = creatureOf();
  const a = arch || (c && c.species && c.species.archetype) || 'ui';
  const s = seed != null ? seed : (c && c.seed) || 0;
  playSfx(a, event, s);
}

// Bitmap text straight onto a canvas (the stage / codex draw their own labels).
function btCentered(context, str, cx, y, scale, color) {
  const w = measure(str, { scale }).width;
  drawText(context, str, Math.round(cx - w / 2), Math.round(y), { scale, color });
}
function btFit(context, str, cx, y, maxW, color, maxScale) {
  let scale = maxScale;
  while (scale > 1 && measure(str, { scale }).width > maxW) scale--;
  btCentered(context, str, cx, y, scale, color);
}

function resize() {
  dpr = 1; // the lit stage owns its own resolution; nothing else scales by dpr
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  if (!sceneStage) sceneStage = new LitStage(canvas, 230);
  sceneStage.sync(w, h);
}

// A resize re-allocates the buffer and throws the baked room away, and a re-bake
// costs tens of milliseconds. Dragging a window edge would fire that on every
// pixel, so the handler waits for the drag to settle before paying for a room.
let resizeTimer = 0;
function resizeSoon() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { resizeTimer = 0; resize(); sizeMeadow(); }, 120);
}

// The toy room, lit. The static room bakes once per size; each frame restores
// those bytes and paints only what moves: the pet, the hand, the care beat.
function drawScene(t) {
  if (!sceneStage) return;
  if (!sceneStage.p) sceneStage.sync(stageEl.clientWidth, stageEl.clientHeight);
  const st = sceneStage;
  if (!st.p) return;
  const w = st.w, h = st.h;
  const creature = creatureOf();
  const meadow = (state && state.estate && state.estate.meadow) || [];
  // Between generations there is no pet in the room, and the Meadow is what the
  // player is looking at — so the stage becomes the Meadow itself.
  const asMeadow = !creature && meadow.length > 0;
  const L = asMeadow ? meadowLayout(w, h) : toyRoomLayout(w, h);
  const lights = asMeadow ? meadowLights(L) : toyRoomLights(L);
  st.bake(`${asMeadow ? 'meadow' : 'room'}:${w}x${h}`,
    (p) => (asMeadow ? drawMeadow(p, L) : drawToyRoom(p, L)));
  const p = st.begin();
  if (!p) return;

  const cssW = stageEl.clientWidth || 1, cssH = stageEl.clientHeight || 1;

  if (creature) {
    // Stand the pet ON the floor rather than floating it at the frame's centre,
    // and pick the scale from its own measured footprint so no species clips its
    // window (the M12 guarantee, kept).
    const headroom = L.pet.ground - Math.round(h * 0.06);
    const sc = fitScale(creature, h * 0.46, w * 0.42, headroom, 1.1);
    let px = L.pet.x, py = L.pet.ground;
    if (drag.active) {
      const b = st.toBuffer(drag.x, drag.y, cssW, cssH);
      px = b.x;
      py = Math.min(h - 2, b.y + (h - L.pet.ground) * 0.5);
    }
    drawLitCreature(p, creature, t, {
      x: px,
      ground: py,
      scale: sc,
      lights,
      amb: 0.17,
      mood: moodOf(creature), // face keyed to how the pet feels right now
      reaction, // one-shot interaction feedback (hearts / ! / puff)
      rim: lights[0],
      rimAmt: 0.42, // the lamp hangs directly overhead: the pet gets a warm crown, dialed back 2026-08-10 (pass 2)
      seed: creature.seed ?? 3,
      shadowAmt: 0.5,
      shadowCol: '#170d05',
      cast: { len: Math.round(-34 * L.u), drop: Math.round(-9 * L.u), amt: 0.32, col: '#160c04' },
    });
  } else if (asMeadow) {
    drawLitMeadowInto(p, L, lights, meadow, t);
  }

  // LEAN A: the hand you reach into the room with, at the pointer.
  if (HAND_CURSOR && hover.on && creature) {
    const b = st.toBuffer(hover.x, hover.y, cssW, cssH);
    // A cursor has to read as a HAND at a glance, so it runs a little larger
    // than the room's own size unit would give it.
    const hu = L.u * 1.35;
    drawHandCursor(p, b.x, b.y, lights, hu, { contact: !!press });
    if (press) drawCareHearts(p, b.x + 16 * hu, b.y - 6 * hu, hu, 0.9);
  }

  // The prompts now sit on a navy plaque painted INTO the scene, so they read
  // over a lit room instead of landing white-on-beige across the wainscot
  // (navy panel + warm-white text is legal pair 1).
  const lines = creature ? null
    : (asMeadow ? ['THE MEMORY MEADOW', 'your retired line frolics here']
      : ['TYPE A PHRASE, THEN SUMMON']);
  let plaque = null;
  if (lines) {
    const wid = Math.max(...lines.map((s) => measure(s, { scale: 1 }).width));
    const hgt = lines.length * 10 + 6;
    plaque = {
      x: Math.round(w * 0.5 - wid / 2) - 6,
      y: asMeadow ? Math.round(h * 0.06) : Math.round(h * 0.46),
      w: wid + 12,
      h: hgt,
      lines,
    };
    p.frect(plaque.x + 1, plaque.y + 1, plaque.w, plaque.h, '#000000', 0.34);
    p.frect(plaque.x, plaque.y, plaque.w, plaque.h, '#141E42', 0.90);
    p.rect(plaque.x, plaque.y, plaque.w, plaque.h, '#1E2A4A', 0.95);
    p.hline(plaque.x, plaque.x + plaque.w - 1, plaque.y, '#3A50A0', 0.7);
  }

  st.present();

  // the bitmap font draws straight to the canvas, at buffer scale, once the
  // scene bytes have landed
  if (plaque) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < plaque.lines.length; i++) {
      btCentered(ctx, plaque.lines[i], w * 0.5, plaque.y + 4 + i * 10, 1, PALETTE.navyText);
    }
  }
}

// Lay a row of retirees along a ground line, each bobbing on its own phase, lit
// by the Meadow's moon. Shared by the main stage (between generations) and the
// Meadow overlay. Pure painting — reads nothing but its arguments.
function drawLitMeadowInto(p, L, lights, meadow, t) {
  const list = meadow.slice(-8);
  if (!list.length) return;
  for (let i = 0; i < list.length; i++) {
    const frac = list.length === 1 ? 0.5 : 0.12 + (0.76 * i) / (list.length - 1);
    // Stand them in the FRONT half of the field: parked on the horizon they read
    // as distant specks rather than as the line that lives here.
    const ground = Math.round(L.horizon + (L.ground - L.horizon) * (0.62 + (i % 3) * 0.16));
    const sc = fitScale(list[i], L.h * 0.30, (L.w / Math.max(2, list.length)) * 0.9, L.h * 0.5, 0.7);
    const wander = Math.sin(t / 1400 + i * 1.7) * 6;
    drawLitCreature(p, list[i], t + i * 320, {
      x: Math.round(L.w * frac + wander),
      ground,
      scale: sc,
      lights,
      amb: 0.20,
      mood: MEADOW_MOOD,
      rim: lights[0],
      rimAmt: 0.40,
      seed: list[i].seed ?? i,
      shadowAmt: 0.34,
      shadowCol: '#0b1408',
    });
  }
}

function loop() {
  drawScene(ambientTime());
  requestAnimationFrame(loop);
}

// ---- stat card (aside) ------------------------------------------------------

// A segmented discrete meter (directive item 5): `cells` cells, 1px gaps. Cell
// states come from the pure meterCells() (tested in test/meter.test.js); here we
// only turn them into markup.
function segMeter(cur, delta, cells, cap) {
  return meterCells(cur, delta, cells, cap)
    .map((s) => (s ? `<i class="${s}"></i>` : '<i></i>'))
    .join('');
}

function statBar(key, cur, delta) {
  let deltaCell = '<span class="stat-delta"></span>';
  if (delta) {
    const dir = delta > 0 ? '' : 'down';
    deltaCell = `<span class="stat-delta ${dir}">${delta > 0 ? '▲+' + delta : '▼' + delta}</span>`;
  }
  return `
    <div class="stat">
      <span class="stat-label">${STAT_LABELS[key]}</span>
      <span class="meter">${segMeter(cur, delta, 12, STAT_CAP)}</span>
      <span class="stat-num">${cur}</span>
      ${deltaCell}
    </div>`;
}

function vitalRow(label, cur, delta) {
  let d = '';
  if (delta) {
    const dir = delta > 0 ? '' : 'down';
    d = `<span class="d ${dir}">${delta > 0 ? '+' + delta : delta}</span>`;
  }
  return `
    <div class="vital">
      <span class="vital-label">${label}</span>
      <span class="meter">${segMeter(cur, delta, 10, 100)}</span>
      <span class="vital-val">${Math.round(cur)}${d}</span>
    </div>`;
}

function renderCard() {
  const card = el('card');
  // Preserve the scroll position across a re-render of the SAME pet (a care tap or
  // a plan edit rebuilds innerHTML, which would otherwise yank you back to the top
  // mid-read). A new pet/state re-anchors to the top.
  const prevScroll = card.scrollTop;
  const prevSeed = card._petSeed;
  const c = creatureOf();
  if (!c) {
    card._petSeed = null;
    card.scrollTop = 0;
    const meadow = (state && state.estate && state.estate.meadow) || [];
    if (meadow.length) {
      // Between generations: the last pet has retired and no heir has hatched. The
      // estate (money, toys, the whole Meadow bloodline) persists — the player now
      // breeds the next generation from the Meadow, or summons a fresh line.
      card.innerHTML = `
        <div class="between">
          <h2 class="between-h">The Meadow keeps your line</h2>
          <p class="between-sub">${meadow.length} retiree${meadow.length > 1 ? 's' : ''} at peace. Their record lives on - breed the next heir from them.</p>
          <button id="to-inherit" class="between-cta">🥚 Begin the next generation</button>
          <p class="between-note">or type a new phrase above to start a fresh line.</p>
        </div>`;
      const inh = el('to-inherit');
      if (inh) inh.addEventListener('click', openMeadow);
      return;
    }
    card.innerHTML = '<p class="empty">No creature yet. Summon one to begin.</p>';
    return;
  }
  const col = RARITY_COLORS[c.rarity];
  const sd = preview ? preview.deltas.stats : {};
  const vd = preview ? preview.deltas : {};
  const mood = moodOf(c);
  card.innerHTML = `
    <div class="card-head">
      <div>
        <h2 class="pet-name"><span class="pet-name-text">${escapeHtml(c.name)}</span><button class="rename-btn" id="rename-pet" title="Rename ${escapeHtml(c.name)}" aria-label="rename your pet">edit</button></h2>
        <p class="pet-species">${escapeHtml(c.species.name)} &middot; ${escapeHtml(c.temperament)}</p>
        <p class="pet-mood mood-${mood.id}">feeling ${mood.label}</p>
      </div>
      <span class="rarity" style="border-color:${col}">${c.rarity}</span>
    </div>
    ${lineageRibbon(c)}
    <div class="stats">${STAT_KEYS.map((k) => statBar(k, c.stats[k], sd[k] || 0)).join('')}</div>
    <hr class="card-sep" />
    <div class="vitals">
      ${vitalRow('Bond', c.bond, vd.bond || 0)}
      ${vitalRow('Stress', c.stress, vd.stress || 0)}
      ${vitalRow('Fatigue', c.fatigue, vd.fatigue || 0)}
    </div>
    ${renderRoom(c)}
    ${renderCareer(c)}
    <p class="from">${fromLine(c)}</p>`;

  wireRoom(card);
  const ring = el('to-ring');
  if (ring) ring.addEventListener('click', openBattle);
  const retire = el('to-retire');
  if (retire) retire.addEventListener('click', doRetire);
  const retireEarly = el('to-retire-early');
  if (retireEarly) retireEarly.addEventListener('click', () => { retireArmed = true; renderCard(); });
  const retireYes = el('retire-yes');
  if (retireYes) retireYes.addEventListener('click', doRetire);
  const retireNo = el('retire-no');
  if (retireNo) retireNo.addEventListener('click', () => { retireArmed = false; renderCard(); });
  const meadow = el('to-meadow');
  if (meadow) meadow.addEventListener('click', openMeadow);
  const cert = el('to-cert');
  if (cert) cert.addEventListener('click', () => downloadCertificate(creatureOf(), state && state.estate));
  const rename = el('rename-pet');
  if (rename) rename.addEventListener('click', beginRename);

  // Re-anchor: same pet keeps your scroll place; a new pet starts at the top.
  card._petSeed = c.seed;
  card.scrollTop = prevSeed === c.seed ? prevScroll : 0;
}

// Click-to-edit rename: swap the name for an inline input, commit on Enter/blur,
// cancel on Escape. Keeps the estate in sync and re-renders the card.
function beginRename() {
  const head = document.querySelector('.pet-name');
  const c = creatureOf();
  if (!head || !c) return;
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = c.name;
  input.maxLength = NAME_MAX;
  input.setAttribute('aria-label', 'new name for your pet');
  head.replaceChildren(input);
  input.focus();
  input.select();
  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    if (save) {
      const renamed = renameCreature(c, input.value);
      if (renamed.name !== c.name) {
        state = { ...state, creature: renamed };
        persist();
        toast(`Renamed to ${renamed.name}.`);
      }
    }
    renderCard();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  });
  input.addEventListener('blur', () => commit(true));
}

// The heir's lineage, shown right under its name: the boosted-stat inheritance
// and a row of parent/rank badges, each carrying a hover tooltip that names the
// bloodline. This is the visible answer to "where did this pet come from?".
function lineageRibbon(c) {
  const lin = c.lineage;
  if (!lin) return '';
  const parentNames = (lin.parents || []).map((p) => `${p.name} (${p.species})`).join(' & ');
  const boostLabels = (lin.boosted || []).map((k) => STAT_LABELS[k]).join(' & ');
  const boostLine = boostLabels
    ? `<span class="lin-boost" title="inherited head-start on ${escapeHtml(boostLabels)}">inherited ${escapeHtml(boostLabels)}</span>`
    : '';
  const badges = (lin.badges || [])
    .map((b) => `<span class="lin-badge" title="lineage: ${escapeHtml(parentNames)}">${escapeHtml(b)}</span>`)
    .join('');
  return `
    <div class="lineage" title="heir of ${escapeHtml(parentNames)}">
      <span class="lin-head">🧬 heir of ${escapeHtml(parentNames)}</span>
      <div class="lin-badges">${boostLine}${badges}</div>
    </div>`;
}

// ---- career: the rank ladder + mandatory meets (M5) -------------------------
// One screen carries the whole career state the milestone asks for: rank, money,
// age/stage, the next mandatory meet, and a scrolling battle/prize log. The
// "Enter bout" button routes through resolveEntry, so it always offers a legal,
// affordable rung — the free E rung when broke, the sponsored meet when due.
function renderCareer(c) {
  const estate = state.estate || {};
  const career = estate.career || { rank: 'E', rankWins: 0, log: [] };
  const rec = estate.record || { wins: 0, losses: 0 };
  const stage = lifeStage(c.age);
  const due = isMandatoryDue(estate, c.age);
  const entry = resolveEntry(estate, c.age);

  const toPromote = winsToPromote(career);
  const promoteLine = isTopRank(career.rank)
    ? 'Top rung reached'
    : `${toPromote} win${toPromote === 1 ? '' : 's'} to ${nextRankLabel(career.rank)}`;

  const wtm = weeksToMandatory(career, c.age);
  const meetLine = due
    ? '<b class="meet-due">MEET DUE NOW</b>'
    : `week ${career.nextMandatory} (${wtm} to go)`;

  const feeLabel = entry.fee > 0 ? `pay ${entry.fee} 💰` : entry.waived ? 'free meet' : 'free';
  const btnLabel = due
    ? `Compete in the ${entry.rank}-rank meet`
    : `Enter ${entry.rank}-rank bout`;

  const log = (career.log || []).slice(-6).reverse();
  const logHtml = log.length
    ? log.map((e) => `<li class="log-${e.kind}">${escapeHtml(e.text)}</li>`).join('')
    : '<li class="log-empty">No bouts yet.</li>';

  // Retirement: nudged once the pet has lived out its lifespan (twilight) — that
  // button retires directly, since retirement is already due (week-30 flow, kept
  // unchanged). M12 also offers EARLY retirement once the pet is grown (Adult:
  // prime or elder), behind a two-step confirm so it is never a stray click.
  const retireDue = isRetirementDue(c);
  const adult = stage.key === 'prime' || stage.key === 'elder';
  let retireBtn = '';
  if (retireDue) {
    retireBtn = `<button id="to-retire" class="to-retire">🌿 Retire ${escapeHtml(c.name)} to the Meadow</button>`;
  } else if (adult) {
    retireBtn = retireArmed
      ? `<div class="retire-confirm" role="group">
           <span class="retire-warn">Retire ${escapeHtml(c.name)} now, before its time? This ends its career and sends it to the Meadow for good.</span>
           <div class="retire-confirm-row">
             <button id="retire-yes" class="to-retire danger">Confirm early retirement</button>
             <button id="retire-no" class="retire-cancel">Keep raising</button>
           </div>
         </div>`
      : `<button id="to-retire-early" class="to-retire early">🌿 Retire early to the Meadow</button>`;
  }
  const meadow = estate.meadow || [];
  const meadowBtn = meadow.length
    ? `<button id="to-meadow" class="to-meadow">🌼 Memory Meadow (${meadow.length})</button>`
    : '';

  return `
    <hr class="card-sep" />
    <div class="career">
      <div class="career-head">
        <h3 class="room-h">Career</h3>
        <span class="rank-chip rank-${career.rank}">${career.rank} rank</span>
      </div>
      <div class="career-grid">
        <span class="ck">Money</span><span class="cv">💰 ${estate.money}</span>
        <span class="ck">Age</span><span class="cv">week ${c.age} &middot; ${stage.label}</span>
        <span class="ck">Next meet</span><span class="cv">${meetLine}</span>
        <span class="ck">Record</span><span class="cv"><b>${rec.wins}</b>W &middot; <b>${rec.losses}</b>L &middot; ${escapeHtml(promoteLine)}</span>
      </div>
      <button id="to-ring" class="to-ring${due ? ' meet' : ''}"><span class="g">⚔️</span> ${btnLabel} <span class="fee">(${feeLabel})</span></button>
      ${retireBtn}
      ${meadowBtn}
      <button id="to-cert" class="to-cert" title="download a keepsake certificate PNG">Certificate</button>
      <ol class="career-log">${logHtml}</ol>
    </div>`;
}

function nextRankLabel(rank) {
  const order = ['E', 'D', 'C'];
  const i = order.indexOf(rank);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : rank;
}

// ---- toy room (care console inside the card) --------------------------------
// The interactive care layer: pet/poke, a snack pantry with discovered likes,
// and a toybox. This is the moment-to-moment bonding; the week planner below is
// the macro loop. Snacks cost money and toys are bought once, so care and
// training pull on the same purse.
function renderRoom(c) {
  const money = state.estate.money;
  const estate = state.estate;
  const tastes = c.tastes || { favorite: null, disliked: null, tried: [] };

  const snacks = SNACKS.map((s) => {
    const fav = tastes.favorite === s.id;
    const dis = tastes.disliked === s.id;
    const mark = fav ? ' <span class="fav">♥</span>' : dis ? ' <span class="dis">✕</span>' : '';
    const afford = money >= SNACK_COST;
    return `<button class="snack${fav ? ' is-fav' : dis ? ' is-dis' : ''}" data-snack="${s.id}" ${afford ? '' : 'disabled'} title="feed &middot; costs ${SNACK_COST}"><span class="g">${s.glyph}</span>${s.label}${mark}</button>`;
  }).join('');

  const toys = TOYS.map((t) => {
    if (ownsToy(estate, t.id)) {
      return `<button class="toy owned" data-toy="${t.id}" title="play"><span class="g">${t.glyph}</span>${t.label}</button>`;
    }
    const afford = money >= t.cost;
    return `<button class="toy buy" data-buytoy="${t.id}" ${afford ? '' : 'disabled'} title="buy &middot; costs ${t.cost}"><span class="g">${t.glyph}</span>Buy ${t.label} &middot; ${t.cost}</button>`;
  }).join('');

  const learned = [];
  if (tastes.favorite) learned.push(`loves ${SNACK_BY_ID[tastes.favorite].glyph}`);
  if (tastes.disliked) learned.push(`dislikes ${SNACK_BY_ID[tastes.disliked].glyph}`);
  const tasteLine = learned.length
    ? `<p class="taste-note">${learned.join(' &middot; ')}</p>`
    : `<p class="taste-note dim">feed snacks to learn what it likes</p>`;

  return `
    <hr class="card-sep" />
    <div class="room">
      <h3 class="room-h">Toy room</h3>
      <div class="care-row">
        <button class="care-act" data-do="pet"><span class="g">✋</span>Pet</button>
        <button class="care-act" data-do="poke"><span class="g">👉</span>Poke</button>
        <span class="care-hint">or tap the pet, or drag it around</span>
      </div>
      <div class="tray-label">Snacks <span class="dim">(${money >= SNACK_COST ? SNACK_COST + ' each' : 'need money'})</span></div>
      <div class="tray snacks">${snacks}</div>
      ${tasteLine}
      <div class="tray-label">Toybox</div>
      <div class="tray toys">${toys}</div>
    </div>`;
}

function wireRoom(card) {
  card.querySelectorAll('[data-do]').forEach((b) =>
    b.addEventListener('click', () => doInteract({ type: b.dataset.do })));
  card.querySelectorAll('[data-snack]').forEach((b) =>
    b.addEventListener('click', () => doInteract({ type: 'snack', id: b.dataset.snack })));
  card.querySelectorAll('[data-toy]').forEach((b) =>
    b.addEventListener('click', () => doInteract({ type: 'toy', id: b.dataset.toy })));
  card.querySelectorAll('[data-buytoy]').forEach((b) =>
    b.addEventListener('click', () => doBuyToy(b.dataset.buytoy)));
}

// Apply a room interaction: commit the vitals, stamp a reaction for the
// renderer, persist, and answer in-world with a toast.
function doInteract(action) {
  if (!creatureOf()) return;
  const res = interact(state, action);
  const r = res.reaction;
  if (r.effect === 'blocked') {
    toast(r.note);
    return;
  }
  state = { ...state, creature: res.creature, estate: res.estate };
  // A newly revealed taste is a discovery MOMENT — celebrate it distinctly (and
  // punch the reaction) instead of burying it in the same note as a plain nibble.
  const disc = r.discovery;
  reaction = { effect: disc ? (disc.kind === 'favorite' ? 'delight' : 'dislike') : r.effect, t0: appNow() };
  // A little voiced squeak keyed to the kind of care: a coo for petting, a nom
  // for a snack, a bounce for a toy.
  sfx(action.type === 'snack' ? 'feed' : action.type === 'toy' ? 'play' : 'pet');
  persist();
  recompute();
  if (disc) {
    const snackLabel = (SNACKS.find((s) => s.id === disc.snack) || {}).label || 'that snack';
    toast(disc.kind === 'favorite'
      ? `Discovery! ${creatureOf().name}'s favorite snack is the ${snackLabel}. ★`
      : `Discovery: ${creatureOf().name} dislikes the ${snackLabel}. Noted.`);
  } else {
    toast(r.note);
  }
}

function doBuyToy(id) {
  const res = buyToy(state, id);
  if (!res.ok) {
    toast(res.reason === 'not enough money' ? 'Not enough money for that toy yet.' : 'Cannot buy that.');
    return;
  }
  state = { ...state, estate: res.estate };
  persist();
  recompute();
  toast(`Bought the ${TOY_BY_ID[id].label}. It is in the toybox now.`);
}

// ---- tournament battle (M4) -------------------------------------------------
// A full-screen bout overlay: both fighters drawn in the arena, HP/stamina bars,
// a command row (the POW/DEF/SPD triangle + a Surge), and a one-sentence log that
// shows whether the pet OBEYED or REFUSED the call, and why. The battle engine is
// pure; this is just its face.

// A bout's seed is derived from the GAME STATE, not the wall clock — so a given
// state always faces the same foe with the same rolls. Combined with settling the
// result the instant a bout ends, this kills the old free-reroll loop (you could
// re-enter for a fresh Date.now() roll until you won). The record advances on
// every win/loss/forfeit, so the next bout differs — no infinite identical retry.
function battleSeed(c, estate, rank) {
  const rec = (estate && estate.record) || { wins: 0, losses: 0 };
  const rankIdx = { E: 0, D: 1, C: 2 }[rank] || 0;
  let s = (c.seed || 0) >>> 0;
  s = (s ^ Math.imul((c.age || 0) + 1, 0x9e3779b1)) >>> 0;
  s = (s ^ Math.imul(rankIdx + 1, 0x85ebca6b)) >>> 0;
  s = (s ^ Math.imul((rec.wins || 0) + 1, 0xc2b2ae35)) >>> 0;
  s = (s + Math.imul((rec.losses || 0) + 1, 0x27d4eb2f)) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0x297a2d39) >>> 0;
  return (s ^ (s >>> 16)) >>> 0;
}

function openBattle() {
  if (battle) return; // a bout is already live — never open (and re-charge) a second
  const c = creatureOf();
  if (!c) { toast('Summon a creature first.'); return; }
  // Route through the ladder: current rung, the free E rung when broke, or the
  // sponsored (free) meet when one is due. Pay the entry fee up front.
  const entry = resolveEntry(state.estate, c.age);
  battleRank = entry.rank;
  if (entry.fee > 0) {
    state = { ...state, estate: payEntry(state.estate, entry.fee) };
    persist();
    toast(`Paid ${entry.fee} 💰 to enter the ${entry.rank}-rank bout.`);
  } else if (entry.reason && entry.reason.startsWith('entry fee - dropped')) {
    toast(`Not enough for the ${state.estate.career.rank}-rank fee - fighting a free E bout to rebuild.`);
  }
  const seed = battleSeed(c, state.estate, battleRank);
  battleFoe = makeOpponent(seed, battleRank);
  battle = startBattle(c, battleFoe, seed);
  // Open the ring on the announcer's call (the pure battle starts logless).
  battle = { ...battle, log: [battleIntro(battle)] };
  debuglog.event('battle_open', { rank: battleRank, foe: battleFoe.name, species: battleFoe.species.name });
  battleSettled = false;
  lastOutcome = null;
  arenaFx.pT0 = arenaFx.fT0 = arenaFx.shakeT0 = arenaFx.koT0 = -1;
  arenaFx.pVfx = arenaFx.fVfx = null;
  buildBattleShell();
  const ov = el('battle');
  ov.hidden = false;
  arenaCanvas = el('arena');
  arenaCtx = arenaCanvas.getContext('2d');
  sizeArena();
  renderBattle();
  arenaLoop();
}

function buildBattleShell() {
  const ov = el('battle');
  const foe = battleFoe;
  const moves = MOVE_IDS.map((id) => {
    const m = MOVES[id];
    const sub = id === 'surge' ? 'unblockable' : `beats ${MOVES[m.beats] ? MOVES[m.beats].label : ''}`;
    return `<button class="move ${id === 'surge' ? 'surge' : ''}" data-move="${id}">
      <span class="g">${m.glyph}</span>${m.label}<span class="beats">${sub}</span></button>`;
  }).join('');
  ov.innerHTML = `
    <div class="battle-panel">
      <div class="battle-top">
        <h2>${battleRank}-RANK BOUT</h2>
        <span class="rank-pill">vs ${escapeHtml(foe.name)} the ${escapeHtml(foe.species.name)}</span>
      </div>
      <div class="battle-arena">
        <canvas id="arena"></canvas>
        <div class="fighter foe">
          <div class="fname">${escapeHtml(foe.name)}</div>
          <div class="fsub">${escapeHtml(foe.temperament)} rival</div>
          <div class="bar hp" data-bar="foe-hp"><span></span></div>
          <div class="barnum" data-num="foe-hp"></div>
        </div>
        <div class="fighter you">
          <div class="fname">${escapeHtml(creatureOf().name)}</div>
          <div class="fsub">${escapeHtml(creatureOf().temperament)}</div>
          <div class="bar hp" data-bar="you-hp"><span></span></div>
          <div class="barnum" data-num="you-hp"></div>
          <div class="bar stam" data-bar="you-stam"><span></span></div>
          <div class="barnum" data-num="you-stam"></div>
        </div>
      </div>
      <div class="obey-row"><div class="obey-badge" data-badge></div></div>
      <div class="battle-tell" data-tell role="status" aria-live="polite"></div>
      <div class="battle-log" data-log></div>
      <div class="battle-cmd" data-cmd>${moves}</div>
      <div class="battle-foot">
        <span class="battle-result" data-result>Call a move - will it heed you?</span>
        <button class="battle-close ghost" data-close>Forfeit &amp; leave</button>
      </div>
    </div>`;
  ov.querySelectorAll('[data-move]').forEach((b) =>
    b.addEventListener('click', () => doMove(b.dataset.move)));
  ov.querySelector('[data-close]').addEventListener('click', onBattleClose);
}

function doMove(moveId) {
  if (!battle || battle.over) return;
  const before = { pHp: battle.player.hp, fHp: battle.foe.hp };
  const { state: next, events } = stepBattle(battle, { move: moveId });
  battle = next;
  // hit feedback: whoever lost HP shakes; the player's card flashes obey/refuse.
  const now = appNow();
  if (battle.foe.hp < before.fHp) { // foe took a hit -> player lunged, player affinity bursts on the foe
    arenaFx.fT0 = now;
    arenaFx.pVfx = { t0: now, ...vfxForCreature(creatureOf()) };
    sfx('act'); // the pet's swing
  }
  if (battle.player.hp < before.pHp) { // player took a hit -> foe lunged, foe affinity bursts on the player
    arenaFx.pT0 = now;
    arenaFx.fVfx = { t0: now, ...vfxForCreature(battleFoe) };
    sfx('hit'); // the pet grunts as it takes the blow
  }
  if (battle.over) arenaFx.koT0 = now;
  const refused = events.some((e) => e.kind === 'refuse');
  const obeyed = events.some((e) => e.kind === 'obey');
  debuglog.event('battle_move', { move: moveId, obeyed, refused, round: battle.round });
  flashObeyBadge(refused ? 'refuse' : obeyed ? 'obey' : null);
  renderBattle();
  if (battle.over) endBattle();
}

function flashObeyBadge(kind) {
  const b = el('battle') && el('battle').querySelector('[data-badge]');
  if (!b) return;
  b.className = 'obey-badge';
  if (!kind) return;
  b.textContent = kind === 'obey' ? 'OBEYED' : 'REFUSED';
  b.classList.add(kind, 'show');
  clearTimeout(flashObeyBadge._t);
  flashObeyBadge._t = setTimeout(() => b.classList.remove('show'), 1400);
}

function barPct(cur, max) { return Math.max(0, Math.min(100, Math.round((cur / max) * 100))); }

function renderBattle() {
  const ov = el('battle');
  if (!ov || ov.hidden || !battle) return;
  const p = battle.player, f = battle.foe;
  const set = (sel, pct) => { const s = ov.querySelector(`[data-bar="${sel}"] span`); if (s) s.style.width = pct + '%'; };
  const num = (sel, txt) => { const n = ov.querySelector(`[data-num="${sel}"]`); if (n) n.textContent = txt; };
  set('foe-hp', barPct(f.hp, f.maxHp));
  set('you-hp', barPct(p.hp, p.maxHp));
  set('you-stam', barPct(p.stam, p.maxStam));
  num('foe-hp', `HP ${f.hp}/${f.maxHp}`);
  num('you-hp', `HP ${p.hp}/${p.maxHp}`);
  num('you-stam', `Stamina ${p.stam}/${p.maxStam}`);
  ov.querySelectorAll('.bar.hp').forEach((el2) => {
    const which = el2.dataset.bar;
    const c = which === 'foe-hp' ? f : p;
    el2.classList.toggle('low', c.hp / c.maxHp <= 0.34);
  });

  const tellEl = ov.querySelector('[data-tell]');
  if (tellEl) {
    const tell = battleTellView(battle.foeIntent, battle.over);
    tellEl.hidden = tell.hidden;
    tellEl.className = tell.className;
    tellEl.textContent = tell.text;
  }

  // log — one line per event, latest highlighted
  const log = ov.querySelector('[data-log]');
  if (log) {
    log.innerHTML = battle.log.map((l, i) =>
      `<div class="logline ${l.kind}${i === battle.log.length - 1 ? ' latest' : ''}">${escapeHtml(l.text)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }

  // Command availability + obedience read-out. Basics stay available even when
  // winded (the engine lands a weakened hit) so a low-stamina pet is never
  // soft-locked into forfeiting; only Surge is hard-gated on stamina/cooldown.
  ov.querySelectorAll('[data-move]').forEach((b) => {
    const id = b.dataset.move;
    b.disabled = battle.over || (id === 'surge' ? !canUse(p, id) : false);
    if (id === 'surge' && p.cooldowns.surge > 0) {
      b.querySelector('.beats').textContent = `cooldown ${p.cooldowns.surge}`;
    } else if (id === 'surge') {
      b.querySelector('.beats').textContent = p.stam < MOVES.surge.stam ? 'low stamina' : 'unblockable';
    } else {
      b.querySelector('.beats').textContent = p.stam < MOVES[id].stam
        ? 'winded'
        : `beats ${MOVES[MOVES[id].beats] ? MOVES[MOVES[id].beats].label : ''}`;
    }
  });

  const result = ov.querySelector('[data-result]');
  if (result) {
    if (battle.over) {
      const won = battle.winner === 'player';
      result.className = 'battle-result ' + (won ? 'win' : 'loss');
      result.textContent = won ? 'Victory!' : 'Defeat.';
    } else {
      const chance = Math.round(obedienceChance(p) * 100);
      result.className = 'battle-result';
      result.textContent = `Obedience ~${chance}% - bond and calm buy it.`;
    }
  }
}

// A finished battle: settle it into the save the INSTANT it ends (so the result
// is locked and persisted — no re-entering to dodge a loss), then swap the button
// to a leave button and log the reward line. The player-facing toast + stage
// celebration fire on close (kept warm), reading the already-banked outcome.
function endBattle() {
  if (!battle || !battle.over) return;
  const won = battle.winner === 'player';
  debuglog.event('battle_end', { rank: battleRank, won, winner: battle.winner });
  sfx(won ? 'win' : 'lose'); // the fanfare or the gentle descent
  settleFinishedBattle();
  const reward = lastOutcome ? lastOutcome.reward : 0;
  const closeBtn = el('battle').querySelector('[data-close]');
  if (closeBtn) {
    closeBtn.className = 'battle-close';
    closeBtn.textContent = won ? `Claim 💰 ${reward} & leave` : `Take 💰 ${reward} & leave`;
  }
  const log = el('battle').querySelector('[data-log]');
  if (log) {
    const line = document.createElement('div');
    line.className = 'logline ko';
    line.textContent = won
      ? `Prize: 💰 ${reward} into the estate.`
      : `Consolation: 💰 ${reward}. Rest up and try again.`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }
}

// Fold a finished bout's prize + record + wear + career into the save exactly
// once. Called at the moment the bout ends, so the outcome is committed before
// the player can react. Records the outcome for the on-close toast/celebration.
function settleFinishedBattle() {
  if (!battle || !battle.over || battleSettled) return;
  const res = settleBattle(battle, creatureOf(), state.estate);
  const rb = recordBout(res.estate.career, {
    rank: battleRank, won: res.won, reward: res.reward.money, week: creatureOf().age,
  });
  state = { ...state, creature: res.creature, estate: { ...res.estate, career: rb.career } };
  battleSettled = true;
  lastOutcome = { forfeit: false, won: res.won, reward: res.reward.money, promoted: rb.promoted, newRank: rb.newRank };
  persist();
  recompute();
}

// Forfeiting a live bout is a REAL outcome, not a free escape: a recorded loss +
// battle wear (stress/fatigue), no prize. This is what closes the free-reroll loop.
function forfeitBattle() {
  if (!battle || battle.over || battleSettled) return;
  const c = creatureOf();
  const worn = {
    ...c,
    stress: Math.min(100, (c.stress || 0) + 14),
    fatigue: Math.min(100, (c.fatigue || 0) + 16),
  };
  const rec = state.estate.record || { wins: 0, losses: 0 };
  const estL = { ...state.estate, record: { wins: rec.wins, losses: rec.losses + 1 } };
  const rb = recordBout(estL.career, { rank: battleRank, won: false, reward: 0, week: c.age });
  state = { ...state, creature: worn, estate: { ...estL, career: rb.career } };
  battleSettled = true;
  lastOutcome = { forfeit: true, won: false, reward: 0 };
  persist();
  recompute();
}

function onBattleClose() {
  // Lock in whatever the bout is: a finished bout settles (a no-op if endBattle
  // already banked it); an unfinished one is a forfeit (a recorded loss + wear).
  if (battle && battle.over) settleFinishedBattle();
  else if (battle) {
    debuglog.event('battle_forfeit', { rank: battleRank, foe: battleFoe.name });
    forfeitBattle();
  }

  if (lastOutcome) {
    if (lastOutcome.forfeit) {
      toast(`Forfeited the ${battleRank}-rank bout - logged as a loss. ${creatureOf().name} is winded.`);
    } else if (lastOutcome.promoted) {
      toast(`Won the bout! Promoted to ${lastOutcome.newRank} rank! The ladder opens up.`);
    } else {
      toast(lastOutcome.won
        ? `Won the ${battleRank}-rank bout! +💰 ${lastOutcome.reward}. ${creatureOf().name} is worn but proud.`
        : `Lost the ${battleRank}-rank bout. +💰 ${lastOutcome.reward} consolation. ${creatureOf().name} needs rest.`);
    }
    // celebration flourish (M10 juice): a winner hops home with hearts on the stage.
    if (lastOutcome.won) {
      reaction = { effect: 'delight', t0: appNow() };
      if (lastOutcome.promoted) sfx('win');
    }
  }
  lastOutcome = null;
  closeBattle();
}

function closeBattle() {
  const ov = el('battle');
  if (ov) { ov.hidden = true; ov.innerHTML = ''; }
  battle = null;
  battleFoe = null;
  arenaCtx = null;
  arenaCanvas = null;
}

function sizeArena() {
  if (!arenaCanvas) return;
  const r = arenaCanvas.getBoundingClientRect();
  if (!arenaStage) arenaStage = new LitStage(arenaCanvas, 150);
  arenaStage.sync(r.width || 754, r.height || 300);
}

// LEAN B: who is in the stands. Each retiree becomes one silhouette shape plus
// one eyeshine colour — no names, no faces, nothing readable — so the crowd is
// the player's own line without becoming a roll call.
function arenaCrowd() {
  if (!CROWD_FROM_MEADOW) return null;
  const meadow = (state && state.estate && state.estate.meadow) || [];
  if (!meadow.length) return null;
  return meadow.map(crowdDescriptor);
}

// Draw both fighters facing the centre. On a hit, the striker lunges inward and
// the struck side gives a small shake — legible feedback with no asset files.
function drawArena(t) {
  if (!arenaCanvas || !battle) return;
  if (!arenaStage || !arenaStage.p) sizeArena();
  const st = arenaStage;
  if (!st || !st.p) return;
  const w = st.w, h = st.h;
  const L = tournamentLayout(w, h);
  const lights = tournamentLights(L);
  const crowd = arenaCrowd();
  // The stands are part of the static bake, so the bake key carries the crowd's
  // identity: retire a Buddy and the stands re-bake with it in them.
  st.bake(`ring:${w}x${h}:${crowd ? crowd.length : 0}:${crowd ? crowd.map((c) => c.archetype).join('') : ''}`,
    (p) => drawTournament(p, L, crowd));
  const p = st.begin();
  if (!p) return;
  const ground = L.ground;
  const ATK = 360, HIT = 340, KO = 700, VFX = 460;

  // A side's pose this frame: it lunges when it dealt damage, recoils when hit,
  // and topples on a KO. Attack wins a same-round tie so a clash reads as both
  // fighters driving toward the centre. (M7 poses.)
  const poseFor = (attackT, hitT, downed) => {
    if (downed && arenaFx.koT0 >= 0) {
      return { pose: 'ko', poseT: Math.min(1, (t - arenaFx.koT0) / KO) };
    }
    if (attackT >= 0 && t - attackT < ATK) return { pose: 'attack', poseT: (t - attackT) / ATK };
    if (hitT >= 0 && t - hitT < HIT) return { pose: 'hit', poseT: (t - hitT) / HIT };
    return { pose: 'idle', poseT: 0 };
  };
  const foeMood = moodOf(battleFoe);
  const youMood = moodOf(creatureOf());
  const over = battle.over;

  const foeX = Math.round(w * 0.40), youX = Math.round(w * 0.60);
  // foe on the left (faces right, +1); player on the right (faces left, -1).
  const foeP = poseFor(arenaFx.pT0, arenaFx.fT0, over && battle.foe.hp <= 0);
  const youP = poseFor(arenaFx.fT0, arenaFx.pT0, over && battle.player.hp <= 0);
  // Reduced motion freezes the ambient idle bob (a held frame) but leaves the
  // TRIGGERED attack/hit/KO poses animating — they carry essential battle feedback,
  // so they read off real time while the resting bob is stilled.
  const bt = reduceMotion ? AMBIENT_STILL_T : t;
  // Both fighters share the mat, so both get the same headroom budget: they must
  // not grow up through the bunting.
  // Both fighters are sized to the same target height so a bout never reads as a
  // mismatch of scale, and capped so neither grows up through the bunting.
  const room = ground - L.tiers[0].y;
  const scale = Math.min(
    fitScale(battleFoe, h * 0.40, w * 0.22, room, 1.0),
    fitScale(creatureOf(), h * 0.40, w * 0.22, room, 1.0),
  );
  drawLitCreature(p, battleFoe, bt, {
    x: foeX, ground, scale: scale * 0.92, lights, amb: 0.14, mood: foeMood,
    facing: 1, pose: foeP.pose, poseT: foeP.poseT, rim: lights[0], rimAmt: 0.62,
    seed: 5, shadowAmt: 0.55, shadowCol: '#0d1020',
    cast: { len: Math.round(40 * L.u), drop: Math.round(8 * L.u), amt: 0.34, col: '#0b0e1c' },
  });
  drawLitCreature(p, creatureOf(), bt, {
    x: youX, ground, scale, lights, amb: 0.14, mood: youMood,
    facing: -1, pose: youP.pose, poseT: youP.poseT, rim: lights[1], rimAmt: 0.62,
    seed: 11, shadowAmt: 0.55, shadowCol: '#0d1020',
    cast: { len: Math.round(-40 * L.u), drop: Math.round(8 * L.u), amt: 0.34, col: '#0b0e1c' },
  });

  // affinity VFX: the player's element bursts on the foe, the foe's on the player.
  // These bright element flashes are suppressed when the accessibility panel's
  // "flashes" toggle is off (photosensitivity-safe); the hit poses still play.
  // Composited ADDITIVELY — a burst is light, so it lights the ring it happens in.
  let struck = false;
  const burst = (fx, x) => {
    if (!flashesOn || !fx || fx.t0 < 0) return;
    const prog = (t - fx.t0) / VFX;
    if (prog < 0 || prog > 1) return;
    struck = true;
    drawLitVfx(p, fx.family, x, ground - 10 * scale, prog, { scale: scale * 1.15, hue: fx.hue });
  };
  burst(arenaFx.pVfx, foeX);
  burst(arenaFx.fVfx, youX);
  // the PoC's impact flash between the fighters, and the light it throws back
  // onto the mat — fires on the same beat as the affinity burst
  if (struck && flashesOn) {
    const ix = Math.round(w * 0.5), iy = ground - Math.round(14 * L.u);
    const age = Math.max(0, Math.min(1, (t - Math.max(arenaFx.pVfx ? arenaFx.pVfx.t0 : -1, arenaFx.fVfx ? arenaFx.fVfx.t0 : -1)) / VFX));
    const strength = 1 - age;
    if (strength > 0.02) {
      drawImpactFlash(p, ix, iy, L.u, strength);
      p.pool(ix, L.matCy + Math.round(L.matRy * 0.2), Math.max(12, Math.round(54 * L.u)),
        Math.max(5, Math.round(16 * L.u)), '#FFCF80', 0.30 * strength, 1.9);
    }
  }

  st.present();
}

function arenaLoop() {
  if (!battle) return; // stop when the overlay closes
  drawArena(appNow());
  requestAnimationFrame(arenaLoop);
}

// ---- retirement + the Memory Meadow + inheritance (M6) ----------------------

// Send the current pet — alive — into the Meadow. The estate persists; the game
// enters the between-generations state (no active creature) from which the next
// heir is bred. Graduation, not loss: the pet is now a permanent, pettable
// record, never gone.
function doRetire() {
  const c = creatureOf();
  if (!c) return;
  retireArmed = false;
  const { estate, retiree } = retireCreature(state);
  state = { ...state, creature: null, estate };
  inheritSel = [];
  inheritSalt = 0;
  persist();
  recompute();
  debuglog.event('retire', { name: retiree.name, species: retiree.species.name, retiredAtAge: retiree.retiredAtAge });
  toast(`${retiree.name} retires to the Meadow after ${retiree.retiredAtAge} weeks. Breed the next heir.`);
  openMeadow();
}

function openMeadow() {
  const ov = el('meadow');
  if (!ov) return;
  // Guard against a duplicate open: if the Meadow is already up, just refresh its
  // sheets — do NOT start a second meadowLoop (that would double-drive the canvas).
  if (!ov.hidden) { renderMeadow(); return; }
  ov.hidden = false;
  buildMeadowShell();
  renderMeadow();
  sizeMeadow();
  requestAnimationFrame(meadowLoop);
}

function closeMeadow() {
  const ov = el('meadow');
  if (ov) { ov.hidden = true; ov.innerHTML = ''; }
  window.removeEventListener('resize', sizeMeadow); // was leaked on every open
  meadowCtx = null;
  meadowCanvas = null;
}

function buildMeadowShell() {
  const ov = el('meadow');
  ov.innerHTML = `
    <div class="meadow-panel">
      <div class="meadow-top">
        <h2>🌼 Memory Meadow</h2>
        <button data-mclose class="meadow-x" aria-label="close">✕</button>
      </div>
      <div class="meadow-arena"><canvas id="meadow-canvas"></canvas></div>
      <div class="meadow-body" data-mbody></div>
      <div class="meadow-foot" data-mfoot></div>
    </div>`;
  ov.querySelector('[data-mclose]').addEventListener('click', closeMeadow);
  meadowCanvas = el('meadow-canvas');
  meadowCtx = meadowCanvas.getContext('2d');
  window.addEventListener('resize', resizeSoon);
}

// The read-only Meadow: each retiree's frozen sheet. Between generations the
// sheets become selectable parents and the footer previews + hatches the heir.
function renderMeadow() {
  const ov = el('meadow');
  if (!ov || ov.hidden) return;
  const meadow = (state && state.estate && state.estate.meadow) || [];
  const breeding = !creatureOf(); // between generations -> inheritance is live
  const body = ov.querySelector('[data-mbody]');

  body.innerHTML = meadow.map((r, i) => {
    const col = RARITY_COLORS[r.rarity] || '#9aa4b2';
    const chosen = inheritSel.includes(i);
    const stats = STAT_KEYS.map((k) => `<span class="ms"><i>${STAT_LABELS[k].slice(0, 3)}</i>${r.stats[k] ?? '-'}</span>`).join('');
    const badges = (r.badges || []).map((b) => `<span class="lin-badge">${escapeHtml(b)}</span>`).join('');
    const chooseBtn = breeding
      ? `<button class="ret-choose${chosen ? ' on' : ''}" data-choose="${i}">${chosen ? '✓ parent' : 'choose as parent'}</button>`
      : '';
    return `
      <div class="retiree${chosen ? ' chosen' : ''}">
        <div class="ret-head">
          <div>
            <span class="ret-name">${escapeHtml(r.name)}</span>
            <span class="ret-species">${escapeHtml(r.species.name)} &middot; ${escapeHtml(r.temperament)}</span>
          </div>
          <span class="rarity" style="border-color:${col}">${r.rarity}</span>
        </div>
        <div class="ret-meta"><span class="rank-chip rank-${r.rank}">${r.rank} rank</span><span class="ret-age">retired at week ${r.retiredAtAge}</span></div>
        <div class="ret-stats">${stats}</div>
        ${badges ? `<div class="ret-badges">${badges}</div>` : ''}
        <div class="ret-actions"><button class="ret-pet" data-pet="${i}">♡ pet</button>${chooseBtn}</div>
      </div>`;
  }).join('');

  body.querySelectorAll('[data-pet]').forEach((b) =>
    b.addEventListener('click', () => petRetiree(Number(b.dataset.pet))));
  body.querySelectorAll('[data-choose]').forEach((b) =>
    b.addEventListener('click', () => toggleParent(Number(b.dataset.choose))));

  renderInheritFoot();
}

function renderInheritFoot() {
  const ov = el('meadow');
  const foot = ov.querySelector('[data-mfoot]');
  if (!creatureOf()) {
    const egg = currentEgg();
    const meadow = state.estate.meadow || [];
    const picks = inheritSel.map((i) => meadow[i]).filter(Boolean);
    const parentLine = picks.length
      ? picks.map((p) => escapeHtml(p.name)).join(' & ') + (picks.length === 1 ? ' + a wild seed' : '')
      : 'choose a parent above (one is enough - a wild seed fills the second)';
    const boostLabels = egg ? egg.boosted.map((k) => STAT_LABELS[k]).join(' & ') : '';
    // Inherited stats paired with their delta vs a fresh summon of the heir's
    // rarity — the head-start the bloodline bought, shown honestly (a lightly
    // raised parent hands down less, so the net can be modest).
    const eggBase = egg ? freshBaseline(egg.rarity) : 0;
    const eggDeltas = egg ? inheritedDeltas(egg) : [];
    const eggNet = eggDeltas.reduce((a, d) => a + d.delta, 0);
    const eggNetCls = eggNet > 0 ? 'pos' : eggNet < 0 ? 'neg' : '';
    const eggHtml = egg
      ? `
        <div class="egg-preview">
          <div class="egg-row"><span class="egg-k">Heir</span><span class="egg-v">${escapeHtml(egg.name)} &middot; ${escapeHtml(egg.species.name)}</span></div>
          <div class="egg-row"><span class="egg-k">Rarity</span><span class="egg-v">${egg.rarity}</span></div>
          <div class="egg-row"><span class="egg-k">Temperament</span><span class="egg-v">${escapeHtml(egg.temperament)}</span></div>
          <div class="egg-row"><span class="egg-k">Inherited</span><span class="egg-v boost">${escapeHtml(boostLabels)} (head-start)</span></div>
          <div class="egg-row"><span class="egg-k">vs fresh</span><span class="egg-v"><b class="ms-d ${eggNetCls}">${eggNet > 0 ? '+' : ''}${eggNet}</b> total against a fresh ${egg.rarity} (baseline ${eggBase} each)</span></div>
          <div class="egg-stats">${eggDeltas.map((d) => `<span class="ms${egg.boosted.includes(d.key) ? ' up' : ''}${d.delta > 0 ? ' pos' : d.delta < 0 ? ' neg' : ''}"><i>${STAT_LABELS[d.key].slice(0, 3)}</i>${d.value}${d.delta !== 0 ? ` <b class="ms-d">${d.delta > 0 ? '+' : ''}${d.delta}</b>` : ''}</span>`).join('')}</div>
          <div class="egg-badges">${egg.badges.map((b) => `<span class="lin-badge">${escapeHtml(b)}</span>`).join('')}</div>
        </div>`
      : '';
    foot.innerHTML = `
      <div class="inherit">
        <div class="inherit-head">
          <span class="inherit-title">Breed the next heir</span>
          <span class="inherit-parents">${parentLine}</span>
        </div>
        ${eggHtml}
        <div class="inherit-actions">
          <button id="hatch-heir" class="hatch"${egg ? '' : ' disabled'}>🥚 Hatch this heir</button>
          <button id="reroll-heir" class="reroll"${egg ? '' : ' disabled'}>↻ different heir</button>
        </div>
      </div>`;
    const hatch = el('hatch-heir');
    if (hatch) hatch.addEventListener('click', doHatch);
    const reroll = el('reroll-heir');
    if (reroll) reroll.addEventListener('click', () => { inheritSalt++; renderMeadow(); });
  } else {
    foot.innerHTML = `<p class="meadow-note">Petting here is affection only - nothing in the Meadow trains, revives, or returns a retiree to the ring. Retire your current pet to breed the next generation.</p>`;
  }
}

// Toggle a retiree as a breeding parent (max two). Selecting a third drops the
// oldest choice so the pick always stays a legible pair.
function toggleParent(i) {
  const at = inheritSel.indexOf(i);
  if (at >= 0) inheritSel.splice(at, 1);
  else {
    inheritSel.push(i);
    if (inheritSel.length > 2) inheritSel.shift();
  }
  inheritSalt = 0;
  renderMeadow();
}

// The egg promised by the current parent selection: two chosen retirees, or one
// retiree + the wild-seed fallback (generation one). Null when nothing is chosen.
function currentEgg() {
  const meadow = state.estate.meadow || [];
  const picks = inheritSel.map((i) => meadow[i]).filter(Boolean);
  if (picks.length === 0) return null;
  return breedEgg(picks[0], picks[1] || null, inheritSalt);
}

function doHatch() {
  const egg = currentEgg();
  if (!egg) { toast('Choose at least one parent from the Meadow.'); return; }
  setState(newGameFromEgg(egg, state.estate, Date.now()));
  inheritSel = [];
  inheritSalt = 0;
  closeMeadow();
  debuglog.event('hatch', { name: egg.name, species: egg.species.name, parents: egg.parents.map((p) => p.name) });
  toast(`${egg.name} hatches - heir of ${egg.parents.map((p) => p.name).join(' & ')}.`);
}

function petRetiree(i) {
  const meadow = state.estate.meadow || [];
  const r = meadow[i];
  if (!r) return;
  toast(`${r.name} dozes in the sun, content. (Affection only - the Meadow never fights again.)`);
}

function sizeMeadow() {
  if (!meadowCanvas) return;
  const rect = meadowCanvas.getBoundingClientRect();
  if (!meadowStage) meadowStage = new LitStage(meadowCanvas, 105);
  meadowStage.sync(rect.width || 780, rect.height || 260);
}

function meadowLoop() {
  const ov = el('meadow');
  if (!ov || ov.hidden || !meadowCanvas) return; // stop when the overlay closes
  if (!meadowStage || !meadowStage.p) sizeMeadow();
  const st = meadowStage;
  if (!st || !st.p) return;
  const L = meadowLayout(st.w, st.h);
  const lights = meadowLights(L);
  st.bake(`meadow:${st.w}x${st.h}`, (p) => drawMeadow(p, L));
  const p = st.begin();
  if (!p) return;
  const meadow = (state && state.estate && state.estate.meadow) || [];
  drawLitMeadowInto(p, L, lights, meadow, ambientTime()); // reduced-motion freezes the frolic
  st.present();
  requestAnimationFrame(meadowLoop);
}

// ---- week planner (bottom bar) ----------------------------------------------

function renderPlanner() {
  const wrap = el('plan');
  const c = creatureOf();
  if (!c) {
    wrap.classList.add('disabled');
    wrap.innerHTML = '<p class="empty">Summon a creature, then plan its week here.</p>';
    return;
  }
  wrap.classList.remove('disabled');

  const stage = lifeStage(c.age);
  const budget = weekBudget(c);
  const spent = plan.length;
  const money = state.estate.money;
  const moneyDelta = preview ? preview.deltas.money : 0;
  const twilight = c.age > LIFESPAN_WEEKS;

  const chits = Array.from({ length: budget }, (_, i) =>
    `<span class="chit ${i < spent ? 'spent' : ''}"></span>`).join('');

  const buttons = ACTION_ORDER.map((id) => {
    const a = ACTIONS[id];
    const cls = a.kind === 'rest' ? 'rest' : a.kind === 'care' ? 'care' : 'drill';
    return `<button class="act ${cls}" data-act="${id}"><span class="g">${a.glyph}</span>${a.label}</button>`;
  }).join('');

  // Queued chips carry reorder controls: order MATTERS in resolveWeek (a rest
  // before a drill lands harder than after), so the UI must let the player set it.
  const queue = plan.length
    ? plan.map((id, i) =>
        `<span class="qchip" data-i="${i}">` +
          `<button class="qmove" data-mv="${i}:-1"${i === 0 ? ' disabled' : ''} title="move earlier" aria-label="move earlier">◀</button>` +
          `<span class="g">${ACTIONS[id].glyph}</span>${ACTIONS[id].label}` +
          `<button class="qmove" data-mv="${i}:1"${i === plan.length - 1 ? ' disabled' : ''} title="move later" aria-label="move later">▶</button>` +
          `<button class="qx" data-rm="${i}" title="remove" aria-label="remove">×</button>` +
        `</span>`).join('')
    : '<span class="hint">queue drills, rest and play - care and training share this budget. order matters</span>';

  // Warn if ending the week now will blow past a mandatory meet uncompeted (a fine).
  const car = (state.estate && state.estate.career) || {};
  const willMissMeet = car.nextMandatory != null && !car.metCycle && (c.age + 1) >= car.nextMandatory;
  const meetWarn = willMissMeet
    ? `<div class="meet-warn">⚠ Ending the week now misses the mandatory ${car.rank || 'E'}-rank meet - a fine. Enter a bout first.</div>`
    : '';

  const stageLine = twilight
    ? `<span class="plan-stage">Twilight &middot; retirement season is near</span>`
    : `<span class="plan-stage">${stage.label} &middot; ${budget} actions this week</span>`;

  wrap.innerHTML = `
    <div class="plan-status">
      <span class="plan-week">Week ${c.age}</span>
      ${stageLine}
      <span class="plan-money">Money: 💰 ${money}${moneyDelta ? ` <span class="d ${moneyDelta > 0 ? 'up' : 'down'}">${moneyDelta > 0 ? '+' + moneyDelta : moneyDelta}</span>` : ''}</span>
    </div>
    <div class="plan-mid">
      <div class="chits"><span class="label">Actions ${spent} / ${budget}</span>${chits}</div>
      <div class="actions">${buttons}</div>
      <div class="queue">${queue}</div>
      ${meetWarn}
    </div>
    <div class="plan-end">
      <button id="endweek">End Week ▸</button>
      <button id="fastfwd" title="auto-fill a sensible week and resolve it">⏩ Fast-forward</button>
      <button id="clearplan"${plan.length ? '' : ' disabled'}>clear</button>
      ${DEBUG ? '<button id="debugskip" class="debug" title="debug: resolve 5 weeks to reach twilight fast">⏭ skip 5wk</button>' : ''}
    </div>`;

  wrap.querySelectorAll('.act').forEach((b) =>
    b.addEventListener('click', () => queueAction(b.dataset.act)));
  wrap.querySelectorAll('.qx').forEach((b) =>
    b.addEventListener('click', () => unqueue(Number(b.dataset.rm))));
  wrap.querySelectorAll('.qmove').forEach((b) =>
    b.addEventListener('click', () => {
      const [i, dir] = b.dataset.mv.split(':').map(Number);
      moveAction(i, dir);
    }));
  el('endweek').addEventListener('click', endWeek);
  const ff = el('fastfwd');
  if (ff) ff.addEventListener('click', fastForwardWeek);
  const clr = el('clearplan');
  if (clr) clr.addEventListener('click', clearPlan);
  const dbg = el('debugskip');
  if (dbg) dbg.addEventListener('click', () => { for (let i = 0; i < 5; i++) fastForwardWeek(); });
}

// A sensible auto-plan for the remaining slots: rest when frazzled, play when the
// bond is thin, otherwise spread drills across the five stats. This is what the
// fast-forward fills in so a player who doesn't want to micro every week can zip
// ahead without neglecting the pet. (The spec's "fast-forward".)
function autoFillPlan(c, slots) {
  const drills = ['drill_pow', 'drill_def', 'drill_spd', 'drill_sta', 'drill_foc'];
  const out = [];
  let fatigue = c.fatigue, stress = c.stress, bond = c.bond, di = 0;
  for (let i = 0; i < slots; i++) {
    if (fatigue > 55 || stress > 55) { out.push('rest'); fatigue -= 28; stress -= 20; }
    else if (bond < 45) { out.push('play'); bond += 6; stress -= 8; }
    else { out.push(drills[di % drills.length]); di++; fatigue += 14; stress += 7; }
  }
  return out;
}

// Fast-forward: complete the week's budget with sensible defaults, then resolve.
function fastForwardWeek() {
  const c = creatureOf();
  if (!c) { toast('Summon a creature first.'); return; }
  const budget = weekBudget(c);
  const remaining = Math.max(0, budget - plan.length);
  if (remaining > 0) plan = [...plan, ...autoFillPlan(c, remaining)];
  endWeek();
}

// ---- planner actions --------------------------------------------------------

function recompute() {
  // Preview only while the player is actively planning. An empty plan shows a
  // clean current-state card, not a persistent "everything is dropping" scare.
  preview = state && creatureOf() && plan.length ? resolveWeek(state, plan) : null;
  renderCard();
  renderPlanner();
  renderCoach();
}

// ---- first-run coaching (M8 onboarding) -------------------------------------
// A single contextual hint keyed to where the player is in the loop. Each step
// shows once, then retires the moment its goal is reached (or the player dismisses
// it). Seen steps persist so a returning player is never re-taught. The whole
// thing is opt-out: one X and it's gone for good.
const COACH_KEY = 'oddseedz_coach_v1';
let coachSeen = loadCoachSeen();

function loadCoachSeen() {
  try {
    const raw = window.localStorage.getItem(COACH_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveCoachSeen() {
  try { window.localStorage.setItem(COACH_KEY, JSON.stringify([...coachSeen])); } catch { /* private mode */ }
}
function markCoachSeen(id) {
  if (id && !coachSeen.has(id)) { coachSeen.add(id); saveCoachSeen(); }
}

// Which hint (if any) applies to the current state. Order matters: the first
// unmet, unseen step wins.
function currentCoachStep() {
  const c = creatureOf();
  const est = (state && state.estate) || {};
  const meadow = est.meadow || [];
  if (!c) {
    // Between generations: the pet has retired and the Meadow holds the line.
    // Coach the inheritance step (breed the next heir) rather than going silent.
    if (meadow.length) {
      return { id: 'inherit', glyph: '*', text: 'Your line rests in the Meadow. Open it to breed the next heir - choose one or two parents and hatch. The estate money, toys and record all carry forward.' };
    }
    return { id: 'summon', glyph: '*', text: 'Type any word or phrase above, then press Summon to hatch your first Buddy.' };
  }
  // Twilight: nudge the graceful exit before any other routine hint.
  if (isRetirementDue(c)) {
    return { id: 'retire', glyph: '*', text: 'Your Buddy has lived a full life. When you are ready, Retire it to the Memory Meadow - that is graduation, not loss, and its bloodline seeds your next heir.' };
  }
  if ((c.age || 1) <= 1) {
    return { id: 'raise', glyph: '*', text: 'Queue a week of actions below, then End Week. Drills, rest and play all share one shrinking budget - that trade-off is the game.' };
  }
  const fought = ((est.record || {}).wins || 0) + ((est.record || {}).losses || 0) > 0;
  if (!fought) {
    return { id: 'fight', glyph: '*', text: 'Ready to compete? Use the bout button on the card to earn money and climb the E to D to C ladder. The E rung is always free.' };
  }
  return null;
}

const COACH_ORDER = ['summon', 'raise', 'fight', 'retire', 'inherit'];

function renderCoach() {
  const box = el('coach');
  if (!box) return;
  const step = currentCoachStep();
  // Reaching a later step (or finishing the arc) retires every earlier step for
  // good, so a hint truly shows at most once across the whole save.
  const reached = step ? COACH_ORDER.indexOf(step.id) : COACH_ORDER.length;
  for (let i = 0; i < reached; i++) markCoachSeen(COACH_ORDER[i]);
  if (!step || coachSeen.has(step.id)) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<span class="coach-glyph">${step.glyph}</span><span class="coach-text">${escapeHtml(step.text)}</span><button class="coach-x" aria-label="dismiss hint" title="dismiss">✕</button>`;
  const x = box.querySelector('.coach-x');
  if (x) x.addEventListener('click', () => { markCoachSeen(step.id); renderCoach(); });
}

function queueAction(id) {
  const c = creatureOf();
  if (!c || !ACTIONS[id]) return;
  const budget = weekBudget(c);
  if (plan.length >= budget) {
    toast('No actions left this week. End the week, or drop one to swap.');
    return;
  }
  plan.push(id);
  recompute();
}

function unqueue(i) {
  if (i < 0 || i >= plan.length) return;
  plan.splice(i, 1);
  recompute();
}

// Swap a queued action with its neighbor. Order is a real lever in resolveWeek
// (rest-before-drill lands harder), so this is genuine control, not cosmetics.
function moveAction(i, dir) {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= plan.length || j >= plan.length) return;
  [plan[i], plan[j]] = [plan[j], plan[i]];
  recompute();
}

function clearPlan() {
  if (!plan.length) return;
  plan = [];
  recompute();
}

function endWeek() {
  const c = creatureOf();
  if (!c) {
    toast('Summon a creature first.');
    return;
  }
  const res = resolveWeek(state, plan);
  const finishedWeek = c.age;
  state = { ...state, creature: res.creature, estate: res.estate };

  // The calendar tick: a mandatory meet may have come due. Missing it fines the
  // estate and frets the pet (applied here), but never ends the game.
  const cal = advanceCalendar(state.estate, res.creature.age);
  state = {
    ...state,
    estate: cal.estate,
    creature: { ...state.creature, stress: Math.min(STRESS_MAX, state.creature.stress + cal.stress) },
  };

  plan = [];
  recompute();
  persist();

  const s = res.summary;
  const bits = [];
  if (s.drills) bits.push(`${s.drills} drill${s.drills > 1 ? 's' : ''}`);
  if (s.rests) bits.push(`${s.rests} rest`);
  if (s.plays) bits.push(`${s.plays} play`);
  const how = bits.length ? bits.join(', ') : 'a quiet week';
  debuglog.event('end_week', { week: finishedWeek, nextWeek: res.creature.age, summary: s, missedMeet: !!cal.missed });
  if (cal.missed) {
    toast(`Week ${finishedWeek} done - ${how}. ${cal.note} Enter a bout before the next meet.`);
  } else {
    toast(`Week ${finishedWeek} done - ${how}. Now week ${res.creature.age}.`);
  }
}

// ---- direct manipulation on the canvas (tap = pet, drag = scoop up) ---------

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// LEAN A bookkeeping: the in-world hand is drawn wherever the pointer is, so
// the scene needs to know when the pointer is over it and where.
function onStageHover(e) {
  const pos = canvasPos(e);
  hover.on = true;
  hover.x = pos.x;
  hover.y = pos.y;
}

function onStageLeave() {
  hover.on = false;
}

function onPointerDown(e) {
  if (!creatureOf()) {
    // Between generations, a tap on the frolicking Meadow opens the full Meadow.
    const meadow = (state && state.estate && state.estate.meadow) || [];
    if (meadow.length) openMeadow();
    return;
  }
  const pos = canvasPos(e);
  press = { x0: pos.x, y0: pos.y, moved: false };
  drag.x = pos.x;
  drag.y = pos.y;
}

function onPointerMove(e) {
  if (!press) return;
  const pos = canvasPos(e);
  if (Math.hypot(pos.x - press.x0, pos.y - press.y0) > 10) press.moved = true;
  drag.x = pos.x;
  drag.y = pos.y;
  drag.active = press.moved; // the pet follows the pointer once it is a drag
}

function onPointerUp() {
  if (!press) return;
  const moved = press.moved;
  press = null;
  drag.active = false;
  if (!creatureOf()) return;
  doInteract({ type: moved ? 'drag' : 'pet' });
}

// ---- shared -----------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// Truncate a display string to a hard cap, adding an ellipsis. Guards against a
// long summon phrase blowing out a card/certificate line (M11 crash-vector pass).
function truncate(s, max = 48) {
  const str = String(s == null ? '' : s);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// The "summoned from ..." provenance line. An heir hatched from an egg has no
// phrase; it reads as a foundling of the seed rather than a leaked "(empty)".
function fromLine(c) {
  const phrase = c && typeof c.phrase === 'string' ? c.phrase.trim() : '';
  return phrase
    ? `summoned from &ldquo;${escapeHtml(truncate(phrase))}&rdquo;`
    : 'a foundling of the seed';
}

// ---- title splash creature (M11 item 9) -------------------------------------
// The boot splash now leads with the game's one visual asset: a "Buddy of the
// day" (rotates once per calendar day, drawn from the showiest tier) idle-animated
// in a cozy diorama. It uses the same drawCreature the game hatches, register
// palette only, and freezes to a held pose under reduced motion.
let titleCanvas = null, titleCtx = null, titleCreature = null, titleRunning = false;

function pickTitleSpecies() {
  const pool = (SPECIES_BY_RARITY.legendary && SPECIES_BY_RARITY.legendary.length)
    ? SPECIES_BY_RARITY.legendary : SPECIES;
  const day = Math.floor(Date.now() / 86400000);
  return pool[((day % pool.length) + pool.length) % pool.length];
}

function sizeTitleCanvas() {
  if (!titleCanvas) return;
  const r = titleCanvas.getBoundingClientRect();
  const w = Math.max(120, r.width || 190), h = Math.max(100, r.height || 156);
  if (!titleStage) titleStage = new LitStage(titleCanvas, 78);
  titleStage.sync(w, h);
}

function startTitleCreature() {
  titleCanvas = el('title-canvas');
  if (!titleCanvas) return;
  titleCtx = titleCanvas.getContext('2d');
  titleCreature = codexCreature(pickTitleSpecies());
  sizeTitleCanvas();
  if (!titleRunning) { titleRunning = true; requestAnimationFrame(titleLoop); }
}

// The splash diorama: the Buddy of the day, standing in the same lit toy room
// the game opens into. A small window onto the real thing, not a separate look.
function titleLoop() {
  const ov = el('title');
  if (!ov || ov.hidden || !titleCanvas || !titleCreature) { titleRunning = false; return; }
  if (!titleStage || !titleStage.p) sizeTitleCanvas();
  const st = titleStage;
  if (!st || !st.p) { titleRunning = false; return; }
  const L = toyRoomLayout(st.w, st.h);
  const lights = toyRoomLights(L);
  st.bake(`title:${st.w}x${st.h}`, (p) => drawToyRoom(p, L));
  const p = st.begin();
  if (!p) return;
  const sc = fitScale(titleCreature, st.h * 0.46, st.w * 0.52, L.pet.ground - Math.round(st.h * 0.08), 0.8);
  drawLitCreature(p, titleCreature, ambientTime(), {
    x: L.pet.x, ground: L.pet.ground, scale: sc, lights, amb: 0.18,
    mood: MEADOW_MOOD, rim: lights[0], rimAmt: 0.55, seed: 3,
    shadowAmt: 0.5, shadowCol: '#170d05',
  });
  st.present();
  requestAnimationFrame(titleLoop);
}

function toast(msg) {
  const t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function flashSaved() {
  const s = el('saved');
  if (!s) return;
  s.classList.add('show');
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => s.classList.remove('show'), 1200);
}

// Flight-recorder error indicator: a red border on the Settings button so a
// captured error is visible even if the player is not looking at the console.
function updateSettingsErrorBadge() {
  const btn = el('settings-open');
  if (!btn) return;
  btn.classList.toggle('error-badge', settingsErrorBadge);
}

function markSettingsError() {
  if (settingsErrorBadge) return;
  settingsErrorBadge = true;
  updateSettingsErrorBadge();
}

function clearSettingsError() {
  settingsErrorBadge = false;
  updateSettingsErrorBadge();
}

function persist() {
  try {
    saveGame(window.localStorage, { ...state, createdAt: state.createdAt || Date.now() });
    flashSaved();
  } catch {
    /* storage unavailable (private mode / file://) — game still playable */
  }
}

function setState(next, { save = true } = {}) {
  state = next;
  plan = [];
  recompute();
  if (save) persist();
}

function doSummon() {
  const input = el('phrase');
  // M14: never summon while a battle overlay is open. A new creature under an
  // old bout leaves the stale overlay stacked and traps pointer events.
  const battleOv = el('battle');
  const gate = summonAllowed({ battleVisible: !!(battleOv && !battleOv.hidden) });
  if (!gate.ok) {
    toast(gate.reason);
    debuglog.warn('summon blocked', { reason: gate.reason });
    return;
  }
  // A blank phrase summons nothing — nudge, don't mint a pet from "". (An empty
  // seed would still hash to a valid creature, but it reads as a bug to the player.)
  if (!input.value.trim()) {
    toast('Type a word or phrase first, then Summon.');
    input.focus();
    return;
  }
  const phrase = input.value;
  const creature = summon(phrase);
  setState(newGame(creature, Date.now()));
  debuglog.event('summon', { name: creature.name, species: creature.species.name, rarity: creature.rarity, phrase });
  // hatch flourish (M10 juice): the newborn pops in with a delight hop + hearts,
  // paired with the birth chirp. Transient triggered feedback, so it plays even
  // under reduced-motion (it is a moment, not an ambient loop).
  reaction = { effect: 'delight', t0: appNow() };
  sfx('summon'); // the birth chirp, in the freshly-hatched pet's own voice
}

// ---- the Buddies codex (M7): all 70 viewable ------------------------------
// A live-animated grid of the whole roster, filterable by rarity. Every cell is
// a real drawCreature call, so the codex shows exactly what a summon would hatch
// — the archetype rig, the species trait layer, the rarity frame + affinity.
const CODEX_FILTERS = ['all', ...RARITIES];

// A deterministic display creature for a species (stable pose across frames).
function codexCreature(s) {
  return {
    name: s.name,
    species: { id: s.id, name: s.name, archetype: s.archetype, hue: s.hue, traits: s.traits },
    rarity: s.rarity,
    stats: { pow: 30, def: 30, spd: 30, sta: 30, foc: 30 },
    variant: (s.hue * 2654435761) >>> 0,
    seed: s.id.length,
  };
}

// ---- settings / accessibility panel (M10) ----------------------------------
// A small overlay that owns the mandatory mute switch and the accessibility
// toggles (motion, flashes). Every change applies live and persists immediately,
// so a preference survives a reload. The register stays intact: plain chrome,
// bitmap-font labels via the observer.

const MOTION_LABEL = { auto: 'Auto (follow system)', full: 'Full motion', reduced: 'Reduced' };

function openSettings() {
  const ov = el('settings');
  if (!ov) return;
  ov.hidden = false;
  clearSettingsError();
  buildSettingsShell();
}

function closeSettings() {
  const ov = el('settings');
  if (ov) { ov.hidden = true; ov.innerHTML = ''; }
}

// Persist the current settings and re-derive the live-applied values.
function commitSettings() {
  settings = saveSettings(window.localStorage, settings);
  applySettings();
  debuglog.event('settings', { sound: settings.sound, motion: settings.motion, flashes: settings.flashes });
}

function buildSettingsShell() {
  const ov = el('settings');
  if (!ov) return;
  const motionChips = MOTION_MODES.map((m) => {
    const on = settings.motion === m ? ' on' : '';
    return `<button class="set-chip${on}" data-motion="${m}">${MOTION_LABEL[m]}</button>`;
  }).join('');
  ov.innerHTML = `
    <div class="settings-panel">
      <div class="settings-top">
        <h2>Settings</h2>
        <button data-sclose class="settings-x" aria-label="close">✕</button>
      </div>
      <div class="settings-body">
        <div class="set-row">
          <div class="set-label">Sound<span class="set-sub">creature squeaks & battle blips</span></div>
          <button class="set-toggle${settings.sound ? ' on' : ''}" data-toggle="sound" role="switch" aria-checked="${settings.sound}">${settings.sound ? 'ON' : 'OFF'}</button>
        </div>
        <div class="set-row">
          <div class="set-label">Flashes<span class="set-sub">bright battle element bursts</span></div>
          <button class="set-toggle${settings.flashes ? ' on' : ''}" data-toggle="flashes" role="switch" aria-checked="${settings.flashes}">${settings.flashes ? 'ON' : 'OFF'}</button>
        </div>
        <div class="set-row col">
          <div class="set-label">Motion<span class="set-sub">the idle bob and ambient movement</span></div>
          <div class="set-chips">${motionChips}</div>
        </div>
        <div class="set-row col">
          <div class="set-label">Save data<span class="set-sub">back up your pet, or restore one</span></div>
          <textarea class="set-io" data-savefield readonly rows="3" aria-label="your save code" data-no-bt>${state ? encodeSave(state) : ''}</textarea>
          <div class="set-chips">
            <button class="set-chip" data-copysave ${state ? '' : 'disabled'}>Copy</button>
            <button class="set-chip" data-downloadsave ${state ? '' : 'disabled'}>Download</button>
          </div>
          <textarea class="set-io" data-importfield rows="2" placeholder="paste a save code here to restore" aria-label="paste a save code" data-no-bt></textarea>
          <span class="set-sub" data-iomsg></span>
          <div class="set-chips">
            <button class="set-chip" data-loadsave>Restore from code</button>
          </div>
        </div>
        <div class="set-row col">
          <div class="set-label">Debug log<span class="set-sub">recent events and any captured errors for bug reports</span></div>
          <span class="set-sub" data-debugmsg>${debuglog.errorCount > 0 ? `${debuglog.errorCount} error${debuglog.errorCount > 1 ? 's' : ''} captured.` : `${debuglog.size} entries buffered.`}</span>
          <div class="set-chips">
            <button class="set-chip" data-copydebug>Copy</button>
            <button class="set-chip" data-dldebug>Download</button>
            <button class="set-chip" data-cleardebug>Clear</button>
          </div>
        </div>
      </div>
      <div class="settings-foot">
        <button class="set-test" data-testsound>Test sound</button>
      </div>
    </div>`;
  ov.querySelector('[data-sclose]').addEventListener('click', closeSettings);
  ov.querySelectorAll('[data-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.toggle;
      settings = { ...settings, [k]: !settings[k] };
      commitSettings();
      buildSettingsShell();
      if (k === 'sound' && settings.sound) sfx('ui'); // audible confirmation on un-mute
    }));
  ov.querySelectorAll('[data-motion]').forEach((b) =>
    b.addEventListener('click', () => {
      settings = { ...settings, motion: b.dataset.motion };
      commitSettings();
      buildSettingsShell();
    }));
  const testBtn = ov.querySelector('[data-testsound]');
  if (testBtn) testBtn.addEventListener('click', () => sfx('pet'));

  const ioMsg = (text) => { const m = ov.querySelector('[data-iomsg]'); if (m) m.textContent = text; };
  const copyBtn = ov.querySelector('[data-copysave]');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const field = ov.querySelector('[data-savefield]');
    if (!field) return;
    field.select();
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(field.value);
        ok = true;
      } else if (document.execCommand) {
        ok = document.execCommand('copy');
      }
    } catch { ok = false; }
    ioMsg(ok ? 'Copied. Keep it somewhere safe.' : 'Select the code above and copy it.');
  });
  const dlBtn = ov.querySelector('[data-downloadsave]');
  if (dlBtn) dlBtn.addEventListener('click', () => {
    if (!state) return;
    const token = encodeSave(state);
    const blob = new Blob([token], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nm = (state.creature && state.creature.name) || 'oddseedz';
    a.href = url;
    a.download = `${String(nm).replace(/[^\w-]+/g, '_')}-save.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ioMsg('Saved to a file.');
  });
  // Restore is destructive: it overwrites the current pet/estate. So it is a
  // TWO-STEP action — the first click validates the code and shows exactly what
  // will replace your game; a second click confirms. Editing the code, or any
  // rebuild of this panel, cancels the pending restore.
  const loadBtn = ov.querySelector('[data-loadsave]');
  let pendingCode = null;
  if (loadBtn) {
    const importField = ov.querySelector('[data-importfield]');
    const resetPending = () => {
      pendingCode = null;
      loadBtn.textContent = 'Restore from code';
      loadBtn.classList.remove('confirm');
    };
    if (importField) importField.addEventListener('input', resetPending);
    loadBtn.addEventListener('click', () => {
      const code = importField ? importField.value : '';
      const imported = decodeSave(code);
      if (!imported) {
        resetPending();
        ioMsg('That code is not a valid save. Nothing changed.');
        return;
      }
      if (pendingCode !== code) {
        // First click: preview what the restore would replace and arm the confirm.
        pendingCode = code;
        loadBtn.textContent = 'Confirm overwrite';
        loadBtn.classList.add('confirm');
        ioMsg(`This REPLACES your current game with ${describeSave(imported)}. Click again to confirm.`);
        return;
      }
      // Second click: apply.
      resetPending();
      setState(imported);
      closeSettings();
      toast(`Save restored: ${describeSave(imported)}.`);
      debuglog.event('restore', { name: imported.creature ? imported.creature.name : null, age: imported.creature ? imported.creature.age : null });
    });
  }

  const debugMsg = (text) => { const m = ov.querySelector('[data-debugmsg]'); if (m) m.textContent = text; };
  const copyDebugBtn = ov.querySelector('[data-copydebug]');
  if (copyDebugBtn) copyDebugBtn.addEventListener('click', async () => {
    const ok = await debuglog.copy();
    debugMsg(ok ? 'Copied to clipboard.' : 'Could not copy.');
  });
  const dlDebugBtn = ov.querySelector('[data-dldebug]');
  if (dlDebugBtn) dlDebugBtn.addEventListener('click', () => {
    const ok = debuglog.download();
    debugMsg(ok ? 'Debug log downloaded.' : 'Could not download.');
  });
  const clearDebugBtn = ov.querySelector('[data-cleardebug]');
  if (clearDebugBtn) clearDebugBtn.addEventListener('click', () => {
    debuglog.clear();
    clearSettingsError();
    debugMsg('Log cleared.');
  });
}

// A one-line human summary of what a save holds, for the restore confirmation.
function describeSave(s) {
  const c = s && s.creature;
  if (c && c.species) {
    return `${c.name} - ${c.rarity} ${c.species.name}, age ${c.age}`;
  }
  const n = (s && s.estate && s.estate.meadow || []).length;
  return `a between-generations line (${n} retiree${n === 1 ? '' : 's'} in the Meadow)`;
}

// ---- adoption / lineage certificate PNG (M10) -------------------------------
// Draw a keepsake certificate for a creature entirely in code (bitmap font +
// drawCreature portrait, register colours only) onto an offscreen canvas, then
// export it as a PNG. The content/layout is the pure certificateSpec(); this is
// just its paint + download.

const CERT_W = 680;
const CERT_H = 940;
const CERT_S = 2; // supersample for a crisp PNG

function renderCertificate(creature, estate) {
  const spec = certificateSpec(creature, estate);
  if (!spec) return null;
  const cv = document.createElement('canvas');
  cv.width = CERT_W * CERT_S;
  cv.height = CERT_H * CERT_S;
  const g = cv.getContext('2d');
  g.scale(CERT_S, CERT_S);

  // solid deep-navy field + a double hard-bevel frame (opaque, unlike the live
  // translucent panels, so the PNG stands alone)
  g.fillStyle = '#182458';
  g.fillRect(0, 0, CERT_W, CERT_H);
  g.strokeStyle = PALETTE.navyBevelLight; g.lineWidth = 3; g.strokeRect(10.5, 10.5, CERT_W - 21, CERT_H - 21);
  g.strokeStyle = PALETTE.navyBevelDark; g.lineWidth = 2; g.strokeRect(18.5, 18.5, CERT_W - 37, CERT_H - 37);

  // title band (header blue, white type)
  g.fillStyle = PALETTE.headerBand;
  g.fillRect(28, 30, CERT_W - 56, 46);
  g.strokeStyle = PALETTE.headerBevelDark; g.lineWidth = 2; g.strokeRect(28.5, 30.5, CERT_W - 57, 45);
  btCentered(g, spec.title, CERT_W / 2, 44, 3, PALETTE.headerText);

  // portrait window (warm interior) + the creature
  const px = 60, py = 96, pw = CERT_W - 120, ph = 300;
  g.fillStyle = PALETTE.creatureFloor;
  g.fillRect(px, py, pw, ph);
  g.strokeStyle = PALETTE.navyBorder; g.lineWidth = 3; g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  g.save();
  g.beginPath(); g.rect(px, py, pw, ph); g.clip();
  drawCreature(g, creature, AMBIENT_STILL_T, {
    cx: CERT_W / 2, cy: py + ph * 0.62, scale: ph / 300, mood: MEADOW_MOOD,
  });
  g.restore();

  // name + subtitle
  btCentered(g, spec.name, CERT_W / 2, py + ph + 26, 5, PALETTE.navyText);
  btCentered(g, spec.subtitle, CERT_W / 2, py + ph + 74, 2, PALETTE.accentGold);

  // fields — two balanced columns of label:value (value offset clears the widest
  // label, "Temperament", at scale 2)
  let fy = py + ph + 116;
  const colX = [60, CERT_W / 2 + 4];
  spec.fields.forEach((f, i) => {
    const x = colX[i % 2];
    const y = fy + Math.floor(i / 2) * 30;
    drawText(g, f.label, x, y, { scale: 2, color: PALETTE.accentGold });
    drawText(g, String(f.value), x + 152, y, { scale: 2, color: PALETTE.navyText });
  });
  fy += Math.ceil(spec.fields.length / 2) * 30 + 16;

  // stat bars — segmented gold meters (same pure meterCells the card uses). Bars
  // start after the label and stop short of the right frame so the value fits.
  const barX = 60, bx = barX + 108, cells = 20, gap = 3;
  const valW = 46; // reserved for the numeric value at the right
  const barRight = CERT_W - 60 - valW;
  const barW = barRight - bx;
  const cw = (barW - (cells - 1) * gap) / cells;
  spec.stats.forEach((s, i) => {
    const y = fy + i * 30;
    drawText(g, s.label, barX, y, { scale: 2, color: PALETTE.navyText });
    const states = meterCells(s.value, 0, cells, STAT_CAP);
    for (let c = 0; c < cells; c++) {
      g.fillStyle = states[c] ? PALETTE.meterFill : PALETTE.meterEmpty;
      g.fillRect(bx + c * (cw + gap), y - 2, cw, 14);
    }
    drawText(g, String(s.value), barRight + 10, y, { scale: 2, color: PALETTE.accentGold });
  });
  fy += spec.stats.length * 30 + 8;

  // lineage block (only for heirs)
  if (spec.lineage) {
    drawText(g, 'heir of ' + spec.lineage.parents.join(' & '), 70, fy, { scale: 2, color: PALETTE.navyText });
    fy += 26;
    if (spec.lineage.boosted.length) {
      drawText(g, 'inherited ' + spec.lineage.boosted.join(' & '), 70, fy, { scale: 2, color: PALETTE.accentGold });
      fy += 26;
    }
  }

  // footer band
  g.fillStyle = PALETTE.headerBand;
  g.fillRect(28, CERT_H - 74, CERT_W - 56, 44);
  btCentered(g, spec.seedLine, CERT_W / 2, CERT_H - 64, 2, PALETTE.headerText);
  btCentered(g, spec.footer, CERT_W / 2, CERT_H - 44, 2, PALETTE.headerText);

  return cv;
}

function downloadCertificate(creature, estate) {
  if (!creature) { toast('Summon a Buddy first.'); return; }
  const cv = renderCertificate(creature, estate);
  if (!cv) { toast('Could not make a certificate.'); return; }
  const finish = (blob) => {
    if (!blob) { toast('Could not export the certificate.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = certificateFilename(creature);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Certificate for ${creature.name} downloaded.`);
  };
  if (cv.toBlob) cv.toBlob(finish, 'image/png');
  else finish(null);
}

function openCodex() {
  const ov = el('codex');
  if (!ov) return;
  if (!ov.hidden) return; // already open — don't stack a second codexLoop
  ov.hidden = false;
  buildCodexShell();
  layoutCodex();
  focusCodexScroll();
  requestAnimationFrame(codexLoop);
}

function closeCodex() {
  const ov = el('codex');
  if (ov) { ov.hidden = true; ov.innerHTML = ''; }
  codexCtx = null;
  codexCanvas = null;
}

function buildCodexShell() {
  const ov = el('codex');
  const chips = CODEX_FILTERS.map((r) => {
    const on = r === codexFilter ? 'on' : '';
    return `<button class="codex-filter ${on}" data-filter="${r}">${r}</button>`;
  }).join('');
  ov.innerHTML = `
    <div class="codex-panel">
      <div class="codex-top">
        <h2>📖 The 70 Buddies</h2>
        <button data-cclose class="codex-x" aria-label="close">✕</button>
      </div>
      <div class="codex-filters">${chips}</div>
      <div class="codex-scroll" tabindex="0" role="region" aria-label="Scrollable Buddies list"><canvas id="codex-canvas"></canvas></div>
    </div>`;
  ov.querySelector('[data-cclose]').addEventListener('click', closeCodex);
  ov.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      codexFilter = b.dataset.filter;
      buildCodexShell();
      layoutCodex();
      focusCodexScroll();
    }));
  codexCanvas = el('codex-canvas');
  codexCtx = codexCanvas.getContext('2d');
}

function layoutCodex() {
  if (!codexCanvas) return;
  codexList = codexFilter === 'all' ? SPECIES : (SPECIES_BY_RARITY[codexFilter] || []);
  const scroll = codexCanvas.parentElement;
  const w = Math.max(280, scroll.clientWidth - 16);
  const cols = Math.max(2, Math.min(8, Math.floor(w / 132)));
  const cw = Math.floor(w / cols);
  const chh = 156;
  const rows = Math.ceil(codexList.length / cols);
  const d = Math.min(window.devicePixelRatio || 1, 2);
  codexCanvas.style.width = w + 'px';
  codexCanvas.style.height = rows * chh + 'px';
  codexCanvas.width = Math.round(w * d);
  codexCanvas.height = Math.round(rows * chh * d);
  codexCanvas._dpr = d;
  codexCanvas._cols = cols;
  codexCanvas._cw = cw;
  codexCanvas._chh = chh;
}

function focusCodexScroll() {
  const scroll = el('codex')?.querySelector('.codex-scroll');
  if (scroll) scroll.focus({ preventScroll: true });
}

function codexLoop() {
  const ov = el('codex');
  if (!ov || ov.hidden || !codexCtx) return;
  drawCodex(ambientTime()); // reduced-motion holds the codex grid still
  requestAnimationFrame(codexLoop);
}

function drawCodex(t) {
  const d = codexCanvas._dpr || 1;
  const cols = codexCanvas._cols, cw = codexCanvas._cw, chh = codexCanvas._chh;
  codexCtx.setTransform(1, 0, 0, 1, 0, 0);
  codexCtx.clearRect(0, 0, codexCanvas.width, codexCanvas.height);
  codexCtx.setTransform(d, 0, 0, d, 0, 0);
  codexList.forEach((s, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = c * cw, y = r * chh;
    const frame = RARITY_COLORS[s.rarity] || '#6b6480';
    // card
    codexCtx.fillStyle = 'rgba(255,255,255,0.035)';
    codexCtx.strokeStyle = frame;
    codexCtx.lineWidth = 1.5;
    roundRectPath(codexCtx, x + 5, y + 5, cw - 10, chh - 10, 12);
    codexCtx.fill();
    codexCtx.stroke();
    drawCreature(codexCtx, codexCreature(s), t + i * 137, { cx: x + cw / 2, cy: y + chh * 0.42, scale: 0.5 });
    // name + affinity, drawn in the bitmap font, scaled to fit the cell
    btFit(codexCtx, s.name, x + cw / 2, y + chh - 34, cw - 16, PALETTE.navyText, 2);
    btFit(codexCtx, `${s.rarity} ${affinityOf(s).element}`, x + cw / 2, y + chh - 16, cw - 16, PALETTE.accentGold, 1);
  });
}

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function boot() {
  // Render all UI text with the code-drawn bitmap font: the observer upgrades every
  // text node the templates emit (directive item 6). Start it before first paint.
  mountBtObserver(document.body);

  // Flight recorder: capture console-level errors and unhandled rejections, make
  // them visible, and offer one-click export from the Settings panel.
  debuglog.captureGlobalErrors({
    onError: (count) => {
      markSettingsError();
      toast(`An error was captured (${count}). Open Settings to copy the debug log.`);
    },
  });

  stageEl = el('stage');
  canvas = el('scene');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resizeSoon);

  // direct-manipulation care on the pet: pointer down/move/up (mouse + touch)
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  // LEAN A: track the pointer over the stage so the in-world hand can follow it,
  // and hide the system cursor while it does (a hand plus an arrow reads as two
  // cursors). Touch never fires pointerover, so a touch player simply sees no
  // hand — which is right: their own finger is already in the room.
  if (HAND_CURSOR) {
    canvas.classList.add('in-world-hand');
    canvas.addEventListener('pointerover', onStageHover);
    canvas.addEventListener('pointermove', onStageHover);
    canvas.addEventListener('pointerout', onStageLeave);
  }

  const input = el('phrase');
  input.placeholder = SEED_SUGGESTIONS[Math.floor((t0 / 97) % SEED_SUGGESTIONS.length)];
  el('summon').addEventListener('click', doSummon);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSummon();
  });
  const codexBtn = el('codex-open');
  if (codexBtn) codexBtn.addEventListener('click', openCodex);
  const setBtn = el('settings-open');
  if (setBtn) setBtn.addEventListener('click', openSettings);

  // Escape closes the topmost NON-destructive overlay (settings, codex, meadow).
  // The battle is deliberately excluded — leaving a live bout is a forfeit, so it
  // must be a deliberate button press, never a stray keypress.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = (id) => { const o = el(id); return o && !o.hidden; };
    if (open('settings')) { closeSettings(); e.preventDefault(); }
    else if (open('codex')) { closeCodex(); e.preventDefault(); }
    else if (open('meadow') && creatureOf()) { closeMeadow(); e.preventDefault(); }
    // (a between-generations Meadow has no pet to return to, so it stays open)
  });

  // Load persisted accessibility/sound preferences and apply them before paint.
  try {
    settings = loadSettings(window.localStorage);
  } catch {
    /* keep defaults */
  }
  applySettings();

  let restored = null;
  try {
    restored = loadGame(window.localStorage);
  } catch {
    restored = null;
  }
  // The boot title splash: shown on a clean first run, skipped when a save is
  // waiting (a returning player goes straight to their Buddy). The Begin button
  // dismisses it and focuses the summon field.
  const titleOv = el('title');
  const beginTitle = () => {
    if (titleOv) titleOv.hidden = true;
    const ph = el('phrase');
    if (ph) ph.focus();
    sfx('ui');
  };
  const beginBtn = el('title-begin');
  if (beginBtn) beginBtn.addEventListener('click', beginTitle);

  if (restored && restored.creature) {
    setState(restored, { save: false });
    input.value = restored.creature.phrase || '';
    const nm = restored.creature.name || 'your Buddy';
    if (titleOv) titleOv.hidden = true; // a Buddy is waiting — no splash
    setTimeout(() => toast(`Welcome back. ${nm} missed you.`), 260);
  } else if (restored && (restored.estate.meadow || []).length) {
    // A between-generations save: no active pet, but the Meadow bloodline persists.
    setState(restored, { save: false });
    const n = restored.estate.meadow.length;
    if (titleOv) titleOv.hidden = true;
    setTimeout(() => toast(`Welcome back. ${n} retiree${n > 1 ? 's' : ''} wait in the Meadow - breed the next heir.`), 260);
  } else {
    // Clean first run: leave the title splash up until the player clicks Begin.
    if (titleOv) {
      titleOv.hidden = false;
      const note = el('title-note');
      if (note) note.textContent = 'type a phrase, get a lifelong companion';
      startTitleCreature(); // the Buddy-of-the-day idles in the splash diorama
    }
    recompute();
  }

  loop();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
