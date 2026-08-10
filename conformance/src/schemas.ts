import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

// ---------------------------------------------------------------------------
// Frozen-contract primitives (contract/schemas/common.json)
//
// AUDIT-0 BUG-013: the previous decoders reduced UUIDs, RFC 3339 timestamps,
// integer bounds, enums, and history IDs to unrestricted strings/numbers, so a
// fully green conformance run did not establish OpenAPI response validation.
// These primitives mirror the frozen JSON Schemas exactly: v4 UUIDs, the
// mandatory 'T' in timestamps, integer bounds, enums, and the 17-digit
// history snapshot IDs. `decode` additionally rejects excess properties
// because every frozen schema sets `additionalProperties: false`.
// ---------------------------------------------------------------------------

const Uuid = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
);

/** common.json#/$defs/timestamp — ISO-8601 UTC (RFC 3339 date-time with 'T'). */
const Timestamp = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/),
);

/** OpenAPI path-parameter pattern for id/gameStem/crewId. */
const GameStem = Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9-]+$/));

/** common.json#/$defs/revision — minimum 1. */
const Revision = Schema.Int.pipe(Schema.greaterThanOrEqualTo(1));

/** common.json#/$defs/formatVersion — minimum 1. */
const FormatVersion = Schema.Int.pipe(Schema.greaterThanOrEqualTo(1));

const NonNegativeInt = Schema.NonNegativeInt;
const PositiveInt = Schema.Int.pipe(Schema.greaterThanOrEqualTo(1));
const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

const HarmIntensity = Schema.Literal("lesser", "moderate", "severe", "fatal");
const Closeness = Schema.Literal("friend", "close-friend", "rival");
const Commitment = Schema.Literal("none", "light", "normal", "heavy", "encumbered");
const Hold = Schema.Literal("strong", "weak");
const CohortType = Schema.Literal("gang", "expert");
const CohortHarm = Schema.Literal("healthy", "weakened", "impaired", "broken", "dead");
const ClockKind = Schema.Literal("project", "rollover");
const ErrorCode = Schema.Literal(
  "NOT_FOUND", "VALIDATION", "STALE_REVISION", "RETIRED", "CONFIRM_REQUIRED",
  "DUPLICATE", "SLOT_FULL_FATAL", "CANNOT_HEAL", "ARMOR_NOT_AVAILABLE",
  "ABILITY_MAXED", "CANNOT_LEVEL_UP", "RATING_MAXED", "UPGRADE_MAXED",
  "INSUFFICIENT_FUNDS", "SATCHEL_FULL", "OVER_BULK", "NO_COMMITMENT",
  "COMMITMENT_LOCKED", "NO_HISTORY", "GAME_NOT_FOUND", "PAYLOAD_TOO_LARGE",
);

const BoundedInteger = Schema.Struct({ current: NonNegativeInt, max: NonNegativeInt });
const Experience = Schema.Struct({ points: NonNegativeInt, max: NonNegativeInt });
const NamedDescription = Schema.Struct({ name: Schema.String, description: Schema.String });
const GearItem = Schema.Struct({ name: NonEmptyString, bulk: NonNegativeInt });
const Notes = Schema.Array(Schema.String);

const Armor = Schema.Struct({
  standardUsed: Schema.Boolean,
  heavyUsed: Schema.Boolean,
  specialUsed: Schema.Boolean,
  hasStandard: Schema.Boolean,
  hasHeavy: Schema.Boolean,
  hasSpecial: Schema.Boolean,
});

