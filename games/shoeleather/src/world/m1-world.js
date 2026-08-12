// SHOELEATHER — M1 investigation world (the toy case, made playable).
//
// Binds the M1 toy case's typed facts, statements and documents to hotspots across a
// few scenes so the evidence spine is VISIBLE in-game: the player sweeps, observes
// facts (auto-logged), reads load-bearing documents, hears suspect statements, and
// works the notebook. This supersedes the M0 engine-harness world as the thing the
// operator boots. Still pre-M4 art (register-correct lit backdrops).
//
// It is the toy case, NOT Case 1 (M3). The accusation board is M2/M3; M1 stops at a
// navigable, searchable evidence pile proven solvable by the headless solver.

import { Scene, SceneGraph } from '../engine/scene.js';
import { DocumentReader } from '../render/text.js';
import { PALETTE } from '../render/palette.js';
import { rect } from '../engine/geometry.js';
import { buildCase1 } from '../case/fixtures/case-1.js';
import { LOGICAL_W, LOGICAL_H } from '../config.js';

export function buildM1World() {
  const caseData = buildCase1();
  const graph = new SceneGraph();

  graph.add(new Scene({
    id: 'restaurant', name: 'The Restaurant, after hours',
    background: { paint: 'art', art: 'restaurant', tint: PALETTE.burntOrange, lamp: { x: 300, y: 80, r: 150 } },
    hotspots: [
      { id: 'valet-log', bounds: rect(24, 96, 46, 60), label: 'The valet log', kind: 'use', meta: { facts: ['f-chef-at-restaurant', 'f-valet-corroboration'], document: 'valet' } },
      { id: 'knife-rack', bounds: rect(120, 60, 60, 40), label: 'The chef\'s knife rack', kind: 'look', meta: { fact: 'f-chef-knife' } },
      { id: 'chef', bounds: rect(210, 70, 40, 110), label: 'The chef', kind: 'talk', meta: { suspect: 'chef' } },
      { id: 'waiter', bounds: rect(96, 120, 30, 70), label: 'The line waiter', kind: 'talk', meta: { suspect: 'waiter' } },
      { id: 'to-morgue', bounds: rect(0, 80, 22, 120), label: 'Out to the coroner', kind: 'exit' },
      { id: 'to-studio', bounds: rect(352, 80, 32, 120), label: 'Over to the studio lot', kind: 'exit' },
    ],
    links: [{ to: 'morgue', via: 'to-morgue' }, { to: 'studio', via: 'to-studio' }],
  }));

  graph.add(new Scene({
    id: 'morgue', name: 'The Coroner\'s Office',
    background: { paint: 'art', art: 'morgue', tint: PALETTE.avocado, lamp: { x: 96, y: 70, r: 120 } },
    hotspots: [
      { id: 'coroner-report', bounds: rect(60, 120, 90, 40), label: 'The coroner\'s report', kind: 'use', meta: { fact: 'f-means', document: 'coroner' } },
      { id: 'tod-board', bounds: rect(180, 60, 80, 50), label: 'Time-and-place findings', kind: 'look', meta: { facts: ['f-time', 'f-place'] } },
      { id: 'bank-letter', bounds: rect(280, 110, 40, 30), label: 'A private bank letter', kind: 'use', meta: { fact: 'f-partner-debt', document: 'bank' } },
      { id: 'back-to-restaurant', bounds: rect(352, 80, 32, 120), label: 'Back to the restaurant', kind: 'exit' },
    ],
    links: [{ to: 'restaurant', via: 'back-to-restaurant' }],
  }));

  graph.add(new Scene({
    id: 'studio', name: 'The Studio Lot',
    background: { paint: 'art', art: 'studio', tint: PALETTE.mustard, lamp: { x: 200, y: 60, r: 140 } },
    hotspots: [
      { id: 'staff-ledger', bounds: rect(70, 110, 60, 40), label: 'The studio slate ledger', kind: 'use', meta: { facts: ['f-waiter-quit', 'f-tape-mechanism'], document: 'ledger' } },
      { id: 'back-to-restaurant-2', bounds: rect(0, 80, 22, 120), label: 'Back to the restaurant', kind: 'exit' },
    ],
    links: [{ to: 'restaurant', via: 'back-to-restaurant-2' }],
  }));

  // Load-bearing + red-herring documents (readable, zoomable). linkedFact ties each
  // to the evidence it carries, so the orphan linter is satisfied for documents too.
  const documents = {
    valet: doc('valet', 'VALET TICKET LOG', [
      'Thu.',
      '19.52  in   silver coupe   tag CHEF-1',
      '23.10  out  silver coupe',
      '',
      'The chef parked here at eight. Not the studio.',
      'Carbon copy initialled by the valet on duty.',
    ], 'f-chef-at-restaurant'),
    coroner: doc('coroner', 'CORONER FINDINGS', [
      'Single wound. Narrow blade. Close contact.',
      '',
      'Consistent with a boning knife.',
    ], 'f-means'),
    bank: doc('bank', 'NOTICE OF ARREARS', [
      'Account holder is past due on three notes.',
      '',
      'This is a private matter. It is not your case.',
    ], 'f-partner-debt', true),
    ledger: doc('ledger', 'STAFF LEDGER', [
      'The waiter gave notice on Monday.',
      '',
      'Last shift logged Thursday. Nothing after.',
      '',
      'STUDIO SLATE: Thursday segment. Recorded Wednesday.',
    ], 'f-waiter-quit', true),
  };

  // Attach the readable documents to the case so the solver's orphan linter lints
  // them (each must carry a linkedFact or a red-herring tag).
  caseData.documents = documents;

  // The ratified PoC (the restaurant office) is the murder scene behind the prologue/ending.
  return { graph, documents, caseData, startScene: 'restaurant', backdropArt: 'restaurant-office', logical: { w: LOGICAL_W, h: LOGICAL_H } };
}

function doc(id, title, bodyLines, linkedFact, redHerring = false) {
  const d = new DocumentReader({ id, title, body: bodyLines.join('\n') });
  d.linkedFact = linkedFact;   // consumed by the orphan linter
  d.redHerring = redHerring;
  return d;
}
