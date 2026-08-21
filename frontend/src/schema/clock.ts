import { Schema } from "effect";
import {
  FormatVersion,
  Revision,
  Timestamp,
  Uuid,
} from "./common.js";

// ---------------------------------------------------------------------------
// Frozen clock metadata (contract/schemas/clock.json)
//
// The frozen clock DTO drops the legacy `clockKind` enum in favour of
// `behavior` ("bounded" | "rollover") and adds ownerKind/ownerId/purpose/
// relatedClockIds. The decode path accepts BOTH the frozen canonical shape
// (`behavior` present, written by the current API) and the legacy Wave-2
// shape (`clockKind` present, written by older runtimes), mapping clockKind
// exactly like the contract's write-boundary normalization (project →
// bounded, rollover → rollover; a present canonical `behavior` always wins).
//
// The OUTPUT keeps a derived `clockKind` ("project" for bounded) in addition
// to the frozen metadata: frontend pages (frontend/src/pages) read
// `clock.clockKind` and are out of the SC-F1 edit scope, so the decoded type
// must keep both projections. Unknown keys are still rejected under
// `additionalProperties: false` (strictness is applied at the decode entry
// points via `onExcessProperty: "error"`).
// ---------------------------------------------------------------------------

const LegacyClockKind = Schema.Literal("project", "rollover");
export type ClockKind = typeof LegacyClockKind.Type;

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

const ClockIdentity = {
  kind: Schema.Literal("clock"),
  id: Uuid,
  revision: Revision,
  formatVersion: FormatVersion,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  name: Schema.String,
} as const;

const ClockInput = Schema.Struct({
  ...ClockIdentity,
  ownerKind: ClockOwnerKind,
  ownerId: Schema.String,
  purpose: ClockPurpose,
  behavior: Schema.optional(ClockBehavior),
  clockKind: Schema.optional(LegacyClockKind),
  segments: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  size: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  rollover: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  relatedClockIds: Schema.Array(Uuid),
});

const ClockOutput = Schema.Struct({
  ...ClockIdentity,
  ownerKind: ClockOwnerKind,
  ownerId: Schema.String,
  purpose: ClockPurpose,
  behavior: ClockBehavior,
  clockKind: LegacyClockKind,
  segments: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  size: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  rollover: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  relatedClockIds: Schema.Array(Uuid),
});

const ClockTransformOptions: {
  readonly decode: (
    fromA: Schema.Schema.Type<typeof ClockInput>,
    fromI: Schema.Schema.Encoded<typeof ClockInput>,
  ) => Schema.Schema.Encoded<typeof ClockOutput>;
  readonly encode: (
    toI: Schema.Schema.Encoded<typeof ClockOutput>,
    toA: Schema.Schema.Type<typeof ClockOutput>,
  ) => Schema.Schema.Type<typeof ClockInput>;
  readonly strict?: true;
} = {
  decode: (fromA) => {
    const behavior =
      fromA.behavior ?? (fromA.clockKind === "rollover" ? "rollover" : "bounded");
    return {
      kind: fromA.kind,
      id: fromA.id,
      revision: fromA.revision,
      formatVersion: fromA.formatVersion,
      createdAt: fromA.createdAt,
      updatedAt: fromA.updatedAt,
      name: fromA.name,
      ownerKind: fromA.ownerKind ?? "campaign",
      ownerId: fromA.ownerId ?? "",
      purpose: fromA.purpose ?? "custom",
      behavior,
      clockKind: behavior === "rollover" ? "rollover" : "project",
      segments: fromA.segments,
      size: fromA.size,
      rollover: fromA.rollover,
      relatedClockIds: fromA.relatedClockIds ?? [],
    };
  },
  encode: (toI) => ({
    kind: toI.kind,
    id: toI.id,
    revision: toI.revision,
    formatVersion: toI.formatVersion,
    createdAt: toI.createdAt,
    updatedAt: toI.updatedAt,
    name: toI.name,
    ownerKind: toI.ownerKind,
    ownerId: toI.ownerId,
    purpose: toI.purpose,
    behavior: toI.behavior,
    clockKind: toI.behavior === "rollover" ? "rollover" : "project",
    segments: toI.segments,
    size: toI.size,
    rollover: toI.rollover,
    relatedClockIds: toI.relatedClockIds,
  }),
};

/** Full clock DTO — mirrors contract/schemas/clock.json (with derived clockKind). */
export const Clock = Schema.transform(ClockInput, ClockOutput, ClockTransformOptions).pipe(
  Schema.annotations({ identifier: "Clock" }),
);

export type Clock = typeof Clock.Type;

export const decodeClock = Schema.decodeUnknownSync(Clock, { onExcessProperty: "error" });
export const decodeClockEither = Schema.decodeUnknownEither(Clock, { onExcessProperty: "error" });

// ---------------------------------------------------------------------------
// ClockSummary — listClocks row (campaign.json#/$defs/clockSummary)
//
// The frozen total-collections rule (E11): the clock list projects the
// summary schema, NOT the full Clock DTO — clock fields only (never
// revision/formatVersion/timestamps), plus the readability/repair/completion
// metadata and the deleteToken (sha256 content token usable as the degraded
// row's If-Match value; "" for readable rows). Strict: every field is
// required and typed exactly, excess properties are rejected at the decode
// entry point (the rows never existed pre-Wave-3, so no legacy tolerance).
// The OUTPUT keeps the derived `clockKind` projection like Clock so pages
// render kind from `behavior` without touching the wire shape.
// ---------------------------------------------------------------------------

const ClockSummaryInput = Schema.Struct({
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
});

const ClockSummaryOutput = Schema.Struct({
  ...ClockSummaryInput.fields,
  clockKind: LegacyClockKind,
});

const ClockSummaryTransformOptions: {
  readonly decode: (
    fromA: Schema.Schema.Type<typeof ClockSummaryInput>,
    fromI: Schema.Schema.Encoded<typeof ClockSummaryInput>,
  ) => Schema.Schema.Encoded<typeof ClockSummaryOutput>;
  readonly encode: (
    toI: Schema.Schema.Encoded<typeof ClockSummaryOutput>,
    toA: Schema.Schema.Type<typeof ClockSummaryOutput>,
  ) => Schema.Schema.Type<typeof ClockSummaryInput>;
  readonly strict?: true;
} = {
  decode: (fromA) => ({
    ...fromA,
    clockKind: fromA.behavior === "rollover" ? "rollover" : "project",
  }),
  encode: (toI) => {
    const { clockKind: _clockKind, ...rest } = toI;
    return rest;
  },
};

/** Clock list row — mirrors contract/schemas/campaign.json#/$defs/clockSummary (with derived clockKind). */
export const ClockSummary = Schema.transform(
  ClockSummaryInput,
  ClockSummaryOutput,
  ClockSummaryTransformOptions,
).pipe(Schema.annotations({ identifier: "ClockSummary" }));

export type ClockSummary = typeof ClockSummary.Type;

export const decodeClockSummary = Schema.decodeUnknownSync(ClockSummary, {
  onExcessProperty: "error",
});
export const decodeClockSummaryEither = Schema.decodeUnknownEither(ClockSummary, {
  onExcessProperty: "error",
});
