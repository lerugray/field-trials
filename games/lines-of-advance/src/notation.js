// notation.js: S1 position/move/game-record notation for engine regression and replay.
// Derived from docs/ENGINE-PROGRAM-SPEC-2026-08-09.md; adapted to the actual state shape
// in src/state.js and src/turn.js.

import {
  coordFromXY,
  xyFromCoord,
  createState,
  createPiece,
  SIDES
} from './state.js';
import { BASE_RULESET_ID } from './release-config.js';
import { isArsenal, activeArsenalsForSide } from './terrain.js';

const CLASS_TO_CODE = Object.freeze({
  Infantry: 'I',
  Cavalry: 'CV',
  'Foot Artillery': 'FA',
  'Mounted Artillery': 'MA',
  'Foot Relay': 'FR',
  'Mounted Relay': 'MR'
});

const CODE_TO_CLASS = Object.freeze({
  I: 'Infantry',
  CV: 'Cavalry',
  FA: 'Foot Artillery',
  MA: 'Mounted Artillery',
  FR: 'Foot Relay',
  MR: 'Mounted Relay'
});

const SIDE_TO_CODE = Object.freeze({ North: 'N', South: 'S' });
const CODE_TO_SIDE = Object.freeze({ N: 'North', S: 'South' });

const UNRESERVED = /^[A-Za-z0-9._~-]+$/;

function encodeId(id) {
  if (UNRESERVED.test(id)) return id;
  const bytes = new TextEncoder().encode(id);
  let out = '';
  for (const b of bytes) {
    out += `%${b.toString(16).padStart(2, '0')}`;
  }
  return out;
}

