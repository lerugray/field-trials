Launch gate: **BLOCKED**. The seed has strong taste, but several core contracts are contradictory or too underspecified for an unsupervised builder.

## 1. DESIGN HOLES

1.1 **Claim: “Gallery gun” contradicts the wire-as-wall law.**  
Why it bites: The reference law says the wire is commitment and a wall; the souvenir list says “gallery gun” / “rapid gun” trades away that property, while another rule bans capability-reducing souvenirs. A builder can implement it as a replacement weapon and make stages invalid for that build, or as an added mode and trivialize commitment.  
Severity: **BLOCKER**

1.2 **Claim: The spec does not define how weapon variants stack or exclude each other.**  
Why it bites: Double wire, anchor-hook, and gallery gun can be mutually exclusive weapons, passive modifiers, selectable modes, or simultaneous upgrades. Each interpretation changes level validity, draft value, input complexity, and balance.  
Severity: **BLOCKER**

1.3 **Claim: Split arithmetic conflicts with density ceilings.**  
Why it bites: One Grand implies 15 eventual targets and up to 8 Pennies from that single original. A roster that passes initial density can violate the Penny ceiling after normal play, and “dynamite” can violate it instantly. If the builder enforces the cap by suppressing splits, it breaks the core arithmetic.  
Severity: **BLOCKER**

1.4 **Claim: The validator’s stated density check is too narrow.**  
Why it bites: “Max simultaneous Penny count” ignores dangerous mixtures of Grand/Parade/Fair, synchronized medium arcs, and total screen occupancy. The hardest patterns are often mixed-size interference, not just Penny count.  
Severity: **RISK**

1.5 **Claim: Closing-bell drip contradicts “Stage = clear all balloons.”**  
Why it bites: If drip Pennies count toward clear, late players can be trapped in an endless debt spiral. If they do not count, the game can declare a clear while hazards remain onscreen. If drip stops at original-roster clear, that rule is absent.  
Severity: **BLOCKER**

1.6 **Claim: Closing-bell drip creates a farming hole.**  
Why it bites: The seed also says chain pops pay bonus tickets. Infinite/uncapped Penny drip lets a player milk score, chains, drops, or tickets unless drip rewards are explicitly excluded or capped.  
Severity: **BLOCKER**

1.7 **Claim: Three hearts are fixed, but the hit model is not.**  
Why it bites: The seed keeps reference-style positioning tension but adds composure hearts, i-frames, and knockback. Without exact invulnerability duration, contact re-hit rules, knockback direction, heart cap, and recovery timing, the builder can make hearts either meaningless or a license to face-tank.  
Severity: **RISK**

1.8 **Claim: Heart restoration undermines attrition unless capped and timed.**  
Why it bites: “One per locale cleared; centerpiece bonus; souvenir charms” can mean overheal, full refill, max-only refill, immediate post-stage refill, or delayed bonus. Those produce very different run difficulty and souvenir value.  
Severity: **RISK**

1.9 **Claim: Draft economics are internally unstable with pool 16 over 11 drafts.**  
Why it bites: If only chosen souvenirs leave the pool, the player can take 11 of 16 and may see repeats of rejected items unless offer logic is defined. If all offered souvenirs leave, the pool is exhausted after five full drafts plus one item. Either way, late drafts risk no real choice.  
Severity: **BLOCKER**

1.10 **Claim: “Drafted souvenirs leave the pool” is ambiguous enough to break the run.**  
Why it bites: “Drafted” can mean selected, offered, seen, or unlocked. An autonomous builder may pick any. Pool exhaustion, duplicate offers, and act-gated availability all depend on this one word.  
Severity: **BLOCKER**

1.11 **Claim: The Panic Finale is underspecified for a souvenir-less build.**  
Why it bites: Skip-for-ticket is legal, and souvenirs are supposed to only add capability. Therefore the finale must be winnable with baseline wire, baseline hearts, and no charms. The seed does not specify finale duration, spawn budget, caps, item drops, or validation under no-souvenir conditions.  
Severity: **BLOCKER**

