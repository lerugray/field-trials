// Browser entry point. Boots the overworld: streams chunks around the party,
// renders a monochrome viewport to canvas, moves on arrow/WASD keys. All DOM
// work is deferred behind a `window` guard so this module imports cleanly in
// Node (the boot-smoke test loads it headlessly).
import { createWorld } from './engine/world.js';
import { createParty } from './engine/party.js';
import { createProse } from './engine/prose.js';
import { createNames } from './engine/names.js';
import { createDungeonKit, assembleDungeon, createCrawl, VEC, LEFT, RIGHT } from './engine/dungeon.js';
import { createBestiary } from './engine/bestiary.js';
import { createEncounters, exposureTier } from './engine/encounters.js';
import { createWanderers } from './engine/wanderers.js';
import { createBiomes } from './engine/biomes.js';
import { createDungeonLife, enemyInCorridor } from './engine/dungeonlife.js';
import { createChargen } from './engine/chargen.js';
import { createSession } from './engine/session.js';
import { createLoot } from './engine/loot.js';
import { createEventLog } from './engine/eventlog.js';
import { createSocial } from './engine/social.js';
import { createCombatProse } from './engine/combatprose.js';
import { formatCombatRound } from './engine/combat.js';
import { subterfugeContext } from './engine/tactics.js';
import { normalizeItem, combatEffect } from './engine/items.js';
import { createAudio } from './engine/audio.js';
import { sceneFor } from './engine/score.js';
import { assembleCity, createStroll, serviceGlyph, archetypeTexture } from './engine/city.js';
import { createCityLife } from './engine/citylife.js';
import { createServices } from './engine/services.js';
import { createShop } from './engine/shop.js';
import { createPalettes } from './engine/palette.js';
import { hashInt, mulberry32 } from './engine/prng.js';
import { SHADE_LEVELS } from './engine/tiles.js';
import { bayer, ditherDensity } from './engine/dither.js';
import { createTileArt, terrainArtId, siteArtId, terrainAccentSpec, ART_SIZE } from './engine/tileart.js';
import { drawTile, reprShade, contrastOutlineShade, dimOutlineShade } from './engine/tiledraw.js';
import { PARTY_FOCAL } from './engine/partycontrast.js';
import { BLOOM_CLASSES, lightLayer } from './engine/lightbudget.js';
import {
  OVERWORLD_LANDMARK_LUMINANCE,
  OVERWORLD_PARTY_LUMINANCE,
  OVERWORLD_ROAD_LUMINANCE,
  OVERWORLD_TERRAIN_LUMINANCE,
  overworldColor,
  overworldRoadPoints,
} from './engine/overworldart.js';
import { createBusts, bustArtId } from './engine/bustart.js';
import { styleFor } from './engine/dungeonregister.js';
import { renderFP } from './engine/fprender.js';
import { CANVAS_W, CANVAS_H, buildWorldMenuDrawList, buildCreationDrawList, stripSeed, bustBoxFor } from './engine/layout.js';
import { buildKeybar, buildHelpOverlay, buildPanel, buildNatureDrawList } from './engine/chrome.js';
import { computeFrame, frameDisplay } from './engine/frame.js';
import { createMinimap, exploreCurrent, drawMinimap, featureGlyph } from './engine/minimap.js';
import { createWorldMapState, drawWorldmap, siteGlyph } from './engine/worldmap.js';
import { textWidth, ellipsize } from './engine/layout.js';
import { buildCombatDrawList, buildDeathDrawList, buildBuildingDrawList, buildShopDrawList, buildJournalDrawList, buildSneakDrawList, buildPartyDrawList, buildManualPage } from './engine/panels.js';
import { createJournal } from './engine/journal.js';
import { dirFor, actionFor } from './engine/bindings.js';
import { generateSeed, generateWorldConfig } from './engine/worldgen.js';
import { createWorldRegistry } from './engine/worldregistry.js';
import { createManual } from './engine/manual.js';
import { assembleAuthoredDungeon } from './engine/authoreddungeon.js';
import master from '../data/world/master.json' with { type: 'json' };
import biomeData from '../data/world/biomes.json' with { type: 'json' };
import biomeRegister from '../data/register/biomes.json' with { type: 'json' };
import register from '../data/register/system.json' with { type: 'json' };
import siteTemplates from '../data/register/sites.json' with { type: 'json' };
import pools from '../data/register/pools.json' with { type: 'json' };
import phonemes from '../data/register/phonemes.json' with { type: 'json' };
import kit from '../data/dungeon/kit.json' with { type: 'json' };
import beings from '../data/bestiary/beings.json' with { type: 'json' };
import encounterTables from '../data/encounters/tables.json' with { type: 'json' };
import chargenData from '../data/register/chargen.json' with { type: 'json' };
import lootData from '../data/register/loot.json' with { type: 'json' };
import combatRegister from '../data/register/combat.json' with { type: 'json' };
import cityRegister from '../data/register/city.json' with { type: 'json' };
import socialRegister from '../data/register/social.json' with { type: 'json' };
import shopRegister from '../data/register/shop.json' with { type: 'json' };
import palettesData from '../data/palettes.json' with { type: 'json' };
import operationsData from '../data/operations.json' with { type: 'json' };
import authoredOperation1 from '../data/dungeon/operation-1.json' with { type: 'json' };
import authoredOperation2 from '../data/dungeon/operation-2.json' with { type: 'json' };
import authoredOperation3 from '../data/dungeon/operation-3.json' with { type: 'json' };
import authoredOperation4 from '../data/dungeon/operation-4.json' with { type: 'json' };
import authoredOperation5 from '../data/dungeon/operation-5.json' with { type: 'json' };

export { master };

export function combatHudVitals(pc, combat) {
  const live = combat && Array.isArray(combat.combatants)
    ? combat.combatants.find((c) => c.id === 'pc' && c.side === 'party')
    : null;
  return {
    ...pc,
    hp: live ? live.hp : pc.hp,
    maxHp: live ? live.maxHp : pc.maxHp,
  };
}

export function capacityChangeLine(before, after) {
  return after > before ? `follower capacity ${before} → ${after}` : '';
}

// Structure Arc slice 1 (LOCK 2) — authored dungeon interiors, keyed by the
// `authoredLayout` string data/operations.json's matching operation carries.
// Add a new entry here alongside a new data/dungeon/<key>.json when a future
// operation gets its own hand-authored interior; everything else stays procedural.
const AUTHORED_LAYOUTS = {
  'operation-1': authoredOperation1,
  'operation-2': authoredOperation2,
  'operation-3': authoredOperation3,
  'operation-4': authoredOperation4,
  'operation-5': authoredOperation5,
};

const TILE = 32;      // default px per tile — 2px/art-pixel over the 16px matrices
                      // (crisp); the nav scene fits as many tiles as it can hold.

// The active palette (M4 VIBE): the whole shell renders through a single-hue
// scheme. Set at boot; until then, shadeColor falls back to grayscale so any
// headless render path stays defined.
let PALETTE = null;   // createPalettes instance
let SCHEME = null;     // active scheme id

// Authored Ultima-style tile art (M5). Compiled once; drawn through the active
// scheme so every tile reads in every single-hue palette.
const TILE_ART = createTileArt();
// Chunky block-shaded bestiary/party busts (M5), same ramp + draw path.
const BUSTS = createBusts();
// Seeded name engine — created once and reused for world + site naming.
const NAMES = createNames(phonemes);

// shade index (0..6) -> the active scheme's colour (single hue, brightness only).
function shadeColor(shade) {
  if (PALETTE && SCHEME) return PALETTE.shadeToColor(SCHEME, shade);
  const v = Math.round((shade / (SHADE_LEVELS - 1)) * 200) + 20; // 20..220
  return `rgb(${v},${v},${v})`;
}

function overworldTerrainColor(shade) {
  if (PALETTE && SCHEME) return overworldColor(PALETTE, SCHEME, shade, OVERWORLD_TERRAIN_LUMINANCE);
  return shadeColor(Math.min(4, shade));
}

function overworldLandmarkColor(shade) {
  if (PALETTE && SCHEME) return overworldColor(PALETTE, SCHEME, shade, OVERWORLD_LANDMARK_LUMINANCE);
  return shadeColor(shade);
}

function overworldPartyColor(shade) {
  if (PALETTE && SCHEME) return overworldColor(PALETTE, SCHEME, shade, OVERWORLD_PARTY_LUMINANCE);
  return shadeColor(shade);
}

function overworldRoadColor() {
  if (PALETTE && SCHEME) return PALETTE.luminanceToColor(SCHEME, OVERWORLD_ROAD_LUMINANCE);
  return shadeColor(4);
}

// M8 dither: the world-anchored texture options for a tile at world cell
// (gx,gy). Grain is keyed to the tile's world art-pixel origin so the stipple is
// locked to the map (scrolls, never crawls); `seed` folds in the world seed so
// two worlds grain differently. Optional `tileId` selects the G3 per-family
// density (R3 LOCKED B2); omit for the unknown/non-terrain fallback.
function tileDither(gx, gy, seed, tileId) {
  return { wx: (gx | 0) * ART_SIZE, wy: (gy | 0) * ART_SIZE, seed: seed >>> 0, amp: ditherDensity(tileId), levels: SHADE_LEVELS, sub: 2 };
}

// The active scheme's restrained accent hue (M6 review addendum item 3). Used
// sparingly — HUD vitals, the party marker, feedback/register moments — over the
// otherwise single-hue base. Falls back to a warm tone before boot.
function accentColor(t = 1) {
  if (PALETTE && SCHEME) return PALETTE.accentColor(SCHEME, t);
  return `rgb(${Math.round(255 * t)},${Math.round(176 * t)},${Math.round(64 * t)})`;
}

// The active scheme's HOT phosphor tint [r,g,b] — the colour additive light
// blooms toward (art-uplift "light as compositing"; see palette.js glow()).
function glowTriple() {
  if (PALETTE && SCHEME) return PALETTE.glow(SCHEME);
  return [206, 255, 208];
}