const Character = Schema.Struct({
  kind: Schema.Literal("character"),
  id: Uuid,
  gameStem: GameStem,
  gameName: Schema.String,
  language: Schema.String,
  revision: Revision,
  formatVersion: FormatVersion,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  isRetired: Schema.Boolean,
  isDeadish: Schema.Boolean,
  dossier: Schema.Struct({
    name: Schema.String,
    crewId: Schema.String.pipe(
      Schema.pattern(/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/),
    ),
    alias: Schema.String,
    look: Schema.String,
    notes: Notes,
    background: NamedDescription,
    heritage: NamedDescription,
    vice: Schema.Struct({
      name: Schema.String,
      description: Schema.String,
      purveyor: Schema.Struct({ name: Schema.String, description: Schema.String }),
    }),
  }),
  monitor: Schema.Struct({
    stress: BoundedInteger,
    trauma: Schema.Struct({ traumas: Schema.Array(Schema.String), max: PositiveInt }),
    harm: Schema.Struct({
      lesser: Schema.Array(Schema.String),
      moderate: Schema.Array(Schema.String),
      severe: Schema.Array(Schema.String),
      fatal: Schema.Array(Schema.String),
      healingClock: Schema.Struct({ segments: NonNegativeInt, size: PositiveInt, rollover: NonNegativeInt }),
    }),
    armor: Armor,
  }),
  talent: Schema.Struct({
    attributes: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        experience: Experience,
        actions: Schema.Array(
          Schema.Struct({ name: Schema.String, rating: NonNegativeInt, maxRating: PositiveInt }),
        ),
      }),
    ),
  }),
  playbook: Schema.Struct({
    name: Schema.String,
    experience: Experience,
    abilities: Schema.Array(
      Schema.Struct({ name: Schema.String, description: Schema.String, timesTaken: PositiveInt }),
    ),
  }),
  gear: Schema.Struct({
    loadout: Schema.Array(GearItem),
    availableGear: Schema.Array(GearItem),
    commitment: Commitment,
    isCommitmentLocked: Schema.Boolean,
    maxBulk: NonNegativeInt,
  }),
  fund: Schema.Struct({
    satchel: Schema.Struct({ coins: NonNegativeInt, max: NonNegativeInt }),
    stash: Schema.Struct({ coins: NonNegativeInt, max: NonNegativeInt }),
  }),
  rolodex: Schema.Struct({
    friends: Schema.Array(Schema.Struct({ entry: NonEmptyString, closeness: Closeness })),
  }),
  session: Schema.Struct({
    playbookExpressions: NonNegativeInt,
    characterExpressions: NonNegativeInt,
    struggleExpressions: NonNegativeInt,
    max: NonNegativeInt,
  }),
  notebook: Schema.String,
});

const Crew = Schema.Struct({
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
  tier: NonNegativeInt,
  hold: Hold,
  heat: BoundedInteger,
  wanted: BoundedInteger,
  rep: BoundedInteger,
  experience: Experience,
  specialAbilities: Schema.Array(Schema.Struct({ name: NonEmptyString, timesTaken: PositiveInt })),
  upgrades: Schema.Array(Schema.Struct({ name: NonEmptyString, boxesMarked: PositiveInt })),
  cohorts: Schema.Array(
    Schema.Struct({
      id: Uuid,
      cohortKind: CohortType,
      gangType: Schema.String,
      expertType: Schema.String,
      quality: NonNegativeInt,
      scale: NonNegativeInt,
      hasArmor: Schema.Boolean,
      edges: Schema.Array(Schema.String),
      flaws: Schema.Array(Schema.String),
      harm: CohortHarm,
      description: Schema.String,
    }),
  ),
  coin: NonNegativeInt,
  stash: NonNegativeInt,
  notes: Notes,
  turf: Schema.Int.pipe(Schema.between(0, 6)),
  // C3 contract change (2026-07-29): optional until formatVersion bump —
  // servers implementing C3 MUST emit them (empty array when none); clients
  // MUST tolerate absence, so existing backends still decode.
  contacts: Schema.optional(Schema.Array(Schema.Struct({ name: NonEmptyString, profession: Schema.String }))),
  factions: Schema.optional(Schema.Array(Schema.Struct({ name: NonEmptyString, status: Schema.Int }))),
  // Crew Claims (2026-08-10): claim ownership + per-crew overrides.
  claimedClaimIds: Schema.Array(Schema.String.pipe(Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))),
  claimOverrides: Schema.Array(
    Schema.Struct({
      claimId: Schema.String.pipe(Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
      name: Schema.optional(NonEmptyString),
      description: Schema.optional(NonEmptyString),
      effects: Schema.optional(Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown }))),
    }),
  ),
});

