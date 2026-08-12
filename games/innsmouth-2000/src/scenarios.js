// Difficulty / scenario starts for INNSMOUTH 2000 (M8).
//
// Four ways to begin: the standard town, an easy calm cove, a hard blighted shore, and a
// disaster-recovery start where the sea has already taken the low ground. Each is just a set of
// makeSim options plus an optional world setup, so a scenario is data, not a code path. main.js
// reads ?scenario=<key>; the model here is pure and node-testable.

import { SPEED } from './sim.js';

// Each scenario also carries its SUBSURFACE (M-b, spec section 5): how far the brine reaches, how
// fissured the near-shore rock is, how hard the deep presses, how fast the water goes off, and (for
// the Quiet Cove) an opening grace window in months during which the contamination rolls are
// quartered. These sit beside wrathPace as pressure controls, exactly as the spec asks.
export const SCENARIOS = {
  standard: {
    key: 'standard', label: 'Innsmouth',
    blurb: 'The town as it was found. A fair start on a quiet shore.',
    opts: {
      treasury: 20000, dreadBase: 6,
      aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 0.12 },
      deepStart: 6, deepPace: { presence: 1, contam: 1 },
    },
    startSpeed: SPEED.CREEP,
  },
  easy: {
    key: 'easy', label: 'The Quiet Cove',
    blurb: 'A full purse and a calm shore. Room to learn the tides.',
    // The gentle introduction: a narrow band of brine, almost no open rock, a dormant deep, and two
    // years before the water can really turn. Strange municipal trouble before it is a horror engine.
    opts: {
      treasury: 35000, dreadBase: 4, wrathPace: 0.5,
      aquifer: { brackishReach: 2, fissureReach: 1, fissureRate: 0.04 },
      deepStart: 0, deepPace: { presence: 0.45, contam: 0.4 }, deepGrace: 24,
    },
    startSpeed: SPEED.CREEP,
  },
  hard: {
    key: 'hard', label: 'The Blighted Shore',
    blurb: 'A poor town under a heavy dread. The gods are close from the first.',
    // More brackish ground, more fissures, faster presence, faster taint. Quiet fixes will not hold.
    opts: {
      treasury: 10000, dreadBase: 12,
      aquifer: { brackishReach: 5, fissureReach: 2, fissureRate: 0.22 },
      deepStart: 14, deepPace: { presence: 1.6, contam: 1.5 },
    },
    startSpeed: SPEED.CREEP,
  },
  recovery: {
    key: 'recovery', label: 'After the Tide',
    blurb: 'The sea has already climbed the low ground. Rebuild what the flood took.',
    // The sea has already been in this ground, so it starts part-brackish with the deep half awake.
    opts: {
      treasury: 14000, dreadBase: 9,
      aquifer: { brackishReach: 4, fissureReach: 1, fissureRate: 0.16 },
      deepStart: 10, deepPace: { presence: 1.25, contam: 1.2 },
    },
    startSpeed: SPEED.CREEP,
    recovery: true,
  },
};

export const SCENARIO_LIST = ['standard', 'easy', 'hard', 'recovery'];

// Resolve a key to a scenario, falling back to the standard start.
export function scenarioFor(key) {
  return SCENARIOS[key] || SCENARIOS.standard;
}

// Apply a scenario's world setup after the sim is made. For the recovery start, the sea has already
// come and gone: we loose and then clear a Flood Tide, leaving the low shore flooded and scarred for
// the player to rebuild (reusing the tested disaster code rather than a parallel flood routine).
export function applyScenario(sim, key) {
  const sc = scenarioFor(key);
  if (sc.recovery) {
    sim.summonWrath('dagon');  // the tide climbs the low shore, scarring it
    sim.disaster = null;       // it is aftermath now, not a wrath in progress
    sim.lastWrath = null;
    sim.pendingWrath = [];
  }
  return sc;
}
