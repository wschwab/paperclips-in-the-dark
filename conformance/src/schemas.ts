import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { validateInlineOrThrow, validateOrThrow } from "./contract-validator.js";
import { getResponseDisposition } from "./endpoint-schema-map.js";

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

/** common.json#/$defs/formatVersion — const 1 (pre-release v1, redefined in place; future versions rejected). */
const FormatVersion = Schema.Literal(1);

const NonNegativeInt = Schema.NonNegativeInt;
const PositiveInt = Schema.Int.pipe(Schema.greaterThanOrEqualTo(1));
const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

const HarmIntensity = Schema.Literal("lesser", "moderate", "severe", "fatal");
const Closeness = Schema.Literal("friend", "close-friend", "rival");
const Commitment = Schema.Literal("none", "light", "normal", "heavy", "encumbered");
const Hold = Schema.Literal("strong", "weak");
const CohortType = Schema.Literal("gang", "expert");
const CohortHarm = Schema.Literal("healthy", "weakened", "impaired", "broken", "dead");
const ClockBehavior = Schema.Literal("bounded", "rollover");
const ClockOwnerKind = Schema.Literal("campaign", "character", "crew");
const ClockPurpose = Schema.Literal(
  "progress", "danger", "racing", "linked", "mission", "tug-of-war",
  "long-term-project", "faction", "score", "custom",
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
  traumaPending: Schema.Boolean,
  isOutOfAction: Schema.Boolean,
  stressClearPending: Schema.Boolean,
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
  // CONTRACT-04 (crew.json, 2026-08-25): write-time derived from the crew's
  // own Vault marks and validated settings — persisted canonical integer.
  stashCapacity: NonNegativeInt,
  notes: Notes,
  turf: NonNegativeInt, // crew.json (2026-08-09): no hardcoded upper bound — TurfMax is authoritative from game settings (R4)
  // Wave 2 contract (crew.json, 2026-08-10): contacts/factions are required
  // canonical arrays (Q4); empty means no entries. C3-era crews lacking them
  // normalize to [] (legacy rule L6), so every stored crew carries them.
  contacts: Schema.Array(Schema.Struct({ name: NonEmptyString, profession: Schema.String })),
  factions: Schema.Array(Schema.Struct({ name: NonEmptyString, status: Schema.Int })),
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

// ---------------------------------------------------------------------------
// Clock — current contract response shape only.
// Legacy clock conversion belongs to import/repair normalization, never to
// ordinary response decoding.
// ---------------------------------------------------------------------------

const Clock = Schema.Struct({
  kind: Schema.Literal("clock"),
  id: Uuid,
  revision: Revision,
  formatVersion: FormatVersion,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  name: Schema.String,
  ownerKind: ClockOwnerKind,
  ownerId: Schema.String,
  purpose: ClockPurpose,
  behavior: ClockBehavior,
  segments: NonNegativeInt,
  size: PositiveInt,
  rollover: NonNegativeInt,
  relatedClockIds: Schema.Array(Uuid),
});

// ---------------------------------------------------------------------------
// Whole-error union (contract/schemas/operation-result.json#/$defs/operationError)
//
// One branch per errorCode, discriminated on `code`; every branch declares
// code, status (the locked HTTP status the error is delivered with), message,
// retryable, recovery, and the typed per-code details. `entity` is optional
// on VALIDATION/NOT_FOUND/STALE_REVISION (present when the op-level failure
// can still return the current DTO), required on the 200 domain-failure
// branches, and absent elsewhere. Top-level error and batch[].error share
// this schema; `error` is null on success.
// ---------------------------------------------------------------------------

const ErrorPointer = Schema.String.pipe(Schema.pattern(/^(|\/.*)$/));
const ErrorIssue = Schema.Struct({
  pointer: ErrorPointer,
  reason: Schema.String,
  expected: Schema.String,
});
const ErrorPointerDetails = Schema.Struct({
  issues: Schema.Array(ErrorIssue).pipe(Schema.minItems(1)),
});
const ErrorLimitDetails = Schema.Struct({ limit: NonNegativeInt, current: NonNegativeInt });
const ErrorFundsDetails = Schema.Struct({ available: NonNegativeInt, needed: NonNegativeInt });
const ErrorPreviewDetails = Schema.Struct({
  warnings: Schema.Array(Schema.String),
  previewToken: Schema.String.pipe(Schema.minLength(1)),
});
const ErrorContentToken = Schema.String.pipe(Schema.pattern(/^sha256:[0-9a-f]{64}$/));
const ErrorStaleDetails = Schema.Union(
  Schema.Struct({ currentRevision: Revision }),
  Schema.Struct({ currentContentToken: ErrorContentToken }),
);
/** Branches whose details is an empty object (additionalProperties: false). */
const EmptyDetails = Schema.Struct({});

const Entity = Schema.Union(Character, Crew, Clock);

const opError = <C extends string, S extends number>(
  code: C,
  status: S,
  details: Schema.Schema<any, any, any>,
  entity: "required" | "optional" | "none" = "none",
) =>
  Schema.Struct({
    code: Schema.Literal(code),
    status: Schema.Literal(status),
    message: Schema.String,
    retryable: Schema.Boolean,
    recovery: Schema.String,
    details,
    ...(entity === "required"
      ? { entity: Entity }
      : entity === "optional"
        ? { entity: Schema.optional(Entity) }
        : {}),
  });

const NormalizationRequiredError = Schema.Struct({
  code: Schema.Literal("NORMALIZATION_REQUIRED"),
  status: Schema.Literal(409),
  message: Schema.String,
  retryable: Schema.Boolean,
  recovery: Schema.String,
  details: ErrorPreviewDetails,
  preview: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  token: Schema.String.pipe(Schema.minLength(1)),
});

const OperationErrorNewShape = Schema.Union(
  opError("VALIDATION", 400, ErrorPointerDetails, "optional"),
  opError("INVALID_ENTRY", 400, ErrorPointerDetails),
  opError("INVALID_ENTITY", 422, ErrorPointerDetails),
  NormalizationRequiredError,
  opError("NOT_FOUND", 404, EmptyDetails, "optional"),
  opError("STALE_REVISION", 409, ErrorStaleDetails, "optional"),
  opError("RETIRED", 200, EmptyDetails, "optional"),
  opError("CONFIRM_REQUIRED", 200, EmptyDetails, "required"),
  opError("DUPLICATE", 200, EmptyDetails, "required"),
  opError("SLOT_FULL_FATAL", 200, EmptyDetails, "required"),
  opError("CANNOT_HEAL", 200, ErrorLimitDetails, "required"),
  opError("ARMOR_NOT_AVAILABLE", 200, EmptyDetails, "required"),
  opError("ABILITY_MAXED", 200, ErrorLimitDetails, "required"),
  opError("CANNOT_LEVEL_UP", 200, ErrorLimitDetails, "required"),
  opError("RATING_MAXED", 200, ErrorLimitDetails, "required"),
  opError("UPGRADE_MAXED", 200, ErrorLimitDetails, "required"),
  opError("INSUFFICIENT_FUNDS", 200, ErrorFundsDetails, "required"),
  opError("SATCHEL_FULL", 200, ErrorLimitDetails, "required"),
  opError("OVER_BULK", 200, ErrorLimitDetails, "required"),
  opError("NO_COMMITMENT", 200, EmptyDetails, "required"),
  opError("COMMITMENT_LOCKED", 200, EmptyDetails, "required"),
  opError("NO_HISTORY", 200, EmptyDetails, "required"),
  opError("GAME_NOT_FOUND", 200, EmptyDetails),
  opError("PAYLOAD_TOO_LARGE", 413, ErrorLimitDetails),
  opError("TRAUMA_REQUIRED", 200, EmptyDetails, "required"),
  opError("OUT_OF_ACTION", 200, EmptyDetails, "required"),
);

const OperationError = OperationErrorNewShape;

const OperationResult = Schema.Struct({
  ok: Schema.Boolean,
  character: Schema.optional(Character),
  crew: Schema.optional(Crew),
  clock: Schema.optional(Clock),
  applied: Schema.Struct({
    op: Schema.String,
    requested: Schema.optional(Schema.Int),
    effective: Schema.optional(Schema.Int),
    visibleApplied: Schema.optional(Schema.Int),
    overflowAdded: Schema.optional(Schema.Int),
    landedIntensity: Schema.optional(HarmIntensity),
  }),
  sideEffects: Schema.Array(Schema.String),
  error: Schema.Union(Schema.Null, OperationError),
  batch: Schema.optional(
    Schema.Array(
      Schema.Struct({
        ok: Schema.Boolean,
        op: Schema.String,
        error: Schema.optional(Schema.Union(Schema.Null, OperationError)),
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
  kind: Schema.Literal("character"),
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
  isReadable: Schema.Boolean,
  isRepairable: Schema.Boolean,
  isComplete: Schema.Boolean,
  deleteToken: Schema.String.pipe(Schema.pattern(/^(sha256:[0-9a-f]{64})?$/)),
  canUndo: Schema.Boolean,
  historyCount: NonNegativeInt,
});

const CrewSummary = Schema.Struct({
  kind: Schema.Literal("crew"),
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
  isReadable: Schema.Boolean,
  isRepairable: Schema.Boolean,
  isComplete: Schema.Boolean,
  deleteToken: Schema.String.pipe(Schema.pattern(/^(sha256:[0-9a-f]{64})?$/)),
  canUndo: Schema.Boolean,
  historyCount: NonNegativeInt,
});

const HistoryEntry = Schema.Struct({
  snapshotId: Schema.String.pipe(Schema.pattern(/^[0-9]{17}-[A-Za-z0-9]+$/)),
  takenAt: Timestamp,
  op: Schema.String,
});

const ClockSummary = Schema.Struct({
  kind: Schema.Literal("clock"),
  id: Uuid,
  name: Schema.String,
  ownerKind: ClockOwnerKind,
  ownerId: Schema.String,
  purpose: ClockPurpose,
  behavior: ClockBehavior,
  segments: NonNegativeInt,
  size: PositiveInt,
  rollover: NonNegativeInt,
  relatedClockIds: Schema.Array(Uuid),
  // E11 total collections (campaign.json#/$defs/clockSummary): every clock
  // list row carries readability/repair/completion state; deleteToken is ""
  // for readable rows and the sha256 content token for degraded rows. The
  // summary schema is strict (no Wave-3 tolerance — the rows are new).
  isReadable: Schema.Boolean,
  isRepairable: Schema.Boolean,
  isComplete: Schema.Boolean,
  deleteToken: Schema.String.pipe(Schema.pattern(/^(sha256:[0-9a-f]{64})?$/)),
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
  ClockSummaryList: Schema.Array(ClockSummary),
  ClockList: Schema.Array(ClockSummary),
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

// ---------------------------------------------------------------------------
// Endpoint response oracle bridge.
//
// Effect mirrors are strict ordinary decoders. Live response assertions still
// use the mechanically derived OpenAPI disposition plus AJV so endpoint/status
// coverage and the frozen JSON Schemas remain the single response oracle.
// ---------------------------------------------------------------------------


/** Contract schema names (the contract-validator's registry of compiled AJV validators). */
export const SchemaName = {
  Campaign: "campaign",
  Health: "health",
  CharacterSummary: "characterSummary",
  CrewSummary: "crewSummary",
  ClockSummary: "clockSummary",
  Roster: "roster",
  HistoryEntry: "historyEntry",
  Character: "character",
  Crew: "crew",
  Clock: "clock",
  OperationResult: "operationResult",
  OperationError: "operationError",
  PreviewResult: "previewResult",
} as const;

/**
 * Schema names that describe a single list ITEM rather than the whole response.
 * The OpenAPI list endpoints map to the element schema (characterSummary etc.), so
 * validating an array body against them means validating each element.
 */
const ITEM_SCOPED_SCHEMAS: Record<string, true> = {
  characterSummary: true,
  crewSummary: true,
  clockSummary: true,
  historyEntry: true,
};

/**
 * Validate a live response body against the named contract schema. Throws on
 * failure, listing the AJV error pointers/messages. Item-scoped schema names
 * validate each element of an array body (the list-response shape).
 */
export function validateResponse(schemaName: string, value: unknown): void {
  if (ITEM_SCOPED_SCHEMAS[schemaName] && Array.isArray(value)) {
    for (const item of value) {
      validateOrThrow(schemaName, item);
    }
    return;
  }
  validateOrThrow(schemaName, value);
}

/**
 * Validate a live response body against the disposition mechanically derived
 * from the OpenAPI operation and response status.
 */
export function assertResponseValid(
  operationId: string,
  statusValue: number | string,
  value: unknown,
): void {
  const disposition = getResponseDisposition(operationId, statusValue);
  if (disposition.kind === "no-body") {
    if (value !== undefined && value !== null && value !== "") {
      throw new Error(`response body is forbidden for ${operationId} status ${statusValue}`);
    }
    return;
  }
  if (disposition.kind === "inline") {
    validateInlineOrThrow(disposition.schema, value);
    return;
  }
  if (disposition.collection) {
    if (!Array.isArray(value)) {
      throw new Error(`response for ${operationId} status ${statusValue} must be an array`);
    }
    for (const item of value) {
      validateOrThrow(disposition.schemaName, item);
    }
    return;
  }
  validateOrThrow(disposition.schemaName, value);
}
