import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summon, STAT_KEYS } from '../src/engine/summon.js';
import { newGame } from '../src/engine/save.js';
import { certificateSpec, certificateFilename } from '../src/render/certificate.js';

const petState = () => newGame(summon('a champion of the ring'), 1);

test('spec carries identity, subtitle, and a full stat row set', () => {
  const st = petState();
  const spec = certificateSpec(st.creature, st.estate);
  assert.ok(spec);
  assert.equal(spec.name, st.creature.name);
  assert.match(spec.subtitle, new RegExp(st.creature.species.name));
  assert.equal(spec.stats.length, STAT_KEYS.length);
  for (const s of spec.stats) {
    assert.ok(typeof s.value === 'number');
    assert.ok(s.label && s.key);
  }
});

test('a founder gets the ADOPTION title and no lineage block', () => {
  const st = petState();
  const spec = certificateSpec(st.creature, st.estate);
  assert.equal(spec.title, 'CERTIFICATE OF ADOPTION');
  assert.equal(spec.lineage, null);
});

test('a creature with parents gets the LINEAGE title and parent lines', () => {
  const st = petState();
  st.creature.lineage = {
    parents: [
      { name: 'Old Bramble', species: 'Mossback' },
      { name: 'Cinder', species: 'Emberling' },
    ],
    boosted: ['pow', 'foc'],
  };
  const spec = certificateSpec(st.creature, st.estate);
  assert.equal(spec.title, 'CERTIFICATE OF LINEAGE');
  assert.equal(spec.lineage.parents.length, 2);
  assert.match(spec.lineage.parents[0], /Old Bramble \(Mossback\)/);
  assert.ok(spec.lineage.boosted.length >= 1);
});

test('fields include element, rank, record and age', () => {
  const st = petState();
  const spec = certificateSpec(st.creature, st.estate);
  const labels = spec.fields.map((f) => f.label);
  for (const need of ['Species', 'Rarity', 'Element', 'Age', 'Rank', 'Record']) {
    assert.ok(labels.includes(need), `missing field ${need}`);
  }
  const record = spec.fields.find((f) => f.label === 'Record');
  assert.match(record.value, /^\d+W \/ \d+L$/);
});

test('the seed line reflects the summon phrase', () => {
  const st = petState();
  const spec = certificateSpec(st.creature, st.estate);
  assert.match(spec.seedLine, /a champion of the ring/);
});

test('a phraseless creature gets the foundling seed line', () => {
  const st = petState();
  st.creature.phrase = '';
  const spec = certificateSpec(st.creature, st.estate);
  assert.match(spec.seedLine, /foundling/);
});

test('an overlong phrase is truncated so the seed line cannot overrun', () => {
  const st = petState();
  st.creature.phrase = 'x'.repeat(500);
  const spec = certificateSpec(st.creature, st.estate);
  assert.ok(spec.seedLine.length < 80, 'seed line stays bounded');
  assert.match(spec.seedLine, /…/); // ellipsis marks the truncation
});

test('null / malformed creature yields null, never throws', () => {
  assert.equal(certificateSpec(null), null);
  assert.equal(certificateSpec({}), null);
});

test('filename is filesystem-safe', () => {
  assert.equal(certificateFilename({ name: 'Zoë the Great!' }), 'Zo_the_Great_-certificate.png');
  assert.equal(certificateFilename(null), 'oddseedz-certificate.png');
});
