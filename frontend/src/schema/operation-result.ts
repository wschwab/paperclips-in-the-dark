import { Schema } from "effect";
import { Character } from "./character.js";
import { Clock } from "./clock.js";
import { ErrorCode, HarmIntensity } from "./common.js";
import { Crew } from "./crew.js";

const Applied = Schema.Struct({
  op: Schema.String,
  requested: Schema.optional(Schema.Number.pipe(Schema.int())),
  effective: Schema.optional(Schema.Number.pipe(Schema.int())),
  landedIntensity: Schema.optional(HarmIntensity),
});

const ErrorObject = Schema.Struct({
  code: ErrorCode,
  message: Schema.String,
  details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

const OpError = Schema.NullOr(ErrorObject);

const BatchItem = Schema.Struct({
  ok: Schema.Boolean,
  op: Schema.String,
  error: Schema.optional(OpError),
});

/**
 * Uniform operation response — mirrors contract/schemas/operation-result.json.
 * Exactly one of character/crew/clock is present when ok=true and the op
 * targets an entity; none on pure failures.
 */
export const OperationResult = Schema.Struct({
  ok: Schema.Boolean,
  character: Schema.optional(Character),
  crew: Schema.optional(Crew),
  clock: Schema.optional(Clock),
  applied: Applied,
  sideEffects: Schema.Array(Schema.String),
  error: OpError,
  batch: Schema.optional(Schema.Array(BatchItem)),
}).pipe(Schema.annotations({ identifier: "OperationResult" }));

export type OperationResult = typeof OperationResult.Type;

export const decodeOperationResult = Schema.decodeUnknownSync(OperationResult);
export const decodeOperationResultEither =
  Schema.decodeUnknownEither(OperationResult);
