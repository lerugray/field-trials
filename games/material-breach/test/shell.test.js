// THE SHIP SHELL (M8): title, options, provenance — and the drift guard between what the game
// tells a player about its provenance and what the shipped licence file says.
//
// The seed's M8 line is "ship shell (title, options, provenance, ATTRIBUTION shipped in-build)".
// ATTRIBUTION has shipped inside dist/index.html since M1, but only as an HTML comment: present in
// the artifact and invisible to anybody playing. The cast pack is CC BY, and attribution under CC BY
// is a condition of use rather than a courtesy, so these tests treat the in-game credits as a
// requirement and not as decoration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createView, enterPremises, showOverlay, backToTitle, togglePause, abandonTenure } from '../src/view.js';
import { computeButtons, hitTest } from '../src/layout.js';
import { PROVENANCE, PROVENANCE_FACTS, CREDIT_LINE_MAX_CHARS } from '../src/provenance.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the game opens on the title, not inside a running facility', () => {
  const view = createView({ seed: 'shell' });
  assert.equal(view.overlay, 'title');
});

test('a fresh post goes by way of the orientation packet; a resumed one goes straight to the desk', () => {
  const fresh = createView({ seed: 'fresh' });
  enterPremises(fresh);
  assert.equal(fresh.overlay, 'orientation', 'a new manager was not given the memo');

  const resumed = createView({ seed: 'resumed' });
  resumed.resumable = true;
  enterPremises(resumed);
  assert.equal(resumed.overlay, null, 'a resumed tenure was made to read the orientation packet again');
});

test('options and provenance are reachable from the title, and both come back', () => {
  const view = createView({ seed: 'nav' });
  for (const surface of ['options', 'provenance']) {
    showOverlay(view, surface);
    assert.equal(view.overlay, surface);
    backToTitle(view);
    assert.equal(view.overlay, 'title', `${surface} did not return to the title`);
  }
});

test('every shell surface offers a way out, so a player cannot be stranded', () => {
  // The failure this prevents is the ordinary one: a surface is added, its exit is forgotten, and
  // the only way out of the credits is to reload the page.
  const view = createView({ seed: 'exits' });
  for (const overlay of ['title', 'options', 'provenance']) {
    view.overlay = overlay;
    const buttons = computeButtons(view);
    assert.ok(buttons.length > 0, `${overlay} has no controls at all`);
    const exits = buttons.filter((b) => ['enter', 'totitle', 'quit'].includes(b.id));
    assert.ok(exits.length > 0, `${overlay} offers no way out`);
    for (const b of buttons) {
      assert.ok(b.w > 0 && b.h > 0, `${overlay}: control ${b.id} has no area to click`);
      assert.equal(hitTest(buttons, b.x + b.w / 2, b.y + b.h / 2), b.id, `${overlay}: control ${b.id} is not hittable at its own centre`);
    }
  }
});

test('the title offers to resume only when there is something to resume', () => {
  const view = createView({ seed: 'resume-offer' });
  const fresh = computeButtons(view).find((b) => b.id === 'enter');
  assert.ok(fresh && !/resume/i.test(fresh.label), `a fresh game offered "${fresh && fresh.label}"`);
  assert.ok(!computeButtons(view).some((b) => b.id === 'newtenure'), 'a fresh game offered to abandon a tenure that does not exist');

  view.resumable = true;
  const back = computeButtons(view).find((b) => b.id === 'enter');
  assert.ok(/resume/i.test(back.label), `a resumable game offered "${back.label}"`);
  assert.ok(computeButtons(view).some((b) => b.id === 'newtenure'), 'a resumable game offered no way to start over');
});

test('the quit-to-shell slot appears only when a shell hosts the game (contract item 4)', () => {
  const view = createView({ seed: 'host' });
  view.overlay = 'options';
  assert.ok(!computeButtons(view).some((b) => b.id === 'quit'), 'quit-to-shell was offered with no shell present');
  view.hasShell = true;
  assert.ok(computeButtons(view).some((b) => b.id === 'quit'), 'quit-to-shell was withheld from a hosted game');
});

test('provenance is reachable from the pause surface too, mid-tenure', () => {
  // A player who wants to know who drew the people should not have to abandon their tenure to find
  // out. Esc is never consumed away from pause (contract item 5), so pause is the reliable door.
  const view = createView({ seed: 'pause-prov' });
  view.overlay = null;
  togglePause(view);
  assert.equal(view.overlay, 'pause');
  assert.ok(computeButtons(view).some((b) => b.id === 'provenance'), 'the pause surface does not reach the credits');
});

test('a tenure that has already closed is never offered for resumption', () => {
  // The boot rule, as behaviour. A closed tenure carried into the shell would let a player "take up
  // the post" in a facility that was already condemned, and it skipped the title entirely on the
  // way there. A finished tenure is history: it is cleared, and the title offers a fresh post.
  const view = createView({ seed: 'dead' });
  view.facility.status = 'condemned';
  view.resumable = false;
  abandonTenure(view);
  view.overlay = 'title';
  assert.equal(view.facility.status, 'active', 'a fresh post was not created after a closed tenure');
  assert.equal(view.resumable, false);
  const enter = computeButtons(view).find((b) => b.id === 'enter');
  assert.ok(enter && !/resume/i.test(enter.label), `a dead tenure was offered for resumption: "${enter && enter.label}"`);
});

// ---- the drift guard ---------------------------------------------------------------------------

test('the in-game credits and the shipped ATTRIBUTION agree on every load-bearing fact', () => {
  // Two records of the same thing drift. This is the test that stops the game crediting one person
  // while the licence file credits another.
  const attribution = readFileSync(join(ROOT, 'ATTRIBUTION.md'), 'utf8');
  const credits = PROVENANCE.map(([, line]) => line).join('\n');
  for (const fact of PROVENANCE_FACTS) {
    assert.ok(attribution.includes(fact), `ATTRIBUTION.md does not mention "${fact}", which the in-game credits claim`);
    assert.ok(credits.includes(fact), `the in-game credits do not mention "${fact}", which they are required to carry`);
  }
});

test('the credits state the CC BY cast attribution, which is a condition of use', () => {
  const credits = PROVENANCE.map(([, line]) => line).join(' ');
  assert.match(credits, /NPC Pack/, 'the cast pack is not named');
  assert.match(credits, /Willibab/, 'the cast pack author is not named');
  assert.match(credits, /CC BY 4\.0/, 'the cast licence is not named');
});

test('the credits state the standing art and audio provenance', () => {
  const credits = PROVENANCE.map(([, line]) => line).join(' ');
  assert.match(credits, /Code-drawn/i, 'the facility is not described as code-drawn');
  assert.match(credits, /Abel Aeolian/, 'the score is not credited');
  assert.match(credits, /No LLM-image-generated art/i, 'the generated-art ban is not stated');
  assert.match(credits, /No audio file ships/i, 'the no-audio-asset claim is not stated');
});

test('every credit line fits the sheet it is drawn on', () => {
  // The sheet's column is 456px and the body face is 11px, which MEASURES at 69 characters of
  // typical prose. The first version of this test asserted 84, a guess; it passed while the credits
  // ran off the right edge of the paper into the ledger. The number now comes from measuring the
  // real font in the real artifact, and it lives beside the copy it constrains.
  const MAX_CHARS = CREDIT_LINE_MAX_CHARS;
  for (const [style, line] of PROVENANCE) {
    if (!style) continue;
    assert.ok(line.length <= MAX_CHARS, `a credit line is ${line.length} chars and will run off the sheet: "${line}"`);
  }
});
