// bindings.js — the single source of truth for controls (ADDENDUM 3).
//
// Ray: remap to WASD-centric ergonomics, interactions clustered near the left
// hand, and route ALL input through one bindings table so a rebinding UI (banked)
// has a single place to write and a key can never mean two things or go
// undocumented. The shell dispatches on the semantic ACTION this table returns;
// the keybar legend and the [?] help overlay are generated from the SAME table
// (chrome.js imports MODE_HINTS/GLOBAL_HINTS from here), so the legend and the
// live controls can never drift apart.
//
// Layout: movement on WASD (arrows stay as alternates). The left-hand cluster —
//   E  interact / enter a site or door
//   Space  confirm / advance / accept
//   Q (or Tab)  the journal surface
//   Esc  cancel / leave / close
// — sits under the left hand while it rests on WASD. Combat verbs get their own
// tight cluster (F fight / T talk / X flee). Everything else (rest/save/load,
// palette/CRT/zoom/help) keeps its mnemonic key.

// Movement: physical key -> cardinal direction. WASD primary, arrows alternate.
// In the dungeon the same keys drive the crawl (W/S forward-back, A/D turn) — the
// shell reads the direction and interprets it per mode, so this stays one table.
const DIR = {
  ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E',
  w: 'N', s: 'S', a: 'W', d: 'E', W: 'N', S: 'S', A: 'W', D: 'E',
};

/** Cardinal direction for a movement key, or null. */
export function dirFor(key) { return DIR[key] || null; }

// Shared actions — the same physical key means the same thing in every mode it
// applies to (the M6 consistency bar). Movement keys are handled by dirFor and
// deliberately excluded here so they can't shadow a shared action.
const SHARED = {
  ' ': 'confirm', Enter: 'confirm',
  e: 'interact', E: 'interact',
  Escape: 'cancel',
  q: 'journal', Q: 'journal', Tab: 'journal',
  i: 'inventory', I: 'inventory',
  y: 'party', Y: 'party', // the party-management surface (D3)
  t: 'talk', T: 'talk', // talk to an adjacent being (F1); combat overrides with its own talk
  p: 'palette', P: 'palette',
  c: 'crt', C: 'crt',
  m: 'mute', M: 'mute',
  l: 'eventlog', L: 'eventlog', // the record — [L] globally; Shift+L dumps JSON
  h: 'manual', H: 'manual', // the questline reader (Structure Arc slice 1, LOCK 1/2)
  '?': 'help',
  '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', _: 'zoomOut',
};

// Per-mode actions layered ON TOP of SHARED (a mode entry wins on collision).
// These keys are mode-exclusive, so reusing a letter across modes never breaks
// the "same key, same meaning" rule for the shared cluster above.
const PER_MODE = {
  overworld: { r: 'rest', R: 'rest', k: 'save', K: 'save', o: 'load', O: 'load', u: 'worldmap', U: 'worldmap' },
  title: { n: 'newWorld', N: 'newWorld', x: 'delete', X: 'delete' },
  dungeon: { n: 'map', N: 'map', u: 'worldmap', U: 'worldmap' },
  city: { u: 'worldmap', U: 'worldmap' },
  creation: { r: 'reroll', R: 'reroll' },
  // M11 tactical combat: the four verbs + parley + flee. Keys avoid WASD/arrows (the
  // movement set stays movement-only, no shadowing) and the shared cluster; each verb's
  // key is shown on its card line so the mapping is always legible. Esc is the unified
  // "get me out" (flee at root, back out of a submenu) across encounter + combat
  // (UI-critique #2); X stays as a flee alternate for muscle memory.
  combat: {
    f: 'attack', F: 'attack',
    g: 'defend', G: 'defend',
    r: 'useitem', R: 'useitem',
    v: 'subterfuge', V: 'subterfuge',
    t: 'talk', T: 'talk',
    x: 'flee', X: 'flee',
  },
  journal: { n: 'newnote', N: 'newnote' },
};

/**
 * The semantic action a key triggers in a given mode, or null. Per-mode bindings
 * win over shared ones; movement keys return null here (use dirFor).
 */
export function actionFor(mode, key) {
  const per = PER_MODE[mode];
  if (per && key in per) return per[key];
  if (key in SHARED) return SHARED[key];
  return null;
}

// ---- legend (generated from the same intent as the dispatch table) ----------
// Displayed keycaps: WASD/arrows show as one "WASD" chip; +/- as one "zoom" chip.
// Each entry is [keycap, label]; buildKeybar/buildHelpOverlay read these.

export const GLOBAL_HINTS = [
  ['I', 'pack'],
  ['Y', 'party'],
  ['L', 'the record'],
  ['M', 'mute'],
  ['P', 'palette'],
  ['C', 'CRT'],
  ['+/-', 'zoom'],
  ['?', 'help'],
];

export const MODE_HINTS = {
  title: [['Space', 'continue selected'], ['N', 'new world'], ['X', 'delete'], ['W/S', 'select']],
  creation: [['Space', 'accept'], ['E', 'embark'], ['R', 'deal again'], ['Esc', 'back']],
  overworld: [['WASD', 'walk'], ['E', 'enter'], ['T', 'talk'], ['U', 'map'], ['H', 'manual'], ['Q', 'journal'], ['R', 'rest'], ['K', 'save'], ['O', 'load']],
  dungeon: [['W/S', 'move'], ['A/D', 'turn'], ['N', 'dungeon map'], ['U', 'world map'], ['H', 'manual'], ['Q', 'journal'], ['Esc', 'leave']],
  city: [['WASD', 'walk'], ['E', 'enter'], ['T', 'talk'], ['U', 'map'], ['H', 'manual'], ['Q', 'journal'], ['Esc', 'leave']],
  journal: [['N', 'new note'], ['W/S', 'select'], ['E', 'revise'], ['Q', 'close']],
  building: [['Space', 'back']],
  combat: [['F', 'strike'], ['G', 'guard'], ['R', 'reach'], ['V', 'gambit'], ['T', 'parley'], ['Esc', 'break away']],
  combatTalk: [['1-9', 'approach'], ['Esc', 'back']],
  combatItem: [['1-9', 'use'], ['Esc', 'back']],
  death: [['Space', 'take up the thread']],
};
