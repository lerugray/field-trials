import test from 'node:test';
import assert from 'node:assert/strict';
import socialRegister from '../data/register/social.json' with { type: 'json' };
import combatRegister from '../data/register/combat.json' with { type: 'json' };
import { stripSeed } from '../src/engine/layout.js';

// A pinned world seed makes the whole fixture deterministic: worldgen, site
// placement, encounter stepping and foe composition all flow from the seeded
// world RNG (the engine has no Math.random), so these seam tests cannot flake.
// The seed was chosen so the fixture dungeon's first rolled fight contains a
// recruitable foe (the join-beat test needs one to exist at all).
const FIXTURE_SEED = (Number(process.env.CHP_FIXTURE_SEED) || 7) >>> 0;

function recordingCtx(sink) {
  const noop = () => {};
  return {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '14px monospace', textAlign: 'left',
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, closePath: noop,
    stroke: noop, fill: noop, arc: noop,
    fillText: (text) => sink.push(String(text)),
    strokeText: (text) => sink.push(String(text)),
    measureText: (text) => ({ width: String(text).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
  };
}

async function boot(sink) {
  delete global.window;
  const { boot: start } = await import('../src/main.js');
  const canvas = {
    width: 0, height: 0, style: {},
    getContext: () => recordingCtx(sink),
    addEventListener() {},
  };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: 1440, innerHeight: 900, addEventListener() {} };
  global.document = {
    readyState: 'complete',
    getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)),
  };
  global.localStorage = {
    getItem: (key) => (
      key === 'chp-nature-seen' ? '1'
        : key === 'chapel-perilous.worlds' ? JSON.stringify([
          { id: 'w-fixture', seed: FIXTURE_SEED, name: 'Fixture', created: 0, lastPlayed: 0 },
        ])
        : null),
    setItem() {},
  };
  return start();
}

function teardown() {
  delete global.window;
  delete global.document;
  delete global.localStorage;
}

function pathToCitizen(town) {
  const start = town.city.spawn;
  const citizens = town.citizens;
  const queue = [{ x: start.x, y: start.y, path: [] }];
  const seen = new Set([`${start.x},${start.y}`]);
  const dirs = [
    ['w', 0, -1], ['s', 0, 1], ['a', -1, 0], ['d', 1, 0],
  ];
  while (queue.length) {
    const at = queue.shift();
    if (citizens.some((c) => c.x === at.x && c.y === at.y)) return at.path;
    for (const [key, dx, dy] of dirs) {
      const x = at.x + dx;
      const y = at.y + dy;
      const id = `${x},${y}`;
      if (seen.has(id) || !town.city.passable(x, y) || town.city.buildingAt(x, y)) continue;
      seen.add(id);
      queue.push({ x, y, path: [...at.path, key] });
    }
  }
  throw new Error('no walkable route to a citizen');
}

function combatFoeName(sink) {
  const i = sink.indexOf('THEM');
  const raw = i >= 0 && sink[i + 1] ? sink[i + 1] : '';
  return raw.replace(/\s+\[\d+\/\d+\]$/, '').trim();
}

function firstApproachVerb(sink) {
  const text = sink.join('\n');
  const m = text.match(/\[1\] (\w+) +\(/);
  return m ? m[1] : null;
}

function listedApproachCount(sink) {
  return (sink.join('\n').match(/^› \[\d+\] \w+ +\(/gm) || []).length;
}

function setOf(arr) {
  return new Set(arr.map((s) => stripSeed(s)));
}

test('town talk sends resolved conversation prose through the visible record path', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    const site = api.game.world.listSites().find((s) => s.kind === 'city')
      || api.game.world.listSites()[0];
    const town = api.game.enterCity(site);
    api.renderMode('city');
    for (const key of pathToCitizen(town)) {
      api.onKey({ key, preventDefault() {} });
      assert.equal(api.mode, 'city', 'route to citizen stays in town');
    }

    sink.length = 0;
    api.onKey({ key: 't', preventDefault() {} });
    const event = api.game.events.entries().at(-1);
    assert.equal(event.kind, 'talk');
    assert.ok(event.outcome.startsWith('[SEED]'), 'record stores resolved prose, not an internal class');
    assert.ok(!['lore', 'rumor', 'barter', 'joinable', 'rebuff'].includes(event.outcome));
    assert.ok(sink.join(' ').includes(event.outcome.replace(/^\[SEED\]\s*/, '').slice(0, 24)),
      'conversation prose is painted immediately in the console');

    sink.length = 0;
    api.onKey({ key: 'l', preventDefault() {} });
    assert.ok(sink.join(' ').includes(event.outcome.replace(/^\[SEED\]\s*/, '').slice(0, 24)),
      'the record overlay paints the conversation prose it consumes');
    assert.ok(socialRegister.talk.length > 0);
  } finally {
    teardown();
  }
});

