// The run-flow state machine — M5's spine made playable. It sequences a whole run
// over the branching route: Cuckoo's briefing, then fly a level, debrief with a
// medal + branch choice, fly the chosen next level, and so on to the final rank —
// or an early end if the ship goes down. It owns NO rendering and builds NO level
// geometry: main.js builds each level from the current node and feeds the outcome
// back in. That keeps the whole flow pure and headless-testable.
//
// Phases:
//   'briefing' -> launch() ->        the start level is flown
//   'level'    -> completeLevel() -> records a medal, then:
//                                       died      -> 'results' (run ends here)
//                                       final rank-> 'results' (victory)
//                                       otherwise -> 'debrief'
//   'debrief'  -> chooseBranch() ->  fly the chosen next level ('level')
//   'results'  ->                    terminal; summary() is ready
//
// Determinism: the route is seeded; the flow just walks it from the player's
// choices and the levels' outcomes.

import { buildRoute, branchesOf } from './route.js';
import { medalFor, evaluateChoices, rankOf } from './medals.js';
import { generateRoster, loseWingmate, survivors } from './wingmates.js';

// createRun(seed, { contracts }) — `contracts` is the list of hired-veteran names
// (the M6 contract seam maturing into wings in the air); each adds one named slot to
// the run's procedural squad. The whole squad is drawn deterministically from the
// route seed, so a run always flies with the same wingmates.
export function createRun(seed, options = {}) {
  const route = buildRoute(seed);
  const state = {
    seed: route.seed,
    route,
    phase: 'briefing',
    currentId: null,          // node being flown / just flown
    path: [],                 // node ids in the order visited
    levels: [],               // { id, medal, score, kills, potential, lostWing } per level
    lastMedal: 'none',        // medal from the most recent completed level
    died: false,
    victory: false,
    roster: generateRoster(route.seed, options.contracts || []), // the mortal squad
    taken: [],                // loadout boon ids picked at branch points
    lostWings: [],            // { id, name, atNode } as wingmates fall this run
  };

  function currentNode() {
    return state.currentId ? route.nodes[state.currentId] : null;
  }

  function isFinal(id) {
    return id === route.finalId;
  }

  // briefing -> fly the fixed start level.
  function launch() {
    if (state.phase !== 'briefing') throw new Error('launch() only from briefing');
    state.currentId = route.startId;
    state.path.push(state.currentId);
    state.phase = 'level';
    return currentNode();
  }

  // Record the flown level's outcome and advance. `potential` is the level's max
  // score (levelPotential), passed in by the builder so this stays geometry-free.
  // `distress` (optional) is the level's wingmate-distress outcome the builder
  // resolved: { wingId, rescued }. An unrescued distress loses that wingmate for the
  // run's remainder (their support and callouts stop). geometry-free: the builder
  // plans + resolves the pod; runflow just applies the roster consequence.
  function completeLevel({ score = 0, kills = 0, potential = 0, died = false, distress = null } = {}) {
    if (state.phase !== 'level') throw new Error('completeLevel() only from level');
    const medal = died ? 'none' : medalFor(score, potential);
    let lostWing = null;
    if (distress && distress.wingId != null && !distress.rescued) {
      const target = state.roster.find((w) => w.id === distress.wingId);
      if (target && target.alive) {   // only an alive wingmate can be lost (no double-count)
        loseWingmate(state.roster, distress.wingId, state.currentId);
        lostWing = { id: target.id, name: target.name, atNode: state.currentId };
        state.lostWings.push(lostWing);
      }
    }
    state.levels.push({ id: state.currentId, medal, score, kills, potential, lostWing });
    state.lastMedal = medal;
    if (died) { state.died = true; state.phase = 'results'; return; }
    if (isFinal(state.currentId)) { state.victory = true; state.phase = 'results'; return; }
    state.phase = 'debrief';
  }

  // Record a mid-run loadout pick (the boon chosen at a branch point). The builder
  // validates the id against the offered draw; runflow just keeps the run's picks so
  // the loadout aggregate and the flight log can read them. Idempotent per id.
  function takeBoon(id) {
    if (state.phase !== 'debrief') throw new Error('takeBoon() only from debrief');
    if (id != null && !state.taken.includes(id)) state.taken.push(id);
    return state.taken.slice();
  }

  // The branch choices at a debrief, gated by the medal just earned.
  function choices() {
    if (state.phase !== 'debrief') return [];
    return evaluateChoices(branchesOf(route, state.currentId), state.lastMedal);
  }

  // Commit to a branch and fly it. Rejects an id that isn't an unlocked choice.
  function chooseBranch(id) {
    if (state.phase !== 'debrief') throw new Error('chooseBranch() only from debrief');
    const choice = choices().find((c) => c.node.id === id);
    if (!choice) throw new Error('not a branch of the current node: ' + id);
    if (choice.locked) throw new Error('branch is gated (needs a medal): ' + id);
    state.currentId = id;
    state.path.push(id);
    state.phase = 'level';
    return currentNode();
  }

  function isOver() {
    return state.phase === 'results';
  }

  // The run summary (ready once the run is over). Totals, per-level medals, and one
  // overall run medal graded against everything the flown route had to give.
  function summary() {
    const totalScore = state.levels.reduce((a, l) => a + l.score, 0);
    const totalKills = state.levels.reduce((a, l) => a + l.kills, 0);
    const totalPotential = state.levels.reduce((a, l) => a + l.potential, 0);
    // best medal a level reached, for a headline flourish
    let best = 'none';
    for (const l of state.levels) if (rankOf(l.medal) > rankOf(best)) best = l.medal;
    return {
      seed: state.seed,
      victory: state.victory,
      died: state.died,
      levelsFlown: state.levels.length,
      routeLevels: route.levels,
      totalScore,
      totalKills,
      totalPotential,
      runMedal: state.died ? 'none' : medalFor(totalScore, totalPotential),
      bestMedal: best,
      levels: state.levels.slice(),
      path: state.path.slice(),
      // wingmate outcome — the flight log records who flew, who came home, who was lost
      wingsRostered: state.roster.length,
      wingsLost: state.lostWings.length,
      wingsHome: survivors(state.roster).length,
      lostWings: state.lostWings.slice(),
      taken: state.taken.slice(),
    };
  }

  return {
    state,
    route,
    currentNode,
    launch,
    completeLevel,
    takeBoon,
    choices,
    chooseBranch,
    isOver,
    summary,
    // convenience readouts
    roster: () => state.roster,
    living: () => survivors(state.roster),
    taken: () => state.taken.slice(),
    get phase() { return state.phase; },
    get lastMedal() { return state.lastMedal; },
  };
}
