// Wingmate barks — the callout text for the procedural squad (M7). Where the memorial
// cast's prose is hand-authored and operator-gated (briefing.js, hubvoice.js), the
// wingmates are procedurally generated, so their lines are too: templated variants
// picked DETERMINISTICALLY per wingmate so each one has a consistent little voice
// across a run. The audio itself is the SNES-style scrambled-speech blip (code-gen,
// wired at M9 off each wingmate's voice descriptor); this is the caption/callout text.
//
// Charm register still governs (hard rules 13 + 14): plain English, no em-dashes,
// warm, never cruel, never a punchline. A wingmate going down is a real, weighted
// moment handled with dignity — they are "lost" for the run (downed, pulled out,
// recovered by the next run), never gorily killed and never mocked.

import { hashSeed } from '../core/rng.js';

// Line pools per callout kind. {name} is substituted with the wingmate's name where a
// line refers to them in the third person; first-person lines are the wingmate's own
// radio voice. Kept short — these are barks, not speeches.
const LINES = {
  // Check-in as the run launches.
  launch: [
    'Wing on your six and ready when you are, pilot.',
    'Good to be flying with you. Say the word and we go.',
    'Formed up and steady. Lead the way.',
  ],
  // Spotting a wave / contacts ahead (the coverage a live wingmate provides).
  spot: [
    'Contacts ahead. I count trouble, watch your spacing.',
    'Eyes up, we have company on the approach.',
    'Bandits inbound. I have got the read, you have got the shot.',
  ],
  // A kill streak going well — a little cheer, never smug.
  streak: [
    'Beautiful shooting. Keep it rolling.',
    'That is the pilot I signed on to fly with.',
    'They are dropping like scrap. Nice work.',
  ],
  // In distress — hit, needs the player to swing over and rescue (the distress beat).
  distress: [
    'I am hit and losing it. Could use a hand over here.',
    'Took a bad one, power is dropping. Come get me if you can.',
    'I am in trouble, pilot. I cannot shake this on my own.',
  ],
  // Rescued in time — relief, warmth, never over the top.
  rescued: [
    'You got me. I owe you one when we are home.',
    'That was close. Thanks for the pull, I am back on the wing.',
    'Knew you would come around. Good to still be flying.',
  ],
  // Went down (not rescued in time) — brave and warm, downed not destroyed, no gore.
  lost: [
    'Cannot hold it. I am going down, fly on and finish the run.',
    'This is where I pull out, pilot. Do not wait on me, go.',
    'Losing the wing here. Get the rest of them home for me.',
  ],
};

// Stable variant index for a wingmate + kind (so a given wingmate always says its own
// version of a line, but different wingmates say different ones).
function variant(w, kind, count) {
  const key = String((w && w.name) || '') + ':' + String((w && w.id) || 0) + ':' + kind;
  return hashSeed(key) % count;
}

// The wingmate's caption for a callout kind. Returns { speaker, kind, line }.
export function wingLine(w, kind) {
  const pool = LINES[kind] || LINES.spot;
  const line = pool[variant(w, kind, pool.length)];
  return { speaker: (w && w.name) || 'Wing', kind, line };
}

// Every callout kind, in display order (for the HUD callout system + tests).
export const CALLOUT_KINDS = ['launch', 'spot', 'streak', 'distress', 'rescued', 'lost'];

// Every wingmate line the milestone can ship, gathered for the register-guard test
// (mirrors briefing.js/hubvoice.js). Procedural, so this is every template variant.
export function allWingText() {
  const out = [];
  for (const kind of CALLOUT_KINDS) for (const l of LINES[kind]) out.push(l);
  return out;
}
