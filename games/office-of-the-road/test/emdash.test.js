// Fleet copy law: zero em-dashes (U+2014) in any player-facing string.
// Walks the same catalog dump-text-catalog.mjs / text-gate.mjs use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTextCatalog } from '../src/text-catalog.js';

test('player-facing text catalog contains zero em-dashes', () => {
  const catalog = buildTextCatalog();
  assert.ok(catalog.cases.length > 0, 'catalog must enumerate strings');
  const hits = catalog.cases.filter((c) => c.text.includes('\u2014'));
  assert.equal(
    hits.length,
    0,
    hits.map((h) => `${h.id}: ${JSON.stringify(h.text)}`).join('\n'),
  );
});
