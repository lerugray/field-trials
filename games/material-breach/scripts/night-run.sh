#!/usr/bin/env bash
# MATERIAL BREACH — bounded autonomous build session, CLAUDE/OPUS ENGINE (home-PC WSL).
# Ported from chapel-perilous/scripts/night-run.sh. Usage: scripts/night-run.sh [hours] (default 3h)
#
# LANE SPLIT (DESIGN-SEED §9): this opus lane runs M0-M1 (architecture, the cycle spine) and
# M6-M7 (register + art, which are judgment). The systems bulk M2-M5 runs on the kimi sibling,
# scripts/night-run-kimi.sh. That sibling carries the MANDATORY kimi-specific nets: a read-only
# `git diff` watchdog snapshotting every 20 min, a zombie `pgrep` report after the wrapper exits,
# and a shorter default cap. Those nets exist because a kimi lane has destroyed hours of
# uncommitted work by deciding to redo it; they are not optional and are not needed here, because
# the claude lane has not shown that failure mode. Do NOT run both lanes against this tree at once
# — one lane per working tree, always.
set -u
REPO="/home/ray/material-breach"
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

GOAL='/goal The current DESIGN-SEED.md milestone is COMPLETE: its full stated scope is implemented across coherent, tested increments (checkpoint-committed at every green state), the test suite passes, and all work is committed AND pushed to origin with PROGRESS.md updated. One increment is NOT completion — continue building increments until the milestone itself is done. — You are the MATERIAL BREACH builder. Read DESIGN-SEED.md, the newest docs/DIRECTIONS-*.md (operator directives — they outrank DESIGN-SEED), PROGRESS.md and git log, then continue building the next milestone increment. Work in small verified steps; checkpoint-commit and push at every green state; obey the STOP file and all AGENTS.md hard rules.'

echo "[night-run] $TS launching (cap ${HOURS}h) -> $LOG"
timeout "$CAP" claude -p --model opus --dangerously-skip-permissions "$GOAL" >> "$LOG" 2>&1
RC=$?
echo "[night-run] exited rc=$RC" >> "$LOG"

# Safety net: if the session died with uncommitted work, checkpoint it as-found.
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A && git commit -m "WIP safety checkpoint (night-run harness; session rc=$RC)" && git push origin HEAD
  echo "[night-run] safety WIP checkpoint pushed" >> "$LOG"
fi
echo "[night-run] done rc=$RC"
