// The gods layer for INNSMOUTH 2000 (M6): favor tracks and appeasement.
//
// Each god has a FAVOR track in [0, 100]. Favor decays every month (the gods hunger, and dread
// feeds that hunger); the player's appeasement acts push it back up. When a track falls to the
// wrath floor, that god's WRATH fires (src/disasters.js) and the god is sated for a while. This
// module is pure over sim + map state (no canvas, no DOM) so node --test covers every rule.
//
// The five gods and their appeasement paths (DESIGN-SEED "Gods as disasters"):
//   Dagon         -- the Harbor Tithes ordinance and shrines set by the water (wharf offerings).
//   Cthulhu       -- the end-game clock. Favor only DELAYS the Awakening; asylums, universities,
//                    and shrines slow the dreaming, but the creep never stops.
//   Shub-Niggurath-- grove shrines on open, undeveloped land.
//   Nyarlathotep  -- the Masked Processions ordinance and a strong constabulary.
//   Yog-Sothoth   -- the university and its Containment Wing.

import { isWaterTerrain, waterWithin, clampRange } from './tools.js';

export const GOD = {
  DAGON: 'dagon',
  CTHULHU: 'cthulhu',
  SHUB: 'shub',
  NYARLATHOTEP: 'nyarlathotep',
  YOG: 'yog',
};

// Fixed order: the favor panel and the disasters menu both iterate this.
export const GOD_LIST = ['dagon', 'cthulhu', 'shub', 'nyarlathotep', 'yog'];

export const GOD_INFO = {
  dagon: {
    label: 'Dagon',
    wrath: 'The Flood Tide',
    blurb: 'Lord of the deep. His tide drowns the shore and his Deep Ones rise from it.',
    appease: 'Keep the Harbor Tithes and raise shrines by the water.',
    // The omen: what the town sees BEFORE the wrath breaks. Shown when a track sinks to the omen
    // stage, so the player is warned by the world, never only by the disaster itself.
    omen: 'The tide runs high and black against the wharves.',
    dire: 'The sea heaves at the seawall. Dagon will have the shore.',
  },
  cthulhu: {
    label: 'Cthulhu',
    wrath: 'The Awakening',
    blurb: 'He lies dreaming. His waking breaks the town and unseats every mind. Favor only delays it.',
    appease: 'Asylums, shrines, and the university slow the dreaming. Nothing halts it.',
    omen: 'The townsfolk share one dream, and wake unrested.',
    dire: 'The dreaming is nearly ended. He stirs in his house at R’lyeh.',
  },
  shub: {
    label: 'Shub-Niggurath',
    wrath: 'The Greening',
    blurb: 'The Black Goat of the Woods. Her growth devours the streets block by block.',
    appease: 'Set grove shrines on open, undeveloped land.',
    omen: 'Strange shoots break the cobbles, and the air turns green and thick.',
    dire: 'The ground crawls with growth. The Black Goat is upon the streets.',
  },
  nyarlathotep: {
    label: 'Nyarlathotep',
    wrath: 'The Burning',
    blurb: 'The Crawling Chaos. He looses fire and riot to run through the streets.',
    appease: 'Hold the Masked Processions and keep a strong constabulary.',
    omen: 'Crowds gather muttering after dark, and torches move in the lanes.',
    dire: 'The mob has the streets and the torches are lit. Fire is coming.',
  },
  yog: {
    label: 'Yog-Sothoth',
    wrath: 'The Rift',
    blurb: 'The gate and the key. His rift scrambles a whole district out of true.',
    appease: 'Raise the university and its Containment Wing.',
    omen: 'Angles fall wrong where the streets meet. Distances do not hold.',
    dire: 'The air splits along a seam of cold violet. The gate is opening.',
  },
};

export const FAVOR_START = 70; // each track opens here: uneasy, with years of grace to appease
export const FAVOR_MAX = 100;
export const WRATH_AT = 0; // favor floor that triggers a wrath
export const POST_WRATH_FAVOR = 45; // sated after the god has struck

