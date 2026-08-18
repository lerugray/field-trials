// THE JACQUARD INDEX — the TWO-THREAD play scene (the coloured machine, playable).
//
// A dedicated scene for the coloured shelf: the player weaves TWO threads. An ACTIVE thread
// (one or two) is selected; left-drag lays it, right-drag crosses bare warp. Full keyboard
// play: arrows move, 1/2 pick the active thread, F/Space lay it, X cross, Z/R undo/redo, H
// hint, Esc index. Threads read by SHAPE (solid vs ring), never hue alone (hard-rule 6). On
// completion the pattern is declared woven and rendered as finished two-colour cloth.

import { ColoredBoard, CB_A, CB_B, CB_CROSS } from '../puzzle/coloredBoard.js';
import { nextColoredHint } from '../puzzle/twothread.js';
import { cardBand } from '../puzzle/twists.js';
import {
  computeColoredLayout, hitTestColored, drawColoredBoard, drawStitchA, drawStitchB,
} from '../render/coloredBoardView.js';
import { Framebuffer } from '../gfx/framebuffer.js';
import { PALETTE } from '../gfx/palette.js';
import { drawText, drawTextCentered, measureText, textHeight } from '../gfx/font.js';
import { drawBodyTextCentered, measureBodyText } from '../gfx/bodyFont.js';
import {
  composePatternRoomWorkSurface, drawPatternRoomRulePlate, patternRoomWorkLayout,
  drawHintStrip as hintStrip,
} from '../render/patternRoom.js';

const LMB = 0, RMB = 2;

function ringCell(fb, layout, cx, cy, color) {
  const x = layout.gridX + cx * layout.cell, y = layout.gridY + cy * layout.cell;
  fb.strokeRect(x - 1, y - 1, layout.cell + 2, layout.cell + 2, color[0], color[1], color[2]);
  fb.strokeRect(x, y, layout.cell, layout.cell, color[0], color[1], color[2]);
}


