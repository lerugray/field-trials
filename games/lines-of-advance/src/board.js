// board.js: SVG rendering for the LINES OF ADVANCE board.
// All visuals are code-drawn; no image assets.

import {
  BOARD_COLS,
  BOARD_ROWS,
  coordFromXY,
  xyFromCoord,
  pieceAt,
  isFighter,
  isRelay
} from './state.js';
import { isMountain, isFort, isPass, isArsenal, arsenalSide, fortSide } from './terrain.js';
import { getLegalMoves } from './movement.js';
import { lineSquaresExclusive, isAligned } from './comms.js';
import { isInRetreatPhase, currentPendingRetreat, canDeclareAttack } from './turn.js';
import { computeCombat, adjacentUnoccupiedSquares } from './combat.js';

const MARGIN = 18;
const SQUARE_SIZE = 28;
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;
const PIECE_STYLES = Object.freeze(['default', 'nato', 'chess']);
const SUPPLY_COVERAGE_MODES = Object.freeze(['off', 'my', 'enemy']);

function nextSupplyCoverageMode(mode) {
  const index = SUPPLY_COVERAGE_MODES.indexOf(mode);
  return SUPPLY_COVERAGE_MODES[(index + 1) % SUPPLY_COVERAGE_MODES.length];
}

function supplyCoverageSide(mode, turn) {
  if (mode === 'my') return turn;
  if (mode === 'enemy') return turn === 'North' ? 'South' : 'North';
  return null;
}

function normalizePieceStyle(style) {
  return PIECE_STYLES.includes(style) ? style : 'default';
}

function normalizeZoom(value) {
  if (!Number.isFinite(value)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

function zoomFromWheel(current, deltaY) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return normalizeZoom(current);
  return normalizeZoom(current + (deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
}

function zoomFromPinch(startZoom, startDistance, currentDistance) {
  if (!Number.isFinite(startDistance) || startDistance <= 0 || !Number.isFinite(currentDistance)) {
    return normalizeZoom(startZoom);
  }
  return normalizeZoom(startZoom * (currentDistance / startDistance));
}

function createSVGElement(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'textContent') {
      el.textContent = val;
    } else {
      el.setAttribute(key, val);
    }
  }
  return el;
}

function classSymbol(cls) {
  const map = {
    Infantry: 'I',
    Cavalry: 'C',
    'Foot Artillery': 'A',
    'Mounted Artillery': 'A',
    'Foot Relay': 'R',
    'Mounted Relay': 'R'
  };
  return map[cls] || '?';
}

function svgPoint(x, y) {
  return {
    x: MARGIN + x * SQUARE_SIZE + SQUARE_SIZE / 2,
    y: (BOARD_ROWS - 1 - y) * SQUARE_SIZE + SQUARE_SIZE / 2
  };
}

function renderGrid(boardGroup) {
  const width = BOARD_COLS * SQUARE_SIZE;
  const height = BOARD_ROWS * SQUARE_SIZE;

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLS; x += 1) {
      const rect = createSVGElement('rect', {
        x: x * SQUARE_SIZE,
        y: (BOARD_ROWS - 1 - y) * SQUARE_SIZE,
        width: SQUARE_SIZE,
        height: SQUARE_SIZE,
        class: `square ${(x + y) % 2 === 0 ? 'light' : 'dark'}`,
        'data-x': x,
        'data-y': y,
        'data-coord': coordFromXY(x, y)
      });
      boardGroup.appendChild(rect);
    }
  }

  // Coordinate labels along edges.
  for (let x = 0; x < BOARD_COLS; x += 1) {
    boardGroup.appendChild(createSVGElement('text', {
      x: x * SQUARE_SIZE + SQUARE_SIZE / 2,
      y: height + MARGIN - 6,
      class: 'coord-label',
      'text-anchor': 'middle',
      textContent: String.fromCharCode(97 + x)
    }));
  }
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    boardGroup.appendChild(createSVGElement('text', {
      x: 6,
      y: (BOARD_ROWS - 1 - y) * SQUARE_SIZE + SQUARE_SIZE / 2 + 3,
      class: 'coord-label',
      textContent: String(y + 1)
    }));
  }
}

