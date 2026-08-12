import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCampaign, currentNode, isBranch, branchOptions, chooseBranch, currentStageDef,
  advanceCampaign, isCampaignComplete, carryOver,
} from '../src/sim/campaign.js';
import { CAMPAIGN_NODES } from '../src/content/campaign.js';
import { createStage, stepStage } from '../src/sim/stage.js';
import { runBot } from '../src/sim/bot.js';

test('campaign: linear nodes advance; branch node needs a choice', () => {
  const c = createCampaign(CAMPAIGN_NODES);
  assert.equal(currentNode(c).id, 's1');
  assert.ok(!isBranch(c));
  advanceCampaign(c); // → s2
  advanceCampaign(c); // → s3 (branch)
  assert.ok(isBranch(c));
  assert.equal(currentStageDef(c), null, 'no stage until a side is chosen');
  const [l, r] = branchOptions(c);
  assert.equal(l.id, 's3l'); assert.equal(r.id, 's3r');
  chooseBranch(c, 'left');
  assert.ok(currentStageDef(c), 'stage available after choosing');
});

test('campaign: taken-path records the chosen branch variants across the six stages', () => {
  const c = createCampaign(CAMPAIGN_NODES);
  while (!isCampaignComplete(c)) {
    if (isBranch(c)) chooseBranch(c, 'right');
    advanceCampaign(c);
  }
  assert.deepEqual(c.taken, ['s1', 's2', 's3r', 's4', 's5r', 's6']);
});

test('campaign: carryOver keeps XP/gold/gear/kit but resets HP to full and per-stage state', () => {
  const a = createStage(CAMPAIGN_NODES[0].stage, { seed: 'a' });
  a.progress.totalXp = 300; a.progress.level = 3; a.progress.stats = { maxHP: 61, str: 23, def: 5, mag: 20, energy: 11 };
  a.progress.hp = 5; a.gold = 200; a.kit.charged = true;
  const b = createStage(CAMPAIGN_NODES[1].stage, { seed: 'b' });
  carryOver(a, b);
  assert.equal(b.progress.totalXp, 300);
  assert.equal(b.progress.level, 3);
  assert.equal(b.gold, 200);
  assert.ok(b.kit.charged);
  assert.equal(b.progress.hp, b.progress.stats.maxHP, 'enters next stage at full HP');
  assert.equal(b.marker, null); // per-stage state fresh
});

test('campaign: carryOver retains doubleJump ownership into the next stage', () => {
  const a = createStage(CAMPAIGN_NODES[0].stage, { seed: 'dj-a' });
  a.kit.doubleJump = true;
  const b = createStage(CAMPAIGN_NODES[1].stage, { seed: 'dj-b' });
  assert.ok(!b.kit.doubleJump, 'fresh stage starts without grant');
  carryOver(a, b);
  assert.ok(b.kit.doubleJump, 'doubleJump ownership carried over');
});

test('campaign: Stage 4 places doubleJump unlock marker J at column 46', () => {
  const s4 = CAMPAIGN_NODES.find((n) => n.id === 's4').stage;
  const ts = 16; // tile size used by buildStage / tilemap
  const surfaceRow = s4.rows.find((r) => r.includes('J'));
  assert.ok(surfaceRow, 'Stage 4 rows include marker J');
  assert.equal(surfaceRow.indexOf('J'), 46, 'J at column 46');
  const stage = createStage(s4, { seed: 's4-dj' });
  const dj = stage.unlockPickups.find((u) => u.move === 'doubleJump');
  assert.ok(dj, 'Stage 4 exposes doubleJump pickup');
  assert.equal(dj.x, 46 * ts + ts / 2);
});