export function makeTwoThreadScene(card, opts = {}) {
  const board = new ColoredBoard(card);
  const resumed = opts.resume || null;
  if (resumed) board.restoreState(resumed.board);
  const leave = typeof opts.onExit === 'function' ? opts.onExit : (typeof opts.onAdvance === 'function' ? opts.onAdvance : null);
  const band = cardBand(card);
  let layout = null;
  let layoutSize = '';
  let artCache = null;
  const artStats = { builds: 0 };
  const cursor = resumed ? { ...resumed.cursor } : { x: 0, y: 0 };
  let active = resumed ? resumed.activeThread : CB_A; // the selected thread
  let activeButton = null;
  let lastCell = null;
  let solved = resumed ? resumed.solved : false;
  let solvedLogged = resumed ? resumed.solvedLogged : false;
  let hint = resumed ? resumed.hint : null;
  let hintStage = resumed ? resumed.hintStage : 0;
  let enterElapsed = 0;

  function ensureLayout(fb) {
    const size = `${fb.width}x${fb.height}`;
    if (!layout || layoutSize !== size) {
      const work = patternRoomWorkLayout(fb).board;
      // Coloured clues stack a number and shape swatch; reserve an extra strip so their
      // tallest column never rises into the physical rule plate.
      layout = computeColoredLayout(card, { ...work, y: work.y + 12, h: work.h - 12 });
      layoutSize = size;
    }
    return layout;
  }
  function ensureArt(fb) {
    if (!artCache || artCache.width !== fb.width || artCache.height !== fb.height) {
      artCache = new Framebuffer(fb.width, fb.height);
      const guarantee = band.tier ? `TIER ${band.tier}` : (band.ok ? 'CERTIFIED' : 'UNCERTIFIED');
      composePatternRoomWorkSurface(artCache, {
        drawer: 1,
        title: card.name,
        band: `${guarantee}  -  NO GUESSING`,
      });
      artStats.builds++;
    }
    return artCache;
  }
  function clampCursor() {
    cursor.x = Math.max(0, Math.min(card.width - 1, cursor.x));
    cursor.y = Math.max(0, Math.min(card.height - 1, cursor.y));
  }
  function clearHint() { hint = null; hintStage = 0; }
  function requestHint(app) {
    const h = nextColoredHint(card.width, card.height, card.colored.rowClues, card.colored.colClues, board.marks, board.solution);
    if (!hint || hint.kind !== h.kind || hint.lineKind !== h.lineKind || hint.lineIndex !== h.lineIndex) { hint = h; hintStage = 1; }
    else hintStage = Math.min(3, hintStage + 1);
    app.log.info(`hint: ${h.kind} ${h.message || ''}`.trim(), Math.round(app.elapsed));
  }

  return {
    _board: board,
    _artStats: artStats,

    saveState() {
      const boardState = board.saveState();
      if (!boardState || activeButton !== null) return null;
      return {
        scene: 'two-thread', cardId: card.id, board: boardState, cursor: { ...cursor },
        activeThread: active, solved, solvedLogged, hint, hintStage,
      };
    },

    enter(app) {
      ensureLayout(app.fb);
      enterElapsed = app.elapsed;
      app.log.info(`two-thread: ${card.name} loaded (${card.width}x${card.height})`, Math.round(app.elapsed));
    },

    update(app, _dt, frame) {
      const input = app.input;
      ensureLayout(app.fb);
      const hovered = input.pointer.inside ? hitTestColored(layout, input.pointer.x, input.pointer.y) : null;
      if (hovered) { cursor.x = hovered.x; cursor.y = hovered.y; }

      for (const b of frame.pressedButtons) {
        if ((b === LMB || b === RMB) && hovered) {
          board.beginStroke(hovered.x, hovered.y, b === LMB ? active : CB_CROSS);
          activeButton = b; lastCell = `${hovered.x},${hovered.y}`; clearHint();
        }
      }
      if (activeButton !== null && input.isButtonDown(activeButton) && hovered) {
        const key = `${hovered.x},${hovered.y}`;
        if (key !== lastCell) { board.extendStroke(hovered.x, hovered.y); lastCell = key; }
      }
      for (const b of frame.releasedButtons) {
        if (b === activeButton) { board.endStroke(); activeButton = null; lastCell = null; }
      }

      for (const code of frame.pressedKeys) {
        switch (code) {
          case 'ArrowLeft': cursor.x--; clampCursor(); break;
          case 'ArrowRight': cursor.x++; clampCursor(); break;
          case 'ArrowUp': cursor.y--; clampCursor(); break;
          case 'ArrowDown': cursor.y++; clampCursor(); break;
          case 'Digit1': active = CB_A; break;
          case 'Digit2': active = CB_B; break;
          case 'Space': case 'KeyF': board.place(cursor.x, cursor.y, active); clearHint(); break;
          case 'KeyX': board.place(cursor.x, cursor.y, CB_CROSS); clearHint(); break;
          case 'KeyZ': board.undo(); clearHint(); break;
          case 'KeyR': case 'KeyY': board.redo(); clearHint(); break;
          case 'KeyH': requestHint(app); break;
          case 'Escape': case 'KeyN': if (leave) { leave(app); return; } break;
          case 'Enter': if (solved && leave) { leave(app); return; } break;
          default: break;
        }
      }

      if (!solved && board.isSolved()) {
        solved = true;
        if (!solvedLogged) { app.progress.add(card.id); app.log.info(`two-thread: ${card.name} woven`, Math.round(app.elapsed)); solvedLogged = true; }
      } else if (solved && !board.isSolved()) solved = false;
    },

    render(app, fb) {
      const l = ensureLayout(fb);
      fb.data.set(ensureArt(fb).data);
      drawPatternRoomRulePlate(
        fb,
        solved ? `${card.name} - WOVEN` : 'TWO-THREAD - COUNT EACH THREAD ON ITS OWN',
      );

      if (!solved) {
        drawColoredBoard(fb, board, l, cursor, card);

        // Active-thread indicator (which thread the loom will lay), shape + label.
        const swX = patternRoomWorkLayout(fb).board.x + 6, swY = patternRoomWorkLayout(fb).board.y + 5, sw = 8;
        drawText(fb, swX, swY + 1, 'LAYING', PALETTE.inkSoft, 1, 1);
        const ax = swX + measureText('LAYING', 1, 1) + 5;
        if (active === CB_A) { fb.fillRect(ax, swY, sw, sw, PALETTE.indigo[0], PALETTE.indigo[1], PALETTE.indigo[2], 255); }
        else { fb.fillRect(ax, swY, sw, sw, PALETTE.madder[0], PALETTE.madder[1], PALETTE.madder[2], 255); const hh = 3, h0 = Math.floor((sw - hh) / 2); fb.fillRect(ax + h0, swY + h0, hh, hh, PALETTE.manila[0], PALETTE.manila[1], PALETTE.manila[2], 255); }
        // inkSoft, not linen: linen on the pattern paper measured 1.15:1 contrast, which is
        // functionally invisible - and this is the one label telling the player which
        // thread the loom will lay. inkSoft matches the LAYING label beside it, at 5.93:1.
        drawText(fb, ax + sw + 4, swY + 1, active === CB_A ? 'ONE' : 'TWO', PALETTE.inkSoft, 1, 1);

        if (hint) {
          if (hint.kind === 'mistake') { ringCell(fb, l, hint.cell.x, hint.cell.y, PALETTE.madder); hintStrip(fb, hint.message, [230, 150, 140]); }
          else if (hint.kind === 'deduction') {
            const cell = l.cell;
            const [br, bg, bb] = PALETTE.brassLit;
            if (hint.lineKind === 'row') fb.fillRect(l.gridX, l.gridY + hint.lineIndex * cell, l.width * cell, cell, br, bg, bb, 70);
            else fb.fillRect(l.gridX + hint.lineIndex * cell, l.gridY, cell, l.height * cell, br, bg, bb, 70);
            let text = hint.point;
            if (hintStage >= 2) text = `${hint.point}  ${hint.name}`;
            if (hintStage >= 3) { text = hint.message; ringCell(fb, l, hint.cells[0].x, hint.cells[0].y, PALETTE.brassLit); }
            hintStrip(fb, text, PALETTE.brassLit);
          }
        }
      } else {
        // Woven two-colour cloth payoff.
        const region = patternRoomWorkLayout(fb).board;
        const cell = Math.max(8, Math.floor(Math.min(region.w / card.width, region.h / card.height)));
        const ox = region.x + Math.floor((region.w - card.width * cell) / 2);
        const oy = region.y + Math.floor((region.h - card.height * cell) / 2);
        for (let y = 0; y < card.height; y++) for (let x = 0; x < card.width; x++) {
          const v = card.colored.grid[y * card.width + x];
          if (v === CB_A) drawStitchA(fb, ox + x * cell, oy + y * cell, cell);
          else if (v === CB_B) drawStitchB(fb, ox + x * cell, oy + y * cell, cell);
        }
      }

      const help = solved
        ? (leave ? 'PATTERN WOVEN  -  ENTER OR ESC RETURNS TO THE INDEX' : 'PATTERN COMPLETE - WOVEN')
        : '1 / 2 PICK THREAD  LMB LAY  RMB CROSS  Z UNDO  H HINT  ESC INDEX';
      if (solved) {
        const w = measureText(help, 2, 1), px = Math.round((fb.width - w) / 2) - 8, py = patternRoomWorkLayout(fb).footerY - 2;
        const ph = textHeight(2) + 8;
        fb.fillRect(px, py - 4, w + 16, ph, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 230);
        fb.strokeRect(px, py - 4, w + 16, ph, PALETTE.brassLit[0], PALETTE.brassLit[1], PALETTE.brassLit[2]);
        drawTextCentered(fb, 0, fb.width, py, help, PALETTE.brassLit, 2, 1);
      } else {
        const wl = patternRoomWorkLayout(fb);
        drawTextCentered(fb, wl.frame.x, wl.frame.w, wl.footerY, help, PALETTE.ink, 1, 1);
      }

      if (card.blurb && !solved && app.elapsed - enterElapsed < 3600) {
        const w = measureBodyText(card.blurb);
        const px = Math.round((fb.width - w) / 2) - 8;
        const py = fb.height - 50;
        fb.fillRect(px, py - 4, w + 16, 16, PALETTE.manila[0], PALETTE.manila[1], PALETTE.manila[2], 235);
        fb.strokeRect(px, py - 4, w + 16, 16, PALETTE.manilaShade[0], PALETTE.manilaShade[1], PALETTE.manilaShade[2]);
        drawBodyTextCentered(fb, 0, fb.width, py, card.blurb, PALETTE.ink);
      }
    },
  };
}
