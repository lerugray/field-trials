// file:// boot must always work (CLAUDE.md hard rule 6). Headless proxy:
// parse index.html, resolve its module-script entry, statically walk the
// relative import graph asserting every referenced file exists, then actually
// import the entry in Node to prove the graph loads without throwing. main.js
// guards all DOM access behind `window`, so importing it here is side-effect free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(resolve(root, 'data/world/master.json'), 'utf8'));

function moduleEntry() {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const m = html.match(/<script[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/);
  assert.ok(m, 'index.html must have a <script type="module" src="...">');
  return m[1];
}

test('index.html declares a module entry that exists on disk', () => {
  const entry = moduleEntry();
  assert.ok(existsSync(resolve(root, entry)), `entry ${entry} not found`);
});

test('the relative import graph fully resolves on disk', () => {
  const importRe = /import\s+(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']/g;
  const seen = new Set();
  const missing = [];

  function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    let m;
    while ((m = importRe.exec(src))) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue; // bare/URL specifiers: skip
      const dep = resolve(dirname(file), spec);
      if (!existsSync(dep)) { missing.push(`${spec} (from ${file})`); continue; }
      if (dep.endsWith('.js')) walk(dep);
    }
    importRe.lastIndex = 0;
  }

  walk(resolve(root, moduleEntry()));
  assert.deepEqual(missing, [], `unresolved imports: ${missing.join(', ')}`);
  assert.ok(seen.size >= 3, 'expected the entry to pull in several engine modules');
});

