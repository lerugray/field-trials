// SHOELEATHER — CASE 1 (compact; DESIGN-SEED case list).
//
// "A celebrated TV chef murders the business partner about to expose the restaurant's
// books; alibi = a pre-taped cooking segment (recorded-alibi device class). Original
// people, our city, our details." Clean-room: device class only, no episode copy.
//
// Case 1 is the compact toy case PROMOTED with a prologue (play as the murderer). The
// prologue plants the knowledge asymmetry the winning chain rests on: the "live"
// Thursday segment was pre-set to tape, so the chef's studio alibi is a fiction. The
// prologue-keyed fact (f-chef-at-restaurant) reads correctly only because you set that
// tape yourself.

import { Prologue } from '../prologue.js';
import { buildToyCase } from './toy-case.js';

export function buildCase1() {
  const c = buildToyCase();
  c.id = 'case-1';
  c.title = 'A Segment, Taped Early';
  c.prologue = new Prologue({
    id: 'case-1',
    card: { act: 'COLD OPEN', timestamp: 'THURSDAY • 8:00 P.M.', line: 'THE NIGHT OF THE MURDER' },
    beats: [
      { id: 'p-look', verb: 'look', action: 'Look around',
        prose: 'The restaurant is dark. The books are open on the desk where he left them. He found the second set. Of course he did.' },
      { id: 'p-move', verb: 'move', action: 'Cross to the kitchen',
        prose: 'You cross the floor. Slow. There is no reason to hurry now, and hurrying is what people remember.' },
      { id: 'p-take', verb: 'take', action: 'Take the knife',
        prose: 'Your hand finds the boning knife on the rack. The good one. It sits in the grip the way it always has.' },
      { id: 'p-use', verb: 'use', prologueKey: true, action: 'Set the tape',
        prose: 'Before the staff come in you set the segment to record and date the slate for tomorrow night. Live, the listing will say. You will be on every screen in the city while it happens here.' },
      { id: 'p-talk', verb: 'talk', action: 'Let him finish', killBeat: true,
        prose: 'The partner turns. He starts in on the numbers, the way he does. You let him finish. Then you do not.' },
      { id: 'p-challenge', verb: 'challenge', stakesFree: true, action: 'Rehearse the answer',
        prose: 'Rehearse it now, while it is quiet. The valet will ask where you were. You say the studio. You say it flat, and you say it until it is true.' },
    ],
  });
  // TRAP ending (superior): the lieutenant does not merely accuse. He runs the tape.
  c.trap = {
    lines: [
      'You do not raise your voice. You ask for the tape. The one from Thursday.',
      '',
      'You put it on. There you are, on the little monitor, smiling at the camera.',
      'And there, at the bottom of the slate: Wednesday. You dated it yourself.',
      '',
      '"Live," the listing said. But this was in the can a day early.',
      'You needed to be two places. So you made one of them a lie on tape.',
      '',
      'The chef watches himself cook. The knife shakes in the picture.',
      'And then, quietly, off camera, it shakes here too.',
    ],
  };
  return c;
}
