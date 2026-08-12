// SHOELEATHER — CASE 2 world (the cruise-ship case, made playable).
//
// Binds Case 2's typed facts, statements and documents to hotspots across the ship so
// the evidence spine is VISIBLE in-game: the stateroom (the murder scene), the first-
// class lounge (the alibi — the card table, the slow clock, the two suspects), and the
// purser's office (the weapon's absence). Mirrors m1-world's structure.
//
// Scenes render at the M4 VACUUM SEALED bar (paint: 'art' -> the cruise painters in
// scene-art.js); the stateroom art doubles as the prologue/ending murder-scene backdrop.
// The embedded case passes the full solver battery WITH these documents attached.

import { Scene, SceneGraph } from '../engine/scene.js';
import { DocumentReader } from '../render/text.js';
import { PALETTE } from '../render/palette.js';
import { rect } from '../engine/geometry.js';
import { buildCase2 } from '../case/fixtures/case-2.js';
import { LOGICAL_W, LOGICAL_H } from '../config.js';

export function buildCase2World() {
  const caseData = buildCase2();
  const graph = new SceneGraph();

  graph.add(new Scene({
    id: 'stateroom', name: 'The Auditor\'s Stateroom',
    background: { paint: 'art', art: 'stateroom', tint: PALETTE.walnut, lamp: { x: 300, y: 70, r: 150 } },
    hotspots: [
      { id: 'the-berth', bounds: rect(206, 118, 66, 54), label: 'The auditor, on the berth', kind: 'look', meta: { facts: ['f-means', 'f-place'] } },
      { id: 'dinner-tray', bounds: rect(54, 150, 64, 32), label: 'The untouched dinner tray', kind: 'look', meta: { fact: 'f-time' } },
      { id: 'open-ledger', bounds: rect(150, 92, 52, 40), label: 'His open ledger', kind: 'use', meta: { fact: 'f-purser-skim', document: 'ledger' } },
      { id: 'to-lounge', bounds: rect(352, 80, 32, 120), label: 'Up to the first-class lounge', kind: 'exit' },
      { id: 'to-office', bounds: rect(0, 80, 22, 120), label: 'Down to the purser\'s office', kind: 'exit' },
    ],
    links: [{ to: 'lounge', via: 'to-lounge' }, { to: 'office', via: 'to-office' }],
  }));

  graph.add(new Scene({
    id: 'lounge', name: 'The First-Class Lounge',
    background: { paint: 'art', art: 'lounge', tint: PALETTE.burntOrange, lamp: { x: 190, y: 60, r: 150 } },
    hotspots: [
      { id: 'purser', bounds: rect(60, 90, 40, 100), label: 'The purser, at the card table', kind: 'talk', meta: { suspect: 'purser' } },
      { id: 'bandleader', bounds: rect(300, 70, 40, 110), label: 'The bandleader, by the bandstand', kind: 'talk', meta: { suspect: 'bandleader' } },
      { id: 'lounge-clock', bounds: rect(178, 40, 40, 40), label: 'The lounge clock and order book', kind: 'look', meta: { fact: 'f-clock-mechanism' } },
      { id: 'steward-note', bounds: rect(150, 120, 60, 40), label: 'The night steward\'s account', kind: 'use', meta: { facts: ['f-purser-corridor', 'f-deck-log-corroboration'], document: 'steward' } },
      { id: 'maitre-book', bounds: rect(222, 120, 52, 40), label: 'The maitre d\'s reservation book', kind: 'use', meta: { fact: 'f-bandleader-row', document: 'maitre' } },
      { id: 'lounge-to-stateroom', bounds: rect(0, 80, 22, 120), label: 'Back to the stateroom', kind: 'exit' },
    ],
    links: [{ to: 'stateroom', via: 'lounge-to-stateroom' }],
  }));

  graph.add(new Scene({
    id: 'office', name: 'The Purser\'s Office',
    background: { paint: 'art', art: 'office', tint: PALETTE.avocado, lamp: { x: 96, y: 70, r: 120 } },
    hotspots: [
      { id: 'purser-desk', bounds: rect(118, 108, 92, 52), label: 'The purser\'s desk', kind: 'look', meta: { fact: 'f-purser-weapon' } },
      { id: 'office-to-stateroom', bounds: rect(352, 80, 32, 120), label: 'Back to the stateroom', kind: 'exit' },
    ],
    links: [{ to: 'stateroom', via: 'office-to-stateroom' }],
  }));

  // Load-bearing + red-herring documents (readable, zoomable). linkedFact ties each to
  // the evidence it carries so the orphan linter is satisfied for documents too.
  const documents = {
    steward: doc('steward', 'NIGHT STEWARD, STATEMENT', [
      'Saw the purser leave B-deck corridor.',
      'By the lounge clock: a quarter to twelve.',
      '',
      'But the lounge clock was put back the hour early.',
      'True time: a quarter to eleven.',
      '',
      'The signed deck log records the purser\'s B-deck key.',
    ], 'f-purser-corridor'),
    ledger: doc('ledger', 'THE AUDITOR\'S LEDGER', [
      'A column of the ship\'s accounts, circled.',
      '',
      'The purser\'s name beside the short figures.',
      'A private matter for the line. Not your case.',
    ], 'f-purser-skim', true),
    maitre: doc('maitre', 'MAITRE D\', RESERVATION BOOK', [
      'Table nine: the auditor. Raised voices at dinner.',
      '',
      'The bandleader was asked to return to the stand.',
      'Loud words. Nothing more.',
    ], 'f-bandleader-row', true),
  };

  caseData.documents = documents;

  // backdropArt = the stateroom (the murder scene) behind the prologue/ending prose.
  return { graph, documents, caseData, startScene: 'stateroom', backdropArt: 'stateroom', logical: { w: LOGICAL_W, h: LOGICAL_H } };
}

function doc(id, title, bodyLines, linkedFact, redHerring = false) {
  const d = new DocumentReader({ id, title, body: bodyLines.join('\n') });
  d.linkedFact = linkedFact;
  d.redHerring = redHerring;
  return d;
}
