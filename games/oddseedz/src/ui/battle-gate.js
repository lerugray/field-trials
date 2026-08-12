// M14 posting-hardening — summon-while-battle-open guard.
//
// The summon input (button and Enter key) must not create a new creature while
// the battle overlay is modal. A new creature under an open bout leaves the old
// overlay stacked on top and traps the player. This tiny module is shared by the
// app and the regression test.

export function summonAllowed({ battleVisible }) {
  if (battleVisible) {
    return {
      ok: false,
      reason: 'Finish or forfeit the bout before summoning a new Buddy.',
    };
  }
  return { ok: true };
}