function renderTerrain(terrainGroup, state) {
  terrainGroup.innerHTML = '';
  const pieceStyle = normalizePieceStyle(state.settings?.pieceStyle);
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLS; x += 1) {
      const px = x * SQUARE_SIZE;
      const py = (BOARD_ROWS - 1 - y) * SQUARE_SIZE;
      const cx = px + SQUARE_SIZE / 2;
      const cy = py + SQUARE_SIZE / 2;

      if (isMountain(x, y)) {
        const g = createSVGElement('g', { class: 'terrain-mountain' });
        g.appendChild(createSVGElement('rect', {
          x: px + 1, y: py + 1, width: SQUARE_SIZE - 2, height: SQUARE_SIZE - 2,
          class: 'mountain-fill'
        }));
        g.appendChild(createSVGElement('line', {
          x1: px + 4, y1: py + SQUARE_SIZE - 4,
          x2: px + SQUARE_SIZE / 2, y2: py + 4,
          class: 'mountain-hatch'
        }));
        g.appendChild(createSVGElement('line', {
          x1: px + SQUARE_SIZE / 2, y1: py + 4,
          x2: px + SQUARE_SIZE - 4, y2: py + SQUARE_SIZE - 4,
          class: 'mountain-hatch'
        }));
        terrainGroup.appendChild(g);
        continue;
      }

      if (isArsenal(x, y)) {
        const side = arsenalSide(x, y);
        const occupant = pieceAt(state, x, y);
        const owner = occupant ? occupant.side : side;
        const colorVar = owner === 'North' ? 'var(--north)' : 'var(--south)';
        if (pieceStyle === 'nato') {
          const arsenal = createSVGElement('g', { class: 'terrain-arsenal nato-arsenal' });
          arsenal.appendChild(createSVGElement('rect', {
            x: cx - 9, y: cy - 8, width: 18, height: 16, rx: 1, fill: colorVar
          }));
          arsenal.appendChild(createSVGElement('circle', {
            cx, cy, r: 4, class: 'arsenal-inset'
          }));
          arsenal.appendChild(createSVGElement('line', {
            x1: cx - 7, y1: cy, x2: cx + 7, y2: cy, class: 'arsenal-inset'
          }));
          terrainGroup.appendChild(arsenal);
        } else if (pieceStyle === 'chess') {
          const arsenal = createSVGElement('g', { class: 'terrain-arsenal chess-arsenal', fill: colorVar });
          arsenal.appendChild(createSVGElement('path', {
            d: `M${cx - 8},${cy + 8}h16v-3h-2v-9h-3v3h-3v-3h-4v3h-3v-3h-3v9h-2z`
          }));
          terrainGroup.appendChild(arsenal);
        } else {
          terrainGroup.appendChild(createSVGElement('polygon', {
            points: `${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}`,
            class: 'terrain-arsenal',
            fill: colorVar
          }));
        }
        continue;
      }

      if (isFort(x, y)) {
        const occupant = pieceAt(state, x, y);
        const side = occupant ? occupant.side : fortSide(x, y);
        const stroke = side === 'North' ? 'var(--north)' : 'var(--south)';
        terrainGroup.appendChild(createSVGElement('rect', {
          x: px + 5, y: py + 5, width: SQUARE_SIZE - 10, height: SQUARE_SIZE - 10,
          class: 'terrain-fort',
          stroke,
          fill: 'none'
        }));
        continue;
      }

      if (isPass(x, y)) {
        const cx = px + SQUARE_SIZE / 2;
        const cy = py + SQUARE_SIZE / 2;
        terrainGroup.appendChild(createSVGElement('polygon', {
          points: `${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`,
          class: 'terrain-pass'
        }));
      }
    }
  }
}

