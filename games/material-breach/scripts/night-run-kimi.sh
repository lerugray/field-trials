#!/usr/bin/env bash
# MATERIAL BREACH — bounded autonomous build session, KIMI ENGINE (home-PC WSL).
# Ported from the-rackets/scripts/night-run-kimi.sh. Sibling of night-run.sh (claude/opus lane).
# Usage: scripts/night-run-kimi.sh [hours]  (default 2h)
#
# Kimi-specific nets (orchestrator-lane-mechanics 2026-07-29/30 addenda), all MANDATORY:
#   - shorter default cap (kimi vice: batches commits instead of checkpointing; keep runs <= 2h)
#   - read-only `git diff` watchdog every 20 min (a kimi lane has deleted hours of uncommitted work)
#   - never-revert discipline stated in the prompt
#   - zombie report: kimi can outlive its -p wrapper and keep editing the tree
#   - WIP safety checkpoint at exit
# Auth = managed:kimi-code OAuth (~/.kimi-code), no .env needed.
# One lane per working tree: never run this concurrently with night-run.sh against this repo.
set -u
REPO="/home/ray/material-breach"
HOURS="${1:-2}"
CAP=$(( HOURS * 3600 ))
cd "$REPO" || exit 1

if [ -f STOP ]; then echo "[night-run-kimi] STOP file present — not launching."; exit 0; fi

mkdir -p runs
TS=$(date +%Y%m%d-%H%M%S)
LOG="runs/kimi-run-$TS.log"
SNAPDIR="runs/kimi-snap-$TS"
mkdir -p "$SNAPDIR"

PROMPT="You are the MATERIAL BREACH builder. Read AGENTS.md, DESIGN-SEED.md, the newest docs/DIRECTIONS-*.md (operator directives — they outrank DESIGN-SEED), PROGRESS.md and git log, then build the current DESIGN-SEED.md milestone to COMPLETION: full stated scope implemented across coherent, tested increments, node --test suite passing, all work committed AND pushed to origin, PROGRESS.md updated with a 'For the operator to ratify' block. NON-NEGOTIABLE DISCIPLINE: (1) checkpoint-commit AND push at EVERY green state — small commits, never batch; (2) NEVER revert, reset, or re-apply your own committed work — committed work is final, build forward only; (3) if the suite breaks, fix forward from the last commit, never git reset; (4) obey the STOP file and all AGENTS.md hard rules; (5) the pacing law is structural — no timer may ever mutate game state; (6) no LLM-generated imagery, no em-dashes in player-facing text; (7) M7a is a HARD STOP for the operator's eyes — never continue past it. One increment is NOT completion — continue until the milestone itself is done or time runs out; leave the tree committed either way."

# Read-only diff watchdog: snapshots every 20 min (kimi lanes have destroyed uncommitted work).
(
  i=0
  while kill -0 $$ 2>/dev/null; do
    sleep 1200
    i=$((i+1))
    git -C "$REPO" diff > "$SNAPDIR/snap-$i.diff" 2>/dev/null
    git -C "$REPO" status --short > "$SNAPDIR/status-$i.txt" 2>/dev/null
    [ "$i" -ge $(( HOURS * 3 + 2 )) ] && break
  done
) &
WATCHDOG=$!

echo "[night-run-kimi] $TS launching (cap ${HOURS}h) -> $LOG"
timeout "$CAP" "$HOME/.kimi-code/bin/kimi" -p "$PROMPT" >> "$LOG" 2>&1
RC=$?
echo "[night-run-kimi] exited rc=$RC" >> "$LOG"
kill "$WATCHDOG" 2>/dev/null

# Zombie report (kimi can outlive its wrapper): log survivors LOUDLY; orchestrator decides kills.
SURV=$(pgrep -af "kimi -p" 2>/dev/null | grep -v "night-run-kimi" || true)
if [ -n "$SURV" ]; then
  echo "[night-run-kimi] WARNING surviving kimi process(es) after wrapper exit:" >> "$LOG"
  echo "$SURV" >> "$LOG"
fi

# Safety net: checkpoint uncommitted work as-found.
if ! git diff --quiet || ! git diff --cached --quiet; then
  git add -A && git commit -m "WIP safety checkpoint (night-run-kimi harness; session rc=$RC)" && git push origin HEAD
  echo "[night-run-kimi] safety WIP checkpoint pushed" >> "$LOG"
fi
echo "[night-run-kimi] done rc=$RC"