function decodeId(encoded) {
  if (UNRESERVED.test(encoded)) return encoded;
  const bytes = [];
  for (let i = 0; i < encoded.length; i += 1) {
    const c = encoded[i];
    if (c === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(c.charCodeAt(0));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function sideCode(side) {
  const code = SIDE_TO_CODE[side];
  if (!code) throw new Error(`Unknown side: ${side}`);
  return code;
}

function classCode(cls) {
  const code = CLASS_TO_CODE[cls];
  if (!code) throw new Error(`Unknown class: ${cls}`);
  return code;
}

function parseClass(code) {
  const cls = CODE_TO_CLASS[code];
  if (!cls) throw new Error(`Unknown class code: ${code}`);
  return cls;
}

function formatIdList(list) {
  if (!list || list.length === 0) return '-';
  return list.map(encodeId).join(',');
}

function parseIdList(text) {
  if (text === '-') return [];
  return text.split(',').map(decodeId);
}

function formatCoordList(coords) {
  if (!coords || coords.length === 0) return '-';
  return coords.map(({ x, y }) => coordFromXY(x, y)).join(',');
}

function parseCoordList(text) {
  if (text === '-') return [];
  return text.split(',').map(c => xyFromCoord(c));
}

function formatWinReason(reason) {
  if (!reason) return 'unknown';
  if (reason.includes('fighting units eliminated')) return 'elim';
  if (reason.includes('arsenals captured') || reason.includes('arsenal')) return 'arsenal';
  return 'unknown';
}

function parseWinReason(code) {
  // We keep only the canonical reason string used by combat.js findVictory.
  if (code === 'elim') return 'all enemy fighting units eliminated';
  if (code === 'arsenal') return 'both enemy arsenals captured';
  return 'unknown';
}

function formatPieces(pieces) {
  const tokens = pieces
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(p => `${encodeId(p.id)}/${sideCode(p.side)}${classCode(p.cls)}@${coordFromXY(p.x, p.y)}`);
  return tokens.join(';');
}

function parsePiece(token) {
  const [idPart, rest] = token.split('/');
  const id = decodeId(idPart);
  const sideCode = rest[0];
  const side = CODE_TO_SIDE[sideCode];
  if (!side) throw new Error(`Unknown side code: ${sideCode}`);
  const atIdx = rest.indexOf('@');
  if (atIdx === -1) throw new Error(`Piece token missing @: ${token}`);
  const clsCode = rest.slice(1, atIdx);
  const cls = parseClass(clsCode);
  const coord = rest.slice(atIdx + 1);
  const { x, y } = xyFromCoord(coord);
  if (x === null || y === null) throw new Error(`Bad coordinate in piece token: ${token}`);
  return { id, side, cls, x, y };
}

function formatPendingRetreats(retreats) {
  if (!retreats || retreats.length === 0) return '-';
  return retreats
    .map(r => `${encodeId(r.id)}@${coordFromXY(r.fromX, r.fromY)}`)
    .join(';');
}

function parsePendingRetreats(text) {
  if (text === '-') return [];
  return text.split(';').map(token => {
    const [idPart, coord] = token.split('@');
    const { x, y } = xyFromCoord(coord);
    return { id: decodeId(idPart), fromX: x, fromY: y };
  });
}

function formatGameOver(gameOver) {
  if (!gameOver || !gameOver.winner) return '-';
  return `${sideCode(gameOver.winner)}:${formatWinReason(gameOver.reason)}`;
}

function parseGameOver(text) {
  if (text === '-') return null;
  const [sideCode, reasonCode] = text.split(':');
  const winner = CODE_TO_SIDE[sideCode];
  if (!winner) throw new Error(`Unknown winner side: ${sideCode}`);
  return { winner, reason: parseWinReason(reasonCode) };
}

function formatLoa1(state) {
  const rulesetId = encodeId(state.rulesetId || BASE_RULESET_ID);
  const version = 4;
  const board = `${state.board?.cols ?? 25}x${state.board?.rows ?? 20}`;
  const turn = sideCode(state.turn);
  const attacked = state.hasAttacked ? '1' : '0';
  const moved = formatIdList(state.movedThisTurn);
  const retreated = formatIdList(state.retreatedThisTurn);
  const pending = formatPendingRetreats(state.pendingRetreats);
  // No separate captured-arsenal registry in current state; neutralization is by occupancy.
  const captured = '-';
  const gameOver = formatGameOver(state.gameOver);
  const pieces = formatPieces(state.pieces);
  return `LOA1 r=${rulesetId} v=${version} b=${board} t=${turn} h=${attacked} m=${moved} rt=${retreated} pr=${pending} cap=${captured} go=${gameOver} p=${pieces}`;
}

function parseLoa1(line) {
  if (!line.startsWith('LOA1 ')) throw new Error('Not a LOA1 string');
  const prefix = 'LOA1 ';
  const rest = line.slice(prefix.length);
  // Fields are space-delimited, each is key=value.
  const fields = new Map();
  for (const token of rest.split(' ')) {
    const eq = token.indexOf('=');
    if (eq === -1) throw new Error(`Malformed field: ${token}`);
    fields.set(token.slice(0, eq), token.slice(eq + 1));
  }
  const required = ['r', 'v', 'b', 't', 'h', 'm', 'rt', 'pr', 'cap', 'go', 'p'];
  for (const key of required) {
    if (!fields.has(key)) throw new Error(`Missing field: ${key}`);
  }

  const state = createState();
  state.rulesetId = decodeId(fields.get('r'));
  state.turn = CODE_TO_SIDE[fields.get('t')];
  state.hasAttacked = fields.get('h') === '1';
  state.movedThisTurn = parseIdList(fields.get('m'));
  state.retreatedThisTurn = parseIdList(fields.get('rt'));
  state.pendingRetreats = parsePendingRetreats(fields.get('pr'));
  state.gameOver = parseGameOver(fields.get('go'));

  const pieceTokens = fields.get('p').split(';');
  state.pieces = pieceTokens
    .filter(t => t.length > 0)
    .map(parsePiece)
    .map(p => createPiece(p));

  return state;
}

function formatAction(action, state = null) {
  if (action.type === 'move') {
    const piece = state?.pieces.find(p => p.id === action.pieceId);
    const from = piece ? coordFromXY(piece.x, piece.y) : '??';
    return `M:${encodeId(action.pieceId)}@${from}-${coordFromXY(action.x, action.y)}`;
  }
  if (action.type === 'retreat') {
    const piece = state?.pieces.find(p => p.id === action.pieceId);
    const from = piece ? coordFromXY(piece.x, piece.y) : '??';
    return `R:${encodeId(action.pieceId)}@${from}~${coordFromXY(action.x, action.y)}`;
  }
  if (action.type === 'attack') {
    const target = state?.pieces.find(p => p.id === action.targetId);
    const coord = target ? coordFromXY(target.x, target.y) : '??';
    return `A:${encodeId(action.targetId)}@${coord}`;
  }
  if (action.type === 'arsenal') {
    return `Z:${coordFromXY(action.x, action.y)}`;
  }
  if (action.type === 'end-turn') return 'E';
  throw new Error(`Unknown action type: ${action.type}`);
}

function parseAction(text) {
  if (text === 'E') return { type: 'end-turn' };
  const colon = text.indexOf(':');
  if (colon === -1) throw new Error(`Bad action: ${text}`);
  const kind = text[0];
  const body = text.slice(colon + 1);
  if (kind === 'M') {
    const [idPart, coords] = body.split('@');
    const [from, to] = coords.split('-');
    return { type: 'move', pieceId: decodeId(idPart), ...xyFromCoord(to) };
  }
  if (kind === 'R') {
    const [idPart, coords] = body.split('@');
    const [from, to] = coords.split('~');
    return { type: 'retreat', pieceId: decodeId(idPart), ...xyFromCoord(to) };
  }
  if (kind === 'A') {
    const [idPart, coord] = body.split('@');
    return { type: 'attack', targetId: decodeId(idPart) };
  }
  if (kind === 'Z') {
    return { type: 'arsenal', ...xyFromCoord(body) };
  }
  throw new Error(`Unknown action kind: ${kind}`);
}

function formatMoveList(actions) {
  if (!actions || actions.length === 0) return '-';
  return actions.map(a => formatAction(a)).join(',');
}

function parseMoveList(text) {
  if (text === '-') return [];
  return text.split(',').map(parseAction);
}

function formatResult(result, reason) {
  if (result === 'North') return `N:${reason || 'unknown'}`;
  if (result === 'South') return `S:${reason || 'unknown'}`;
  if (result === 'draw' || result === '*') return `D:${reason || 'unknown'}`;
  return `*:${reason || 'unknown'}`;
}

function parseResult(text) {
  if (text === '*') return { result: '*', reason: 'unknown' };
  const [code, reason] = text.split(':');
  if (code === 'N') return { result: 'North', reason: reason || 'unknown' };
  if (code === 'S') return { result: 'South', reason: reason || 'unknown' };
  if (code === 'D') return { result: 'draw', reason: reason || 'unknown' };
  throw new Error(`Unknown result code: ${code}`);
}

function formatTags(tags) {
  if (!tags || Object.keys(tags).length === 0) return '';
  return Object.entries(tags)
    .map(([k, v]) => `${encodeId(k)}=${encodeId(String(v))}`)
    .join(';');
}

function parseTags(text) {
  const tags = {};
  if (!text) return tags;
  for (const token of text.split(';')) {
    const [k, v] = token.split('=');
    tags[decodeId(k)] = decodeId(v);
  }
  return tags;
}

function formatGameRecord(startLoa1, actions, result, reason, tags = {}) {
  const tagsStr = formatTags(tags);
  const base = `LOAGR1|${startLoa1}|${formatMoveList(actions)}|${formatResult(result, reason)}`;
  return tagsStr ? `${base}|${tagsStr}` : base;
}

function parseGameRecord(record) {
  const parts = record.split('|');
  if (parts.length < 4) throw new Error('Bad LOAGR1 record');
  if (parts[0] !== 'LOAGR1') throw new Error('Not a LOAGR1 record');
  const start = parseLoa1(parts[1]);
  const actions = parseMoveList(parts[2]);
  const { result, reason } = parseResult(parts[3]);
  const tags = parts[4] ? parseTags(parts[4]) : {};
  return { start, actions, result, reason, tags };
}

export {
  CLASS_TO_CODE,
  CODE_TO_CLASS,
  SIDE_TO_CODE,
  CODE_TO_SIDE,
  encodeId,
  decodeId,
  formatLoa1,
  parseLoa1,
  formatAction,
  parseAction,
  formatMoveList,
  parseMoveList,
  formatResult,
  parseResult,
  formatTags,
  parseTags,
  formatGameRecord,
  parseGameRecord
};