1.12 **Claim: Panic Finale victory criteria are missing beyond “survive.”**  
Why it bites: A timed survival mode needs exact duration, escalation curve, spawn lanes, maximum simultaneous balloons, whether existing balloons must be cleared at time end, and whether drops appear. Otherwise the builder will invent a different final game.  
Severity: **BLOCKER**

1.13 **Claim: Breakable tiles have no mechanical contract.**  
Why it bites: They are named as part of stage grammar, but not who breaks them, when, whether balloons collide with them, whether wires pass through them, whether they drop items, or whether they can strand the player. Generated grammar cannot safely use them without this.  
Severity: **BLOCKER**

1.14 **Claim: Breakables invalidate simple floor-reachability validation.**  
Why it bites: A floor reachable before breakage may become unreachable after breakage, or vice versa. If breakables can be destroyed by the wire, a player can accidentally softlock route access.  
Severity: **BLOCKER**

1.15 **Claim: Balloon/platform collision rules are missing.**  
Why it bites: The seed says platforms shape bounce space, but does not define whether balloons collide with platform tops only, undersides, sides, one-way floors, ladders, or breakables. “Readable parabolas” depends on this exact collision model.  
Severity: **BLOCKER**

1.16 **Claim: Wire/platform interaction is missing.**  
Why it bites: Does the wire stop at platforms, pass through platforms, attach to the first ceiling/floor above, break tiles, or hit balloons through floors? Pang-like play changes completely depending on that answer.  
Severity: **BLOCKER**

1.17 **Claim: “Wire is a wall” can be misread as physical deflection.**  
Why it bites: If balloons bounce off the wire instead of splitting/removing it, the whole pattern arithmetic changes. If the wire is only a hit-scan damage line, commitment disappears.  
Severity: **BLOCKER**

1.18 **Claim: Multi-hit wire behavior is undefined.**  
Why it bites: If two balloons intersect the same wire on the same tick, does it hit both, nearest-first, oldest-first, or one random collision? Chain scoring, fairness, and determinism all depend on this.  
Severity: **RISK**

1.19 **Claim: Drops are listed but not specified.**  
Why it bites: Time-slow, freeze, dynamite, shield, and points need drop rates, lifetime, collection rules, stacking, duration, caps, and whether they appear in finale/drip balloons. Without that, M3 can produce random-feeling power spam or useless drops.  
Severity: **RISK**

1.20 **Claim: Dynamite is especially underdefined.**  
Why it bites: “Split EVERYTHING to Penny at once” can mean each balloon becomes one Penny, each balloon expands to its full descendant Penny count, or each current balloon steps down repeatedly. Only one preserves the stated split arithmetic.  
Severity: **BLOCKER**

---

## 2. ROGUELITE STRUCTURE RISKS

2.1 **Claim: Legal skipping can become the optimal meta farm.**  
Why it bites: Skip gives +1 ticket, and no-souvenir play must remain valid. If early stages are safe enough, a player can repeatedly skip, bank stage tickets, die, and unlock trunk content with less risk than engaging the draft.  
Severity: **RISK**

2.2 **Claim: Ticket banking timing is unclear.**  
Why it bites: “Death prints a scorecard” and “tickets bank” could mean tickets accrue immediately, only on death, only on stage clear, or only after scorecard. Farming and save-scumming pressure depend on exact timing.  
Severity: **RISK**

2.3 **Claim: Chain-ticket rewards plus closing-bell drip create a degenerate loop.**  
Why it bites: A min-maxer can intentionally go past par to spawn more Pennies, chain them, collect drops, and convert time into tickets unless those spawns are excluded from rewards.  
Severity: **BLOCKER**

2.4 **Claim: “Deep runs strictly beat farming” is asserted but not enforceable.**  
Why it bites: No ticket costs, payout formula, chain-ticket cap, or victory multiplier are specified. The builder cannot prove the economy has the intended shape.  
Severity: **BLOCKER**