const Clock = Schema.Struct({
  kind: Schema.Literal("clock"),
  id: Uuid,
  revision: Revision,
  formatVersion: FormatVersion,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  name: Schema.String,
  clockKind: ClockKind,
  segments: NonNegativeInt,
  size: PositiveInt,
  rollover: NonNegativeInt,
});

const ErrorObject = Schema.Struct({
  code: ErrorCode,
  message: Schema.String,
  details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

const OperationResult = Schema.Struct({
  ok: Schema.Boolean,
  character: Schema.optional(Character),
  crew: Schema.optional(Crew),
  clock: Schema.optional(Clock),
  applied: Schema.Struct({
    op: Schema.String,
    requested: Schema.optional(Schema.Int),
    effective: Schema.optional(Schema.Int),
    landedIntensity: Schema.optional(HarmIntensity),
  }),
  sideEffects: Schema.Array(Schema.String),
  error: Schema.Union(Schema.Null, ErrorObject),
  batch: Schema.optional(
    Schema.Array(
      Schema.Struct({
        ok: Schema.Boolean,
        op: Schema.String,
        error: Schema.optional(Schema.Union(Schema.Null, ErrorObject)),
      }),
    ),
  ),
});

const Health = Schema.Struct({
  status: Schema.Literal("ok"),
  implementation: Schema.Literal("ada", "zero"),
  version: Schema.String,
  dataDir: Schema.String,
});

const CharacterSummary = Schema.Struct({
  id: Uuid,
  name: Schema.String,
  alias: Schema.String,
  playbook: Schema.String,
  gameStem: Schema.String,
  crewId: Schema.String,
  stress: NonNegativeInt,
  traumas: Schema.Array(Schema.String),
  isRetired: Schema.Boolean,
  isDeadish: Schema.Boolean,
  revision: Revision,
});

const CrewSummary = Schema.Struct({
  id: Uuid,
  name: Schema.String,
  crewType: Schema.String,
  gameStem: Schema.String,
  tier: NonNegativeInt,
  heat: NonNegativeInt,
  wanted: NonNegativeInt,
  rep: NonNegativeInt,
  hold: Hold,
  memberCount: NonNegativeInt,
  revision: Revision,
});

const HistoryEntry = Schema.Struct({
  snapshotId: Schema.String.pipe(Schema.pattern(/^[0-9]{17}-[A-Za-z0-9]+$/)),
  takenAt: Timestamp,
  op: Schema.String,
});

const Campaign = Schema.Struct({
  kind: Schema.Literal("campaign"),
  name: Schema.String,
  gameStem: GameStem,
  createdAt: Timestamp,
  formatVersion: FormatVersion,
});

const GameSummary = Schema.Struct({
  name: Schema.String,
  stem: Schema.String,
  language: Schema.String,
});

export const Schemas = {
  Character,
  Crew,
  Clock,
  OperationResult,
  Health,
  CharacterSummary,
  CrewSummary,
  Roster: Schema.Struct({ characters: Schema.Array(CharacterSummary), crews: Schema.Array(CrewSummary) }),
  History: Schema.Array(HistoryEntry),
  HistoryEntry,
  CharacterSummaryList: Schema.Array(CharacterSummary),
  CrewSummaryList: Schema.Array(CrewSummary),
  ClockList: Schema.Array(Clock),
  Campaign,
  GameList: Schema.Array(GameSummary),
  SummaryList: Schema.Array(Schema.Union(CharacterSummary, CrewSummary)),
  JsonArray: Schema.Array(Schema.Unknown),
  JsonObject: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
};

export type CharacterDto = Schema.Schema.Type<typeof Character>;
export type CrewDto = Schema.Schema.Type<typeof Crew>;
export type ClockDto = Schema.Schema.Type<typeof Clock>;
export type OperationResultDto = Schema.Schema.Type<typeof OperationResult>;

export function decode<A>(schema: Schema.Schema<A, any, any>, value: unknown): Promise<A> {
  // Every frozen schema sets `additionalProperties: false`; reject excess
  // properties exactly like the JSON Schemas do (AUDIT-0 BUG-013).
  return Effect.runPromise(
    Schema.decodeUnknown(schema, { onExcessProperty: "error" })(value) as Effect.Effect<A, unknown, never>,
  );
}
