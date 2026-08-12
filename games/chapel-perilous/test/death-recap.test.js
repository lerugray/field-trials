// cp-018 — death panel surfaces the final fight's last rounds and the killing blow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_W, CANVAS_H, bandsOverlap } from '../src/engine/layout.js';
import { buildDeathDrawList } from '../src/engine/panels.js';

function assertClean(rows, label) {
  assert.ok(rows.length >= 1, `${label}: empty draw list`);
  for (const r of rows) {
    assert.ok(String(r.text).length > 0, `${label}: empty row`);
    const w = r.width ?? (String(r.text).length * 0.62 * r.size);
    assert.ok(r.x >= 0 && r.x + w <= CANVAS_W + 0.01, `${label}: clips width: "${r.text}" (${r.x}+${w})`);
    assert.ok(r.y >= 0 && r.y <= CANVAS_H + 0.01, `${label}: y out of canvas: ${r.y}`);
  }
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      assert.equal(bandsOverlap(rows[i], rows[j]), false, `${label}: overlap:\n  "${rows[i].text}"\n  "${rows[j].text}"`);
}

test('death panel with a recap renders the final pattern and killing blow cleanly', () => {
  const recap = [
    'Round 1 - Rat strikes Initiate: rolled 1 (teeth), dealt 1, you 9/10',
    'Round 2 - Initiate strikes Rat: rolled 3 (knife), dealt 3, you 8/10',
  ];
  const killingBlow = 'Round 2 - Rat strikes Initiate: rolled 1 (teeth), dealt 1, you 0/10';
  const rows = buildDeathDrawList({
    fallen: '[SEED] Old Initiate',
    pc: { name: '[SEED] New Stranger', omen: '[SEED] a crossed-out star', oddment: { name: '[SEED] a dull knife' } },
    lineage: [],
    recap,
    killingBlow,
  });
  assertClean(rows, 'death-with-recap');
  const joined = rows.map((r) => r.text).join('\n');
  assert.ok(/final pattern/.test(joined));
  assert.ok(/killing blow/.test(joined));
  assert.ok(/Rat strikes/.test(joined));
  assert.ok(/rolled 1 \(teeth\)/.test(joined));
});

test('death panel without a recap stays clean and unchanged', () => {
  const rows = buildDeathDrawList({
    fallen: '[SEED] Old Initiate',
    pc: { name: '[SEED] New Stranger', omen: '[SEED] a crossed-out star', oddment: { name: '[SEED] a dull knife' } },
    lineage: [],
  });
  assertClean(rows, 'death-no-recap');
  const joined = rows.map((r) => r.text).join('\n');
  assert.ok(!/final pattern/.test(joined));
  assert.ok(!/killing blow/.test(joined));
});
