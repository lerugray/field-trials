// M9 genre-completeness manifest — the machine-checkable spine of the M9 audit.
//
// DESIGN-SEED M9 is the audit gate: "Enumerate and audit the rail-shooter table
// stakes against the build ... Land every gap found or defer each with a named
// reason — no silent gaps." This file IS that enumeration, as DATA, so a test can
// keep it honest: every `built` stake must point at a module file that exists on
// disk, and every `deferred` stake must carry a `reason` and a `milestone` (never a
// silent gap). docs/AUDIT-M9.md is the prose reading of this same manifest.
//
// Pure data + tiny pure helpers. No browser, no side effects — headless-auditable.

// Each stake: what the genre expects, where it lives, and its status.
//   status 'built'    -> `modules` lists the source files that implement it.
//   status 'deferred' -> `reason` (why, in plain words) + `milestone` (where it lands
//                        or that it is a named cut past the stop line). No module.
export const GENRE_STAKES = [
  // --- Core rail-shooter flight (M2) ---
  {
    id: 'rail-flight',
    label: 'On-rails flight with screen-space steering and banking',
    status: 'built',
    modules: ['src/flight/rail.js', 'src/flight/flight.js'],
  },
  {
    id: 'brake-boost-meter',
    label: 'Shared brake/boost meter that modulates rail speed',
    status: 'built',
    modules: ['src/flight/flight.js', 'src/ui/hud.js'],
  },
  {
    id: 'obstacles',
    label: 'Dodgeable field obstacles / hazards',
    status: 'built',
    modules: ['src/flight/obstacles.js'],
  },

  // --- Combat (M3) ---
  {
    id: 'blaster-convergence',
    label: 'Twin-blaster fire with shot convergence at the reticle',
    status: 'built',
    modules: ['src/combat/weapons.js', 'src/combat/projectiles.js'],
  },
  {
    id: 'charge-lock-on',
    label: 'Charge-shot lock-on (hold to charge, lock, release a fat homing bolt)',
    status: 'built',
    modules: ['src/combat/lockon.js', 'src/combat/weapons.js'],
  },
  {
    id: 'barrel-roll',
    label: 'Barrel-roll deflection with a readable shape+color cue',
    status: 'built',
    modules: ['src/combat/barrelroll.js'],
  },
  {
    id: 'enemy-waves',
    label: 'Seeded enemy waves that fly a dodgeable band and shoot back',
    status: 'built',
    modules: ['src/combat/enemies.js', 'src/combat/player.js'],
  },
  {
    id: 'explosions',
    label: 'Kill/hit feedback: shard bursts and a flash-capped screen hit',
    status: 'built',
    modules: ['src/combat/explosions.js'],
  },
  {
    id: 'damage-attribution',
    label: 'Player damage with human-readable cause-of-death attribution',
    status: 'built',
    modules: ['src/combat/player.js'],
  },

  // --- Level structure (M4) ---
  {
    id: 'sector-themes',
    label: 'Themed sectors (fog/palette/props swap per sector)',
    status: 'built',
    modules: ['src/world/sectors.js'],
  },
  {
    id: 'encounter-grammar',
    label: 'Procedural level from a seeded encounter grammar (fight/dodge/breather)',
    status: 'built',
    modules: ['src/world/grammar.js', 'src/world/level.js'],
  },
  {
    id: 'rescue-pickups',
    label: 'Rescue/pickup breather beats (heal + score pods)',
    status: 'built',
    modules: ['src/combat/pickups.js'],
  },

  // --- Run structure (M5) ---
  {
    id: 'route-map',
    label: 'Branching sector route map with in-level medal-pace gating',
    status: 'built',
    modules: ['src/run/route.js', 'src/run/medals.js'],
  },
  {
    id: 'score-medals',
    label: 'Score and per-level medals graded against level potential',
    status: 'built',
    modules: ['src/run/medals.js'],
  },

  // --- Economy + home base (M6) ---
  {
    id: 'hub-economy',
    label: 'One-currency hub economy: upgrades + contract sink',
    status: 'built',
    modules: ['src/economy/ledger.js', 'src/economy/upgrades.js'],
  },
  {
    id: 'flight-log',
    label: 'Permanent, non-resetting flight-log archive',
    status: 'built',
    modules: ['src/economy/ledger.js'],
  },
  {
    id: 'memorial-cast',
    label: 'Memorial-cast portraits + hand-authored charm-register barks',
    status: 'built',
    modules: ['src/gfx/portraits.js', 'src/run/hubvoice.js', 'src/run/briefing.js'],
  },

  // --- Wingmates (M7) ---
  {
    id: 'wingmates',
    label: 'Procedural wingmates: chatter, passive support, distress/rescue stakes',
    status: 'built',
    modules: ['src/run/wingmates.js', 'src/run/wingvoice.js', 'src/run/distress.js'],
  },
  {
    id: 'loadout-choice',
    label: 'Mid-run loadout / boon pick at each branch',
    status: 'built',
    modules: ['src/run/loadout.js'],
  },

  // --- Boss + climax (M8) ---
  {
    id: 'boss',
    label: 'Boss encounter with readable telegraphs, phases, and a fair dodge lane',
    status: 'built',
    modules: ['src/combat/boss.js'],
  },

  // --- Accessibility + QoL (M2 floor, M9 audit + remap) ---
  {
    id: 'assist-basics',
    label: 'Pause, master mute, reduced motion, FOV lock, invert-Y',
    status: 'built',
    modules: ['src/core/settings.js', 'src/ui/menu.js'],
  },
  {
    id: 'input-remap',
    label: 'Keyboard remapping + deadzone/invert-Y options menu',
    status: 'built',
    modules: ['src/input/bindings.js', 'src/ui/menu.js'],
  },
  {
    // Operator-directed M11 (default ON since M15): additive pointer aim/steer, feeding the
    // same one movement model as the stick/keys. Never required (accessibility law).
    id: 'mouse-aim',
    label: 'Mouse pointer aim/steer (additive, default ON) + sensitivity option',
    status: 'built',
    modules: ['src/input/mouse.js', 'src/ui/menu.js'],
  },
  {
    id: 'legibility-floor',
    label: 'HUD legibility floor: min-size + contrast + no color-only, as tests',
    status: 'built',
    modules: ['src/ui/legibility.js'],
  },

  // --- Audio (M9) ---
  {
    id: 'music-bed',
    label: 'Music bed playback: loop, mute-capable, bed volume, per-phase track',
    status: 'built',
    modules: ['src/audio/music.js'],
  },
  {
    id: 'ui-blips',
    label: 'Code-generated square-wave UI blips (menu / confirm feedback)',
    status: 'built',
    modules: ['src/audio/bus.js'],
  },

  // --- Named-deferred: honest gaps, each with a reason ---
  {
    id: 'bark-blips',
    label: 'Scrambled-speech bark blips paired with portrait wiggle',
    status: 'deferred',
    milestone: 'M10',
    reason:
      'The accessibility law is already satisfied now: every bark ships as an on-screen ' +
      'caption (the required visual equivalent). The blip-plus-portrait-wiggle layer is ' +
      'ambient living-world flavor, which is exactly M10 scope (hub-screen idle animation, ' +
      'hangar chatter). Landing it here would pull M10 work forward, not close an M9 gap.',
  },
  {
    id: 'all-range-levels',
    label: 'All-range (free-flight) normal levels',
    status: 'deferred',
    milestone: 'named-cut',
    reason:
      'Explicit DESIGN-SEED streamline-law cut: all-range flight never appears in regular ' +
      'levels. Rail-only is the whole game. Not a gap — a scoped boundary.',
  },
  {
    id: 'all-range-boss',
    label: 'All-range boss arena',
    status: 'deferred',
    milestone: 'named-cut',
    reason:
      'DESIGN-SEED stretch-only, cut on the first sign of camera/control instability. The ' +
      'required rail boss shipped in M8; the free-flight camera was never introduced, so the ' +
      'stretch stayed closed. Reopen only via a DIRECTIONS file.',
  },
  {
    id: 'live-wingmate-combat',
    label: 'Live AI wingmate combat participation (draws fire, shoots alongside)',
    status: 'deferred',
    milestone: 'named-cut',
    reason:
      'DESIGN-SEED named cut: a second combatant AI on top of everything else is a genuine ' +
      'scope cliff, deferred past the stop line. v1 wingmate involvement is distress/rescue ' +
      'beats + passive support only, which shipped in M7.',
  },
  {
    id: 'alt-vehicles',
    label: 'Alternate vehicle set-pieces (submarine / tank analogs)',
    status: 'deferred',
    milestone: 'named-cut',
    reason: 'DESIGN-SEED named cut — no alternate vehicle set-pieces, an anti-scope boundary.',
  },
  {
    id: 'somersault-uturn',
    label: 'Somersault / U-turn maneuvers',
    status: 'deferred',
    milestone: 'named-cut',
    reason:
      'DESIGN-SEED: ships only if all-range survives naturally, and it is not a required ' +
      'maneuver otherwise. All-range was not opened, so this stays cut.',
  },
];

