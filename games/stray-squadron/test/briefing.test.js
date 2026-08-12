// M5.4 — Commander Cuckoo's briefing voice. These are structural/register guards,
// not a taste judgement (the operator's voice pass is the real gate, per
// DIRECTIONS-M5). They enforce the mechanical rules the prose must never break:
// no em-dashes (hard rule 14), it actually reads the map, and it is never empty.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cuckooBriefing, cuckooDebrief, cuckooSignoff, cuckooBossHail, allBriefingText,
} from '../src/run/briefing.js';
import { buildRoute } from '../src/run/route.js';

test('no memorial line ever contains an em-dash (hard rule 14)', () => {
  for (const line of allBriefingText()) {
    assert.ok(!line.includes('—'), 'em-dash in: ' + line);
    assert.ok(!line.includes('--'), 'double-hyphen dash in: ' + line);
    assert.ok(line.trim().length > 0, 'empty briefing line');
  }
});

test('the briefing is spoken by Commander Cuckoo and reads the actual map', () => {
  const route = buildRoute('brief-1');
  const b = cuckooBriefing(route);
  assert.equal(b.speaker, 'Commander Cuckoo');
  assert.ok(b.lines.length >= 3);
  // it names the first sector and the run length
  const joined = b.lines.join(' ');
  assert.ok(joined.includes(route.nodes[route.startId].sectorName), 'briefing omits the first sector');
  assert.ok(joined.includes(String(route.levels)) || route.levels === 1, 'briefing omits the sector count');
});

test('a multi-sector run mentions the fork; a single-sector one does not', () => {
  const multi = cuckooBriefing({ levels: 4, startId: 's', nodes: { s: { sectorName: 'X' } } });
  assert.ok(multi.lines.join(' ').toLowerCase().includes('fork'));
  const solo = cuckooBriefing({ levels: 1, startId: 's', nodes: { s: { sectorName: 'X' } } });
  assert.ok(!solo.lines.join(' ').toLowerCase().includes('fork'));
});

test('debrief has a warm line for every medal, including a missed one', () => {
  for (const m of ['gold', 'silver', 'bronze', 'none']) {
    const d = cuckooDebrief(m);
    assert.equal(d.speaker, 'Commander Cuckoo');
    assert.ok(d.line.length > 0);
  }
  // an unknown medal falls back to the warmest line, never crashes
  assert.equal(cuckooDebrief('???').line, cuckooDebrief('none').line);
});

test('sign-off differs for victory vs a ship-down, both non-empty', () => {
  const win = cuckooSignoff({ victory: true }).line;
  const down = cuckooSignoff({ victory: false }).line;
  assert.notEqual(win, down);
  assert.ok(win.length > 0 && down.length > 0);
});

test('the boss hail (M8) is Cuckoo, warm across all three climax beats', () => {
  const kinds = ['approach', 'phase', 'down'];
  const lines = kinds.map((k) => cuckooBossHail(k).line);
  for (const k of kinds) assert.equal(cuckooBossHail(k).speaker, 'Commander Cuckoo');
  assert.equal(new Set(lines).size, 3, 'each climax beat has its own line');
  for (const l of lines) assert.ok(l.length > 0 && !l.includes('—'));
  // an unknown beat never crashes, falls back to the approach hail
  assert.equal(cuckooBossHail('???').line, cuckooBossHail('approach').line);
});

test('the memorial name Cuckoo never appears as a punchline target (never mocked)', () => {
  // sanity: none of the shipped lines put the commander down or treat the loss as a
  // joke. We can't judge tone in code, but we can guard the obvious cruelty tokens.
  const banned = ['stupid', 'idiot', 'useless', 'pathetic', 'loser', 'worthless'];
  for (const line of allBriefingText()) {
    const low = line.toLowerCase();
    for (const b of banned) assert.ok(!low.includes(b), 'cruel token "' + b + '" in: ' + line);
  }
});
