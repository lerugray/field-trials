// THE JACQUARD INDEX — sets and panels (completed sets assemble the house's story).
//
// A PANEL is a set of member cards whose solved reveals tile into one larger cloth — a
// patchwork (the seed's assembly frame, not a deduction twist). When every member of a
// set is woven, the panel assembles. Members share a size and fill a cols x rows grid.
// Panels are code-defined; their composite is pixel-checked against the members in the
// suite.

import { Puzzle } from '../puzzle/puzzle.js';
import { PATCHWORK_PANELS } from './patchworkMotifs.js';

export const PANELS = [
  {
    id: 'sampler',
    name: 'THE SAMPLER',
    blurb: 'The apprentice piece: four motifs, one cloth.',
    cols: 2,
    rows: 2,
    gap: 1, // bare-warp seam between patches
    members: ['button', 'star', 'thistle', 'oak'],
  },
  // THE GRAND PATCHWORK finale: the house's story, panel by panel.
  ...PATCHWORK_PANELS,
];

// The panel a card belongs to that is NOW fully woven (all members in `progress`), or
// null. Used to trigger the assembled-panel story payoff when the last member is solved.
export function completedPanelFor(cardId, progress) {
  for (const panel of PANELS) {
    if (panel.members.includes(cardId) && panel.members.every((id) => progress.has(id))) {
      return panel;
    }
  }
  return null;
}

// Tile the member solutions into one composite grid. Returns a Puzzle built from the
// assembled solution (used purely as a picture — patchwork is an assembly, not a puzzle).
export function composePanel(panel, cardsById) {
  const members = panel.members.map((id) => {
    const c = cardsById[id];
    if (!c) throw new Error(`panel ${panel.id}: unknown member ${id}`);
    return c;
  });
  const cell = members[0].puzzle.width; // members share a size
  for (const m of members) {
    if (m.puzzle.width !== cell || m.puzzle.height !== cell) {
      throw new Error(`panel ${panel.id}: member ${m.id} is not ${cell}x${cell}`);
    }
  }
  const gap = panel.gap || 0;
  const width = panel.cols * cell + (panel.cols - 1) * gap;
  const height = panel.rows * cell + (panel.rows - 1) * gap;
  const solution = new Uint8Array(width * height);

  members.forEach((m, i) => {
    const gx = (i % panel.cols) * (cell + gap);
    const gy = Math.floor(i / panel.cols) * (cell + gap);
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        solution[(gy + y) * width + (gx + x)] = m.puzzle.at(x, y);
      }
    }
  });

  return new Puzzle(width, height, solution);
}
