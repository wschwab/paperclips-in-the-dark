import { Schema } from "effect";
import { Character } from "./character.js";
import { Clock } from "./clock.js";
import { HarmIntensity } from "./common.js";
import { Crew } from "./crew.js";

// ---------------------------------------------------------------------------
// Whole-error union (contract/schemas/operation-result.json#/$defs/operationError)
//
// One branch per errorCode, discriminated on `code`; every branch declares
// code, status (the locked HTTP status the error is delivered with), message,
// retryable, recovery, and the typed per-code details. `entity` is optional
// on VALIDATION/NOT_FOUND/STALE_REVISION (present when the op-level failure
// can still return the current DTO), required on the 200 domain-failure
// branches, and absent elsewhere. Top-level error and batch[].error share
// this schema; `error` is null on success. Mirrors
// conformance/src/schemas.ts (frozen contract).
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
const ErrorLimitDetails = Schema.Struct({
  limit: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  current: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
});
const ErrorFundsDetails = Schema.Struct({
  available: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  needed: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});
const ErrorPreviewDetails = Schema.Struct({
  warnings: Schema.Array(Schema.String),
  previewToken: Schema.String.pipe(Schema.minLength(1)),
});
const ErrorContentToken = Schema.String.pipe(Schema.pattern(/^sha256:[0-9a-f]{64}$/));
// STALE_REVISION details are a contract `oneOf` (currentRevision XOR
// currentContentToken). The frozen reference models them as a strict union,
// but frontend/src/api/client.ts (out of SC-F1 scope) reads
// `error.details.currentRevision` directly. Model the pair as a flat
// optional-fields struct so the decoded type stays client-accessible while
// still rejecting undeclared keys and typing both members. The server always
// sends exactly one partner; a client decoder need not enforce exclusivity.
const ErrorStaleDetails = Schema.Struct({
  currentRevision: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  ),
  currentContentToken: Schema.optional(ErrorContentToken),
});
/** Branches whose details is an empty object (additionalProperties: false). */
const EmptyDetails = Schema.Struct({});

const Entity = Schema.Union(Character, Crew, Clock);

const opError = <C extends string, S extends number, D extends Schema.Schema<any, any, any>>(
  code: C,
  status: S,
  details: D,
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

const Applied = Schema.Struct({
  op: Schema.String,
  requested: Schema.optional(Schema.Number.pipe(Schema.int())),
  effective: Schema.optional(Schema.Number.pipe(Schema.int())),
  // clock.progress requested/effective families (SC-O5): progress accepted
  // onto the clock itself and overflow rolled into the existing overflow.
  visibleApplied: Schema.optional(Schema.Number.pipe(Schema.int())),
  overflowAdded: Schema.optional(Schema.Number.pipe(Schema.int())),
  landedIntensity: Schema.optional(HarmIntensity),
});

/**
 * Uniform operation response — mirrors contract/schemas/operation-result.json.
 * Exactly one of character/crew/clock is present when ok=true and the op
 * targets an entity; none on pure failures. canUndo/historyCount are derived,
 * entity-targeted-only fields (never stored).
 */
export const OperationResult = Schema.Struct({
  ok: Schema.Boolean,
  character: Schema.optional(Character),
  crew: Schema.optional(Crew),
  clock: Schema.optional(Clock),
  canUndo: Schema.optional(Schema.Boolean),
  historyCount: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  ),
  applied: Applied,
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
}).pipe(Schema.annotations({ identifier: "OperationResult" }));

export type OperationResult = typeof OperationResult.Type;

export const decodeOperationResult = Schema.decodeUnknownSync(OperationResult, {
  onExcessProperty: "error",
});
export const decodeOperationResultEither = Schema.decodeUnknownEither(OperationResult, {
  onExcessProperty: "error",
});
