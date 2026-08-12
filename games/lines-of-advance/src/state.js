// state.js: deterministic board state model for LINES OF ADVANCE.
// Verified unit stats and original terrain are imported from terrain.js.

import { isPassable } from './terrain.js';
import { BASE_RULESET_ID } from './release-config.js';
import { createDrawState, cloneDrawState } from './adjudication.js';

const BOARD_COLS = 25;
const BOARD_ROWS = 20;
const SIDES = Object.freeze(['North', 'South']);
const UNIT_CLASSES = Object.freeze([
  'Infantry',
  'Cavalry',
  'Foot Artillery',
  'Mounted Artillery',
  'Foot Relay',
  'Mounted Relay'
]);

const UNIT_STATS = Object.freeze({
  Infantry: Object.freeze({
    attack: 4, defense: 6, range: 2, movement: 1,
    isFighter: true, isRelay: false
  }),
  Cavalry: Object.freeze({
    attack: 4, defense: 5, range: 2, movement: 2,
    isFighter: true, isRelay: false, chargeAttack: 7
  }),
  'Foot Artillery': Object.freeze({
    attack: 5, defense: 8, range: 3, movement: 1,
    isFighter: true, isRelay: false
  }),
  'Mounted Artillery': Object.freeze({
    attack: 5, defense: 8, range: 3, movement: 2,
    isFighter: true, isRelay: false
  }),
  'Foot Relay': Object.freeze({
    attack: 0, defense: 1, range: 2, movement: 1,
    isFighter: false, isRelay: true
  }),
  'Mounted Relay': Object.freeze({
    attack: 0, defense: 1, range: 2, movement: 2,
    isFighter: false, isRelay: true
  })
});

// Coordinate mapping: x in [0,24] -> file a..y; y in [0,19] -> rank 1..20.
const FILES = 'abcdefghijklmnopqrstuvwxy'.split('');

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fileFromX(x) {
  return FILES[clamp(x, 0, BOARD_COLS - 1)];
}

function xFromFile(file) {
  const idx = FILES.indexOf(file);
  return idx === -1 ? null : idx;
}

function rankFromY(y) {
  return String(clamp(y, 0, BOARD_ROWS - 1) + 1);
}

function yFromRank(rank) {
  const n = Number(rank);
  if (!Number.isInteger(n)) return null;
  const y = n - 1;
  if (y < 0 || y >= BOARD_ROWS) return null;
  return y;
}

function coordFromXY(x, y) {
  return `${fileFromX(x)}${rankFromY(y)}`;
}

function xyFromCoord(coord) {
  if (typeof coord !== 'string' || coord.length < 2) return null;
  const file = coord[0];
  const rank = coord.slice(1);
  const x = xFromFile(file);
  const y = yFromRank(rank);
  if (x === null || y === null) return null;
  return { x, y };
}

function isOnBoard(x, y) {
  return x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_ROWS;
}

function allSquares() {
  const squares = [];
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLS; x += 1) {
      squares.push({ x, y, coord: coordFromXY(x, y) });
    }
  }
  return squares;
}

