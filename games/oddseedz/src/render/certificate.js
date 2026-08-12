// Adoption / lineage certificate (M10). A code-drawn keepsake the operator can
// download as a PNG. This module is the PURE layout+content spec — the ordered
// fields, titles, stat rows and lineage block for a given creature — so it is
// unit-tested without a canvas. The UI (app.js) reads the spec and paints it with
// the bitmap font + drawCreature onto an offscreen canvas, then exports a PNG.

import { STAT_KEYS, STAT_LABELS } from '../engine/summon.js';
import { affinityOf } from '../data/roster.js';

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

// Build the certificate content for a creature (+ optional estate for career).
// A creature with parents earns the "OF LINEAGE" title; a founder gets "OF
// ADOPTION". Returns a plain, inspectable object — no drawing, no DOM.
export function certificateSpec(creature, estate = {}) {
  if (!creature || !creature.species) return null;
  const lin = creature.lineage || null;
  const hasParents = !!(lin && Array.isArray(lin.parents) && lin.parents.length);
  const aff = affinityOf(creature.species);
  const record = estate.record || { wins: 0, losses: 0 };
  const career = estate.career || { rank: 'E' };

  const fields = [
    { label: 'Species', value: creature.species.name },
    { label: 'Rarity', value: cap(creature.rarity) },
    { label: 'Element', value: aff.element },
    { label: 'Temperament', value: cap(creature.temperament || 'even') },
    { label: 'Age', value: `week ${creature.age != null ? creature.age : 1}` },
    { label: 'Rank', value: `${career.rank} rank` },
    { label: 'Record', value: `${record.wins}W / ${record.losses}L` },
  ];

  const stats = STAT_KEYS.map((k) => ({
    key: k,
    label: STAT_LABELS[k] || k.toUpperCase(),
    value: (creature.stats && creature.stats[k]) || 0,
  }));

  let lineage = null;
  if (hasParents) {
    lineage = {
      parents: lin.parents.map((p) => `${p.name} (${p.species})`),
      boosted: (lin.boosted || []).map((k) => STAT_LABELS[k] || k),
    };
  }

  // Cap the phrase so a long summon can't overrun the certificate's seed line.
  const rawPhrase = creature.phrase ? String(creature.phrase).trim() : '';
  const phrase = rawPhrase.length > 48 ? rawPhrase.slice(0, 47) + '…' : rawPhrase;

  return {
    title: hasParents ? 'CERTIFICATE OF LINEAGE' : 'CERTIFICATE OF ADOPTION',
    name: creature.name || 'Unnamed',
    subtitle: `the ${creature.rarity} ${creature.species.name}`,
    fields,
    stats,
    lineage,
    seedLine: phrase ? `summoned from "${phrase}"` : 'a foundling of the seed',
    footer: 'ODDSEEDZ',
  };
}

// A filesystem-safe filename for the exported PNG.
export function certificateFilename(creature) {
  const nm = (creature && creature.name) || 'oddseedz';
  return `${String(nm).replace(/[^\w-]+/g, '_')}-certificate.png`;
}
