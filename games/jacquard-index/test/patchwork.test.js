import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../src/engine/app.js';
import { makePlayScene } from '../src/scenes/playScene.js';
import { PATCHWORK_MOTIFS, PATCHWORK_PANELS, PATCHWORK_TEACHING } from '../src/content/patchworkMotifs.js';
import { SHELVES, shelfCards, allCatalogueCardsById } from '../src/content/shelves.js';
import { buildPuzzle } from '../src/puzzle/generator.js';
import { composePanel, completedPanelFor, PANELS } from '../src/content/panels.js';

test('every GRAND PATCHWORK patch is an individually proved guess-free base card', () => {
  const failures = PATCHWORK_MOTIFS.filter((m) => !buildPuzzle(m).ok).map((m) => m.id);
  assert.deepEqual(failures, [], `unproved patchwork patches: ${failures.join(', ')}`);
});

test('shelf 7 is built as the finale with a teaching card leading', () => {
  const shelf = SHELVES.find((s) => s.id === 'patchwork');
  assert.equal(shelf.built, true);
  assert.equal(shelf.teaching, PATCHWORK_TEACHING);
  const cards = shelfCards(shelf);
  assert.ok(cards.length >= 13);
  assert.equal(cards[0].id, PATCHWORK_TEACHING);
});

test('the finale panels are registered, disjoint, same-size, and compose', () => {
  const by = allCatalogueCardsById();
  const seen = new Set();
  for (const panel of PATCHWORK_PANELS) {
    assert.ok(PANELS.find((p) => p.id === panel.id), `${panel.id} is registered in PANELS`);
    assert.equal(panel.members.length, panel.cols * panel.rows);
    for (const id of panel.members) {
      assert.ok(by[id], `panel ${panel.id} member ${id} exists`);
      assert.ok(!seen.has(id), `member ${id} used by only one panel`);
      seen.add(id);
    }
    assert.doesNotThrow(() => composePanel(panel, by), `${panel.id} composes`);
  }
});

test('a panel assembles only when its last patch is woven, and the play scene shows it', () => {
  const panel = PATCHWORK_PANELS[0];
  const app = new App(640, 360);
  // Weave all but the last member into shared progress.
  for (const id of panel.members.slice(0, -1)) app.progress.add(id);
  const last = panel.members[panel.members.length - 1];
  assert.equal(completedPanelFor(last, app.progress), null, 'incomplete panel does not fire');

  // Open the last patch and solve it through the play scene.
  const card = shelfCards(SHELVES.find((s) => s.id === 'patchwork')).find((c) => c.id === last);
  app.setScene(makePlayScene(card, { onExit: () => {} }));
  app.step(16);
  const b = app.scene._board;
  const p = card.puzzle;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.at(x, y)) b.toggleFill(x, y);
  app.step(16);
  assert.ok(app.progress.has(last), 'the last patch is woven');
  assert.equal(completedPanelFor(last, app.progress)?.id, panel.id, 'the completing patch fires the panel');
  // The solved play scene renders the assembled panel without error.
  assert.doesNotThrow(() => app.render());
});