2.5 **Claim: The trunk can still dilute casual players through auto-fill.**  
Why it bites: The seed says progression is never dilution, but “default auto-fill” can automatically add weak/niche unlocks into the loadout for players who do not curate. Agency exists only if the UI and default behavior protect them.  
Severity: **RISK**

2.6 **Claim: Initial trunk size is missing.**  
Why it bites: The run draft assumes a pool of up to 16, but a new player may have fewer than enough unlocked souvenirs. The builder may pad with locked items, duplicates, blanks, or silently shrink draft choices.  
Severity: **BLOCKER**

2.7 **Claim: The souvenir catalog is incomplete for a 16-item pool.**  
Why it bites: Only examples are named. An unsupervised builder will invent the rest, likely producing dead picks, duplicate effects, or power spikes that invalidate the run curve.  
Severity: **BLOCKER**

2.8 **Claim: Weapon souvenirs risk strict dominance.**  
Why it bites: Since souvenirs may only add capability, double wire and anchor-hook are likely always better unless constrained by cooldown, duration, slot, or mode rules. If gallery gun is a replacement, it violates the rule; if additive, it may dominate.  
Severity: **RISK**

2.9 **Claim: Some souvenirs are likely dead picks in finale.**  
Why it bites: Slow-drift, longer freeze, drop-rate up, and weapon variants may have very different value in clear-all stages versus timed rain survival. If the finale has no drops or no freeze targets, late draft choices become traps.  
Severity: **RISK**

2.10 **Claim: Act-gated tiers can produce invalid drafts.**  
Why it bites: If the eligible pool for an act has fewer than three items, the draft UI must know whether to show fewer choices, backfill lower tiers, repeat items, or skip the draft. None is specified.  
Severity: **BLOCKER**

2.11 **Claim: Draft choices may become solved too early.**  
Why it bites: With no shops and no build costs, players will identify a small safety core: shield charm, double wire, slow/freeze extension, drop-rate. If narrow alternatives are not tuned, the draft becomes rote after one evening.  
Severity: **RISK**

2.12 **Claim: “Generated stages stay valid under any build” can flatten build identity.**  
Why it bites: If no stage may require a souvenir, souvenirs can only reduce difficulty or improve scoring. That risks builds feeling like passive ease modifiers rather than run-defining verbs.  
Severity: **RISK**

2.13 **Claim: Centerpieces may break the any-build promise.**  
Why it bites: Authored set-pieces are exactly where designers tend to assume a tool. If a centerpiece has high platforms, dense splits, or breakable routing that expects anchor/double wire, no-souvenir or unlucky drafts can hard-stop.  
Severity: **BLOCKER**

2.14 **Claim: Heart restore cadence can erase locale difficulty.**  
Why it bites: If one heart returns per locale and centerpieces add more, a player can brute-force each act with little consequence. If restore is too stingy, early unlucky contact ruins a 20-minute run. The seed does not define the intended attrition curve.  
Severity: **RISK**

2.15 **Claim: Endless Panic unlock may be unreachable for unlucky players.**  
Why it bites: If the finale is underbalanced or draft RNG produces dud builds, players can spend an evening never seeing the unlockable mode despite understanding the game.  
Severity: **RISK**

2.16 **Claim: The run has no bad-luck protection for drafts.**  
Why it bites: Draft-of-3 from a 16 pool can offer three irrelevant souvenirs several stages in a row. Since there are no shops and no rerolls specified, an unlucky player may have a dud run without meaningful correction.  
Severity: **RISK**

---

## 3. GENERATOR RISKS

3.1 **Claim: Floor reachability does not imply balloon clearability.**  
Why it bites: A player can reach every floor while some balloon lanes are impossible to hit because platforms block wires, ceiling pockets trap balloons, or safe firing positions do not exist.  
Severity: **BLOCKER**

3.2 **Claim: Passive forward simulation does not validate player-caused split states.**  
Why it bites: If the validator merely plays physics forward without firing, it never sees the dangerous or impossible states created by splits. The worst density and trap states appear after player action.  
Severity: **BLOCKER**

