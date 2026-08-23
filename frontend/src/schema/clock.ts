import { Schema } from "effect";
import {
  FormatVersion,
  Revision,
  Timestamp,
  Uuid,
} from "./common.js";

const ClockOwnerKind = Schema.Literal("campaign", "character", "crew");
const ClockPurpose = Schema.Literal(
  "progress",
  "danger",
  "racing",
  "linked",
  "mission",
  "tug-of-war",
  "long-term-project",
  "faction",
  "score",
  "custom",
);
const ClockBehavior = Schema.Literal("bounded", "rollover");

/** Full clock DTO — current contract response shape only. */
export const Clock = Schema.Struct({
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
  segments: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  size: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  rollover: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  relatedClockIds: Schema.Array(Uuid),
}).pipe(Schema.annotations({ identifier: "Clock" }));

export type Clock = typeof Clock.Type;

export const decodeClock = Schema.decodeUnknownSync(Clock, { onExcessProperty: "error" });
export const decodeClockEither = Schema.decodeUnknownEither(Clock, { onExcessProperty: "error" });

/** Clock list row — current campaign.json#/$defs/clockSummary shape only. */
export const ClockSummary = Schema.Struct({
  kind: Schema.Literal("clock"),
  id: Uuid,
  name: Schema.String,
  ownerKind: ClockOwnerKind,
  ownerId: Schema.String,
  purpose: ClockPurpose,
  behavior: ClockBehavior,
  segments: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  size: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  rollover: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  relatedClockIds: Schema.Array(Uuid),
  isReadable: Schema.Boolean,
  isRepairable: Schema.Boolean,
  isComplete: Schema.Boolean,
  deleteToken: Schema.String.pipe(Schema.pattern(/^(sha256:[0-9a-f]{64})?$/)),
}).pipe(Schema.annotations({ identifier: "ClockSummary" }));

export type ClockSummary = typeof ClockSummary.Type;

export const decodeClockSummary = Schema.decodeUnknownSync(ClockSummary, {
  onExcessProperty: "error",
});
export const decodeClockSummaryEither = Schema.decodeUnknownEither(ClockSummary, {
  onExcessProperty: "error",
});
