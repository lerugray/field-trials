// input.js: board interaction handlers for LINES OF ADVANCE M4.
// Click/tap to select, click destination or drag to move; keyboard nudge.

import { selectPiece, clearSelection, xyFromCoord, pieceAt, findPiece, coordFromXY } from './state.js';
import { tryTurnMove, applyCombat, applyArsenalCapture, applyRetreat, isInRetreatPhase, currentPendingRetreat, canMovePiece, canDeclareAttack } from './turn.js';
import { isArsenal, arsenalSide } from './terrain.js';
import { getLegalMoves } from './movement.js';
import { adjacentUnoccupiedSquares } from './combat.js';

function makeInputHandlers(boardApi, getState, setState, audio, diagnostics = null) {
  let dragging = null;
  let dragId = null;
  let suppressClick = false;

  function humanCanAct(state) {
    return state.sandbox || state.settings?.engineSide !== state.turn;
  }

  function squareFromEvent(evt) {
    const target = evt.target.closest('[data-coord]');
    if (!target) return null;
    const coord = target.getAttribute('data-coord');
    return xyFromCoord(coord);
  }

  function pieceIdAtSquare(state, square) {
    if (!square) return null;
    const p = pieceAt(state, square.x, square.y);
    return p ? p.id : null;
  }

  function commit(next) {
    requestAnimationFrame(() => setState(next));
  }

  function resolveTurn(kind, data, work) {
    if (diagnostics && typeof diagnostics.guard === 'function') {
      return diagnostics.guard('turn-resolution', { kind, ...data }, work);
    }
    return work();
  }

  function note(name, data) {
    try {
      if (diagnostics && typeof diagnostics[name] === 'function') diagnostics[name](data);
    } catch {
      // Diagnostics must never interfere with input.
    }
  }

  function doSelect(id) {
    const state = getState();
    if (audio) audio.playSelect();
    commit(selectPiece(state, id));
  }

  function legalMoveSquares(state, pieceId) {
    if (isInRetreatPhase(state)) {
      const retreat = currentPendingRetreat(state);
      if (!retreat || retreat.id !== pieceId) return [];
      const p = findPiece(state, pieceId);
      if (!p) return [];
      return retreatDestinationsFor(state, retreat);
    }
    if (!canMovePiece(state, pieceId)) return [];
    return getLegalMoves(state, pieceId);
  }

  function retreatDestinationsFor(state, retreat) {
    const p = findPiece(state, retreat.id);
    if (!p) return [];
    return adjacentUnoccupiedSquares(state, p);
  }

  function isRetreatDestination(state, square) {
    const retreat = currentPendingRetreat(state);
    if (!retreat) return false;
    return retreatDestinationsFor(state, retreat).some(d => d.x === square.x && d.y === square.y);
  }

  function handleMoveOrAttack(state, pieceId, square) {
    if (isInRetreatPhase(state)) {
      if (!isRetreatDestination(state, square)) {
        if (audio) audio.playError();
        return state;
      }
      const piece = findPiece(state, pieceId);
      const result = resolveTurn('retreat', { pieceId },
        () => applyRetreat(state, pieceId, square.x, square.y));
      if (result.error) {
        if (audio) audio.playError();
      } else {
        if (audio) audio.playMove();
        note('order', {
          pieceId,
          from: piece ? coordFromXY(piece.x, piece.y) : null,
          to: coordFromXY(square.x, square.y),
          kind: 'retreat'
        });
      }
      return clearSelection(result.state);
    }

    const clickedPiece = pieceIdAtSquare(state, square);
    if (clickedPiece) {
      const target = findPiece(state, clickedPiece);
      if (target && target.side !== state.turn) {
        // Enemy unit: preview/execute attack.
        if (state.hasAttacked) {
          if (audio) audio.playError();
          return state;
        }
        if (canDeclareAttack(state, clickedPiece)) {
          const from = findPiece(state, pieceId);
          const result = resolveTurn('combat', { pieceId, targetId: clickedPiece },
            () => applyCombat(state, clickedPiece));
          if (result.error) {
            if (audio) audio.playError();
            return clearSelection(state);
          }
          if (audio) audio.playCapture();
          note('order', {
            pieceId,
            from: from ? coordFromXY(from.x, from.y) : null,
            to: coordFromXY(target.x, target.y),
            kind: 'attack'
          });
          note('combat', result.combat);
          return clearSelection(result.state);
        }
        if (audio) audio.playError();
        return state;
      }
      // Own piece: selecting handled elsewhere.
      return state;
    }

    // Empty square: attempt move.
    const piece = findPiece(state, pieceId);
    const result = resolveTurn('move', { pieceId },
      () => tryTurnMove(state, pieceId, square.x, square.y));
    if (result.error) {
      if (audio) audio.playError();
      return state;
    }
    if (audio) audio.playMove();
    note('order', {
      pieceId,
      from: piece ? coordFromXY(piece.x, piece.y) : null,
      to: coordFromXY(square.x, square.y),
      kind: 'move'
    });
    return clearSelection(result.state);
  }

  function onPointerDown(evt) {
    const state = getState();
    if (!humanCanAct(state)) return;
    const square = squareFromEvent(evt);
    const id = pieceIdAtSquare(state, square);
    if (id) {
      dragging = { x: evt.clientX, y: evt.clientY };
      dragId = id;
    }
  }

  function onPointerUp(evt) {
    const state = getState();
    if (!humanCanAct(state)) return;
    const square = squareFromEvent(evt);
    const clickedId = pieceIdAtSquare(state, square);
    suppressClick = true;

    if (dragId && square) {
      const draggedPiece = findPiece(state, dragId);
      if (draggedPiece && draggedPiece.x === square.x && draggedPiece.y === square.y) {
        // Click (not drag) on the piece under the cursor. If a friendly unit is
        // already selected and this square is a legal enemy attack target,
        // commit the attack: the documented click-to-attack path.
        const selected = state.selectedId ? findPiece(state, state.selectedId) : null;
        if (
          selected
          && selected.side === state.turn
          && draggedPiece.side !== state.turn
          && !state.hasAttacked
          && canDeclareAttack(state, dragId)
        ) {
          commit(handleMoveOrAttack(state, state.selectedId, square));
        } else {
          doSelect(dragId);
        }
      } else if (isInRetreatPhase(state)) {
        const retreat = currentPendingRetreat(state);
        if (retreat && retreat.id === dragId) {
          commit(handleMoveOrAttack(state, dragId, square));
        } else {
          if (audio) audio.playError();
          commit(clearSelection(state));
        }
      } else if (state.selectedId === dragId || draggedPiece?.side === state.turn) {
        commit(handleMoveOrAttack(state, dragId, square));
      } else {
        doSelect(dragId);
      }
    } else if (clickedId) {
      doSelect(clickedId);
    } else if (square && state.selectedId) {
      commit(handleMoveOrAttack(state, state.selectedId, square));
    } else if (square) {
      commit(clearSelection(state));
    }

    dragging = null;
    dragId = null;
  }

  function onClick(evt) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const state = getState();
    if (!humanCanAct(state)) return;
    const square = squareFromEvent(evt);
    const id = pieceIdAtSquare(state, square);
    if (id) {
      const clicked = findPiece(state, id);
      if (clicked && clicked.side !== state.turn && state.selectedId && !state.hasAttacked) {
        // Clicking an enemy with a friendly selected attacks.
        commit(handleMoveOrAttack(state, state.selectedId, square));
        return;
      }
      // Clicking a selected friendly occupant of an enemy arsenal captures it as the attack.
      if (clicked && clicked.side === state.turn && state.selectedId === id && !state.hasAttacked
          && (state.movedThisTurn || []).includes(clicked.id)
          && !(state.retreatedThisTurn || []).includes(clicked.id)
          && isArsenal(clicked.x, clicked.y) && arsenalSide(clicked.x, clicked.y) !== clicked.side) {
        const result = resolveTurn('arsenal-capture', { pieceId: clicked.id },
          () => applyArsenalCapture(state, clicked.x, clicked.y));
        if (result.error) {
          if (audio) audio.playError();
          return;
        }
        if (audio) audio.playCapture();
        note('order', {
          pieceId: clicked.id,
          from: coordFromXY(clicked.x, clicked.y),
          to: coordFromXY(clicked.x, clicked.y),
          kind: 'arsenal-capture'
        });
        commit(clearSelection(result.state));
        return;
      }
      doSelect(id);
    } else if (square && state.selectedId) {
      commit(handleMoveOrAttack(state, state.selectedId, square));
    } else if (square) {
      commit(clearSelection(state));
    }
  }

  function onKeyDown(evt) {
    const state = getState();
    if (!humanCanAct(state)) return;
    if (isInRetreatPhase(state)) {
      const retreat = currentPendingRetreat(state);
      if (!retreat) return;
      const p = findPiece(state, retreat.id);
      if (!p) return;
      let dx = 0;
      let dy = 0;
      switch (evt.key) {
        case 'ArrowLeft': dx = -1; break;
        case 'ArrowRight': dx = 1; break;
        case 'ArrowUp': dy = 1; break;
        case 'ArrowDown': dy = -1; break;
        case 'Escape': commit(clearSelection(state)); return;
        default: return;
      }
      evt.preventDefault();
      commit(handleMoveOrAttack(state, retreat.id, { x: p.x + dx, y: p.y + dy }));
      return;
    }
    if (!state.selectedId) return;
    const piece = findPiece(state, state.selectedId);
    if (!piece) return;

    let dx = 0;
    let dy = 0;
    switch (evt.key) {
      case 'ArrowLeft': dx = -1; break;
      case 'ArrowRight': dx = 1; break;
      case 'ArrowUp': dy = 1; break;
      case 'ArrowDown': dy = -1; break;
      case 'Escape': commit(clearSelection(state)); return;
      default: return;
    }
    evt.preventDefault();
    commit(handleMoveOrAttack(state, piece.id, { x: piece.x + dx, y: piece.y + dy }));
  }

  boardApi.svg.addEventListener('pointerdown', onPointerDown);
  boardApi.svg.addEventListener('pointerup', onPointerUp);
  boardApi.svg.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);

  return {
    destroy() {
      boardApi.svg.removeEventListener('pointerdown', onPointerDown);
      boardApi.svg.removeEventListener('pointerup', onPointerUp);
      boardApi.svg.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    }
  };
}

export { makeInputHandlers };
