import { Schema } from "effect";

/** UUIDv4 — mirrors common.json#/$defs/uuid */
export const Uuid = Schema.String.pipe(
  Schema.pattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  ),
  Schema.annotations({ identifier: "Uuid" }),
);
export type Uuid = typeof Uuid.Type;

/** ISO-8601 UTC timestamp string */
export const Timestamp = Schema.String.pipe(
  Schema.annotations({ identifier: "Timestamp" }),
);
export type Timestamp = typeof Timestamp.Type;

export const Revision = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
  Schema.annotations({ identifier: "Revision" }),
);
export type Revision = typeof Revision.Type;

export const FormatVersion = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
  Schema.annotations({ identifier: "FormatVersion" }),
);
export type FormatVersion = typeof FormatVersion.Type;

export const BoundedInteger = Schema.Struct({
  current: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  max: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
}).pipe(Schema.annotations({ identifier: "BoundedInteger" }));
export type BoundedInteger = typeof BoundedInteger.Type;

export const Experience = Schema.Struct({
  points: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  max: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
}).pipe(Schema.annotations({ identifier: "Experience" }));
export type Experience = typeof Experience.Type;

export const ClockState = Schema.Struct({
  segments: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  size: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
}).pipe(Schema.annotations({ identifier: "ClockState" }));
export type ClockState = typeof ClockState.Type;

export const NamedDescription = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
}).pipe(Schema.annotations({ identifier: "NamedDescription" }));
export type NamedDescription = typeof NamedDescription.Type;

export const HarmIntensity = Schema.Literal(
  "lesser",
  "moderate",
  "severe",
  "fatal",
);
export type HarmIntensity = typeof HarmIntensity.Type;

export const Closeness = Schema.Literal("friend", "close-friend", "rival");
export type Closeness = typeof Closeness.Type;

export const Commitment = Schema.Literal(
  "none",
  "light",
  "normal",
  "heavy",
  "encumbered",
);
export type Commitment = typeof Commitment.Type;

export const Hold = Schema.Literal("strong", "weak");
export type Hold = typeof Hold.Type;

export const CohortType = Schema.Literal("gang", "expert");
export type CohortType = typeof CohortType.Type;

export const CohortHarm = Schema.Literal(
  "healthy",
  "weakened",
  "impaired",
  "broken",
  "dead",
);
export type CohortHarm = typeof CohortHarm.Type;

export const ErrorCode = Schema.Literal(
  "NOT_FOUND",
  "VALIDATION",
  "STALE_REVISION",
  "RETIRED",
  "CONFIRM_REQUIRED",
  "DUPLICATE",
  "SLOT_FULL_FATAL",
  "CANNOT_HEAL",
  "ARMOR_NOT_AVAILABLE",
  "ABILITY_MAXED",
  "CANNOT_LEVEL_UP",
  "RATING_MAXED",
  "UPGRADE_MAXED",
  "INSUFFICIENT_FUNDS",
  "SATCHEL_FULL",
  "OVER_BULK",
  "NO_COMMITMENT",
  "COMMITMENT_LOCKED",
  "NO_HISTORY",
  "GAME_NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
);
export type ErrorCode = typeof ErrorCode.Type;

export const GameStem = Schema.String.pipe(
  Schema.pattern(/^[A-Za-z0-9-]+$/),
  Schema.annotations({ identifier: "GameStem" }),
);
export type GameStem = typeof GameStem.Type;

/** crewId on dossier: empty string or UUIDv4 */
export const CrewIdRef = Schema.String.pipe(
  Schema.pattern(
    /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/,
  ),
  Schema.annotations({ identifier: "CrewIdRef" }),
);
export type CrewIdRef = typeof CrewIdRef.Type;