// Hunger: the base monthly favor loss, plus a share driven by the town's dread. A calm, neglected
// town has years before a god turns (grace to raise the appeasement it needs); a dreadful town is
// stirred far faster, so real dread makes the gods a live threat.
const BASE_HUNGER = 1.0;
const DREAD_HUNGER = 0.045; // at dread 60 this adds ~2.7 (hunger nearly quadruples)

// Cthulhu is not appeased, only delayed: his track creeps down every month no matter what, and
// the town's holy works merely slow the creep toward a floor it never falls below.
const CTHULHU_CREEP = 0.55;
const CTHULHU_FLOOR = 0.12;

// The Cthulhu doom clock (M8). His wrath, the Awakening, is not a stalling loop but a tightening
// clock toward a true end. Each Awakening recovers LESS favor than the last, so the next comes
// sooner; the Awakenings escalate in ruin; and after DOOM_AWAKENINGS of them the dreamer fully
// wakes and the town is lost (sim.ended). The SHAPE and counts here are an operator taste call
// (flagged in the ratify notes); that the clock must END, not stall forever, is not.
export const DOOM_AWAKENINGS = 4; // the Awakening that ends the town
const CTHULHU_RECOVERY_BASE = 45; // favor restored after the first Awakening (was the flat POST_WRATH)
const CTHULHU_RECOVERY_STEP = 9; // each further Awakening restores this much less (clock tightens)
const CTHULHU_RECOVERY_MIN = 12; // ...down to this floor, so late Awakenings come fast but not instant

// The favor Cthulhu recovers to after his n-th Awakening (n = 1 for the first). Shrinks with each.
export function cthulhuRecovery(n) {
  return clampRange(CTHULHU_RECOVERY_BASE - (n - 1) * CTHULHU_RECOVERY_STEP, CTHULHU_RECOVERY_MIN, CTHULHU_RECOVERY_BASE);
}

// A fresh favor record (all gods at the opening value).
export function makeFavor() {
  const f = {};
  for (const g of GOD_LIST) f[g] = FAVOR_START;
  return f;
}

// Survey the map for the placements that feed appeasement. A shrine counts toward Dagon (a wharf
// offering) when it stands within two tiles of water, otherwise toward Shub-Niggurath (a grove on
// the open land). Constabularies and universities count for Nyarlathotep and Yog-Sothoth.
export function surveyTown(map) {
  const s = { shrineWater: 0, shrineGrove: 0, constabulary: 0, university: 0, asylum: 0, chapel: 0 };
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const t = map.tiles[map.index(col, row)];
      if (!t || !t.structure) continue;
      const kind = t.structure.kind;
      if (kind === 'shrine') {
        if (waterWithin(map, col, row, 2)) s.shrineWater++;
        else s.shrineGrove++;
      } else if (s[kind] !== undefined) {
        s[kind]++;
      }
    }
  }
  return s;
}


// Diminishing returns on stacked appeasement (M8): the k-th same-kind structure appeases less than
// the one before it, so favor from stacking saturates instead of scaling linearly forever. The
// k-th structure contributes `per * ratio^(k-1)`, so a stack of N totals per*(1-ratio^N)/(1-ratio)
// and approaches a ceiling of per/(1-ratio). This keeps the tax-base-vs-favor dial live all game: a
// rich town cannot trivially max four gods by carpeting the map with shrines; at real dread the
// hunger outruns even a saturated stack, so appeasement must be actively maintained.
export const STACK_RATIO = 0.6;
export function diminishing(count, per) {
  if (count <= 0) return 0;
  return per * (1 - Math.pow(STACK_RATIO, count)) / (1 - STACK_RATIO);
}