export function createGame(config) {
  if (!config || typeof config !== 'object') throw new Error('createGame: config object required');
  const world = createWorld(config);
  const prose = createProse(pools);
  const names = createNames(phonemes);
  const dungeonKit = createDungeonKit(kit);
  const bestiary = createBestiary(beings);
  const encounters = createEncounters(encounterTables, bestiary);
  // M9 BIOMES: guaranteed, hand-placed overworld areas, each with its own
  // terrain dressing, monster/NPC mix, ambient events, and register/vibe.
  // Cross-validated against the bestiary + encounter tables at construction.
  const biomes = createBiomes(biomeData, { bestiary, encounters, tileArt: createTileArt() });
  const chargen = createChargen(chargenData, { names }); // A10: dealt name + face randomize
  const loot = createLoot(lootData); // Part B: kills drop salvage/trinkets; caches yield relics
  const shop = createShop(shopRegister); // M12: seeded-chaotic barter commerce
  const services = createServices(cityRegister, { prose, shop });
  const social = createSocial({ prose, register: socialRegister }); // F1/F2 minimal talk + barter
  // The run session: the current PC + roster, permadeath, and world persistence
  // (cleared sites survive a death). Seeded off the world so a world reproduces.
  const session = createSession({ chargen, seed: (world.seed ^ 0x5e5510) >>> 0 });
  // The journal (M7): seeded per world so its corruption + ghosts replay. `tick`
  // is the run's monotonic clock (bumped per step) — the when-stamp for notes and
  // the age the corruption engine reads.
  const journal = createJournal({ prose, seed: (world.seed ^ 0x1057) >>> 0 });
  // cp-019/cp-020: world-persistent map memory (dungeon minimaps + overworld knownness).
  const mapState = createWorldMapState();
  let tick = 0;
  function bumpTick() { tick += 1; }
  // The diagnosability event log (Part B): a ring buffer of side effects, stamped
  // with the current tick. Callers pass mode/seed/outcome; the game stamps the clock.
  const events = createEventLog();
  function logEvent(kind, data = {}) { return events.log(kind, { ...data, tick }); }
  // Live exposure clock shared by journal corruption and encounter pressure.
  // Hidden FNORD modulates accrual inside session; the HUD never reveals the rank.
  function exposure() {
    return session.exposure;
  }
  const start = world.nearestOpen(config.start.x, config.start.y);
  // The manual (Structure Arc slice 1, LOCK 1/2/3): the fixed operations
  // questline, its per-world dungeon assignment (nearest-to-farthest from
  // spawn), and the single source of truth for which site is "the Chapel"
  // (the final operation's dungeon). See src/engine/manual.js.
  const manual = createManual(operationsData, { world, session, start });
  // The manual is a world lock, not merely a reader: locked operation sites are
  // impassable on the overworld and also rejected by enterSite().
  function passable(x, y) {
    if (!world.passable(x, y)) return false;
    const site = world.siteAt(x, y);
    return !site || manual.passable(site);
  }
  const party = createParty(world, start, { passable });
  // The starting region's town (A3): the city site nearest the spawn. It guarantees
  // BOTH an inn and a shrine (the forgiving opening); every other town guarantees at
  // least one heal door. Computed once — a stable property of the world.
  const startTown = (() => {
    const cities = world.listSites().filter((s) => s.kind === 'city');
    let best = null, bd = Infinity;
    for (const s of cities) {
      const d = Math.abs(s.x - start.x) + Math.abs(s.y - start.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  })();

  // E4 — the forgiving opening (placement-only, no difficulty scalar). A safe radius
  // around spawn where the invisible ambush-tail never rolls; the nearest dungeon sits
  // outside it (the intent — honored by the pinned site data); and 1-2 guaranteed caches
  // sit inside it, reachable before any dungeon. START_SAFE_RADIUS is [SEED]-tuned to
  // exclude the pinned Chapel dungeon (chebyshev 3 from spawn), so the intent holds.
  const START_SAFE_RADIUS = 2;
  const START_CACHE_COUNT = 2;
  const cheby = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const nearStart = (x, y) => cheby(x, y, start.x, start.y) <= START_SAFE_RADIUS;
  // Guaranteed starter caches: the first START_CACHE_COUNT passable, non-site, non-gate
  // tiles found spiralling out from spawn within the safe radius (never the spawn tile).
  const starterCaches = (() => {
    const out = [];
    for (let r = 1; r <= START_SAFE_RADIUS && out.length < START_CACHE_COUNT; r++) {
      for (let dy = -r; dy <= r && out.length < START_CACHE_COUNT; dy++) {
        for (let dx = -r; dx <= r && out.length < START_CACHE_COUNT; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring
          const x = start.x + dx, y = start.y + dy;
          if (!world.passable(x, y) || world.siteAt(x, y) || world.gateAt(x, y)) continue;
          out.push({ key: `${x},${y}`, x, y, artifact: `starter-cache-${out.length}`, description: '[SEED] a stashed kit — someone meant you to find it' });
        }
      }
    }
    return out;
  })();
  const starterCacheByKey = new Map(starterCaches.map((c) => [c.key, c]));
  const starterCachesTaken = new Set(); // world-persistent (serialized), never reset on death
  const starterCacheAt = (x, y) => starterCacheByKey.get(`${x},${y}`) || null;

  world.streamAround(party.x, party.y);
  // Visible living-world wanderers (M8 §5, BOTH layers): seeded NPCs + common
  // monsters roaming the map around the party. The invisible rare-unfair tail
  // (stepEncounter) stays underneath. Seeded off the world so a world replays.
  // E5 — NPC density as a signal: the visible-wanderer cap varies by region. Fewer in
  // quiet/safe country (the start region reads calm); more only where it's dangerous
  // (a high-weirdness biome, or near a dungeon) or populated (near a town). [SEED] caps.
  const DENSITY_SAFE = 2, DENSITY_POPULATED = 4, DENSITY_DANGEROUS = 5;
  function densityFor(x, y) {
    const b = biomes.biomeAt(x, y);
    if (b && (b.weirdness ?? 0) >= 0.5) return DENSITY_DANGEROUS; // the verge, the fen — dangerous
    const sites = world.listSites();
    if (sites.some((s) => s.kind === 'dungeon' && cheby(x, y, s.x, s.y) <= 3)) return DENSITY_DANGEROUS;
    if (sites.some((s) => s.kind === 'city' && cheby(x, y, s.x, s.y) <= 4)) return DENSITY_POPULATED;
    return DENSITY_SAFE; // quiet open country / the forgiving start region
  }
  const wanderers = createWanderers({ world, bestiary, names, biomes, seed: (world.seed ^ 0x3a2d) >>> 0, densityFor });

  // E6 — capacity leveling (LOCKED): follower capacity = 2 + unique WORLD milestones,
  // capped at 6. Milestones are EXACTLY {openedGate, ladderRung, clearedBiome} — never
  // kills, never single site-clears, never stats. "Opening a gate is the XP." Opened
  // gates + cleared biomes are world-persistent (carry across permadeath); ladder rungs
  // are the current stranger's (memberships reset on death).
  const CAP_START = 2, CAP_MAX = 6;
  function clearedBiomeCount() {
    const done = new Set(session.clearedSites());
    const sites = world.listSites();
    let n = 0;
    for (const b of biomes.list()) {
      const inB = sites.filter((s) => { const bb = biomes.biomeAt(s.x, s.y); return bb && bb.id === b.id; });
      if (inB.length && inB.every((s) => done.has(s.id))) n += 1; // every site in the biome cleared
    }
    return n;
  }
  const ladderRungCount = () => session.memberships().filter((m) => !String(m).startsWith('bureau:')).length;
  function milestoneCapacity() {
    return Math.min(CAP_MAX, CAP_START + world.openedGateIds().length + clearedBiomeCount() + ladderRungCount());
  }
  function refreshCapacity() { return session.setCapacity(milestoneCapacity()); }
  refreshCapacity(); // seed the capacity from any world state already present (e.g. after a load)

  // F1 — the real targets a rumor can point at: every site, and every UNOPENED gate,
  // with a rough compass word from the party. So "seek the drowned ford, east" lands on
  // a real place the loop cares about (systems finding: rumor → site or gate).
  function dirWord(dx, dy) {
    const ns = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
    const ew = dx < 0 ? 'west' : dx > 0 ? 'east' : '';
    return `${ns}${ew}` || 'close by';
  }
  function talkPointers() {
    const out = [];
    for (const s of world.listSites()) out.push({ id: s.id, name: s.name, dir: dirWord(s.x - party.x, s.y - party.y) });
    for (const g of world.listGates()) if (!world.isGateOpen(g.id)) out.push({ id: g.id, name: g.label, dir: dirWord(g.x - party.x, g.y - party.y) });
    return out;
  }
  function operationBearing() {
    const active = manual.active();
    if (!active || !active.site) return null;
    const pointer = talkPointers().find((p) => p.id === active.site.id);
    return { number: active.number, title: active.title, dir: pointer ? pointer.dir : dirWord(active.site.x - party.x, active.site.y - party.y) };
  }
  wanderers.populate(party.x, party.y);

  // The register engine's live hook: a seeded, [SEED]-marked description of a
  // site, citing a generated region name as its locality. Deterministic per site.
  // The pinned landmark: the Chapel Perilous refuses a single register.
  // Structure Arc slice 1: the manual's final operation is the single source of
  // truth for which site that is (a world's farthest procedural dungeon from
  // spawn — see manual.js) — reliable every world, unlike the id/name regex
  // this used to run alone, which only matched when a site's RANDOMLY
  // templated name (data/register/sites.json) happened to say "Chapel" (kept
  // here as a fallback for the master.json test fixture and any hand-built site).
  function isChapel(site) {
    if (manual.isChapelSite(site)) return true;
    const id = (site && (site.id || '')) + ' ' + (site && (site.name || ''));
    return /chapel/i.test(id);
  }

  function describeSite(site) {
    // A site inside a biome inherits that biome's weirdness (register/vibe
    // channel) — a waystation on the salt flats reads clinical; the Chapel keeps
    // its full-collision pin regardless.
    const biome = biomes.biomeAt(site.x, site.y);
    return prose.describeSite(site, world.seed, {
      loc: names.regionAt(site.x, site.y, world.seed),
      collide: isChapel(site),
      weirdness: biome && !isChapel(site) ? biome.weirdness : undefined,
    });
  }

  // M9 BIOMES (register/vibe channel): the ground-flavor line the party reads
  // while standing in a biome — the register engine, weirdness-scaled by the
  // biome, labelled with the biome's name. Deterministic per (biome, cell).
  function describeBiomeGround(biome, gx, gy) {
    return prose.describeTerrain(stripSeed(biome.name), gx, gy, world.seed, { weirdness: biome.weirdness });
  }

  // M9 BIOMES (events channel): one overworld step's INVISIBLE tail — the rare,
  // genuinely-unfair encounter roll that STAYS beneath the visible wanderers
  // (both-layers lock). It rolls the local biome's table when in a biome (so the
  // tail is biome-flavored) and the generic 'overworld' table in open country.
  // On a quiet step inside a biome it may instead surface a seeded ambient event
  // line (the biome's vibe). Deterministic in (party cell, tick, world seed).
  function overworldStep() {
    const biome = biomes.biomeAt(party.x, party.y);
    // E4: a guaranteed starter cache on a starter-cache tile, once (the forgiving
    // opening's payoff — a reachable find before any dungeon). World-persistent.
    const sc = starterCacheAt(party.x, party.y);
    if (sc && !starterCachesTaken.has(sc.key)) {
      starterCachesTaken.add(sc.key);
      return { enc: { kind: 'cache', artifact: sc.artifact, description: sc.description }, note: '', biome };
    }
    const table = biome && encounters.tables.includes(biome.table) ? biome.table : 'overworld';
    const seed = hashInt(party.x, party.y, (world.seed ^ 0xe0c0de ^ tick) >>> 0);
    let enc = encounters.maybeSeeded(table, seed, { exposure: exposure() });
    // E4: the ambush-tail never rolls inside the safe radius — a fight there is
    // suppressed (placement-only forgiveness; the encounter TABLES are untouched).
    if (enc && enc.kind === 'fight' && nearStart(party.x, party.y)) enc = null;
    let note = '';
    if (!enc && biome) {
      const frags = (biomeRegister.events && biomeRegister.events[biome.id]) || [];
      const r = hashInt(party.y, party.x, (world.seed ^ 0xb10e ^ tick) >>> 0);
      if (frags.length && (r % 100) < 22) {
        note = prose.describeBiomeEvent(biome, frags[r % frags.length], (seed ^ 0x9e) >>> 0);
      }
    }
    return { enc, note, biome };
  }

  // Enter a site: assemble its dungeon (seeded off the site's world coords, so
  // each site is a stable, distinct dungeon) and hand back a first-person crawl
  // plus a generated settlement name. Headless-safe: no DOM.
  // Structure Arc LOCK 1: refuses locked operations (op N needs op N-1 complete).
  function enterSite(site) {
    if (!manual.canEnter(site)) {
      const err = new Error(manual.denyReason(site) || 'enterSite: operation locked');
      err.code = 'OPERATION_LOCKED';
      throw err;
    }
    const dseed = hashInt(site.x | 0, site.y | 0, world.seed ^ 0x0d0e0);
    // Structure Arc slice 1 (LOCK 2): the operation this site is assigned to
    // may carry a hand-authored interior (data/operations.json's
    // authoredLayout); everything else keeps the procedural tile-kit assembly.
    // Positions stay procedural either way — only the INTERIOR is authored.
    const layoutKey = manual.authoredLayoutFor(site);
    const layoutData = layoutKey ? AUTHORED_LAYOUTS[layoutKey] : null;
    let dungeon;
    if (layoutData) {
      dungeon = assembleAuthoredDungeon(layoutData, { seed: dseed });
    } else {
      const cells = 4 + (hashInt(site.x | 0, site.y | 0, world.seed ^ 0x512e) % 3); // 4..6
      dungeon = assembleDungeon(dungeonKit, { seed: dseed, cells });
    }
    const crawl = createCrawl(dungeon);
    const name = names.settlementName(dseed % names.count, mulberry32(dseed));
    // Which encounter table this site draws on. The Chapel (and anything flagged
    // as such) draws on the far more dangerous 'chapel' table; everything else on
    // 'dungeon'. `steps` drives the per-step random-encounter roll.
    const table = pickTable(site);
    // Visible dungeon enemies (M8 §5): a few beings placed in the crawl you can
    // see ahead and confront-or-sneak-past. Seeded off the site so a dungeon
    // always holds the same enemies. Chapel dungeons get one more roadblock.
    // An authored dungeon supplies its own fixed spawn ROOMS (LOCK 2: contents
    // randomize within authored budgets — the OCCUPANT still draws from a pool,
    // per-spawn or the dungeon-habitat fallback); a procedural one keeps the
    // original whole-grid ranked pick, unchanged.
    const life = dungeon.spawnCells
      ? createDungeonLife(dungeon, {
        bestiary, seed: (dseed ^ 0x11fe) >>> 0, max: dungeon.spawnCells().length, cells: dungeon.spawnCells(),
        beingIdFor: (c, fallbackPool) => dungeon.beingIdFor(dungeon.spawnAt(c.cx, c.cy), fallbackPool),
      })
      : createDungeonLife(dungeon, { bestiary, seed: (dseed ^ 0x11fe) >>> 0, max: isChapel(site) ? 4 : 3 });
    // Visual register (M5): stable per dungeon so a site always looks the same.
    // chapel: the pinned landmark → full-collision prose throughout the crawl.
    const minimap = createMinimap(mapState.getDungeon(site));
    minimap.markAround(dungeon, crawl.x, crawl.y);
    minimap.markFeature(dungeon.entrance.x, dungeon.entrance.y, 'stairs', 'out');
    // cp-020: entering a site marks it on the worldmap.
    mapState.knowSite(site);
    return { site, dungeon, crawl, name, table, steps: 0, life, register: styleFor(dseed), chapel: isChapel(site), minimap };
  }

  // Choose an encounter table for a site. Falls back to 'dungeon' when the site's
  // preferred table isn't shipped, so new site kinds never break the crawl.
  // Structure Arc slice 1: routed through isChapel() (manual-driven, with the
  // id/name regex as its own fallback) so the world's ACTUAL Chapel — LOCK 3's
  // final operation — reliably draws the harder 'chapel' table even on a run
  // where its procedurally-templated name doesn't happen to say "Chapel".
  function pickTable(site) {
    const op = manual.operationForSite(site);
    const opTable = op ? `operation_${op.number}` : 'dungeon';
    const pref = isChapel(site) ? 'chapel' : opTable;
    return encounters.tables.includes(pref) ? pref : 'dungeon';
  }

  // The dungeon crawl is the natural random-encounter surface (ENCOUNTERS LOCK).
  // Each step advances a per-run counter and rolls `maybe` on the run's table,
  // keyed deterministically off (dungeon seed, step index) — so a given walk
  // through a given dungeon always meets the same things, yet each step is a
  // fresh roll (no pity, no scaling; the roller never sees party power). Returns
  // the encounter descriptor when one fires, else null.
  function stepEncounter(run) {
    run.steps += 1;
    const seed = hashInt(run.steps, 0, (run.dungeon.seed ^ 0xe0c0de) >>> 0);
    return encounters.maybeSeeded(run.table, seed, { exposure: exposure() });
  }

  // Enter a city site: assemble a denser 2D city (seeded off the site's world
  // coords, so each city is stable + distinct), a top-down stroll starting at
  // its gate, and a generated name. Headless-safe: no DOM.
  function enterCity(site) {
    const cseed = hashInt(site.x | 0, site.y | 0, world.seed ^ 0xc17e);
    const isStartTown = startTown && site.x === startTown.x && site.y === startTown.y;
    const city = assembleCity({ seed: cseed, guarantee: isStartTown ? 'both' : 'one' });
    const stroll = createStroll(city);
    const name = names.settlementName(cseed % names.count, mulberry32(cseed));
    // Town variety (M8 §5): archetype blurb, per-building proprietors, citizens.
    const life = createCityLife(city, { seed: cseed, names, prose, cityRegister });
    const citizens = life.citizens(3 + (hashInt(cseed, 0x1c, world.seed) % 3)); // 3..5 townsfolk
    return { site, city, stroll, name, life, citizens, blurb: life.townBlurb() };
  }

  // Description for a building the stroller has entered (M3 talk hook, M8 variety).
  // The service gives the trade name; the town's citylife gives a proprietor so two
  // same-trade buildings never read identically. Passed a city context for identity.
  function describeBuilding(building, cityCtx = null) {
    const svc = cityRegister.services[building.service] || {};
    const ident = cityCtx && cityCtx.life ? cityCtx.life.identity(building) : null;
    const base = svc.name || building.service;
    const name = ident ? `${base} — kept by ${ident.proprietor}` : base;
    return { service: building.service, name, greeting: svc.greeting || '', identity: ident };
  }

  // Run a building's service interaction against the live session (rest a party,
  // buy a rumor, give the word at a lodge, or shop). Seeded off the building + world.
  // The town's per-building identity line is prepended so interiors read distinctly.
  function enterBuilding(building, cityCtx = null) {
    const seed = hashInt(building.index | 0, 0x5e2, world.seed ^ 0x5e12ce);
    const archetype = cityCtx && cityCtx.city ? cityCtx.city.archetype : 'market';
    const res = services.interact(building, { session, seed, tick, archetype });
    const ident = cityCtx && cityCtx.life ? cityCtx.life.identity(building) : null;
    if (ident) {
      res.name = `${res.name} — kept by ${ident.proprietor}`;
      res.lines = [ident.line, ...res.lines];
    }
    return res;
  }

  // Save/load the run (M4 VIBE): party position + the full session snapshot.
  // Headless + deterministic; the shell persists this to localStorage. Restore
  // returns to the overworld at the saved position (mode state is not saved —
  // you resume on the surface, which is always a valid place to be).
  const SAVE_VERSION = 1;
  function save() {
    return {
      version: SAVE_VERSION, seed: world.seed, party: { x: party.x, y: party.y },
      session: session.serialize(), journal: journal.serialize(), wanderers: wanderers.serialize(),
      events: events.serialize(), gates: world.serializeGates(), starterCaches: [...starterCachesTaken],
      tick, mapState: mapState.serialize(),
    };
  }
  function load(snap) {
    if (!snap || snap.version !== SAVE_VERSION) throw new Error('load: incompatible save');
    if (snap.seed !== world.seed) throw new Error('load: save is from a different world');
    session.restore(snap.session);
    if (snap.journal) journal.restore(snap.journal);
    tick = snap.tick | 0;
    party.moveTo(snap.party.x, snap.party.y);
    world.streamAround(party.x, party.y);
    if (snap.wanderers) wanderers.restore(snap.wanderers); else wanderers.populate(party.x, party.y);
    if (snap.events) events.restore(snap.events); else events.clear(); // old saves: empty log (migration-safe)
    world.restoreGates(snap.gates || []); // world-persistent opened gates (empty on old saves)
    starterCachesTaken.clear(); for (const k of snap.starterCaches || []) starterCachesTaken.add(k);
    mapState.restore(snap.mapState || {}); // old saves: blank map memory (migration-safe)
    refreshCapacity(); // capacity follows the restored world milestones (E6)
    return true;
  }

  // Deterministic [SEED]-marked flavor for the dungeon room the crawler stands
  // in, keyed on its cell + dungeon seed so each chamber reads consistently.
  function describeRoom(run) {
    const cell = run.crawl.cell();
    const c = cell || { cx: 0, cy: 0 };
    return prose.describeTerrain('chamber', c.cx, c.cy, run.dungeon.seed, run.chapel ? { collide: true } : { weirdness: 0.7 });
  }

  return {
    world, party, prose, names, dungeonKit, bestiary, encounters, biomes, chargen, loot, session, services, shop, journal, wanderers, events, logEvent, exposure, bumpTick, get tick() { return tick; },
    start, startTown, START_SAFE_RADIUS, START_CACHE_COUNT, nearStart, starterCaches: () => starterCaches.map((c) => ({ ...c })), densityFor,
    refreshCapacity, milestoneCapacity, social, talkPointers, operationBearing,
    describeSite, describeBiomeGround, overworldStep, enterSite, passable, canEnterSite: (s) => manual.canEnter(s), sitePassable: (s) => manual.passable(s), enterCity, describeBuilding, enterBuilding, describeRoom, stepEncounter, save, load,
    mapState, manual,
  };
}

export function boot() {
  const canvas = document.getElementById('screen');
  const status = document.getElementById('status');
  const ctx = canvas.getContext('2d');
  // The full-window CRPG frame (ADDENDUM 2): the logical backing resolution
  // tracks the window aspect so the composed surface — scene viewport + side HUD
  // panel + bottom console strip — fills the whole window with square pixels, no
  // pillarbox. Recomputed on resize. `frame` is the single layout source of truth.
  let frame = computeFrame(window.innerWidth || 1440, window.innerHeight || 900);
  // World registry: tracks every started world with its seed, auto-name, and save.
  const registry = createWorldRegistry();

  // Mutable game container — reassigned whenever the player switches worlds from
  // the title menu. All boot-level closures read the current `let` bindings,
  // so a world switch does not need to rebuild the whole shell.
  let game, world, party, session, journal, wanderers, biomes, loot, events, logEvent, refreshCapacity, social, talkPointers, describeSite, describeBiomeGround, overworldStep, enterSite, enterCity, describeBuilding, enterBuilding, describeRoom, stepEncounter, shop, manual;
  let activeWorld = null; // current registry record
  let worldSel = 0;       // title-screen cursor
  let confirmDelete = null;

  function makeWorldConfig(seed) {
    return generateWorldConfig(master, {
      seed,
      biomes: biomeData,
      namer: (rng) => NAMES.worldName(rng),
      templates: siteTemplates,
    });
  }

  function initGame(record) {
    activeWorld = record;
    game = createGame(makeWorldConfig(record.seed));
    world = game.world;
    party = game.party;
    session = game.session;
    journal = game.journal;
    wanderers = game.wanderers;
    biomes = game.biomes;
    loot = game.loot;
    events = game.events;
    logEvent = game.logEvent;
    refreshCapacity = game.refreshCapacity;
    social = game.social;
    talkPointers = game.talkPointers;
    describeSite = game.describeSite;
    describeBiomeGround = game.describeBiomeGround;
    overworldStep = game.overworldStep;
    enterSite = game.enterSite;
    enterCity = game.enterCity;
    describeBuilding = game.describeBuilding;
    enterBuilding = game.enterBuilding;
    describeRoom = game.describeRoom;
    stepEncounter = game.stepEncounter;
    shop = game.shop;
    manual = game.manual;
    return game;
  }

  function newWorld() {
    const seed = generateSeed();
    const { registry: nextRecords, record } = registry.add(registry.load(), seed);
    registry.save(nextRecords);
    return initGame(record);
  }

  function continueWorld(record) {
    initGame(record);
    const wrapper = registry.loadWorldSave(record.id);
    if (wrapper && wrapper.save) {
      game.load(wrapper.save);
      if (wrapper.scheme && PALETTE.ids().includes(wrapper.scheme)) SCHEME = wrapper.scheme;
    }
    registry.save(registry.touch(registry.load(), record.id));
  }

  // One-time palette setup (scheme is persisted per-world save).
  PALETTE = createPalettes(palettesData);
  SCHEME = PALETTE.defaultId;

  // Bootstrap the title menu from the registry, migrating any legacy single-slot save.
  registry.migrateLegacy();
  let records = registry.load();
  if (!records.length) {
    const seed = generateSeed();
    const { registry: nextRecords, record } = registry.add(records, seed);
    records = nextRecords;
    registry.save(records);
  }
  initGame(records[0]);
  worldSel = 0;
  const combatProse = createCombatProse(combatRegister); // M11: the in-voice combat surface
  // Audio (Part B): code-synthesised ambient SCORE + SFX. Only wires a real context in
  // a browser that provides one; headless/tests get a silent no-op. Sound starts
  // on the first keypress (autoplay policy). Sidecar masters load separately (see
  // AUDIO-NOTE.md) and are never inlined into the single-file build.
  // The band is seeded off the LIVE world seed — passed as a function because the
  // context is not built until that first gesture, by which point the player may
  // have minted a new world at the title screen.
  const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  const audio = createAudio({
    ctxFactory: AC ? () => new AC() : null,
    seed: () => ((world && world.seed) >>> 0) || 1,
  });
  // Per-world save slots live through the registry; the legacy key is migrated at boot.
  // Map zoom: px per tile on the nav scenes. [+]/[-] step it, so the operator can
  // trade a wider view for chunkier tiles. The scene fits as many tiles as its
  // (responsive) width/height allow at this size, party centred.
  let tilePx = TILE;
  // The prose/register line for the bottom console strip — the charming log
  // (ADDENDUM 3). Each scene renderer sets it; paintConsole draws it.
  let sceneStatus = '';

  // cp-020: mark the current overworld cell + biome as known on the worldmap.
  function markWorldMap() {
    game.mapState.visit(party.x, party.y);
    const b = biomes.biomeAt(party.x, party.y);
    if (b) game.mapState.knowBiome(b.id);
    const g = world.gateAt(party.x, party.y);
    if (g) game.mapState.knowGate(g);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = world.siteAt(party.x + dx, party.y + dy);
      if (s) game.mapState.knowSite(s);
    }
  }

  // cp-019: if we're inside a dungeon, persist its minimap before the world snapshot.
  function stashDungeonMap() {
    if (run && run.minimap && run.site) game.mapState.setDungeon(run.site, run.minimap);
  }

  // mode: 'title' | 'creation' | 'overworld' | 'dungeon' | 'city' | 'building' |
  // 'combat' | 'death'. Title is brand + menu; creation is the dealt stranger.
  let mode = 'title';
  let creationAccepted = false; // confirm accepts the deal; [E] is the distinct embark input
  let crt = true; // CRT scanline/vignette post-pass (M4 VIBE)
  let showHelp = false; // [?] control-reference overlay (M6 INTERFACE), any mode
  let helpPage = 0;     // [?] cycles: 0 controls → 1 the stranger's nature (C4 permanent ref)
  let showInv = false;  // [I] inventory overlay (M10 Part B), any nav mode
  let showLog = false;  // [L] the record — B2 event-log overlay, any nav mode
  let logScroll = 0;    // rows scrolled back from the newest entry
  let showParty = false; // [Y] party-management surface (D3), any nav mode
  let partySel = 0;
  let showNature = false; // C4: the one-time "the stranger's nature" explainer overlay
  let showMinimap = false; // cp-017/cp-019: dungeon minimap toggle
  let showWorldmap = false; // cp-020: worldmap overlay toggle
  // Art-uplift: a monotonic PAINT counter (bumped every render) that gives the
  // torch/lamp light a gentle deterministic breathe as the player takes turns —
  // the game stays turn-based (paints on input), so this varies per paint, not at
  // 60fps. Purely visual; touches no game state.
  let paintPhase = 0;
  let crtBloomCanvas = null;
  let showManual = false; // Structure Arc slice 1 (LOCK 1/2): the questline reader, [H] any nav mode
  let manualScroll = 0;   // wrapped Manual body line at the top of its W/S scroll window
  const NATURE_KEY = 'chp-nature-seen';
  function natureSeen() { try { return !!(typeof localStorage !== 'undefined' && localStorage.getItem(NATURE_KEY)); } catch (_) { return false; } }
  function markNatureSeen() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(NATURE_KEY, '1'); } catch (_) { /* ignore */ } }
  let invSel = 0;       // highlighted pack row
  let toast = '';       // transient global feedback (palette/save/load), any mode
  let run = null;
  /** Reveal the current crawl tile on the run's minimap. Called after every move/turn.
   *  Lives HERE (boot scope, beside `run`) — cp-017 originally defined it inside
   *  createGame, where `run` doesn't exist and onKey can't reach it, which left every
   *  dungeon movement key throwing ReferenceError from 2026-08-03 until 2026-08-06. */
  function refreshMinimap() {
    if (run && run.minimap) exploreCurrent(run);
  }
  let city = null;
  let building = null;
  let encLine = '';   // last encounter surfaced this crawl
  let owNote = '';     // transient overworld note (rest, etc.)
  let cityNote = '';   // transient town conversation/result note
  let combat = null;
  let combatMenu = 'root'; // 'root' | 'talk' | 'item'
  let approaches = [];
  let combatItems = []; // usable combat items when the ITEM submenu is open
  let combatNote = '';
  let beatPanel = null; // C1/C2: a brief framed kill/join beat, held over the scene until the next key
  let combatResolutionPending = false; // final kill/join beat must be seen before leaving combat
  let barterState = null; // F2: an open one-exchange barter offer {subject, want, offer, line}
  let shopState = null; // M12: active shop interior { stock, sellOffer, message, buildingId }
  let sellOverlay = null; // M12: a dealer sell offer overlay { offer[], total }
  let deathInfo = null;
  function refreshCapacityWithFeedback() {
    const before = session.capacity;
    const after = refreshCapacity();
    const line = capacityChangeLine(before, after);
    if (line) toast = line;
    return after;
  }
  // Visible dungeon enemy (M8 §5): the being blocking the current cell while the
  // confront/sneak prompt is up; `pendingDungeonEnemy` is cleared on a won fight.
  let dungeonEnemy = null;
  let pendingDungeonEnemy = null;
  let sneakNote = '';
  // Journal (M7): opened with [J] from the nav modes. `journalWriting` is the
  // compose sub-state; `draft` is the live text; `journalReturn`/`journalPlace`
  // remember where we came from + the note's place-stamp.
  let journalWriting = false;
  let draft = '';
  let journalReturn = 'overworld';
  let journalPlace = '';
  // Journal selection/edit (M7 "write AND edit"): the highlighted entry's id, and
  // — while composing — the id being revised (null = a fresh note). Only the
  // player's own entries are selectable; you cannot edit what you did not write.
  let journalSel = null;
  let journalEditId = null;

  // Compose + size the full-window frame: the backing resolution tracks the
  // window aspect (square pixels when CSS-stretched, image-rendering:pixelated),
  // and the composed surface fills ≥95% of BOTH window dimensions (ADDENDUM 2's
  // gate; see src/engine/frame.js). Called at boot and on every resize.
  const TILE_MIN = 16, TILE_MAX = 64;
  function applyDisplay() {
    const vpW = window.innerWidth || 1440, vpH = window.innerHeight || 900;
    frame = computeFrame(vpW, vpH);
    canvas.width = frame.W;
    canvas.height = frame.H;
    const { cssW, cssH } = frameDisplay(vpW, vpH);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }
  applyDisplay();
  window.addEventListener('resize', () => { applyDisplay(); render(); });

  const text = (txt, x, y, color = '#fff', size = 14) => {
    ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.fillText(txt, x, y);
  };

  // Draw a bust (any bust art id) at (px,py), `size` px square, on a dark panel
  // with a single-hue frame. Falls back silently if the id is unknown.
  function drawBust(id, px, py, size) {
    if (!BUSTS.has(id)) return;
    ctx.fillStyle = shadeColor(0);
    ctx.fillRect(px - 3, py - 3, size + 6, size + 6);
    // Busts get the dither texture too (study: creatures read as stipple-
    // engravings, not flat blocks). Anchored to the bust id so it's stable.
    const grid = BUSTS.get(id);
    let h = 0x9e37; for (let i = 0; i < id.length; i++) h = (Math.imul(h, 131) + id.charCodeAt(i)) >>> 0;
    drawTile(ctx, grid, px, py, size, shadeColor, { wx: 0, wy: 0, seed: h, amp: 0.7, levels: SHADE_LEVELS, sub: 2 });
    ctx.strokeStyle = shadeColor(5);
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 3, py - 3, size + 6, size + 6);
  }

  // Additive phosphor light — the PoC's "light as compositing" ported to the live
  // canvas (torch pools, site glow, encounter back-halos). In a single-hue scheme,
  // additive light in the scheme's HOT tint reads as phosphor bloom climbing the
  // ramp — no separate base-ramp change needed (the design law stays intact).
  // Deliberately restrained by the operator-round bloom caps in lightbudget.js.
  // Pure paint, no state; drawn with 'lighter' so it only ever brightens.
  function addLight(cx, cy, r, intensity, tint) {
    if (!(r > 0) || !(intensity > 0)) return;
    const [gr, gg, gb] = tint || glowTriple();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${gr},${gg},${gb},${intensity})`);
    g.addColorStop(0.25, `rgba(${gr},${gg},${gb},${intensity * 0.56})`);
    g.addColorStop(0.5, `rgba(${gr},${gg},${gb},${intensity * 0.25})`);
    g.addColorStop(0.75, `rgba(${gr},${gg},${gb},${intensity * 0.06})`);
    g.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Ordered-dot tail: the PoC's glow never resolves into a smooth web gradient.
    // Sparse hot pixels carry the final quarter of falloff on the same 8x8 tooth.
    ctx.fillStyle = `rgb(${gr},${gg},${gb})`;
    for (let y = Math.floor(cy - r); y <= cy + r; y += 3) {
      for (let x = Math.floor(cx - r); x <= cx + r; x += 3) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d < 0.58 || d > 1) continue;
        const energy = Math.pow(1 - d, 2) * intensity;
        if (energy * 12 > bayer(x, y)) {
          ctx.globalAlpha = energy;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ctx.restore();
  }

  // Elliptical throw used by the approved dungeon torch. This is the PoC's
  // `pool()` shape: a broad lateral cast, rather than the prior central fog disc.
  function addLightPool(cx, cy, rx, ry, intensity, tint) {
    if (!(rx > 0) || !(ry > 0) || !(intensity > 0)) return;
    const [gr, gg, gb] = tint || glowTriple();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy); ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${gr},${gg},${gb},${intensity})`);
    g.addColorStop(0.25, `rgba(${gr},${gg},${gb},${intensity * 0.56})`);
    g.addColorStop(0.5, `rgba(${gr},${gg},${gb},${intensity * 0.25})`);
    g.addColorStop(0.75, `rgba(${gr},${gg},${gb},${intensity * 0.06})`);
    g.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function shadowPool(cx, cy, rx, ry, alpha = 0.5) {
    ctx.save();
    ctx.fillStyle = '#000';
    for (let y = -Math.ceil(ry); y <= ry; y++) {
      const yn = y / ry, half = rx * Math.sqrt(Math.max(0, 1 - yn * yn));
      ctx.globalAlpha = alpha * (1 - yn * yn);
      ctx.fillRect(cx - half, cy + y, half * 2, 1);
    }
    ctx.restore();
  }
  // Being id behind a foe combatant (strips a "#n" duplicate suffix).
  const foeBustId = (foe) => (foe && foe.ref && foe.ref.id) || String((foe && foe.id) || '').split('#')[0];

  // Map semantic layout colours onto the active palette ramp.
  function paintRows(rows) {
    const map = {
      hue: shadeColor(6),
      dim: shadeColor(3),
      faint: shadeColor(2),
      accent: accentColor(),
    };
    for (const r of rows) {
      ctx.fillStyle = map[r.color] || r.color || '#fff';
      ctx.font = `${r.size}px monospace`;
      ctx.fillText(r.text, r.x, r.y);
    }
  }

  // The keybar mode key: combat's submenus show their own controls.
  function keybarMode() {
    if (mode === 'combat' && combatMenu === 'item') return 'combatItem';
    if (mode === 'combat' && combatMenu === 'talk') return 'combatTalk';
    return mode;
  }

  // Party vitals for the side HUD panel: lead PC name, hp, follower count.
  function partyVitals() {
    const pc = combatHudVitals(session.pc, mode === 'combat' ? combat : null);
    const extra = session.roster.size > 1 ? `  +${session.roster.size - 1}` : '';
    return `⛊ ${pc.name}  ♥ ${pc.hp}/${pc.maxHp}${extra}`;
  }

  // Accent mode-cue for the HUD panel's title — the always-visible "where am I"
  // signal (review item 2). Modes without a cue pass through blank.
  const HUD_CUE = {
    overworld: 'OVERWORLD', dungeon: 'DUNGEON', city: 'CITY',
    building: 'INTERIOR', combat: 'ENCOUNTER', dungeonEnc: 'IN YOUR PATH', death: 'THE THREAD',
    journal: 'JOURNAL', title: '', creation: 'THE STRANGER',
  };

  // ---- full-window frame chrome (ADDENDUM 2) -------------------------------
  // The scene renderers draw the world; these draw the standing side panel and
  // bottom console that make the whole window game surface (no pillarbox).

  // Run `fn` with the origin translated so a logical CANVAS_W×CANVAS_H draw-list
  // (the menu/text modes) sits centred inside the — usually larger — scene region.
  function centered(fn) {
    const s = frame.scene;
    const ox = Math.max(0, Math.round((s.w - CANVAS_W) / 2));
    const oy = Math.max(0, Math.round((s.h - CANVAS_H) / 2));
    // Clip to the scene region: the card fits by construction (MIN_SCENE_W ==
    // CANVAS_W), and the clip guarantees nothing can ever bleed into the side
    // panel or console even if a future card grows (directive §4 belt-and-braces).
    ctx.save();
    ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip();
    ctx.translate(s.x + ox, s.y + oy); fn(); ctx.restore();
  }

  // Word-wrap `str` to lines no wider than maxW at font `size` (register prose
  // for the console strip — never clip a charming line mid-glyph).
  function wrapText(str, maxW, size) {
    const lines = [];
    // Preserve explicit paragraph/feedback breaks. Dungeon obstruction feedback
    // uses this to occupy a deliberate console line instead of being appended to
    // the room description.
    for (const paragraph of String(str).split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (cur && textWidth(next, size) > maxW) { lines.push(cur); cur = w; }
        else cur = next;
      }
      if (cur) lines.push(cur);
    }
    return lines;
  }

  // The place label for the HUD panel's "where" group, per current mode.
  function panelPlace() {
    if (mode === 'overworld') { const h = party.site(); return [`(${party.x},${party.y})`, h ? stripSeed(h.name || h.id || 'a site') : 'the open country']; }
    if (mode === 'dungeon' && run) { const reg = run.register ? stripSeed(run.register.name || '') : ''; return [stripSeed(run.name), reg, `facing ${run.crawl.facing}`].filter(Boolean); }
    if (mode === 'city' && city) return [stripSeed(city.name), `a ${city.city.archetype} town`];
    if (mode === 'building' && building && city) return [stripSeed(city.name), stripSeed(building.name || building.service || '')];
    if (mode === 'combat' && run) return [stripSeed(run.name), `round ${combat ? combat.round : 1}`];
    if (mode === 'journal') return [journalPlace || 'the record', `${journal.count()} of your notes`];
    return ['the thread'];
  }

  // Build the standing HUD panel's groups for the current mode.
  function panelGroups() {
    const groups = [];
    const pc = combatHudVitals(session.pc, mode === 'combat' ? combat : null);
    if (pc) {
      // D1: the stranger, then a row per follower (name + ♥ hp). Capped so a large
      // party never overruns the panel — the party surface (D3, [party]) shows all.
      const lines = [`${stripSeed(pc.name)} · ♥ ${pc.hp}/${pc.maxHp} — you`];
      const followers = session.roster.followers;
      const CAP = 3;
      for (const f of followers.slice(0, CAP)) lines.push(`· ${stripSeed(f.name)} ♥${f.hp}/${f.maxHp}`);
      if (followers.length > CAP) lines.push(`  +${followers.length - CAP} more — [Y] party`);
      groups.push({ heading: `the stranger  (${session.roster.size}/${session.roster.capacity + 1})`, color: 'hue', lines });
    }
    const bearing = game.operationBearing();
    const whereLines = panelPlace();
    if (bearing) whereLines.unshift(`bearing · ${bearing.dir}`);
    if (mode === 'dungeon' || mode === 'dungeonEnc' || (mode === 'combat' && combatReturn === 'dungeon')) {
      const value = game.exposure();
      const hostility = exposureTier(value) + 1;
      whereLines.unshift(`exposure ${Math.round(value * 100)}% · hostility ${['I', 'II', 'III', 'IV'][hostility - 1]}`);
    }
    groups.push({ heading: bearing ? `where · operation ${bearing.number}` : 'where', color: 'dim', lines: whereLines });
    groups.push({ heading: 'the record', color: 'faint', lines: [`deaths ${session.deaths}`, `cleared ${session.clearedSites().length}`] });
    return groups;
  }

  // Draw the persistent right-hand HUD panel (folds the top-strip work into the
  // classic CRPG side column). Backing + hairline seam, then the tested draw-list.
  function paintPanel() {
    const p = frame.panel;
    ctx.save();
    ctx.globalAlpha = 0.92; ctx.fillStyle = shadeColor(0);
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = shadeColor(2); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x + 0.5, p.y); ctx.lineTo(p.x + 0.5, p.y + p.h); ctx.stroke();
    ctx.restore();
    const rows = buildPanel({ cue: HUD_CUE[mode] || '', groups: panelGroups(), width: p.w, height: p.h });
    ctx.save(); ctx.translate(p.x, p.y); paintRows(rows); ctx.restore();
    // M10 A5 + defect sweep 2026-08-04: the legend is bottom-anchored and drawn
    // FIRST so it can never be overlapped by the portrait row. The portrait row
    // then fills the remaining space above the legend. The legend is clamped to
    // stay below a reserved portrait band so it can never bleed into the HUD groups.
    const contentBottom = rows.reduce((m, r) => Math.max(m, r.bandBottom || 0), 0);
    const MIN_PORTRAIT_BAND = 30;
    const legendTop = (mode === 'overworld' || mode === 'city' || mode === 'dungeon')
      ? paintLegend(p, contentBottom + MIN_PORTRAIT_BAND + 4)
      : p.y + p.h;
    // D2: compact portrait strip above the legend; skipped if it would collide.
    paintPortraitRow(p, p.y + contentBottom + 8, legendTop - 4);
  }

  // D2 — the party portrait strip: the PC bust then each follower's, small tiles that
  // wrap within the panel. Skipped if it would collide with the bottom legend band.
  function paintPortraitRow(p, topY, floorY) {
    const pc = session.pc; if (!pc) return topY;
    const size = 22, gap = 5, padX = 10;
    // Keep clear of the bottom legend (estimate) or the panel bottom. The caller
    // can pass an explicit floor; otherwise we reserve the estimated legend band.
    const navMode = mode === 'overworld' || mode === 'city' || mode === 'dungeon';
    const floor = floorY != null ? floorY : p.y + p.h - (navMode ? legendHeight(mode) + 12 : 24);
    if (topY + size > floor) return topY;
    ctx.save();
    ctx.fillStyle = shadeColor(4); ctx.font = '11px monospace';
    ctx.fillText('— party —', p.x + padX, topY - 2);
    let x = p.x + padX, y = topY + 6;
    let bottom = topY + size;
    const busts = [pc.portrait || 'HERO', ...session.roster.followers.map((f) => bustArtId(f.id))];
    for (const id of busts) {
      if (x + size > p.x + p.w - padX) { x = p.x + padX; y += size + gap; }
      if (y + size > floor) { ctx.fillStyle = shadeColor(4); ctx.fillText('…', x, y + size - 4); bottom = y + size; break; }
      drawBust(id, x, y, size);
      bottom = y + size;
      x += size + gap;
    }
    ctx.restore();
    return bottom;
  }

  // The legend items for a mode. Each mode names only what it actually shows;
  // overworld terrain rows do not leak into city streets or the first-person
  // corridor, and dungeon/city get vocabularies matched to their own views.
  function legendItemsFor(mode) {
    if (mode === 'city') {
      return [
        { art: 'PARTY', label: 'you · party' },
        { art: 'WANDERER_NPC', label: 'folk · citizen' },
        { art: 'CITY_STREET', label: 'street · walk' },
        { art: 'CITY_BUILDING', label: 'building · blocked' },
      ];
    }
    if (mode === 'dungeon') {
      return [
        {
          label: 'you · party',
          draw(ctx, x, y, sw, sc) {
            const cx = x + sw / 2, cy = y + sw / 2, r = sw * 0.4;
            ctx.fillStyle = sc(6);
            ctx.beginPath();
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r, cy + r);
            ctx.lineTo(cx - r, cy + r);
            ctx.closePath();
            ctx.fill();
          },
        },
        {
          label: 'stairs/exit',
          draw(ctx, x, y, sw, sc) {
            ctx.fillStyle = sc(6);
            ctx.font = `${sw}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(featureGlyph('stairs'), x + sw / 2, y + sw / 2 + 1);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
          },
        },
        {
          label: 'cache',
          draw(ctx, x, y, sw, sc) {
            ctx.fillStyle = sc(6);
            ctx.font = `${sw}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(featureGlyph('cache'), x + sw / 2, y + sw / 2 + 1);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
          },
        },
        {
          label: 'encounter',
          draw(ctx, x, y, sw, sc) {
            ctx.fillStyle = sc(6);
            ctx.font = `${sw}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(featureGlyph('encounter'), x + sw / 2, y + sw / 2 + 1);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
          },
        },
        {
          label: 'unexplored · fog',
          draw(ctx, x, y, sw, sc) {
            ctx.fillStyle = sc(0);
            ctx.fillRect(x, y, sw, sw);
          },
        },
      ];
    }
    const base = [
      { art: 'PARTY', label: 'you' },
      { art: 'WANDERER_NPC', label: 'folk' },
      { art: 'WANDERER_BEAST', label: 'beast', hostile: true },
      { art: terrainArtId('GRASS'), label: 'ground · walk' },
      { art: terrainArtId('WATER'), label: 'water · blocked' },
      { art: terrainArtId('MOUNT'), label: 'peak · blocked' },
    ];
    if (mode === 'overworld') {
      base.push(
        { art: 'SITE_CITY', label: 'town · enter' },
        { art: 'SITE_DUNGEON', label: 'site · enter' },
        { art: 'SITE_CHAPEL', label: 'the Chapel' },
      );
    }
    return base;
  }
  const LEGEND_HEAD = 14, LEGEND_LH = 14;
  function legendHeight(mode) { return LEGEND_HEAD + legendItemsFor(mode).length * LEGEND_LH + 8; }

  // Draw the bottom-anchored legend inside panel rect `p`. Each row is a 14px
  // swatch (real tile/entity art or a small drawn mark) + a short label.
  function paintLegend(p, topLimit) {
    const items = legendItemsFor(mode);
    const sw = 14, lh = LEGEND_LH, padX = 10;
    const headH = LEGEND_HEAD;
    const blockH = headH + items.length * lh + 8;
    let y = p.y + p.h - blockH;
    const minY = topLimit != null ? topLimit : p.y + 4;
    if (y < minY) return p.y + p.h; // panel too short / would overlap HUD — skip rather than bleed
    ctx.save();
    // faint divider above the legend
    ctx.strokeStyle = shadeColor(2); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x + padX, y - 4.5); ctx.lineTo(p.x + p.w - padX, y - 4.5); ctx.stroke();
    ctx.fillStyle = shadeColor(4); ctx.font = '11px monospace';
    ctx.fillText('— legend —', p.x + padX, y + 12);
    y += headH;
    for (const it of items) {
      if (it.draw) it.draw(ctx, p.x + padX, y, sw, shadeColor);
      else drawTile(ctx, TILE_ART.get(it.art), p.x + padX, y, sw, shadeColor);
      ctx.fillStyle = shadeColor(it.hostile ? 6 : 5); ctx.font = '11px monospace';
      ctx.fillText(it.label, p.x + padX + sw + 8, y + sw - 3);
      y += lh;
    }
    ctx.restore();
  }

  // Draw the bottom console strip: the charming register/prose line up top, the
  // mode keybar beneath it (one framing vocabulary, every mode). Both live inside
  // the console region so nothing spills into the scene or the panel.
  function paintConsole() {
    const con = frame.console;
    ctx.save();
    ctx.globalAlpha = 0.94; ctx.fillStyle = shadeColor(0);
    ctx.fillRect(con.x, con.y, con.w, con.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = shadeColor(2); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(con.x, con.y + 0.5); ctx.lineTo(con.x + con.w, con.y + 0.5); ctx.stroke();
    ctx.restore();
    // keybar first: it anchors the bottom; the prose fills the space above it.
    const kb = buildKeybar(keybarMode(), { width: con.w, height: con.h });
    const kbTop = kb.length ? Math.min(...kb.map((r) => r.bandTop)) : con.h;
    ctx.save(); ctx.translate(con.x, con.y); paintRows(kb); ctx.restore();
    // prose line(s), the log's charm (ADDENDUM 3) — wrapped into the space left.
    if (sceneStatus) {
      // Art-uplift (operator note 3): larger log type in the taller console for
      // readability (13/17 → 16/22).
      const size = 16, lh = 22, padX = 16, padTop = 12;
      const maxLines = Math.max(1, Math.floor((kbTop - padTop) / lh));
      const lines = wrapText(stripSeed(sceneStatus), con.w - padX * 2, size).slice(0, maxLines);
      ctx.save();
      ctx.fillStyle = shadeColor(5); ctx.font = `${size}px monospace`;
      lines.forEach((ln, i) => ctx.fillText(ln, con.x + padX, con.y + padTop + (i + 1) * lh - 4));
      ctx.restore();
    }
  }

  // Approved-PoC panel chrome: nested low-value frames, a hot hairline on each
  // panel's upper edge, and a two-step outer bezel. Layout/content stay live-game
  // specific; this ports the mockup's framing vocabulary and value hierarchy.
  function paintFrameChrome() {
    const s = frame.scene, p = frame.panel, con = frame.console;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = shadeColor(1); ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
    ctx.strokeStyle = shadeColor(3); ctx.strokeRect(3.5, 3.5, canvas.width - 7, canvas.height - 7);
    for (const box of [s, p, con]) {
      ctx.strokeStyle = shadeColor(1); ctx.strokeRect(box.x + 1.5, box.y + 1.5, box.w - 3, box.h - 3);
      ctx.strokeStyle = shadeColor(3); ctx.strokeRect(box.x + 3.5, box.y + 3.5, box.w - 7, box.h - 7);
      ctx.globalAlpha = 0.12; ctx.strokeStyle = shadeColor(6);
      ctx.beginPath(); ctx.moveTo(box.x + 5, box.y + 5.5); ctx.lineTo(box.x + box.w - 5, box.y + 5.5); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // A brief centred toast for global feedback (palette change, save/load) that
  // works in EVERY mode — the same confirmation vocabulary everywhere.
  function paintToast() {
    if (!toast) return;
    ctx.save();
    ctx.font = '13px monospace';
    const w = ctx.measureText(toast).width + 24;
    const x = Math.round((canvas.width - w) / 2), y = Math.round(frame.scene.h * 0.5) - 16;
    ctx.globalAlpha = 0.85; ctx.fillStyle = shadeColor(0);
    ctx.fillRect(x, y, w, 30);
    ctx.globalAlpha = 1; ctx.strokeStyle = accentColor(); ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, 30);
    ctx.fillStyle = shadeColor(6);
    ctx.fillText(toast, x + 12, y + 20);
    ctx.restore();
  }

  // The [?] control reference: a framed panel over a dimmed FULL window, centred
  // (the overlay is a logical CANVAS_W×CANVAS_H card). Drawn last, any mode.
  function paintHelp() {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = shadeColor(0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const ox = Math.max(0, Math.round((canvas.width - CANVAS_W) / 2));
    const oy = Math.max(0, Math.round((canvas.height - CANVAS_H) / 2));
    ctx.translate(ox, oy);
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    paintRows(helpPage === 1 ? buildNatureDrawList({ reference: true }) : buildHelpOverlay());
    ctx.restore();
  }

  // C4 — the one-time "the stranger's nature" explainer (framed, dimmed, centred like
  // [?]/[I]). Captures input while up; any key takes it up and marks it seen forever.
  function paintNature() {
    ctx.save();
    ctx.globalAlpha = 0.92; ctx.fillStyle = shadeColor(0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const ox = Math.max(0, Math.round((canvas.width - CANVAS_W) / 2));
    const oy = Math.max(0, Math.round((canvas.height - CANVAS_H) / 2));
    ctx.translate(ox, oy);
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    paintRows(buildNatureDrawList());
    ctx.restore();
  }

  // cp-020: the worldmap overlay, drawn as a centred card over the current scene.
  function paintWorldmap() {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = shadeColor(0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const ox = Math.max(0, Math.round((canvas.width - CANVAS_W) / 2));
    const oy = Math.max(0, Math.round((canvas.height - CANVAS_H) / 2));
    ctx.translate(ox, oy);
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    renderWorldmap();
    paintWorldmapLegend();
    ctx.fillStyle = shadeColor(4); ctx.font = '12px monospace';
    ctx.fillText('[U]/[Esc] close', 28, CANVAS_H - 24);
    ctx.restore();
  }

  function paintWorldmapLegend() {
    const items = [
      ['●', 'you', true], [siteGlyph('city'), 'town'], [siteGlyph('dungeon'), 'site'],
      ['▫', 'gate shut'], ['▫', 'gate open', true], ['·', 'route'],
    ];
    const cols = 3, colW = 122, x0 = 28, y0 = CANVAS_H - 66;
    ctx.fillStyle = shadeColor(4); ctx.font = '11px monospace';
    ctx.fillText('— legend —', x0, y0 - 8);
    for (let i = 0; i < items.length; i++) {
      const [glyph, label, accented] = items[i];
      const x = x0 + (i % cols) * colW;
      const y = y0 + Math.floor(i / cols) * 16;
      ctx.fillStyle = accented ? accentColor() : shadeColor(6);
      ctx.fillText(glyph, x, y);
      ctx.fillStyle = shadeColor(5);
      ctx.fillText(label, x + 16, y);
    }
  }

  // Structure Arc slice 1 (LOCK 1/2) — the manual overlay: current/completed
  // operation state and the active operation's pointer (which dungeon, what it
  // teaches). Read-only, same framed-card vocabulary as [U]/[Y]/[L]. Status also
  // gates entry: locked operations refuse enterSite (manual.canEnter).
  function manualRows() {
    return manual.list().map((op) => ({
      number: op.number,
      title: op.title,
      teaches: op.teaches,
      status: op.status,
      siteLabel: op.site ? (op.site.name || op.site.id) : '',
    }));
  }
  function currentManualPage() {
    return buildManualPage({
      operations: manualRows(), introBeats: manual.introBeats, scroll: manualScroll,
    });
  }
  function paintManual() {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = shadeColor(0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const ox = Math.max(0, Math.round((canvas.width - CANVAS_W) / 2));
    const oy = Math.max(0, Math.round((canvas.height - CANVAS_H) / 2));
    ctx.translate(ox, oy);
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    const page = currentManualPage();
    manualScroll = page.scroll; // clamp after completion-state/content changes
    paintRows(page.rows);
    ctx.fillStyle = shadeColor(4); ctx.font = '12px monospace';
    const up = page.canScrollUp ? '↑' : '·';
    const down = page.canScrollDown ? '↓' : '·';
    ctx.fillText(`${up}${down} [W]/[S] scroll   [H]/[Esc] close`, 28, CANVAS_H - 24);
    ctx.restore();
  }

  // The [I] inventory overlay (Part B): the pack, with the equipped weapon at top
  // and each item on a row. [W]/[S] highlight, [E] equips a weapon, [X] drops the
  // highlighted item, [I]/[Esc] closes. Captures input while open (like [?] help).
  function paintInventory() {
    const items = session.items();
    if (invSel >= items.length) invSel = Math.max(0, items.length - 1);
    ctx.save();
    ctx.globalAlpha = 0.92; ctx.fillStyle = shadeColor(0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const ox = Math.max(0, Math.round((canvas.width - CANVAS_W) / 2));
    const oy = Math.max(0, Math.round((canvas.height - CANVAS_H) / 2));
    ctx.translate(ox, oy);
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    const pc = session.pc;
    let y = 40;
    ctx.fillStyle = shadeColor(6); ctx.font = '18px monospace';
    ctx.fillText('— the pack —', 28, y); y += 30;
    ctx.fillStyle = shadeColor(5); ctx.font = '13px monospace';
    ctx.fillText(`wielding: ${stripSeed((pc.weapon && pc.weapon.name) || 'bare hands')}  [${pc.weapon ? pc.weapon.dmg.join('–') : '1–3'}]`, 28, y);
    y += 26;
    if (!items.length) {
      ctx.fillStyle = shadeColor(4); ctx.font = '13px monospace';
      ctx.fillText('empty — you carry only what you were dealt.', 28, y);
    } else {
      ctx.font = '13px monospace';
      items.forEach((it, i) => {
        const sel = i === invSel;
        ctx.fillStyle = shadeColor(sel ? 6 : 4);
        const tag = it.kind === 'weapon' ? `[${it.weapon.dmg.join('–')}]` : (it.kind === 'relic' ? '✦' : '·');
        ctx.fillText(`${sel ? '▸ ' : '  '}${stripSeed(it.name)}  ${tag}`, 28, y);
        y += 20;
      });
    }
    y += 14;
    ctx.fillStyle = shadeColor(4); ctx.font = '12px monospace';
    ctx.fillText('[W]/[S] pick   [E] equip   [U] use   [X] drop   [I]/[Esc] close', 28, y);
    ctx.restore();
  }

  // D3 — the party-management surface ([Y]): each follower's portrait, HP, and want;
  // [W]/[S] select, [X] dismisses the highlighted one (roster.dismiss), [Y]/[Esc] close.
  function paintParty() {
    const followers = session.roster.followers;
    if (partySel >= followers.length) partySel = Math.max(0, followers.length - 1);
    ctx.save();
    ctx.globalAlpha = 0.92; ctx.fillStyle = shadeColor(0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const ox = Math.max(0, Math.round((canvas.width - CANVAS_W) / 2));
    const oy = Math.max(0, Math.round((canvas.height - CANVAS_H) / 2));
    ctx.translate(ox, oy);
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    const rows = buildPartyDrawList({ pc: session.pc, followers, sel: partySel });
    paintRows(rows);
    // Portraits beside their rows: match a row by its y-band. PC row first, then each
    // follower's first (name) row. Drawn to the left margin gutter the layout reserved.
    const tile = 22;
    const nameRows = rows.filter((r) => /♥/.test(r.text));
    nameRows.forEach((r, i) => {
      const id = i === 0 ? (session.pc.portrait || 'HERO') : bustArtId(followers[i - 1].id);
      drawBust(id, CANVAS_W - 44, r.bandTop - 2, tile);
    });
    ctx.restore();
  }

  // The record ([L]) — B2 event-log overlay. Shows the last entries as in-register
  // prose (the outcome lines), newest at the bottom, scrollable. Seeds/tick are the
  // dump's business (ADDENDUM #8) and never appear here. Mirrors the [I]/[?] overlays.
  const LOG_GLYPH = { combat: '⚔', encounter: '‼', death: '☠', rest: '⛺', cache: '⚑', ambient: '~', contact: '·', building: '⌂' };
  function paintEventLog() {
    ctx.save();
    ctx.globalAlpha = 0.92; ctx.fillStyle = shadeColor(0);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const ox = Math.max(0, Math.round((canvas.width - CANVAS_W) / 2));
    const oy = Math.max(0, Math.round((canvas.height - CANVAS_H) / 2));
    ctx.translate(ox, oy);
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);
    let y = 40;
    ctx.fillStyle = shadeColor(6); ctx.font = '18px monospace';
    ctx.fillText('— the record —', 28, y); y += 28;
    const all = events.entries();
    const WINDOW = 14;
    if (!all.length) {
      ctx.fillStyle = shadeColor(4); ctx.font = '13px monospace';
      ctx.fillText('nothing has happened yet that the record kept.', 28, y);
    } else {
      // Clamp scroll to the buffer, then take the WINDOW ending `logScroll` from newest.
      const maxScroll = Math.max(0, all.length - 1);
      const back = Math.min(logScroll, maxScroll);
      const end = all.length - back;
      const start = Math.max(0, end - WINDOW);
      ctx.font = '13px monospace';
      for (const en of all.slice(start, end)) {
        const g = LOG_GLYPH[en.kind] || '·';
        const line = `${g} ${stripSeed(en.outcome) || en.kind}`;
        ctx.fillStyle = shadeColor(en.kind === 'death' ? 6 : 5);
        ctx.fillText(line.length > 52 ? `${line.slice(0, 51)}…` : line, 28, y);
        y += 19;
      }
    }
    y = CANVAS_H - 28;
    ctx.fillStyle = shadeColor(4); ctx.font = '12px monospace';
    ctx.fillText('[W]/[S] scroll   [C] copy   [Shift+L] dump json   [L]/[Esc] close', 28, y);
    ctx.restore();
  }
  // cp-018: copy the chronicle to the clipboard as plain text; falls back to a toast.
  function copyEventLog() {
    const text = events.toText();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text);
        toast = 'record copied';
      } else {
        toast = `record: ${events.size} lines`;
      }
    } catch (_) { toast = 'the record would not copy'; }
    return text;
  }
  // B3: serialize the full buffer (WITH seeds/tick — the diagnostic detail) to JSON.
  // In a browser this triggers a download; headless it just toasts the count. Never throws.
  function dumpEventLog() {
    const payload = JSON.stringify({ world: world.seed, tick: game.tick, events: events.entries() }, null, 2);
    try {
      if (typeof document !== 'undefined' && typeof document.createElement === 'function'
          && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `chapel-record-${world.seed}.json`;
        a.click();
        if (URL.revokeObjectURL) URL.revokeObjectURL(url);
        toast = `record dumped — ${events.size} entries`;
      } else {
        toast = `record: ${events.size} entries`;
      }
    } catch (_) { toast = 'the record would not dump'; }
    return payload;
  }

  // C1/C2 — a brief framed BEAT over the current scene (the centered() idiom death
  // uses, not a popup): a kill or a join, one register line, held until the next key.
  function paintBeat() {
    if (!beatPanel) return;
    ctx.save();
    const w = Math.min(CANVAS_W - 40, 380), h = 92;
    const x = Math.round((canvas.width - w) / 2), y = Math.round(canvas.height / 2 - h / 2);
    ctx.globalAlpha = 0.88; ctx.fillStyle = shadeColor(0); ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = shadeColor(6); ctx.font = '15px monospace';
    ctx.fillText(stripSeed(beatPanel.title || ''), x + w / 2, y + 32);
    ctx.fillStyle = shadeColor(5); ctx.font = '13px monospace';
    let ly = y + 58;
    for (const l of (beatPanel.lines || [])) { ctx.fillText(stripSeed(l), x + w / 2, ly); ly += 20; }
    ctx.textAlign = 'left';
    ctx.restore();
  }
  // F1 — a being adjacent to the party we can talk to (any of the 8 neighbours).
  function adjacentWanderer() {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const w = wanderers.at(party.x + dx, party.y + dy);
      if (w) return w;
    }
    return null;
  }
  function focusedCitizen() {
    if (!city) return null;
    const { x, y } = city.stroll;
    for (const [dx, dy] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const citizen = (city.citizens || []).find((p) => p.x === x + dx && p.y === y + dy);
      if (citizen) return citizen;
    }
    return null;
  }
  function setSocialNote(line) {
    if (mode === 'city') cityNote = stripSeed(line);
    else owNote = stripSeed(line);
  }
  // F1/F2 — open a talk against an adjacent being; resolve the fixed outcome table and
  // act on it (barter opens the exchange overlay; joinable recruits; the rest voice a
  // register line). Logged (Part B). Beasts talk as their being (recruitable/want);
  // NPCs as a name (never joinable, want seeded from the trade tags).
  function openSocialTalk() {
    const inCity = mode === 'city';
    const w = inCity ? focusedCitizen() : adjacentWanderer();
    if (!w) { setSocialNote('[SEED] no one answers'); render(); return; }
    const subject = (!inCity && w.kind === 'beast' && w.beingId && game.bestiary.has(w.beingId)) ? game.bestiary.get(w.beingId) : { name: w.name, recruitable: false };
    const seed = hashInt(w.x | 0, w.y | 0, (world.seed ^ 0x50c1a1 ^ game.tick) >>> 0);
    const res = social.resolveTalk(subject, session.pc, { seed, capacityOpen: !session.roster.full, pointers: talkPointers() });
    // The record overlay consumes `outcome`; store the resolved prose, not the
    // internal outcome class, so a conversation remains visible after its console beat.
    logEvent('talk', { mode, seed, outcome: res.line });
    if (res.class === 'barter') {
      barterState = { subject, want: res.want, offer: res.offer, line: res.line };
      setSocialNote(res.line);
      render(); return;
    }
    if (res.class === 'joinable') {
      const r = session.roster.recruit(subject);
      if (r.ok) {
        beatPanel = { title: `${stripSeed(subject.name)} joins you`, lines: [social.joinLine(subject, seed)] };
        wanderers.take(w.x, w.y);
        setSocialNote('');
      } else {
        setSocialNote(social.refuseLine(subject, seed));
      }
      render(); return;
    }
    setSocialNote(res.line);
    render(); return;
  }
  // M12 — the dealer sell-offer overlay: 1-3 of your items quoted in grey coins.
  function paintSellOffer() {
    if (!sellOverlay) return;
    ctx.save();
    const w = Math.min(CANVAS_W - 40, 420), h = 128 + Math.min(3, sellOverlay.offer.length) * 22;
    const x = Math.round((canvas.width - w) / 2), y = Math.round(canvas.height / 2 - h / 2);
    ctx.globalAlpha = 0.95; ctx.fillStyle = shadeColor(0);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = shadeColor(6); ctx.font = '15px monospace';
    ctx.fillText('— the dealer offers —', x + w / 2, y + 26);
    ctx.fillStyle = shadeColor(5); ctx.font = '13px monospace';
    const itemsStr = sellOverlay.offer.map((o) => `${stripSeed(o.item.name)} (${o.amount})`).join(', ');
    const fit = stripSeed(shopRegister.sell_offer_line || '[SEED] the dealer will give ${amount} grey coins for ${items}')
      .replace('${amount}', sellOverlay.total).replace('${items}', itemsStr);
    ctx.fillText(fit, x + w / 2, y + 54);
    ctx.fillStyle = shadeColor(4); ctx.font = '12px monospace';
    ctx.fillText('[Enter] sell    [Esc] keep your things', x + w / 2, y + 80 + Math.min(3, sellOverlay.offer.length) * 22);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // F2 — the one-exchange barter overlay: the being wants one tag, offers one item.
  function paintBarter() {
    if (!barterState) return;
    ctx.save();
    const w = Math.min(CANVAS_W - 40, 400), h = 128;
    const x = Math.round((canvas.width - w) / 2), y = Math.round(canvas.height / 2 - h / 2);
    ctx.globalAlpha = 0.92; ctx.fillStyle = shadeColor(0); ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = shadeColor(5); ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = shadeColor(6); ctx.font = '15px monospace';
    ctx.fillText('— a trade —', x + w / 2, y + 26);
    ctx.fillStyle = shadeColor(5); ctx.font = '13px monospace';
    const has = session.items().some((it) => (it.tags || []).includes(barterState.want));
    ctx.fillText(`it wants: ${barterState.want}${has ? '' : ' (you have none)'}`, x + w / 2, y + 54);
    ctx.fillText(`it offers: ${stripSeed(barterState.offer.name)}`, x + w / 2, y + 76);
    ctx.fillStyle = shadeColor(4); ctx.font = '12px monospace';
    ctx.fillText('[Enter] trade    [Esc] keep your things', x + w / 2, y + 104);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // The felled foe combatant (by name) so we can class its kill beat off its being ref.
  function deadFoeRef(name) {
    const key = stripSeed(name);
    const c = combat && combat.combatants.find((x) => x.side === 'foe' && !x.alive && stripSeed(x.name) === key);
    return c ? c.ref : null;
  }
  function setKillBeat(name) {
    const cls = combatProse.classOf(deadFoeRef(name));
    beatPanel = { title: `${stripSeed(name)} falls`, lines: [combatProse.killLine(cls, proseSeed('kill'))] };
  }
  function setJoinBeat(follower) {
    if (!follower) return;
    const cls = combatProse.classOf(follower.being);
    beatPanel = { title: `${stripSeed(follower.name)} joins you`, lines: [combatProse.joinLine(cls, proseSeed('join'))] };
  }

  // One-line summary of a rolled encounter for the status bar.
  function encSummary(enc) {
    if (!enc) return '';
    if (enc.kind === 'cache') return `⚑ ${enc.description || enc.artifact}`;
    if (enc.kind === 'fight') {
      const who = enc.foes.map((f) => f.name).join(', ');
      return `${enc.unfair ? '‼ ' : '⚔ '}${who}`;
    }
    return '';
  }

  // Part B: a cache is no longer flavor-only — its named artifact is COLLECTED into
  // the pack as a relic. Returns the line to show (with an "into the pack" tag so
  // the player knows they picked it up). Idempotent per resolution (the caller only
  // calls it once, when the cache surfaces).
  function collectCache(enc) {
    if (!enc || enc.kind !== 'cache') return encSummary(enc);
    session.addItem(loot.fromCache(enc.artifact, enc.description || enc.artifact));
    audio.sfx('cache');
    return `${encSummary(enc)} — into the pack`;
  }

  // --- combat orchestration (fight / talk / flee, per M2) --------------------
  let combatReturn = 'dungeon'; // where endCombat returns on a non-death outcome
  let combatSeedUsed = 0;       // the seed that drove the current fight (event log)
  function beginCombat(enc, seed = null, origin = 'dungeon') {
    const cseed = seed != null ? (seed >>> 0) : hashInt(run.steps, 0x5, (run.dungeon.seed ^ 0xc0ffee) >>> 0);
    combatReturn = origin;
    combatSeedUsed = cseed;
    combat = session.startCombat(enc, cseed, { narrate: combatNarrate, targeting: combatRegister.targeting });
    combatRoundsLogged = 0; // cp-018: fresh fight, fresh round log
    const foeNames = (enc.foes || []).map((f) => stripSeed(f.name || f.beingId || 'a foe')).join(', ');
    logEvent('encounter', { mode: origin, seed: cseed, outcome: `${enc.unfair ? 'unfair ' : ''}fight vs ${foeNames || 'foes'}` });
    combatMenu = 'root'; approaches = []; combatItems = []; combatNote = '';
    combatResolutionPending = false;
    audio.sfx('encounter');
    autoFoeTurns();
    logCombatRounds(); // cp-018: record any opening foe turns
    mode = 'combat';
  }

  // A contact with a visible overworld wanderer (M8 §5). A beast drops into a
  // mundane single-foe fight (still fight/talk/flee); an NPC just greets and
  // passes (the social layer is banked). Returns true if it entered combat.
  function overworldContact(m) {
    if (!m) return false;
    if (m.kind === 'beast') {
      const enc = wanderers.encounterFor(m);
      const seed = hashInt(m.x | 0, m.y | 0, (world.seed ^ 0x0ffee ^ game.tick) >>> 0);
      beginCombat(enc, seed, 'overworld');
      return true;
    }
    const g = register.npc_greetings || ['[SEED] nods and walks on.'];
    const pick = g[hashInt(m.x | 0, m.y | 0, world.seed) % g.length];
    owNote = `${stripSeed(m.name)} ${stripSeed(pick)}`;
    logEvent('contact', { mode: 'overworld', outcome: `met ${stripSeed(m.name)}` });
    return false;
  }
  function autoFoeTurns() {
    let g = 0;
    while (!combat.over && combat.active() && combat.active().side === 'foe' && g++ < 200) combat.take();
  }
  function afterPlayerAction({ guardFrom = null, guardId = null } = {}) {
    logCombatRounds(); // cp-018: record the player's round and any foe rounds before resolving
    if (!combat.over) autoFoeTurns();
    logCombatRounds(); // cp-018: record any trailing foe turns
    if (guardFrom != null && combat) {
      const hits = combat.rounds.slice(guardFrom).filter((r) => r.action === 'attack' && r.target && r.target.id === guardId);
      if (hits.length) {
        const blocked = hits.reduce((n, r) => n + (r.absorbed || 0), 0);
        const last = hits[hits.length - 1];
        const flavor = hits.find((r) => r.flavor)?.flavor || 'guard';
        const result = blocked > 0 ? `${flavor} turns ${blocked} aside` : `${flavor} breaks`;
        combatNote = `${combatNote} · ${result} · ♥ ${last.hpAfter}/${last.maxHp}`;
      }
    }
    // A final kill/recruit used to call endCombat here, changing mode before render();
    // paintBeat therefore appeared over the world/dungeon scene. Keep the resolved
    // combat frame alive for one input beat, then return from onKey().
    if (combat.over && beatPanel) combatResolutionPending = true;
    else if (combat.over) endCombat();
    render();
  }
  // Seed for a per-action in-voice beat/banner (deterministic per fight + round + verb).
  function proseSeed(verb) {
    return hashInt(combat ? combat.round : 0, strHash(verb), (world.seed ^ 0xc0b) >>> 0);
  }
  // ATTACK — commit a blow at the lead foe, with the kill beat (A7) preserved.
  function combatAttack() {
    const foe = combat.living('foe')[0];
    const before = combat.fallenFoes.length;
    if (foe) combat.take({ type: 'fight', target: foe.id });
    const fell = combat.fallenFoes.slice(before);
    if (fell.length) { audio.sfx('kill'); setKillBeat(fell[fell.length - 1]); if (!combat.over) combatNote = `✖ ${stripSeed(fell[fell.length - 1])} falls — one fewer pattern`; }
    else combatNote = stripSeed(combatProse.beat('attack', proseSeed('attack')));
    afterPlayerAction();
  }
  // DEFENSE — one adaptive verb; the engine reads the matchup for dodge/avoid/absorb.
  function combatDefend() {
    const guardId = combat.active() && combat.active().id;
    const guardFrom = combat.rounds.length;
    combat.take({ type: 'defend' });
    combatNote = stripSeed(combatProse.beat('defend', proseSeed('defend')));
    afterPlayerAction({ guardFrom, guardId });
  }
  // SUBTERFUGE — the environment-keyed gambit; context comes from the current biome.
  function combatSubterfuge() {
    if (combat.subterfugeSpent) { combatNote = stripSeed(combatProse.outcome('subterfuge-spent', proseSeed('sub'))); render(); return; }
    const biome = combatBiomeId();
    const ctx = subterfugeContext(combatRegister, { biome }, proseSeed('sub'));
    combat.take({ type: 'subterfuge', context: ctx });
    combatNote = stripSeed(combatProse.beat('subterfuge', proseSeed('subterfuge')));
    afterPlayerAction();
  }
  function combatFlee() {
    combat.take({ type: 'flee' });
    combatNote = stripSeed(combatProse.beat('flee', proseSeed('flee')));
    afterPlayerAction();
  }
  // TALK — two-layer model: greyed once blows land (except talk-capable beings).
  function openTalk() {
    const foe = combat.living('foe')[0];
    if (!combat.canTalk(foe && foe.id)) {
      combatNote = stripSeed(combatProse.outcome(combat.engaged ? 'talk-hardened' : 'talk-hardened', proseSeed('talk')));
      render(); return;
    }
    approaches = combat.approaches(foe && foe.id);
    if (!approaches.length) { combatNote = stripSeed(combatProse.outcome('talk-hardened', proseSeed('talk'))); render(); return; }
    combatMenu = 'talk'; combatNote = ''; render();
  }
  // A4: the register-voiced negotiation outcome line — distinct per class (recruit /
  // parley / verb-unavailable), NO shared fallback. Used both to voice the engine's
  // combat log (threaded via startCombat) and to hold the outcome in combatNote so it
  // persists a beat instead of flashing and being overwritten by the next render.
  function talkOutcomeLine(event, foe, verb) {
    const key = event === 'recruit' ? 'recruit' : event === 'verb-unavailable' ? 'verb_unavailable' : 'parley';
    const name = foe ? stripSeed(foe.name) : '';
    const line = stripSeed(combatProse.outcome(key, proseSeed('talk')));
    return name ? `${name} — ${line}` : line;
  }
  function combatNarrate(event, ctx) {
    return talkOutcomeLine(event, ctx && ctx.foe, ctx && ctx.verb);
  }
  function setTalkBeat(foe, verb, outcomeKey) {
    const cls = combatProse.classOf(foe && foe.ref);
    const approachLine = stripSeed(combatProse.approach(verb, proseSeed(verb)));
    const responseLine = stripSeed(combatProse.response(outcomeKey, cls, proseSeed(verb)));
    beatPanel = { title: stripSeed(foe && foe.name) || 'PARLEY', lines: [approachLine, responseLine] };
  }
  function talkPick(i) {
    const a = approaches[i];
    if (!a) return;
    const foe = combat.living('foe')[0];
    const res = combat.take({ type: 'talk', target: foe && foe.id, verb: a.verb });
    combatMenu = 'root'; approaches = [];
    // A verb that didn't bite consumes no turn: paint a two-line refusal exchange.
    if (res && !res.ok && res.event === 'verb-unavailable') {
      setTalkBeat(foe, a.verb, 'verb-unavailable');
      render(); return;
    }
    // Recruit / parley: paint a two-line exchange. A recruit also keeps the existing
    // join beat, so the exchange is shown in the combat note area while the join panel
    // holds the screen until the player acknowledges it.
    if (res && res.event === 'recruit') {
      const cls = combatProse.classOf(foe && foe.ref);
      const approachLine = stripSeed(combatProse.approach(a.verb, proseSeed(a.verb)));
      const responseLine = stripSeed(combatProse.response('recruit', cls, proseSeed(a.verb)));
      combatNote = [approachLine, responseLine];
      const rec = combat.recruited; setJoinBeat(rec[rec.length - 1]);
      afterPlayerAction();
      return;
    }
    setTalkBeat(foe, a.verb, 'parley');
    afterPlayerAction();
  }
  // ITEM — the combat pack: items carrying a combat effect (consumable or an arcane
  // rite behind its GNOSIS gate). Opens the submenu; picking one runs it through combat.
  function usableCombatItems() {
    return session.items()
      .map((it) => ({ it, norm: normalizeItem(it) }))
      .filter((x) => combatEffect(x.norm) != null)
      .map((x) => ({ uid: x.it.uid, label: x.it.name, item: x.norm }));
  }
  function openItem() {
    combatItems = usableCombatItems();
    combatMenu = 'item'; combatNote = ''; render();
  }
  function itemPick(i) {
    const choice = combatItems[i];
    if (!choice) return;
    const before = combat.fallenFoes.length;
    const res = combat.take({ type: 'item', item: choice.item });
    if (res && res.event === 'item-fumble') combatNote = stripSeed(combatProse.outcome('item-fumble', proseSeed('item')));
    else {
      combatNote = stripSeed(combatProse.beat('item', proseSeed('item')));
      if (res && res.consumed && res.consumed.spent) session.consumeItem(res.consumed.uid);
    }
    const fell = combat.fallenFoes.slice(before);
    if (fell.length) { audio.sfx('kill'); setKillBeat(fell[fell.length - 1]); if (!combat.over) combatNote = `✖ ${stripSeed(fell[fell.length - 1])} falls — one fewer pattern`; }
    combatMenu = 'root'; combatItems = [];
    afterPlayerAction();
  }
  // The biome under the party when a combat begins (open country → null → the default).
  function combatBiomeId() {
    const b = biomes.biomeAt(party.x, party.y);
    return b ? b.id : null;
  }
  // Small deterministic string->int for seeding a loot roll off a foe's id.
  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // cp-018: format one structured combat round for the event-log record.
  function combatRoundLine(r) {
    const pcCombatant = combat && combat.combatants && combat.combatants.find((c) => c.id === 'pc');
    const pcMax = pcCombatant ? pcCombatant.maxHp : session.pc.maxHp;
    return formatCombatRound(r, pcMax);
  }
  // cp-018: after any combat.take(), flush any new round records to the event log.
  let combatRoundsLogged = 0;
  function logCombatRounds() {
    if (!combat) return;
    while (combatRoundsLogged < combat.rounds.length) {
      const r = combat.rounds[combatRoundsLogged++];
      logEvent('combat-round', { mode: combatReturn, seed: combatSeedUsed, outcome: combatRoundLine(r) });
    }
  }
  function endCombat() {
    const fallen = session.pc.name;
    const fallenPortrait = session.pc.portrait; // capture the dying face before permadeath rolls a fresh stranger
    const summary = session.resolveCombat(combat, game.tick);
    const rec = combat.recruited;
    let line = '';
    const oseed = proseSeed(summary.outcome || 'win');
    if (summary.outcome === 'win') {
      line = `⚔ ${stripSeed(combatProse.outcome('win', oseed))}`;
      if (combatReturn === 'dungeon' && run && run.site) { session.clearSite(run.site.id); refreshCapacityWithFeedback(); } // a clear may complete a biome (E6)
      if (pendingDungeonEnemy && run && run.life) run.life.clear(pendingDungeonEnemy);
      // Part B loot: each foe you felled may leave something — salvage or a trinket
      // (seeded per foe; most leave nothing). Added to the pack; the finds annotate
      // the outcome so the player knows the kill paid off.
      const got = [];
      for (const c of combat.combatants) {
        if (c.side !== 'foe' || c.alive) continue;
        const dropSeed = hashInt(strHash(c.id), game.tick, (world.seed ^ 0x100f) >>> 0);
        const dropChance = combatReturn === 'dungeon' && run ? game.encounters.lootChance(run.table) : undefined;
        const item = loot.rollKill(c, dropSeed, { dropChance });
        if (item) { session.addItem(item); got.push(stripSeed(item.name)); }
      }
      // E3: a traversal WORK-ITEM may drop in a gate-adjacent biome (once per fight) —
      // the front of the loop: loot here → open the gate → richer biome beyond.
      const travItem = loot.rollTraversal(combatBiomeId(), hashInt(strHash('trav'), game.tick, (world.seed ^ 0x70a5) >>> 0));
      if (travItem) { session.addItem(travItem); got.push(stripSeed(travItem.name)); }
      if (got.length) line += ` · found ${got.join(', ')}`;
    }
    else if (summary.outcome === 'parley') line = `☮ ${stripSeed(combatProse.outcome('parley', oseed))}`;
    else if (summary.outcome === 'fled') line = `↩ ${stripSeed(combatProse.outcome('fled', oseed))}`;
    pendingDungeonEnemy = null;
    if (rec && rec.length) line += ` · ${rec.map((f) => f.name).join(', ')} joins you`;
    // Part B: record the resolved fight (outcome + felled/found/joined summary).
    logEvent('combat', { mode: combatReturn, seed: combatSeedUsed, outcome: `${summary.outcome} — ${stripSeed(line)}`.trim() });
    // cp-018: capture the final fight's last rounds + the killing blow for the death recap.
    let deathRecap = null;
    if (summary.pcDied && combat) {
      const recap = combat.rounds.slice(-4).map((r) => combatRoundLine(r));
      const reversed = combat.rounds.slice().reverse();
      const killingRound = reversed.find((r) => r.actor && r.actor.side === 'foe' && r.pcHpAfter === 0)
        || reversed.find((r) => r.actor && r.actor.side === 'foe')
        || combat.rounds[combat.rounds.length - 1];
      const killingBlow = killingRound ? combatRoundLine(killingRound) : 'the killing blow is lost to the record';
      deathRecap = { recap, killingBlow };
    }
    combat = null;
    if (summary.pcDied) { logEvent('death', { mode: combatReturn, outcome: `${stripSeed(fallen)} fell` }); refreshCapacity(); deathInfo = { fallen, portrait: fallenPortrait, ...deathRecap }; audio.sfx('death'); mode = 'death'; }
    else if (combatReturn === 'overworld') { owNote = line; mode = 'overworld'; }
    else { encLine = line; mode = 'dungeon'; }
  }

  // Entity accent is now a DESIGNED element of each sprite, drawn through the
  // shared accentPixel channel (a beast's danger tips glint in the accent hue),
  // never a bare rectangle stroked around a tile (M8 REOPEN: the orange-box
  // defect — a raw strokeRect that read as a box around the PC and, over faint
  // sprites, as a box on an apparently-empty tile). The party is marked simply
  // by being its own unique authored sprite at the centre of the viewport.
  // Built per-draw so the accent hue tracks a live palette swap ([P]).
  const beastAccent = () => ({ shade: 4, color: accentColor(0.85) });

  // M10 A4 VISIBILITY floor: the halo shade for an entity standing at (gx,gy).
  // Reads the SAME ground art the terrain pass draws there (plain terrain or the
  // biome dressing), takes its representative shade, and returns the far-ramp
  // opposite so the sprite's silhouette clears a large contrast delta in every
  // biome (measured in test/visibility.test.js). Returns an {shade} for drawTile.
  function groundOutlineAt(gx, gy, danger = true) {
    const tile = world.tileAt(gx, gy);
    const biome = biomes.biomeAt(gx, gy);
    const artId = biome ? biomes.dressFor(biome, tile.id, terrainArtId(tile.id)) : terrainArtId(tile.id);
    const ground = reprShade(TILE_ART.get(artId));
    // G4 tiered halos: DANGER-flagged entities (hostile beasts, the party's own mark)
    // get the full ramp-opposite ring; common folk get the dimmer one.
    return { shade: (danger ? contrastOutlineShade : dimOutlineShade)(ground) };
  }

  // M10 A3: a seeded, in-voice line for a bump into impassable terrain, keyed by
  // the class of tile that blocked you (deep water / shallows / mountain / other)
  // so the refusal reads as the world talking back. Deterministic per (cell,tile).
  function blockedLine(blocked) {
    if (!blocked) return owNote;
    const tile = world.tileAt(blocked.x, blocked.y);
    const pool = (register.onblocked && (register.onblocked[tile.id] || register.onblocked.default)) || [];
    if (!pool.length) return register.onterrain[tile.id] || owNote;
    const i = hashInt(blocked.x, blocked.y, (world.seed ^ 0xb10c) >>> 0) % pool.length;
    return pool[i];
  }

  function renderOverworld() {
    markWorldMap();
    const s = frame.scene;
    world.streamAround(party.x, party.y);
    ctx.fillStyle = '#000';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    // The scene fits as many tiles as its (responsive) width/height allow, party
    // centred — a wider window shows more country (ADDENDUM 2 welcomed this).
    const cols = Math.max(1, Math.floor(s.w / tilePx));
    const rows = Math.max(1, Math.floor(s.h / tilePx));
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    const ox = s.x + Math.floor((s.w - cols * tilePx) / 2);
    const oy = s.y + Math.floor((s.h - rows * tilePx) / 2);
    for (let vy = 0; vy < rows; vy++) {
      for (let vx = 0; vx < cols; vx++) {
        const gx = party.x + vx - cx;
        const gy = party.y + vy - cy;
        const tile = world.tileAt(gx, gy);
        const d = tileDither(gx, gy, world.seed, tile.id);
        // M9 BIOMES: inside a guaranteed area, the tile draws its biome dressing
        // (art channel) instead of the plain terrain art. Open country is plain.
        const biome = biomes.biomeAt(gx, gy);
        const artId = biome ? biomes.dressFor(biome, tile.id, terrainArtId(tile.id)) : terrainArtId(tile.id);
        // G2 — the accent aimed at MEANING: a per-tile spec (dense on water, subtler on
        // deep, ZERO on mundane ground). Skipped where a biome re-dresses the water.
        if (artId === terrainArtId(tile.id)) {
          const spec = terrainAccentSpec(tile.id);
          if (spec) d.accent = { color: overworldRoadColor(), shades: spec.shades, chance: spec.chance };
        }
        drawTile(ctx, TILE_ART.get(artId), ox + vx * tilePx, oy + vy * tilePx, tilePx, overworldTerrainColor, d);
      }
    }

    // Round-1's map-sized compositional gesture: a world-anchored dotted road
    // sweeps across the starting country and terminates at the nearest city. It
    // is painted between the dark terrain masses and landmarks, never follows
    // the viewport, and remains a route rather than a luminous ribbon.
    {
      const road = overworldRoadPoints(game.start, world.listSites(), world.seed);
      const minGX = party.x - cx, minGY = party.y - cy;
      const dotW = Math.max(2, Math.round(tilePx * 0.13));
      const dotH = Math.max(1, Math.round(tilePx * 0.08));
      for (const point of road) {
        const px = Math.round(ox + (point.x - minGX) * tilePx);
        const py = Math.round(oy + (point.y - minGY) * tilePx);
        if (px < s.x || py < s.y || px >= s.x + s.w || py >= s.y + s.h) continue;
        ctx.fillStyle = overworldTerrainColor(0);
        ctx.fillRect(px - Math.ceil(dotW / 2) - 1, py - Math.ceil(dotH / 2) - 1, dotW + 2, dotH + 2);
        ctx.fillStyle = overworldRoadColor();
        ctx.fillRect(px - Math.ceil(dotW / 2), py - Math.ceil(dotH / 2), dotW, dotH);
      }
    }

    // Sites sit over both country and road. Only the settlement gets the hot
    // landmark ramp; chapel/dungeon silhouettes remain part of the dark map.
    for (let vy = 0; vy < rows; vy++) {
      for (let vx = 0; vx < cols; vx++) {
        const gx = party.x + vx - cx;
        const gy = party.y + vy - cy;
        const tile = world.tileAt(gx, gy);
        const site = world.siteAt(gx, gy);
        if (site) {
          const sArt = siteArtId(site.kind, site.id);
          const siteColor = sArt === 'SITE_CITY' ? overworldLandmarkColor : overworldTerrainColor;
          drawTile(ctx, TILE_ART.get(sArt), ox + vx * tilePx, oy + vy * tilePx, tilePx, siteColor, tileDither(gx, gy, world.seed, tile.id));
          const scx = ox + vx * tilePx + tilePx / 2, scy = oy + vy * tilePx + tilePx / 2;
          if (sArt === 'SITE_CHAPEL') {
            const light = lightLayer('siteChapel');
            addLight(scx, oy + vy * tilePx + 2, tilePx * light.radius, light.intensity);
          } else if (sArt === 'SITE_CITY') {
            const light = lightLayer('siteCity');
            addLight(scx, scy + tilePx * 0.05, tilePx * light.radius, light.intensity);
          } else {
            const light = lightLayer('siteDungeon');
            addLight(scx, scy + tilePx * 0.05, tilePx * light.radius, light.intensity);
          }
        }
      }
    }
    // Visible living-world wanderers (M8 §5): NPCs + common monsters roaming the
    // map. Beasts wear a faint accent ring (danger reaches the world — §3); NPCs
    // draw plain. Drawn before the party so the party icon sits on top.
    for (const m of wanderers.list()) {
      const wvx = cx + (m.x - party.x), wvy = cy + (m.y - party.y);
      if (wvx < 0 || wvy < 0 || wvx >= cols || wvy >= rows) continue;
      const dx = ox + wvx * tilePx, dy = oy + wvy * tilePx;
      const icon = m.kind === 'beast' ? 'WANDERER_BEAST' : 'WANDERER_NPC';
      // Beasts glint their danger tips in the accent hue (the §3 "danger reaches
      // the world" move, now a designed sprite element); NPCs draw plain. Both
      // wear the A4 contrast halo so they never vanish into same-shade ground.
      drawTile(ctx, TILE_ART.get(icon), dx, dy, tilePx, overworldTerrainColor,
        tileDither(m.x, m.y, (world.seed ^ 0x3a2d) >>> 0, world.tileAt(m.x, m.y).id),
        m.kind === 'beast' ? beastAccent() : null,
        groundOutlineAt(m.x, m.y, m.kind === 'beast')); // G4: beasts danger-halo, folk dim
    }
    // Party focal stack, in mockup order: reserved foot-shadow and torch pool,
    // then the contrast halo + crisp sprite, then hood catch and explicit YOU tag.
    // Drawing light BEFORE the sprite is the crucial visibility correction: the
    // rejected uplift washed its own marker back into the terrain after drawing it.
    {
      const pox = ox + cx * tilePx, poy = oy + cy * tilePx;
      const pcx = pox + tilePx / 2;
      const fl = 0.86 + Math.sin(paintPhase * 0.5) * 0.1 + Math.sin(paintPhase * 1.7) * 0.04;
      shadowPool(pcx, poy + tilePx * 0.82, tilePx * PARTY_FOCAL.shadowRxTiles, tilePx * PARTY_FOCAL.shadowRyTiles, PARTY_FOCAL.shadowStrength);
      addLight(pcx, poy + tilePx * 0.31, tilePx * PARTY_FOCAL.outerRadiusTiles * fl, PARTY_FOCAL.outerStrength * fl);
      addLight(pcx, poy + tilePx * 0.31, tilePx * PARTY_FOCAL.innerRadiusTiles, PARTY_FOCAL.innerStrength * fl);
      drawTile(ctx, TILE_ART.get('PARTY'), pox, poy, tilePx, overworldPartyColor,
        null, null, groundOutlineAt(party.x, party.y));
      ctx.fillStyle = overworldPartyColor(6); ctx.fillRect(Math.round(pcx), Math.round(poy + tilePx * 0.25), 2, 2);
      ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('YOU', pcx, poy - 3); ctx.textAlign = 'left';
    }

    const here = party.site();
    const biomeHere = biomes.biomeAt(party.x, party.y);
    const line = here
      ? `${describeSite(here)} — ${register.prompt_enter_site}`
      // Inside a biome, the ground reads in that biome's register/vibe (weirdness-
      // scaled). Open country keeps its plain terrain flavor.
      : biomeHere
        ? describeBiomeGround(biomeHere, party.x, party.y)
        : register.onterrain[party.tile().id] || party.tile().id;
    sceneStatus = owNote || line;
    status.textContent = stripSeed(sceneStatus);
  }

  // A live enemy in a cell down the corridor ahead (not the current cell) — the
  // "you see it coming" case (M8 §5). Scans EVERY forward fine-tile out to a
  // couple cells so visibility never aliases on the party's offset within its
  // segment (A1: the old n=[3,4,6] sampling missed cells at some mod-seg offsets,
  // making an enemy flicker in/out depending on approach). Continuous coverage.
  function enemyAhead() {
    if (!run || !run.life) return null;
    return enemyInCorridor(run.dungeon, run.crawl, run.life);
  }

  function renderDungeon() {
    const s = frame.scene;
    renderFP(ctx, s.w, s.h, run, shadeColor);
    // The approved off-axis wall torch: broad elliptical throw, two glow scales,
    // visible bracket and white-hot core. The rejected uplift's centered low-power
    // wash flattened the corridor and erased the mockup's directional falloff.
    {
      const tx = s.x + s.w * 0.325, ty = s.y + s.h * 0.49;
      const fl = 0.82 + Math.sin(paintPhase * 0.5) * 0.1 + Math.sin(paintPhase * 1.7 + 1) * 0.045;
      const lightThrow = lightLayer('dungeonTorch', 'throw');
      const lightOuter = lightLayer('dungeonTorch', 'outer');
      const lightCore = lightLayer('dungeonTorch', 'core');
      addLightPool(tx, ty + 4, s.w * lightThrow.rx * fl, s.h * lightThrow.ry * fl, lightThrow.intensity * fl);
      addLight(tx, ty - 3, s.h * lightOuter.radius * fl, lightOuter.intensity * fl);
      addLight(tx, ty - 3, s.h * lightCore.radius * fl, lightCore.intensity * fl);
      ctx.fillStyle = shadeColor(1); ctx.fillRect(tx - 1, ty - 1, 3, 12);
      ctx.fillStyle = shadeColor(6); ctx.fillRect(tx - 2, ty - 7, 5, 8);
      const [fr, fg, fb] = glowTriple();
      ctx.fillStyle = `rgb(${Math.round(fr)},${Math.round(fg)},${Math.round(fb)})`;
      ctx.fillRect(tx - 1, ty - 9, 3, 6);
    }
    // Draw an enemy standing in the corridor ahead as a silhouette bust, so the
    // player sees it before deciding to approach (Cyclopean-style visible foes).
    const ahead = enemyAhead();
    if (ahead) {
      const size = Math.round(Math.min(s.h * 0.42, s.w * 0.3, 150));
      const bpx = Math.round(s.w / 2 - size / 2), bpy = Math.round(s.h * 0.24);
      // Back-halo so the encounter silhouette REGISTERS against the dark corridor
      // (the PoC's pilgrim move) — a dim rim of light behind the bust, not a fill.
      const light = lightLayer('dungeonEncounter');
      addLight(s.x + bpx + size / 2, s.y + bpy + size * 0.42, size * light.radius, light.intensity);
      drawBust(bustArtId(ahead.beingId), bpx, bpy, size);
    }
    // cp-017: toggleable first-person minimap, drawn from the real explored set.
    if (showMinimap) {
      drawMinimap(ctx, {
        dungeon: run.dungeon, crawl: run.crawl, minimap: run.minimap, shadeColor,
        x: s.x + 12, y: s.y + 12, maxSize: 120,
      });
    }
    const enc = encLine ? stripSeed(encLine) : '';
    const seen = ahead ? `  · ${stripSeed(ahead.name)} ahead` : '';
    const roomLine = `${describeRoom(run)} — ${register.prompt_exit_site}${seen}`;
    sceneStatus = enc ? `${enc}\n${roomLine}` : roomLine;
    status.textContent = stripSeed(sceneStatus).replace(/\n/g, ' ');
  }

  function renderCity() {
    const s = frame.scene;
    const c = city.city, st = city.stroll;
    ctx.fillStyle = '#000'; ctx.fillRect(s.x, s.y, s.w, s.h);
    // Fit the whole city into the scene viewport (cities are small areas).
    const t = Math.max(4, Math.floor(Math.min(s.w / c.width, s.h / c.height)));
    const ox = s.x + Math.floor((s.w - c.width * t) / 2);
    const oy = s.y + Math.floor((s.h - c.height * t) / 2);
    const doors = new Set(c.buildings.map((b) => `${b.door.x},${b.door.y}`));
    const gateKey = `${c.gate.x},${c.gate.y}`;
    // F3: the wall/street dither PATTERN varies by archetype so two towns read as
    // different places (grayscale texture, never a hue).
    const texSeed = (world.seed ^ 0xc17e ^ archetypeTexture(c.archetype)) >>> 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        let art;
        if (`${x},${y}` === gateKey) art = 'CITY_GATE';
        else if (doors.has(`${x},${y}`)) art = 'CITY_DOOR';
        else if (c.passable(x, y)) art = 'CITY_STREET';
        else if (x === 0 || y === 0 || x === c.width - 1 || y === c.height - 1) art = 'CITY_WALL';
        else art = 'CITY_BUILDING';
        drawTile(ctx, TILE_ART.get(art), ox + x * t, oy + y * t, t, shadeColor, tileDither(x, y, texSeed));
      }
    }
    // F3: a per-service glyph floating above each door, so the trade is readable
    // without obscuring the door art. The glyph sits in the tile directly above
    // the door; every building type uses the same marker, at both zoom levels.
    ctx.save();
    ctx.fillStyle = shadeColor(6); ctx.font = `${Math.max(8, Math.floor(t * 0.7))}px monospace`; ctx.textAlign = 'center';
    for (const b of c.buildings) {
      const gx = ox + b.door.x * t + t / 2;
      const gy = oy + (b.door.y - 1) * t + t * 0.85;
      ctx.fillText(serviceGlyph(b.service), gx, gy);
    }
    ctx.textAlign = 'left'; ctx.restore();
    // Citizens (M8 §5): named townsfolk standing in the streets. Drawn as the NPC
    // wanderer icon, dithered — the town is inhabited, not empty.
    for (const cit of (city.citizens || [])) {
      drawTile(ctx, TILE_ART.get('WANDERER_NPC'), ox + cit.x * t, oy + cit.y * t, t, shadeColor, tileDither(cit.x, cit.y, (world.seed ^ 0xc17e) >>> 0));
    }
    // stroller — the party's own authored sprite, matching the overworld mark
    // (no ring — see the accentPixel note in renderOverworld).
    drawTile(ctx, TILE_ART.get('PARTY'), ox + st.x * t, oy + st.y * t, t, shadeColor);
    const b = st.buildingHere();
    const cit = (city.citizens || []).find((p) => p.x === st.x && p.y === st.y);
    const hint = b
      ? `⌂ ${stripSeed(describeBuilding(b, city).name)} — ${cityRegister.prompt_enter_building}  ·  `
      : cit ? `${stripSeed(cit.name)} ${stripSeed(city.life.greetingFor(cit.x, cit.y))}  ·  ` : '';
    sceneStatus = cityNote || `${hint}${cityRegister.prompt_leave_city}`;
    status.textContent = stripSeed(sceneStatus);
  }

  function renderBuilding() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // M12 shop interior: numbered stock rows with tender prices + a message line.
    if (building && building.service === 'shop' && shopState) {
      const stockRows = (shopState.stock || []).map((s) => ({
        name: s.name,
        priceText: shop.priceText(s._truth.price, shop.labels),
      }));
      paintRows(buildShopDrawList({
        name: building.name,
        lines: building.lines,
        stock: stockRows,
        message: shopState.message || '',
        money: session.money,
        currencyPlural: shop.labels.plural || 'grey coins',
        glyph: serviceGlyph('shop'),
        glyphColor: shadeColor(5),
      }));
    } else {
      // Interiors stay TEXT (operator lock) — a framed, tested greeting panel. The
      // per-service glyph lives in its own top band inside the draw list so it can
      // never overprint the wrapped name/prose (defect sweep 2026-08-04).
      paintRows(buildBuildingDrawList({
        name: building.name,
        lines: building.lines,
        glyph: serviceGlyph(building.service),
        glyphColor: shadeColor(5),
      }));
    }
    sceneStatus = `${stripSeed(city.name)} · ${stripSeed(building.name || building.service)}`;
    status.textContent = stripSeed(sceneStatus);
  }

  // The place-stamp for a note written now — reads from the mode we opened from.
  function placeNow() {
    if (journalReturn === 'city' && city) return stripSeed(city.name || 'a walled town');
    if (journalReturn === 'dungeon' && run) return stripSeed(run.name || 'a hollow site');
    const here = party.site();
    return here ? stripSeed(here.name || here.id || 'a site') : `(${party.x},${party.y})`;
  }

  // The ids of the player's own entries in the current merged view (ghosts are
  // never selectable — you cannot revise a page you did not write).
  function selectablePlayerIds() {
    return journal.view({ exposure: game.exposure(), now: game.tick + 1 })
      .filter((x) => x.origin === 'player').map((x) => x.id);
  }
  function moveJournalSel(dir) {
    const ids = selectablePlayerIds();
    if (!ids.length) { journalSel = null; return; }
    let i = ids.indexOf(journalSel);
    if (i < 0) i = ids.length - 1;
    i = dir === 'N' ? Math.max(0, i - 1) : Math.min(ids.length - 1, i + 1);
    journalSel = ids[i];
  }

  function renderWorldmap() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    drawWorldmap(ctx, {
      world, biomes, mapState: game.mapState, party, start: game.start, shadeColor, accentColor,
      maxW: CANVAS_W - 48, maxH: CANVAS_H - 130, viewportW: CANVAS_W, viewportH: CANVAS_H,
    });
  }

  function renderJournal() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const entries = journalWriting ? [] : journal.view({ exposure: game.exposure(), now: game.tick + 1 });
    paintRows(buildJournalDrawList({
      entries, writing: journalWriting, editing: journalEditId != null,
      draft, place: journalPlace, selectedId: journalSel,
    }));
    sceneStatus = journalWriting
      ? (journalEditId != null ? 'you revise a page; the page revises you back' : 'the pen hesitates; the page does not stay as written')
      : `${journal.count()} of your notes · the record is not to be trusted`;
    status.textContent = stripSeed(sceneStatus);
  }

  // Truncate a string to a pixel width at a given font size (for the bust caption).
  function fitText(s, maxW, size) {
    ctx.font = `${size}px monospace`;
    if (ctx.measureText(s).width <= maxW) return s;
    let t = s;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function renderCombat() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // The being you've met, rendered as a bust top-right (the lead living foe).
    const lead = combat.living('foe')[0];
    if (lead) {
      const b = bustBoxFor('combat');
      drawBust(foeBustId(lead), b.x, b.y, b.size);
      // Cluster (UI-critique #4): the foe's name + HP sit WITH the portrait so the eye
      // does not bridge the full frame to reach the left-column roster.
      const cx = b.x + b.size / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = shadeColor(6); ctx.font = '12px monospace';
      ctx.fillText(fitText(stripSeed(lead.name), b.size + 20, 12), cx, b.y + b.size + 14);
      ctx.fillStyle = shadeColor(3); ctx.font = '11px monospace';
      ctx.fillText(`[${lead.hp}/${lead.maxHp}]`, cx, b.y + b.size + 28);
      ctx.textAlign = 'left';
    }
    // The tactical verb list — the LIVE options (bright, marked `›`), a disabled verb
    // greyed (talk hardened / gambit spent). In-voice labels (register), no menu-speak.
    const foeId = lead && lead.id;
    const verbs = combatMenu === 'root' ? [
      { key: 'F', label: combatProse.label('attack'), enabled: true },
      { key: 'G', label: combatProse.label('defend'), enabled: true },
      { key: 'R', label: combatProse.label('item'), enabled: true },
      { key: 'V', label: combatProse.label('subterfuge'), enabled: !combat.subterfugeSpent },
      { key: 'T', label: combatProse.label('talk'), enabled: combat.canTalk(foeId) },
    ] : [];
    const items = combatItems.map((c, i) => ({ key: i + 1, label: c.label, enabled: true }));
    // Tested draw-list: THEM/YOU rosters, the live verb/approach/item options, note, log.
    paintRows(buildCombatDrawList({
      foes: combat.living('foe'),
      party: combat.living('party'),
      round: combat.round,
      menu: combatMenu,
      verbs,
      approaches,
      items,
      note: combatNote,
      log: combat.log.slice(-4),
    }));
    sceneStatus = `round ${combat.round} — the pattern asserts itself`;
    status.textContent = stripSeed(sceneStatus);
  }

  // The confront/sneak prompt for a visible dungeon enemy (M8 §5) — the enemy
  // bust top-right (combat box → shared no-overprint column) over a black card.
  function renderDungeonEnc() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (dungeonEnemy) { const b = bustBoxFor('combat'); drawBust(bustArtId(dungeonEnemy.beingId), b.x, b.y, b.size); }
    const pc = session.pc;
    const nerve = pc && pc.rankIndex ? pc.rankIndex('nerve') : 1;
    paintRows(buildSneakDrawList({
      name: dungeonEnemy ? dungeonEnemy.name : '—',
      note: sneakNote,
      chance: Math.min(0.9, 0.35 + 0.16 * nerve),
    }));
    sceneStatus = '[SEED] something blocks the corridor';
    status.textContent = stripSeed(sceneStatus);
  }

  function renderDeath() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    { const b = bustBoxFor('death'); drawBust(deathInfo.portrait || 'HERO', b.x, b.y, b.size); }
    paintRows(buildDeathDrawList({
      fallen: deathInfo.fallen,
      pc: session.pc,
      lineage: session.lineage(),
      recap: deathInfo.recap || [],
      killingBlow: deathInfo.killingBlow || '',
    }));
    sceneStatus = `deaths: ${session.deaths} · cleared: ${session.clearedSites().length}`;
    status.textContent = stripSeed(sceneStatus);
  }

  function renderTitle() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const records = registry.load();
    const items = [];
    // The "New World" slot sits at the top of the list.
    items.push({ label: '[N] new world', note: '', kind: 'new', selected: worldSel === 0 });
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const hasSave = registry.loadWorldSave(r.id) != null;
      const note = hasSave ? 'filed' : 'unfiled';
      items.push({ label: stripSeed(r.name), note, kind: 'world', selected: worldSel === i + 1 });
    }
    paintRows(buildWorldMenuDrawList({
      title: register.title,
      subtitle: register.subtitle,
      intro: confirmDelete ? '' : register.boot,
      paletteName: PALETTE.get(SCHEME).name,
      items,
      confirmDelete,
    }));
    sceneStatus = confirmDelete
      ? `delete ${stripSeed(confirmDelete.name)}?`
      : stripSeed(register.subtitle || 'the map is not the territory');
    status.textContent = 'CHAPEL PERILOUS — the map is not the territory';
  }

  function renderCreation() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    paintRows(buildCreationDrawList({ pc: session.pc, accepted: creationAccepted }));
    { const b = bustBoxFor('creation'); drawBust((session.pc && session.pc.portrait) || 'HERO', b.x, b.y, b.size); }
    sceneStatus = 'deal a stranger — identity shopping, unlimited rerolls';
    status.textContent = stripSeed(sceneStatus);
  }

  // CRT post-pass: scanlines + a soft vignette over the finished frame. Pure
  // canvas, no files (hard rule 2); the M4 "look" over the single-hue palette.
  function crtPass() {
    ctx.save();
    // Round-2 chrome character retained, with the additive copy behind the
    // measured global restraint knob instead of the superseded 0.34 glare pass.
    if (document && typeof document.createElement === 'function') {
      if (!crtBloomCanvas) crtBloomCanvas = document.createElement('canvas');
      if (crtBloomCanvas.width !== canvas.width) crtBloomCanvas.width = canvas.width;
      if (crtBloomCanvas.height !== canvas.height) crtBloomCanvas.height = canvas.height;
      const bctx = crtBloomCanvas.getContext('2d');
      if (bctx) {
        const bloom = BLOOM_CLASSES.crtBloom;
        bctx.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = 'lighter'; ctx.filter = `blur(${bloom.blurPx}px)`; ctx.globalAlpha = bloom.layers[0].intensity;
        ctx.drawImage(crtBloomCanvas, 0, 0); ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
      }
    }
    // PoC mask cadence is 3 display pixels. The live backing scales ~1.55x at
    // the 1440x900 proof target, so a 2-logical-pixel cadence lands at ~3px.
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#000';
    for (let y = 1; y < canvas.height; y += 2) ctx.fillRect(0, y, canvas.width, 1);
    ctx.globalAlpha = 0.10;
    for (let x = 1; x < canvas.width; x += 2) ctx.fillRect(x, 0, 1, canvas.height);
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.35, canvas.width / 2, canvas.height / 2, canvas.height * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Faint upper-left glass glare: smaller as well as weaker, and measured as
    // its own light class so it cannot silently grow back into a screen wash.
    ctx.globalCompositeOperation = 'lighter';
    const glare = lightLayer('crtGlare');
    const gl = ctx.createRadialGradient(canvas.width * 0.32, canvas.height * 0.2, 0, canvas.width * 0.32, canvas.height * 0.2, canvas.height * glare.radius);
    gl.addColorStop(0, `rgba(255,255,255,${glare.intensity})`);
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /**
   * Point the ambient score at the live game state (score.js). Called at the end
   * of every render, which is the one seam every state change already passes
   * through. Cheap and idempotent: an unchanged scene is a no-op inside the
   * score, and params update the intensity layers without restarting a track.
   *
   * The params ARE game state, not decoration:
   *  - country/under/held take the biome's `weirdness` (data/world/biomes.json),
   *    which darkens the pads, widens the detune and thickens the noise band;
   *  - under/held also take the Chapel flag, which drops the floor a tone and
   *    bends the bell partials to a tritone;
   *  - pattern (combat) takes `pressure` — how hurt the stranger is — so the
   *    music degrades as the fight does.
   * Wrapped: audio must never be able to break a frame.
   */
  function syncScore() {
    try {
      const scene = sceneFor(mode);
      let params = null;
      if (scene === 'country') {
        const b = biomes.biomeAt(party.x, party.y);
        params = { weirdness: b ? b.weirdness : 0.25 };
      } else if (scene === 'under' || scene === 'held') {
        const b = run && run.site ? biomes.biomeAt(run.site.x, run.site.y) : null;
        params = { weirdness: b ? b.weirdness : 0.5, chapel: !!(run && run.chapel) };
      } else if (scene === 'pattern') {
        const pc = session.pc;
        const frac = pc && pc.maxHp > 0 ? pc.hp / pc.maxHp : 1;
        params = { pressure: Math.max(0, Math.min(1, 1 - frac)) };
      }
      audio.setScene(scene, params);
    } catch (_) { /* the score never blocks a frame */ }
  }

  function render() {
    paintPhase++;
    // Whole window is game surface: clear the frame, draw the scene (clipped to
    // its region so nothing bleeds into the chrome), then the standing panel +
    // console. Menu/text modes centre their logical card inside the scene; the
    // nav modes fill it. (ADDENDUM 2 full-window layout.)
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = frame.scene;
    ctx.save();
    ctx.beginPath(); ctx.rect(s.x, s.y, s.w, s.h); ctx.clip();
    if (mode === 'title') centered(renderTitle);
    else if (mode === 'creation') centered(renderCreation);
    else if (mode === 'combat') centered(renderCombat);
    else if (mode === 'dungeonEnc') centered(renderDungeonEnc);
    else if (mode === 'death') centered(renderDeath);
    else if (mode === 'building') centered(renderBuilding);
    else if (mode === 'journal') centered(renderJournal);
    else if (mode === 'city') renderCity();
    else if (mode === 'dungeon') renderDungeon();
    else renderOverworld();
    ctx.restore();
    paintPanel();
    paintConsole();
    paintFrameChrome();
    if (crt) crtPass();
    if (beatPanel) paintBeat();
    if (barterState) paintBarter();
    if (sellOverlay) paintSellOffer();
    paintToast();
    if (showInv) paintInventory();
    if (showParty) paintParty();
    if (showLog) paintEventLog();
    if (showWorldmap) paintWorldmap();
    if (showManual) paintManual();
    if (showNature) paintNature();
    if (showHelp) paintHelp();
    syncScore(); // last: the frame is already painted before we touch audio
  }

  function toOverworld() {
    // `mapState` is a createGame local, reachable here ONLY as game.mapState — a
    // bare reference threw ReferenceError on every dungeon exit that had a
    // minimap (found by the soak 2026-08-09; same class as the cp-017
    // refreshMinimap scope bug). stashDungeonMap() already does exactly this,
    // correctly, so call it rather than repeat the line.
    stashDungeonMap();
    mode = 'overworld'; run = null; city = null; building = null; showMinimap = false;
  }

  // Load the saved run for the active world.
  function loadSave() {
    if (!activeWorld) return 'none';
    const wrapper = registry.loadWorldSave(activeWorld.id);
    if (!wrapper || !wrapper.save) return 'none';
    game.load(wrapper.save);
    if (wrapper.scheme && PALETTE.ids().includes(wrapper.scheme)) SCHEME = wrapper.scheme;
    return 'ok';
  }

  // All input routes through the ONE bindings table (ADDENDUM 3): dirFor() for
  // movement, actionFor(mode,key) for everything else. The shell only ever reacts
  // to the semantic ACTION, so the WASD/left-hand map lives entirely in bindings.js
  // and the on-screen legend (generated from the same table) can't drift from it.
  function onKey(e) {
    audio.start(); // begin the ambient bed on the first user gesture (autoplay policy); idempotent
    if (combatResolutionPending) {
      e.preventDefault();
      combatResolutionPending = false;
      beatPanel = null;
      endCombat();
      render();
      return;
    }
    beatPanel = null; // any key dismisses a held kill/join beat (C1/C2), then also acts
    const a = actionFor(mode, e.key);
    // The one-time nature explainer (C4) captures input first: any key takes it up.
    if (showNature) { e.preventDefault(); showNature = false; markNatureSeen(); render(); return; }
    // Control reference — [?] cycles CONTROLS → the stranger's nature → closed; Esc closes.
    if (a === 'help') {
      e.preventDefault();
      if (!showHelp) { showHelp = true; helpPage = 0; }
      else if (helpPage === 0) { helpPage = 1; }
      else { showHelp = false; }
      render(); return;
    }
    if (showHelp) {
      e.preventDefault();
      if (a === 'cancel' || a === 'confirm') { showHelp = false; }
      render();
      return;
    }
    // Inventory ([I]) — opens from any nav mode; captures input while open.
    if (a === 'inventory' && (mode === 'overworld' || mode === 'city' || mode === 'dungeon' || showInv)) {
      e.preventDefault(); showInv = !showInv; invSel = 0; render(); return;
    }
    if (showInv) {
      e.preventDefault();
      const items = session.items();
      const d = dirFor(e.key);
      if (a === 'cancel') { showInv = false; }
      else if (d === 'N') invSel = Math.max(0, invSel - 1);
      else if (d === 'S') invSel = Math.min(Math.max(0, items.length - 1), invSel + 1);
      else if (e.key === 'u' || e.key === 'U') {
        const it = items[invSel];
        if (it) {
          const ures = session.useItem(it.uid, game.tick);
          if (ures.ok) {
            const line = (register.consumable_heal || '[SEED] you use ${item}; the stranger mends ${before}→${after} hp')
              .replace('${item}', stripSeed(ures.name))
              .replace('${before}', ures.before)
              .replace('${after}', ures.after);
            toast = stripSeed(line);
          } else {
            toast = ures.reason === 'not-usable' ? 'not usable here' : 'nothing to use';
          }
        }
      }
      else if (a === 'interact') { const it = items[invSel]; if (it && session.equip(it.uid)) toast = 'equipped'; }
      else if (e.key === 'x' || e.key === 'X') { const it = items[invSel]; if (it) { session.dropItem(it.uid); invSel = Math.max(0, invSel - 1); } }
      render(); return;
    }
    // The barter overlay (F2) captures input while open: Enter trades a tagged item for
    // the offer (if you carry the wanted tag), Esc keeps your things.
    if (barterState) {
      e.preventDefault();
      if (a === 'confirm') {
        const want = barterState.want;
        const have = session.items().find((it) => Array.isArray(it.tags) && it.tags.includes(want));
        if (have) {
          session.dropItem(have.uid);
          session.addItem(barterState.offer);
          setSocialNote(`[SEED] you trade ${stripSeed(have.name)} for ${stripSeed(barterState.offer.name)}`);
          logEvent('barter', { mode, outcome: `${want} → ${stripSeed(barterState.offer.name)}` });
        } else {
          setSocialNote(`[SEED] you have no ${want} to trade`);
        }
        barterState = null;
      } else if (a === 'cancel') {
        barterState = null; setSocialNote('[SEED] you keep your things');
      }
      render(); return;
    }
    // The party surface ([Y]) — opens from any nav mode; captures input while open.
    if (a === 'party' && (mode === 'overworld' || mode === 'city' || mode === 'dungeon' || showParty)) {
      e.preventDefault(); showParty = !showParty; partySel = 0; render(); return;
    }
    if (showParty) {
      e.preventDefault();
      const followers = session.roster.followers;
      const d = dirFor(e.key);
      if (a === 'cancel' || a === 'party') { showParty = false; }
      else if (d === 'N') partySel = Math.max(0, partySel - 1);
      else if (d === 'S') partySel = Math.min(Math.max(0, followers.length - 1), partySel + 1);
      else if (e.key === 'x' || e.key === 'X') {
        const f = followers[partySel];
        if (f && session.roster.dismiss(f.id)) { toast = `${stripSeed(f.name)} takes their leave`; partySel = Math.max(0, partySel - 1); }
      }
      render(); return;
    }
    // The record ([L]) — B2 event-log overlay; opens from any nav mode, captures input
    // while open. [W]/[S] scroll, [C] copies plain text, Shift+[L] dumps JSON, [L]/[Esc] closes.
    if (a === 'eventlog' && (mode === 'overworld' || mode === 'city' || mode === 'dungeon' || showLog)) {
      e.preventDefault();
      if (e.shiftKey) dumpEventLog();
      else { showLog = !showLog; logScroll = 0; }
      render(); return;
    }
    if (showLog) {
      e.preventDefault();
      const d = dirFor(e.key);
      if (a === 'cancel' || a === 'eventlog') { showLog = false; }
      else if (d === 'N') logScroll = Math.min(Math.max(0, events.size - 1), logScroll + 1); // older
      else if (d === 'S') logScroll = Math.max(0, logScroll - 1); // newer
      else if (e.key === 'c' || e.key === 'C') copyEventLog();
      render(); return;
    }
    // cp-020: worldmap overlay ([U]) — opens from nav modes; captures input while open.
    if (a === 'worldmap' && (mode === 'overworld' || mode === 'city' || mode === 'dungeon' || showWorldmap)) {
      e.preventDefault(); showWorldmap = !showWorldmap; render(); return;
    }
    if (showWorldmap) {
      e.preventDefault();
      if (a === 'cancel' || a === 'worldmap') { showWorldmap = false; }
      render(); return;
    }
    // Structure Arc slice 1 (LOCK 1/2): the manual overlay ([H]) — opens from nav
    // modes, mirrors the worldmap toggle exactly; read-only, captures input while open.
    if (a === 'manual' && (mode === 'overworld' || mode === 'city' || mode === 'dungeon' || showManual)) {
      e.preventDefault(); showManual = !showManual; manualScroll = 0; render(); return;
    }
    if (showManual) {
      e.preventDefault();
      const d = dirFor(e.key);
      if (a === 'cancel' || a === 'manual') { showManual = false; }
      else if (d === 'N') manualScroll = Math.max(0, manualScroll - 1);
      else if (d === 'S') manualScroll = Math.min(currentManualPage().maxScroll, manualScroll + 1);
      render(); return;
    }
    // JOURNAL compose captures ALL printable input (letters type as text, not as
    // commands). Enter files the note; Esc discards; Backspace deletes.
    if (mode === 'journal' && journalWriting) {
      e.preventDefault();
      if (e.key === 'Escape') { journalWriting = false; journalEditId = null; draft = ''; render(); return; }
      if (e.key === 'Enter') {
        const text = draft.trim();
        // Editing revises the existing entry; a fresh note is filed with its
        // when/where stamp. Either way the corruption engine takes it from here.
        if (text) {
          if (journalEditId != null) { journal.edit(journalEditId, text); journalSel = journalEditId; }
          else { const e2 = journal.write({ text, where: journalPlace, when: game.tick }); journalSel = e2.id; }
        }
        journalWriting = false; journalEditId = null; draft = ''; render(); return;
      }
      if (e.key === 'Backspace') { draft = draft.slice(0, -1); render(); return; }
      if (e.key.length === 1 && draft.length < 200) { draft += e.key; render(); return; }
      return;
    }
    // Any real keypress clears a lingering toast; palette/CRT/zoom re-set it below.
    toast = '';
    // Global actions — work in every mode (M4 VIBE + the map-zoom taste knob).
    if (a === 'zoomIn') { e.preventDefault(); tilePx = Math.min(TILE_MAX, tilePx + 8); toast = `tiles — ${tilePx}px`; render(); return; }
    if (a === 'zoomOut') { e.preventDefault(); tilePx = Math.max(TILE_MIN, tilePx - 8); toast = `tiles — ${tilePx}px`; render(); return; }
    if (a === 'palette') { e.preventDefault(); SCHEME = PALETTE.next(SCHEME); toast = `palette — ${stripSeed(PALETTE.get(SCHEME).name)}`; render(); return; }
    if (a === 'crt') { e.preventDefault(); crt = !crt; toast = `CRT ${crt ? 'on' : 'off'}`; render(); return; }
    if (a === 'mute') { e.preventDefault(); const m = audio.toggleMute(); toast = `sound ${m ? 'off' : 'on'}`; if (!m) audio.start(); render(); return; }
    // Journal ([Q]/[Tab]) opens from any nav mode; it remembers where to return.
    if (a === 'journal' && (mode === 'overworld' || mode === 'city' || mode === 'dungeon')) {
      e.preventDefault();
      journalReturn = mode; journalPlace = placeNow();
      journalWriting = false; journalEditId = null; draft = '';
      const ids = selectablePlayerIds(); journalSel = ids.length ? ids[ids.length - 1] : null;
      mode = 'journal';
      render(); return;
    }
    if (mode === 'journal') {
      e.preventDefault();
      if (a === 'newnote') { journalWriting = true; journalEditId = null; draft = ''; render(); return; }
      // [W]/[S] move the highlight; [E] revises the highlighted own-entry.
      const jdir = dirFor(e.key);
      if (jdir === 'N' || jdir === 'S') { moveJournalSel(jdir); render(); return; }
      if (a === 'interact') {
        const rawE = journalSel != null && journal.raw().find((x) => x.id === journalSel);
        if (rawE) { journalWriting = true; journalEditId = rawE.id; draft = rawE.text; render(); }
        return;
      }
      if (a === 'cancel' || a === 'journal') { mode = journalReturn; render(); return; }
      return;
    }
    if (mode === 'title') {
      e.preventDefault();
      const k = (e.key || '').toLowerCase();
      if (confirmDelete) {
        if (a === 'confirm' || k === 'y') {
          registry.deleteWorld(confirmDelete.id);
          confirmDelete = null;
          worldSel = Math.min(worldSel, Math.max(0, registry.load().length));
          render(); return;
        }
        if (a === 'cancel' || k === 'n') { confirmDelete = null; render(); return; }
        render(); return;
      }
      const records = registry.load();
      const maxSel = records.length; // slot 0 is "new world"; slots 1..N are worlds
      const dir = dirFor(e.key);
      if (dir === 'N') { worldSel = Math.max(0, worldSel - 1); render(); return; }
      if (dir === 'S') { worldSel = Math.min(maxSel, worldSel + 1); render(); return; }
      if (a === 'newWorld') { newWorld(); creationAccepted = false; mode = 'creation'; render(); return; }
      if (a === 'delete' && worldSel > 0) {
        confirmDelete = records[worldSel - 1];
        render(); return;
      }
      if (a === 'confirm') {
        if (worldSel === 0) { newWorld(); creationAccepted = false; mode = 'creation'; render(); return; }
        const record = records[worldSel - 1];
        try {
          const hasSave = registry.loadWorldSave(record.id) != null;
          continueWorld(record);
          creationAccepted = false;
          mode = hasSave ? 'overworld' : 'creation';
          owNote = hasSave ? '[SEED] the record is reinstated' : '[SEED] a new run in an old world';
        } catch (_) { /* stay on title */ }
        render(); return;
      }
      return;
    }
    if (mode === 'creation') {
      e.preventDefault();
      if (a === 'confirm') { creationAccepted = true; render(); return; }
      if (a === 'interact' && creationAccepted) { mode = 'overworld'; if (!natureSeen()) showNature = true; render(); return; }
      if (a === 'reroll') { session.reroll(); creationAccepted = false; render(); return; }
      if (a === 'cancel') { creationAccepted = false; mode = 'title'; render(); return; }
      return;
    }
    if (mode === 'combat') {
      e.preventDefault();
      if (combatMenu === 'talk') {
        if (a === 'cancel') { combatMenu = 'root'; combatNote = ''; render(); return; }
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= approaches.length) talkPick(n - 1);
        return;
      }
      if (combatMenu === 'item') {
        if (a === 'cancel') { combatMenu = 'root'; combatItems = []; combatNote = ''; render(); return; }
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= combatItems.length) itemPick(n - 1);
        return;
      }
      // root: the four tactical verbs + parley; Esc is the unified "get me out" (flee).
      if (a === 'attack') combatAttack();
      else if (a === 'defend') combatDefend();
      else if (a === 'useitem') openItem();
      else if (a === 'subterfuge') combatSubterfuge();
      else if (a === 'talk') openTalk();
      else if (a === 'flee' || a === 'cancel') combatFlee();
      return;
    }
    if (mode === 'dungeonEnc') {
      e.preventDefault();
      const k = (e.key || '').toLowerCase();
      const enemy = dungeonEnemy;
      if (k === 'f') { // confront — a mundane single-foe fight
        pendingDungeonEnemy = enemy; dungeonEnemy = null;
        const seed = hashInt(enemy.cx | 0, enemy.cy | 0, (run.dungeon.seed ^ 0xc0ffee) >>> 0);
        beginCombat(run.life.encounterFor(enemy), seed, 'dungeon');
        render(); return;
      }
      if (k === 's') { // slip past — a NERVE-gated attempt
        const seed = hashInt(enemy.cx | 0, enemy.cy | 0, (run.dungeon.seed ^ 0x51ea) >>> 0);
        const res = run.life.sneak(enemy, session.pc, seed);
        if (res.success) { dungeonEnemy = null; encLine = '👣 you slip past, unseen'; mode = 'dungeon'; render(); return; }
        // Blown it — the fight is forced (an ambush).
        pendingDungeonEnemy = enemy; dungeonEnemy = null; sneakNote = '';
        beginCombat(run.life.encounterFor(enemy), (seed ^ 0xa11) >>> 0, 'dungeon');
        render(); return;
      }
      if (a === 'cancel') { // back away one step, out of its cell
        dungeonEnemy = null;
        const res = run.crawl.back();
        refreshMinimap();
        if (res.exited) { toOverworld(); }
        else mode = 'dungeon';
        render(); return;
      }
      return;
    }
    if (mode === 'death') {
      e.preventDefault();
      if (a === 'confirm') { deathInfo = null; toOverworld(); render(); }
      return;
    }
    if (mode === 'building') {
      e.preventDefault();
      // Sell-offer overlay captures input first.
      if (sellOverlay) {
        if (a === 'confirm') {
          const res = shop.sell(sellOverlay.offer, session);
          shopState.message = res.ok ? res.line : (shopRegister.sell_empty || '[SEED] you have nothing the dealer wants to carry away');
          sellOverlay = null;
          logEvent('shop', { mode: 'building', outcome: res.ok ? `sold for ${res.amount}` : 'refused' });
        } else if (a === 'cancel') {
          sellOverlay = null;
          shopState.message = '';
        }
        render();
        return;
      }
      if (a === 'cancel' || a === 'confirm') { building = null; shopState = null; mode = 'city'; render(); return; }
      // [S] opens the dealer's offer for 1-3 of your items.
      if (e.key === 's' || e.key === 'S') {
        const offer = shopState.sellOffer || shop.makeSellOffer(session.items(), shopState.buildingId, world.seed, Math.floor(tick / 200));
        if (offer && offer.length) {
          const total = offer.reduce((s, o) => s + o.amount, 0);
          sellOverlay = { offer, total };
        } else {
          shopState.message = shopRegister.sell_empty || '[SEED] you have nothing the dealer wants to carry away';
        }
        render();
        return;
      }
      // Number keys buy a stock item by index.
      if (shopState && shopState.stock.length && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < shopState.stock.length) {
          const res = shop.buy(shopState.stock[idx], session);
          shopState.message = res.ok ? res.line : res.refusal;
          if (res.ok) {
            // Remove the bought item from the live stock so it can't be rebought.
            shopState.stock.splice(idx, 1);
            logEvent('shop', { mode: 'building', outcome: `bought ${stripSeed(res.item.name)}` });
          }
        }
        render();
        return;
      }
      return;
    }
    if (mode === 'city') {
      e.preventDefault();
      cityNote = '';
      if (a === 'cancel') { toOverworld(); render(); return; }
      if (a === 'talk') { openSocialTalk(); return; }
      const dir = dirFor(e.key);
      if (!dir) return;
      const r = city.stroll.move(dir);
      game.bumpTick();
      if (r.exited) { toOverworld(); render(); return; }
      if (r.building) {
        building = enterBuilding(r.building, city);
        logEvent('building', { mode: 'city', outcome: `${building.service}: ${building.effect || 'talk'}` });
        if (building.effect === 'joined') refreshCapacityWithFeedback(); // a new ladder rung (E6)
        if (building.service === 'shop') {
          shopState = { stock: building.stock || [], sellOffer: building.sellOffer || null, message: '', buildingId: building.buildingId || r.building.id };
        } else {
          shopState = null;
        }
        mode = 'building';
      }
      render();
      return;
    }
    if (mode === 'overworld') {
      owNote = '';
      // [E] interact enters the site you stand on; [Space] confirms too (forgiving).
      if ((a === 'interact' || a === 'confirm') && party.site()) {
        e.preventDefault();
        const here = party.site();
        if (here.kind === 'city') { city = enterCity(here); mode = 'city'; }
        else if (!manual.canEnter(here)) {
          owNote = stripSeed(manual.denyReason(here) || '[SEED] the manual bars this threshold');
          audio.sfx('bump');
        }
        else { run = enterSite(here); encLine = ''; mode = 'dungeon'; }
        render();
        return;
      }
      if (a === 'rest') {
        // Playtest2 rest gating: the open field refuses to rest. Recovery outside a
        // safe location (inn/shrine) is consumable-only. Voice a seeded register refusal
        // and do NOT advance the clock or roll the ambush tail.
        e.preventDefault();
        const rres = session.rest('camp');
        if (!rres.ok) {
          const lines = register.rest_refused_wild || ['[SEED] the field offers no bed'];
          const refSeed = hashInt(party.x, party.y, (world.seed ^ 0x70c5) >>> 0);
          owNote = stripSeed(lines[refSeed % lines.length]);
          logEvent('rest', { mode: 'overworld', outcome: 'refused in the wild' });
          render(); return;
        }
        // Safe-location rests are handled by entering inn/shrine buildings; this path
        // should never heal because 'camp' is always refused.
        owNote = '[SEED] the field offers no bed';
        render(); return;
      }
      if (a === 'talk') { e.preventDefault(); openSocialTalk(); return; }
      if (a === 'save') {
        e.preventDefault();
        stashDungeonMap();
        try {
          registry.saveWorldSave(activeWorld.id, { save: game.save(), scheme: SCHEME });
          registry.save(registry.touch(registry.load(), activeWorld.id));
          owNote = '[SEED] the operation is filed';
        } catch (_) { owNote = '[SEED] the filing cabinet is locked'; }
        render(); return;
      }
      if (a === 'load') {
        e.preventDefault();
        try { owNote = loadSave() === 'ok' ? '[SEED] the record is reinstated' : '[SEED] no such record on file'; } catch (_) { owNote = '[SEED] the record refuses to reinstate'; }
        render(); return;
      }
      const dir = dirFor(e.key);
      if (!dir) return;
      e.preventDefault();
      const mv = party.tryMove(dir);
      // ENCOUNTERS LOCK: the tail rolls per crawl STEP, and a blocked bump is
      // not a step — no tick, no wanderer turn, no roll (the dungeon path's
      // `stepped` gate, applied here). But it IS worth a word (A3): a seeded,
      // in-voice line so "can't go there" reads as world, not as a dead key.
      if (!mv.moved) {
        // E2: a blocked step onto an unopened GATE — spend a tagged work-item to open
        // it (a permanent world fact), or be told what the crossing needs. No carried
        // key ever gates passability after opening (ADDENDUM #3).
        const g = mv.blocked && world.gateAt(mv.blocked.x, mv.blocked.y);
        if (g && !world.isGateOpen(g.id)) {
          const item = session.items().find((it) => Array.isArray(it.tags) && it.tags.includes(g.requiresTag));
          if (item) {
            session.dropItem(item.uid);
            world.openGate(g.id);
            session.noteGateOpened();
            game.mapState.knowGate(g);
            refreshCapacityWithFeedback(); // opening a gate is the XP (E6)
            owNote = `[SEED] you lay ${stripSeed(item.name)} across ${stripSeed(g.label)} — the way opens for good`;
            logEvent('gate', { mode: 'overworld', outcome: `opened ${stripSeed(g.label)}` });
            audio.sfx('cache');
          } else {
            game.mapState.knowGate(g);
            owNote = `[SEED] ${stripSeed(g.label)} bars the way — you would need ${g.requiresTag} to cross`;
            audio.sfx('bump');
          }
          render(); return;
        }
        const lockedSite = mv.blocked && world.siteAt(mv.blocked.x, mv.blocked.y);
        if (lockedSite && !manual.passable(lockedSite)) {
          owNote = manual.denyReason(lockedSite);
          audio.sfx('bump');
          render(); return;
        }
        owNote = blockedLine(mv.blocked); audio.sfx('bump'); render(); return;
      }
      game.bumpTick();
      // Did the party walk INTO a wanderer (chase)? Resolve it; a beast fight
      // takes over the frame. Otherwise the wanderers take their turn — one may
      // step onto the party (caught). Beasts fight, NPCs greet.
      let walked = wanderers.take(party.x, party.y);
      if (walked && overworldContact(walked)) { render(); return; }
      const caught = wanderers.step(party.x, party.y);
      if (caught.length) {
        const beast = caught.find((m) => m.kind === 'beast');
        if (beast) { overworldContact(beast); render(); return; }
        overworldContact(caught[0]);
      }
      // Invisible tail (both-layers lock): after the visible wanderers, the rare
      // biome-flavored ambush/cache/ambient-event roll. A fight takes the frame;
      // a cache or ambient event just annotates the country line.
      const ev = overworldStep();
      if (ev.enc && ev.enc.kind === 'fight') {
        const eseed = hashInt(party.x, party.y, (world.seed ^ 0x0e5e11) >>> 0);
        beginCombat(ev.enc, eseed, 'overworld');
        render();
        return;
      }
      if (ev.enc && ev.enc.kind === 'cache') { owNote = collectCache(ev.enc); logEvent('cache', { mode: 'overworld', seed: hashInt(party.x, party.y, world.seed), outcome: stripSeed(owNote) }); }
      else if (ev.note) { owNote = ev.note; logEvent('ambient', { mode: 'overworld', outcome: stripSeed(ev.note) }); }
      render();
      return;
    }
    // dungeon crawl: W/S forward-back, A/D turn, N toggles minimap, Esc leaves.
    e.preventDefault();
    if (a === 'map') { showMinimap = !showMinimap; render(); return; }
    if (a === 'cancel') { toOverworld(); render(); return; }
    const dir = dirFor(e.key);
    if (!dir) return;
    let stepped = false;
    let res = null;
    if (dir === 'N') { res = run.crawl.forward(); }
    else if (dir === 'S') { res = run.crawl.back(); }
    else if (dir === 'W') { run.crawl.turnLeft(); refreshMinimap(); }
    else if (dir === 'E') { run.crawl.turnRight(); refreshMinimap(); }
    if (res) {
      refreshMinimap();
      if (res.exited) { toOverworld(); render(); return; }
      // Operation 3 interior gate: a blocked step onto an unopened authored gate may
      // spend a tagged item from the pack, opening the door as a permanent fact for
      // this delve. No item → the door names what it needs.
      if (!res.moved) {
        const g = run.dungeon.gateAt && run.dungeon.gateAt(res.blocked.x, res.blocked.y);
        if (g && !run.dungeon.isGateOpen(g.id)) {
          const item = session.items().find((it) => Array.isArray(it.tags) && it.tags.includes(g.requiresTag));
          if (item) {
            session.dropItem(item.uid);
            run.dungeon.openGate(g.id);
            run.minimap.markFeature(g.x, g.y, 'gate');
            encLine = `[SEED] you spend ${stripSeed(item.name)} at ${stripSeed(g.label)} — the door opens`;
            audio.sfx('cache');
            res = run.crawl.forward();
            refreshMinimap();
            if (res.exited) { toOverworld(); render(); return; }
          } else {
            encLine = `[SEED] ${stripSeed(g.label)} needs ${g.requiresTag}`;
            audio.sfx('bump');
            render(); return;
          }
        } else {
          encLine = '[SEED] the way is shut.';
          audio.sfx('bump');
          render(); return;
        }
      }
      stepped = true;
    }
    // A step into a new tile is the random-encounter surface (ENCOUNTERS LOCK).
    // A fight drops into combat mode; caches/mundane just annotate the crawl.
    if (stepped) {
      game.bumpTick();
      session.accrueExposure(0.025);
      // Structure Arc slice 1 (LOCK 2): an authored MILESTONE at this exact tile,
      // if any, resolves first and on its own — never gated behind combat or the
      // ambush roll, so a run through an authored dungeon cannot dead-end on
      // loot luck. Procedural dungeons carry no takeMilestoneAt and fall through
      // to the unchanged foe/ambush handling below.
      const milestone = run.dungeon.takeMilestoneAt ? run.dungeon.takeMilestoneAt(run.crawl.x, run.crawl.y) : null;
      if (milestone) {
        session.addItem(normalizeItem({ kind: milestone.kind, name: milestone.description, artifact: milestone.artifact, tags: milestone.tags }));
        audio.sfx('cache');
        run.minimap.markFeature(run.crawl.x, run.crawl.y, 'cache');
        encLine = `⚑ ${stripSeed(milestone.description)} — into the pack`;
      } else {
        // Visible dungeon enemy in the cell you stepped into (M8 §5): raise the
        // confront/sneak prompt BEFORE the invisible ambush roll — a foe you can
        // see always resolves first.
        const foe = run.life && run.life.atTile(run.crawl.x, run.crawl.y);
        if (foe) { dungeonEnemy = foe; sneakNote = ''; mode = 'dungeonEnc'; render(); return; }
        const enc = stepEncounter(run);
        if (enc && enc.kind === 'fight') {
          run.minimap.markFeature(run.crawl.x, run.crawl.y, 'encounter');
          beginCombat(enc); render(); return;
        }
        if (enc && enc.kind === 'cache') {
          encLine = collectCache(enc);
          run.minimap.markFeature(run.crawl.x, run.crawl.y, 'cache');
        } else {
          encLine = encSummary(enc);
        }
      }
    }
    render();
  }
  window.addEventListener('keydown', onKey);

  // #title h1 was removed (in-canvas title screen carries the brand); update it
  // only if a host page still provides one.
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.textContent = register.title;
  render();

  // Test conduit — headless render smoke only (the browser ignores this return).
  // Drives every render path with REAL game state so a broken frame/panel/console
  // draw fails CI. `renderMode` sets up a mode via the actual game helpers.
  function renderMode(m) {
    // chp-worldgen: sites are procedurally placed per-world now, so this test conduit
    // must pull from the LIVE world's registry (`world.listSites()`), never the static
    // master.json fixture — the two diverge as soon as a random seed places sites
    // anywhere other than master.json's hand-authored coordinates.
    if (m === 'dungeon' || m === 'combat' || m === 'dungeonEnc') {
      const sites = world.listSites();
      const target = sites.find((s) => s.kind === 'dungeon') || sites.find((s) => manual.canEnter(s));
      // Preserve this conduit’s historical deterministic fixture while honoring
      // the production gate: advance only the operations preceding its chosen site.
      for (const row of manual.list()) {
        if (!row.site || row.site.id === target.id) break;
        session.clearSite(row.site.id);
      }
      run = enterSite(target);
      encLine = ''; mode = 'dungeon';
      if (m === 'dungeonEnc') {
        dungeonEnemy = run.life.list()[0] || { beingId: 'cave-rat', name: 'a shape', cx: 0, cy: 0 };
        sneakNote = ''; mode = 'dungeonEnc';
      }
      if (m === 'combat') {
        let enc = null;
        for (let i = 0; i < 1200 && !(enc && enc.kind === 'fight'); i++) enc = stepEncounter(run);
        if (enc && enc.kind === 'fight') beginCombat(enc);
      }
    } else if (m === 'city' || m === 'building') {
      const sites = world.listSites();
      city = enterCity(sites.find((s) => s.kind === 'city') || sites[0]);
      if (m === 'building') { building = enterBuilding(city.city.buildings[0], city); mode = 'building'; }
      else mode = 'city';
    } else {
      if (m === 'death') deathInfo = { fallen: session.pc.name, portrait: session.pc.portrait };
      mode = m;
    }
    render();
    return mode;
  }
  return { onKey, applyDisplay, render, renderMode, canvas, frame: () => frame, game, get mode() { return mode; } };
}

// Modules are deferred (DOMContentLoaded still pending); the single-file build
// may run as a sync end-of-body script — handle both.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
  else boot();
}
