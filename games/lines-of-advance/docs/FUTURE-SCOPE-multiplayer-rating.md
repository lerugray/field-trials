# Future scope — rated live/async multiplayer (Ray, 2026-08-08)

Operator-stated future goal, recorded verbatim in spirit: a lichess-like experience —
players get a rating, and can play each other live or asynchronously (correspondence).
Ray's own framing: a much bigger project, likely requiring hosting money.

NOT current scope. v1 remains the free, self-contained, file://-playable module with the
M5 engine opponent. Nothing in current milestones should be built against this.

## Shape notes for when this wakes (recorded now so scoping starts warm)

- **Rating:** lichess itself uses Glicko-2, not raw ELO — better with sparse/async play
  (rating + deviation + volatility). "Lichess-like ELO" should likely mean Glicko-2.
- **What it requires beyond the current module:** a server (game relay + persistence),
  accounts/identity, matchmaking or challenge links, rating persistence, and abuse floor
  (engine-assistance detection at scale is hard even for lichess — v-first can simply not
  pretend to solve it and rely on the small-community context).
- **Async (correspondence) is the cheap half** — turns as stored state, no realtime
  infra; live play adds websockets/presence. A staged path exists: challenge-link async
  first, live later.
- **Cost posture:** small-community scale runs on a small VPS/worker class footprint;
  the spend decision is Ray's (revenue/hosting = operator call, per standing rules).
- **Engine tie-in:** the M5 engine + eval bar become analysis tools for played games —
  the lichess register (study/analysis after the game) the project already targets.

## Trigger

Ray raises it post-v1 (or explicitly funds hosting). Until then this file is the record.

## 2026-08-10 — costing + architecture read (Ray re-raised pre-release; banked for the build session)

Ray's framing: very light lichess — play each other live or async, analysis, notes,
game logging/saving, a rating, donations→supporter badges. Fewer members, fewer
features than lichess, fine.

**Cost verdict: $0-5/mo marginal + ~$12/yr domain + Stripe fees. No VPS upgrade.**
The build effort is the real cost, not hosting.

- **Async-first staging** (per the 08-08 note, confirmed): correspondence = stored move
  lists + email nudge (Resend key exists); "both online now" = short polling at this
  scale. True live (clocks/presence) later via CF Durable Objects = the $5/mo Workers
  paid tier — the entire scaling bill.
- **Stack = the hammerstein.ai idiom:** CF Pages (site, free) + Worker + D1
  (accounts/games/ratings/notes, free tier) + Turnstile (free) + magic-link auth via
  Resend. NOT gs-cloud (wrong tenancy: public game traffic doesn't belong on the ops
  box), NOT a new VPS.
- **Server authority for free:** the deterministic plain-JS engine runs inside the
  Worker as the move validator — no duplicated rules code.
- **Rating: Glicko-2** (stands from 08-08; a page of math, behaves well sparse/async).
- **Analysis/notes:** M5 engine + eval bar are already the client-side analysis tools;
  notes/annotations + archive + share links = DB rows. Export = move-list file.
- **Donations/badges:** Stripe payment link (existing account) + webhook → supporter
  flag; badges cosmetic, no feature gating. Anti-cheat posture unchanged: don't pretend.
- **Build shape:** P1 accounts + challenge links + async play + archive + Glicko-2 +
  notes; P2 live + spectating; P3 donations/badges. P1 is lane-heavy, a couple of
  focused sessions.

Trigger unchanged: LoA ships publicly and Ray green-lights the build + any spend.
