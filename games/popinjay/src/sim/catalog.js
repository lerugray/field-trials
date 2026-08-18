// catalog.js — the 24-souvenir catalog as DATA (DESIGN-SEED §The souvenir catalog).
// All strictly ADDITIVE. `tier` = the locale a souvenir becomes eligible (act-gating);
// `implemented` marks which effects the sim wires TODAY (the rest are catalog-defined,
// their mechanics land in later M4 increments — the draft only offers implemented ones
// so a pick is never a dud). Weapon-class (tier 1) carries the bad-luck floor.

export const CATALOG = [
  // --- Weapon-class (the wire + its commitment stay primary) -----------------
  { id: 'secondBarrel', name: 'Second Barrel', tier: 1, kind: 'weapon', blurb: 'Two wire slots, both still walls.', implemented: true },
  { id: 'skyAnchor', name: 'Sky Anchor', tier: 1, kind: 'weapon', blurb: 'The wire anchors at the ceiling and persists 4s.', implemented: true },
  { id: 'quickSpool', name: 'Quick Spool', tier: 1, kind: 'weapon', blurb: 'The wire travels 40% faster.', implemented: true },
  { id: 'gallerySidearm', name: 'Gallery Sidearm', tier: 1, kind: 'weapon', blurb: 'A 6-shot pop-gun on a second button (X).', implemented: true },
  { id: 'longFuse', name: 'Long Fuse', tier: 1, kind: 'weapon', blurb: 'Dynamite pauses a beat between steps.', implemented: true },
  // --- Defense ---------------------------------------------------------------
  { id: 'plumeHat', name: 'Plume Hat', tier: 1, kind: 'defense', blurb: '+1 max heart, filled.', implemented: true },
  { id: 'shieldCharm', name: 'Shield Charm', tier: 1, kind: 'defense', blurb: 'Absorb one hit; recharges each locale.', implemented: true },
  { id: 'sureFeet', name: 'Sure Feet', tier: 2, kind: 'defense', blurb: '+50% i-frames; no contact damage on ladders.', implemented: true },
  { id: 'softLanding', name: 'Soft Landing', tier: 2, kind: 'defense', blurb: 'No knockback hop on a hit.', implemented: true },
  { id: 'operaCloak', name: 'Opera Cloak', tier: 3, kind: 'defense', blurb: 'Post-hit slow-motion beat (1s at 50%).', implemented: true },
  // --- Tempo / economy -------------------------------------------------------
  { id: 'ribbonChain', name: 'Ribbon Chain', tier: 1, kind: 'tempo', blurb: 'Chain window +30 ticks.', implemented: true },
  { id: 'confettiBonus', name: 'Confetti Bonus', tier: 1, kind: 'tempo', blurb: '+50% medallion score.', implemented: true },
  { id: 'seasonPass', name: 'Season Pass', tier: 2, kind: 'tempo', blurb: '+1 ticket per stage clear.', implemented: true },
  { id: 'punctual', name: 'Punctual', tier: 2, kind: 'tempo', blurb: 'Clearing under par pays +2 tickets.', implemented: true },
  { id: 'bellCredit', name: 'Bell Credit', tier: 2, kind: 'tempo', blurb: 'Par +15%.', implemented: true },
  { id: 'collectorsEye', name: "Collector's Eye", tier: 2, kind: 'tempo', blurb: 'Drops fall 30% slower, +15% drop rate.', implemented: true },
  { id: 'centerpieceMedal', name: 'Centerpiece Medal', tier: 2, kind: 'tempo', blurb: 'Centerpieces pay an extra bonus.', implemented: true },
  { id: 'longWaltz', name: 'Long Waltz', tier: 3, kind: 'tempo', blurb: 'Slow/freeze last 50% longer.', implemented: true },
  { id: 'seasonEncore', name: 'Encore', tier: 3, kind: 'tempo', blurb: 'First death: survive on 1 heart, once.', implemented: true },
  // --- Utility ---------------------------------------------------------------
  { id: 'operaGlasses', name: 'Opera Glasses', tier: 1, kind: 'utility', blurb: 'Ghost apex markers on Grand + Parade arcs.', implemented: true },
  { id: 'fairWarning', name: 'Fair Warning', tier: 2, kind: 'utility', blurb: 'Drips telegraph 3s early, enter quarter-speed.', implemented: true },
  { id: 'tubaBlast', name: 'Tuba Blast', tier: 2, kind: 'utility', blurb: 'Once/stage: a shockwave lofts all balloons.', implemented: true },
  { id: 'magnetGloves', name: 'Magnet Gloves', tier: 3, kind: 'utility', blurb: 'Drops drift toward you when below.', implemented: true },
  { id: 'ironGores', name: 'Iron Gores', tier: 3, kind: 'utility', blurb: 'Weighted balloons split one class further.', implemented: true },
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));
export function isWeapon(id) { const c = CATALOG_BY_ID[id]; return !!c && c.kind === 'weapon'; }
export function draftableAt(locale, drafted, trunk = null) {
  const has = new Set(drafted);
  const inTrunk = trunk ? new Set(trunk) : null; // the OWNED pool (trunk), if gated
  return CATALOG.filter((c) => c.implemented && c.tier <= locale && !has.has(c.id) && (!inTrunk || inTrunk.has(c.id)));
}
