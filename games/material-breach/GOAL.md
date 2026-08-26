# GOAL — MATERIAL BREACH builder

The string below is what the night-run harnesses pass to the builder lane. It is the completion
condition and the standing brief in one. **Keep the "One increment is NOT completion" sentence
intact** — it is the sentence that stops a lane from harvesting after a single commit.

Edit here first, then mirror into `scripts/night-run.sh` and `scripts/night-run-kimi.sh` in the
same commit.

---

```
The current DESIGN-SEED.md milestone is COMPLETE: its full stated scope is implemented across
coherent, tested increments (checkpoint-committed at every green state), the test suite passes,
and all work is committed AND pushed to origin with PROGRESS.md updated. One increment is NOT
completion — continue building increments until the milestone itself is done. — You are the
MATERIAL BREACH builder. Read DESIGN-SEED.md, the newest docs/DIRECTIONS-*.md (operator
directives — they outrank DESIGN-SEED), PROGRESS.md and git log, then continue building the next
milestone increment. Work in small verified steps; checkpoint-commit and push at every green
state; obey the STOP file and all AGENTS.md hard rules.
```

---

**Note on M7a.** The goal string drives the lane to milestone completion, but M7a (the art PoC) is
a HARD STOP for Ray's eyes. A lane that reaches M7a completes the PoC, commits the dated proof
screenshots, updates PROGRESS.md, and exits. It does not continue into M7b.
