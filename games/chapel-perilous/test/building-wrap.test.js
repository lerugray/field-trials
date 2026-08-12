// M12 A5 — town-interior text wrap. The building-interior draw list must apply the
// same pre-wrap discipline the bust panels document: every line wraps to the text
// column and NO string is ever ellipsis-clipped. The regression is the name band,
// which was a single line — a long "kept by <proprietor>" title used to ellipsize.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBuildingDrawList } from '../src/engine/panels.js';
import { textWidth } from '../src/engine/layout.js';

const WIDTH = 416;
const COLW = WIDTH - 40; // marginX 20 each side

const LONG_NAME = 'the changing-saint shrine — kept by Brother Aurelius of the Ninefold Reliquary';
const LONG_LINES = [
  '[SEED] the innkeeper, a person of indeterminate profession and too many opinions about the weather, waves you toward a cot that has seen better centuries and worse guests',
  '[SEED] you leave a folded bill and rest whole — 3→10 hp',
];

test('every building-interior line wraps within the text column', () => {
  const rows = buildBuildingDrawList({ name: LONG_NAME, lines: LONG_LINES, width: WIDTH, height: WIDTH }).filter((r) => r.text);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(textWidth(r.text, r.size) <= COLW + 0.5, `line runs past the column: ${JSON.stringify(r.text)} (${textWidth(r.text, r.size)} > ${COLW})`);
  }
});

test('no building-interior line is ellipsis-clipped (the name-band regression)', () => {
  const rows = buildBuildingDrawList({ name: LONG_NAME, lines: LONG_LINES, width: WIDTH, height: WIDTH }).filter((r) => r.text);
  for (const r of rows) {
    assert.ok(!r.text.includes('…'), `a line was ellipsized: ${JSON.stringify(r.text)}`);
  }
  // the full proprietor name survives across the wrapped rows (nothing dropped)
  const joined = rows.map((r) => r.text).join(' ');
  assert.ok(joined.includes('Brother Aurelius'), 'the long name wrapped rather than being clipped away');
});
