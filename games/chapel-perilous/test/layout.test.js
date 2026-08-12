// Title + creation screen layout: every text row owns its y-band and fits
// inside the canvas width. Walks the draw lists from src/engine/layout.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_W,
  CANVAS_H,
  bandsOverlap,
  buildTitleDrawList,
  buildCreationDrawList,
  textWidth,
} from '../src/engine/layout.js';

function assertDrawListClean(rows, label) {
  assert.ok(rows.length >= 2, `${label}: expected multiple rows`);
  for (const r of rows) {
    assert.ok(r.text != null && String(r.text).length > 0, `${label}: empty text row`);
    assert.equal(typeof r.y, 'number');
    assert.equal(typeof r.x, 'number');
    assert.ok(r.x >= 0, `${label}: x < 0`);
    const w = r.width ?? textWidth(r.text, r.size);
    assert.ok(r.x + w <= CANVAS_W + 0.01, `${label}: row exceeds canvas width: "${r.text}" (${r.x}+${w} > ${CANVAS_W})`);
    assert.ok(r.y >= 0 && r.y <= CANVAS_H, `${label}: y out of canvas: ${r.y}`);
  }
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      assert.equal(
        bandsOverlap(rows[i], rows[j]),
        false,
        `${label}: rows share a y-band:\n  [${i}] y=${rows[i].y} "${rows[i].text}"\n  [${j}] y=${rows[j].y} "${rows[j].text}"`,
      );
    }
  }
}

test('title screen draw list: no overlapping y-bands, no horizontal clip', () => {
  const rows = buildTitleDrawList({
    title: '[SEED] CHAPEL PERILOUS',
    subtitle: '[SEED] a recovered operations manual',
    intro: '[SEED] The map is not the territory. Neither, it turns out, is the territory.',
    paletteName: '[SEED] phosphor',
  });
  assertDrawListClean(rows, 'title');
  const regions = new Set(rows.map((r) => r.region));
  assert.ok(regions.has('brand') && regions.has('intro') && regions.has('menu'));
  assert.ok(rows.some((r) => /\[Enter\] begin/.test(r.text)));
  assert.ok(!rows.some((r) => /STRANGER IS DEALT/i.test(r.text)), 'title must not show the stranger card');
});

test('creation screen draw list: no overlapping y-bands, no horizontal clip', () => {
  const pc = {
    name: '[SEED] Initiate',
    omen: '[SEED] a rusted service revolver, one round — waits politely',
    oddment: { name: '[SEED] a walking cane with a hidden heft and a longer label still' },
    stats: () => ({ nerve: 'UNCANNY', craft: 'STEADY', pull: 'SHARP', gnosis: 'SHAKY' }),
  };
  const rows = buildCreationDrawList({ pc });
  assertDrawListClean(rows, 'creation');
  const regions = new Set(rows.map((r) => r.region));
  for (const need of ['header', 'name', 'stats', 'omen', 'carries', 'menu']) {
    assert.ok(regions.has(need), `creation missing region ${need}`);
  }
  assert.ok(rows.some((r) => /\[Space\] accept/.test(r.text)));
  const accepted = buildCreationDrawList({ pc, accepted: true });
  assert.ok(accepted.some((r) => /\[E\] embark/.test(r.text)));
  assert.ok(rows.some((r) => /\[R\] deal another/.test(r.text)));
  assert.ok(rows.some((r) => /\[Esc\] back/.test(r.text)));
  // Menu must not be a single runaway line that clips.
  assert.ok(!rows.some((r) => /deal another stranger/.test(r.text)));
});

test('title and creation each keep every element in its own vertical region', () => {
  const title = buildTitleDrawList({
    title: 'CHAPEL PERILOUS',
    subtitle: 'manual',
    intro: 'The map is not the territory.',
    paletteName: 'ash',
  });
  const creation = buildCreationDrawList({
    pc: {
      name: 'Initiate',
      omen: 'born under a crossed-out star',
      oddment: { name: 'a dull ceremonial knife' },
      stats: () => ({ nerve: 'STEADY', craft: 'STEADY', pull: 'STEADY', gnosis: 'STEADY' }),
    },
  });
  // Region bands: all rows of region A sit entirely above or below region B.
  function regionSpan(rows, id) {
    const rs = rows.filter((r) => r.region === id);
    assert.ok(rs.length, `missing ${id}`);
    return { top: Math.min(...rs.map((r) => r.bandTop)), bottom: Math.max(...rs.map((r) => r.bandBottom)) };
  }
  const order = ['header', 'name', 'stats', 'omen', 'carries', 'menu'];
  const spans = order.map((id) => regionSpan(creation, id));
  for (let i = 1; i < spans.length; i++) {
    assert.ok(spans[i - 1].bottom <= spans[i].top + 0.01, `creation region order broken at ${order[i]}`);
  }
  const tOrder = ['brand', 'subtitle', 'intro', 'menu'];
  const tSpans = tOrder.map((id) => regionSpan(title, id));
  for (let i = 1; i < tSpans.length; i++) {
    assert.ok(tSpans[i - 1].bottom <= tSpans[i].top + 0.01, `title region order broken at ${tOrder[i]}`);
  }
});
