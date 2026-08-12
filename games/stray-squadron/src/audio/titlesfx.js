// Title-screen SFX sockets (M12) — SILENT this milestone by design.
//
// DIRECTIONS-M12 asks for "menu move/confirm SFX hooks, ALL SILENT — the operator
// records MS-20/sample-sourced audio next session." This is that wiring and nothing
// more: two named hook points (move, confirm) that the title menu calls, which stay
// silent until the operator supplies a sample player + samples. No sound is generated
// here (that would violate the code-generated-assets exemption AND the milestone's
// "all silent" contract); when the operator drops in samples, the same hooks fire them.
//
// Pure/injectable so the socket contract is headless-testable: with no player+sample a
// hook is a no-op returning false; wire both and it plays and returns true.

export const TITLE_SFX_HOOKS = ['move', 'confirm'];

// deps:
//   play(sample)  -> the operator's sample player (WebAudio buffer, an <audio>, etc.)
//   samples       -> { move: <sample>, confirm: <sample> } — the recorded assets
// Both absent (this milestone) => every hook is silent.
export function createTitleSfx(deps = {}) {
  const play = typeof deps.play === 'function' ? deps.play : null;
  const samples = deps.samples && typeof deps.samples === 'object' ? deps.samples : {};

  function fire(name) {
    const sample = samples[name];
    if (!play || sample == null) return false; // socket empty -> silent
    play(sample);
    return true;
  }

  return {
    move: () => fire('move'),
    confirm: () => fire('confirm'),
    // Introspection for a credits/wiring surface + tests.
    hooks: TITLE_SFX_HOOKS.slice(),
    isWired: (name) => !!play && samples[name] != null,
  };
}
