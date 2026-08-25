import { Schema } from "effect";
import {
  BoundedInteger,
  CohortHarm,
  CohortType,
  Experience,
  FormatVersion,
  Notes,
  GameStem,
  Hold,
  Revision,
  Timestamp,
  Uuid,
} from "./common.js";
import {
  CREW_COMPLETENESS_RECORDS,
  findIncompleteRecords,
  isComplete,
  type CompletenessRecord,
} from "./generated/completeness.js";

const SpecialAbility = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  timesTaken: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});

const Upgrade = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  boxesMarked: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});

// Q4 (contract/schemas/crew.json): contacts are a required canonical array;
// empty means no entries. Each entry requires name and profession.
const Contact = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  profession: Schema.String,
});

// Q4 (contract/schemas/crew.json): factions are a required canonical array;
// empty means no entries. Each entry requires name and status (server-clamped).
const Faction = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  status: Schema.Number.pipe(Schema.int()),
});

const Cohort = Schema.Struct({
  id: Uuid,
  cohortKind: CohortType,
  gangType: Schema.String,
  expertType: Schema.String,
  quality: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  scale: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  hasArmor: Schema.Boolean,
  edges: Schema.Array(Schema.String),
  flaws: Schema.Array(Schema.String),
  harm: CohortHarm,
  description: Schema.String,
});

const ClaimId = Schema.String.pipe(Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));

const ClaimOverride = Schema.Struct({
  claimId: ClaimId,
  name: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  description: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  effects: Schema.optional(Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown }))),
});

/** Full crew DTO — mirrors contract/schemas/crew.json */
export const Crew = Schema.Struct({
  kind: Schema.Literal("crew"),
  id: Uuid,
  gameStem: GameStem,
  gameName: Schema.String,
  language: Schema.String,
  revision: Revision,
  formatVersion: FormatVersion,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  crewTypeName: Schema.String,
  name: Schema.String,
  lair: Schema.String,
  reputation: Schema.String,
  huntingGrounds: Schema.String,
  tier: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  hold: Hold,
  heat: BoundedInteger,
  wanted: BoundedInteger,
  rep: BoundedInteger,
  turf: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0), Schema.lessThanOrEqualTo(6)),
  experience: Experience,
  specialAbilities: Schema.Array(SpecialAbility),
  upgrades: Schema.Array(Upgrade),
  cohorts: Schema.Array(Cohort),
  contacts: Schema.Array(Contact),
  factions: Schema.Array(Faction),
  coin: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  stash: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  // CONTRACT-04 (2026-08-25): write-time derived from the crew's own Vault
  // marks and validated settings — server-computed, never a client constant.
  stashCapacity: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  notes: Notes,
  claimedClaimIds: Schema.Array(ClaimId),
  claimOverrides: Schema.Array(ClaimOverride),
}).pipe(Schema.annotations({ identifier: "Crew" }));

export type Crew = typeof Crew.Type;

export const decodeCrew = Schema.decodeUnknownSync(Crew, { onExcessProperty: "error" });
export const decodeCrewEither = Schema.decodeUnknownEither(Crew, {
  onExcessProperty: "error",
});

/**
 * Outstanding (incomplete) crew fields, computed from the GENERATED
 * predicates module — never a hand-copied pointer list. A canonical empty at
 * a locked pointer makes the entity readable + incomplete (Q10); a genuinely
 * absent property is a canonicality (repair) concern, not a completeness one.
 */
export const crewOutstandingFields = (document: Crew): readonly CompletenessRecord[] =>
  findIncompleteRecords(CREW_COMPLETENESS_RECORDS, document as unknown);

/** True when every crew completeness predicate holds for the document. */
export const isCrewComplete = (document: Crew): boolean =>
  isComplete(CREW_COMPLETENESS_RECORDS, document as unknown);
