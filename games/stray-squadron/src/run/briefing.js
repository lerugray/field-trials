// Commander Cuckoo's briefing voice — memorial-cast prose (hard rule 7). Cuckoo is
// a beagle, Ray's childhood dog, the briefing officer: he opens every run, reads
// the sector map, and sends the pilot off. Warm, a little gruff, absolutely in
// charge, with the faintest undertone of loss underneath the competence that never
// gets foregrounded (the charm-register law). Plain English, no em-dashes, never
// the declined clipped-operator register.
//
// This text is HAND-AUTHORED, never generated. The only thing the route feeds in is
// the plain facts it should read off the map: how many sectors, and the first one.
// Everything Cuckoo actually SAYS is written here, verbatim, in one place — because
// per DIRECTIONS-M5 the operator does the memorial voice pass on exactly this text
// before any public build carries it. It ships functional; the words are provisional
// until Ray blesses or rewrites them (flagged VOICE PASS PENDING in PROGRESS.md).

// Cuckoo's opening briefing. Reads the map (sector count + first stop), names the
// fork and frames the performance gate warmly (a good flight opens the harder roads;
// there is always a way through), carries the faint undertone of loss in "come back
// to us," and sends the pilot off on the squadron name. `route` supplies only facts.
export function cuckooBriefing(route) {
  const first = route.nodes[route.startId];
  const n = route.levels;
  const lines = [
    'Morning, pilot. The stars are not going to fly themselves.',
    n === 1
      ? 'One sector on the board today. First and last stop is ' + first.sectorName + '.'
      : n + ' sectors between us and the far side of this run. First stop is ' + first.sectorName + '.',
  ];
  if (n > 1) {
    lines.push('The map forks after that. Fly clean and the harder roads open up.');
    lines.push('Fly it however you need to. There is always a way through, and no shame in the easy road.');
  }
  lines.push('We have lost good ships to less than what is out there. Keep your head, watch your six, and come back to us.');
  lines.push('The squadron is counting on you. Go show them what a stray can do.');
  return { speaker: 'Commander Cuckoo', role: 'BRIEFING', lines };
}

// A short warm word from Cuckoo at each level clear, keyed to the medal earned. A
// poor run is met with warmth, never a jab (the memorial cast is never cruel).
const DEBRIEF = {
  gold:   'Gold work out there. I would have signed off on that flight myself.',
  silver: 'Clean flying. That is the squadron I know.',
  bronze: 'You made it through and you made it count. Good enough is still good.',
  none:   'You are back and you are breathing, and that is the part I care about. Shake it off.',
};
export function cuckooDebrief(medal) {
  return { speaker: 'Commander Cuckoo', line: DEBRIEF[medal] || DEBRIEF.none };
}

// Cuckoo's sign-off on the results screen. Victory is proud and warm; a ship-down
// is gruff-warm and protective, never a mockery of the loss (hard rule 7).
export function cuckooSignoff(summary) {
  const line = summary.victory
    ? 'You flew the whole map and came home. Not everyone does. Proud of you, pilot.'
    : 'We lost the ship, not the pilot. Patch up, get some rest, and we fly again. That is an order.';
  return { speaker: 'Commander Cuckoo', line };
}

// Cuckoo's hails across the run CLIMAX (M8). He calls the boss in when it looms, calls
// the armor breaking, and calls it down — warm and steadying, never bloodthirsty (the
// memorial cast is never cruel; a boss is "the big one," not a thing to gloat over).
// The mechanical read (hull, phase, incoming) is the HUD's job; Cuckoo brings the
// heart. Hand-authored, verbatim, VOICE PASS PENDING until Ray blesses or rewrites.
const BOSS_HAIL = {
  approach: 'That is the big one, pilot. Breathe, pick your moment, and hit it in the core.',
  phase:    'Its armor is coming apart. You are doing it. Stay on the core.',
  down:     'That is the whole map. You brought us home. Come on back, pilot.',
};
export function cuckooBossHail(kind) {
  return { speaker: 'Commander Cuckoo', line: BOSS_HAIL[kind] || BOSS_HAIL.approach };
}

// Every memorial line M5 ships, gathered for the operator's voice pass and for the
// no-em-dash / register test. If a new Cuckoo line is added above, add it here too.
export function allBriefingText() {
  const out = [];
  // a representative route-read (multi-sector) plus the single-sector variant
  const fakeMulti = { levels: 3, startId: 's', nodes: { s: { sectorName: 'Ashfall Reach' } } };
  const fakeSolo = { levels: 1, startId: 's', nodes: { s: { sectorName: 'Ashfall Reach' } } };
  out.push(...cuckooBriefing(fakeMulti).lines);
  out.push(...cuckooBriefing(fakeSolo).lines);
  for (const m of ['gold', 'silver', 'bronze', 'none']) out.push(cuckooDebrief(m).line);
  out.push(cuckooSignoff({ victory: true }).line);
  out.push(cuckooSignoff({ victory: false }).line);
  for (const k of ['approach', 'phase', 'down']) out.push(cuckooBossHail(k).line);
  return out;
}
