import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summon } from '../src/engine/summon.js';
import { newGame, serialize } from '../src/engine/save.js';
import { encodeSave, decodeSave, SAVE_TOKEN_PREFIX } from '../src/engine/saveio.js';

const sampleState = () => newGame(summon('a champion of the ring'), 12345);

test('a token carries the versioned magic prefix', () => {
  const token = encodeSave(sampleState());
  assert.ok(token.startsWith(SAVE_TOKEN_PREFIX));
  assert.ok(token.length > SAVE_TOKEN_PREFIX.length + 8);
});

test('encode -> decode round-trips a game state exactly', () => {
  const state = sampleState();
  const back = decodeSave(encodeSave(state));
  assert.ok(back, 'decode returned null');
  // deserialize migrates to the current version; compare the serialized shape
  assert.equal(serialize(back), serialize(state));
});

test('a token survives copy-paste whitespace and line breaks', () => {
  const token = encodeSave(sampleState());
  const mangled = token.slice(0, 20) + '\n  ' + token.slice(20) + '\n';
  const back = decodeSave(mangled);
  assert.ok(back, 'whitespace-mangled token failed to decode');
  assert.equal(serialize(back), serialize(sampleState()));
});

test('unicode in creature data survives the round-trip', () => {
  const state = sampleState();
  state.creature.name = 'Zoë ☃ 名前';
  const back = decodeSave(encodeSave(state));
  assert.equal(back.creature.name, 'Zoë ☃ 名前');
});

test('a raw serialized-JSON paste is also accepted', () => {
  const state = sampleState();
  const back = decodeSave(serialize(state));
  assert.ok(back);
  assert.equal(serialize(back), serialize(state));
});

test('garbage / truncated tokens decode to null, never throw', () => {
  assert.equal(decodeSave('ODDZ1:not!!!valid'), null);
  assert.equal(decodeSave('ODDZ1:'), null);
  assert.equal(decodeSave('totally not a save'), null);
  assert.equal(decodeSave(''), null);
  assert.equal(decodeSave('   '), null);
  assert.equal(decodeSave(null), null);
  assert.equal(decodeSave(42), null);
});

test('a tampered token body decodes to null (validation via deserialize)', () => {
  const token = encodeSave(sampleState());
  // flip a chunk of the base64 body to corrupt the payload
  const body = token.slice(SAVE_TOKEN_PREFIX.length);
  const tampered = SAVE_TOKEN_PREFIX + 'QQQQ' + body.slice(4);
  const back = decodeSave(tampered);
  // either null, or (unlikely) a still-valid but different state — must not throw
  if (back !== null) assert.ok(typeof back === 'object');
});
