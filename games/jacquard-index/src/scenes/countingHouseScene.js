// THE JACQUARD INDEX — the COUNTING-HOUSE play scene (paired-row ledgers).
//
// Uses the base binary Board (the cells are ordinary threads) with AUTO-X OFF: the player is
// given only column clues + one ledger per row PAIR, so auto-crossing from the hidden row
// clues would leak information the twist withholds. The view draws the ledgers; hints replay
// the column/ledger deduction. On completion the pattern is the base woven reveal.

import { Board } from '../puzzle/board.js';
import { countingHouseClues, nextCountingHouseHint } from '../puzzle/countinghouse.js';
import { cardBand } from '../puzzle/twists.js';
import { computeCHLayout, hitTestCH, drawCHBoard } from '../render/countingHouseView.js';
import { drawReveal } from '../render/reveal.js';
import { Framebuffer } from '../gfx/framebuffer.js';
import { PALETTE } from '../gfx/palette.js';
import { drawText, drawTextCentered, measureText } from '../gfx/font.js';
import { drawBodyTextCentered, measureBodyText } from '../gfx/bodyFont.js';
import {
  composePatternRoomWorkSurface, drawPatternRoomRulePlate, patternRoomWorkLayout,
} from '../render/patternRoom.js';

const LMB = 0, RMB = 2;

function ringCell(fb, l, cx, cy, color) {
  const x = l.gridX + cx * l.cell, y = l.gridY + cy * l.cell;
  fb.strokeRect(x - 1, y - 1, l.cell + 2, l.cell + 2, color[0], color[1], color[2]);
  fb.strokeRect(x, y, l.cell, l.cell, color[0], color[1], color[2]);
}
function hintStrip(fb, text, color) {
  const y = fb.height - 32;
  fb.fillRect(0, y - 4, fb.width, 16, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 220);
  drawBodyTextCentered(fb, 0, fb.width, y, text, color);
}

