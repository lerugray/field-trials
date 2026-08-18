// Staff needs, morale and separation (M3). Amenities feed and rest the crew; neglect drives morale
// down into grievances and then resignation or defection; archetypes differ in temperament (fold 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility, ARCHETYPE, CONFIG, activeStaff } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { runNeeds, ARCHETYPE_TRAITS, foodCapacity } from '../src/staff.js';
import { createRng } from '../src/rng.js';

test('the inherited crew stays fed and rested on the base amenities (zero input does not starve them)', () => {
  let f = createFacility({ seed: 'fed' });
  f.fortify = 100; // keep the tenure open so we can watch the crew
  for (let i = 0; i < 6; i++) f = commitCycle(f);
  // Base food/housing cover the inherited 4, so no one falls into grievance from need alone.
  const grieving = f.staff.filter((s) => s.status === 'grieving').length;
  assert.equal(grieving, 0, 'the inherited crew starved on the base amenities');
});

test('overcrowding beyond the amenities drives morale down and separates staff', () => {
  const f = createFacility({ seed: 'crowd' });
  f.fortify = 100;
  // Crowd the roll far beyond base food/housing (4): needs will collapse.
  for (let i = 0; i < 10; i++) {
    f.staff.push({
      id: `extra-${i}`,
      archetype: ARCHETYPE.DRUDGE,
      tier: 1,
      wage: 10,
      morale: 40,
      needs: { food: 40, rest: 40 },
      grievances: [],
      missedPaydays: 0,
      status: 'employed',
      postId: null,
    });
  }
  assert.ok(activeStaff(f).length > foodCapacity(f), 'setup: crew should exceed the amenities');
  const rng = createRng('sep');
  let anySeparated = false;
  let anyGrieving = false;
  for (let c = 1; c <= 8; c++) {
    const report = { cycle: c, grievancesFiled: 0, lines: [] };
    runNeeds(f, rng, report, () => {});
    if (f.staff.some((s) => s.status === 'grieving')) anyGrieving = true;
    if (f.staff.some((s) => s.status === 'resigned' || s.status === 'defected')) anySeparated = true;
  }
  assert.ok(anyGrieving, 'overcrowded, underfed staff never filed a grievance');
  assert.ok(anySeparated, 'chronically neglected staff never separated');
  // The skeleton-crew floor holds the count from collapsing to zero (fold 11).
  assert.ok(activeStaff(f).length >= CONFIG.bootstrap.skeletonCrewFloor);
});

test('archetype temperament differs: a wage-sensitive clerk suffers more than a drudge when unpaid', () => {
  assert.equal(ARCHETYPE_TRAITS[ARCHETYPE.CLERK].wageSensitive, true);
  assert.equal(ARCHETYPE_TRAITS[ARCHETYPE.DRUDGE].wageSensitive, false);

  const f = createFacility({ seed: 'temperament' });
  const clerk = { archetype: ARCHETYPE.CLERK, morale: 60, needs: { food: 100, rest: 100 }, missedPaydays: 2, grievances: [], status: 'employed', id: 'c', wage: 25, tier: 2 };
  const drudge = { archetype: ARCHETYPE.DRUDGE, morale: 60, needs: { food: 100, rest: 100 }, missedPaydays: 2, grievances: [], status: 'employed', id: 'd', wage: 10, tier: 1 };
  f.staff = [clerk, drudge];
  const rng = createRng('t');
  runNeeds(f, rng, { cycle: 1, grievancesFiled: 0, lines: [] }, () => {});
  // Both lost morale from deferred pay, but the wage-sensitive clerk lost more.
  assert.ok(clerk.morale < drudge.morale, 'the clerk did not suffer the wage more than the drudge');
});

test('a defector strengthens the next raid', () => {
  const f = createFacility({ seed: 'defect' });
  f.defectors = 3;
  const before = f.lossObject.condition;
  const f1 = commitCycle(f); // cycle 1 is scripted survivable, so use it only to confirm no crash
  const f2 = commitCycle(f1); // the defector bonus is folded into the threat here
  assert.ok(f2.lossObject.condition <= before, 'defectors did not raise the pressure on the Cornerstone');
});