test('the module entry imports in Node without throwing', async () => {
  const entry = pathToFileURL(resolve(root, moduleEntry())).href;
  const mod = await import(entry);
  // createGame is the headless-safe factory; exercise it to prove the graph works.
  assert.equal(typeof mod.createGame, 'function');
  const game = mod.createGame(master);
  assert.ok(game.world && game.party);
  assert.equal(typeof game.party.x, 'number');
  assert.equal(game.world.passable(game.party.x, game.party.y), true);

  // The register engine is wired into the live game: every overworld site
  // yields a deterministic, [SEED]-marked description with no template leaks.
  assert.equal(typeof game.describeSite, 'function');
  for (const site of game.world.listSites()) {
    const d = game.describeSite(site);
    assert.ok(d.startsWith('[SEED] '), `site description must be [SEED]-marked: ${d}`);
    assert.ok(!d.includes('{') && !d.includes('}'), `no template leak: ${d}`);
    assert.equal(d, game.describeSite(site), 'site description must be deterministic');
  }

  // The dungeon is wired headlessly: entering a site assembles a crawlable
  // dungeon (deterministic per site) with a first-person crawl and a name, and
  // the room description stays [SEED]-marked. Structure Arc gates later ops —
  // only enter sites the manual currently allows (active/complete).
  assert.equal(typeof game.enterSite, 'function');
  const enterable = game.world.listSites().filter((s) => s.kind !== 'city' && game.canEnterSite(s));
  assert.ok(enterable.length >= 1, 'at least the active operation dungeon is enterable');
  for (const site of enterable) {
    const run = game.enterSite(site);
    assert.ok(run.dungeon && run.crawl, 'enterSite yields a dungeon + crawl');
    assert.ok(run.dungeon.floorAt(run.crawl.x, run.crawl.y), 'crawl starts on floor');
    assert.equal(typeof run.name, 'string');
    assert.ok(run.name.length > 0, 'dungeon gets a generated name');
    const again = game.enterSite(site);
    assert.deepEqual(again.dungeon.tiles, run.dungeon.tiles, 'a site is a stable dungeon');
    const room = game.describeRoom(run);
    assert.ok(room.startsWith('[SEED] '), `room description must be [SEED]-marked: ${room}`);
  }
  const locked = game.world.listSites().find((s) => s.kind === 'dungeon' && !game.canEnterSite(s));
  if (locked) {
    assert.throws(() => game.enterSite(locked), (e) => e && e.code === 'OPERATION_LOCKED');
  }

  // The encounter surface is wired live: bestiary + tables load, and stepping in
  // a dungeon deterministically rolls the ENCOUNTERS LOCK table for that run. A
  // fixed walk reproduces exactly (no pity/scaling drift), and any fight it
  // surfaces materializes combat-ready foes.
  assert.ok(game.bestiary.count >= 12, 'bestiary is wired with the full roster');
  assert.ok(game.encounters.tables.includes('dungeon'), 'dungeon encounter table is wired');
  assert.equal(typeof game.stepEncounter, 'function');
  const walkA = [];
  let runA = game.enterSite(enterable[0]);
  for (let i = 0; i < 40; i++) walkA.push(game.stepEncounter(runA));
  const walkB = [];
  let runB = game.enterSite(enterable[0]);
  for (let i = 0; i < 40; i++) walkB.push(game.stepEncounter(runB));
  assert.deepEqual(walkA, walkB, 'a fixed walk through a fixed dungeon reproduces its encounters');
  const anyFight = walkA.find((e) => e && e.kind === 'fight');
  if (anyFight) {
    assert.ok(anyFight.foes.length >= 1 && anyFight.foes.every((f) => f.weapon), 'fight foes are combat-ready');
  }

  // The run session is wired live: a dealt PC + roster, and a full fight can be
  // driven to resolution through session.startCombat/resolveCombat headlessly —
  // proving the M2 combat loop is reachable from the shell's game object.
  assert.equal(typeof game.chargen.rollSeeded, 'function');
  assert.ok(game.session.pc, 'the session deals a starting PC');
  assert.equal(game.session.roster.size, 1);
  const fightEnc = { kind: 'fight', foes: [game.bestiary.toCombatantSpec('cave-rat')] };
  const combat = game.session.startCombat(fightEnc, 3);
  let guard = 0;
  while (!combat.over && guard++ < 1000) {
    const a = combat.active();
    if (a && a.side === 'party') combat.take({ type: 'fight', target: combat.living('foe')[0].id });
    else combat.take();
  }
  const summary = game.session.resolveCombat(combat);
  assert.ok(['win', 'lose', 'parley', 'fled'].includes(summary.outcome));
  // World persists across a PC death (permadeath, world remains).
  game.session.clearSite('smoke-site');
  const before = game.session.clearedSites().length;
  game.session.die('smoke');
  assert.equal(game.session.clearedSites().length, before, 'cleared sites survive death');
  assert.ok(game.session.deaths >= 1);

  // City mode is wired: a city site assembles a stable, walkable city with
  // service-bearing buildings, and describeBuilding yields [SEED] talk hooks.
  const citySite = game.world.listSites().find((s) => s.kind === 'city');
  if (citySite) {
    assert.equal(typeof game.enterCity, 'function');
    const town = game.enterCity(citySite);
    assert.ok(town.city && town.stroll, 'enterCity yields a city + stroll');
    assert.equal(town.city.passable(town.stroll.x, town.stroll.y), true, 'stroll starts on the street');
    assert.ok(town.city.buildingCount >= 1, 'the city has buildings');
    const again = game.enterCity(citySite);
    assert.deepEqual(again.city.tiles, town.city.tiles, 'a site is a stable city');
    const svc = game.describeBuilding(town.city.buildings[0]);
    assert.ok(svc.name.startsWith('[SEED]'), `building service is [SEED]-marked: ${svc.name}`);
    assert.ok(svc.greeting.startsWith('[SEED]'));
    // The service talk hook runs live against the session and stays [SEED].
    const interaction = game.enterBuilding(town.city.buildings[0]);
    assert.ok(Array.isArray(interaction.lines) && interaction.lines.length >= 1);
    assert.ok(interaction.lines.every((l) => l.startsWith('[SEED]')), 'service lines are [SEED]-marked');
  }

  // Save/load is wired at the game level: a snapshot round-trips party position
  // and the full run, and rejects a save from a different world.
  // The journal (M7) is wired at the game level: a written note appears in the
  // corrupted + ghost view, exposure derives from hidden FNORD, and entries
  // survive save/load.
  assert.ok(game.journal && typeof game.journal.write === 'function', 'journal is wired');
  const exp = game.exposure();
  assert.ok(exp >= 0 && exp <= 1, 'exposure normalises to 0..1');
  game.journal.write({ text: 'the clerk knew my name', where: 'the lodge', when: game.tick });
  const jview = game.journal.view({ exposure: 1, now: game.tick + 20 });
  assert.ok(jview.some((e) => e.origin === 'player'), 'the written note is in the view');
  assert.ok(jview.every((e) => e.origin !== 'ghost' || e.text.includes('[SEED]')), 'ghost prose stays [SEED]-marked');

  assert.equal(typeof game.save, 'function');
  game.party.moveTo(9, 9);
  game.session.clearSite('save-smoke');
  const snap = JSON.parse(JSON.stringify(game.save()));
  const jbefore = game.journal.count();
  game.party.moveTo(0, 0);
  game.load(snap);
  assert.deepEqual(game.party.pos, { x: 9, y: 9 }, 'party position restored');
  assert.ok(game.session.clearedSites().includes('save-smoke'), 'run progress restored');
  assert.equal(game.journal.count(), jbefore, 'journal entries survive save/load');
  assert.throws(() => game.load({ ...snap, seed: snap.seed + 1 }), /different world/);
});
