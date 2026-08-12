// A1 (M12): the FP corridor-enemy visibility must give CONTINUOUS coverage of the
// forward cells — it must NOT alias on the crawler's offset within its current
// segment. The old shell sampled only fine-tile offsets n=[3,4,6]; with an odd
// segmentSize that missed forward cells at some mod-seg offsets, so a corridor foe
// flickered in and out purely on approach. enemyInCorridor scans every forward
// fine-tile out to a couple of segments. This drives it at EVERY offset mod seg.
import test from 'node:test';
import assert from 'node:assert/strict';
import { enemyInCorridor } from '../src/engine/dungeonlife.js';

// A synthetic straight east-running corridor: a 1-D world of `cols` cells, each
// `seg` fine-tiles wide, at fixed row y=0. cellAt maps a fine x to its cell index.
function makeStraightWorld(seg, cols) {
  const width = seg * cols;
  const cellAt = (x, y) => {
    if (y !== 0 || x < 0 || x >= width) return null;
    const cx = Math.floor(x / seg);
    return { cx, cy: 0 };
  };
  const inBounds = (x, y) => y === 0 && x >= 0 && x < width;
  return { segmentSize: seg, width, cellAt, inBounds };
}

test('enemyInCorridor sees a forward-cell enemy from EVERY offset mod seg', () => {
  const seg = 5, cols = 6;
  const dungeon = makeStraightWorld(seg, cols);
  const enemy = { cx: 2, cy: 0, beingId: 'x', name: 'thing' };
  const life = { at: (cx, cy) => (cx === enemy.cx && cy === enemy.cy ? enemy : null) };

  // From every offset within cell 0 (mod seg), the enemy two cells ahead (cell 2)
  // must always be seen. Under the old n=[3,4,6] sampling some offsets missed it.
  for (let offset = 0; offset < seg; offset++) {
    const crawl = {
      ahead: (n = 1) => ({ x: offset + n, y: 0 }),
      cell: () => dungeon.cellAt(offset, 0),
    };
    const seen = enemyInCorridor(dungeon, crawl, life);
    assert.equal(seen, enemy, `offset ${offset} within the segment must still see the corridor enemy`);
  }
});

test('enemyInCorridor never returns the enemy in the crawler own cell', () => {
  const seg = 5;
  const dungeon = makeStraightWorld(seg, 4);
  const enemy = { cx: 0, cy: 0 }; // same cell as the crawler
  const life = { at: (cx, cy) => (cx === 0 && cy === 0 ? enemy : null) };
  const crawl = { ahead: (n = 1) => ({ x: 1 + n, y: 0 }), cell: () => ({ cx: 0, cy: 0 }) };
  assert.equal(enemyInCorridor(dungeon, crawl, life), null);
});

test('enemyInCorridor stops at the map edge and reports nothing', () => {
  const seg = 5;
  const dungeon = makeStraightWorld(seg, 3);
  const life = { at: () => null }; // no enemies anywhere
  const crawl = { ahead: (n = 1) => ({ x: 1 + n, y: 0 }), cell: () => ({ cx: 0, cy: 0 }) };
  assert.equal(enemyInCorridor(dungeon, crawl, life), null);
});

test('the old n=[3,4,6] sampling DID alias — the regression this guards', () => {
  // Demonstrate the bug the fix removes: with seg=5, an enemy occupying only cell 1
  // (fine tiles 5..9) is missed by the old sampling from offset 4 (samples land at
  // fine 7? no — from offset 4, n=3→7 (cell1) hits; use an enemy in cell 2 fine
  // 10..14 with a crawler at offset 0: old n samples 3,4,6 → fine 3,4,6 = cells 0,0,1,
  // never cell 2. The new scan reaches it.
  const seg = 5;
  const dungeon = makeStraightWorld(seg, 4);
  const enemy = { cx: 2, cy: 0 };
  const life = { at: (cx, cy) => (cx === 2 && cy === 0 ? enemy : null) };
  const offset = 0;
  // old behavior, inlined:
  const here = { cx: 0, cy: 0 };
  let oldSeen = null;
  for (const n of [3, 4, 6]) {
    const c = dungeon.cellAt(offset + n, 0);
    if (!c || (c.cx === here.cx && c.cy === here.cy)) continue;
    if (life.at(c.cx, c.cy)) { oldSeen = enemy; break; }
  }
  assert.equal(oldSeen, null, 'old sampling misses the cell-2 enemy from offset 0');
  const crawl = { ahead: (n = 1) => ({ x: offset + n, y: 0 }), cell: () => here };
  assert.equal(enemyInCorridor(dungeon, crawl, life), enemy, 'new scan finds it');
});
