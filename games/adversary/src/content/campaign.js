// campaign.js (content) — the stage graph for stages 1-4 (DESIGN-SEED M6). Stage 1 is the authored
// slice; 2-4 come from the parameterized builder, tuned to the same bot-clearable shape. The middle
// offers a left/right fork (study §2.6): the LEFT path is platforming + a downthrust unlock, the
// RIGHT path is a combat gauntlet + a full-health-shot unlock — the choice changes both the route
// and the kit reward. Placeholder path names ("left path" / "right path") per the naming law.

import { buildStage } from './stagebuilder.js';
import { STAGE1 } from './stage1.js';
import { BOSS_DROPS, explorationDropsFor } from './drops.js';

// Stage 2 — a bridge stage: one pit, a platform with a hopper, trash, checkpoint, boss.
const STAGE2 = buildStage({
  width: 52, pits: [[22, 23]], platforms: [[9, 14, 18]],
  player: 3, walkers: [10, 18, 30, 38], hoppers: [[8, 16]],
  checkpoint: 40, boss: 46, exit: 50,
});

// Stage 3 LEFT — platforming route; rewards a downthrust unlock.
const STAGE3_LEFT = buildStage({
  width: 52, pits: [[16, 17], [30, 31]], platforms: [[9, 22, 26]],
  player: 3, walkers: [10, 24, 38], hoppers: [[8, 24]],
  unlocks: [['D', 34]], checkpoint: 42, boss: 46, exit: 50,
});

// Stage 3 RIGHT — combat gauntlet; rewards a full-health-shot unlock.
const STAGE3_RIGHT = buildStage({
  width: 52, pits: [[26, 27]],
  player: 3, walkers: [8, 12, 20, 24, 32, 38], hoppers: [[8, 16]],
  unlocks: [['P', 34]], checkpoint: 42, boss: 46, exit: 50,
});

// Stage 4 — convergence; longer, two pits, a boss. Grants downthrust + double jump unlocks.
const STAGE4 = buildStage({
  width: 58, pits: [[20, 21], [40, 41]], platforms: [[9, 28, 32]],
  player: 3, walkers: [10, 16, 30, 36, 48], hoppers: [[8, 30]],
  unlocks: [['D', 24], ['J', 46]], checkpoint: 50, boss: 54, exit: 56,
});

// Stage 5 LEFT — vertical platforming climb.
const STAGE5_LEFT = buildStage({
  width: 54, pits: [[14, 15], [26, 27], [38, 39]], platforms: [[9, 20, 24], [7, 32, 36]],
  player: 3, walkers: [10, 30, 44], hoppers: [[8, 22], [6, 34]],
  checkpoint: 46, boss: 50, exit: 52,
});

// Stage 5 RIGHT — a dense combat gauntlet; grants the full-health-shot unlock (guaranteed here).
const STAGE5_RIGHT = buildStage({
  width: 54, pits: [[28, 29]],
  player: 3, walkers: [8, 12, 18, 22, 30, 36, 42], hoppers: [[8, 16], [8, 34]],
  unlocks: [['P', 25]], checkpoint: 46, boss: 50, exit: 52,
});

// Stage 6 — the finale: longest, mixed hazards, the final boss.
const STAGE6 = buildStage({
  width: 62, pits: [[18, 19], [34, 35], [48, 49]], platforms: [[9, 26, 30]],
  player: 3, walkers: [10, 14, 24, 40, 44, 54], hoppers: [[8, 28], [8, 44]],
  checkpoint: 56, boss: 58, exit: 60,
});

export const CAMPAIGN_NODES = [
  { id: 's1', label: 'Stage 1', stage: STAGE1 },
  { id: 's2', label: 'Stage 2', stage: STAGE2 },
  {
    id: 's3', label: 'Stage 3',
    branch: {
      left: { id: 's3l', label: 'left path', stage: STAGE3_LEFT },
      right: { id: 's3r', label: 'right path', stage: STAGE3_RIGHT },
    },
  },
  { id: 's4', label: 'Stage 4', stage: STAGE4 },
  {
    id: 's5', label: 'Stage 5',
    branch: {
      left: { id: 's5l', label: 'left path', stage: STAGE5_LEFT },
      right: { id: 's5r', label: 'right path', stage: STAGE5_RIGHT },
    },
  },
  { id: 's6', label: 'Stage 6', stage: STAGE6 },
];

// M12-ART: each node's visual sub-palette theme (createStage reads def.theme, stagerender uses it).
// The campaign walks a gothic arc: open-air cemetery → descending crypt → the umber keep. Themes are
// shared-ramp retunes, never off-palette (see palette.js THEMES).
const NODE_THEME = {
  s1: 'cemetery', s2: 'cemetery',
  s3: 'crypt', s3l: 'crypt', s3r: 'crypt', s4: 'crypt',
  s5: 'keep', s5l: 'keep', s5r: 'keep', s6: 'keep',
};

// M11: attach each node's first-kill boss drop + any guarded exploration pickups onto its stage def
// (createStage reads def.bossDrop / def.uniquePickups). Keyed by node id so acquisition is auditable
// against drops.js and the PROGRESS.md table. STAGE1's authored def gains its drop the same way.
// M12: also stamp the node's theme onto the def.
function decorateDrops(id, stageDef) {
  if (BOSS_DROPS[id]) stageDef.bossDrop = BOSS_DROPS[id];
  const ex = explorationDropsFor(id);
  if (ex.length) stageDef.uniquePickups = ex;
  stageDef.theme = NODE_THEME[id] || 'cemetery';
}
for (const node of CAMPAIGN_NODES) {
  if (node.branch) {
    decorateDrops(node.branch.left.id, node.branch.left.stage);
    decorateDrops(node.branch.right.id, node.branch.right.stage);
  } else {
    decorateDrops(node.id, node.stage);
  }
}

export { STAGE2, STAGE3_LEFT, STAGE3_RIGHT, STAGE4, STAGE5_LEFT, STAGE5_RIGHT, STAGE6 };