export function makeCountingHouseScene(card, opts = {}) {
  const board = new Board(card.puzzle, { autoX: false });
  const leave = typeof opts.onExit === 'function' ? opts.onExit : (typeof opts.onAdvance === 'function' ? opts.onAdvance : null);
  const { colClues, pairClues } = countingHouseClues(card.puzzle);
  const band = cardBand(card);
  let layout = null;
  let layoutSize = '';
  let artCache = null;
  const artStats = { builds: 0 };
  const cursor = { x: 0, y: 0 };
  let activeButton = null, lastCell = null;
  let solved = false, solvedLogged = false;
  let hint = null, hintStage = 0, enterElapsed = 0;

  function ensureLayout(fb) {
    const size = `${fb.width}x${fb.height}`;
    if (!layout || layoutSize !== size) {
      layout = computeCHLayout(card.puzzle, colClues, pairClues, patternRoomWorkLayout(fb).board);
      layoutSize = size;
    }
    return layout;
  }
  function ensureArt(fb) {
    if (!artCache || artCache.width !== fb.width || artCache.height !== fb.height) {
      artCache = new Framebuffer(fb.width, fb.height);
      const guarantee = band.tier ? `TIER ${band.tier}` : (band.ok ? 'CERTIFIED' : 'UNCERTIFIED');
      composePatternRoomWorkSurface(artCache, {
        drawer: 2,
        title: card.name,
        band: `${guarantee}  -  NO GUESSING`,
      });
      artStats.builds++;
    }
    return artCache;
  }
  function clampCursor() { cursor.x = Math.max(0, Math.min(card.puzzle.width - 1, cursor.x)); cursor.y = Math.max(0, Math.min(card.puzzle.height - 1, cursor.y)); }
  function clearHint() { hint = null; hintStage = 0; }
  function requestHint(app) {
    const h = nextCountingHouseHint(card.puzzle, colClues, pairClues, board.primary);
    if (!hint || hint.kind !== h.kind || hint.lineKind !== h.lineKind || hint.lineIndex !== h.lineIndex) { hint = h; hintStage = 1; }
    else hintStage = Math.min(3, hintStage + 1);
    app.log.info(`hint: ${h.kind} ${h.message || ''}`.trim(), Math.round(app.elapsed));
  }

  return {
    _board: board,
    _artStats: artStats,
    enter(app) { ensureLayout(app.fb); enterElapsed = app.elapsed; app.log.info(`counting-house: ${card.name} loaded`, Math.round(app.elapsed)); },

    update(app, _dt, frame) {
      const input = app.input; ensureLayout(app.fb);
      const hovered = input.pointer.inside ? hitTestCH(layout, input.pointer.x, input.pointer.y) : null;
      if (hovered) { cursor.x = hovered.x; cursor.y = hovered.y; }
      for (const b of frame.pressedButtons) {
        if ((b === LMB || b === RMB) && hovered) { board.beginStroke(hovered.x, hovered.y, b === LMB ? 'fill' : 'cross'); activeButton = b; lastCell = `${hovered.x},${hovered.y}`; clearHint(); }
      }
      if (activeButton !== null && input.isButtonDown(activeButton) && hovered) {
        const key = `${hovered.x},${hovered.y}`;
        if (key !== lastCell) { board.extendStroke(hovered.x, hovered.y); lastCell = key; }
      }
      for (const b of frame.releasedButtons) { if (b === activeButton) { board.endStroke(); activeButton = null; lastCell = null; } }

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
          case 'Escape': case 'KeyN': if (leave) { leave(app); return; } break;
          case 'Enter': if (solved && leave) { leave(app); return; } break;
          default: break;
        }
      }
      if (!solved && board.isSolved()) { solved = true; if (!solvedLogged) { app.progress.add(card.id); app.log.info(`counting-house: ${card.name} woven`, Math.round(app.elapsed)); solvedLogged = true; } }
      else if (solved && !board.isSolved()) solved = false;
    },

    render(app, fb) {
      const l = ensureLayout(fb);
      fb.data.set(ensureArt(fb).data);
      drawPatternRoomRulePlate(
        fb,
        solved ? `${card.name} - WOVEN` : 'COUNTING-HOUSE - ONE LEDGER PER ROW PAIR',
      );

      if (!solved) {
        drawCHBoard(fb, board, l, cursor, card.puzzle, colClues, pairClues);
        if (hint) {
          if (hint.kind === 'mistake') { ringCell(fb, l, hint.cell.x, hint.cell.y, PALETTE.madder); hintStrip(fb, hint.message, [230, 150, 140]); }
          else if (hint.kind === 'deduction') {
            let text = hint.point;
            if (hintStage >= 2) text = `${hint.point}  ${hint.name}`;
            if (hintStage >= 3) { text = hint.message; ringCell(fb, l, hint.cells[0].x, hint.cells[0].y, PALETTE.brassLit); }
            hintStrip(fb, text, PALETTE.brassLit);
          }
        }
      } else {
        drawReveal(fb, card.puzzle, patternRoomWorkLayout(fb).board);
      }

      const help = solved
        ? (leave ? 'PATTERN WOVEN  -  ENTER OR ESC RETURNS TO THE INDEX' : 'PATTERN COMPLETE - WOVEN')
        : 'LMB FILL  RMB CROSS  Z UNDO  H HINT  ESC INDEX';
      if (solved) {
        const w = measureText(help, 2, 1), px = Math.round((fb.width - w) / 2) - 8, py = patternRoomWorkLayout(fb).footerY - 2;
        fb.fillRect(px, py - 4, w + 16, 20, PALETTE.brassDark[0], PALETTE.brassDark[1], PALETTE.brassDark[2], 230);
        fb.strokeRect(px, py - 4, w + 16, 20, PALETTE.brassLit[0], PALETTE.brassLit[1], PALETTE.brassLit[2]);
        drawTextCentered(fb, 0, fb.width, py, help, PALETTE.brassLit, 2, 1);
      } else {
        const wl = patternRoomWorkLayout(fb);
        drawTextCentered(fb, wl.frame.x, wl.frame.w, wl.footerY, help, PALETTE.inkSoft, 1, 1);
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
