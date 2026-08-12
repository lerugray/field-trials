// SHOELEATHER — CASE 2 (mid; closed-setting howcatchem aboard a cruise ship).
//
// SETTING RATIFIED BY THE OPERATOR (docs/DIRECTIONS-2026-08-10): a cruise ship,
// mid-crossing. The lieutenant is a passenger with no jurisdiction at sea; the pool is
// closed (passengers + crew); the diegetic counter-move clock is the DAWN LANDFALL —
// once the ship makes port the murderer walks off into a foreign jurisdiction.
//
// Clean-room (device CLASS only, no episode/film copied, roles not names): the trick is
// a MANIPULATED-CLOCK ALIBI on a "clocks go back one hour" crossing night. The purser
// (money/keys/routine) has the lounge steward set the LOUNGE clock back an hour EARLY,
// so his "card table, ten to eleven" alibi — confirmed by everyone on lounge-time —
// really covers eleven-to-twelve, freeing the true murder hour. The PROLOGUE-KEY: the
// player (as the purser) orders the early clock change, so the night steward's "quarter
// to twelve" corridor sighting reads as a quarter to eleven — dead on the time of death.
//
// The winning chain is UNIQUE and the case passes the full solver battery (rule 3).

import { Case, accusation } from '../case.js';
import { Prologue } from '../prologue.js';
import { DialogueTree } from '../../people/dialogue.js';

