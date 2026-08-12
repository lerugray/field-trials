// Save export/import (M10). Turns a game state into a single portable token the
// operator can copy out or paste back in (the spec's "save export/import"), and
// back again. Pure and portable: it uses TextEncoder/TextDecoder (present in both
// node and the browser) and a hand-rolled base64 so there is no btoa/Buffer
// dependency and it is fully unit-tested. Validation is delegated to
// save.deserialize, so a tampered or truncated token degrades to null, never a
// broken import.

import { serialize, deserialize } from './save.js';

// A short human-visible prefix so a pasted token is recognizable and versioned.
const MAGIC = 'ODDZ1:';

// A real save token is a few KB at most (one pet + a capped 12-retiree Meadow).
// Anything vastly larger is a paste bomb / crash vector, not a save — reject it
// before decoding so we never allocate a giant buffer from untrusted input.
const MAX_TOKEN_LEN = 100000;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV = (() => {
  const m = {};
  for (let i = 0; i < B64.length; i++) m[B64[i]] = i;
  return m;
})();

function bytesToB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

function b64ToBytes(str) {
  const s = str.replace(/[^A-Za-z0-9+/]/g, ''); // drop '=' padding and any whitespace
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const c0 = B64_INV[s[i]];
    const c1 = B64_INV[s[i + 1]];
    const c2 = B64_INV[s[i + 2]];
    const c3 = B64_INV[s[i + 3]];
    if (c0 === undefined || c1 === undefined) break;
    out.push((c0 << 2) | (c1 >> 4));
    if (c2 !== undefined) out.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 !== undefined) out.push(((c2 & 3) << 6) | c3);
  }
  return Uint8Array.from(out);
}

/**
 * Encode a game state as a portable, copy-pasteable token.
 * @param {object} state
 * @returns {string} e.g. "ODDZ1:eyJ2ZXJ..."
 */
export function encodeSave(state) {
  const json = serialize(state);
  const bytes = new TextEncoder().encode(json);
  return MAGIC + bytesToB64(bytes);
}

/**
 * Decode a token (or a raw JSON paste) back into a validated state.
 * Returns null on anything unusable — same contract as save.deserialize.
 * @param {string} token
 * @returns {object|null}
 */
export function decodeSave(token) {
  if (typeof token !== 'string') return null;
  if (token.length > MAX_TOKEN_LEN) return null;
  const t = token.trim();
  if (!t) return null;
  if (!t.startsWith(MAGIC)) {
    // Tolerate a raw serialized-JSON paste as well, so a hand-copied save works.
    return deserialize(t);
  }
  const body = t.slice(MAGIC.length);
  let json;
  try {
    json = new TextDecoder().decode(b64ToBytes(body));
  } catch {
    return null;
  }
  return deserialize(json);
}

export const SAVE_TOKEN_PREFIX = MAGIC;