// The monthly favor change for one god, given the town survey and the current dread. Positive is
// appeasement (favor rises); negative is neglect (favor falls). Cthulhu is always negative.
export function favorDelta(god, survey, sim) {
  if (god === GOD.CTHULHU) {
    // The dreaming is only ever slowed, and each further holy work slows it less (diminishing).
    const slow = diminishing(survey.asylum, 0.15)
      + diminishing(survey.shrineWater + survey.shrineGrove, 0.1)
      + diminishing(survey.university, 0.2);
    return -Math.max(CTHULHU_FLOOR, CTHULHU_CREEP - slow) * (sim.wrathPace ?? 1); // delayed, never appeased
  }
  const hunger = BASE_HUNGER + sim.dread * DREAD_HUNGER;
  let appease = 0;
  if (god === GOD.DAGON) {
    appease = (sim.ordinances.harborTithes ? 4 : 0) + diminishing(survey.shrineWater, 3);
  } else if (god === GOD.SHUB) {
    appease = diminishing(survey.shrineGrove, 3);
  } else if (god === GOD.NYARLATHOTEP) {
    appease = (sim.ordinances.maskedProcessions ? 4 : 0) + diminishing(survey.constabulary, 3);
  } else if (god === GOD.YOG) {
    appease = diminishing(survey.university, 5);
  }
  const delta = appease - hunger;
  return delta < 0 ? delta * (sim.wrathPace ?? 1) : delta;
}

// Advance every favor track one month. Mutates sim.favor and returns the list of gods whose track
// reached the wrath floor this step (worst first), for the caller to fire.
export function stepFavor(sim) {
  const survey = surveyTown(sim.map);
  const fired = [];
  for (const god of GOD_LIST) {
    sim.favor[god] = clampRange(sim.favor[god] + favorDelta(god, survey, sim), 0, FAVOR_MAX);
    if (sim.favor[god] <= WRATH_AT) fired.push(god);
  }
  // Worst-neglected first is deterministic (GOD_LIST order breaks ties).
  return fired;
}

// The wrath forecast ritual (M7): the town must feel a god's anger BEFORE the wrath breaks, never
// only from the disaster. Each favor track passes through named stages as it sinks. The omen and
// dire stages surface an ambient tell (a herald line, a status-strip omen, degrading shrine art).
export const FAVOR_STAGE = { CALM: 'calm', UNEASY: 'uneasy', OMEN: 'omen', DIRE: 'dire' };
export const OMEN_AT = 30; // at or below this the town sees an omen (the visible warning)
export const DIRE_AT = 12; // at or below this the wrath is imminent
const UNEASY_AT = 50;

// The stage a single favor value falls in.
export function favorStage(favor) {
  if (favor <= DIRE_AT) return FAVOR_STAGE.DIRE;
  if (favor <= OMEN_AT) return FAVOR_STAGE.OMEN;
  if (favor <= UNEASY_AT) return FAVOR_STAGE.UNEASY;
  return FAVOR_STAGE.CALM;
}

// How far into the "danger band" (0 at the uneasy line, 1 at the wrath floor) a favor value sits.
// The renderer reads this to degrade a god's shrine/structure art in proportion to the anger.
export function dangerFraction(favor) {
  if (favor >= UNEASY_AT) return 0;
  return clampRange((UNEASY_AT - favor) / UNEASY_AT, 0, 1);
}

// Survey every god's favor and return the forecast: a per-god reading (favor, stage, danger, and
// the omen/dire herald line where it applies) sorted worst-first, plus the single most urgent omen
// line for the status strip. Pure over sim.favor; the UI and renderer both read this.
export function wrathForecast(sim) {
  const gods = GOD_LIST.map((god) => {
    const favor = sim.favor[god];
    const stage = favorStage(favor);
    const info = GOD_INFO[god];
    let herald = null;
    if (stage === FAVOR_STAGE.DIRE) herald = info.dire;
    else if (stage === FAVOR_STAGE.OMEN) herald = info.omen;
    return {
      god, favor, stage, danger: dangerFraction(favor),
      label: info.label, wrath: info.wrath, herald,
    };
  });
  gods.sort((a, b) => a.favor - b.favor); // angriest (lowest favor) first
  const omens = gods.filter((g) => g.stage === FAVOR_STAGE.OMEN || g.stage === FAVOR_STAGE.DIRE);
  const worst = gods[0];
  // The status-strip line: the most urgent omen, if any god has reached the omen stage.
  const omenLine = omens.length ? omens[0].herald : null;
  return { gods, omens, worst, omenLine };
}


