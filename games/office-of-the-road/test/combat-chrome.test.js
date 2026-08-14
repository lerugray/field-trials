import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JOBS } from '../src/jobs.js';
import { ENEMY_NAMES } from '../src/combat.js';
import { createMarch } from '../src/engine.js';
import { createParty } from '../src/party.js';
import { makeEnemies, initCombat } from '../src/combat.js';
import { pixelTextWidth } from '../src/pixel-font.js';
import { wrapLinesNoEllipsis } from '../src/text-wrap.js';
import { CORE_TEXT_HEIGHT } from '../src/layout.js';
import { buildTextCatalog, matterLine } from '../src/text-catalog.js';
import { render } from '../src/main.js';
import { TRACKS, trackForScreen } from '../src/score.js';

const VW = 320;
const EDGE = 12;
const ctx6 = { font: '6px monospace' };
const ctx7 = { font: '7px monospace' };

function stubCtx() {
  const target = {
    font: '7px monospace',
    fillStyle: '#000',
    strokeStyle: '#000',
    textAlign: 'left',
    textBaseline: 'top',
    lineWidth: 1,
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    __pixelTextEvents: [],
  };
  return new Proxy(target, {
    get(obj, key) { return key in obj ? obj[key] : () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}

function collisions(boxes) {
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        hits.push([a.text, b.text]);
      }
    }
  }
  return hits;
}

function renderCombat(party, line = matterLine('routine')) {
  const march = createMarch(17);
  const enemies = makeEnemies('routine', march.streams.combat);
  const st = initCombat(party, enemies);
  const ctx = stubCtx();
  render(ctx, {
    ui: {
      screen: 'combat', paused: true, holdPause: false, focus: -1, hover: -1,
      combat: { tier: 'routine', st, enemies, floats: [], left: false, draft: null, line },
    },
    deck: { hand: ['the_tower', 'the_star', 'strength'] },
    controls: [], paused: true,
  });
  return ctx.__pixelTextEvents || [];
}

test('every matter-class opening line is a complete sentence that fits the resolver strip', () => {
  const catalog = buildTextCatalog();
  const cases = catalog.cases.filter((c) => c.id.startsWith('combat:matter:'));
  const tiers = { routine: 'ROUTINE', elite: 'ELITE', boss: 'JURISDICTION' };
  assert.equal(cases.length, Object.keys(tiers).length);
  for (const [tier, label] of Object.entries(tiers)) {
    const text = matterLine(tier);
    assert.equal(text, `${label} matter, filed on the road.`);
    assert.match(text, /[.!?]$/);
    assert.equal(text.includes('Cards may'), false, `${tier} still trails into the paused banner's job`);
    const c = cases.find((row) => row.id === `combat:matter:${tier}`);
    assert.ok(c, `catalog missing combat:matter:${tier}`);
    assert.equal(c.text, text);
    const lines = wrapLinesNoEllipsis(ctx7, c.text, c.maxWidth, c.maxLines);
    assert.equal(lines.join('').replace(/\s+/g, ''), c.text.replace(/\s+/g, ''), `${c.id} dropped mid-sentence: ${lines.join(' | ')}`);
    for (const line of lines) {
      assert.ok(pixelTextWidth(ctx7, line) <= c.maxWidth, `${c.id} overflow: ${line}`);
    }
  }
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(mainSrc, /matter, filed on the road\./);
  assert.equal(mainSrc.includes('Cards may be played'), false);
});

test('combat roster labels are complete names, never ellipsized', () => {
  const catalog = buildTextCatalog();
  const expected = [
    ...Object.values(JOBS).map((j) => [`combat:job:${j.id}`, j.name]),
    ...ENEMY_NAMES.map((name) => [`enemy:name:${name}`, name]),
    ['combat:reduced', '(reduced)'],
  ];
  for (const [id, name] of expected) {
    assert.equal(name.includes('…'), false);
    assert.ok(pixelTextWidth(ctx6, name) <= 58, `${name} wider than combat name column`);
    const row = catalog.cases.find((c) => c.id === id);
    assert.ok(row, `catalog missing ${id}`);
    assert.equal(row.text, name);
    assert.equal(row.text.includes('…'), false, `${id} still catalogs an ellipsis`);
  }
});

test('live combat frame shows full job names and a complete matter line', () => {
  const party = createParty(['chirurgeon', 'surveyor', 'sumpter', 'almoner']);
  const texts = renderCombat(party, matterLine('routine'));
  const joined = texts.map((t) => t.text).join(' ');
  assert.match(joined, /ROUTINE matter, filed on the road\./);
  assert.equal(joined.includes('Cards may'), false);
  for (const name of ['Chirurgeon', 'Surveyor', 'Sumpter', 'Almoner']) {
    const hit = texts.find((t) => t.text === name);
    assert.ok(hit, `missing full name ${name}; saw ${joined}`);
    assert.equal(hit.text.includes('…'), false);
    assert.ok(hit.x >= 0 && hit.x + hit.w <= VW - EDGE, `${name} clips the right edge`);
    assert.ok(hit.y + hit.h <= 124, `${name} collides with the resolving band`);
  }
  const names = texts.filter((t) => ['Chirurgeon', 'Surveyor', 'Sumpter', 'Almoner'].includes(t.text));
  const hits = collisions(names);
  assert.deepEqual(hits, [], `roster names collide: ${JSON.stringify(hits)}`);
});

test('four Chirurgeons still read in full without colliding', () => {
  const party = createParty(['chirurgeon', 'chirurgeon', 'chirurgeon', 'chirurgeon']);
  const texts = renderCombat(party);
  const names = texts.filter((t) => t.text === 'Chirurgeon');
  assert.equal(names.length, 4);
  for (const hit of names) {
    assert.ok(hit.x + hit.w <= VW - EDGE, 'Chirurgeon clips the right edge');
  }
  assert.deepEqual(collisions(names), []);
});

test('march score label keeps a 12px trailing margin for every track', () => {
  const catalog = buildTextCatalog();
  for (const track of Object.keys(TRACKS)) {
    const label = `score: ${track} · M mutes`;
    const w = pixelTextWidth(ctx6, label);
    const x = VW - EDGE - w;
    assert.ok(x >= EDGE, `${label} too wide for the march row`);
    assert.equal(x + w, VW - EDGE);
    const c = catalog.cases.find((row) => row.id === `misc:score-${track}`);
    assert.ok(c, `catalog missing ${label}`);
    assert.equal(c.text, label);
  }
  const ctx = stubCtx();
  render(ctx, {
    ui: { screen: 'march', paused: true, muted: false, focus: -1, hover: -1, ticker: [], omen: null, escLevel: 0 },
    march: createMarch(17),
    party: createParty(),
    mandate: null,
    controls: [],
    log: { errorCount: 0 },
    paused: true,
  });
  const score = (ctx.__pixelTextEvents || []).find((t) => String(t.text).startsWith('score:'));
  assert.ok(score, 'march score label missing');
  assert.equal(score.text, 'score: ' + trackForScreen('march') + ' · M mutes');
  assert.ok(score.x + score.w <= VW - EDGE, `score flush/clipped: x=${score.x} w=${score.w}`);
  assert.ok(score.x >= EDGE);
});
