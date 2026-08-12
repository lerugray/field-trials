// M12 F1/F2 — the minimal social layer. Talk resolves from a FIXED outcome table with
// distinct register prose; barter is one tag-for-item exchange; PULL widens the offer
// pool (never prices). Pure + deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocial, TRADE_TAGS, offerTiersOpen } from '../src/engine/social.js';
import { createCharacter } from '../src/engine/character.js';
import socialRegister from '../data/register/social.json' with { type: 'json' };

const social = createSocial();
const voiced = createSocial({ register: socialRegister });

test('the canonical trade tags come from wants + rest-offering + gate tags', () => {
  for (const t of ['attention', 'blood', 'food', 'money', 'secrets', 'rest-offering', 'ford']) {
    assert.ok(TRADE_TAGS.includes(t), `${t} is canonical`);
  }
});

test('talk resolves to one of the fixed classes, each with distinct [SEED] prose', () => {
  const seen = new Set();
  for (let s = 1; s <= 300; s++) {
    const r = social.resolveTalk({ name: '[SEED] a citizen', want: 'secrets', recruitable: true }, createCharacter({ pull: 'STEADY' }), { seed: s, capacityOpen: true, pointers: [{ name: '[SEED] the Chapel', dir: 'north' }] });
    assert.ok(['lore', 'rumor', 'barter', 'joinable', 'rebuff'].includes(r.class), `valid class ${r.class}`);
    assert.ok(r.line.startsWith('[SEED]'), 'voiced line');
    seen.add(r.class);
  }
  for (const c of ['lore', 'rumor', 'barter', 'joinable', 'rebuff']) assert.ok(seen.has(c), `class ${c} reachable`);
});

test('joinable never offered when the roster is full or the being is not recruitable', () => {
  for (let s = 1; s <= 200; s++) {
    const full = social.resolveTalk({ name: 'x', recruitable: true }, createCharacter({}), { seed: s, capacityOpen: false });
    assert.notEqual(full.class, 'joinable', 'no room → never joinable');
    const notRec = social.resolveTalk({ name: 'x', recruitable: false }, createCharacter({}), { seed: s, capacityOpen: true });
    assert.notEqual(notRec.class, 'joinable', 'not recruitable → never joinable');
  }
});

test('a rumor points at a real target', () => {
  const pointers = [{ name: '[SEED] the drowned ford', dir: 'east' }];
  let sawRumor = false;
  for (let s = 1; s <= 200 && !sawRumor; s++) {
    const r = social.resolveTalk({ name: 'x' }, createCharacter({}), { seed: s, pointers });
    if (r.class === 'rumor') { sawRumor = true; assert.equal(r.target, pointers[0], 'points at a real place'); }
  }
  assert.ok(sawRumor);
});

test('PULL widens the offer pool tier, never the count or a price', () => {
  assert.equal(offerTiersOpen(createCharacter({ pull: 'STEADY' })), 1);
  assert.equal(offerTiersOpen(createCharacter({ pull: 'SHARP' })), 2);
  assert.equal(offerTiersOpen(createCharacter({ pull: 'UNCANNY' })), 3);
  // a barter offer is always exactly ONE item carrying a trade tag
  let sawBarter = false;
  for (let s = 1; s <= 200 && !sawBarter; s++) {
    const r = social.resolveTalk({ name: 'x', want: 'food' }, createCharacter({ pull: 'UNCANNY' }), { seed: s });
    if (r.class === 'barter') {
      sawBarter = true;
      assert.ok(TRADE_TAGS.includes(r.want), 'wants a canonical tag');
      assert.ok(r.offer && Array.isArray(r.offer.tags) && r.offer.tags.length >= 1, 'offers one tagged item');
    }
  }
  assert.ok(sawBarter);
});

test('deterministic in (subject, seed)', () => {
  const pc = createCharacter({ pull: 'SHARP' });
  for (let s = 1; s <= 30; s++) {
    const a = social.resolveTalk({ name: 'x', want: 'blood', recruitable: true }, pc, { seed: s, capacityOpen: true });
    const b = social.resolveTalk({ name: 'x', want: 'blood', recruitable: true }, pc, { seed: s, capacityOpen: true });
    assert.deepEqual(a, b);
  }
});

test('register-backed dialogue pools expose greeting/farewell/join/refuse lines', () => {
  const subj = { name: '[SEED] a citizen' };
  assert.ok(voiced.greeting(subj, 1).startsWith('[SEED]'));
  assert.ok(voiced.farewell(subj, 2).startsWith('[SEED]'));
  assert.ok(voiced.joinLine(subj, 3).startsWith('[SEED]'));
  assert.ok(voiced.refuseLine(subj, 4).startsWith('[SEED]'));
  assert.ok(voiced.greeting(subj, 1).includes('citizen'), 'greeting fills ${name}');
});

function seededPoolLines(pool, name) {
  const base = String(name).replace(/^\[SEED\]\s*/i, '');
  return pool.map((tpl) => {
    const body = String(tpl).replace(/^\[SEED\]\s*/i, '').replace(/\$\{name\}/g, base);
    return `[SEED] ${body}`;
  });
}

test('register-backed resolveTalk picks from the dialogue pools per class', () => {
  const subj = { name: '[SEED] a citizen', recruitable: true };
  const pc = createCharacter({});
  for (let s = 1; s <= 100; s++) {
    const r = voiced.resolveTalk(subj, pc, { seed: s, capacityOpen: true });
    assert.ok(r.line.startsWith('[SEED]'), `${r.class} line is register-backed`);
    assert.ok(r.greeting && r.greeting.startsWith('[SEED]'), 'greeting is register-backed');
    assert.ok(r.farewell && r.farewell.startsWith('[SEED]'), 'farewell is register-backed');

    const poolMap = {
      lore: 'talk',
      rumor: 'talk',
      barter: 'talk',
      joinable: 'recruit_attempt',
      rebuff: 'refuse',
    };
    const poolName = poolMap[r.class];
    assert.ok(poolName, `known class ${r.class}`);
    const expected = seededPoolLines(socialRegister[poolName], subj.name);
    assert.ok(expected.includes(r.line), `${r.class} line came from ${poolName} pool`);
  }
});
