// THE JACQUARD INDEX — the play scene (the machine, playable).
//
// Wires input to the Board: left-drag paints stitches, right-drag paints crosses (bare
// warp), with the studio drag semantics handled by the Board. Full keyboard-only play is
// a law: arrows move the cursor, Space fills, X crosses, P pencils, Z/R undo/redo. The
// crosshair follows the cursor (line-tracking spec). On completion the pattern is
// declared woven. Rendering is the board view; this scene owns interaction + layout.

import { Board } from '../puzzle/board.js';
import { computeLayout, hitTest, drawBoard } from '../render/boardview.js';
import { Framebuffer } from '../gfx/framebuffer.js';
import { PALETTE } from '../gfx/palette.js';
import { drawText, drawTextCentered, measureText, textHeight } from '../gfx/font.js';
import { drawBodyTextCentered, measureBodyText, BODY_LINE_HEIGHT } from '../gfx/bodyFont.js';
import { twistFor, cardBand } from '../puzzle/twists.js';
import { mirrorImage } from '../puzzle/mirror.js';
import { FILLED as CELL_FILLED, CROSSED as CELL_CROSSED } from '../puzzle/board.js';
import { drawReveal } from '../render/reveal.js';
import {
  composePatternRoomWorkSurface, drawPatternRoomRulePlate, patternRoomWorkLayout,
  drawHintStrip as hintStrip,
} from '../render/patternRoom.js';
import { completedPanelFor, composePanel } from '../content/panels.js';
import { allCatalogueCardsById } from '../content/shelves.js';

let _cardsById = null;
function cardsById() {
  if (!_cardsById) _cardsById = allCatalogueCardsById();
  return _cardsById;
}

const LMB = 0;
const RMB = 2;
const DRAWER_BY_TWIST = {
  'two-thread': 1,
  'counting-house': 2,
  'negative-cloth': 3,
  'mirror-weave': 4,
  'house-rules': 5,
  patchwork: 7,
};

function ringCell(fb, layout, cx, cy, color) {
  const x = layout.gridX + cx * layout.cell;
  const y = layout.gridY + cy * layout.cell;
  fb.strokeRect(x - 1, y - 1, layout.cell + 2, layout.cell + 2, color[0], color[1], color[2]);
  fb.strokeRect(x, y, layout.cell, layout.cell, color[0], color[1], color[2]);
}

// The fold axis, drawn as a brass dashed seam so the player sees which way the cloth folds.
function drawFoldLine(fb, layout, axis, puzzle) {
  const { gridX, gridY, cell } = layout;
  const w = puzzle.width, h = puzzle.height;
  const [br, bg, bb] = PALETTE.brassLit;
  const vLineAt = (px) => { for (let y = 0; y < h * cell; y += 4) fb.fillRect(px - 1, gridY + y, 2, 2, br, bg, bb, 220); };
  const hLineAt = (py) => { for (let x = 0; x < w * cell; x += 4) fb.fillRect(gridX + x, py - 1, 2, 2, br, bg, bb, 220); };
  if (axis === 'v' || axis === 'rot180') vLineAt(gridX + Math.round(w / 2) * cell);
  if (axis === 'h' || axis === 'rot180') hLineAt(gridY + Math.round(h / 2) * cell);
}

// Progressive hint drawing: point -> name -> show, per the reveal stage.
function drawHintOverlay(fb, layout, hint, stage) {
  if (hint.kind === 'solved') return;
  const cell = layout.cell;
  if (hint.kind === 'mistake') {
    ringCell(fb, layout, hint.cell.x, hint.cell.y, PALETTE.madder);
    hintStrip(fb, hint.message, [230, 150, 140]);
    return;
  }
  // Stage 1+: wash the pointed line.
  const [br, bg, bb] = PALETTE.brassLit;
  if (hint.lineKind === 'row') {
    fb.fillRect(layout.gridX, layout.gridY + hint.lineIndex * cell, layout.width * cell, cell, br, bg, bb, 70);
  } else {
    fb.fillRect(layout.gridX + hint.lineIndex * cell, layout.gridY, cell, layout.height * cell, br, bg, bb, 70);
  }
  let text = hint.point;
  if (stage >= 2) text = `${hint.point}  ${hint.name}`;
  if (stage >= 3) {
    text = hint.message;
    ringCell(fb, layout, hint.cells[0].x, hint.cells[0].y, PALETTE.brassLit);
  }
  hintStrip(fb, text, PALETTE.brassLit);
}