function appendNatoSymbol(g, piece, cx, cy) {
  g.appendChild(createSVGElement('rect', {
    x: 4, y: 5, width: 20, height: 18, rx: 1,
    class: 'piece-body nato-counter'
  }));
  const mark = createSVGElement('g', { class: 'nato-mark' });
  if (piece.cls === 'Infantry') {
    mark.appendChild(createSVGElement('line', { x1: 7, y1: 8, x2: 21, y2: 20 }));
    mark.appendChild(createSVGElement('line', { x1: 21, y1: 8, x2: 7, y2: 20 }));
  } else if (piece.cls === 'Cavalry') {
    mark.appendChild(createSVGElement('line', { x1: 7, y1: 20, x2: 21, y2: 8 }));
  } else if (piece.cls.includes('Artillery')) {
    mark.appendChild(createSVGElement('circle', { cx, cy: cy - 1, r: 4 }));
  } else {
    mark.appendChild(createSVGElement('line', { x1: cx, y1: 20, x2: cx, y2: 9 }));
    mark.appendChild(createSVGElement('path', { d: 'M10 13 Q14 9 18 13' }));
    mark.appendChild(createSVGElement('path', { d: 'M8 10 Q14 4 20 10' }));
  }
  if (piece.cls.startsWith('Mounted')) {
    mark.appendChild(createSVGElement('circle', { cx: 10, cy: 20, r: 1.2, class: 'nato-mobility' }));
    mark.appendChild(createSVGElement('circle', { cx: 18, cy: 20, r: 1.2, class: 'nato-mobility' }));
  }
  g.appendChild(mark);
}

function appendChessSymbol(g, piece, cx, cy) {
  g.appendChild(createSVGElement('circle', {
    cx, cy, r: 10, class: 'piece-body chess-disc'
  }));
  const mark = createSVGElement('g', { class: 'chess-mark' });
  if (piece.cls === 'Infantry') {
    mark.appendChild(createSVGElement('circle', { cx, cy: 9, r: 3.2 }));
    mark.appendChild(createSVGElement('path', { d: 'M11 19 Q14 13 17 19 Z M9 20 H19 V22 H9 Z' }));
  } else if (piece.cls === 'Cavalry') {
    mark.appendChild(createSVGElement('path', {
      d: 'M9 21 H20 L18 18 Q19 12 14 8 L15 12 L11 10 L8 16 L12 15 Q14 17 12 20 Z'
    }));
  } else if (piece.cls.includes('Artillery')) {
    mark.appendChild(createSVGElement('path', {
      d: 'M8 20 H20 V22 H8 Z M10 19 V14 H18 V19 Z M9 13 H19 V10 H17 V12 H15 V10 H13 V12 H11 V10 H9 Z'
    }));
  } else {
    mark.appendChild(createSVGElement('path', {
      d: 'M9 21 H19 V19 H17 L16 13 H12 L11 19 H9 Z M14 6 V12 M11 9 H17'
    }));
  }
  if (piece.cls.startsWith('Mounted')) {
    mark.appendChild(createSVGElement('path', { d: 'M12 5 L14 3 L16 5 L14 7 Z', class: 'chess-mounted' }));
  }
  g.appendChild(mark);
}

