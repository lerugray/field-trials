// world.js — the fixed-timestep simulation core (hard rule 6: sim fully separated
// from the renderer; `node --test` drives it with no browser).
//
// M1: this is now a real gameplay world. It owns the authored stage, the player, the
// live balloons, and the single wire slot, and it advances them one fixed tick at a
// time. It emits a queue of typed EVENTS (pop/split/fire/denied/break/clear) — the
// action-legibility hook (CLAUDE.md rule 5): every mechanic hands the renderer a
// visible representation the moment it fires. The determinism + save contract
// (hard rule 6) is preserved end to end: same seed + same inputs ⇒ same fingerprint,
// and a serialized world resumes byte-identically (stream positions included).

import { Streams } from '../engine/streams.js';
import { setTick, debuglog } from '../engine/debuglog.js';
import { TICK_HZ, CLASSES, WIRE, CHAIN, PLAYER, PAR, DRIP, HIT, SCORE, FINALE } from '../tuning.js';
import { authoredStageM1, Stage } from './stage.js';
import { Player } from './player.js';
import { Balloon } from './balloon.js';
import { Wire, WIRE_HIT, WIRE_BROKE, WIRE_CEILING } from './wire.js';
import { Drop, rollDropKind, DROP_LABEL } from './drop.js';
import { DROPS, DYNAMITE, SIDEARM, QUICK_SPOOL_SCALE, SKY_ANCHOR_TICKS } from '../tuning.js';

export class World {
  // `startHearts` (composure assist) + `parOff` (closing-bell-off assist) are optional
  // COMFORT overlays — they never disable tickets, unlocks, or victory (parity law).
  constructor({ seed = 1, stage = null, startHearts = null, parOff = false } = {}) {
    this.seed = seed >>> 0;
    this._startHearts = startHearts; this.parOff = !!parOff;
    this.streams = new Streams(this.seed); // M2 draws rosters/drops from these
    this.tick = 0;

    this.stage = stage || authoredStageM1();
    this.bounds = { left: this.stage.bounds.left, right: this.stage.bounds.right };

    // Player spawns at the stage's authored/generated start column and settles.
    const spawnX = this.stage.meta && this.stage.meta.playerSpawnX != null ? this.stage.meta.playerSpawnX : 760;
    this.player = new Player({ x: spawnX, feetY: 0, stage: this.stage });

    // Balloons from the authored spawns.
    this._nextBalloonId = 1;
    this.balloons = [];
    const groundTop = this.stage.floorBelow(0, 0).y;
    for (const sp of this.stage.spawns) {
      // A balloon given a drop height enters mid-air AT REST (vy 0) and falls into its
      // bounce cycle — launching it at the floor launch-speed from mid-air would
      // overshoot the ceiling. A floor spawn (no y) launches upward as usual.
      const midAir = sp.y != null;
      const b = new Balloon({
        cls: sp.cls, x: sp.x, floorY: sp.floorY != null ? sp.floorY : groundTop,
        vxSign: sp.vxSign, y: midAir ? sp.y : null, vy: midAir ? 0 : null,
        weighted: !!sp.weighted, id: this._nextBalloonId++,
      });
      this.balloons.push(b);
    }

    this.wires = [];          // live wire slots (1, or 2 with Second Barrel)
    this.fireBuffer = 0;      // buffered-fire ticks remaining (~150 ms)
    this.prevFire = false;    // for rising-edge fire detection
    this.prevSidearm = false; // rising-edge for the sidearm button

    // Souvenir loadout (weapon-classes here; the DRAFT that fills it is M4). Additive
    // only — every validated stage stays valid under any build (catalog law).
    this.souvenirs = new Set();
    this.sidearmShots = [];   // Gallery Sidearm projectiles in flight
    this.sidearmAmmo = 0;     // reloads to 6 at stage entry IF the sidearm is held
    this._nextShotId = 1;
    this.tubaReady = false;   // Tuba Blast: one shockwave per stage (set on equip)

    // Closing-bell drip (past-par pressure that always converges).
    this.dripCount = 0;       // drips spawned this stage (cap DRIP.maxPerStage)
    this.dripTimer = DRIP.intervalTicks; // ticks until the next drip attempt
    this.dripPending = null;  // an in-progress telegraph {x,y,ticksLeft} or null

    // Panic Finale (survive the clock against escalating rain — no roster to clear).
    this.finale = !!(this.stage.meta && this.stage.meta.finale);
    this.finaleWon = false;
    this.rainTimer = FINALE.baseInterval;

    this.score = 0;
    this.pops = 0;            // total pops this stage (scorecard stat)
    this.bestChain = 0;       // best chain reached this stage (scorecard stat)
    this.chain = 0;           // pops inside the tick-denominated chain window
    this.chainExpireTick = 0; // when the current chain lapses (HUD meter)
    this.timeBonus = 0;       // stage-clear bonus vs par (shown on the clear ribbon)
    this.cleared = false;

    // Composure hit state (hit-stop / culprit outline / death).
    this.hitStop = 0;         // frozen-frame ticks on impact (200 ms)
    this.culpritId = null;    // balloon outlined AT the moment of impact
    this.culpritTicks = 0;
    this.dead = false;
    this.encoreUsed = false;  // Encore souvenir: one free revive per run

    // Drops + their world effects (DESIGN-SEED §Drops).
    this.drops = [];
    this._nextDropId = 1;
    this.dropChance = DROPS.chance; // per-world override (probes set 0 to isolate rosters)
    this.timeSlow = 0;        // ticks of 50% balloon speed remaining
    this.freeze = 0;          // ticks of halted balloons remaining
    this.shield = false;      // absorbs the next hit
    this.dynamiteFuse = 0;    // ticks left on a lit fuse (0 = none)
    this.cascading = false;   // the beat cascade is running
    this.cascadeBeat = 0;     // ticks to the next cascade beat

    // Runtime-only (not serialized): the CLEARANCE bot proves a roster is RESOLVABLE
    // (geometry + split arithmetic) independent of the survival axis — it plays
    // invincible. Survival difficulty is measured separately (M4 finale baseline).
    this.invincible = false;

    // HUD-backing state (the readouts are real from M1; damage logic is M3).
    // Composure assist raises the starting/max hearts (3 default; 4 / 5 as an assist).
    this.maxHearts = this._startHearts != null ? (this._startHearts | 0) : PLAYER.hearts;
    this.hearts = this.maxHearts;         // composure; M3 wires the hit that decrements
    this.tickets = 0;                     // meta currency; earned at the scorecard (M4)
    const m = this.stage.meta || {};
    this.stageLabel = this.finale ? 'PANIC FINALE' : (m.locale != null ? `${m.locale} – ${m.stage}` : '1 – 1');
    this.parTicks = m.parTicks != null ? m.parTicks : Math.round(PAR.m1Seconds * TICK_HZ);

    this.events = [];         // drained by the renderer each frame (transient)
    this.deniedFlashTicks = 0; // HUD slot flash on denied fire
  }

