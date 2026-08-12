// The ONE bindings table (ADDENDUM 3) — WASD-centric, left-hand cluster, single
// source of truth for controls. These lock the two properties the operator asked
// for: (1) movement is WASD+arrows and never shadows a command; (2) the on-screen
// legend (keybar + help) can't drift from the live dispatch, because both read
// this table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirFor, actionFor, MODE_HINTS, GLOBAL_HINTS } from '../src/engine/bindings.js';

test('movement is WASD with arrow alternates, mapped to cardinals', () => {
  assert.equal(dirFor('w'), 'N'); assert.equal(dirFor('W'), 'N'); assert.equal(dirFor('ArrowUp'), 'N');
  assert.equal(dirFor('s'), 'S'); assert.equal(dirFor('ArrowDown'), 'S');
  assert.equal(dirFor('a'), 'W'); assert.equal(dirFor('ArrowLeft'), 'W');
  assert.equal(dirFor('d'), 'E'); assert.equal(dirFor('ArrowRight'), 'E');
  assert.equal(dirFor('e'), null, 'E is interact, not a direction');
});

test('the left-hand cluster resolves to the shared semantic actions', () => {
  assert.equal(actionFor('overworld', 'e'), 'interact');
  assert.equal(actionFor('overworld', ' '), 'confirm');
  assert.equal(actionFor('overworld', 'Enter'), 'confirm');
  assert.equal(actionFor('overworld', 'Escape'), 'cancel');
  assert.equal(actionFor('overworld', 'q'), 'journal');
  assert.equal(actionFor('overworld', 'Tab'), 'journal');
  // globals, every mode
  for (const m of ['overworld', 'combat', 'title', 'city']) {
    assert.equal(actionFor(m, 'p'), 'palette');
    assert.equal(actionFor(m, 'c'), 'crt');
    assert.equal(actionFor(m, '?'), 'help');
    assert.equal(actionFor(m, '+'), 'zoomIn');
    assert.equal(actionFor(m, '-'), 'zoomOut');
  }
});

test('mode-exclusive actions layer on top without breaking shared meaning', () => {
  assert.equal(actionFor('overworld', 'r'), 'rest');
  assert.equal(actionFor('overworld', 'k'), 'save');
  assert.equal(actionFor('overworld', 'l'), 'eventlog');
  assert.equal(actionFor('overworld', 'o'), 'load');
  assert.equal(actionFor('combat', 'l'), 'eventlog');
  assert.equal(actionFor('overworld', '`'), null, 'the stale backtick binding is removed');
  // chp-worldgen: title's single-world "L to continue" gave way to the multi-world
  // registry menu — N starts a fresh world, X deletes the selected one, W/S/Space
  // (tested elsewhere) drive selection/continue.
  assert.equal(actionFor('title', 'n'), 'newWorld');
  assert.equal(actionFor('title', 'x'), 'delete');
  assert.equal(actionFor('creation', 'r'), 'reroll');
  // M11 tactical combat verbs (non-WASD keys; each shown on its card line)
  assert.equal(actionFor('combat', 'f'), 'attack');
  assert.equal(actionFor('combat', 'g'), 'defend');
  assert.equal(actionFor('combat', 'r'), 'useitem');
  assert.equal(actionFor('combat', 'v'), 'subterfuge');
  assert.equal(actionFor('combat', 't'), 'talk');
  assert.equal(actionFor('combat', 'x'), 'flee');
  assert.equal(actionFor('journal', 'n'), 'newnote');
  assert.equal(actionFor('overworld', 'u'), 'worldmap');
  assert.equal(actionFor('dungeon', 'u'), 'worldmap');
  assert.equal(actionFor('city', 'u'), 'worldmap');
  // an unbound key is null (no dead-key crashes)
  assert.equal(actionFor('overworld', 'z'), null);
});

test('no key is BOTH a movement and a command in any mode (no shadowing)', () => {
  const KEYS = ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'e', 'q', ' ', 'Enter', 'Escape', 'p', 'c', '?', '+', '-', 'r', 'k', 'l', 'o', 'f', 't', 'x', 'n', 'Tab'];
  const MODES = ['title', 'creation', 'overworld', 'dungeon', 'city', 'building', 'journal', 'combat', 'death'];
  for (const m of MODES) {
    for (const k of KEYS) {
      const move = dirFor(k) != null, act = actionFor(m, k) != null;
      assert.ok(!(move && act), `key "${k}" is both movement and a command in mode "${m}"`);
    }
  }
});

// The regression the addendum asks for: every keycap the legend advertises maps
// to a real, dispatchable binding — the keybar can't promise a control the shell
// doesn't honour. Representative key per displayed keycap:
const CAP_KEY = {
  WASD: 'w', 'W/S': 'w', 'A/D': 'a', E: 'e', U: 'u', Q: 'q', R: 'r', K: 'k', L: 'l', O: 'o', N: 'n', I: 'i', M: 'm',
  Space: ' ', Esc: 'Escape', F: 'f', G: 'g', V: 'v', T: 't', X: 'x', P: 'p', C: 'c', '+/-': '+', '?': '?',
  'the record': 'l', Y: 'y', party: 'y', 'dungeon map': 'n', 'world map': 'u',
  H: 'h', manual: 'h',
};

test('every keybar/help keycap maps to a live binding (legend cannot drift)', () => {
  for (const [mode, hints] of Object.entries(MODE_HINTS)) {
    const realMode = (mode === 'combatTalk' || mode === 'combatItem') ? 'combat' : mode;
    for (const [cap] of hints) {
      if (cap === '1-9') continue; // positional approach-select, handled by index
      const key = CAP_KEY[cap];
      assert.ok(key !== undefined, `no representative key registered for legend cap "${cap}"`);
      const live = dirFor(key) != null || actionFor(realMode, key) != null;
      assert.ok(live, `${mode}: legend cap "${cap}" (${key}) dispatches to nothing`);
    }
  }
  for (const [cap] of GLOBAL_HINTS) {
    const key = CAP_KEY[cap];
    assert.ok(actionFor('overworld', key) != null, `global cap "${cap}" dispatches to nothing`);
  }
});

test('WASD-centric: overworld advertises walk/enter/journal on the left hand', () => {
  const caps = MODE_HINTS.overworld.map(([c]) => c);
  assert.ok(caps.includes('WASD'));
  assert.ok(caps.includes('E'));   // interact/enter, left hand
  assert.ok(caps.includes('Q'));   // journal surface, left hand
});
