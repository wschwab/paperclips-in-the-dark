import { Schema } from "effect";
import {
  FormatVersion,
  GameStem,
  Hold,
  Revision,
  Timestamp,
  Uuid,
} from "./common.js";

/** GET /api/health */
export const Health = Schema.Struct({
  status: Schema.Literal("ok"),
  implementation: Schema.Literal("ada", "zero"),
  version: Schema.String,
  dataDir: Schema.String,
}).pipe(Schema.annotations({ identifier: "Health" }));

export type Health = typeof Health.Type;

export const decodeHealth = Schema.decodeUnknownSync(Health, { onExcessProperty: "error" });
export const decodeHealthEither = Schema.decodeUnknownEither(Health);

/** Campaign metadata (campaign.json on disk) */
export const Campaign = Schema.Struct({
  kind: Schema.Literal("campaign"),
  name: Schema.String,
  gameStem: GameStem,
  createdAt: Timestamp,
  formatVersion: FormatVersion,
}).pipe(Schema.annotations({ identifier: "Campaign" }));

export type Campaign = typeof Campaign.Type;

export const decodeCampaign = Schema.decodeUnknownSync(Campaign);

export const CharacterSummary = Schema.Struct({
  kind: Schema.Literal("character"),
  id: Uuid,
  name: Schema.String,
  alias: Schema.String,
  playbook: Schema.String,
  gameStem: Schema.String,
  crewId: Schema.String,
  stress: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  traumas: Schema.Array(Schema.String),
  isRetired: Schema.Boolean,
  isDeadish: Schema.Boolean,
  revision: Revision,
  // E11 total collections (campaign.json#/$defs/characterSummary): every row
  // carries readability/repair/undo state; deleteToken is "" for readable rows.
  // Wave 3 tolerance: lagging roster rows omit these; canonical defaults fill
  // in (a readable, repairable-free, complete-free row with no history), while
  // present values must still be typed exactly.
  isReadable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  isRepairable: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  isComplete: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  deleteToken: Schema.optionalWith(
    Schema.String.pipe(Schema.pattern(/^(sha256:[0-9a-f]{64})?$/)),
    { default: () => "" },
  ),
  canUndo: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  historyCount: Schema.optionalWith(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
    { default: () => 0 },
  ),
}).pipe(Schema.annotations({ identifier: "CharacterSummary" }));

export type CharacterSummary = typeof CharacterSummary.Type;

export const CrewSummary = Schema.Struct({
  kind: Schema.Literal("crew"),
  id: Uuid,
  name: Schema.String,
  crewType: Schema.String,
  gameStem: Schema.String,
  tier: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  heat: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  wanted: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  rep: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  hold: Hold,
  memberCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  revision: Revision,
  // E11 total collections (campaign.json#/$defs/crewSummary): same readable/
  // repair/undo state fields and Wave-3 defaults as CharacterSummary.
  isReadable: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  isRepairable: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  isComplete: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  deleteToken: Schema.optionalWith(
    Schema.String.pipe(Schema.pattern(/^(sha256:[0-9a-f]{64})?$/)),
    { default: () => "" },
  ),
  canUndo: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  historyCount: Schema.optionalWith(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
    { default: () => 0 },
  ),
}).pipe(Schema.annotations({ identifier: "CrewSummary" }));

export type CrewSummary = typeof CrewSummary.Type;

/** GET /api/campaign/roster */
export const Roster = Schema.Struct({
  characters: Schema.Array(CharacterSummary),
  crews: Schema.Array(CrewSummary),
}).pipe(Schema.annotations({ identifier: "Roster" }));

export type Roster = typeof Roster.Type;

export const decodeRoster = Schema.decodeUnknownSync(Roster, { onExcessProperty: "error" });
export const decodeRosterEither = Schema.decodeUnknownEither(Roster, {
  onExcessProperty: "error",
});

export const HistoryEntry = Schema.Struct({
  // C#-era snapshots were "<17-digit-ticks>-<id>"; the Ada server emits UUIDs
  // (e.g. 22a96212-1d82-45c5-8116-245196a8150b). Accept any non-empty string.
  snapshotId: Schema.String.pipe(Schema.minLength(1)),
  takenAt: Timestamp,
  op: Schema.String,
}).pipe(Schema.annotations({ identifier: "HistoryEntry" }));

export type HistoryEntry = typeof HistoryEntry.Type;

export const decodeHistoryEntry = Schema.decodeUnknownSync(HistoryEntry, {
  onExcessProperty: "error",
});
export const decodeHistoryEntryEither = Schema.decodeUnknownEither(HistoryEntry, {
  onExcessProperty: "error",
});
