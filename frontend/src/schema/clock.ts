import { Schema } from "effect";
import {
  FormatVersion,
  Revision,
  Timestamp,
  Uuid,
} from "./common.js";

/** Full clock DTO — mirrors contract/schemas/clock.json */
export const Clock = Schema.Struct({
  kind: Schema.Literal("clock"),
  id: Uuid,
  revision: Revision,
  formatVersion: FormatVersion,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  name: Schema.String,
  clockKind: Schema.Literal("project", "rollover"),
  segments: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  size: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  rollover: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
}).pipe(Schema.annotations({ identifier: "Clock" }));

export type Clock = typeof Clock.Type;

export const decodeClock = Schema.decodeUnknownSync(Clock);
export const decodeClockEither = Schema.decodeUnknownEither(Clock);