test('dungeon movement keys actually move the crawl (no dead input)', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    api.renderMode('dungeon');
    assert.equal(api.mode, 'dungeon', 'fixture enters a dungeon');
    // Drive real keys through onKey. cp-017 regression: refreshMinimap was
    // defined in createGame's scope while onKey (boot scope) called it, so
    // EVERY movement key threw ReferenceError and movement was silently dead
    // in the browser from 2026-08-03 onward. onKey must not throw, and a
    // turn+step sequence must change the painted frame.
    sink.length = 0; api.render();
    const before = sink.join('|');
    for (const key of ['d', 'w', 'a', 'w', 'w']) {
      api.onKey({ key, preventDefault() {} });
    }
    sink.length = 0; api.render();
    const after = sink.join('|');
    assert.notEqual(before, after, 'moving/turning repaints a different dungeon frame');
  } finally {
    teardown();
  }
});

test('Guard paints the reduction or the break on the combat surface', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    api.game.session.pc.hp = 100;
    api.game.session.pc.maxHp = 100;
    api.renderMode('combat');
    assert.equal(api.mode, 'combat');
    let feedback = '';
    for (let i = 0; i < 6 && api.mode === 'combat'; i++) {
      sink.length = 0;
      api.onKey({ key: 'g', preventDefault() {} });
      feedback = sink.join(' ');
      if (/turns \d+ aside|breaks/i.test(feedback)) break;
    }
    assert.match(feedback, /turns \d+ aside|breaks/i, 'the visible combat note answers what Guard did');
    assert.match(feedback, /♥\s*\d+\/\d+/, 'Guard feedback includes the resulting HP');
  } finally {
    teardown();
  }
});

test('a final kill beat is painted on combat before returning to navigation', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    api.game.session.pc.hp = 100;
    api.game.session.pc.maxHp = 100;
    api.game.session.pc.weapon = { name: '[SEED] test certainty', dmg: [100, 100] };
    api.renderMode('combat');
    assert.equal(api.mode, 'combat', 'fixture enters combat');

    let sawCombatKillBeat = false;
    for (let i = 0; i < 20 && api.mode === 'combat'; i++) {
      sink.length = 0;
      api.onKey({ key: 'f', preventDefault() {} });
      if (/falls/i.test(sink.join(' '))) {
        assert.equal(api.mode, 'combat', 'kill outcome is painted before navigation resumes');
        sawCombatKillBeat = true;
        api.onKey({ key: ' ', preventDefault() {} });
      }
    }
    assert.ok(sawCombatKillBeat, 'a kill outcome was painted over the combat screen');
    assert.notEqual(api.mode, 'combat', 'the next input leaves the resolved combat');
  } finally {
    teardown();
  }
});

test('a final recruitment beat is painted on combat before returning to navigation', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    for (let i = 0; i < 5000; i++) {
      const ranks = Object.values(api.game.session.pc.stats());
      if (ranks.every((rank) => rank === 'UNCANNY')) break;
      api.game.session.reroll();
    }
    assert.ok(Object.values(api.game.session.pc.stats()).every((rank) => rank === 'UNCANNY'),
      'fixture deals a stranger able to use every approach');
    api.renderMode('combat');
    assert.equal(api.mode, 'combat', 'fixture enters combat');

    let sawCombatJoinBeat = false;
    for (let i = 0; i < 10 && api.mode === 'combat'; i++) {
      api.onKey({ key: 't', preventDefault() {} });
      sink.length = 0;
      api.onKey({ key: '1', preventDefault() {} });
      if (/joins you/i.test(sink.join(' '))) {
        assert.equal(api.mode, 'combat', 'join outcome is painted before navigation resumes');
        sawCombatJoinBeat = true;
        api.onKey({ key: ' ', preventDefault() {} });
      }
    }
    assert.ok(sawCombatJoinBeat, 'a join outcome was painted over the combat screen');
    assert.notEqual(api.mode, 'combat', 'the next input leaves the resolved combat');
  } finally {
    teardown();
  }
});