3.3 **Claim: Spawn-safety for first N ticks is insufficient.**  
Why it bites: A stage can be safe for N ticks and then force an unavoidable hit before the player can meaningfully reposition. It can also be safe at spawn but make every ladder route lethal.  
Severity: **RISK**

3.4 **Claim: No validation proves a safe opening move exists.**  
Why it bites: The player has no jump and only one default wire. Some layouts may require a first shot or first climb that is impossible without taking damage.  
Severity: **BLOCKER**

3.5 **Claim: No validation proves baseline build solvability.**  
Why it bites: The seed says stages stay valid under any build, but the validator only names spawn safety, density, and floor reachability. It does not prove the stage can be cleared with default wire and no souvenirs.  
Severity: **BLOCKER**

3.6 **Claim: No validation covers souvenir extremes.**  
Why it bites: Double wire, anchor-hook, freeze, time-slow, shield, and dynamite can alter timing and density. A stage that is valid baseline may become unreadable or density-breaking under dynamite or drip.  
Severity: **RISK**

3.7 **Claim: Density ceilings must include closing-bell and drops.**  
Why it bites: A generated roster can pass validation, then par drip or dynamite can exceed the ceiling in normal play. The player experiences the generated stage, not the pre-par roster.  
Severity: **BLOCKER**

3.8 **Claim: Top-corner drip can spawn into invalid geometry.**  
Why it bites: Generated platforms may occupy or occlude top corners. Drip Pennies can appear inside walls, immediately collide unpredictably, or be unreachable.  
Severity: **BLOCKER**

3.9 **Claim: Breakable tiles make static reachability unsound.**  
Why it bites: The reachable graph changes during play. A validator must reason about both pre-break and post-break states or generated stages can softlock.  
Severity: **BLOCKER**

3.10 **Claim: Ladder safety is not validated.**  
Why it bites: Since the player cannot jump, ladders are mandatory movement corridors. A stage can have reachable floors but ladders whose entrances or climb paths are permanently swept by balloons.  
Severity: **RISK**

3.11 **Claim: The generator can create boring but valid stages.**  
Why it bites: Open rectangles with one slow Grand, overlong ladder mazes, or sparse rosters can pass spawn/density/reachability checks while failing the core “read five parabolas” promise.  
Severity: **RISK**

3.12 **Claim: The generator can create unreadable but valid stages.**  
Why it bites: Too many platforms, tiny gaps, HUD-adjacent hazards, overlapping silhouettes, or synchronized Penny swarms can pass numeric caps while being visually noisy or unfair.  
Severity: **RISK**

3.13 **Claim: No par feasibility check is specified.**  
Why it bites: Par drives pressure. If par is too low, drip becomes baseline difficulty; if too high, pressure never appears. Generated stages need par based on clearability, roster, and layout.  
Severity: **RISK**

3.14 **Claim: No retry/fallback policy for failed generation is specified.**  
Why it bites: A seed can fail validation repeatedly. Without bounded retries and loud fallback behavior, the shipped game can hang, silently substitute content, or produce inconsistent runs.  
Severity: **BLOCKER**

3.15 **Claim: Centerpieces need the same validation contract as generated stages.**  
Why it bites: Authored-constraint set-pieces can still be unclearable, unfair, or impossible under baseline. The seed does not explicitly put them through the same validator.  
Severity: **RISK**

3.16 **Claim: Screen-fill validation is visual, not just geometric.**  
Why it bites: “One screen, always” can still fail if balloons overlap HUD, platforms obscure silhouettes, or line hitboxes are hidden by decoration. The generator must validate gameplay-frame clarity, not only coordinates.  
Severity: **RISK**

---

## 4. BUILDER-AMBIGUITY TRAPS

4.1 **Claim: The wire behavior is easy to implement wrong.**  
Quote: “**The wire is a wall.** Fired straight up from the player, travels to the ceiling, PERSISTS as a line hitbox until it hits balloon or ceiling; one in flight by default.”  
Why it bites: “Wall” can mean solid deflector, damaging line, lingering barrier, or projectile. “Until it hits ceiling” can mean it disappears at ceiling, which conflicts with the anchor-hook distinction.  
Should pin down: collision resolution, travel speed, linger time, ceiling/platform stopping rules, and whether balloons split or bounce on contact.  
Severity: **BLOCKER**

