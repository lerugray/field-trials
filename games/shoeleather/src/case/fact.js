// SHOELEATHER — typed facts and statements (the evidence spine, day one).
//
// DESIGN-SEED "Facts are TYPED DATA": facts/statements carry structured fields
// (subject, claim-type, value, time, place, source, acquisition-paths, chain-role |
// red-herring tag) so CONTRADICTION is a real predicate and the solver / accusation
// board validate mechanically. Prose is presentation only.
//
// A FACT is something OBSERVED in the world (never a conclusion). A STATEMENT is a
// suspect's assertion, logged verbatim but ALSO carrying a typed claim so a fact can
// mechanically contradict it. Both reduce to a CLAIM: (subject, claimType, value,
// [time], [place]).

// Claim types the contradiction predicate understands. A claim asserts a value for a
// (subject, claimType) coordinate, optionally pinned to a time and/or place.
export const CLAIM_TYPES = Object.freeze([
  'location',    // subject was at value(place) [at time]
  'time',        // an event's time
  'identity',    // subject IS value
  'possession',  // subject had/owned value
  'action',      // subject did value [at time/place]
  'property',    // subject has property value (state of a thing)
  'relationship',// subject relates to value
]);

export const ROLES = Object.freeze(['chain', 'red-herring']);

function requireField(obj, field, ctx) {
  if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
    throw new TypeError(`${ctx}: missing required field "${field}"`);
  }
}

// A typed claim. Equality of the (subject, claimType[, time][, place]) COORDINATE with
// a DIFFERENT value is what makes a contradiction.
export class Claim {
  constructor({ subject, claimType, value, time = null, place = null }) {
    requireField({ subject }, 'subject', 'Claim');
    requireField({ claimType }, 'claimType', 'Claim');
    if (!CLAIM_TYPES.includes(claimType)) throw new RangeError(`unknown claimType "${claimType}"`);
    requireField({ value }, 'value', 'Claim');
    this.subject = String(subject);
    this.claimType = claimType;
    this.value = value;
    this.time = time;   // comparable scalar (e.g. "Thu-1740") or null
    this.place = place; // string or null
  }

  // Two claims share a COORDINATE if they pin the same subject+claimType at a
  // compatible time and place (null on either side = unpinned, so compatible).
  sameCoordinate(other) {
    if (this.subject !== other.subject) return false;
    if (this.claimType !== other.claimType) return false;
    if (this.time !== null && other.time !== null && this.time !== other.time) return false;
    if (this.place !== null && other.place !== null && this.place !== other.place) return false;
    return true;
  }

  valueEquals(other) {
    return JSON.stringify(this.value) === JSON.stringify(other.value);
  }

  // A contradicts B when they address the same coordinate but assert different values.
  contradicts(other) {
    return this.sameCoordinate(other) && !this.valueEquals(other);
  }

  key() {
    return `${this.subject}|${this.claimType}|${this.time ?? '*'}|${this.place ?? '*'}|${JSON.stringify(this.value)}`;
  }
}

export class Fact {
  constructor(spec) {
    requireField(spec, 'id', 'Fact');
    this.id = String(spec.id);
    this.claim = spec.claim instanceof Claim ? spec.claim : new Claim(spec);
    // Where this fact can be OBSERVED. ALWAYS-SOLVABLE LAW: every chain-required fact
    // needs >= 2 independent acquisition paths; the solver enforces it per case.
    this.acquisitionPaths = [...(spec.acquisitionPaths || [])].map(String);
    this.role = spec.role || 'chain';
    if (!ROLES.includes(this.role)) throw new RangeError(`unknown role "${this.role}" for fact ${this.id}`);
    this.prose = spec.prose ? String(spec.prose) : ''; // presentation only
    this.prologueKeyed = !!spec.prologueKeyed;         // needs the prologue to READ correctly
    // Call 1: an accusation-chain fact has one explicit load-bearing job. The board
    // deliberately offers every pinned fact in every fact slot, but validation and
    // the solver use this identity-bearing tag to prove the expanded chain unique.
    this.chainSlot = spec.chainSlot ? String(spec.chainSlot) : null;
    this.tags = [...(spec.tags || [])].map(String);
  }

  isRedHerring() { return this.role === 'red-herring'; }
  contradicts(claimOrFact) {
    const other = claimOrFact instanceof Fact ? claimOrFact.claim : claimOrFact;
    return this.claim.contradicts(other);
  }
}

export class Statement {
  constructor(spec) {
    requireField(spec, 'id', 'Statement');
    requireField(spec, 'speaker', 'Statement');
    requireField(spec, 'text', 'Statement');
    this.id = String(spec.id);
    this.speaker = String(spec.speaker);
    this.text = String(spec.text); // logged VERBATIM
    // The typed claim the prose encodes, so a fact can contradict it mechanically.
    this.claim = spec.claim instanceof Claim ? spec.claim : new Claim(spec);
    this.tags = [...(spec.tags || [])].map(String);
  }

  // Is this statement refuted by a given fact? (fact's claim contradicts the statement)
  refutedBy(fact) {
    const factClaim = fact instanceof Fact ? fact.claim : fact;
    return factClaim.contradicts(this.claim);
  }
}
