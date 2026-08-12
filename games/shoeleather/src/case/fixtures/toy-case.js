// SHOELEATHER — M1 toy case (the SOLVER LAW's first subject).
//
// A compact, clean-room, register-correct case used to prove the solver battery:
// reachability, a UNIQUE winning chain, near-miss rejection, and the orphan linter.
// It is NOT Case 1 (that ships whole in M3); it is the smallest data that exercises
// every mechanic of the accusation predicate.
//
// Premise (device class only, no copied episode): a celebrated TV chef kills the
// business partner who was about to expose the restaurant's books, and hides behind a
// pre-taped cooking segment as an alibi. Original people, our details.

import { Case, accusation } from '../case.js';
import { DialogueTree } from '../../people/dialogue.js';

export function buildToyCase() {
  return new Case({
    id: 'toy-1',
    title: 'The Cold Open',
    victim: 'partner',
    suspects: [
      { id: 'chef', name: 'Adrian Vale' },
      { id: 'waiter', name: 'Leo Dunn' },
      { id: 'partner', name: 'Martin Vale', accusable: false },
    ],
    endingWitnesses: ['waiter'],
    facts: [
      // How the victim died (means slot: victim-bound, "how" claim).
      {
        id: 'f-means', subject: 'partner', claimType: 'action', value: 'stabbed',
        acquisitionPaths: ['coroner-report', 'wound-photo'], role: 'chain', chainSlot: 'means',
        prose: 'The partner was stabbed once, close in.',
      },
      {
        id: 'f-time', subject: 'partner', claimType: 'time', value: 'Thu-2000',
        acquisitionPaths: ['coroner-tod', 'kitchen-clock'], role: 'chain', chainSlot: 'time',
        prose: 'Time of death fixes it at eight Thursday night.',
      },
      {
        id: 'f-place', subject: 'partner', claimType: 'location', value: 'restaurant', time: 'Thu-2000',
        acquisitionPaths: ['blood-pattern', 'reservation-log'], role: 'chain', chainSlot: 'place',
        prose: 'The blood pattern fixes the killing to the restaurant office.',
      },
      {
        id: 'f-tape-mechanism', subject: 'chef', claimType: 'action', value: 'pre-taped-segment', time: 'Thu-2000',
        acquisitionPaths: ['studio-slate', 'broadcast-log'], role: 'chain', chainSlot: 'alibiMechanism',
        prose: 'The studio slate shows Thursday\'s segment was recorded on Wednesday.',
      },
      // The alibi-breaker: the chef WAS at the restaurant at 8, not the studio.
      {
        id: 'f-chef-at-restaurant', subject: 'chef', claimType: 'location', value: 'restaurant', time: 'Thu-2000',
        acquisitionPaths: ['doorman', 'valet-log'], role: 'chain', chainSlot: 'prologueFact', prologueKeyed: true,
        prose: 'The valet log has the chef parking at the restaurant at 7.52.',
      },
      {
        id: 'f-valet-corroboration', subject: 'valet-log', claimType: 'property', value: 'chef-car-1952',
        acquisitionPaths: ['valet-carbon', 'doorman-copy'], role: 'chain', chainSlot: 'corroboration', tags: ['document'],
        prose: 'The valet\'s carbon copy records the chef\'s car at 7.52 and bears his initials.',
      },
      {
        id: 'f-chef-knife', subject: 'chef', claimType: 'possession', value: 'boning-knife',
        acquisitionPaths: ['knife-rack-gap', 'forensics'], role: 'chain', chainSlot: 'physicalContradiction',
        prose: 'The gap in the chef\'s own knife rack matches the wound.',
      },
      // Honest red herrings: true, tagged, bear on nothing in the lie.
      {
        id: 'f-waiter-quit', subject: 'waiter', claimType: 'action', value: 'gave-notice',
        acquisitionPaths: ['ledger'], role: 'red-herring',
        prose: 'The waiter had given notice that week.',
      },
      {
        id: 'f-partner-debt', subject: 'partner', claimType: 'property', value: 'in-debt',
        acquisitionPaths: ['bank-letter'], role: 'red-herring',
        prose: 'The partner was privately in debt.',
      },
    ],
    statements: [
      {
        id: 's-chef-alibi', speaker: 'chef',
        text: 'I was at the studio taping the segment until well past ten.',
        subject: 'chef', claimType: 'location', value: 'studio', time: 'Thu-2000',
      },
      {
        id: 's-waiter-home', speaker: 'waiter',
        text: 'I went straight home after my shift. I was done with that place.',
        subject: 'waiter', claimType: 'location', value: 'home', time: 'Thu-2000',
      },
    ],
    winningChain: accusation({
      suspect: 'chef', victim: 'partner',
      means: 'f-means', time: 'f-time', place: 'f-place', alibiMechanism: 'f-tape-mechanism',
      prologueFact: 'f-chef-at-restaurant', contradictedStatement: 's-chef-alibi',
      corroboration: 'f-valet-corroboration', physicalContradiction: 'f-chef-knife',
    }),
    nearMisses: [
      // Right suspect, but the alibi fact does not contradict the cited statement.
      accusation({
        ...expandedChain(), prologueFact: 'f-chef-knife', physicalContradiction: 'f-chef-at-restaurant',
      }),
      // Wrong suspect (the red-herring waiter): no fact breaks his alibi.
      accusation({
        ...expandedChain(), suspect: 'waiter', contradictedStatement: 's-waiter-home',
      }),
      // Proving evidence is a red herring, not load-bearing.
      accusation({
        ...expandedChain(), physicalContradiction: 'f-partner-debt',
      }),
      // Means slot filled with a red herring (wrong "how").
      accusation({
        ...expandedChain(), means: 'f-partner-debt',
      }),
      // Corroboration swapped: the "when/where" fact jammed into the means slot.
      accusation({
        ...expandedChain(), time: 'f-place', place: 'f-time',
      }),
    ],
    // Murderer's counter-moves on wrong challenges. Each closes ONE acquisition path;
    // the always-solvable guard forbids closing any fact's last path, so the two paths
    // per chain fact guarantee the win survives any challenge order.
    counterMoves: [
      { id: 'cm-valet', closesPath: 'doorman', describe: 'The chef has a word with the doorman. His memory goes.' },
      { id: 'cm-forensics', closesPath: 'knife-rack-gap', describe: 'A new knife appears in the rack overnight.' },
    ],
    dialogues: {
      chef: new DialogueTree({
        id: 'chef', root: 'open',
        nodes: [
          { id: 'open', speaker: 'chef', text: 'Lieutenant. This is a restaurant, not a precinct.', options: [
            { id: 'ask', text: 'Sorry. I skipped lunch and that smell is not helping. Thursday at eight. Where were you?', to: 'alibi', effects: [{ type: 'revealStatement', statement: 's-chef-alibi' }] },
            { id: 'leave-1', text: 'I will not keep you.', to: null },
          ] },
          { id: 'alibi', speaker: 'chef', text: 'The studio. Taping the segment. It ran late.', options: [
            { id: 'press', text: 'Sorry, my pencil. It is in the other coat. The valet puts your car here at 7.52.', to: 'corner', guards: [{ type: 'factKnown', fact: 'f-chef-at-restaurant' }] },
            { id: 'leave-2', text: 'That is my fault. I will straighten it out.', to: null },
          ] },
          { id: 'corner', speaker: 'chef', text: 'A parking ticket. That proves nothing. You are out of your depth here, Lieutenant.', options: [
            { id: 'leave-3', text: 'You are probably right. It usually is nothing.', to: null },
          ] },
        ],
      }),
      waiter: new DialogueTree({
        id: 'waiter', root: 'w-open',
        nodes: [
          { id: 'w-open', speaker: 'waiter', text: 'I already told the uniforms everything.', options: [
            { id: 'w-ask', text: 'They write it up better than I do. Would you mind going again?', to: 'w-home', effects: [{ type: 'revealStatement', statement: 's-waiter-home' }] },
            { id: 'w-leave', text: 'Fair enough.', to: null },
          ] },
          { id: 'w-home', speaker: 'waiter', text: 'Straight home. I was done with that place.', options: [
            { id: 'w-done', text: 'Thank you.', to: null },
          ] },
        ],
      }),
    },
  });
}

function expandedChain() {
  return {
    suspect: 'chef', victim: 'partner', means: 'f-means', time: 'f-time', place: 'f-place',
    alibiMechanism: 'f-tape-mechanism', prologueFact: 'f-chef-at-restaurant',
    contradictedStatement: 's-chef-alibi', corroboration: 'f-valet-corroboration',
    physicalContradiction: 'f-chef-knife',
  };
}
