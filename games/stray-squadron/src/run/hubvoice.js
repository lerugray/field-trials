// The hangar voices — Cuckoo, Leon, and Kirby speaking between runs (hard rule 7).
// This is memorial-cast prose in the locked charm register (warm, a little gruff,
// never cruel, the faint undertone of loss never foregrounded). It is HAND-AUTHORED,
// never generated. Like the briefing text, every line lives here in one place so the
// operator does the memorial voice pass on exactly this prose before any public build
// carries it. It ships functional; the words are provisional (VOICE PASS PENDING).
//
//   * Cuckoo — command. Greets you in the hangar, keyed warmly to how the last run went.
//   * Leon   — intel & comms. Sly, dry, an off-duty read on the channels.
//   * Kirby  — hangar mechanic and shopkeep. Fussy about the ship, proud of every
//              upgrade, the one who hands over new gear.
//
// Plain English, no em-dashes (hard rule 14), never the declined clipped-operator
// register, and the cast is never a punchline or ever treated as expendable.

// Cuckoo's hangar greeting. First-ever visit, or keyed to the last run's ending.
export function cuckooHangar(context) {
  const c = context || {};
  const first = c.lifetimeRuns === 0 && !c.lastRun;
  let line;
  if (first) {
    line = 'Welcome to the hangar, pilot. This is home base. Rest up, kit out, and fly when you are ready.';
  } else if (c.lastRun && c.lastRun.victory) {
    line = 'There is the pilot who flew the whole map. Kirby has been bragging about your ship all day.';
  } else if (c.lastRun && c.lastRun.died) {
    line = 'Good to see you on your feet. We patch up here and we fly again. No hurry, take the time you need.';
  } else {
    line = 'Back in one piece. Good. Take what you need off the rack and we will get you out there again.';
  }
  return { speaker: 'Commander Cuckoo', role: 'command', line };
}

// Leon's off-duty quip. Deterministic pick (keyed to lifetime runs), never random.
// Exported so the M10 ambient hangar chatter can rotate these already-blessed lines
// (it surfaces existing prose; it never authors new memorial voice).
export const LEON_QUIPS = [
  'Comms are quiet for once. Enjoy it while it lasts, pilot.',
  'I pulled the sector charts. Same stars, new trouble. Nothing we cannot read together.',
  'Word is the scavengers out there have gotten bold. Good. More salvage for us.',
  'Rest your eyes. I will keep an ear on the channels while you kit out.',
];
export function leonHangar(context) {
  const i = LEON_QUIPS.length ? (Math.max(0, (context && context.lifetimeRuns) | 0) % LEON_QUIPS.length) : 0;
  return { speaker: 'Leon', role: 'intel', line: LEON_QUIPS[i] };
}

// Kirby's shop lines. An idle greeting plus keyed reactions to a purchase attempt.
export function kirbyGreeting() {
  return { speaker: 'Kirby', role: 'hangar', line: 'Come in, come in, mind the toolboxes. Let us make that ship of yours something special.' };
}
const KIRBY = {
  boughtUpgrade: 'Now we are talking. She will thank you for that one out there.',
  boughtContract: 'A new hand on the crew. I will get them settled in the bay and earning their keep.',
  poor:    'Bring me more salvage and it is yours. I am not running a charity, though I am close.',
  maxed:   'That one is as good as my hands can make it. Go easy on it out there.',
  locked:  'Get the ship squared away first, then we talk about hiring help. One thing at a time.',
};
export function kirbyReact(kind) {
  return { speaker: 'Kirby', role: 'hangar', line: KIRBY[kind] || KIRBY.poor };
}

// Every hub line the milestone ships, gathered for the operator's voice pass and for
// the no-em-dash / register guard test (mirrors briefing.js's allBriefingText).
export function allHubText() {
  const out = [];
  out.push(cuckooHangar({ lifetimeRuns: 0, lastRun: null }).line);
  out.push(cuckooHangar({ lifetimeRuns: 3, lastRun: { victory: true } }).line);
  out.push(cuckooHangar({ lifetimeRuns: 3, lastRun: { died: true } }).line);
  out.push(cuckooHangar({ lifetimeRuns: 3, lastRun: { victory: false, died: false } }).line);
  for (const q of LEON_QUIPS) out.push(q);
  out.push(kirbyGreeting().line);
  for (const k of Object.keys(KIRBY)) out.push(KIRBY[k]);
  return out;
}