function renderPiece(piece, selectionId, comms, style = 'default') {
  const pieceStyle = normalizePieceStyle(style);
  const g = createSVGElement('g', {
    class: `piece piece-${piece.side.toLowerCase()} piece-style-${pieceStyle}`,
    'data-id': piece.id,
    transform: `translate(${piece.x * SQUARE_SIZE}, ${(BOARD_ROWS - 1 - piece.y) * SQUARE_SIZE})`
  });

  const cx = SQUARE_SIZE / 2;
  const cy = SQUARE_SIZE / 2;

  const audit = comms ? comms.status.get(piece.id) : null;
  if (audit && audit.status === 'isolated') {
    g.classList.add('piece-isolated');
  }

  if (piece.id === selectionId) {
    g.appendChild(createSVGElement('rect', {
      x: 2, y: 2, width: SQUARE_SIZE - 4, height: SQUARE_SIZE - 4,
      class: 'selection-ring',
      rx: 3
    }));
  }

  if (pieceStyle === 'nato') {
    appendNatoSymbol(g, piece, cx, cy);
  } else if (pieceStyle === 'chess') {
    appendChessSymbol(g, piece, cx, cy);
  } else {
    // The original default renderer stays unchanged.
    let body;
    if (isRelay(piece.cls)) {
      body = createSVGElement('polygon', {
        points: `${cx},${cy - 9} ${cx + 9},${cy} ${cx},${cy + 9} ${cx - 9},${cy}`,
        class: 'piece-body'
      });
    } else if (piece.cls === 'Cavalry') {
      body = createSVGElement('polygon', {
        points: `${cx},${cy - 9} ${cx + 9},${cy + 6} ${cx - 9},${cy + 6}`,
        class: 'piece-body'
      });
    } else {
      body = createSVGElement('circle', {
        cx, cy, r: 9,
        class: 'piece-body'
      });
    }
    g.appendChild(body);
    g.appendChild(createSVGElement('text', {
      x: cx,
      y: cy + 1,
      class: 'piece-symbol',
      textContent: classSymbol(piece.cls)
    }));
  }

  if (audit && audit.status === 'isolated') {
    g.appendChild(createSVGElement('line', {
      x1: 6, y1: 6, x2: SQUARE_SIZE - 6, y2: SQUARE_SIZE - 6,
      class: 'offline-strike'
    }));
    g.appendChild(createSVGElement('circle', {
      cx: SQUARE_SIZE - 5, cy: 5, r: 4,
      class: 'offline-marker'
    }));
  }

  return g;
}

function renderPieces(piecesGroup, state, comms) {
  const style = normalizePieceStyle(state.settings?.pieceStyle);
  for (const piece of state.pieces) {
    piecesGroup.appendChild(renderPiece(piece, state.selectedId, comms, style));
  }
}

function renderSupplyCoverage(coverageGroup, comms, mode, turn) {
  coverageGroup.innerHTML = '';
  const side = supplyCoverageSide(mode, turn);
  const supplied = side ? comms?.sideSupplied?.[side] : null;
  if (!supplied) return;

  for (const coord of supplied.keys()) {
    const square = xyFromCoord(coord);
    if (!square) continue;
    coverageGroup.appendChild(createSVGElement('rect', {
      x: square.x * SQUARE_SIZE + 1,
      y: (BOARD_ROWS - 1 - square.y) * SQUARE_SIZE + 1,
      width: SQUARE_SIZE - 2,
      height: SQUARE_SIZE - 2,
      rx: 2,
      class: `supply-coverage-square supply-coverage-${mode}`,
      'data-coverage-coord': coord,
      'data-coverage-side': side
    }));
  }
}

function renderLegalDots(overlayGroup, legalMoves, cls = 'legal-dot') {
  for (const mv of legalMoves) {
    const cx = mv.x * SQUARE_SIZE + SQUARE_SIZE / 2;
    const cy = (BOARD_ROWS - 1 - mv.y) * SQUARE_SIZE + SQUARE_SIZE / 2;
    overlayGroup.appendChild(createSVGElement('circle', {
      cx, cy, r: 4,
      class: cls
    }));
  }
}

function renderRetreatDots(overlayGroup, state) {
  const retreat = currentPendingRetreat(state);
  if (!retreat) return;
  const p = state.pieces.find(piece => piece.id === retreat.id);
  if (!p) return;
  renderLegalDots(overlayGroup, adjacentUnoccupiedSquares(state, p), 'retreat-dot');
}

function renderLastMove(overlayGroup, state) {
  const entry = state.log && state.log[state.log.length - 1];
  if (!entry || !entry.moves || entry.moves.length === 0) return;
  const last = entry.moves[entry.moves.length - 1];
  const to = xyFromCoord(last.to);
  if (!to) return;
  const cx = to.x * SQUARE_SIZE + SQUARE_SIZE / 2;
  const cy = (BOARD_ROWS - 1 - to.y) * SQUARE_SIZE + SQUARE_SIZE / 2;
  overlayGroup.appendChild(createSVGElement('circle', {
    cx, cy, r: 6,
    class: 'last-move-dot'
  }));
}