// Deterministic linear congruential generator. Seeded; no Math.random in sim logic.
function makeLcg(seed = 1) {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function unitStats(cls) {
  const stats = UNIT_STATS[cls];
  if (!stats) throw new Error(`No stats for class: ${cls}`);
  return stats;
}

function isFighter(cls) {
  return Boolean(UNIT_STATS[cls]?.isFighter);
}

function isRelay(cls) {
  return Boolean(UNIT_STATS[cls]?.isRelay);
}

let idCounter = 0;

function nextId(prefix = 'p') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function resetIdCounter(seed = 0) {
  idCounter = seed;
}

function createPiece(spec) {
  const { id = nextId(), side, cls, x, y } = spec;
  if (!SIDES.includes(side)) throw new Error(`Unknown side: ${side}`);
  if (!UNIT_CLASSES.includes(cls)) throw new Error(`Unknown class: ${cls}`);
  if (!isOnBoard(x, y)) throw new Error(`Off-board coordinate: ${x},${y}`);
  if (!isPassable(x, y)) throw new Error(`Mountain square: ${x},${y}`);
  return Object.freeze({
    id,
    side,
    cls,
    x,
    y,
    stats: unitStats(cls)
  });
}

function createState() {
  return {
    board: { cols: BOARD_COLS, rows: BOARD_ROWS },
    pieces: [],
    selectedId: null,
    moveCount: 0,
    preset: 'empty',
    rulesetId: BASE_RULESET_ID,
    rulesStatus: 'rules: 92.7% verified',
    sandbox: false,
    showAllComms: false,
    settings: {
      sfx: true,
      music: false,
      reducedEffects: false,
      pieceStyle: 'default',
      engineSide: 'None'
    },
    // M4 turn state
    turn: 'North',
    turnNumber: 1,
    movedThisTurn: [],
    hasAttacked: false,
    pendingRetreats: [],
    retreatedThisTurn: [],
    log: [],
    history: [],
    gameOver: null,
    combatPreview: null,
    drawState: null
  };
}

function cloneState(state) {
  return {
    board: { ...state.board },
    pieces: state.pieces.map(p => ({ ...p, stats: { ...p.stats } })),
    selectedId: state.selectedId,
    moveCount: state.moveCount,
    preset: state.preset,
    rulesetId: state.rulesetId,
    rulesStatus: state.rulesStatus,
    sandbox: state.sandbox,
    showAllComms: state.showAllComms,
    settings: { ...state.settings },
    turn: state.turn,
    turnNumber: state.turnNumber,
    movedThisTurn: state.movedThisTurn ? state.movedThisTurn.slice() : [],
    hasAttacked: state.hasAttacked,
    pendingRetreats: state.pendingRetreats ? state.pendingRetreats.slice() : [],
    retreatedThisTurn: state.retreatedThisTurn ? state.retreatedThisTurn.slice() : [],
    log: state.log ? state.log.slice() : [],
    history: state.history ? state.history.slice() : [],
    gameOver: state.gameOver ? { ...state.gameOver } : null,
    combatPreview: state.combatPreview ? { ...state.combatPreview } : null,
    drawState: cloneDrawState(state.drawState)
  };
}

function pieceAt(state, x, y) {
  return state.pieces.find(p => p.x === x && p.y === y) || null;
}

function findPiece(state, id) {
  return state.pieces.find(p => p.id === id) || null;
}

function selectPiece(state, id) {
  const next = cloneState(state);
  next.selectedId = id;
  return next;
}

function clearSelection(state) {
  const next = cloneState(state);
  next.selectedId = null;
  return next;
}

// Sandbox move: no legality checks. Used internally after rules checks.
function movePiece(state, id, x, y) {
  if (!isOnBoard(x, y)) return state;
  if (!isPassable(x, y)) return state;
  const next = cloneState(state);
  const piece = next.pieces.find(p => p.id === id);
  if (!piece) return state;
  piece.x = x;
  piece.y = y;
  next.moveCount += 1;
  return next;
}

function testPreset() {
  resetIdCounter(0);
  const pieces = [];
  // Rules ledger row 82 / Nicholson-Smith p.1: each side deploys inside its
  // own territory. This convenience opening is not a canonical position.
  // The relay on each e-file is directly linked to the nearby arsenal and
  // redirects communication across the occupied back rank (rows 57-61 / p.4).
  const openingLine = [
    ['Foot Relay', 4],
    ['Infantry', 5],
    ['Infantry', 6],
    ['Infantry', 7],
    ['Infantry', 8],
    ['Infantry', 9],
    ['Infantry', 10],
    ['Infantry', 11],
    ['Infantry', 12],
    ['Infantry', 13],
    ['Cavalry', 14],
    ['Cavalry', 15],
    ['Cavalry', 16],
    ['Cavalry', 17],
    ['Foot Artillery', 18],
    ['Mounted Artillery', 19],
    ['Mounted Relay', 20]
  ];
  for (const [cls, x] of openingLine) {
    pieces.push(createPiece({ side: 'North', cls, x, y: 19 }));
  }
  for (const [cls, x] of openingLine) {
    pieces.push(createPiece({ side: 'South', cls, x, y: 0 }));
  }
  return pieces;
}

function resetToTestPreset(state) {
  const next = cloneState(state);
  next.pieces = testPreset();
  next.selectedId = null;
  next.moveCount = 0;
  next.preset = 'standard';
  next.turn = 'North';
  next.turnNumber = 1;
  next.movedThisTurn = [];
  next.hasAttacked = false;
  next.pendingRetreats = [];
  next.retreatedThisTurn = [];
  next.log = [];
  next.history = [];
  next.gameOver = null;
  next.combatPreview = null;
  next.drawState = null;
  return next;
}

// Position for the communications-audit demonstration:
// North infantry at e17 is supplied by the North arsenal at e19;
// North infantry at f17 is in communication indirectly via e17.
// The South infantry at f18 is isolated and is not presented as a legal cutter.
// Use the "Cut Demo" preset to see an actual severed line.
function commsDrillPreset() {
  resetIdCounter(100);
  const pieces = [];
  // North side
  pieces.push(createPiece({ side: 'North', cls: 'Infantry', x: 4, y: 16 })); // e17, supplied by e19
  pieces.push(createPiece({ side: 'North', cls: 'Infantry', x: 5, y: 16 })); // f17, indirect via e17
  // South side
  pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 5, y: 17 })); // f18, isolated
  pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 20, y: 18 })); // u19, spare
  return pieces;
}

function resetToCommsDrill(state) {
  const next = cloneState(state);
  next.pieces = commsDrillPreset();
  next.selectedId = null;
  next.moveCount = 0;
  next.preset = 'comms-drill';
  next.turn = 'North';
  next.turnNumber = 1;
  next.movedThisTurn = [];
  next.hasAttacked = false;
  next.pendingRetreats = [];
  next.retreatedThisTurn = [];
  next.log = [];
  next.history = [];
  next.gameOver = null;
  next.combatPreview = null;
  next.drawState = null;
  return next;
}

