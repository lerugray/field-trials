// boot.js — the browser entry and the ONLY presentation file that owns the animation frame. It
// wires the canvas, the view, real input, and the collection-contract host surface (window.__GAME,
// window.__SHELL). The RAF loop DRAWS ONLY; it never advances the sim (the pacing law). This file
// is in the presentation set, so it may legitimately touch requestAnimationFrame.
import { render, beginTextLayer, takeTextLayer, paintTextLayer } from './render.js';
import { attachInput } from './input.js';
import { createView, tryResume, setMuted, advanceReplay, abandonTenure, corruptSaveNoticeFor } from './view.js';
import { createDebugLog } from './debuglog.js';
import { createAudio } from './audio.js';
import { VERSION } from './model.js';
import { tiersReached, rubricOf } from './rubric.js';
import { cutawayGeometry, sectionFocus, computeButtons } from './layout.js';

const GAME_ID = 'material-breach';
const GAME_NAME = 'MATERIAL BREACH';

function ambientStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Privacy modes can throw on access; the game runs without persistence.
  }
  return null;
}

export function boot() {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // The text layer is a second canvas composited above the 640x360 pixel-art buffer. It is sized to
  // the display resolution and scaled to the same CSS footprint, so player-facing type rasterises
  // crisp while the facility/ledger/desk stay pixelated beneath it.
  const textCanvas = document.getElementById('text');
  const textCtx = textCanvas ? textCanvas.getContext('2d') : null;

  // Ask for the two embedded faces before anything is drawn with them. Canvas does not honour
  // font-display, so without this the first frames render in the fallback serif, and a screenshot
  // taken early would show a game that is not the one that ships. The RAF loop would correct itself
  // within milliseconds, but "eventually right" is not right, and the proof harness captures frames.
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('11px "MB Serif"');
      document.fonts.load('11px "MB Slab"');
    }
  } catch {
    // A DOM with no font registry (the boot smoke test's stub) draws in the fallback and is still a
    // valid boot: the faces are a presentation concern, never a correctness one.
  }

  const log = createDebugLog();
  const storage = ambientStorage();
  // The audio surface is built inert. No AudioContext exists until a real gesture reaches
  // unlock() below, which is contract item 6's "no pre-gesture autoplay" made structural rather
  // than merely observed.
  const audio = createAudio({ seed: 0x4d42, log });
  const view = createView({ seed: 'material-breach', log, storage });
  view.hasShell = typeof window !== 'undefined' && !!window.__SHELL;

  // Resume a saved tenure if one exists. M8: either way the game opens on the TITLE, and the title
  // is what offers to resume; a save is no longer a reason to skip the shell.
  //
  // A saved tenure that has ALREADY CLOSED is not resumable and must not be carried into the shell.
  // The first version dropped the player straight onto the previous closing report, skipping the
  // title entirely — and worse, taking up the post from there would have entered a facility that
  // was already condemned. A finished tenure is history: it is cleared, and the title offers a
  // fresh post, which is the only thing that can honestly be offered.
  let resume;
  try {
    resume = tryResume(view);
  } catch {
    resume = { ok: false, reason: 'boot resume failed' };
  }
  if (resume.ok) {
    if (view.facility.status === 'active') {
      view.resumable = true;
    } else {
      abandonTenure(view);
      view.resumable = false;
    }
  } else if (resume.reason) {
    // B1/Q1: never surface raw parser output to the player.
    view.saveNotice = corruptSaveNoticeFor(resume.reason);
  }
  view.overlay = 'title';

  // Contain-fit scaling: the 640x360 buffer fills the constrained viewport axis while keeping its
  // aspect ratio and every readable edge on screen. Fractional scale is allowed by the fleet
  // display law; image-rendering remains pixelated. Do not round this scale up: even a quarter-step
  // overshoot can crop the section header, legend, and ledger at common 16:10 viewports.
  function rescale() {
    const iW = window.innerWidth;
    const iH = window.innerHeight;
    const raw = Math.min(iW / 640, iH / 360);
    const scale = Number.isFinite(raw) && raw > 0 ? raw : 1;
    const cssW = `${640 * scale}px`;
    const cssH = `${360 * scale}px`;
    canvas.style.width = cssW;
    canvas.style.height = cssH;
    canvas.style.imageRendering = 'pixelated';
    if (textCanvas) {
      textCanvas.style.width = cssW;
      textCanvas.style.height = cssH;
      const dpr = window.devicePixelRatio || 1;
      textCanvas.width = Math.round(640 * scale * dpr);
      textCanvas.height = Math.round(360 * scale * dpr);
    }
  }
  rescale();
  window.addEventListener('resize', rescale);

  // Loud-failure export: dump the debug log to a downloadable text file.
  function exportLog() {
    try {
      const blob = new Blob([log.exportText()], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'material-breach-debug.txt';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      log.error('debug log export failed', err && err.message);
    }
  }

  // Completion hook (contract item 7): report to a host shell if present, no-op standalone.
  //
  // M8 verifies the three-tier rubric (§7), so a finished tenure now reports WHICH tiers it
  // reached, not merely that it ended. `event` stays the contract's field and keeps its old values,
  // so a shell that only reads `event` is unaffected; `tiers` and `score` are additive.
  function reportCompletion(event) {
    try {
      if (typeof window !== 'undefined' && window.__SHELL && window.__SHELL.report) {
        const payload = { id: GAME_ID, event };
        if (event === 'finished') {
          payload.tiers = tiersReached(view.facility);
          payload.score = view.facility.score;
        }
        window.__SHELL.report(payload);
      }
    } catch (err) {
      log.error('shell report failed', err && err.message);
    }
  }

  const detach = attachInput(canvas, view, {
    onExport: exportLog,
    // Every real gesture unlocks the bus; the call is idempotent after the first.
    onGesture: () => audio.unlock(),
    onMute: (muted) => {
      audio.setMuted(muted);
      log.info('mute toggled', String(muted));
    },
    onQuit: () => {
      reportCompletion('quit');
      window.__GAME && window.__GAME.quit();
    },
  });

  // The draw-only loop. It advances a presentation counter and reacts to (never causes) a tenure
  // closing by firing the completion hook exactly once.
  let raf = 0;
  let running = true;
  let lastStatus = view.facility.status;
  function frame() {
    if (!running) return;
    view.frame += 1;
    advanceReplay(view); // steps the watchable raid replay; never advances the sim
    if (lastStatus === 'active' && view.facility.status !== 'active') {
      reportCompletion('finished');
    }
    lastStatus = view.facility.status;
    beginTextLayer();
    render(ctx, view);
    if (textCtx) paintTextLayer(textCtx, takeTextLayer());
    // The audio scheduler rides THIS loop. band.js's port deleted the kit's setInterval driver so
    // that no timer token exists outside this file (the pacing law, hard rule 3), which means the
    // music advances on the same draw-only frame as the picture and can no more move the sim than a
    // drawn pixel can. update() maps state onto the score and schedules the lookahead window.
    audio.update(view);
    // Drain the sound outbox: one effect per frame, whatever the last action asked for.
    if (view.sfx) {
      audio.play(view.sfx);
      view.sfx = null;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // The host surface (contract item 3): a stable API after boot; quit() is a clean teardown.
  const game = {
    id: GAME_ID,
    name: GAME_NAME,
    version: VERSION,
    pause() {
      if (view.overlay === null) view.overlay = 'pause';
    },
    resume() {
      if (view.overlay === 'pause') view.overlay = null;
    },
    mute(muted) {
      setMuted(view, muted);
      audio.setMuted(muted);
    },
    // A read-only snapshot for test and proof harnesses. Never mutates; not a control surface.
    // From M7a r2 it reports the live cutaway geometry, because the camera now frames the built
    // facility rather than the whole grid: a harness that recomputed the geometry from a fixed cell
    // size would click the wrong cell as soon as the facility grew.
    state() {
      const f = view.facility;
      const geo = cutawayGeometry(f.dims, view.pan, sectionFocus(f, view));
      return {
        geo: { cell: geo.cell, ox: geo.ox, oy: geo.oy },
        status: f.status,
        cycle: f.cycle.number,
        cornerstone: f.lossObject.condition,
        overlay: view.overlay,
        treasury: f.treasury.gold,
        ordersOpen: f.orders.filter((o) => o.status === 'queued' || o.status === 'in-progress').length,
        excavated: f.grid.reduce((a, row) => a + row.filter((c) => c.excavated).length, 0),
        rooms: (f.rooms || []).length,
        tool: view.tool,
        // Read-only audio status, for the Gate harnesses. Like the rest of state(), it reports and
        // never controls: there is no way to start, stop or alter a sound through this surface.
        audio: { live: audio.live, muted: audio.muted, scene: audio.scene },
        resumable: view.resumable,
        // The controls standing right now, as rectangles. Read-only, like everything else here:
        // the Gate 8 soak uses these to put a REAL mouse click on a REAL control rather than
        // guessing at coordinates, which is the difference between testing the game and testing a
        // set of numbers the harness made up.
        buttons: computeButtons(view).map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, enabled: b.enabled })),
        // The three-tier rubric (§7), read-only, so the M8 gate harness can verify it against a
        // real tenure driven in a real browser rather than against a facility built in a test.
        rubric: rubricOf(view.facility),
        ladderRung: f.ladder.rung,
        noticesServed: f.notices.filter((n) => n.status === 'served').length,
        captives: (f.captives || []).length,
        score: f.score,
      };
    },
    quit() {
      running = false;
      cancelAnimationFrame(raf);
      detach();
      audio.dispose();
      window.removeEventListener('resize', rescale);
      ctx.clearRect(0, 0, 640, 360);
      if (textCtx) textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    },
  };
  if (typeof window !== 'undefined') window.__GAME = game;
  log.info('boot complete', `version=${VERSION}`);
  return game;
}

// Auto-boot in a browser; a test harness can import boot() and call it against a stubbed document.
if (typeof document !== 'undefined' && document.getElementById && document.getElementById('screen')) {
  boot();
}
