// THE MASTHEAD's centre zone, at the worst case the run can reach.
//
// Spelling the legibility law's fixes into the centre made it longer:
// `30/120 · enc 0 · esc L2` became `pace 30/120 · encounters 0 · escalation 2`.
// The centre is centred on the WHOLE bar, so a long run grows toward the screen
// name on one side and the gold icon on the other — and the law forbids buying
// the room back by re-abbreviating. The separator gives way instead, never the
// words, and these assertions are what hold that line.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMarch } from '../src/engine.js';
import { createParty } from '../src/party.js';
import { render } from '../src/main.js';
import { TUNING } from '../src/tuning.js';

const VW = 320;

function stubCtx() {
  const target = {
    font: '7px monospace', fillStyle: '#000', strokeStyle: '#000',
    textAlign: 'left', textBaseline: 'top', lineWidth: 1, globalAlpha: 1,
    imageSmoothingEnabled: false, __pixelTextEvents: [],
  };
  return new Proxy(target, {
    get(obj, key) { return key in obj ? obj[key] : () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}

/** Render the march masthead at a given run state; return its three zones. */
function marchBar({ leg, paces, encounters, escLevel, gold }) {
  const march = createMarch(17);
  march.leg = leg;
  march.paces = paces;
  march.encounterCount = encounters;
  const party = createParty();
  party.gold = gold;
  const ctx = stubCtx();
  render(ctx, {
    ui: { screen: 'march', paused: true, muted: false, focus: -1, hover: -1, ticker: [], omen: null, escLevel },
    march, party, mandate: null, controls: [], log: { errorCount: 0 }, paused: true,
  });
  const bar = (ctx.__pixelTextEvents || []).filter((e) => e.y < 16);
  const left = bar.find((e) => e.text === 'THE ROAD');
  const goldTxt = bar.find((e) => /^\d+G$/.test(String(e.text)));
  const center = bar.find((e) => e !== left && e !== goldTxt && String(e.text).startsWith('LEG'));
  return { left, center, gold: goldTxt, bar };
}

const WORST = {
  leg: 12, paces: TUNING.legLengthPaces, encounters: 12, escLevel: 3, gold: 9999,
};

test('the ledger figure carries its unit, and the icon sits against it', () => {
  const { gold } = marchBar(WORST);
  assert.ok(gold, 'the masthead must report the ledger with its unit');
  assert.equal(gold.text, '9999G');
  assert.ok(gold.x + gold.w <= VW - 8, 'the ledger figure runs off the right edge');
});

test('the centre spells every fact — no enc, no esc, no bare ratio', () => {
  const { center } = marchBar(WORST);
  assert.ok(center, 'the march masthead lost its centre zone');
  assert.match(center.text, /pace 120\/120/);
  assert.match(center.text, /encounters 12/);
  assert.match(center.text, /escalation 3/);
  assert.doesNotMatch(center.text, /\benc\b|\besc\b|\bL3\b/);
});

test('the centre clears the screen name and the gold zone at the worst case', () => {
  const { left, center, gold } = marchBar(WORST);
  assert.ok(center.x >= left.x + left.w, 'the centre overlaps the screen name');
  assert.ok(center.x + center.w <= gold.x - 11, 'the centre overlaps the gold icon');
});

test('escalation is absent until it exists, and the wide separator returns', () => {
  const early = marchBar({ leg: 1, paces: 30, encounters: 0, escLevel: 0, gold: 40 });
  assert.doesNotMatch(early.center.text, /escalation/);
  assert.match(early.center.text, /LEG 1 {2}·{1} {2}pace 30\/120/, 'a short centre keeps the airy separator');
  assert.ok(early.center.x >= early.left.x + early.left.w);
});
