import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNIQUES, UNIQUE_IDS, uniqueDef, weaponMod } from '../src/sim/uniques.js';
import { RARITY } from '../src/sim/equipment.js';
import { weaponDef, addWeapon } from '../src/sim/inventory.js';
import { createStage, stepStage } from '../src/sim/stage.js';
import { computeDamage } from '../src/sim/equipment.js';

test('uniques: 8-12 uniques, each a rule-bending build-changer with a descriptor', () => {
  assert.ok(UNIQUE_IDS.length >= 8 && UNIQUE_IDS.length <= 12, `count ${UNIQUE_IDS.length}`);
  for (const id of UNIQUE_IDS) {
    const u = UNIQUES[id];
    assert.equal(u.rarity, RARITY.UNIQUE);
    assert.ok(typeof u.rule === 'string' && u.rule.length > 0, `${id} has a rule descriptor`);
    assert.ok(u.mod && typeof u.mod === 'object', `${id} has a mod`);
    assert.match(u.name, /^[a-z ]+$/, `${id} name is a neutral placeholder`);
  }
});

test('uniques: weaponDef resolves uniques; addWeapon accepts them', () => {
  assert.equal(weaponDef('unique-3').id, 'unique-3');
  const inv = { weapons: [], armors: [], items: {} };
  addWeapon(inv, 'unique-7');
  assert.ok(inv.weapons.includes('unique-7'));
});

const W = 24;
const brow = (() => { const a = Array(W).fill('.'); a[2] = 'p'; a[16] = 'B'; a[22] = 'x'; return a.join(''); })();
const DEF = (kit) => ({ rows: ['.'.repeat(W), '.'.repeat(W), brow, '#'.repeat(W)], startXp: 220, kit });

function bossStage(weaponId, kit = {}) {
  const s = createStage(DEF(kit), { seed: weaponId });
  s.loadout.weapon = uniqueDef(weaponId);
  s.player.x = s.boss.x - 20; s.player.facing = 1;
  return s;
}

test('uniques: leeching edge heals the player on a hit', () => {
  const s = bossStage('unique-3');
  s.progress.hp = 20;
  stepStage(s, { moveDir: 0, attackPressed: true, attackDown: true });
  assert.ok(s.progress.hp > 20, 'lifesteal healed on hit');
});

test('uniques: coiled brand makes a normal press hit as a charged strike', () => {
  const s = bossStage('unique-4');
  const ev = stepStage(s, { moveDir: 0, attackPressed: true, attackDown: true });
  const hit = ev.find((e) => e.type === 'hit');
  const base = computeDamage(s.progress.stats, UNIQUES['unique-4'], 0);
  assert.ok(hit && hit.dmg >= base * 1.8, `charged-by-default ${hit && hit.dmg} vs base ${base}`);
});

test('uniques: glass fang doubles outgoing damage', () => {
  const s = bossStage('unique-7');
  const ev = stepStage(s, { moveDir: 0, attackPressed: true, attackDown: true });
  const hit = ev.find((e) => e.type === 'hit');
  const base = computeDamage(s.progress.stats, UNIQUES['unique-7'], 0);
  assert.ok(hit.dmg >= base * 1.9, 'double outgoing');
});

test('uniques: glass fang doubles incoming contact damage', () => {
  const s = bossStage('unique-7'); // fresh; do NOT attack (glass fang one-shots the boss)
  const before = s.progress.hp;
  s.player.x = s.boss.x; // overlap the boss
  const ev = stepStage(s, { moveDir: 0 });
  const hurt = ev.find((e) => e.type === 'hurt');
  assert.ok(hurt, 'took a contact hit');
  // Boss idle contact is 4; glass fang doubles it to 8.
  assert.equal(hurt.dmg, 8, 'contact damage doubled by fragile:2');
});

test('uniques: free sling fires the sub-weapon with no resource', () => {
  const s = bossStage('unique-6', { subweapon: true });
  s.subResource = 0;
  const ev = stepStage(s, { moveDir: 0, up: true, subweaponPressed: true });
  assert.ok(ev.some((e) => e.type === 'kit-move' && e.move === 'subweapon'), 'fired at 0 resource');
  assert.equal(s.subResource, 0);
});

test('uniques: beam edge fires the shot below full HP', () => {
  const s = bossStage('unique-5'); // projectileAnyHp; no kit.projectile needed
  s.progress.hp = s.progress.stats.maxHP - 5;
  const ev = stepStage(s, { moveDir: 0, attackPressed: true, attackDown: true });
  assert.ok(ev.some((e) => e.type === 'kit-move' && e.move === 'projectile'), 'beam fired below full HP');
});