test('combat talk paints a two-line exchange for a chosen approach', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    for (let i = 0; i < 5000; i++) {
      const ranks = Object.values(api.game.session.pc.stats());
      if (ranks.every((rank) => rank === 'UNCANNY')) break;
      api.game.session.reroll();
    }
    assert.ok(Object.values(api.game.session.pc.stats()).every((rank) => rank === 'UNCANNY'),
      'fixture deals a stranger able to use every approach');
    api.renderMode('combat');
    assert.equal(api.mode, 'combat', 'fixture enters combat');

    sink.length = 0;
    api.onKey({ key: 't', preventDefault() {} });
    const verb = firstApproachVerb(sink);
    assert.ok(verb, `talk menu should list approaches, got: ${sink.join(' | ')}`);
    const approachOptions = setOf(combatRegister.approaches[verb] || []);
    assert.ok(approachOptions.size, `register has approach lines for ${verb}`);

    sink.length = 0;
    api.onKey({ key: '1', preventDefault() {} });
    const painted = sink.join(' ');
    assert.ok([...approachOptions].some((line) => painted.includes(line)),
      `approach line for ${verb} is painted: ${painted.slice(0, 140)}`);
    const outcome = /joins you/i.test(painted) ? 'recruit' : 'parley';
    const responseOptions = setOf(Object.values(combatRegister.responses[outcome] || {}).flat());
    assert.ok([...responseOptions].some((line) => painted.includes(line)),
      `response line for ${outcome} is painted: ${painted.slice(0, 140)}`);

    sink.length = 0;
    api.render();
    const painted2 = sink.join(' ');
    assert.ok([...approachOptions].some((line) => painted2.includes(line)),
      'approach line persists across a render');
    assert.ok([...responseOptions].some((line) => painted2.includes(line)),
      'response line persists across a render');

    if (api.mode === 'combat') api.onKey({ key: ' ', preventDefault() {} });
  } finally {
    teardown();
  }
});

test('a refused combat talk verb paints its approach and response exchange', async () => {
  const sink = [];
  const api = await boot(sink);
  let being = null;
  let savedInteraction = null;
  try {
    for (let i = 0; i < 5000; i++) {
      const ranks = Object.values(api.game.session.pc.stats());
      if (ranks.every((rank) => rank === 'UNCANNY')) break;
      api.game.session.reroll();
    }
    assert.ok(Object.values(api.game.session.pc.stats()).every((rank) => rank === 'UNCANNY'),
      'fixture deals a stranger able to use every approach');
    api.renderMode('combat');
    assert.equal(api.mode, 'combat', 'fixture enters combat');

    sink.length = 0;
    api.onKey({ key: 't', preventDefault() {} });
    const verb = firstApproachVerb(sink);
    const foeName = combatFoeName(sink);
    assert.ok(verb && foeName, `expected talk menu and foe, got verb=${verb} foe=${foeName}`);
    assert.ok(listedApproachCount(sink) >= 2,
      'need at least two listed approaches so removing one still leaves the engine in verb-unavailable');

    being = api.game.bestiary.all().find((b) => stripSeed(b.name) === foeName);
    assert.ok(being, `bestiary entry for ${foeName}`);
    savedInteraction = { ...being.interaction };
    const nextInteraction = { ...being.interaction };
    delete nextInteraction[verb];
    being.interaction = nextInteraction;

    sink.length = 0;
    api.onKey({ key: '1', preventDefault() {} });
    const painted = sink.join(' ');
    const approachOptions = setOf(combatRegister.approaches[verb] || []);
    assert.ok([...approachOptions].some((line) => painted.includes(line)),
      `approach line for ${verb} is painted in the refusal: ${painted.slice(0, 140)}`);
    const responseOptions = setOf(Object.values(combatRegister.responses.verb_unavailable || {}).flat());
    assert.ok([...responseOptions].some((line) => painted.includes(line)),
      `verb-unavailable response is painted: ${painted.slice(0, 140)}`);

    sink.length = 0;
    api.render();
    const painted2 = sink.join(' ');
    assert.ok([...approachOptions].some((line) => painted2.includes(line)),
      'refusal approach line persists across a render');
    assert.ok([...responseOptions].some((line) => painted2.includes(line)),
      'refusal response line persists across a render');
  } finally {
    if (being && savedInteraction) being.interaction = savedInteraction;
    teardown();
  }
});
