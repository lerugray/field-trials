// SHOELEATHER — typewriter reveal (M7 "text speed"; the no-timers law still holds).
//
// A pure helper that computes how much of a line is visible given a characters-per-
// second rate and elapsed time. This is a PRESENTATION reveal, not real-time pressure:
// there is no failure clock and the player can always skip to full instantly (and
// reduced-motion / cps<=0 reveal everything at once). The browser advances `elapsed`
// off requestAnimationFrame; the math lives here so it is deterministic and tested.

export function visibleCount(len, cps, elapsedMs) {
  if (cps <= 0) return len;                 // instant (0 = off)
  if (elapsedMs <= 0) return 0;
  return Math.min(len, Math.floor((cps * elapsedMs) / 1000));
}

// The revealed prefix of `text` at `elapsedMs` given `cps`. `instant` forces full text
// (reduced-motion, or a player skip).
export function reveal(text, cps, elapsedMs, instant = false) {
  const s = String(text);
  if (instant) return s;
  return s.slice(0, visibleCount(s.length, cps, elapsedMs));
}

// Whether the reveal has finished (so the UI can stop animating).
export function isComplete(text, cps, elapsedMs, instant = false) {
  if (instant || cps <= 0) return true;
  return visibleCount(String(text).length, cps, elapsedMs) >= String(text).length;
}

// Total ms a line takes to fully reveal at `cps` (0 when instant/off).
export function revealDurationMs(text, cps) {
  if (cps <= 0) return 0;
  return (String(text).length / cps) * 1000;
}
