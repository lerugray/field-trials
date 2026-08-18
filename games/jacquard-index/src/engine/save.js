// THE JACQUARD INDEX — one-slot, versioned browser save format.
//
// The seed calls for save/resume anywhere, including pencil marks and undo history. This
// module is deliberately DOM-free: storage is injected, snapshots are validated before
// use, and corrupt/incompatible records are discarded with a notice for the title scene.

export const SAVE_KEY = 'the-jacquard-index.save';
export const SAVE_VERSION = 1;

const SCENES = new Set(['index', 'play', 'two-thread', 'counting-house']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validValues(values, length, max) {
  return Array.isArray(values) && values.length === length
    && values.every((value) => isInt(value, 0, max));
}

function validBaseChange(change, cellCount) {
  return isObject(change) && isInt(change.index, 0, cellCount - 1)
    && isInt(change.prevP, 0, 2) && isInt(change.newP, 0, 2)
    && isInt(change.prevPen, 0, 2) && isInt(change.newPen, 0, 2);
}

function validColoredChange(change, cellCount) {
  return isObject(change) && isInt(change.index, 0, cellCount - 1)
    && isInt(change.prev, 0, 3) && isInt(change.next, 0, 3);
}

function validHistory(history, validateChange, cellCount) {
  return Array.isArray(history) && history.every((entry) => Array.isArray(entry)
    && entry.length > 0 && entry.every((change) => validateChange(change, cellCount)));
}

export function validateBoardState(board) {
  if (!isObject(board) || !isInt(board.width, 1, 20) || !isInt(board.height, 1, 20)) return false;
  const count = board.width * board.height;
  if (board.kind === 'base') {
    return typeof board.autoX === 'boolean'
      && validValues(board.primary, count, 2) && validValues(board.pencil, count, 2)
      && validHistory(board.undo, validBaseChange, count)
      && validHistory(board.redo, validBaseChange, count);
  }
  if (board.kind === 'colored') {
    return validValues(board.marks, count, 3)
      && validHistory(board.undo, validColoredChange, count)
      && validHistory(board.redo, validColoredChange, count);
  }
  return false;
}

function validCursor(cursor, board) {
  return isObject(cursor) && isInt(cursor.x, 0, board.width - 1) && isInt(cursor.y, 0, board.height - 1);
}

export function validateLocation(location, knownCardIds = null) {
  if (!isObject(location) || !SCENES.has(location.scene)) return false;
  if (location.scene === 'index') {
    return (location.view === 'shelves' || location.view === 'cards')
      && isInt(location.shelf, 0, 7) && isInt(location.card, 0);
  }
  if (typeof location.cardId !== 'string' || location.cardId.length === 0) return false;
  if (knownCardIds && !knownCardIds.has(location.cardId)) return false;
  if (!validateBoardState(location.board) || !validCursor(location.cursor, location.board)) return false;
  if (typeof location.solved !== 'boolean' || typeof location.solvedLogged !== 'boolean') return false;
  if (!isInt(location.hintStage, 0, 3)) return false;
  if (!(location.hint === null || isObject(location.hint))) return false;
  if (location.scene === 'play' && !isInt(location.strikes, 0, 2)) return false;
  if (location.scene === 'two-thread' && !isInt(location.activeThread, 1, 2)) return false;
  return true;
}

export function createSaveDocument(progress, location, savedAt = Date.now()) {
  const ids = [...progress].sort();
  if (!ids.every((id) => typeof id === 'string') || !validateLocation(location)) {
    throw new Error('refusing to write invalid save state');
  }
  return { version: SAVE_VERSION, savedAt, progress: ids, location };
}

function validateDocument(doc, knownCardIds) {
  if (!isObject(doc) || !isInt(doc.savedAt, 0) || !Array.isArray(doc.progress)) return false;
  if (!doc.progress.every((id) => typeof id === 'string' && (!knownCardIds || knownCardIds.has(id)))) return false;
  if (new Set(doc.progress).size !== doc.progress.length) return false;
  return validateLocation(doc.location, knownCardIds);
}

function discard(storage) {
  try { storage.removeItem(SAVE_KEY); } catch (_) { /* a read notice is still returned */ }
}

export function loadSave(storage, knownCardIds = null) {
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch (_) {
    return { status: 'unavailable', notice: 'SAVE STORAGE UNAVAILABLE - FRESH INDEX STARTED' };
  }
  if (raw === null || raw === '') return { status: 'empty', data: null, notice: null };

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (_) {
    discard(storage);
    return { status: 'corrupt', data: null, notice: 'SAVE COULD NOT BE READ - FRESH INDEX STARTED' };
  }
  if (!isObject(doc) || doc.version !== SAVE_VERSION) {
    discard(storage);
    return { status: 'version-mismatch', data: null, notice: 'SAVE VERSION IS INCOMPATIBLE - FRESH INDEX STARTED' };
  }
  if (!validateDocument(doc, knownCardIds)) {
    discard(storage);
    return { status: 'corrupt', data: null, notice: 'SAVE COULD NOT BE READ - FRESH INDEX STARTED' };
  }
  return { status: 'ok', data: doc, notice: null };
}

export function writeSave(storage, progress, location, savedAt = Date.now()) {
  const doc = createSaveDocument(progress, location, savedAt);
  const raw = JSON.stringify(doc);
  storage.setItem(SAVE_KEY, raw);
  return raw;
}

export function clearSave(storage) {
  storage.removeItem(SAVE_KEY);
}
