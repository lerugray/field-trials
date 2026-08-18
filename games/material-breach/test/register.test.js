// M6 register pass: every player-facing string obeys the voice laws (DESIGN-SEED §4.1-§4.3). This
// is the mechanical half (no em-dash, no exclamation, no stray curly quote, always a numeric
// neighbour on report lines); the "darkly funny / in-voice" half stays human-judged at the LOOK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, CELL, ROOM } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { designate, queueExcavate, queueFortify } from '../src/actions.js';
import { refreshRooms } from '../src/rooms.js';
import { ORIENTATION, TOOLS } from '../src/view.js';
import { OFFICER, INSTRUMENT_NAME } from '../src/ladder.js';
import { computeButtons } from '../src/layout.js';
import { PROVENANCE } from '../src/provenance.js';

// A player-facing string must not contain an em-dash, an exclamation mark, or a curly quote.
function lintString(s, where) {
  assert.ok(!s.includes('—'), `${where} contains an em-dash: "${s}"`);
  assert.ok(!s.includes('!'), `${where} contains an exclamation mark: "${s}"`);
  assert.ok(!/[‘’“”]/.test(s), `${where} contains a curly quote: "${s}"`);
}

test('every report line across varied tenures obeys the voice laws', () => {
  const kinds = new Set();
  for (const seed of ['reg-a', 'reg-b', 'reg-c']) {
    let f = createFacility({ seed });
    // A department strip so hiring/conversion lines can emit.
    const { x, y } = f.lossObject.cell;
    for (let i = 0; i < 5; i++) {
      const c = f.grid[y + 3][x - 2 + i];
      c.kind = CELL.FLOOR; c.excavated = true; c.claimed = true; c.surveyed = true;
    }
    designate(f, x - 2, y + 3, ROOM.RECORDS);
    designate(f, x - 1, y + 3, ROOM.QUARTERS);
    designate(f, x, y + 3, ROOM.QUARTERS);
    refreshRooms(f);
    let guard = 0;
    while (f.status === 'active' && guard++ < 25) {
      if (f.treasury.gold >= 50) queueFortify(f);
      queueExcavate(f, x + 2, y);
      f = commitCycle(f);
      for (const line of f.lastReport.lines) {
        kinds.add(line.kind);
        assert.ok(line.text && line.text.length > 0, `line ${line.kind} has empty prose`);
        assert.ok(line.numeric && /\d/.test(line.numeric), `line ${line.kind} has no numeric neighbour`);
        lintString(line.text, `report ${line.kind}.text`);
        lintString(line.numeric, `report ${line.kind}.numeric`);
        if (line.cause) lintString(line.cause, `report ${line.kind}.cause`);
      }
    }
  }
  // The varied tenures exercised a broad set of consequence-bearing lines.
  for (const required of ['income', 'raid', 'payday', 'excavation', 'terminal']) {
    assert.ok(kinds.has(required), `expected a '${required}' line somewhere in the runs`);
  }
});

test('the orientation packet obeys the voice laws', () => {
  for (const line of ORIENTATION) lintString(line, 'orientation');
});

test('the officer names, instrument names and tool labels obey the voice laws', () => {
  for (const v of Object.values(OFFICER)) lintString(v, 'officer');
  for (const v of Object.values(INSTRUMENT_NAME)) lintString(v, 'instrument');
  for (const t of TOOLS) lintString(t.label, 'tool');
});

test('every action-bar and overlay button label obeys the voice laws', () => {
  const f = createFacility({ seed: 'buttons' });
  f.ladder.rung = 'surveyor';
  f.notices.push({ id: 'n1', rung: 'surveyor', instrument: 'schedule-of-dilapidations', status: 'served', cyclesRemaining: 3 });
  const base = { facility: f, toolLabel: 'Excavate', hasShell: true, muted: false, replay: null };
  // M8's shell surfaces are player-facing too, so they join the lint the moment they exist. A
  // voice law that only covers the surfaces that happened to exist when it was written is not a law.
  for (const overlay of ['title', 'options', 'provenance', 'orientation', 'checklist', 'pause', 'error', 'closed', 'raid', null]) {
    const view = { ...base, overlay };
    for (const b of computeButtons(view)) lintString(b.label, `button ${b.id} (overlay ${overlay})`);
  }
  // ...and the resumable variant of the title, which offers different words.
  for (const b of computeButtons({ ...base, overlay: 'title', resumable: true })) {
    lintString(b.label, `button ${b.id} (title, resumable)`);
  }
});

test('the provenance credits obey the voice laws', () => {
  // The credits are read by a player, so they are player-facing text and the voice laws bind them.
  for (const [, line] of PROVENANCE) if (line) lintString(line, 'provenance');
});