export function makePlayScene(motif, opts = {}) {
  const board = new Board(motif.puzzle);
  const resumed = opts.resume || null;
  if (resumed) board.restoreState(resumed.board);
  // The shelf's twist: what the margin counts mean, how a hint reasons, its in-world tag.
  const twist = twistFor(motif.twist);
  const displayClues = twist.displayClues(motif.puzzle);
  // MIRROR-WEAVE: the fold axis, when this shelf weaves both sides.
  const fold = twist.fold ? (motif.axis || 'v') : null;
  const onAdvance = typeof opts.onAdvance === 'function' ? opts.onAdvance : null;
  const onExit = typeof opts.onExit === 'function' ? opts.onExit : null;
  const leave = onExit || onAdvance; // Esc / post-solve navigation target
  // The house's guarantee band for this card, read under its twist (per-puzzle difficulty).
  const band = cardBand(motif);
  const tierLabel = band.tier ? `TIER ${band.tier}` : (band.ok ? 'CERTIFIED' : 'UNCERTIFIED');
  let layout = null;
  let layoutSize = '';
  let artCache = null;
  const artStats = { builds: 0 };
  const drawer = DRAWER_BY_TWIST[motif.twist] ?? 0;
  const cursor = resumed ? { ...resumed.cursor } : { x: 0, y: 0 };
  let activeButton = null;   // 0 or 2 while dragging
  let lastStrokeCell = null; // to avoid re-extending the same cell
  let solved = resumed ? resumed.solved : false;
  let solvedLogged = resumed ? resumed.solvedLogged : false;
  // Progressive hint state: H reveals point -> name -> show, uncapped and zero-penalty.
  let hint = resumed ? resumed.hint : null;
  let hintStage = resumed ? resumed.hintStage : 0;
  let enterElapsed = 0; // when this card opened (for the blurb intro)
  // HOUSE RULES: opt-in mistake penalty (only when the shelf's twist carries the rule).
  const penalty = !!(twist.rules && twist.rules.penalty);
  const maxStrikes = penalty ? (twist.rules.maxStrikes || 3) : 0;
  let strikes = resumed ? resumed.strikes : 0;
  let strikeFlash = null; // { x, y, at } — the last wrong stitch, for a brief madder ring
  let tornAt = -1;        // elapsed when the cloth last tore (re-warp message window)

  // Enforce the penalty: any laid stitch that is off-pattern is struck through (the floor
  // supervisor marks the true bare warp), and three strikes tears the cloth back to a bare
  // loom. Puzzles are guess-free, so a careful solver never strikes; this is pure opt-in
  // stakes and never touches the uncapped, zero-penalty hint system.
  function applyPenalty(app) {
    if (!penalty) return;
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (board.isMistake(x, y)) {
          // The struck cross is the consequence of the bad stitch, not a second player
          // action. Keeping both in one history entry makes one undo restore pre-mistake
          // cloth while the strike tally remains part of the session's history.
          board.amendLastStrokePrimary(x, y, CELL_CROSSED);
          strikes++;
          strikeFlash = { x, y, at: app.elapsed };
          app.log.info(`house-rules: strike ${strikes}/${maxStrikes} (row ${y + 1} col ${x + 1})`, Math.round(app.elapsed));
        }
      }
    }
    if (strikes >= maxStrikes) {
      board.reset();
      strikes = 0;
      tornAt = app.elapsed;
      strikeFlash = null;
      clearHint();
      app.log.info('house-rules: the cloth tore - re-warp and begin again', Math.round(app.elapsed));
    }
  }

  function requestHint(app) {
    const h = twist.hint(board);
    // A fresh subject resets the disclosure; repeats deepen it (max stage 3).
    if (!hint || hint.kind !== h.kind || hint.lineKind !== h.lineKind || hint.lineIndex !== h.lineIndex) {
      hint = h;
      hintStage = 1;
    } else {
      hintStage = Math.min(3, hintStage + 1);
    }
    app.log.info(`hint: ${h.kind} ${h.message || ''}`.trim(), Math.round(app.elapsed));
  }

  function clearHint() { hint = null; hintStage = 0; }

  // MIRROR-WEAVE: weave the other side of the fold. Any laid stitch or bare-warp cross is
  // copied to its mirror when that mirror is still blank; the grid is symmetric, so the
  // mirror mark is always the correct one. Run only once a stroke has settled.
  function applyFold(app) {
    if (!fold) return;
    const w = board.width, h = board.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const prim = board.primaryAt(x, y);
        if (prim !== CELL_FILLED && prim !== CELL_CROSSED) continue;
        const m = mirrorImage(x, y, fold, w, h);
        if (m.x === x && m.y === y) continue; // on the axis
        if (board.primaryAt(m.x, m.y) !== 0) continue; // mirror already marked
        // The far-side mark is part of the originating stroke. Undo therefore drains the
        // whole fold atomically and reconciliation never manufactures an undo entry.
        board.amendLastStrokePrimary(m.x, m.y, prim);
      }
    }
  }

  function ensureLayout(fb) {
    const size = `${fb.width}x${fb.height}`;
    if (!layout || layoutSize !== size) {
      layout = computeLayout(motif.puzzle, patternRoomWorkLayout(fb).board, displayClues);
      layoutSize = size;
    }
    return layout;
  }

  function ensureArt(fb) {
    if (!artCache || artCache.width !== fb.width || artCache.height !== fb.height) {
      artCache = new Framebuffer(fb.width, fb.height);
      composePatternRoomWorkSurface(artCache, {
        drawer,
        title: motif.name,
        band: `${tierLabel}  -  NO GUESSING`,
      });
      artStats.builds++;
    }
    return artCache;
  }

  function clampCursor() {
    cursor.x = Math.max(0, Math.min(motif.puzzle.width - 1, cursor.x));
    cursor.y = Math.max(0, Math.min(motif.puzzle.height - 1, cursor.y));
  }

  return {
    _board: board, // exposed for tests + save/resume wiring later
    _artStats: artStats,

    saveState() {
      const boardState = board.saveState();
      if (!boardState || activeButton !== null) return null;
      return {
        scene: 'play', cardId: motif.id, board: boardState, cursor: { ...cursor },
        solved, solvedLogged, hint, hintStage, strikes,
      };
    },

    enter(app) {
      ensureLayout(app.fb);
      enterElapsed = app.elapsed;
      app.log.info(`play: ${motif.name} loaded (${motif.puzzle.width}x${motif.puzzle.height})`, Math.round(app.elapsed));
    },

    update(app, _dt, frame) {
      const input = app.input;
      ensureLayout(app.fb);

      // Pointer -> hovered cell (updates the crosshair, drives mouse strokes).
      const hovered = input.pointer.inside ? hitTest(layout, input.pointer.x, input.pointer.y) : null;
      if (hovered) { cursor.x = hovered.x; cursor.y = hovered.y; }

      // Mouse: begin strokes on button press.
      for (const b of frame.pressedButtons) {
        if ((b === LMB || b === RMB) && hovered) {
          board.beginStroke(hovered.x, hovered.y, b === LMB ? 'fill' : 'cross');
          activeButton = b;
          lastStrokeCell = `${hovered.x},${hovered.y}`;
        }
      }
      // Extend the active stroke as the pointer moves to new cells.
      if (activeButton !== null && input.isButtonDown(activeButton) && hovered) {
        const key = `${hovered.x},${hovered.y}`;
        if (key !== lastStrokeCell) {
          board.extendStroke(hovered.x, hovered.y);
          lastStrokeCell = key;
          clearHint();
        }
      }
      // End the stroke on release.
      for (const b of frame.releasedButtons) {
        if (b === activeButton) {
          board.endStroke();
          activeButton = null;
          lastStrokeCell = null;
        }
      }

      // Keyboard: full-keyboard play.
      for (const code of frame.pressedKeys) {
        switch (code) {
          case 'ArrowLeft': cursor.x--; clampCursor(); break;
          case 'ArrowRight': cursor.x++; clampCursor(); break;
          case 'ArrowUp': cursor.y--; clampCursor(); break;
          case 'ArrowDown': cursor.y++; clampCursor(); break;
          case 'Space': case 'KeyF': board.toggleFill(cursor.x, cursor.y); clearHint(); break;
          case 'KeyX': board.toggleCross(cursor.x, cursor.y); clearHint(); break;
          case 'KeyP': board.togglePencilFill(cursor.x, cursor.y); break;
          case 'KeyZ': board.undo(); clearHint(); break;
          case 'KeyR': case 'KeyY': board.redo(); clearHint(); break;
          case 'KeyH': requestHint(app); break;
          case 'Escape': if (leave) { leave(app); return; } break;
          case 'KeyN': if (leave) { leave(app); return; } break;
          case 'Enter': if (solved && leave) { leave(app); return; } break;
          default: break;
        }
      }

      // Twist reconciliation once the current stroke has settled (never mid-drag).
      if (fold && activeButton === null) applyFold(app);
      if (penalty && activeButton === null) applyPenalty(app);

      if (!solved && board.isSolved()) {
        solved = true;
        if (!solvedLogged) {
          app.progress.add(motif.id); // cut the punch card into the index
          app.log.info(`play: ${motif.name} woven (pattern complete)`, Math.round(app.elapsed));
          solvedLogged = true;
        }
      } else if (solved && !board.isSolved()) {
        solved = false; // undo past completion
      }
    },

    render(app, fb) {
      const l = ensureLayout(fb);
      fb.data.set(ensureArt(fb).data);
      drawPatternRoomRulePlate(fb, solved ? `${motif.name} - WOVEN` : (twist.marginLabel || ''));

      if (solved) {
        const region = patternRoomWorkLayout(fb).board;
        // Story payoff: if this card completed a set, the whole panel assembles; otherwise
        // the card's own working stitches become finished cloth (M2 woven reveal).
        const panel = completedPanelFor(motif.id, app.progress);
        if (panel) {
          drawReveal(fb, composePanel(panel, cardsById()), region);
          drawPatternRoomRulePlate(fb, `${panel.name} - SET COMPLETE`);
        } else {
          drawReveal(fb, motif.puzzle, region);
        }
      } else {
        drawBoard(fb, board, l, cursor, displayClues);
        if (fold) drawFoldLine(fb, l, fold, motif.puzzle);
        // Progressive hint overlay: stage 1 points at the line, stage 2 names the
        // technique, stage 3 shows the exact cell. Zero-penalty, always available (H).
        if (hint) drawHintOverlay(fb, l, hint, hintStage);
        // HOUSE RULES: the floor supervisor's tally, a brief ring on the last wrong stitch,
        // and a torn-cloth notice after a re-warp.
        if (penalty) {
          const wl = patternRoomWorkLayout(fb);
          const dotY = wl.board.y + 5;
          const dotLabelX = wl.board.x + 6;
          drawText(fb, dotLabelX, dotY + 1, 'STRIKES', PALETTE.inkSoft, 1, 1);
          const dotX0 = dotLabelX + measureText('STRIKES', 1, 1) + 5;
          for (let i = 0; i < maxStrikes; i++) {
            const cx = dotX0 + i * 9;
            const on = i < strikes;
            const c = on ? PALETTE.madder : PALETTE.brassDark;
            fb.fillRect(cx, dotY, 6, 6, c[0], c[1], c[2], 255);
            fb.strokeRect(cx, dotY, 6, 6, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2]);
          }
          if (strikeFlash && app.elapsed - strikeFlash.at < 700) {
            ringCell(fb, l, strikeFlash.x, strikeFlash.y, PALETTE.madder);
          }
          if (tornAt >= 0 && app.elapsed - tornAt < 2200) {
            hintStrip(fb, 'THE CLOTH TORE - RE-WARP AND BEGIN AGAIN', [230, 150, 140]);
          }
        }
      }

      // Footer controls hint (functional, shop-floor).
      const help = solved
        ? (leave ? 'PATTERN WOVEN  -  ENTER OR ESC RETURNS TO THE INDEX' : 'PATTERN COMPLETE - WOVEN')
        : 'LMB FILL  RMB CROSS  P PENCIL  Z UNDO  H HINT  ESC INDEX';
      // ink, not inkSoft: the control legend sits on the manila job ticket, where
      // inkSoft measures 3.55:1. Same graphite family, 5.59:1.
      const col = solved ? PALETTE.brassLit : PALETTE.ink;
      if (solved) {
        // A brass completion plate over the board.
        const w = measureText(help, 2, 1);
        const px = Math.round((fb.width - w) / 2) - 8;
        const py = patternRoomWorkLayout(fb).footerY - 2;
        const ph = textHeight(2) + 8;
        fb.fillRect(px, py - 4, w + 16, ph, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 230);
        fb.strokeRect(px, py - 4, w + 16, ph, PALETTE.brassLit[0], PALETTE.brassLit[1], PALETTE.brassLit[2]);
        drawTextCentered(fb, 0, fb.width, py, help, col, 2, 1);
      } else {
        const wl = patternRoomWorkLayout(fb);
        drawTextCentered(fb, wl.frame.x, wl.frame.w, wl.footerY, help, col, 1, 1);
      }

      // House-voice card intro: the motif's blurb on a manila slip for the first moments
      // after the card opens (the M2 house frame; charm, not lore-dump).
      if (motif.blurb && !solved && app.elapsed - enterElapsed < 3600) {
        const w = measureBodyText(motif.blurb);
        const px = Math.round((fb.width - w) / 2) - 8;
        const py = 28;
        fb.fillRect(px, py - 4, w + 16, 16, PALETTE.manila[0], PALETTE.manila[1], PALETTE.manila[2], 235);
        fb.strokeRect(px, py - 4, w + 16, 16, PALETTE.manilaShade[0], PALETTE.manilaShade[1], PALETTE.manilaShade[2]);
        drawBodyTextCentered(fb, 0, fb.width, py, motif.blurb, PALETTE.ink);
      }
    },
  };
}
