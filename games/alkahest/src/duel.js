/* ALKAHEST -- duel: the bout orchestrator (STUDY-duel §6).
 *
 * Runs two machines in lockstep: the player's and a rival driven by an Alembic.
 * Each tick advances the AI, ticks both machines, then ROUTES each machine's
 * outbox of produced slabs into the OTHER's receive queue (which crushes only
 * between cascades -- STUDY-duel §3). Bout ends single-elimination the instant a
 * machine tops out: the survivor wins, and there is exactly one loser.
 *
 * PAUSE-ANYWHERE (studio amendment, LOCKED): setPaused(true) freezes BOTH
 * machines and all timers instantly by simply not advancing them; resume is
 * bit-for-bit identical. It is a bout-level state, tested, not a render trick.
 *
 * Determinism: given (seedP, seedR, aiSeed, skill, player input log) the whole
 * bout is reproducible -- the player machine is driven from outside via its own
 * requestSwap/setRaise, exactly as the human does.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  function Duel(opts) {
    opts = opts || {};
    var mCfg = opts.machine || {};
    this.player = new AL.Machine(Object.assign({ seed: opts.seedP === undefined ? 1 : opts.seedP }, mCfg));
    this.rival = new AL.Machine(Object.assign({ seed: opts.seedR === undefined ? 2 : opts.seedR }, mCfg));
    this.ai = new AL.Alembic({ seed: opts.aiSeed === undefined ? 7 : opts.aiSeed, skill: opts.skill === undefined ? 0.5 : opts.skill });
    this.paused = false;
    this.state = "fight";   // 'fight' | 'won' | 'lost'
    this.winner = null;     // 'player' | 'rival'
    this.time = 0;
    this.lastRouted = { toRival: 0, toPlayer: 0 }; // for render telegraphs
  }

  Duel.prototype.setPaused = function (p) { this.paused = !!p; };
  Duel.prototype.togglePause = function () { this.paused = !this.paused; };

  Duel.prototype.tick = function (dt) {
    if (this.paused || this.state !== "fight") return;
    this.time += dt;

    // the AI drives the rival through the same primitives a human uses
    this.ai.update(this.rival, dt);

    this.player.tick(dt);
    this.rival.tick(dt);

    // route offense: each machine's produced slabs cross to the opponent
    this.lastRouted.toRival = this._route(this.player, this.rival);
    this.lastRouted.toPlayer = this._route(this.rival, this.player);

    // single-elimination bout end (STUDY-duel §6)
    if (this.player.state === "lost") { this.state = "lost"; this.winner = "rival"; }
    else if (this.rival.state === "lost") { this.state = "won"; this.winner = "player"; }
  };

  Duel.prototype._route = function (from, to) {
    var out = from.drainOutbox();
    var n = 0;
    for (var i = 0; i < out.length; i++) { to.receiveDross(out[i]); n += out[i].width * out[i].height; }
    return n;
  };

  AL.Duel = Duel;
});
