#!/usr/bin/env bash
# Office of the Road — bounded autonomous build session (home-PC WSL).
# Usage: scripts/night-run.sh [hours]   (default 3h hard cap)
set -u
REPO="/mnt/c/Users/rweis/OneDrive/Documents/office-of-the-road"
HOURS="${1:-3}"
CAP=$(( HOURS * 3600 ))
cd "$REPO" || exit 1

# Kill-file gate
if [ -f STOP ]; then echo "[night-run] STOP file present — not launching."; exit 0; fi

# Auth (setup-token, same as Wintermute's scoper)
set -a; . "$HOME/.generalstaff/.env" 2>/dev/null; set +a

mkdir -p runs
TS=$(date +%Y%m%d-%H%M%S)
LOG="runs/run-$TS.log"

GOAL='/goal The current DESIGN-SEED.md milestone is COMPLETE: its full stated scope is implemented across coherent, tested increments (checkpoint-committed at every green state), the node --test suite passes, and all work is committed AND pushed to origin with PROGRESS.md updated. One increment is NOT completion — continue building increments until the milestone itself is done. — You are the Office of the Road builder. Read CLAUDE.md, MISSION.md, DESIGN-SEED.md, the newest docs/DIRECTIONS-*.md (operator directives — they outrank DESIGN-SEED), PROGRESS.md and git log, then continue building the next milestone increment. Work in small verified steps; checkpoint-commit and push at every green state; obey the STOP file and all CLAUDE.md hard rules.'

echo "[night-run] $TS launching (cap ${HOURS}h) -> $LOG"
timeout "$CAP" claude -p --model opus --dangerously-skip-permissions "$GOAL" >> "$LOG" 2>&1
RC=$?
echo "[night-run] exited rc=$RC" >> "$LOG"

# Safety net: if the session died with uncommitted work, checkpoint it as-found.
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A && git commit -m "WIP safety checkpoint (night-run harness; session rc=$RC)" && git push origin HEAD
  echo "[night-run] safety WIP checkpoint pushed" >> "$LOG"
fi
