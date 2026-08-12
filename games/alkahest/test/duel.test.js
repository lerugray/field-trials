"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/grid.js");
require("../src/machine.js");
require("../src/alembic.js");
require("../src/duel.js");

const DT = 1 / 60;
function snap(m) {
  return m.grid.toAscii().join("|") + "#" + m.riseOffset.toFixed(5) + "#" + m.state +
    "#dr" + m.stats.drossReceived + "#ds" + m.stats.drossSent;
}

test("FIXTURE bout win/loss: the topped-out machine loses; the survivor wins; exactly one loser", () => {
  const d = new AL.Duel({ machine: { seedRows: 0, rows: 6, risePerSec: 0 }, skill: 0, seedP: 1, seedR: 2 });
  // jam the rival to the ceiling (dense, arranged to avoid a full clear)
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) d.rival.grid.cells[y][x] = AL.panel((x + y) % 6);
  // force the rival to rise into a top-out
  d.rival.setRaise(true);
  for (let i = 0; i < 200 && d.rival.state !== "lost"; i++) d.rival.tick(DT);
  assert.strictEqual(d.rival.state, "lost", "rival topped out");
  d.tick(DT); // orchestrator observes the loss
  assert.strictEqual(d.state, "won", "bout resolved to a player win");
  assert.strictEqual(d.winner, "player");
  assert.strictEqual(d.player.state, "play", "the survivor is not also a loser");
});

test("FIXTURE bout: player top-out is a loss for the player", () => {
  const d = new AL.Duel({ machine: { seedRows: 0, rows: 6, risePerSec: 0 }, skill: 0 });
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) d.player.grid.cells[y][x] = AL.panel((x + y) % 6);
  d.player.setRaise(true);
  for (let i = 0; i < 200 && d.state === "fight"; i++) d.tick(DT);
  assert.strictEqual(d.state, "lost", "player lost");
  assert.strictEqual(d.winner, "rival");
});

test("FIXTURE routing: a machine's produced slab crosses to the opponent's queue", () => {
  const d = new AL.Duel({ machine: { seedRows: 3, risePerSec: 0 }, skill: 0 });
  d.player.outbox.push({ width: 6, height: 2 }); // pretend the player just chained
  d.tick(DT);
  assert.strictEqual(d.lastRouted.toRival, 12, "12 dross cells routed to the rival");
  assert.ok(d.rival.drossQueue.length > 0, "the rival has incoming dross queued");
  // let it crush at the rival's next rest window
  for (let i = 0; i < 30; i++) d.tick(DT);
  assert.strictEqual(d.rival.stats.drossReceived, 12, "the routed slab crushed onto the rival");
});

test("FIXTURE pause-anywhere: pause freezes BOTH machines; resume is identical", () => {
  const d = new AL.Duel({ machine: { seedRows: 5, risePerSec: 1.5 }, skill: 0.6, seedP: 11, seedR: 22, aiSeed: 5 });
  for (let i = 0; i < 90; i++) d.tick(DT);
  const p0 = snap(d.player), r0 = snap(d.rival), t0 = d.time;
  d.setPaused(true);
  for (let i = 0; i < 300; i++) d.tick(DT); // long pause
  assert.strictEqual(snap(d.player), p0, "player frozen while paused");
  assert.strictEqual(snap(d.rival), r0, "rival frozen while paused");
  assert.strictEqual(d.time, t0, "no bout time advanced while paused");
  d.setPaused(false);
  d.tick(DT);
  assert.ok(d.time > t0, "resumes advancing after unpause");
});

test("FIXTURE dross-determinism: identical (seeds, skill) => identical bout twice", () => {
  function run() {
    const d = new AL.Duel({ seedP: 314, seedR: 159, aiSeed: 265, skill: 0.75, machine: { seedRows: 5, risePerSec: 1.2 } });
    const trace = [];
    for (let i = 0; i < 900; i++) {
      // scripted player input, exactly as a human would drive it
      if (i === 40) d.player.requestSwap(2, 0);
      if (i === 200) d.player.setRaise(true);
      if (i === 230) d.player.setRaise(false);
      d.tick(DT);
      if (i % 90 === 0) trace.push(snap(d.player) + "||" + snap(d.rival) + "||" + d.state);
    }
    return trace;
  }
  assert.deepStrictEqual(run(), run(), "the whole bout is bit-for-bit reproducible");
});

test("a full autoplay bout eventually resolves (no infinite stall)", () => {
  // strong AI vs an idle player: the player should be overrun and lose.
  const d = new AL.Duel({ machine: { seedRows: 6, risePerSec: 0.5 }, skill: 1.0, seedP: 8, seedR: 9, aiSeed: 3 });
  let ticks = 0;
  for (; ticks < 60 * 60 * 5 && d.state === "fight"; ticks++) d.tick(DT); // cap 5 min
  assert.notStrictEqual(d.state, "fight", "the bout terminates");
  assert.ok(d.winner === "player" || d.winner === "rival", "a winner is declared");
});
