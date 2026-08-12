// M8 WORLD CHARACTER — town variety (directive §5, Ray: "all the places were the
// same"). Two towns must not feel interchangeable and two buildings in one town
// must not either. The geometry + archetype live in city.js; this module dresses a
// town with the identity that makes it a PLACE:
//   • a town blurb keyed to its archetype (a port reads unlike a bureau seat);
//   • per-building identity — a proprietor name + a generated register line — so
//     two inns (or two of anything) still read differently;
//   • citizens: named townsfolk standing in the streets, visible + greetable.
// All seeded/deterministic + [SEED]-marked; unit-tested.

import { hashInt, mulberry32 } from './prng.js';

export function createCityLife(city, { seed = 0, names, prose, cityRegister } = {}) {
  const cseed = seed >>> 0;
  const arche = city.archetype;
  const archetypes = (cityRegister && cityRegister.archetypes) || {};
  const greetings = (cityRegister && cityRegister.citizen_greetings) || ['[SEED] nods and moves on.'];

  // The archetype blurb — the one-line "what kind of town is this".
  function townBlurb() {
    return archetypes[arche] || `[SEED] an ordinary town, which is the suspicious part`;
  }

  // Per-building identity, keyed to the building index so it's stable and so two
  // same-service buildings differ: a proprietor + a generated interior line.
  function identity(building) {
    const k = building.index | 0;
    const proprietor = names.personalName(
      hashInt(k, 0x91, cseed) % names.count,
      mulberry32((cseed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0),
    );
    const line = prose && typeof prose.describeTerrain === 'function'
      ? prose.describeTerrain('interior', k, arche.length, (cseed ^ 0xb1d) >>> 0, { weirdness: 0.5 })
      : '[SEED] a low room that has heard this conversation before';
    return { service: building.service, proprietor, line };
  }

  // Citizens: named townsfolk on distinct street tiles (never a door or the gate),
  // deterministic per town. `count` is capped to the available street tiles.
  function citizens(count = 4) {
    const streets = [];
    for (let y = 1; y < city.height - 1; y++) {
      for (let x = 1; x < city.width - 1; x++) {
        if (!city.passable(x, y)) continue;
        if (x === city.gate.x && y === city.gate.y) continue;
        if (x === city.spawn.x && y === city.spawn.y) continue;
        if (city.buildingAt(x, y)) continue;
        streets.push([x, y]);
      }
    }
    const n = Math.min(count, streets.length);
    const used = new Set();
    const out = [];
    for (let i = 0; i < n; i++) {
      let idx = hashInt(i, 0x21, cseed) % streets.length;
      let guard = 0;
      while (used.has(idx) && guard++ < streets.length) idx = (idx + 1) % streets.length;
      used.add(idx);
      const [x, y] = streets[idx];
      out.push({ x, y, name: names.npcAt(x, y, cseed ^ 0xc17) });
    }
    return out;
  }

  function greetingFor(x, y) {
    return greetings[hashInt(x | 0, y | 0, cseed) % greetings.length];
  }

  return { archetype: arche, townBlurb, identity, citizens, greetingFor };
}
