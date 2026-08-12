// Discordian prose engine — a browser-native JS port of Veridian Contraption's
// prose_gen.rs (Ray's own game; the clean-room rule binds Cyclopean only, so VC
// may be copied freely). Word pools live in data/register/pools.json; the clause
// builders and register-mixing composition live here as a small pure module,
// seeded off the world PRNG like everything else in the stack.
//
// The defining move (operator direction 2026-08-02): MIX ALL FIVE REGISTERS —
// Clinical, Lyrical, Ominous, Conspiratorial, Bureaucratic — selected per
// utterance rather than one global register. The Illuminatus! feel comes from
// the collision of registers within a single description, not from any one.
//
// Every string this engine emits is prefixed `[SEED] ` — generated prose is
// still draft, subject to the operator's voice pass (CLAUDE.md rule 5).
import { mulberry32, hashInt, hash2 } from './prng.js';

export const REGISTERS = ['clinical', 'lyrical', 'ominous', 'conspiratorial', 'bureaucratic'];

const SEED_TAG = '[SEED] ';

export function createProse(pools) {
  if (!pools || typeof pools !== 'object') throw new Error('createProse: pools object required');
  for (const r of REGISTERS) {
    if (!pools.verbs?.[r]?.length) throw new Error(`createProse: verbs.${r} pool missing/empty`);
    if (!pools.nouns?.[r]?.length) throw new Error(`createProse: nouns.${r} pool missing/empty`);
  }
  if (!pools.temporal_hedges?.length) throw new Error('createProse: temporal_hedges pool required');
  for (const k of ['mundane', 'absurdist', 'impossible']) {
    if (!pools.causes?.[k]?.length) throw new Error(`createProse: causes.${k} pool required`);
  }

  // --- primitives ---------------------------------------------------------
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo)); // [lo,hi)
  const chance = (rng, p) => rng() < p;

  const verb = (reg, rng) => pick(pools.verbs[reg], rng);
  const noun = (reg, rng) => pick(pools.nouns[reg], rng);
  const hedge = (rng) => pick(pools.temporal_hedges, rng);

  // pick_cause: higher weirdness pulls toward absurdist, then impossible causes.
  function cause(weirdness, rng) {
    if (weirdness > 0.8 && chance(rng, 0.4)) return pick(pools.causes.impossible, rng);
    if (weirdness > 0.4 || chance(rng, weirdness)) return pick(pools.causes.absurdist, rng);
    return pick(pools.causes.mundane, rng);
  }

  // Register mixing: weighted per-utterance selection. Bureaucratic is the
  // substrate; low weirdness favours Clinical/Bureaucratic, high weirdness
  // lifts Ominous/Conspiratorial (and a little Lyrical). Deterministic.
  function pickRegister(rng, weirdness) {
    const w = Math.max(0, Math.min(1, weirdness ?? 0.5));
    const weights = {
      bureaucratic: 1.0,
      clinical: 1.0 - 0.5 * w,
      lyrical: 0.5 + 0.5 * w,
      ominous: 0.3 + 1.2 * w,
      conspiratorial: 0.3 + 1.5 * w,
    };
    let total = 0;
    for (const r of REGISTERS) total += weights[r];
    let roll = rng() * total;
    for (const r of REGISTERS) {
      roll -= weights[r];
      if (roll < 0) return r;
    }
    return 'bureaucratic';
  }

  // --- subordinate clause builders (ported per register) ------------------
  function clause(reg, loc, weirdness, rng) {
    switch (reg) {
      case 'bureaucratic': return bureaucraticClause(loc, weirdness, rng);
      case 'clinical': return clinicalClause(loc, weirdness, rng);
      case 'lyrical': return lyricalClause(loc, rng);
      case 'ominous': return ominousClause(loc, rng);
      case 'conspiratorial': return conspiratorialClause(loc, weirdness, rng);
      default: return bureaucraticClause(loc, weirdness, rng);
    }
  }

  function bureaucraticClause(loc, w, rng) {
    switch (rint(rng, 0, 14)) {
      case 0: return `whose previous ${noun('bureaucratic', rng)} remained unresolved`;
      case 1: return `whose standing in ${loc} was a matter of some administrative ambiguity`;
      case 2: return `which had been the subject of a ${noun('bureaucratic', rng)} prior to the matter in question`;
      case 3: return `whose documentation the office of ${loc} had ${verb('bureaucratic', rng)} on three prior occasions`;
      case 4: return `against which a ${noun('bureaucratic', rng)} had been ${verb('bureaucratic', rng)} but never resolved`;
      case 5: return `whose file contained a marginal annotation reading 'see also: ${cause(w, rng)}'`;
      case 6: return `which the records of ${loc} listed under two distinct and contradictory entries`;
      case 7: return `whose relationship to the matter was described as 'provisional'`;
      case 8: return `which had been ${verb('bureaucratic', rng)} by the relevant authorities ${hedge(rng)}`;
      case 9: return `having previously declined three formal invitations to be surveyed`;
      case 10: return `a designation that would later be described as administratively convenient`;
      case 11: return `whose standing remained the subject of ${rint(rng, 5, 30)} outstanding objections`;
      case 12: return `which the committee declined to record on grounds it found metaphysically objectionable`;
      default: return `whose presence in ${loc} the ${noun('bureaucratic', rng)} had not yet formally acknowledged`;
    }
  }

  function clinicalClause(loc, w, rng) {
    switch (rint(rng, 0, 10)) {
      case 0: return `whose profile deviated from the documented baseline by a margin the ${noun('clinical', rng)} termed 'notable'`;
      case 1: return `whose prior ${noun('clinical', rng)} in the records of ${loc} contained several unresolved annotations`;
      case 2: return `a site whose patterns had been flagged for longitudinal study`;
      case 3: return `whose presence in ${loc} had been ${verb('clinical', rng)} in the field notes of three separate surveys`;
      case 4: return `a case previously cross-referenced under ${cause(w, rng)}`;
      case 5: return `whose taxonomic classification remained, at best, provisional`;
      case 6: return `which the ${noun('clinical', rng)} of ${loc} had placed under ongoing observation`;
      case 7: return `a location exhibiting no fewer than four anomalous characteristics`;
      case 8: return `whose ${noun('clinical', rng)} contained data that contradicted its own methodology`;
      default: return `a specimen the literature had not anticipated`;
    }
  }

  function lyricalClause(loc, rng) {
    switch (rint(rng, 0, 10)) {
      case 0: return `whose name had once carried weight in ${loc}, though the weight had since shifted`;
      case 1: return `which sat as though the ground remembered a different arrangement`;
      case 2: return `in which ${loc} had invested a kind of quiet expectation that was never quite fulfilled`;
      case 3: return `whose shadow arrived slightly before the rest of it`;
      case 4: return `about which songs had been composed and then, for reasons unexplained, abandoned`;
      case 5: return `absent from ${loc} long enough for the absence to acquire a character of its own`;
      case 6: return `whose presence altered the quality of the available silence`;
      case 7: return `which carried the particular certainty of a place that has been wrong before in exactly this way`;
      case 8: return `for which ${loc} had always been more of a direction than a destination`;
      default: return `whose name, spoken aloud, seemed to occupy slightly more space than it should`;
    }
  }

  function ominousClause(loc, rng) {
    switch (rint(rng, 0, 10)) {
      case 0: return `whose name had been struck from the records of ${loc} once before`;
      case 1: return `about which the authorities had received warnings they chose not to file`;
      case 2: return `whose discovery had been anticipated by no one who would admit to it`;
      case 3: return `which ${loc} had cause to remember, and cause to wish otherwise`;
      case 4: return `whose prior visitors had left marks that did not heal in the conventional sense`;
      case 5: return `against which the evidence was considerable but the witnesses were fewer`;
      case 6: return `whose ${noun('ominous', rng)} was sealed for reasons the office would not discuss`;
      case 7: return `which had survived events the records describe only as 'concluded'`;
      case 8: return `whose shadow, according to one account, had been seen arriving separately`;
      default: return `whose previous season in ${loc} had ended in a manner the survivors declined to specify`;
    }
  }

  function conspiratorialClause(loc, w, rng) {
    switch (rint(rng, 0, 10)) {
      case 0: return `whose official records in ${loc} contradicted at least two unofficial ones`;
      case 1: return `about which a ${noun('conspiratorial', rng)} had been circulated among parties who deny receiving it`;
      case 2: return `whose stated purpose was, according to certain sources, a cover for the actual one`;
      case 3: return `which had been ${verb('conspiratorial', rng)} by at least one organization that claims not to exist`;
      case 4: return `whose connections to ${loc} were, officially, coincidental (the word 'officially' doing considerable work in that sentence)`;
      case 5: return `a detail several parties found interesting for reasons they were not prepared to share`;
      case 6: return `which maintained affiliations that overlapped in ways the ${noun('conspiratorial', rng)} described as 'merely geometrical'`;
      case 7: return `whose approaches had been ${verb('conspiratorial', rng)} by parties operating under ${cause(w, rng)}`;
      case 8: return `whose name appeared on three separate lists maintained by organizations unaware of each other's existence`;
      default: return `about which the less said the better, though this has not prevented the ${noun('conspiratorial', rng)} of ${loc} from saying quite a lot`;
    }
  }

  // Event-flavored tail clause (ported from event_subordinate_clause).
  function eventClause(reg, w, rng) {
    switch (reg) {
      case 'bureaucratic':
        switch (rint(rng, 0, 8)) {
          case 0: return `a development the office attributed to ${cause(w, rng)}`;
          case 1: return `which was ${verb('bureaucratic', rng)} without further comment`;
          case 2: return `a matter the relevant ${noun('bureaucratic', rng)} considered closed`;
          case 3: return `the consequences of which remain ${hedge(rng)}`;
          case 4: return `a fact that surprised no one who had been paying attention to the paperwork`;
          case 5: return `which the ${noun('bureaucratic', rng)} described as 'within the anticipated range of outcomes'`;
          case 6: return `an outcome the relevant procedures had technically permitted all along`;
          default: return `though the ${noun('bureaucratic', rng)} has yet to issue a formal response`;
        }
      case 'clinical':
        switch (rint(rng, 0, 6)) {
          case 0: return `consistent with the patterns ${verb('clinical', rng)} in the most recent ${noun('clinical', rng)}`;
          case 1: return `a data point that warranted inclusion in the ongoing study`;
          case 2: return `which the ${noun('clinical', rng)} noted without interpretation`;
          case 3: return `an outcome that fell within the third standard deviation`;
          case 4: return `a result the methodology had not been designed to produce`;
          default: return `which was ${verb('clinical', rng)} for future reference`;
        }
      case 'lyrical':
        switch (rint(rng, 0, 6)) {
          case 0: return `as though the world had briefly considered a different arrangement and then thought better of it`;
          case 1: return `a change that settled into the landscape like a word one has been trying to remember`;
          case 2: return `though whether this constituted an ending or merely a pause remained, like most things, unclear`;
          case 3: return `which carried the particular weight of things that happen exactly once`;
          case 4: return `a fact the local silence absorbed without complaint`;
          default: return `in the manner of events that are significant only to those who were not watching`;
        }
      case 'ominous':
        switch (rint(rng, 0, 6)) {
          case 0: return `and the implications were not lost on those who understood such things`;
          case 1: return `a development certain parties had been expecting for some time`;
          case 2: return `which the ${noun('ominous', rng)} received in a silence that was itself a kind of statement`;
          case 3: return `an outcome that had the quality of inevitability about it`;
          case 4: return `and what followed was precisely what follows such things`;
          default: return `though the full consequences would not become apparent for some time`;
        }
      case 'conspiratorial':
        switch (rint(rng, 0, 6)) {
          case 0: return `though the official account (which differs from at least two unofficial ones) attributes it to ${cause(w, rng)}`;
          case 1: return `a coincidence that required, by one estimate, the coordination of at least four parties`;
          case 2: return `which the ${noun('conspiratorial', rng)} found interesting enough to note but not quite interesting enough to act upon`;
          case 3: return `a development certain observers had predicted in documents that have since been misplaced`;
          case 4: return `the timing of which was, at minimum, suggestive`;
          default: return `and one is entitled to draw one's own conclusions`;
        }
      default:
        return eventClause('bureaucratic', w, rng);
    }
  }

  // --- site openers (CRPG composition layer over the ported pools/clauses) -
  // Each opener is one full sentence describing a place the party has found. It
  // embeds a subordinate/event clause whose register is picked INDEPENDENTLY
  // (the register collision), so a single opener can span two registers.
  const OPENERS = {
    bureaucratic: [
      (n, loc, w, rng) => `${n}, ${clause(pickRegister(rng, w), loc, w, rng)}, is carried on the ${noun('bureaucratic', rng)} of ${loc}.`,
      (n, loc, w, rng) => `The ${noun('bureaucratic', rng)} covering ${n} was ${verb('bureaucratic', rng)} ${hedge(rng)}.`,
      (n, loc, w, rng) => `${n} is filed against ${loc}, ${eventClause(pickRegister(rng, w), w, rng)}.`,
    ],
    clinical: [
      (n, loc, w, rng) => `${n}, ${clause(pickRegister(rng, w), loc, w, rng)}, appears in the ${noun('clinical', rng)} of ${loc}.`,
      (n, loc, w, rng) => `Field survey of ${n} records a ${noun('clinical', rng)}, ${verb('clinical', rng)} but not explained.`,
    ],
    lyrical: [
      (n, loc, w, rng) => `${n} keeps to the margin of ${loc}, ${clause(pickRegister(rng, w), loc, w, rng)}.`,
      (n, loc, w, rng) => `The ${noun('lyrical', rng)} of ${n} was ${verb('lyrical', rng)}, ${eventClause('lyrical', w, rng)}.`,
    ],
    ominous: [
      (n, loc, w, rng) => `${n} stands where the ${noun('ominous', rng)} of ${loc} was ${verb('ominous', rng)}.`,
      (n, loc, w, rng) => `${n}, ${clause(pickRegister(rng, w), loc, w, rng)}, is not a place the ${noun('ominous', rng)} of ${loc} discusses.`,
    ],
    conspiratorial: [
      (n, loc, w, rng) => `${n} does not, officially, appear in the ${noun('conspiratorial', rng)} of ${loc}. Several parties insist otherwise.`,
      (n, loc, w, rng) => `The ${noun('conspiratorial', rng)} on ${n} was ${verb('conspiratorial', rng)}, ${eventClause(pickRegister(rng, w), w, rng)}.`,
    ],
  };

  // Short second-sentence tails, one register each — the third collision.
  const TAILS = {
    bureaucratic: (w, rng) => `Entry is permitted ${hedge(rng)}.`,
    clinical: (w, rng) => `The ${noun('clinical', rng)} is ongoing.`,
    lyrical: (w, rng) => `Something here remembers a different arrangement.`,
    ominous: (w, rng) => `The door was ${verb('ominous', rng)} once before.`,
    conspiratorial: (w, rng) => `You are, of course, not reading this.`,
  };

  // --- sanitize (ported): mechanical artefact cleanup + a/an fix ----------
  function sanitize(s) {
    let result = s
      .replace(/,\./g, '.')
      .replace(/upon upon/g, 'upon')
      .replace(/The The /g, 'The ')
      .replace(/the the/g, 'the')
      .replace(/a a /g, 'a ');
    // "a apple" -> "an apple" at any word boundary.
    const chars = [...result];
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const isA = c === 'a' || c === 'A';
      if (isA && i + 2 < chars.length && chars[i + 1] === ' ' && 'aeiouAEIOU'.includes(chars[i + 2])) {
        const atBoundary = i === 0 || ' .,;:("\'—-'.includes(chars[i - 1]);
        if (atBoundary) { out += c + 'n'; continue; }
      }
      out += c;
    }
    return out;
  }

  function stripSeed(s) {
    return typeof s === 'string' && s.startsWith(SEED_TAG) ? s.slice(SEED_TAG.length) : s;
  }

  // Derive a deterministic per-site weirdness in [0,1] unless the site sets one.
  function siteWeirdness(site, worldSeed) {
    if (typeof site.weirdness === 'number') return Math.max(0, Math.min(1, site.weirdness));
    return hash2(site.x | 0, site.y | 0, (worldSeed >>> 0) ^ 0x23);
  }

  // Compose a description for an overworld site. Deterministic in (site,worldSeed):
  // same inputs always yield the same prose. Mixes up to three registers.
  function describeSite(site, worldSeed, opts = {}) {
    if (!site) throw new Error('describeSite: site required');
    const seed = hashInt(site.x | 0, site.y | 0, (worldSeed >>> 0) ^ 0x5eed);
    const rng = mulberry32(seed);
    const w = opts.weirdness ?? siteWeirdness(site, worldSeed);
    const loc = stripSeed(opts.loc) || 'the surrounding district';
    const name = stripSeed(site.name) || 'the site';

    // FULL-COLLISION treatment (operator lock): the pinned landmark refuses a
    // single register — max weirdness, an opener plus ALL FIVE register tails in
    // a seeded order, so every register collides in one description.
    if (opts.collide) return SEED_TAG + sanitize(collisionText(name, loc, rng));

    const reg1 = pickRegister(rng, w);
    const opener = pick(OPENERS[reg1], rng);
    let text = opener(name, loc, w, rng);

    // Optional second sentence in a DIFFERENT register (weirdness raises the odds).
    if (chance(rng, 0.35 + 0.4 * w)) {
      let reg2 = pickRegister(rng, w);
      if (reg2 === reg1) reg2 = REGISTERS[(REGISTERS.indexOf(reg1) + 1) % REGISTERS.length];
      text += ' ' + TAILS[reg2](w, rng);
    }

    return SEED_TAG + sanitize(text);
  }

  // Full-register-collision body (Chapel Perilous lock): weirdness pinned to 1,
  // an opener in one register, then every remaining register's tail in a seeded
  // order. Deterministic in the passed rng. All five registers always present.
  function collisionText(name, loc, rng) {
    const w = 1;
    const first = pickRegister(rng, w);
    let text = pick(OPENERS[first], rng)(name, loc, w, rng);
    // Seeded shuffle of the other four registers (Fisher–Yates on the same rng).
    const rest = REGISTERS.filter((r) => r !== first);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    for (const r of rest) text += ' ' + TAILS[r](w, rng);
    return text;
  }

  // Compose a short one-line flavor for a terrain tile the party is standing on.
  // Deterministic in (tileId,gx,gy,worldSeed); mixes registers across steps.
  function describeTerrain(tileId, gx, gy, worldSeed, opts = {}) {
    const seed = hashInt(gx | 0, gy | 0, (worldSeed >>> 0) ^ 0x7e44a17);
    const rng = mulberry32(seed);
    const w = opts.collide ? 1 : (opts.weirdness ?? 0.5);
    // Chapel rooms collide: pick every register in a seeded order onto one line.
    if (opts.collide) {
      const label = String(tileId).toLowerCase();
      const regs = REGISTERS.slice();
      for (let i = regs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [regs[i], regs[j]] = [regs[j], regs[i]]; }
      const frag = {
        bureaucratic: () => `${noun('bureaucratic', rng)} pending`,
        clinical: () => `${verb('clinical', rng)} without conclusion`,
        lyrical: () => `remembering another arrangement`,
        ominous: () => `${verb('ominous', rng)} once before`,
        conspiratorial: () => `not, of course, witnessed`,
      };
      return SEED_TAG + sanitize(`${cap(label)}: ${regs.map((r) => frag[r]()).join(', ')}.`);
    }
    const reg = pickRegister(rng, w);
    const label = String(tileId).toLowerCase();
    const lines = {
      bureaucratic: () => `${cap(label)}: ${noun('bureaucratic', rng)} pending, ${hedge(rng)}.`,
      clinical: () => `${cap(label)}, ${verb('clinical', rng)}; a ${noun('clinical', rng)} of no fixed conclusion.`,
      lyrical: () => `${cap(label)}. The ${noun('lyrical', rng)} was ${verb('lyrical', rng)}, then let go.`,
      ominous: () => `${cap(label)}. The ${noun('ominous', rng)} here was ${verb('ominous', rng)}.`,
      conspiratorial: () => `${cap(label)}. Someone ${verb('conspiratorial', rng)} the last ${noun('conspiratorial', rng)} of this place.`,
    };
    return SEED_TAG + sanitize(lines[reg]());
  }

  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  // M9 BIOMES (events + register/vibe channel): compose a short ambient event
  // line for a biome the party is traversing. Deterministic in the passed seed.
  // The biome's dominant `register` pins the tail's voice (falling back to a
  // weirdness-weighted pick); its `weirdness` scales the event flavor. The
  // subject fragment ([SEED], from data/register/biomes.json) supplies the local
  // colour. Output is [SEED]-marked like all generated prose.
  function describeBiomeEvent(biome, fragment, seed) {
    const rng = mulberry32((seed >>> 0) || 1);
    const w = Math.max(0, Math.min(1, biome && typeof biome.weirdness === 'number' ? biome.weirdness : 0.5));
    let reg = biome && biome.register;
    if (!REGISTERS.includes(reg)) reg = pickRegister(rng, w);
    const subject = stripSeed(fragment) || 'something goes unremarked';
    const name = stripSeed(biome && biome.name) || 'the country';
    const tail = eventClause(reg, w, rng);
    return SEED_TAG + sanitize(`${name}: ${subject}, ${tail}.`);
  }

  return {
    REGISTERS,
    pickRegister,
    verb, noun, cause, hedge,
    clause, eventClause,
    sanitize,
    describeSite,
    describeTerrain,
    describeBiomeEvent,
  };
}