  emit(type, data) { this.events.push({ tick: this.tick, type, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  // Backward-compatible single-wire accessor (renderer/HUD/tests read the primary wire).
  get wire() { return this.wires[0] || null; }

  // Equip a souvenir + apply its stage-entry effect (M4's draft calls this). Additive.
  equip(id) {
    if (this.souvenirs.has(id)) return this;
    this.souvenirs.add(id);
    if (id === 'gallerySidearm') this.sidearmAmmo = SIDEARM.ammo;
    if (id === 'tubaBlast') this.tubaReady = true;             // one shockwave this stage
    if (id === 'plumeHat') { this.maxHearts += 1; this.hearts += 1; } // +1 max heart, filled
    if (id === 'shieldCharm') this.shield = true;               // start the locale shielded
    if (id === 'bellCredit') this.parTicks = Math.round(this.parTicks * 1.15);
    return this;
  }
  hasSouvenir(id) { return this.souvenirs.has(id); }
  chainWindow() { return CHAIN.windowTicks + (this.souvenirs.has('ribbonChain') ? 30 : 0); }

  // Advance exactly one fixed tick. `input` = {left,right,up,down,fire}.
  step(input = {}) {
    this.tick += 1;
    setTick(this.tick);

    // The culprit outline fades even while frozen; then clears.
    if (this.culpritTicks > 0) { this.culpritTicks -= 1; if (this.culpritTicks === 0) this.culpritId = null; }

    // Hit-stop: a 200 ms freeze on impact — nothing moves, the impact reads (rule 5).
    if (this.hitStop > 0) { this.hitStop -= 1; this.prevFire = !!input.fire; this.prevSidearm = !!input.sidearm; return this; }
    // Downed: no more gameplay until the run resets (scorecard flow is M4).
    if (this.dead) { this.prevFire = !!input.fire; this.prevSidearm = !!input.sidearm; return this; }

    // Tuba Blast: a once-per-stage shockwave that LOFTS every balloon upward (a panic
    // valve — no damage). Consumes the charge.
    if (input.tuba && this.tubaReady && this.souvenirs.has('tubaBlast')) {
      this.tubaReady = false;
      for (const b of this.balloons) b.vy = -b._launchSpeed;
      this.emit('tuba', { x: this.player.x, y: this.player.feetY });
    }

    // 1. player movement (walk/climb; NO jump).
    this.player.step(input, this.stage);

    // 2. balloons move (so the wire this tick meets their current positions). Passing
    // the stage makes them bounce off platform tops + reflect off undersides. Drop
    // effects gate movement: FREEZE halts them; TIME-SLOW steps them every other tick
    // (50% speed) — each stepped tick stays bit-exact so periodicity is preserved.
    const frozen = this.freeze > 0; if (frozen) this.freeze -= 1;
    const slowed = this.timeSlow > 0; if (slowed) this.timeSlow -= 1;
    if (!frozen && (!slowed || this.tick % 2 === 0)) {
      for (const b of this.balloons) b.step(this.bounds, this.stage);
    }

    // 2b. composure: a balloon touching a non-invulnerable player is a HIT. Sure Feet
    // grants immunity while on a ladder.
    const safeOnLadder = this.player.state === 'climb' && this.souvenirs.has('sureFeet');
    if (!this.player.invulnerable && !this.dead && !this.invincible && !safeOnLadder) {
      for (const b of this.balloons) {
        if (this._playerTouches(b)) { this._playerHit(b); break; }
      }
    }

    // 3. fire-control: slot commitment (1 slot, or 2 with Second Barrel) + denied
    // feedback + fire buffer. Both slots are still WALLS.
    const fireIntent = !!input.fire && !this.prevFire; // rising edge
    const maxSlots = this.souvenirs.has('secondBarrel') ? 2 : 1;
    if (this.wires.length >= maxSlots) {
      // Slots busy: a press is DENIED (never silent) and buffers the next shot.
      if (fireIntent) { this.fireBuffer = WIRE.bufferTicks; this.deniedFlashTicks = 10; this.emit('denied', { x: this.player.x, y: this.player.muzzleY }); }
      else if (this.fireBuffer > 0) this.fireBuffer -= 1;
    } else {
      // A slot is free: fire on a fresh press OR a live buffer (fires the tick it frees).
      if (fireIntent || this.fireBuffer > 0) { this._fire(); this.fireBuffer = 0; }
    }

    // 4. advance each live wire; resolve outcomes (pop+split / break / ceiling). A Sky
    // Anchor wire that reached the ceiling PERSISTS as a wall and keeps popping.
    for (const wire of this.wires) {
      const o = wire.step(this.stage, this.balloons);
      if (o.type === WIRE_HIT) this._resolveHit(o.balloon);
      else if (o.type === WIRE_BROKE) this.emit('break', { solid: o.solid.id, x: this.player.x, y: o.solid.bottom });
      else if (o.type === WIRE_CEILING) this.emit('ceiling', { x: this.player.x, y: wire.tipY });
    }
    if (this.wires.some((w) => !w.alive)) this.wires = this.wires.filter((w) => w.alive);

    // 4a. the sidearm (Gallery Sidearm): a second-button pop-gun BESIDE the wire.
    this._stepSidearm(input);

    // 4b. drops fall/expire; the player picks them up on contact.
    this._stepDrops();

    // 4c. dynamite fuse + beat cascade.
    this._stepDynamite();

    // 5. closing-bell drip (normal stages) OR the Panic Finale rain + survival clock.
    if (this.finale) this._stepFinale();
    else this._stepDrip();

    // 6. stage-clear: cleared iff every balloon (roster + drip) is gone — but the
    // FINALE never clears by emptying (rain keeps coming); it ends on the clock.
    if (!this.finale && !this.cleared && !this.dead && this.balloons.length === 0) {
      this.cleared = true;
      const remainSec = Math.max(0, Math.floor((this.parTicks - this.tick) / TICK_HZ));
      this.timeBonus = SCORE.clearBonusBase + remainSec * SCORE.timeBonusPerSec;
      this.score += this.timeBonus;
      this.emit('cleared', { score: this.score, timeBonus: this.timeBonus });
    }

    if (this.deniedFlashTicks > 0) this.deniedFlashTicks -= 1;
    this.prevFire = !!input.fire;
    this.prevSidearm = !!input.sidearm;
    return this;
  }

  _fire() {
    const speedScale = this.souvenirs.has('quickSpool') ? QUICK_SPOOL_SCALE : 1;
    const anchorTicks = this.souvenirs.has('skyAnchor') ? SKY_ANCHOR_TICKS : 0;
    this.wires.push(new Wire({ x: this.player.x, bottomY: this.player.muzzleY, stage: this.stage, speedScale, anchorTicks }));
    this.emit('fire', { x: this.player.x, y: this.player.muzzleY });
  }

  // Gallery Sidearm: a fast upward bullet on the SECOND button. Pops the first balloon
  // it meets and passes THROUGH platforms (no wall property). 6 shots/stage.
  _stepSidearm(input) {
    const intent = !!input.sidearm && !this.prevSidearm;
    if (intent && this.souvenirs.has('gallerySidearm') && this.sidearmAmmo > 0) {
      this.sidearmAmmo -= 1;
      this.sidearmShots.push({ id: this._nextShotId++, x: this.player.x, y: this.player.muzzleY });
      this.emit('sidearm', { x: this.player.x, y: this.player.muzzleY, ammo: this.sidearmAmmo });
    }
    if (this.sidearmShots.length) {
      const kept = [];
      for (const s of this.sidearmShots) {
        const prevY = s.y;
        s.y -= SIDEARM.speed / TICK_HZ;
        // Swept hit: the LOWEST balloon whose circle the bullet's segment [s.y, prevY] crosses.
        let hit = null;
        for (const b of this.balloons) {
          if (Math.abs(b.x - s.x) > b.radius + SIDEARM.radius) continue;
          if (b.y + b.radius >= s.y - SIDEARM.radius && b.y - b.radius <= prevY + SIDEARM.radius) {
            if (!hit || b.y > hit.y) hit = b;
          }
        }
        if (hit) { this._resolveHit(hit); continue; }   // bullet consumed
        if (s.y > 0) kept.push(s);                        // still on-screen (passes platforms)
      }
      this.sidearmShots = kept;
    }
  }

  // Circle (balloon) ↔ player box overlap.
  _playerTouches(b) {
    const p = this.player, hw = p.halfW;
    const bx = Math.max(p.x - hw, Math.min(b.x, p.x + hw));
    const by = Math.max(p.feetY - p.height, Math.min(b.y, p.feetY));
    const dx = b.x - bx, dy = b.y - by;
    return dx * dx + dy * dy <= b.radius * b.radius;
  }

  _playerHit(b) {
    // A SHIELD absorbs the hit (one-shot): no heart lost, brief i-frames, a knockback.
    if (this.shield) {
      this.shield = false;
      this.player.takeHit(this.player.x >= b.x ? 1 : -1);
      this.emit('shieldBreak', { x: this.player.x, y: this.player.feetY - this.player.height / 2 });
      return;
    }
    this.hearts -= 1;
    this.player.takeHit(this.player.x >= b.x ? 1 : -1, {
      iframeScale: this.souvenirs.has('sureFeet') ? 1.5 : 1,   // Sure Feet: +50% i-frames
      knockScale: this.souvenirs.has('softLanding') ? 0 : 1,   // Soft Landing: no knockback
    });
    this.hitStop = HIT.stopTicks;
    this.culpritId = b.id; this.culpritTicks = HIT.culpritTicks;
    this.emit('hit', { x: this.player.x, y: this.player.feetY - this.player.height / 2, culprit: b.id, hearts: this.hearts });
    // Opera Cloak: a 1 s post-hit slow-motion beat (breathing room after the sting).
    if (this.souvenirs.has('operaCloak')) this.timeSlow = Math.max(this.timeSlow, TICK_HZ);
    if (this.hearts <= 0) {
      // Encore: the first fatal hit per run instead REVIVES on 1 heart with a freeze.
      if (this.souvenirs.has('seasonEncore') && !this.encoreUsed) {
        this.encoreUsed = true; this.hearts = 1; this.freeze = 3 * TICK_HZ; this.player.iframe = PLAYER.iframeTicks * 2;
        this.emit('encore', { x: this.player.x, y: this.player.feetY }); return;
      }
      this.hearts = 0; this.dead = true; this.deathCulpritCls = b.cls; this.emit('dead', { x: this.player.x, y: this.player.feetY, culprit: b.id, cls: b.cls });
    }
  }

  _stepDrops() {
    if (!this.drops.length) return;
    const p = this.player, hw = p.halfW, top = p.feetY - p.height;
    const magnet = this.souvenirs.has('magnetGloves');
    const kept = [];
    for (const d of this.drops) {
      d.step(this.stage);
      // Magnet Gloves: a landed drop slides toward you (collection aid).
      if (magnet && d.landed) { const dx = p.x - d.x; d.x += Math.sign(dx) * Math.min(2.5, Math.abs(dx)); }
      // Pickup: drop circle overlaps the player box.
      const cx = Math.max(p.x - hw, Math.min(d.x, p.x + hw));
      const cy = Math.max(top, Math.min(d.y, p.feetY));
      const dx = d.x - cx, dy = d.y - cy;
      if (!this.dead && dx * dx + dy * dy <= d.radius * d.radius) { this._applyDrop(d); continue; }
      if (d.expired) { this.emit('dropExpired', { x: d.x, y: d.y, kind: d.kind }); continue; }
      kept.push(d);
    }
    this.drops = kept;
  }

  _applyDrop(d) {
    switch (d.kind) {
      case 'medallion': this.score += Math.round(DROPS.medallionScore * (this.souvenirs.has('confettiBonus') ? 1.5 : 1)); break;
      case 'slow': this.timeSlow = Math.round(DROPS.slowTicks * (this.souvenirs.has('longWaltz') ? 1.5 : 1)); break;
      case 'freeze': this.freeze = Math.round(DROPS.freezeTicks * (this.souvenirs.has('longWaltz') ? 1.5 : 1)); break;
      case 'shield': this.shield = true; break;
      case 'dynamite': this.dynamiteFuse = DYNAMITE.fuseTicks; break; // light the fuse
      default: break;
    }
    this.emit('pickup', { x: d.x, y: d.y, kind: d.kind, label: DROP_LABEL[d.kind] });
  }

  _dynamiteBusy() {
    return this.dynamiteFuse > 0 || this.cascading || this.drops.some((d) => d.kind === 'dynamite');
  }

  // The dynamite fuse + beat cascade: after a 1 s fuse, every non-Penny balloon splits
  // one class step per beat until all are Penny (split arithmetic preserved).
  _stepDynamite() {
    if (this.dynamiteFuse > 0) {
      this.dynamiteFuse -= 1;
      if (this.dynamiteFuse === 0) { this.cascading = true; this.cascadeBeat = 0; this.emit('dynamiteBoom', { x: this.player.x, y: this.player.feetY }); }
      return;
    }
    if (!this.cascading) return;
    if (this.cascadeBeat > 0) { this.cascadeBeat -= 1; return; }
    // One beat: split every non-Penny balloon down a class step, simultaneously.
    const next = [];
    let anySplit = false;
    for (const b of this.balloons) {
      const kids = b.split();
      if (kids.length) { for (const k of kids) { k.id = this._nextBalloonId++; k.drip = b.drip; next.push(k); } anySplit = true; this.emit('cascadeSplit', { x: b.x, y: b.y, cls: b.cls }); }
      else next.push(b); // Penny stays
    }
    this.balloons = next;
    // Long Fuse pauses an extra beat between steps — more room to harvest chains.
    this.cascadeBeat = DYNAMITE.beatTicks * (this.souvenirs.has('longFuse') ? 2 : 1);
    if (!anySplit) this.cascading = false; // everything is Penny — cascade done
  }

  _resolveHit(b) {
    const i = this.balloons.indexOf(b);
    if (i < 0) return;
    this.balloons.splice(i, 1);

    // Chain first (this pop extends or restarts the tick-denominated window), then
    // score the pop at the current multiplier (x1/x2/x3/x4 — DESIGN-SEED §Score).
    this.chain = this.tick <= this.chainExpireTick ? this.chain + 1 : 1;
    this.chainExpireTick = this.tick + this.chainWindow();
    const mult = CHAIN.mult[Math.min(CHAIN.mult.length - 1, this.chain - 1)];
    this.score += CLASSES[b.cls].score * mult;
    this.pops += 1;
    if (this.chain > this.bestChain) this.bestChain = this.chain;

    const kids = b.split(b.weighted && this.souvenirs.has('ironGores')); // [] for a penny
    for (const k of kids) { k.id = this._nextBalloonId++; k.drip = b.drip; this.balloons.push(k); }
    this.emit('pop', { x: b.x, y: b.y, cls: b.cls, split: kids.length > 0, chain: this.chain });

    // Roll the drops stream. Dynamite is GATED: never while slow/freeze is active, and
    // at most one dynamite airborne/lit/cascading at a time.
    const rng = this.streams.get('drops');
    const collectors = this.souvenirs.has('collectorsEye'); // +15% rate, 30% slower fall
    if (rng.next() < this.dropChance * (collectors ? 1.15 : 1)) {
      const exclude = [];
      if (this.timeSlow > 0 || this.freeze > 0 || this._dynamiteBusy()) exclude.push('dynamite');
      const kind = rollDropKind(rng, exclude);
      const d = new Drop({ kind, x: b.x, y: b.y, id: this._nextDropId++, gravityScale: collectors ? 0.7 : 1 });
      this.drops.push(d);
      this.emit('drop', { x: b.x, y: b.y, kind });
    }
  }

  // Closing-bell drip (DESIGN-SEED drip contract). Only past par; capped at
  // DRIP.maxPerStage; paused at the active-balloon ceiling; STOPS once the seeded
  // roster lineage is cleared — so pressure can never make a stage uncleanable
  // (convergence guaranteed). Each drip is telegraphed then enters at half speed on
  // the player's half of the screen (anti-camp). Fully deterministic (no RNG).
  _stepDrip() {
    if (this.cleared || this.parOff) return; // par-off assist: no closing-bell drip
    const rosterLeft = this.balloons.some((b) => !b.drip);
    const active = this.tick > this.parTicks && rosterLeft && this.dripCount < DRIP.maxPerStage;

    if (this.dripPending) {
      // A telegraph is counting down; spawn when it fires (even if we just crossed the
      // roster-clear line — a telegraphed drip already promised is honoured, but only
      // while roster remains; if the roster just cleared, cancel it for convergence).
      if (!rosterLeft) { this.dripPending = null; return; }
      this.dripPending.ticksLeft -= 1;
      if (this.dripPending.ticksLeft <= 0) { this._spawnDrip(this.dripPending); this.dripPending = null; this.dripTimer = DRIP.intervalTicks; }
      return;
    }
    if (!active) return;
    if (this.dripTimer > 0) { this.dripTimer -= 1; return; }
    if (this.balloons.length >= DRIP.activeCeiling) return; // pause at the ceiling

    // Telegraph a corner on the HALF the player occupies (anti-camp).
    const mid = (this.bounds.left + this.bounds.right) / 2;
    const onLeft = this.player.x < mid;
    const x = onLeft ? this.bounds.left + 70 : this.bounds.right - 70;
    const warn = this.souvenirs.has('fairWarning') ? 2 : 1; // Fair Warning: telegraph earlier
    this.dripPending = { x, y: 90, ticksLeft: DRIP.telegraphTicks * warn };
    this.emit('dripTelegraph', { x, y: 90, ticks: DRIP.telegraphTicks * warn });
  }

  // The Panic Finale: escalating balloon RAIN + the 90 s survival clock. Deterministic
  // (rain x/class from the roster stream). Win = survive the clock; lose = downed.
  _stepFinale() {
    if (this.finaleWon || this.dead) return;
    // ENDLESS PANIC never wins on the clock — it runs until a downing (survival is the score).
    if (!(this.stage.meta && this.stage.meta.endless) && this.tick >= FINALE.survivalTicks) { this.finaleWon = true; this.cleared = true; this.emit('finaleWin', { score: this.score }); return; }
    // Interval ramps base→min across the clock (escalation).
    const frac = this.tick / FINALE.survivalTicks;
    const interval = Math.max(FINALE.minInterval, Math.round(FINALE.baseInterval - (FINALE.baseInterval - FINALE.minInterval) * frac));
    if (this.rainTimer > 0) { this.rainTimer -= 1; return; }
    if (this.balloons.length >= FINALE.maxAirborne) return; // PAUSE at the ceiling (bounds density)
    this.rainTimer = interval;
    const rng = this.streams.get('roster');
    const x = 80 + Math.floor(rng.next() * (this.bounds.right - 160));
    // Mostly Penny (small, dodgeable); a Fair/Parade chance grows as the storm builds.
    const roll = rng.next();
    const cls = roll < 0.72 - frac * 0.1 ? 'penny' : (roll < 0.94 ? 'fair' : 'parade');
    const b = new Balloon({ cls, x, floorY: this.stage.floorBelow(0, 0).y, y: 60, vy: 0, vxSign: rng.next() < 0.5 ? -1 : 1, id: this._nextBalloonId++ });
    this.balloons.push(b);
    this.emit('rain', { x, y: 60, cls });
  }

  _spawnDrip(t) {
    const groundTop = this.stage.floorBelow(0, 0).y;
    const mid = (this.bounds.left + this.bounds.right) / 2;
    const slowEntry = this.souvenirs.has('fairWarning') ? 2 : 1; // slower (calmer) entry
    const b = new Balloon({
      cls: 'penny', x: t.x, floorY: groundTop, y: t.y, vy: 0,
      vxSign: t.x < mid ? 1 : -1, entryTicks: DRIP.entryTicks * slowEntry, drip: true,
      id: this._nextBalloonId++,
    });
    this.balloons.push(b);
    this.dripCount += 1;
    this.emit('dripSpawn', { x: b.x, y: b.y });
  }

  // Run N ticks with a constant input (test convenience).
  run(n, input) { for (let i = 0; i < n; i++) this.step(input); return this; }

  // A stable fingerprint of the FULL sim state (determinism + save probes assert it).
  fingerprint() {
    let h = 0x811c9dc5 >>> 0;
    h = fold(h, this.seed);              // the seed is part of the world state
    h = fold(h, this.tick);
    h = fold(h, q(this.player.x)); h = fold(h, q(this.player.feetY)); h = fold(h, q(this.player.vy));
    h = fold(h, this.player.state === 'climb' ? 1 : 0);
    h = fold(h, this.balloons.length);
    for (const b of this.balloons) {
      h = fold(h, b.id); h = fold(h, CLASSES[b.cls].order);
      h = fold(h, q(b.x)); h = fold(h, q(b.y)); h = fold(h, q(b.vy)); h = fold(h, b.vxSign);
      h = fold(h, b.entryTicks); h = fold(h, b.drip ? 1 : 0); h = fold(h, b.weighted ? 1 : 0);
    }
    h = fold(h, this.wires.length);
    for (const wr of this.wires) { h = fold(h, q(wr.x)); h = fold(h, q(wr.tipY)); h = fold(h, wr.anchored ? 1 : 0); h = fold(h, wr.anchorTicks); }
    h = fold(h, this.sidearmShots.length); for (const s of this.sidearmShots) { h = fold(h, q(s.x)); h = fold(h, q(s.y)); }
    h = fold(h, this.sidearmAmmo); h = fold(h, this.tubaReady ? 1 : 0);
    h = fold(h, this.fireBuffer); h = fold(h, this.score); h = fold(h, this.chain);
    h = fold(h, this.pops); h = fold(h, this.bestChain);
    h = fold(h, this.hearts); h = fold(h, this.tickets);
    h = fold(h, this.dripCount); h = fold(h, this.dripTimer);
    h = fold(h, this.dripPending ? this.dripPending.ticksLeft : -1);
    h = fold(h, this.finale ? 1 : 0); h = fold(h, this.finaleWon ? 1 : 0); h = fold(h, this.rainTimer);
    h = fold(h, q(this.player.knockVx)); h = fold(h, this.player.iframe);
    h = fold(h, this.hitStop); h = fold(h, this.culpritTicks); h = fold(h, this.dead ? 1 : 0); h = fold(h, this.encoreUsed ? 1 : 0);
    h = fold(h, this.drops.length);
    for (const d of this.drops) { h = fold(h, q(d.x)); h = fold(h, q(d.y)); h = fold(h, d.ttl); }
    h = fold(h, this.timeSlow); h = fold(h, this.freeze); h = fold(h, this.shield ? 1 : 0);
    h = fold(h, this.dynamiteFuse); h = fold(h, this.cascading ? 1 : 0); h = fold(h, this.cascadeBeat);
    h = fold(h, this.cleared ? 1 : 0);
    const s = this.streams.serialize();
    for (const name of Object.keys(s.pos)) h = fold(h, s.pos[name]);
    return h >>> 0;
  }

  // Serialize the FULL sim state for a save (DESIGN-SEED death discipline: a resume
  // can never re-roll anything — stream positions + every entity ride along).
  serialize() {
    return {
      v: 3,
      seed: this.seed,
      tick: this.tick,
      streams: this.streams.serialize(),
      stage: this.stage.snapshot(), // full geometry — a generated layout can't be rebuilt from a template
      player: this.player.serialize(),
      balloons: this.balloons.map((b) => b.serialize()),
      nextBalloonId: this._nextBalloonId,
      wires: this.wires.map((w) => w.serialize()),
      fireBuffer: this.fireBuffer,
      prevFire: this.prevFire,
      prevSidearm: this.prevSidearm,
      souvenirs: [...this.souvenirs],
      sidearmShots: this.sidearmShots.map((s) => ({ ...s })),
      sidearmAmmo: this.sidearmAmmo,
      nextShotId: this._nextShotId,
      tubaReady: this.tubaReady,
      score: this.score,
      pops: this.pops,
      bestChain: this.bestChain,
      chain: this.chain,
      chainExpireTick: this.chainExpireTick,
      timeBonus: this.timeBonus,
      cleared: this.cleared,
      hearts: this.hearts, maxHearts: this.maxHearts, parOff: this.parOff,
      tickets: this.tickets,
      dripCount: this.dripCount,
      dripTimer: this.dripTimer,
      dripPending: this.dripPending,
      finaleWon: this.finaleWon,
      rainTimer: this.rainTimer,
      hitStop: this.hitStop,
      culpritId: this.culpritId,
      culpritTicks: this.culpritTicks,
      dead: this.dead,
      encoreUsed: this.encoreUsed,
      drops: this.drops.map((d) => d.serialize()),
      nextDropId: this._nextDropId,
      timeSlow: this.timeSlow,
      freeze: this.freeze,
      shield: this.shield,
      dynamiteFuse: this.dynamiteFuse,
      cascading: this.cascading,
      cascadeBeat: this.cascadeBeat,
      deniedFlashTicks: this.deniedFlashTicks,
    };
  }

  restore(data) {
    if (!data || (data.seed >>> 0) !== this.seed) {
      throw new Error('World.restore: seed mismatch — refusing silent re-roll');
    }
    this.tick = data.tick | 0;
    this.streams.restore(data.streams);
    // v3 saves carry the FULL stage geometry (generated layouts can't be rebuilt from
    // a template); legacy saves carried only break-state onto the constructor stage.
    if (data.stage && data.stage.solids) {
      this.stage = Stage.fromSnapshot(data.stage);
      this.bounds = { left: this.stage.bounds.left, right: this.stage.bounds.right };
      this.finale = !!(this.stage.meta && this.stage.meta.finale); // recompute for the rebuilt stage
      const m = this.stage.meta || {};
      this.stageLabel = m.locale != null ? `${m.locale} – ${m.stage}` : this.stageLabel;
      if (m.parTicks != null) this.parTicks = m.parTicks;
    } else {
      this.stage.restore(data.stage);
    }
    this.player.restore(data.player, this.stage);
    this.balloons = (data.balloons || []).map((d) => Balloon.fromSerialized(d));
    this._nextBalloonId = data.nextBalloonId | 0 || 1;
    this.wires = (data.wires || (data.wire ? [data.wire] : [])).map((d) => Wire.fromSerialized(d, this.stage));
    this.fireBuffer = data.fireBuffer | 0;
    this.prevFire = !!data.prevFire;
    this.prevSidearm = !!data.prevSidearm;
    this.souvenirs = new Set(data.souvenirs || []);
    this.sidearmShots = (data.sidearmShots || []).map((s) => ({ ...s }));
    this.sidearmAmmo = data.sidearmAmmo | 0;
    this._nextShotId = data.nextShotId | 0 || 1;
    this.tubaReady = !!data.tubaReady;
    this.score = data.score | 0;
    this.pops = data.pops | 0;
    this.bestChain = data.bestChain | 0;
    this.chain = data.chain | 0;
    this.chainExpireTick = data.chainExpireTick | 0;
    this.timeBonus = data.timeBonus | 0;
    this.cleared = !!data.cleared;
    if (data.hearts != null) this.hearts = data.hearts | 0;
    if (data.maxHearts != null) this.maxHearts = data.maxHearts | 0;
    this.parOff = !!data.parOff;
    if (data.tickets != null) this.tickets = data.tickets | 0;
    this.dripCount = data.dripCount | 0;
    this.dripTimer = data.dripTimer != null ? data.dripTimer | 0 : DRIP.intervalTicks;
    this.dripPending = data.dripPending ? { ...data.dripPending } : null;
    this.finaleWon = !!data.finaleWon;
    if (data.rainTimer != null) this.rainTimer = data.rainTimer | 0;
    this.hitStop = data.hitStop | 0;
    this.culpritId = data.culpritId != null ? data.culpritId : null;
    this.culpritTicks = data.culpritTicks | 0;
    this.dead = !!data.dead;
    this.encoreUsed = !!data.encoreUsed;
    this.drops = (data.drops || []).map((d) => Drop.fromSerialized(d));
    this._nextDropId = data.nextDropId | 0 || 1;
    this.timeSlow = data.timeSlow | 0;
    this.freeze = data.freeze | 0;
    this.shield = !!data.shield;
    this.dynamiteFuse = data.dynamiteFuse | 0;
    this.cascading = !!data.cascading;
    this.cascadeBeat = data.cascadeBeat | 0;
    this.deniedFlashTicks = data.deniedFlashTicks | 0;
    setTick(this.tick);
    return this;
  }

  static fromSerialized(data) {
    // The stage template is rebuilt then the broken-tile state is restored onto it.
    return new World({ seed: data.seed }).restore(data);
  }
}

// FNV-1a-style 32-bit fold. Pure integer mixing — no platform variance.
function fold(h, x) { h ^= x | 0; h = Math.imul(h, 0x01000193); return h >>> 0; }
// Quantize a float to a stable integer for folding (determinism is bit-exact, so any
// consistent scale works; 1e3 keeps sub-pixel state distinguishable).
function q(v) { return Math.round(v * 1000) | 0; }

// Kept for callers that referenced the M0 helper name; harmless no-op export.
export const TICKS_PER_SECOND = TICK_HZ;
void debuglog;
