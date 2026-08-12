import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANELS, composePanel, completedPanelFor } from '../src/content/panels.js';
import { allCatalogueCardsById } from '../src/content/shelves.js';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import { drawReveal, revealLayout, cellCenter, isClothAt } from '../src/render/reveal.js';

function cardsById() {
  return allCatalogueCardsById();
}

test('every panel references known, same-size members', () => {
  const by = cardsById();
  for (const panel of PANELS) {
    for (const id of panel.members) assert.ok(by[id], `panel ${panel.id} missing member ${id}`);
    assert.equal(panel.members.length, panel.cols * panel.rows, `${panel.id} member count != grid`);
    assert.doesNotThrow(() => composePanel(panel, by));
  }
});

test('completedPanelFor fires only when every member is woven', () => {
  const panel = PANELS[0];
  const progress = new Set();
  const last = panel.members[panel.members.length - 1];
  for (const id of panel.members.slice(0, -1)) progress.add(id);
  assert.equal(completedPanelFor(last, progress), null, 'incomplete set must not fire');
  progress.add(last);
  assert.equal(completedPanelFor(last, progress)?.id, panel.id, 'the completing member fires the panel');
  assert.equal(completedPanelFor('not-a-member', progress), null);
});

test('composePanel tiles member solutions into the composite grid', () => {
  const by = cardsById();
  const panel = PANELS[0];
  const composite = composePanel(panel, by);
  const cell = by[panel.members[0]].puzzle.width;
  const gap = panel.gap || 0;
  // Spot-check each quadrant matches its member cell-for-cell.
  panel.members.forEach((id, i) => {
    const m = by[id].puzzle;
    const gx = (i % panel.cols) * (cell + gap);
    const gy = Math.floor(i / panel.cols) * (cell + gap);
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        assert.equal(composite.at(gx + x, gy + y), m.at(x, y), `${id} mismatch at (${x},${y})`);
      }
    }
  });
});

test('the assembled panel reveal is pixel-checked against the composite (binding style)', () => {
  const by = cardsById();
  const composite = composePanel(PANELS[0], by);
  const fb = new Framebuffer(260, 260);
  const region = { x: 0, y: 0, w: 260, h: 260 };
  const layout = drawReveal(fb, composite, region);
  // revealLayout must agree with the drawn layout.
  assert.deepEqual(revealLayout(composite, region), layout);
  for (let y = 0; y < composite.height; y++) {
    for (let x = 0; x < composite.width; x++) {
      const { px, py } = cellCenter(layout, x, y);
      assert.equal(isClothAt(fb, px, py), !!composite.at(x, y), `panel render != composite at (${x},${y})`);
    }
  }
});
