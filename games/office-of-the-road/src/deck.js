// deck.js — THE TAROT DECK (DESIGN-SEED M3). The run-scoped build agency: a thin,
// drafted deck of major-arcana cards played into automated combat as interventions
// and read as omens on the road. Deck-neutral vs jobs (axis orthogonality). Cards
// are drawn/shuffled on the `shuffle` RNG stream so combat resolution (the
// `combat` stream) is never perturbed by a card play, and vice-versa.
//
// Cards keep their tarot NAMES (the omen fiction is diegetic); the EFFECT text is
// deadpan administrative per the register laws. Pure + serializable.
//
// A card: { id, name, arcana (art key), kind, power, target, text }
//   kind:   'strike' (damage a foe) | 'smite' (heavy, sturdiest foe) |
//           'execute' (finish the weakest foe) | 'mend' (heal an ally) |
//           'salve' (heal the whole party) | 'rally' (raise a frame's ATK, fight) |
//           'ordinance' (raise the party's ATK, fight) | 'ward' (raise party DEF) |
//           'stay' (suspend a foe's next action) | 'instrument' (draw more cards)
//   target: 'enemy' | 'weakest' | 'sturdiest' | 'ally' | 'allies' | 'self' | 'none'

export const CARDS = {
  the_tower: { id: 'the_tower', name: 'The Tower', arcana: 'the_tower', kind: 'strike', power: 2.2, target: 'enemy', text: 'A structure is found noncompliant and reduced.' },
  strength: { id: 'strength', name: 'Strength', arcana: 'strength', kind: 'rally', power: 0.5, target: 'ally', text: 'An affidavit of vigour is entered for one frame.' },
  the_star: { id: 'the_star', name: 'The Star', arcana: 'the_star', kind: 'mend', power: 2.0, target: 'ally', text: 'Relief is granted to a frame, without explanation.' },
  temperance: { id: 'temperance', name: 'Temperance', arcana: 'temperance', kind: 'ward', power: 1.0, target: 'allies', text: 'Proportion is imposed on the proceedings.' },
  death: { id: 'death', name: 'Death', arcana: 'death', kind: 'execute', power: 0.35, target: 'weakest', text: 'The matter is closed with prejudice.' },
  the_sun: { id: 'the_sun', name: 'The Sun', arcana: 'the_sun', kind: 'salve', power: 1.1, target: 'allies', text: 'A general clemency is posted to the whole party.' },
  justice: { id: 'justice', name: 'Justice', arcana: 'justice', kind: 'smite', power: 2.0, target: 'sturdiest', text: 'Distribution is corrected against the sturdiest party.' },
  the_emperor: { id: 'the_emperor', name: 'The Emperor', arcana: 'emperor', kind: 'ordinance', power: 0.35, target: 'allies', text: 'An ordinance raises the whole party for the engagement.' },
  hanged_man: { id: 'hanged_man', name: 'The Hanged Man', arcana: 'hanged_man', kind: 'stay', power: 1, target: 'enemy', text: 'Proceedings against a party are suspended one turn.' },
  the_magician: { id: 'the_magician', name: 'The Magician', arcana: 'magician', kind: 'instrument', power: 2, target: 'none', text: 'An additional instrument is produced; draw two.' },
  the_moon: { id: 'the_moon', name: 'The Moon', arcana: 'the_moon', kind: 'strike', power: 1.6, target: 'weakest', text: 'An irregularity is noted and pressed.' },
  the_hermit: { id: 'the_hermit', name: 'The Hermit', arcana: 'the_hermit', kind: 'ward', power: 1.4, target: 'self', text: 'A frame withdraws to review the file, and is harder to reach.' },
};

// The card pool available to draft (all but the starter-only balance). Order is
// stable (draft offers + omens read from it).
export const CARD_IDS = Object.keys(CARDS);

// The starting deck — thin and intentional (StS discipline). Routine fights are
// winnable with ZERO cards (M2 baseline); the deck bends elite/boss odds.
export const STARTING_DECK = ['the_tower', 'the_star', 'strength', 'temperance', 'death'];

export function getCard(id) {
  const c = CARDS[id];
  if (!c) throw new Error('unknown card: ' + id);
  return c;
}

/**
 * The name as it is printed on a card's name plate (draft offers, deck review).
 * The leading article is dropped and NOTHING else — a plate never abbreviates,
 * slices or ellipsizes a name. Both plate surfaces read it from here, so the
 * two can never disagree about what a card is called, and the no-truncation
 * regression has one string to measure.
 */
export function cardPlateName(id) {
  return getCard(id).name.replace(/^The /, '');
}

// Fisher–Yates using a stream (deterministic). Returns a new array.
export function shuffle(arr, stream) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = stream.int(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// createDeck: a fresh run deck. `list` is the persistent card list; the draw pile
// starts as a shuffle of it, hand + discard empty.
export function createDeck(list = STARTING_DECK, stream = null) {
  const full = list.slice();
  return {
    list: full,
    drawPile: stream ? shuffle(full, stream) : full.slice(),
    hand: [],
    discard: [],
  };
}

// drawOne: move one card draw->hand, reshuffling discard into draw if empty.
// Returns the drawn card id, or null if the deck is entirely empty.
export function drawOne(deck, stream) {
  if (deck.drawPile.length === 0) {
    if (deck.discard.length === 0) return null;
    deck.drawPile = shuffle(deck.discard, stream);
    deck.discard = [];
  }
  const id = deck.drawPile.shift();
  deck.hand.push(id);
  return id;
}

// drawUp: draw up to n cards (or until the deck is dry). Returns drawn ids.
export function drawUp(deck, n, stream) {
  const drawn = [];
  for (let i = 0; i < n; i++) { const id = drawOne(deck, stream); if (id == null) break; drawn.push(id); }
  return drawn;
}

// playFromHand: remove the card at handIndex, push to discard, return its id.
export function playFromHand(deck, handIndex) {
  if (handIndex < 0 || handIndex >= deck.hand.length) return null;
  const id = deck.hand.splice(handIndex, 1)[0];
  deck.discard.push(id);
  return id;
}

// addCard / removeCard: run-persistent deck edits (draft adds; camp removes).
export function addCard(deck, id) {
  getCard(id);
  deck.list.push(id);
  deck.discard.push(id); // enters the discard so it can be drawn next reshuffle
  return deck;
}
export function removeCard(deck, id) {
  const drop = (arr) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); };
  const i = deck.list.indexOf(id); if (i < 0) return false;
  deck.list.splice(i, 1); drop(deck.drawPile); drop(deck.hand); drop(deck.discard);
  return true;
}

// discardHand: sweep the hand into discard (between fights).
export function discardHand(deck) {
  while (deck.hand.length) deck.discard.push(deck.hand.shift());
}

export function serializeDeck(deck) {
  return { list: deck.list.slice(), drawPile: deck.drawPile.slice(), hand: deck.hand.slice(), discard: deck.discard.slice() };
}
export function restoreDeck(snap) {
  if (!snap) return createDeck();
  return { list: snap.list.slice(), drawPile: snap.drawPile.slice(), hand: snap.hand.slice(), discard: snap.discard.slice() };
}
