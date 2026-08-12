// M10 A10 — the dealt stranger's NAME and PORTRAIT randomize (seeded) at creation.
// Ray: "character name and portrait must randomize... currently static." Before,
// every stranger was "[SEED] Initiate" wearing the one HERO face. Now the name
// comes from the name engine and the face is one of HERO_PORTRAITS, both seeded so
// a reroll (advancing the seed) deals a fresh identity and a seed reproduces it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChargen } from '../src/engine/chargen.js';
import { createNames } from '../src/engine/names.js';
import { createSession } from '../src/engine/session.js';
import { HERO_PORTRAITS } from '../src/engine/bustart.js';
import chargenData from '../data/register/chargen.json' with { type: 'json' };
import phonemes from '../data/register/phonemes.json' with { type: 'json' };

const names = createNames(phonemes);
const chargen = createChargen(chargenData, { names });

test('name + portrait randomize across rerolls (seeded), both real values', () => {
  const uniqNames = new Set();
  const uniqFaces = new Set();
  for (let s = 1; s <= 40; s++) {
    const c = chargen.rollSeeded(s);
    assert.ok(c.name && !c.name.includes('Initiate'), `seed ${s} got a generated name, not the static placeholder`);
    assert.ok(!c.name.includes('[SEED]'), 'generated PC name carries no dev marker');
    assert.ok(HERO_PORTRAITS.includes(c.portrait), `seed ${s} portrait ${c.portrait} is a real hero portrait`);
    uniqNames.add(c.name);
    uniqFaces.add(c.portrait);
  }
  assert.ok(uniqNames.size > 20, `names should vary widely, got ${uniqNames.size}`);
  assert.ok(uniqFaces.size >= 2, `portrait should vary, got ${uniqFaces.size}`);
});

test('same seed reproduces the same stranger identity (deterministic)', () => {
  const a = chargen.rollSeeded(9);
  const b = chargen.rollSeeded(9);
  assert.equal(a.name, b.name);
  assert.equal(a.portrait, b.portrait);
});

test('the dealt portrait persists through save/load', () => {
  const s = createSession({ chargen, seed: 4242 });
  const face = s.pc.portrait;
  assert.ok(HERO_PORTRAITS.includes(face));
  const snap = JSON.parse(JSON.stringify(s.serialize()));
  const s2 = createSession({ chargen, seed: 1 });
  s2.restore(snap);
  assert.equal(s2.pc.portrait, face, 'portrait round-trips through serialize/restore');
  assert.equal(s2.pc.name, s.pc.name, 'name round-trips too');
});

test('without a name engine, chargen still works (pure unit path) with the placeholder', () => {
  const bare = createChargen(chargenData); // no names injected
  const c = bare.rollSeeded(3);
  assert.equal(c.name, '[SEED] Initiate');
  assert.ok(HERO_PORTRAITS.includes(c.portrait), 'portrait still assigned without names');
});