4.2 **Claim: The gun variant directly contradicts the add-only rule.**  
Quote: “Variants (double wire, anchor-hook that sticks to the ceiling and lingers, rapid gun that trades away the wall property) arrive as souvenirs.”  
Quote: “Souvenirs only ever ADD capability (a capability-reducing souvenir is banned by rule — generated stages stay valid under any build).”  
Why it bites: A builder cannot know whether gallery/rapid gun is a replacement that removes wall behavior or an additional firing mode.  
Should pin down: whether gun is additive, optional, mutually exclusive, or removed from v1.  
Severity: **BLOCKER**

4.3 **Claim: Stage completion is ambiguous once par expires.**  
Quote: “Stage = clear all balloons.”  
Quote: “Past par the bandstand tempo rises and a slow drip of extra Penny balloons enters from the top corners — pressure without a hard fail.”  
Why it bites: The builder must decide whether drip balloons are part of the clear condition. Either answer changes stage duration and exploitability.  
Should pin down: original-roster versus spawned-balloon clear rules, and what happens to remaining drip balloons at clear.  
Severity: **BLOCKER**

4.4 **Claim: Density validation is underspecified and may break core splitting.**  
Quote: “density ceilings (max simultaneous Penny count bounded per act)”  
Why it bites: A builder may cap Pennies by deleting or suppressing child balloons, violating “One Grand = 15 eventual targets.”  
Should pin down: density caps as generation rejection criteria, including post-split, dynamite, and drip states.  
Severity: **BLOCKER**

4.5 **Claim: Dynamite arithmetic is unclear.**  
Quote: “dynamite = split EVERYTHING to Penny at once — the panic button that floods the screen, both rescue and self-inflicted disaster”  
Why it bites: “Everything to Penny” has multiple interpretations and can produce wildly different target counts.  
Should pin down: exact descendant count per current balloon class and whether the Penny ceiling can be exceeded.  
Severity: **BLOCKER**

4.6 **Claim: Breakable tiles invite arbitrary implementation.**  
Quote: “Fixed single-screen stages with platforms, ladders, and breakable tiles that shape the bounce space”  
Why it bites: The line says they exist but not how they break or why. An LLM builder may make them cosmetic, player-collidable only, wire-destroyed, balloon-destroyed, or random.  
Should pin down: break triggers, collision behavior, permanence, scoring/drop effects, and reachability constraints.  
Severity: **BLOCKER**

4.7 **Claim: Draft removal semantics are ambiguous.**  
Quote: “Pool of 16; drafted souvenirs leave the pool; skip = +1 prize ticket.”  
Why it bites: “Drafted” can mean offered or chosen. Over 11 drafts, this changes the entire run economy.  
Should pin down: whether unchosen offers return, how duplicates are prevented, and what happens when fewer than three valid items remain.  
Severity: **BLOCKER**

4.8 **Claim: Act tiers are named but not defined.**  
Quote: “double wire, anchor-hook, gallery gun, shield charm, slow-drift balloons, longer freeze, drop-rate up, act-gated tiers.”  
Why it bites: The builder will invent tier membership, power curves, and availability rules.  
Should pin down: which souvenirs belong to which act/tier and how tier gates interact with a shrinking pool.  
Severity: **BLOCKER**

4.9 **Claim: Heart restoration rules are incomplete.**  
Quote: “Hearts restore: one per locale cleared; centerpiece bonus; souvenir charms.”  
Why it bites: Max heart cap, overheal, timing, and charm stacking are undefined.  
Should pin down: maximum composure, exact restore moments, and whether bonuses can exceed max.  
Severity: **RISK**

4.10 **Claim: Ticket scoring is not implementable as written.**  
Quote: “PRIZE TICKETS bank (stage N pays N; centerpiece + finale bonuses; victory multiplier — deep runs strictly beat farming).”  
Why it bites: “Stage N” may mean global stage index, locale-local stage, or act-relative stage. Bonuses and multiplier values are absent.  
Should pin down: payout table, multiplier timing, death banking, and reward exclusions.  
Severity: **BLOCKER**

