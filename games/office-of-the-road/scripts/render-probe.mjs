// Browserless canvas trace for the share-prep collision fixes. This is not a
// pixel proof: it checks that the paused banner owns a row below combatant text
// and that each full live card-state label wraps inside its owned card column.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../src/main.js';
import { createMarch } from '../src/engine.js';
import { createParty } from '../src/party.js';
import { makeEnemies, initCombat } from '../src/combat.js';

function fontSize(font) {
  const match = String(font || '').match(/(\d+)px/);
  return match ? Number(match[1]) : 7;
}

function traceContext() {
  const draws = [];
  const target = {
    font: '7px ui-monospace, monospace',
    measureText(text) { return { width: String(text).length * fontSize(this.font) * 0.6 }; },
    fillText(value, x, y) {
      const text = String(value), h = fontSize(this.font);
      draws.push({ text, x, y, w: this.measureText(text).width, h });
    },
  };
  const ctx = new Proxy(target, {
    get(obj, key) { return key in obj ? obj[key] : () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
  return { ctx, draws };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const march = createMarch(17);
const party = createParty();
const enemies = makeEnemies('routine', march.streams.combat);
const st = initCombat(party, enemies);
// Exercise the longest live label from the visual finding ("decisive") while
// retaining playable labels on the other two hand cards.
party.frames[0].hp = 1;
const { ctx, draws } = traceContext();

render(ctx, {
  ui: {
    screen: 'combat', paused: true, holdPause: false, focus: -1, hover: -1,
    combat: {
      tier: 'routine', st, enemies, floats: [], left: false, draft: null,
      line: 'ROUTINE matter, filed on the road.',
    },
  },
  deck: { hand: ['the_tower', 'the_star', 'strength'] },
  controls: [], paused: true,
});

const banner = draws.find((d) => d.text.startsWith('[ PAUSED'));
assert.ok(banner, 'paused banner was rendered');

const rosterTexts = draws.filter((d) =>
  party.frames.some((frame) => d.text === frame.name || d.text === `${frame.hp}/${frame.max.hp}`) ||
  enemies.some((enemy) => d.text === enemy.name.slice(0, 9) || d.text === `${enemy.hp}/${enemy.max.hp}`));
assert.ok(rosterTexts.length > 0, 'combatant name/HP rows were traced');
for (const row of rosterTexts) assert.equal(overlaps(banner, row), false, `banner overlaps roster text: ${row.text}`);

const expectedCardLabels = ['1 decisive', '2 decisive', '3 playable'];
for (let i = 0; i < expectedCardLabels.length; i++) {
  const x = 12 + i * 34;
  const rows = draws.filter((d) => d.x === x && (d.y === 170 || d.y === 176));
  const fullLabel = rows.map((d) => d.text).join(' ');
  assert.equal(fullLabel, expectedCardLabels[i], `hand-card label ${i + 1} was clipped or changed`);
  assert.ok(rows.length > 0 && rows.length <= 2, `hand-card label ${i + 1} did not use its two-row region`);
  for (const row of rows) {
    assert.ok(row.w <= 30, `card label escaped its 30px column: ${row.text}`);
    assert.ok(!row.text.includes('…'), `card label was ellipsized: ${row.text}`);
    assert.ok(row.y + row.h <= 182, `card label entered the controls: ${row.text}`);
  }
}

const attributionText = readFileSync(new URL('../ATTRIBUTION.md', import.meta.url), 'utf8');
const creditTrace = traceContext();
const creditUi = { screen: 'credits', creditsPage: 0, focus: -1, hover: -1 };
for (let page = 0; page < 8; page++) {
  creditUi.creditsPage = page;
  render(creditTrace.ctx, { ui: creditUi, creditsControls: [], attributionText });
}
const renderedCredits = creditTrace.draws.map((d) => d.text).join('\n');
assert.match(renderedCredits, /Art by Willibab \/ Monsteretrope, used under CC BY\./);
assert.match(renderedCredits, /https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//);
assert.match(renderedCredits, /Tarot art by GuttyKreum/);
assert.match(renderedCredits, /code-composed WebAudio/);

console.log('[render-probe] PASS — full hand labels, reserved combat regions, and paginated attribution render');
