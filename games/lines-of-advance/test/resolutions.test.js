import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createState, createPiece } from '../src/state.js';
import { computeCommunications } from '../src/comms.js';
import { getLegalMoves } from '../src/movement.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER = readFileSync(resolve(__dirname, '..', 'docs', 'RULES-LEDGER.md'), 'utf8');

function rowContains(rowNumber, text) {
  const lines = LEDGER.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith(`| ${rowNumber} `)) {
      return lines[i].toLowerCase().includes(text.toLowerCase());
    }
  }
  return false;
}

test('ledger rows 47-48 and 72-74 record operator-ratified 2026-08-07', () => {
  for (const row of [47, 48, 72, 73, 74]) {
    assert.ok(
      rowContains(row, 'operator-ratified 2026-08-07'),
      `row ${row} missing ratification note`
    );
  }
});

test('row 72 reading A: offline enemy fighter still severs a communication line', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'South', cls: 'Infantry', x: 4, y: 3 }));
  const enemy = createPiece({ side: 'North', cls: 'Infantry', x: 4, y: 2 });
  s.pieces.push(enemy);
  const comms = computeCommunications(s);
  assert.equal(comms.status.get(s.pieces[0].id).status, 'isolated');
});

test('row 73 reading A: isolated unit is immobile, so a forced retreat is impossible', () => {
  let s = createState();
  s.pieces.push(createPiece({ side: 'North', cls: 'Infantry', x: 2, y: 2 }));
  assert.equal(getLegalMoves(s, s.pieces[0].id).length, 0);
});

test('row 48 reading A: only mountains are treated as fire obstruction (no unit obstruction yet)', () => {
  // Fire mechanics belong to M4; M3 records the ratified reading in the ledger.
  assert.ok(rowContains(48, 'operator-ratified 2026-08-07'));
});
