// SHOELEATHER — M0 engine-harness world (NOT a case).
//
// A tiny two-room world that boots the engine and exercises every M0 system: the
// scene graph and exits, all hotspot verb kinds, the sweep affordance, a readable
// document (the text-layer + zoom), and scene-boundary checkpoints. There is no case
// data here, so the SOLVER LAW does not yet bind (the solver arrives with M1's typed
// facts). This world is disposable scaffolding the real cases replace.
//
// Prose follows the Exhaustion Floor register: clipped, procedural, no hardboiled
// metaphor, no em dashes in player-facing text.

import { Scene, SceneGraph } from '../engine/scene.js';
import { DocumentReader } from '../render/text.js';
import { PALETTE } from '../render/palette.js';
import { rect } from '../engine/geometry.js';
import { LOGICAL_W, LOGICAL_H } from '../config.js';

export function buildDemoWorld() {
  const graph = new SceneGraph();

  graph.add(new Scene({
    id: 'hall',
    name: 'Front Hall',
    background: { paint: 'room', tint: PALETTE.mustard, lamp: { x: 300, y: 70, r: 130 } },
    hotspots: [
      { id: 'raincoat', bounds: rect(28, 96, 44, 96), label: 'A raincoat on the hook', kind: 'look' },
      { id: 'umbrella', bounds: rect(80, 150, 26, 54), label: 'Umbrella stand', kind: 'look' },
      { id: 'notice', bounds: rect(150, 70, 40, 52), label: 'A notice, pinned', kind: 'use', meta: { document: 'notice' } },
      { id: 'office-door', bounds: rect(300, 78, 60, 120), label: 'Door to the back office', kind: 'exit' },
    ],
    links: [{ to: 'office', via: 'office-door' }],
  }));

  graph.add(new Scene({
    id: 'office',
    name: 'Back Office',
    background: { paint: 'room', tint: PALETTE.avocado, lamp: { x: 96, y: 96, r: 120 } },
    hotspots: [
      { id: 'desk', bounds: rect(60, 130, 120, 60), label: 'A cluttered desk', kind: 'look' },
      { id: 'ledger', bounds: rect(90, 120, 40, 26), label: 'A duty ledger', kind: 'use', meta: { document: 'ledger' } },
      { id: 'phone', bounds: rect(200, 128, 24, 20), label: 'The desk telephone', kind: 'talk' },
      { id: 'lamp-cord', bounds: rect(30, 40, 12, 90), label: 'A pull-cord lamp', kind: 'take' },
      { id: 'hall-door', bounds: rect(320, 78, 56, 120), label: 'Back to the front hall', kind: 'exit' },
    ],
    links: [{ to: 'hall', via: 'hall-door' }],
  }));

  const documents = {
    notice: new DocumentReader({
      id: 'notice',
      title: 'NOTICE TO ALL PERSONNEL',
      body: [
        'The night entrance stays locked after nine.',
        '',
        'Sign the ledger on the way out. Every time. No exceptions.',
        '',
        'Lost keys are docked from pay.',
      ].join('\n'),
    }),
    ledger: new DocumentReader({
      id: 'ledger',
      title: 'DUTY LEDGER',
      body: [
        'Tue. In 0812. Out 1740.',
        'Wed. In 0759. Out 1802.',
        'Thu. In 0805. Out ----.',
        '',
        'Note: Thursday out-time never filled in.',
      ].join('\n'),
    }),
  };

  return { graph, documents, startScene: 'hall', logical: { w: LOGICAL_W, h: LOGICAL_H } };
}
