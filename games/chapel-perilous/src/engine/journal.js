// journal.js — the player-writable in-game journal with ghost entries (M7, the
// CLIFTON-adjacent operator contract in DIRECTIONS-2026-08-02-INTERFACE-JOURNAL).
//
// Three faithful-to-the-lock properties:
//   • Player-writable — write/edit/remove free-text notes, each stamped with
//     when (a caller-supplied tick) and where (a place label).
//   • Corruption — player entries DEGRADE over time: words are replaced via the
//     five-register prose engine, and the frequency/intensity scale with hidden
//     exposure/FNORD. High exposure warps the register MIX toward ominous/
//     conspiratorial (the locked "hidden exposure warps the register + occasional
//     lies" mechanic) and can inject a whole false clause — the journal lies to
//     its own author.
//   • Ghost entries — notes the player never wrote appear among theirs, in
//     register, their count rising with exposure.
//
// Determinism (the lock): the ONLY stored state is the raw player entries. All
// corruption and every ghost are PURE deterministic functions of (stored
// entries, journal seed, exposure, now) — so a given run replays identically and
// nothing needs persisting but the player's own words. serialize/restore round-
// trips exactly; works in the single-file build. The [SEED] gate marks every
// generated/ghost string (raw player text is the author's own, left unmarked).

import { mulberry32, hashInt } from './prng.js';

const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function createJournal({ prose, seed = 1 } = {}) {
  if (!prose || typeof prose.pickRegister !== 'function') {
    throw new Error('createJournal: a prose engine is required');
  }
  const jseed = seed >>> 0;
  let entries = [];   // raw player entries only: {id,text,where,when,origin}
  let nextId = 1;

  function write({ text, where = '', when = 0 } = {}) {
    if (text == null || String(text).trim() === '') throw new Error('journal.write: text required');
    const e = { id: nextId++, text: String(text), where: String(where), when: when | 0, origin: 'player' };
    entries.push(e);
    return { ...e };
  }
  function edit(id, text) {
    const e = entries.find((x) => x.id === id);
    if (!e) return null;
    e.text = String(text);
    return { ...e };
  }
  function remove(id) {
    const before = entries.length;
    entries = entries.filter((x) => x.id !== id);
    return entries.length < before;
  }
  function raw() { return entries.map((e) => ({ ...e })); }
  function count() { return entries.length; }
  function maxWhen() { return entries.reduce((m, e) => Math.max(m, e.when), 0); }

  // ——— corruption ———————————————————————————————————————————————
  // Match the replacement word's leading case + trailing punctuation to the
  // original so a swapped word still reads as prose, not a token dump.
  function reshape(original, replacement) {
    const punct = (original.match(/[.,;:!?)]+$/) || [''])[0];
    let core = original.replace(/[.,;:!?)]+$/, '');
    let rep = replacement;
    if (/^[A-Z]/.test(core)) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
    return rep + punct;
  }

  // Deterministically corrupt one entry's text at a given intensity (0..1).
  // intensity drives BOTH the fraction of words warped and the register mix
  // (higher → weirder → more ominous/conspiratorial), plus the lie chance.
  function corruptText(text, entrySeed, intensity) {
    if (intensity <= 0.001) return text;
    const weirdness = clamp01(0.25 + 0.75 * intensity);
    const tokens = text.split(/(\s+)/);
    let out = '';
    let wi = 0;
    for (const tok of tokens) {
      if (tok === '' || /^\s+$/.test(tok)) { out += tok; continue; }
      const rng = mulberry32((entrySeed ^ ((wi + 1) * 2654435761)) >>> 0);
      wi++;
      if (rng() < intensity * 0.55) {
        const reg = prose.pickRegister(rng, weirdness);
        const rep = rng() < 0.5 ? prose.noun(reg, rng) : prose.verb(reg, rng);
        out += reshape(tok, String(rep));
      } else {
        out += tok;
      }
    }
    // Occasional whole-clause LIE — a fabricated register tail grafted on. The
    // journal asserts something the author never wrote. Scales with intensity.
    const lieRng = mulberry32((entrySeed ^ 0x9e3779b9) >>> 0);
    if (lieRng() < intensity * 0.3) {
      const reg = prose.pickRegister(lieRng, weirdness);
      out = prose.sanitize(`${out} — ${prose.clause(reg, 'here', weirdness, lieRng)}`);
    }
    return out;
  }

  // The intensity applied to an entry given its age and the current exposure.
  // Fresh + unexposed ⇒ ~0 (the note is still your own); older + exposed ⇒ high.
  function intensityFor(age, exposure) {
    return clamp01(exposure * (0.18 + 0.14 * Math.max(0, age)));
  }

  // ——— ghosts ———————————————————————————————————————————————————
  // Entries the player never wrote, seeded from the journal seed. Count rises
  // with exposure. Each is a full in-register [SEED] sentence (a misfiled
  // place-memory), interleaved among the real entries by a seeded `when`.
  function ghosts(exposure) {
    const n = Math.floor(clamp01(exposure) * 4 + (exposure > 0.05 ? 1 : 0));
    const span = maxWhen() + 1;
    const gs = [];
    for (let i = 0; i < n; i++) {
      const gseed = hashInt(i + 1, 0x6d05, jseed) >>> 0;
      const rng = mulberry32(gseed);
      const weirdness = clamp01(0.4 + 0.6 * exposure);
      // A synthetic "site" so describeSite yields a full, deterministic, [SEED]
      // sentence; the coords are the ghost's stable identity.
      const text = prose.describeSite(
        { x: i + 1, y: 0x63, name: 'a page you did not fill', weirdness },
        jseed,
        { weirdness, loc: 'the margin' },
      );
      const when = Math.floor(rng() * span);
      gs.push({ id: `g${i + 1}`, origin: 'ghost', text, where: '', when, corruption: 1 });
    }
    return gs;
  }

  // ——— the rendered view ————————————————————————————————————————
  // The player's entries (each corrupted per age+exposure) merged with the
  // ghosts, ordered by `when` then by a stable id key. `now` defaults to just
  // past the latest entry (so existing notes have aged by one tick).
  function view({ exposure = 0, now = null } = {}) {
    const exp = clamp01(exposure);
    const nowTick = now == null ? maxWhen() + 1 : (now | 0);
    const players = entries.map((e) => {
      const age = Math.max(0, nowTick - e.when);
      const intensity = intensityFor(age, exp);
      const corrupted = intensity > 0.001;
      const text = corrupted ? `[SEED] ${corruptText(e.text, hashInt(e.id, 0x4a7, jseed) >>> 0, intensity)}` : e.text;
      return { id: e.id, origin: 'player', where: e.where, when: e.when, corruption: corrupted ? intensity : 0, text };
    });
    const merged = [...players, ...ghosts(exp)];
    merged.sort((a, b) => (a.when - b.when) || String(a.id).localeCompare(String(b.id)));
    return merged;
  }

  // ——— persistence ——————————————————————————————————————————————
  function serialize() {
    return { seed: jseed, nextId, entries: entries.map((e) => ({ ...e })) };
  }
  function restore(state) {
    if (!state) return;
    entries = Array.isArray(state.entries) ? state.entries.map((e) => ({ ...e })) : [];
    nextId = state.nextId || (entries.reduce((m, e) => Math.max(m, e.id), 0) + 1);
  }

  return {
    write, edit, remove, raw, count,
    view, ghosts, corruptText, intensityFor,
    serialize, restore,
    get seed() { return jseed; },
  };
}