function renderAttackTargets(overlayGroup, state, comms) {
  if (state.hasAttacked || isInRetreatPhase(state) || !state.selectedId) return;
  const selected = state.pieces.find(p => p.id === state.selectedId);
  if (!selected || selected.side !== state.turn || !selected.stats.attack) return;
  for (const p of state.pieces) {
    if (p.side === state.turn) continue;
    if (canDeclareAttack(state, p.id, { comms })) {
      const cx = p.x * SQUARE_SIZE + SQUARE_SIZE / 2;
      const cy = (BOARD_ROWS - 1 - p.y) * SQUARE_SIZE + SQUARE_SIZE / 2;
      overlayGroup.appendChild(createSVGElement('circle', {
        cx, cy, r: 5,
        class: 'attack-target'
      }));
    }
  }
}

function renderCombatPreview(overlayGroup, state, comms) {
  if (!state.combatPreview || state.combatPreview.error) return;
  const preview = state.combatPreview;
  const target = state.pieces.find(p => p.id === preview.targetId);
  if (!target) return;

  // Highlight target square.
  const tpx = target.x * SQUARE_SIZE;
  const tpy = (BOARD_ROWS - 1 - target.y) * SQUARE_SIZE;
  overlayGroup.appendChild(createSVGElement('rect', {
    x: tpx + 2, y: tpy + 2, width: SQUARE_SIZE - 4, height: SQUARE_SIZE - 4,
    class: 'preview-target',
    rx: 3
  }));

  // Highlight attackers.
  for (const a of preview.attackBreakdown) {
    if (a.value === 0) continue;
    const ap = state.pieces.find(p => p.id === a.id);
    if (!ap) continue;
    const cx = ap.x * SQUARE_SIZE + SQUARE_SIZE / 2;
    const cy = (BOARD_ROWS - 1 - ap.y) * SQUARE_SIZE + SQUARE_SIZE / 2;
    overlayGroup.appendChild(createSVGElement('circle', {
      cx, cy, r: 5,
      class: 'preview-attacker'
    }));
  }
}

function renderCommsLines(linesGroup, cutLinesGroup, state, comms, selectedId) {
  linesGroup.innerHTML = '';
  cutLinesGroup.innerHTML = '';
  if (!comms) return;

  const selected = state.pieces.find(p => p.id === selectedId);

  function drawRoute(group, route, cls) {
    if (!route || route.length < 2) return;
    const pts = route.map(coord => {
      const { x, y } = (() => {
        const file = coord.charCodeAt(0) - 97;
        const rank = Number(coord.slice(1)) - 1;
        return { x: file, y: rank };
      })();
      const p = svgPoint(x, y);
      return `${p.x},${p.y}`;
    }).join(' ');
    group.appendChild(createSVGElement('polyline', {
      points: pts,
      class: cls,
      fill: 'none'
    }));
  }

  function cutMarkerAt(coord) {
    const file = coord.charCodeAt(0) - 97;
    const rank = Number(coord.slice(1)) - 1;
    const p = svgPoint(file, rank);
    cutLinesGroup.appendChild(createSVGElement('circle', {
      cx: p.x, cy: p.y, r: 4,
      class: 'cut-marker'
    }));
  }

  if (selected) {
    const audit = comms.status.get(selected.id);
    if (audit) {
      if (audit.status === 'in-communication') {
        drawRoute(linesGroup, audit.route, 'comms-line active-route');
      } else if (audit.cut) {
        // Draw the full broken route from source arsenal to the selected unit,
        // or from the cut square to the unit if the source is not directly aligned.
        let route;
        if (audit.sourceArsenal) {
          const arsenalXY = xyFromCoord(audit.sourceArsenal);
          if (arsenalXY && isAligned(arsenalXY, selected)) {
            route = [audit.sourceArsenal, ...lineSquaresExclusive(arsenalXY, selected).map(sq => sq.coord)];
          } else {
            route = [audit.cut, coordFromXY(selected.x, selected.y)].filter(Boolean);
          }
        } else {
          route = [audit.cut, coordFromXY(selected.x, selected.y)].filter(Boolean);
        }
        drawRoute(cutLinesGroup, route, 'comms-line cut-route');
        cutMarkerAt(audit.cut);
      }
    }
  }

  if (state.showAllComms) {
    for (const piece of state.pieces) {
      const audit = comms.status.get(piece.id);
      if (audit && audit.status === 'in-communication' && audit.route && audit.route.length > 1) {
        drawRoute(linesGroup, audit.route, 'comms-line global-route');
      }
    }
  }
}

