// THE JACQUARD INDEX — TWO-THREAD content (shelf 1): two-colour pictures.
//
// Each grid uses two threads: '.' bare warp, 'A' thread one (indigo), 'B' thread two
// (madder). Thread identity is by stitch SHAPE not hue (hard-rule 6) — a render concern; in
// the data the threads are just A and B. Every card is proved guess-free + unique under the
// coloured-nonogram rules by certifyTwoThread (test/twothread.test.js), so a card that would
// need a guess never ships (hard-rule 4). A gentle 5x5 -> 6x6 climb, teaching card first.

export const TWOTHREAD_TEACHING = 'bandAB';

export const TWOTHREAD_MOTIFS = [
  // --- teaching: two threads, banded; count each colour on its own ---
  { id: 'bandAB', name: 'THE BANDS',
    blurb: 'Two threads, banded turn and turn about. Count each colour on its own.',
    rows: ['AAAAA', 'BBBBB', 'AAAAA', 'BBBBB', 'AAAAA'] },

  // --- 5x5 ---
  { id: 'flagAB', name: 'THE FLAG',
    blurb: 'Indigo to one side, madder to the other.',
    rows: ['AAABB', 'AAABB', 'AAABB', 'AAABB', 'AAABB'] },
  { id: 'stripeAB', name: 'THE STRIPE',
    blurb: 'A madder stripe caught in indigo.',
    rows: ['ABBBA', 'ABBBA', 'ABBBA', 'ABBBA', 'ABBBA'] },
  { id: 'weaveAB', name: 'THE TWO WEAVE',
    blurb: 'Warp and weft in two dyes.',
    rows: ['ABABA', 'ABABA', 'ABABA', 'ABABA', 'ABABA'] },
  { id: 'checkerAB', name: 'THE CHECK',
    blurb: 'The shepherd check, two threads square.',
    rows: ['ABABA', 'BABAB', 'ABABA', 'BABAB', 'ABABA'] },
  { id: 'borderAB', name: 'THE BORDER',
    blurb: 'An indigo field, madder at the selvedge.',
    rows: ['BBBBB', 'B...B', 'B.A.B', 'B...B', 'BBBBB'] },
  { id: 'sashAB', name: 'THE SASH',
    blurb: 'A madder sash on an indigo ground.',
    rows: ['AAAAA', 'ABBBA', 'ABBBA', 'ABBBA', 'AAAAA'] },
  { id: 'pileAB', name: 'THE PILE',
    blurb: 'Madder edges, indigo pile.',
    rows: ['BAAAB', 'BAAAB', 'BAAAB', 'BAAAB', 'BAAAB'] },
  { id: 'tartanAB', name: 'THE TARTAN',
    blurb: 'A sett of two threads.',
    rows: ['ABABA', 'BBBBB', 'ABABA', 'BBBBB', 'ABABA'] },
  { id: 'heartAB', name: 'THE VALENTINE',
    blurb: 'Two threads, one heart.',
    rows: ['BABAB', 'AAAAA', 'AAAAA', 'BAAAB', 'BBABB'] },
  { id: 'spoolAB', name: 'THE TWO SPOOL',
    blurb: 'Wound with both dyes.',
    rows: ['.AAA.', 'ABABA', 'AAAAA', 'ABABA', '.AAA.'] },
  { id: 'frameAB', name: 'THE TWO FRAME',
    blurb: 'A madder frame, indigo within.',
    rows: ['BBBBB', 'BAAAB', 'BABAB', 'BAAAB', 'BBBBB'] },

  // --- 6x6 ---
  { id: 'gridAB6', name: 'THE TWO GRID',
    blurb: 'The full check, six by six.',
    rows: ['ABABAB', 'BABABA', 'ABABAB', 'BABABA', 'ABABAB', 'BABABA'] },
];