export function buildCase2() {
  return new Case({
    id: 'case-2',
    title: 'The Hour Put Back',
    victim: 'auditor',
    suspects: [
      { id: 'purser', name: 'Elias Voss' },
      { id: 'bandleader', name: 'Mara Bell' },
      { id: 'auditor', name: 'Edwin Shaw', accusable: false },
    ],
    endingWitnesses: ['bandleader'],
    facts: [
      // How the victim died (means slot: victim-bound "how").
      {
        id: 'f-means', subject: 'auditor', claimType: 'action', value: 'struck',
        acquisitionPaths: ['ships-surgeon', 'wound-photo'], role: 'chain', chainSlot: 'means',
        prose: 'The auditor was struck once, hard, above the ear.',
      },
      {
        id: 'f-time', subject: 'auditor', claimType: 'time', value: 'T-2220',
        acquisitionPaths: ['surgeon-tod', 'dinner-tray'], role: 'chain', chainSlot: 'time',
        prose: 'Time of death fixes it near twenty past ten.',
      },
      {
        id: 'f-place', subject: 'auditor', claimType: 'location', value: 'stateroom', time: 'T-2220',
        acquisitionPaths: ['berth-blood', 'locked-cabin'], role: 'chain', chainSlot: 'place',
        prose: 'The berth and blood pattern fix the killing inside the auditor\'s stateroom.',
      },
      {
        id: 'f-clock-mechanism', subject: 'purser', claimType: 'action', value: 'ordered-early-clock-change', time: 'T-2200',
        acquisitionPaths: ['lounge-order-book', 'steward-carbon'], role: 'chain', chainSlot: 'alibiMechanism',
        prose: 'The purser ordered the lounge clock put back before the card game, not at midnight.',
      },
      // The alibi-breaker: the purser was on the stateroom corridor at the TRUE time of
      // death. Reads correctly ONLY through the prologue — the "quarter to twelve"
      // sighting is a quarter to eleven once you know the lounge clock was slow.
      {
        id: 'f-purser-corridor', subject: 'purser', claimType: 'location', value: 'corridor', time: 'T-2220',
        acquisitionPaths: ['night-steward', 'deck-log'], role: 'chain', chainSlot: 'prologueFact', prologueKeyed: true,
        prose: 'The slow lounge clock converts the steward\'s 11.45 sighting to 10.45 on B-deck.',
      },
      {
        id: 'f-deck-log-corroboration', subject: 'deck-log', claimType: 'property', value: 'purser-b-deck-2245',
        acquisitionPaths: ['deck-log', 'master-at-arms-copy'], role: 'chain', chainSlot: 'corroboration', tags: ['document', 'witness'],
        prose: 'The signed deck log records the purser\'s B-deck key at the steward\'s 11.45.',
      },
      {
        id: 'f-purser-weapon', subject: 'purser', claimType: 'possession', value: 'brass-paperweight',
        acquisitionPaths: ['desk-gap', 'forensics'], role: 'chain', chainSlot: 'physicalContradiction',
        prose: 'The bare ring in the dust on the purser\'s desk matches the brass paperweight, and the wound.',
      },
      // Honest red herrings: true, tagged, bear on nothing in the lie.
      {
        id: 'f-purser-skim', subject: 'purser', claimType: 'action', value: 'skimmed-accounts',
        acquisitionPaths: ['auditor-ledger'], role: 'red-herring',
        prose: 'The auditor had circled the purser\'s name in the ship\'s accounts.',
      },
      {
        id: 'f-bandleader-row', subject: 'bandleader', claimType: 'action', value: 'public-row',
        acquisitionPaths: ['maitre-d'], role: 'red-herring',
        prose: 'The bandleader and the auditor had loud words at dinner.',
      },
    ],
    statements: [
      {
        id: 's-purser-alibi', speaker: 'purser',
        text: 'I was at the card table in the first-class lounge from ten to eleven. Ask the table.',
        subject: 'purser', claimType: 'location', value: 'lounge', time: 'T-2220',
      },
      {
        id: 's-bandleader-stand', speaker: 'bandleader',
        text: 'We had words, the auditor and I. Words are not a weapon. I was on the bandstand all evening.',
        subject: 'bandleader', claimType: 'location', value: 'bandstand', time: 'T-2220',
      },
    ],
    winningChain: accusation({
      suspect: 'purser', victim: 'auditor',
      means: 'f-means', time: 'f-time', place: 'f-place', alibiMechanism: 'f-clock-mechanism',
      prologueFact: 'f-purser-corridor', contradictedStatement: 's-purser-alibi',
      corroboration: 'f-deck-log-corroboration', physicalContradiction: 'f-purser-weapon',
    }),
    nearMisses: [
      // Alibi fact and proving evidence swapped: the weapon does not contradict the alibi.
      accusation({
        ...expandedChain(), prologueFact: 'f-purser-weapon', physicalContradiction: 'f-purser-corridor',
      }),
      // Wrong suspect (the bandleader red herring): no fact breaks his stand.
      accusation({
        ...expandedChain(), suspect: 'bandleader', contradictedStatement: 's-bandleader-stand',
      }),
      // Proving evidence is a red herring (the motive), not load-bearing.
      accusation({
        ...expandedChain(), physicalContradiction: 'f-purser-skim',
      }),
      // Means slot filled with a red herring (wrong "how").
      accusation({
        ...expandedChain(), means: 'f-purser-skim',
      }),
      // Corroboration swapped: the "when/where" fact jammed into the means slot.
      accusation({
        ...expandedChain(), time: 'f-place', place: 'f-time',
      }),
    ],
    // Counter-moves: each closes ONE acquisition path as the ship nears port. Every chain
    // fact keeps >= 2 paths, so the last-path guard holds and the win survives any order.
    counterMoves: [
      { id: 'cm-steward', closesPath: 'night-steward', describe: 'The purser reassigns the night steward to a lower deck. His memory of the corridor goes with him.' },
      { id: 'cm-desk', closesPath: 'desk-gap', describe: 'A new paperweight sits on the purser\'s desk by morning. The ring in the dust is wiped clean.' },
    ],
    dialogues: {
      purser: new DialogueTree({
        id: 'purser', root: 'open',
        nodes: [
          { id: 'open', speaker: 'purser', text: 'Lieutenant. You have no standing on this ship. Speak to the master-at-arms.', options: [
            { id: 'ask', text: 'I will do that. My stomach is still back at the dock. Where were you at ten?', to: 'alibi', effects: [{ type: 'revealStatement', statement: 's-purser-alibi' }] },
            { id: 'leave-1', text: 'I will not keep you.', to: null },
          ] },
          { id: 'alibi', speaker: 'purser', text: 'The card table, in the lounge. Ten to eleven. A dozen people will tell you so.', options: [
            { id: 'press', text: 'This is where I get lost. The night steward has you on B-deck. Is he wrong?', to: 'corner', guards: [{ type: 'factKnown', fact: 'f-purser-corridor' }] },
            { id: 'leave-2', text: 'That is me being slow. I will read it again.', to: null },
          ] },
          { id: 'corner', speaker: 'purser', text: 'The steward cannot tell one hour from the next. Neither, it seems, can you.', options: [
            { id: 'leave-3', text: 'We make port at dawn, they tell me. I have never been good with clocks.', to: null },
          ] },
        ],
      }),
      bandleader: new DialogueTree({
        id: 'bandleader', root: 'b-open',
        nodes: [
          { id: 'b-open', speaker: 'bandleader', text: 'You heard about dinner. Everyone did.', options: [
            { id: 'b-ask', text: 'I would rather have it from you.', to: 'b-stand', effects: [{ type: 'revealStatement', statement: 's-bandleader-stand' }] },
            { id: 'b-leave', text: 'Fair enough.', to: null },
          ] },
          { id: 'b-stand', speaker: 'bandleader', text: 'On the bandstand all night. The whole room saw me.', options: [
            { id: 'b-done', text: 'Thank you.', to: null },
          ] },
        ],
      }),
    },
    prologue: new Prologue({
      id: 'case-2',
      beats: [
        { id: 'p-look', verb: 'look', action: 'Look around',
          prose: 'The stateroom is quiet, the sea flat under the porthole. His ledger is open on the writing desk. He has circled your name in the accounts. Of course he has.' },
        { id: 'p-move', verb: 'move', action: 'Cross to the desk',
          prose: 'You cross the small room. There is no hurry. Hurry is what a steward remembers in the morning.' },
        { id: 'p-take', verb: 'take', action: 'Take the paperweight',
          prose: 'The brass paperweight is cold and good in the hand. It has held your papers flat for six crossings. It will do once more.' },
        { id: 'p-use', verb: 'use', prologueKey: true, action: 'Send word to the lounge',
          prose: 'First: you send word to the lounge steward to put the clock back the hour NOW, and save the fuss at midnight. The card table will run by that clock, and swear to it. An hour of yours, quietly returned.' },
        { id: 'p-talk', verb: 'talk', action: 'Let him finish',
          prose: 'The auditor looks up. He starts in on the figures, the columns, the names. You let him finish. Then you do not.' },
        { id: 'p-challenge', verb: 'challenge', stakesFree: true, action: 'Rehearse the answer',
          prose: 'Rehearse it now, while the water is calm. They will ask where you were. You say the card table, ten to eleven. You say it flat, and you say it until the whole lounge says it with you.' },
      ],
    }),
    // TRAP ending (superior): the lieutenant does not merely accuse. He resets the clock.
    trap: {
      lines: [
        'You do not raise your voice. You ask the lounge steward one question: when did he put the clock back.',
        '',
        'Before the game, he says. The purser\'s own order. Not at midnight. Before.',
        'So the card table swore to an hour that was already spent.',
        '',
        '"Ten to eleven," the table said. But the clock they read was slow.',
        'It was eleven to twelve. Which leaves the hour before, the hour the surgeon fixes the death.',
        '',
        'The night steward saw you in the corridor and called it a quarter to twelve.',
        'By the true clock, that was a quarter to eleven. You were not at the table. You were at his door.',
        '',
        'The purser watches the second hand. It does not shake. His hand does.',
      ],
    },
  });
}

function expandedChain() {
  return {
    suspect: 'purser', victim: 'auditor', means: 'f-means', time: 'f-time', place: 'f-place',
    alibiMechanism: 'f-clock-mechanism', prologueFact: 'f-purser-corridor',
    contradictedStatement: 's-purser-alibi', corroboration: 'f-deck-log-corroboration',
    physicalContradiction: 'f-purser-weapon',
  };
}