function makeBoard(container) {
  const width = BOARD_COLS * SQUARE_SIZE;
  const height = BOARD_ROWS * SQUARE_SIZE;
  const totalWidth = width + MARGIN;
  const totalHeight = height + MARGIN;

  const wrapper = document.createElement('div');
  wrapper.className = 'board-container';

  const svg = createSVGElement('svg', {
    class: 'board-svg',
    viewBox: `0 0 ${totalWidth} ${totalHeight}`,
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'xMidYMid meet',
    tabindex: '0',
    role: 'application',
    'aria-label': 'Lines of Advance board. Select a unit, then choose a marked legal square.'
  });

  const boardGroup = createSVGElement('g');
  const terrainGroup = createSVGElement('g', { class: 'terrain-layer' });
  const coverageGroup = createSVGElement('g', { class: 'supply-coverage-layer' });
  const linesGroup = createSVGElement('g', { class: 'comms-lines-layer' });
  const overlayGroup = createSVGElement('g', { class: 'overlay-layer' });
  const piecesGroup = createSVGElement('g', { class: 'pieces-layer' });
  const cutLinesGroup = createSVGElement('g', { class: 'cut-lines-layer' });

  renderGrid(boardGroup);
  svg.appendChild(boardGroup);
  svg.appendChild(terrainGroup);
  svg.appendChild(coverageGroup);
  svg.appendChild(linesGroup);
  svg.appendChild(overlayGroup);
  svg.appendChild(piecesGroup);
  svg.appendChild(cutLinesGroup);
  wrapper.appendChild(svg);
  container.appendChild(wrapper);

  let zoom = MIN_ZOOM;
  const zoomListeners = new Set();
  const touchPoints = new Map();
  const pinchPointers = new Set();
  let pinchStart = null;
  let suppressClicksUntil = 0;

  function setZoom(value, anchor = null) {
    const next = normalizeZoom(value);
    if (next === zoom) return zoom;

    const previous = zoom;
    const viewportRect = container.getBoundingClientRect();
    const anchorX = anchor ? anchor.clientX - viewportRect.left : container.clientWidth / 2;
    const anchorY = anchor ? anchor.clientY - viewportRect.top : container.clientHeight / 2;
    const contentX = container.scrollLeft + anchorX;
    const contentY = container.scrollTop + anchorY;

    zoom = next;
    wrapper.style.width = `${zoom * 100}%`;
    wrapper.style.height = `${zoom * 100}%`;

    const ratio = zoom / previous;
    container.scrollLeft = contentX * ratio - anchorX;
    container.scrollTop = contentY * ratio - anchorY;
    for (const listener of zoomListeners) listener(zoom);
    return zoom;
  }

  function fit() {
    container.scrollLeft = 0;
    container.scrollTop = 0;
    return setZoom(MIN_ZOOM);
  }

  function onWheel(evt) {
    const next = zoomFromWheel(zoom, evt.deltaY);
    if (next === zoom) return;
    evt.preventDefault();
    setZoom(next, evt);
  }

  function distanceAndCenter() {
    const [a, b] = [...touchPoints.values()];
    if (!a || !b) return null;
    return {
      distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      clientX: (a.clientX + b.clientX) / 2,
      clientY: (a.clientY + b.clientY) / 2
    };
  }

  function onTouchPointerDown(evt) {
    if (evt.pointerType !== 'touch') return;
    touchPoints.set(evt.pointerId, { clientX: evt.clientX, clientY: evt.clientY });
    if (touchPoints.size !== 2) return;
    const gesture = distanceAndCenter();
    if (!gesture) return;
    pinchStart = { zoom, distance: gesture.distance };
    for (const id of touchPoints.keys()) pinchPointers.add(id);
    evt.preventDefault();
    evt.stopPropagation();
  }

  function onTouchPointerMove(evt) {
    if (!touchPoints.has(evt.pointerId)) return;
    touchPoints.set(evt.pointerId, { clientX: evt.clientX, clientY: evt.clientY });
    if (!pinchStart || touchPoints.size < 2) return;
    const gesture = distanceAndCenter();
    if (!gesture) return;
    evt.preventDefault();
    evt.stopPropagation();
    setZoom(zoomFromPinch(pinchStart.zoom, pinchStart.distance, gesture.distance), gesture);
  }

  function onTouchPointerEnd(evt) {
    if (!touchPoints.has(evt.pointerId)) return;
    const wasPinching = pinchPointers.has(evt.pointerId);
    touchPoints.delete(evt.pointerId);
    if (wasPinching) {
      evt.preventDefault();
      evt.stopPropagation();
      suppressClicksUntil = Date.now() + 500;
    }
    if (touchPoints.size < 2) pinchStart = null;
    if (touchPoints.size === 0) pinchPointers.clear();
  }

  function onClickCapture(evt) {
    if (Date.now() > suppressClicksUntil) return;
    evt.preventDefault();
    evt.stopPropagation();
  }

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerdown', onTouchPointerDown, true);
  container.addEventListener('pointermove', onTouchPointerMove, true);
  container.addEventListener('pointerup', onTouchPointerEnd, true);
  container.addEventListener('pointercancel', onTouchPointerEnd, true);
  container.addEventListener('click', onClickCapture, true);

  function update(state, comms, view = {}) {
    const selectedId = state.selectedId;
    let legalMoves = [];
    const active = !state.gameOver;
    if (active && isInRetreatPhase(state)) {
      const retreat = currentPendingRetreat(state);
      if (retreat && retreat.id === selectedId) {
        const p = state.pieces.find(piece => piece.id === retreat.id);
        if (p) legalMoves = adjacentUnoccupiedSquares(state, p);
      }
    } else if (active && !state.sandbox && selectedId) {
      legalMoves = getLegalMoves(state, selectedId, { comms });
    }

    renderTerrain(terrainGroup, state);
    renderSupplyCoverage(coverageGroup, comms, view.supplyCoverageMode, state.turn);
    overlayGroup.innerHTML = '';
    if (active && isInRetreatPhase(state)) {
      renderRetreatDots(overlayGroup, state);
    } else if (active) {
      renderLegalDots(overlayGroup, legalMoves);
      renderAttackTargets(overlayGroup, state, comms);
    }
    renderLastMove(overlayGroup, state);
    renderCombatPreview(overlayGroup, state, comms);
    renderCommsLines(linesGroup, cutLinesGroup, state, comms, selectedId);

    piecesGroup.innerHTML = '';
    renderPieces(piecesGroup, state, comms);
  }

  function destroy() {
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('pointerdown', onTouchPointerDown, true);
    container.removeEventListener('pointermove', onTouchPointerMove, true);
    container.removeEventListener('pointerup', onTouchPointerEnd, true);
    container.removeEventListener('pointercancel', onTouchPointerEnd, true);
    container.removeEventListener('click', onClickCapture, true);
    wrapper.remove();
  }

  return {
    svg,
    wrapper,
    update,
    destroy,
    fit,
    setZoom,
    getZoom: () => zoom,
    onZoomChange(listener) {
      zoomListeners.add(listener);
      listener(zoom);
      return () => zoomListeners.delete(listener);
    }
  };
}

export {
  makeBoard,
  normalizeZoom,
  zoomFromWheel,
  zoomFromPinch,
  SQUARE_SIZE,
  MARGIN,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  PIECE_STYLES,
  normalizePieceStyle,
  SUPPLY_COVERAGE_MODES,
  nextSupplyCoverageMode,
  supplyCoverageSide
};
