// The determinism law (DESIGN-SEED §5, hard rule 4): Math.random is banned in game logic. Seeded
// named streams only, or the after-action report is not trustworthy and the report is the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logicFiles } from './_logic-files.js';

test('Math.random appears nowhere in game-logic source', () => {
  for (const file of logicFiles()) {
    assert.ok(
      !/Math\s*\.\s*random/.test(file.code),
      `${file.name} uses Math.random; game logic must draw from a seeded named stream`,
    );
  }
});
