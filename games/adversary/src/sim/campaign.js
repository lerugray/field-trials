// campaign.js — the campaign progression + branch state (DESIGN-SEED M6: six-stage structure with
// left/right path choices in the middle stages). A node list; a branch node offers two variants
// (the fork) chosen when entered. Progress (XP/gold/gear/inventory/kit unlocks) carries across
// stages; per-stage state (checkpoint, death marker) does not. Pure — the boot/test drives it.

export function createCampaign(nodes) {
  return { nodes, index: 0, choice: null, taken: [] };
}

export function currentNode(c) { return c.nodes[c.index] || null; }
export function isBranch(c) { const n = currentNode(c); return !!(n && n.branch); }

/** The two options at a branch node ([left, right]), or null. */
export function branchOptions(c) {
  const n = currentNode(c);
  return n && n.branch ? [n.branch.left, n.branch.right] : null;
}

/** Choose a side at a branch node ('left' | 'right'). */
export function chooseBranch(c, side) {
  if (isBranch(c) && (side === 'left' || side === 'right')) c.choice = side;
}

/** The stage def to play now (null at an un-chosen branch node). */
export function currentStageDef(c) {
  const n = currentNode(c);
  if (!n) return null;
  if (n.branch) return c.choice ? n.branch[c.choice].stage : null;
  return n.stage;
}

/** Advance past the current node, recording the taken path id. */
export function advanceCampaign(c) {
  const n = currentNode(c);
  if (!n) return;
  c.taken.push(n.branch ? n.branch[c.choice].id : n.id);
  c.index++;
  c.choice = null;
}

export function isCampaignComplete(c) { return c.index >= c.nodes.length; }

/**
 * Carry persistent run state from a cleared stage onto a freshly created next stage. Copies
 * XP/gold/gear/inventory/kit unlocks; leaves per-stage state (checkpoint/marker) fresh.
 */
export function carryOver(fromStage, toStage) {
  toStage.progress.totalXp = fromStage.progress.totalXp;
  toStage.progress.level = fromStage.progress.level;
  toStage.progress.stats = { ...fromStage.progress.stats };
  toStage.progress.hp = fromStage.progress.stats.maxHP; // enter the next stage at full HP
  toStage.gold = fromStage.gold;
  toStage.loadout.weapon = fromStage.loadout.weapon;
  toStage.loadout.armor = fromStage.loadout.armor;
  toStage.inventory.weapons = [...fromStage.inventory.weapons];
  toStage.inventory.armors = [...fromStage.inventory.armors];
  toStage.inventory.items = { ...fromStage.inventory.items };
  Object.assign(toStage.kit, fromStage.kit);
  toStage.subResource = toStage.subResourceMax;
  return toStage;
}