for (const side of ['left', 'right']) {
  test(`campaign: HEADLESS BOT clears the whole campaign taking the ${side} path (M6 acceptance)`, () => {
    const c = createCampaign(CAMPAIGN_NODES);
    let prev = null;
    let stages = 0;
    while (!isCampaignComplete(c)) {
      if (isBranch(c)) chooseBranch(c, side);
      const def = currentStageDef(c);
      const s = createStage(def, { seed: `camp${c.index}`, vw: 256, vh: 240 });
      if (prev) carryOver(prev, s);
      const r = runBot(s, stepStage, 14000);
      assert.ok(r.cleared, `bot cleared node ${currentNode(c).id} (dead=${r.dead})`);
      prev = s; advanceCampaign(c); stages++;
    }
    assert.equal(stages, 6, 'played the full six-stage campaign end to end');
    assert.ok(c.taken.includes(side === 'left' ? 's3l' : 's3r'));
    assert.ok(c.taken.includes(side === 'left' ? 's5l' : 's5r'));
    assert.ok(prev.progress.level >= 4, 'meaningfully leveled across the campaign');
  });
}

/** Resolve every authored stage variant (eight leaves) for per-layout audits. */
function campaignVariants() {
  const out = [];
  for (const node of CAMPAIGN_NODES) {
    if (node.branch) {
      out.push({ id: node.branch.left.id, stage: node.branch.left.stage });
      out.push({ id: node.branch.right.id, stage: node.branch.right.stage });
    } else {
      out.push({ id: node.id, stage: node.stage });
    }
  }
  return out;
}

/** Stage 4 floor-path J must not contaminate no-item proofs: collect without granting. */
function isolateStage4DoubleJumpPickup(s) {
  const dj = s.unlockPickups.find((u) => u.move === 'doubleJump');
  assert.ok(dj, 'Stage 4 exposes doubleJump pickup to isolate');
  dj.collected = true;
  s.kit.doubleJump = false;
}

for (const { id, stage } of campaignVariants()) {
  test(`campaign: no-item HEADLESS BOT clears variant ${id}`, () => {
    const s = createStage(stage, { seed: `noitem-${id}`, vw: 256, vh: 240 });
    assert.equal(s.kit.doubleJump, false, `${id} starts without doubleJump grant`);
    if (id === 's4') isolateStage4DoubleJumpPickup(s);
    else assert.ok(!s.unlockPickups.some((u) => u.move === 'doubleJump'), `${id} has no J pickup`);
    assert.equal(s.kit.doubleJump, false);
    const r = runBot(s, stepStage, 14000);
    assert.ok(r.cleared, `bot cleared ${id} without doubleJump (dead=${r.dead}, ticks=${r.ticks})`);
    assert.equal(s.kit.doubleJump, false, `${id} still lacks grant after clear`);
  });
}

for (const side of ['left', 'right']) {
  test(`campaign: no-item HEADLESS BOT clears full ${side} route with Stage 4 J isolated`, () => {
    const c = createCampaign(CAMPAIGN_NODES);
    let prev = null;
    let stages = 0;
    while (!isCampaignComplete(c)) {
      if (isBranch(c)) chooseBranch(c, side);
      const n = currentNode(c);
      const stageId = n.branch ? n.branch[c.choice].id : n.id;
      const def = currentStageDef(c);
      const s = createStage(def, { seed: `noitem-camp-${side}-${c.index}`, vw: 256, vh: 240 });
      if (prev) carryOver(prev, s);
      // Force false through later stages so carry-over cannot reintroduce a grant.
      s.kit.doubleJump = false;
      if (stageId === 's4') isolateStage4DoubleJumpPickup(s);
      assert.equal(s.kit.doubleJump, false, `${stageId}: forced no grant`);
      const r = runBot(s, stepStage, 14000);
      assert.ok(r.cleared, `bot cleared ${stageId} on ${side} no-item route (dead=${r.dead})`);
      assert.equal(s.kit.doubleJump, false, `${stageId}: grant stayed false`);
      prev = s;
      advanceCampaign(c);
      stages++;
    }
    assert.equal(stages, 6);
    assert.ok(c.taken.includes(side === 'left' ? 's3l' : 's3r'));
    assert.ok(c.taken.includes(side === 'left' ? 's5l' : 's5r'));
  });
}
