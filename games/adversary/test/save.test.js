import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryStorage, serializeSave, writeSave, readSave, applySave, checksum,
} from '../src/sim/save.js';
import { createStage, stepStage } from '../src/sim/stage.js';
import { addWeapon, addItem } from '../src/sim/inventory.js';

const W = 20;
const DEF = { rows: ['.'.repeat(W), '.'.repeat(W), 'p'.padEnd(W, '.'), '#'.repeat(W)], startXp: 70 };

function makeStage(seed = 's') {
  const s = createStage(DEF, { seed });
  addWeapon(s.inventory, 'long-blade');
  addItem(s.inventory, 'heal', 2);
  s.gold = 123;
  s.deaths = 3;
  s.marker = { xp: 15, x: 200, y: 48 };
  return s;
}

test('save: round-trips the persistent state through write/read/apply', () => {
  const storage = createMemoryStorage();
  const s = makeStage();
  writeSave(storage, 'slot', serializeSave(s, 'stage1'));

  const { save, recovered } = readSave(storage, 'slot');
  assert.ok(save && !recovered);

  const fresh = applySave(createStage(DEF, { seed: 'fresh' }), save);
  assert.equal(fresh.progress.totalXp, s.progress.totalXp);
  assert.equal(fresh.gold, 123);
  assert.equal(fresh.deaths, 3);
  assert.deepEqual(fresh.marker, { xp: 15, x: 200, y: 48 });
  assert.ok(fresh.inventory.weapons.includes('long-blade'));
  assert.equal(fresh.inventory.items.heal, 3); // 1 default + 2 added
  assert.equal(fresh.progress.hp, fresh.progress.stats.maxHP, 'loads at full HP');
});

test('save: a corrupt main slot recovers from the backup', () => {
  const storage = createMemoryStorage();
  const s = makeStage();
  writeSave(storage, 'slot', serializeSave(s));       // first save (no backup yet)
  s.gold = 999;
  writeSave(storage, 'slot', serializeSave(s));       // second save → backup holds the first

  // Corrupt the main slot (torn write / tamper).
  storage.setItem('slot', '{"data":{"gold":123},"sum":"deadbeef"}');
  const { save, recovered } = readSave(storage, 'slot');
  assert.ok(recovered, 'fell back to backup');
  assert.equal(save.gold, 123, 'backup held the previous good save');
});

test('save: garbage in both slots yields no save (fresh start)', () => {
  const storage = createMemoryStorage({ slot: 'not json', 'slot.bak': '{bad' });
  const { save } = readSave(storage, 'slot');
  assert.equal(save, null);
});

test('save: checksum detects tampering', () => {
  const storage = createMemoryStorage();
  writeSave(storage, 'slot', serializeSave(makeStage()));
  // Tamper with the stored data without fixing the checksum.
  const rec = JSON.parse(storage.getItem('slot'));
  rec.data.gold = 999999;
  storage.setItem('slot', JSON.stringify(rec));
  const { save } = readSave(storage, 'slot');
  assert.equal(save, null, 'tampered main rejected (and no backup here)');
});

test('save: end-to-end — play, save, reload restores marker + deaths', () => {
  const storage = createMemoryStorage();
  const s = makeStage('e2e');
  // Simulate a death to move state, then save.
  s.progress.hp = 0;
  stepStage(s, { moveDir: 0 });
  writeSave(storage, 'slot', serializeSave(s));

  const { save } = readSave(storage, 'slot');
  const reloaded = applySave(createStage(DEF, { seed: 'x' }), save);
  assert.equal(reloaded.deaths, s.deaths);
  assert.deepEqual(reloaded.marker, s.marker);
});

test('save: checksum is stable and content-sensitive', () => {
  assert.equal(checksum('abc'), checksum('abc'));
  assert.notEqual(checksum('abc'), checksum('abd'));
});

test('save: doubleJump kit grant persists and marks matching pickup collected', () => {
  const W = 20;
  const row = (() => {
    const a = Array(W).fill('.');
    a[2] = 'p'; a[12] = 'J'; a[16] = 'x';
    return a.join('');
  })();
  const DJ_DEF = { rows: ['.'.repeat(W), '.'.repeat(W), row, '#'.repeat(W)] };
  const storage = createMemoryStorage();
  const s = createStage(DJ_DEF, { seed: 'dj-save' });
  const owned = s.unlockPickups.find((u) => u.move === 'doubleJump');
  assert.ok(owned, 'marker J yields doubleJump pickup');
  assert.ok(!s.kit.doubleJump);

  s.player.x = owned.x;
  const unlockEv = stepStage(s, { moveDir: 0 });
  assert.ok(unlockEv.some((e) => e.type === 'unlock' && e.move === 'doubleJump'));
  assert.ok(s.kit.doubleJump, 'touching J grants kit.doubleJump');
  assert.ok(owned.collected);

  writeSave(storage, 'slot', serializeSave(s));

  const { save } = readSave(storage, 'slot');
  const fresh = applySave(createStage(DJ_DEF, { seed: 'dj-fresh' }), save);
  assert.ok(fresh.kit.doubleJump, 'doubleJump grant retained');
  const pickup = fresh.unlockPickups.find((u) => u.move === 'doubleJump');
  assert.ok(pickup, 'doubleJump pickup present on fresh stage');
  assert.ok(pickup.collected, 'matching pickup marked collected');
});
