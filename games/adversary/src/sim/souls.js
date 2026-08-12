// souls.js — the death-loop economy (DESIGN-SEED "modernizing layer": Souls death loop). XP is at
// risk; equipment and gold are never. On death the unspent XP above the current level's floor drops
// as a single recoverable marker; dying again before recovery FORFEITS the old marker. Levels are
// never lost — the drop floors at the current level's threshold (studio fold: "never below current
// level floor"). Recovering the marker restores the XP (and may re-level).

import { XP_TO_REACH, levelForXp, gainXp } from './stats.js';

/** XP the player currently holds above their level floor — the amount that would be at risk. */
export function xpAtRisk(progress) {
  return Math.max(0, progress.totalXp - XP_TO_REACH[progress.level]);
}

/**
 * Drop a death marker at (x, y). Floors the player's XP to the current level (no level loss) and
 * hands the at-risk XP to a fresh marker. Any pre-existing marker is FORFEITED.
 * @returns {{marker:{xp:number,x:number,y:number}|null, forfeited:number}}
 *   marker is null when there was no XP to risk; forfeited is the XP lost from a prior marker.
 */
export function dropMarker(progress, x, y, prevMarker = null) {
  const forfeited = prevMarker ? prevMarker.xp : 0;
  const atRisk = xpAtRisk(progress);
  progress.totalXp = XP_TO_REACH[progress.level]; // floor to current level; level unchanged
  const marker = atRisk > 0 ? { xp: atRisk, x, y } : null;
  return { marker, forfeited };
}

/**
 * Recover a marker: restore its XP (re-leveling if it crosses a threshold).
 * @returns {{recovered:number, leveledUp:boolean, to:number}}
 */
export function recoverMarker(progress, marker) {
  if (!marker) return { recovered: 0, leveledUp: false, to: progress.level };
  const ev = gainXp(progress, marker.xp);
  return { recovered: marker.xp, leveledUp: ev.leveledUp, to: ev.to };
}

/** Distance-and-direction hint from a position to the marker, for the HUD indicator. Null if none. */
export function markerHint(marker, fromX) {
  if (!marker) return null;
  const dx = marker.x - fromX;
  return { dir: Math.sign(dx) || 1, dist: Math.abs(dx) };
}
