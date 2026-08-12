// sidemode.js — the OPTIONAL procedural side mode (DESIGN-SEED M8: scaffold-grade; the full
// roguelite restructure is DECLINED). A seeded run assembles a stage from a small library of
// campaign-flavored CHUNKS (flat trash, jumpable pit, hopper perch, gauntlet), then caps it with a
// boss arena. SANDBOXED: the boot layer runs this on its own save slot with a fresh character, so
// nothing earned here enters the campaign save. Deterministic per seed; verified bot-clearable.

import { createRng } from '../core/rng.js';
import { buildStage } from '../content/stagebuilder.js';

const CHUNK_W = 10;

// Each chunk contributes enemies/pits/platforms at its column offset `o`. Pits stay ≤2 wide so
// they're always jumpable (keeps assembled runs beatable).
const CHUNK_LIBRARY = [
  { name: 'flat-trash', build: (o) => ({ walkers: [o + 3, o + 7] }) },
  { name: 'pit-jump', build: (o) => ({ pits: [[o + 4, o + 5]], walkers: [o + 8] }) },
  { name: 'hopper-perch', build: (o) => ({ platforms: [[9, o + 3, o + 7]], hoppers: [[8, o + 5]] }) },
  { name: 'gauntlet', build: (o) => ({ walkers: [o + 2, o + 5, o + 8] }) },
];

export const SIDE_CHUNK_NAMES = Object.freeze(CHUNK_LIBRARY.map((c) => c.name));

/**
 * Assemble a procedural side-mode stage def from a seed.
 * @param {number|string} seed
 * @param {number} [chunkCount=5]
 * @returns {object} a stage def (with `sideMode: true` + the chunk sequence used)
 */
export function assembleSideStage(seed, chunkCount = 5, startXp = 220) {
  const rng = createRng(seed);
  const walkers = [], hoppers = [], pits = [], platforms = [];
  const sequence = [];
  let width = 4; // leading margin for the player spawn

  for (let i = 0; i < chunkCount; i++) {
    const chunk = CHUNK_LIBRARY[rng.int(0, CHUNK_LIBRARY.length - 1)];
    const parts = chunk.build(width);
    if (parts.pits) pits.push(...parts.pits);
    if (parts.platforms) platforms.push(...parts.platforms);
    if (parts.walkers) walkers.push(...parts.walkers);
    if (parts.hoppers) hoppers.push(...parts.hoppers);
    sequence.push(chunk.name);
    width += CHUNK_W;
  }

  // Boss arena + exit.
  const checkpoint = width + 1;
  const boss = width + 4;
  const exit = width + 8;
  width += 11;

  return buildStage({
    width, pits, platforms, player: 2, walkers, hoppers, checkpoint, boss, exit,
    extra: { sideMode: true, chunks: sequence, seed, startXp },
  });
}