// Position where the North supply line is already cut.
function commCutPreset() {
  resetIdCounter(200);
  const pieces = [];
  pieces.push(createPiece({ side: 'North', cls: 'Infantry', x: 4, y: 16 })); // e17
  pieces.push(createPiece({ side: 'North', cls: 'Infantry', x: 5, y: 16 })); // f17
  pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 17 })); // e18, cuts the line
  return pieces;
}

function resetToCommCut(state) {
  const next = cloneState(state);
  next.pieces = commCutPreset();
  next.selectedId = null;
  next.moveCount = 0;
  next.preset = 'comm-cut';
  next.turn = 'North';
  next.turnNumber = 1;
  next.movedThisTurn = [];
  next.hasAttacked = false;
  next.pendingRetreats = [];
  next.retreatedThisTurn = [];
  next.log = [];
  next.history = [];
  next.gameOver = null;
  next.combatPreview = null;
  next.drawState = null;
  return next;
}

function serializeState(state) {
  return JSON.stringify({
    version: 4,
    board: state.board,
    pieces: state.pieces,
    selectedId: state.selectedId,
    moveCount: state.moveCount,
    preset: state.preset,
    rulesetId: state.rulesetId,
    rulesStatus: state.rulesStatus,
    sandbox: state.sandbox,
    showAllComms: state.showAllComms,
    settings: state.settings,
    turn: state.turn,
    turnNumber: state.turnNumber,
    movedThisTurn: state.movedThisTurn,
    hasAttacked: state.hasAttacked,
    pendingRetreats: state.pendingRetreats,
    retreatedThisTurn: state.retreatedThisTurn,
    log: state.log,
    // history is deliberately NOT serialized: each entry is itself a serialized
    // state, so embedding it makes every snapshot contain all prior snapshots:
    // exponential growth that hits V8's string limit around move 11-13 and
    // silently kills the game under file:// (field defect, 2026-08-08).
    gameOver: state.gameOver,
    combatPreview: state.combatPreview,
    drawState: state.drawState
  });
}

function parseState(json) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  if (!raw || raw.version < 2 || raw.version > 4) throw new Error('Unsupported save version');
  const rulesetId = raw.rulesetId || BASE_RULESET_ID;
  if (rulesetId !== BASE_RULESET_ID) throw new Error('Unsupported ruleset');
  const state = createState();
  state.board = raw.board || state.board;
  state.selectedId = raw.selectedId ?? null;
  state.moveCount = raw.moveCount ?? 0;
  state.preset = raw.preset || 'unknown';
  state.rulesetId = rulesetId;
  state.rulesStatus = raw.rulesStatus || state.rulesStatus;
  state.sandbox = raw.sandbox ?? false;
  state.showAllComms = raw.showAllComms ?? false;
  state.settings = raw.settings ? { ...state.settings, ...raw.settings } : state.settings;
  state.turn = raw.turn ?? state.turn;
  state.turnNumber = raw.turnNumber ?? state.turnNumber;
  state.movedThisTurn = raw.movedThisTurn ? raw.movedThisTurn.slice() : [];
  state.hasAttacked = raw.hasAttacked ?? false;
  state.pendingRetreats = raw.pendingRetreats ? raw.pendingRetreats.slice() : [];
  state.retreatedThisTurn = raw.retreatedThisTurn ? raw.retreatedThisTurn.slice() : [];
  state.log = raw.log ? raw.log.slice() : [];
  // Old saves may carry a (potentially enormous) embedded history; discard it.
  // Undo history is runtime-only; a loaded game starts with an empty undo stack.
  state.history = [];
  state.gameOver = raw.gameOver ? { ...raw.gameOver } : null;
  state.combatPreview = raw.combatPreview ? { ...raw.combatPreview } : null;
  state.pieces = (raw.pieces || []).map(p => createPiece({
    id: p.id,
    side: p.side,
    cls: p.cls,
    x: p.x,
    y: p.y
  }));
  state.drawState = raw.drawState ? cloneDrawState(raw.drawState) : createDrawState(state);
  return state;
}

export {
  BOARD_COLS,
  BOARD_ROWS,
  SIDES,
  UNIT_CLASSES,
  UNIT_STATS,
  fileFromX,
  xFromFile,
  rankFromY,
  yFromRank,
  coordFromXY,
  xyFromCoord,
  isOnBoard,
  allSquares,
  makeLcg,
  unitStats,
  isFighter,
  isRelay,
  createPiece,
  createState,
  cloneState,
  pieceAt,
  findPiece,
  selectPiece,
  clearSelection,
  movePiece,
  resetToTestPreset,
  resetToCommsDrill,
  resetToCommCut,
  serializeState,
  parseState
};
