// Ambient hangar chatter (M10 living world) — a pure, deterministic rotator over a
// pool of ALREADY-AUTHORED lines. It writes no new prose: the hub feeds it the
// existing (operator-blessed) crew quips so the hangar feels lived-in as they cycle.
// It never touches game state — it only decides which existing line shows next.
//
// Pure and headless-testable; the hub owns the clock (a slow interval) and calls
// advance(). Reduced-motion is honoured at the presentation layer (the hub swaps the
// text without a fade), not here — rotating text is not vestibular motion.

export function createChatter(lines, startIndex = 0) {
  const pool = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string' && l.length) : [];
  let i = pool.length ? ((startIndex % pool.length) + pool.length) % pool.length : 0;

  return {
    // The line currently on screen (or '' if the pool is empty).
    current: () => (pool.length ? pool[i] : ''),
    // Advance to the next line (wraps). Returns the new current line.
    advance() {
      if (pool.length) i = (i + 1) % pool.length;
      return pool.length ? pool[i] : '';
    },
    index: () => i,
    size: () => pool.length,
  };
}