// A stake is well-formed if a built one names at least one module and a deferred one
// carries both a reason and a milestone. Returns the list of problems (empty = clean).
export function auditManifest(stakes = GENRE_STAKES) {
  const problems = [];
  const seen = new Set();
  for (const s of stakes) {
    if (!s.id) problems.push('a stake is missing an id');
    if (seen.has(s.id)) problems.push(`duplicate stake id: ${s.id}`);
    seen.add(s.id);
    if (!s.label) problems.push(`${s.id}: missing label`);
    if (s.status === 'built') {
      if (!Array.isArray(s.modules) || s.modules.length === 0)
        problems.push(`${s.id}: built stake names no modules`);
    } else if (s.status === 'deferred') {
      if (!s.reason) problems.push(`${s.id}: deferred stake has no reason (silent gap)`);
      if (!s.milestone) problems.push(`${s.id}: deferred stake names no milestone/cut`);
    } else {
      problems.push(`${s.id}: unknown status ${s.status}`);
    }
  }
  return problems;
}

export const builtStakes = (stakes = GENRE_STAKES) => stakes.filter((s) => s.status === 'built');
export const deferredStakes = (stakes = GENRE_STAKES) =>
  stakes.filter((s) => s.status === 'deferred');

// Every distinct module path referenced by a built stake (for the file-exists check).
export function referencedModules(stakes = GENRE_STAKES) {
  const set = new Set();
  for (const s of builtStakes(stakes)) for (const m of s.modules) set.add(m);
  return [...set];
}