4.11 **Claim: Chain ticket rewards can be over-scoped.**  
Quote: “Chain pops (multiple splits within a beat window) escalate the fanfare and pay bonus tickets.”  
Why it bites: A builder can create persistent currency from moment-to-moment chains, making score exploits central.  
Should pin down: whether chain rewards are score-only, ticket-bearing, capped, or excluded for drip-spawned balloons.  
Severity: **BLOCKER**

4.12 **Claim: Trunk start state and auto-fill are missing.**  
Quote: “tickets unlock souvenirs into the player's trunk; the pre-run pool is a loadout of up to 16 from the trunk (default auto-fill).”  
Why it bites: New-player runs may have fewer than 16 items, and auto-fill may create unintended dilution.  
Should pin down: starting trunk, unlock costs/order, underfilled draft behavior, and auto-fill priority.  
Severity: **BLOCKER**

4.13 **Claim: “Any build” validation is undefined.**  
Quote: “generated stages stay valid under any build”  
Why it bites: This could mean baseline only, all possible souvenir combinations, no-souvenir skip builds, or all unlocked trunk loadouts.  
Should pin down: the exact set of builds every generated and centerpiece stage must support.  
Severity: **BLOCKER**

4.14 **Claim: Centerpiece authorship is vague.**  
Quote: “each locale's fourth a CENTERPIECE (authored-constraint set-piece ball configuration)”  
Why it bites: “Authored-constraint” can mean fixed layout, fixed roster, fixed grammar template, or generated layout with curated balloon counts.  
Should pin down: what is authored, what is seeded, and whether centerpieces vary between runs.  
Severity: **RISK**

