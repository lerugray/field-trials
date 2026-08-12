import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moodOf, moodNote, MOOD_IDS } from '../src/engine/mood.js';

// A minimal creature with just the mood-relevant fields.
function pet({ bond = 50, stress = 0, fatigue = 0, temperament = 'Calm' } = {}) {
  return { bond, stress, fatigue, temperament };
}

test('a warm, rested, unstressed pet reads happy or playful', () => {
  const calm = moodOf(pet({ bond: 85, stress: 5, fatigue: 10, temperament: 'Calm' }));
  assert.equal(calm.id, 'happy'); // Calm is not in the playful set
  const cheeky = moodOf(pet({ bond: 85, stress: 5, fatigue: 10, temperament: 'Cheeky' }));
  assert.equal(cheeky.id, 'playful'); // Cheeky tips into play when content
  assert.ok(cheeky.bounce > calm.bounce, 'playful bounces livelier than happy');
});

test('high fatigue reads tired regardless of a good bond', () => {
  const m = moodOf(pet({ bond: 90, stress: 10, fatigue: 85 }));
  assert.equal(m.id, 'tired');
  assert.equal(m.eyes, 'sleepy');
  assert.ok(m.bounce < 1, 'a tired pet is sluggish');
});

test('the same stress wears two faces by temperament', () => {
  const spiky = moodOf(pet({ bond: 60, stress: 80, temperament: 'Bold' }));
  const soft = moodOf(pet({ bond: 60, stress: 80, temperament: 'Timid' }));
  assert.equal(spiky.id, 'grumpy');
  assert.equal(soft.id, 'anxious');
  assert.equal(spiky.brow, 1, 'grumpy brow is cross');
  assert.equal(soft.brow, -1, 'anxious brow is worried');
});

test('temperament shifts the stress threshold', () => {
  // At stress 62: a Stoic (tolerant, +12) still holds; a Timid (-10) is over.
  assert.notEqual(moodOf(pet({ bond: 60, stress: 62, temperament: 'Stoic' })).id, 'grumpy');
  assert.equal(moodOf(pet({ bond: 60, stress: 62, temperament: 'Timid' })).id, 'anxious');
});

test('a low bond reads lonely once stress and fatigue are calm', () => {
  const m = moodOf(pet({ bond: 15, stress: 10, fatigue: 10 }));
  assert.equal(m.id, 'lonely');
  assert.equal(m.eyes, 'sad');
});

test('the mid-band default is content', () => {
  assert.equal(moodOf(pet({ bond: 50, stress: 30, fatigue: 30 })).id, 'content');
});

test('moodOf never throws and always returns a known mood', () => {
  assert.ok(MOOD_IDS.includes(moodOf(undefined).id));
  assert.ok(MOOD_IDS.includes(moodOf(pet({})).id));
  for (const id of MOOD_IDS) assert.equal(typeof id, 'string');
});

test('moodNote gives a plain, em-dash-free line', () => {
  const note = moodNote(pet({ bond: 15, stress: 10 }));
  assert.ok(note.length > 0);
  assert.ok(!note.includes('—'), 'no em-dashes in player-facing copy');
});