4.15 **Claim: Finale mechanics are mostly absent.**  
Quote: “the tour ending in a timed PANIC FINALE.”  
Quote: “Panic mode (Super Pang's second invention): a continuous escalating rain survival mode — kept as the run finale and an unlockable endless mode.”  
Why it bites: The builder must invent the final mode’s duration, spawn schedule, cap, reward, drops, and win check.  
Should pin down: timed length, escalation table, spawn geometry, density caps, drops, and end condition.  
Severity: **BLOCKER**

4.16 **Claim: Platform physics under “preserved amplitude” are ambiguous.**  
Quote: “Constant gravity, size-classed bounce amplitude preserved forever (no energy loss), constant horizontal speed, exact parabolas.”  
Why it bites: With platforms at different heights, “amplitude preserved” can mean world-space apex, bounce impulse, or class-specific height above collision surface.  
Should pin down: bounce impulse/apex rules for floor, platform top, underside, and side collisions.  
Severity: **BLOCKER**

---

## 5. WHAT’S MISSING ENTIRELY

5.1 **Claim: The 16-souvenir catalog is missing.**  
Why it bites: The seed names examples but requires a 16-item draft pool. An autonomous builder will invent half the roguelite content and its balance.  
Severity: **BLOCKER**

5.2 **Claim: Exact souvenir effect values are missing.**  
Why it bites: “Double wire,” “slow-drift,” “longer freeze,” and “drop-rate up” need durations, percentages, caps, stacking rules, and incompatibilities. Without values, balance is guesswork.  
Severity: **BLOCKER**

5.3 **Claim: Drop-table math is missing.**  
Why it bites: Drop probabilities, item lifetimes, collection radius, spawn position, per-stage caps, and finale eligibility are core to arcade pacing.  
Severity: **BLOCKER**

5.4 **Claim: Economy costs are missing.**  
Why it bites: Ticket unlock prices, starting unlocks, victory multiplier value, centerpiece bonus, and finale bonus are absent, so “deep runs strictly beat farming” cannot be tested.  
Severity: **BLOCKER**

5.5 **Claim: Score and ticket separation is missing.**  
Why it bites: The seed mentions points, scorecard, tickets, chains, and best chain, but not whether score is cosmetic, persistent, converted, or leaderboard-facing. Arcade motivation needs a clear scoring contract.  
Severity: **RISK**

5.6 **Claim: Difficulty tables are missing.**  
Why it bites: There are no per-act values for balloon speeds, gravity, roster budgets, par times, drip rates, density caps, drop rates, or finale escalation. The builder will tune by feel unsupervised.  
Severity: **BLOCKER**

5.7 **Claim: Target success/failure rates are missing.**  
Why it bites: A 15–20 minute roguelite needs intended first-evening progress, expected win rate, and act difficulty curve. Without that, technical completion can still ship as too easy or too punishing.  
Severity: **RISK**

5.8 **Claim: Collision/hitbox contract is missing.**  
Why it bites: Player body, balloon radius by class, wire thickness, ladder overlap, platform edges, i-frame hit rules, and simultaneous collision priority define fairness.  
Severity: **BLOCKER**

5.9 **Claim: Input/control specifics are missing beyond verbs.**  
Why it bites: Walk speed, ladder speed, fire buffering, direction lock while firing, ladder mount/dismount behavior, menu focus rules, and held-key behavior all affect feel.  
Severity: **RISK**

5.10 **Claim: Onboarding is missing.**  
Why it bites: M6 asks for help/controls, but there is no first-run teaching plan for wire commitment, split arithmetic, ladders, par pressure, souvenirs, or dynamite risk. Players can bounce off before the roguelite loop appears.  
Severity: **RISK**

5.11 **Claim: Title/trunk/draft/run UX flow is missing.**  
Why it bites: The seed names screens but not the state flow, retry speed, draft confirmation, trunk editing, unlock presentation, or scorecard-to-next-run loop. An LLM builder may produce a clumsy shell around good mechanics.  
Severity: **RISK**

5.12 **Claim: Local leaderboard / best-score contract is missing.**  
Why it bites: M6 mentions run history and best-tour stats, but not local high scores, score sorting, or scorecard retention. For an arcade roguelite, score persistence is table-stakes.  
Severity: **RISK**

5.13 **Claim: Browser/platform target is missing.**  
Why it bites: The stack says file:// single HTML, but not target browsers, minimum viewport, device class, performance floor, or input assumptions beyond keyboard.  
Severity: **RISK**

5.14 **Claim: Performance budgets are missing.**  
Why it bites: Canvas, generated art, synthesized audio, deterministic sim, and soak tests can still miss frame pacing on low-end machines. No FPS, frame-time, or memory target is stated.  
Severity: **RISK**

5.15 **Claim: Generator acceptance thresholds are missing.**  
Why it bites: The seed says property tests over N seeds, but not N, failure tolerance, retry limits, or required distribution of stage types. The builder can pass with a token sample.  
Severity: **BLOCKER**

5.16 **Claim: Locale gameplay identities are missing.**  
Why it bites: The art examples are evocative, but there is no mechanical/content distinction per locale: roster budgets, layout grammar differences, centerpiece intent, or escalation curve. Three locales can become palette swaps.  
Severity: **RISK**

5.17 **Claim: Centerpiece specs are missing.**  
Why it bites: Each locale’s fourth stage is load-bearing, but no centerpiece layouts, constraints, target difficulty, or validation requirements are specified. The builder will improvise the climaxes.  
Severity: **BLOCKER**

5.18 **Claim: Failure/retry pacing is missing.**  
Why it bites: Death scorecard exists, but not how fast the player can restart, whether trunk unlocks interrupt, whether scorecard can be skipped, or how resume/new run conflicts are handled. Arcade retention depends on this loop.  
Severity: **RISK**

5.19 **Claim: Save reset/meta reset controls are missing.**  
Why it bites: Save discipline covers scum-proofing and corruption, but not clearing meta, starting fresh, or handling multiple local users on one browser/file.  
Severity: **NIT**

5.20 **Claim: Numeric accessibility floors are incomplete.**  
Why it bites: The seed has strong accessibility intent, but actual minimum text size, contrast targets, remap persistence, comfort defaults, and speed-scale bounds are not specified.  
Severity: **RISK**