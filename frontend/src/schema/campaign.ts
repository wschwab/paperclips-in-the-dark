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

export const decodeHealth = Schema.decodeUnknownSync(Health);
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
}).pipe(Schema.annotations({ identifier: "CharacterSummary" }));

export type CharacterSummary = typeof CharacterSummary.Type;

export const CrewSummary = Schema.Struct({
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
}).pipe(Schema.annotations({ identifier: "CrewSummary" }));

export type CrewSummary = typeof CrewSummary.Type;

/** GET /api/campaign/roster */
export const Roster = Schema.Struct({
  characters: Schema.Array(CharacterSummary),
  crews: Schema.Array(CrewSummary),
}).pipe(Schema.annotations({ identifier: "Roster" }));

export type Roster = typeof Roster.Type;

export const decodeRoster = Schema.decodeUnknownSync(Roster);
export const decodeRosterEither = Schema.decodeUnknownEither(Roster);

export const HistoryEntry = Schema.Struct({
  snapshotId: Schema.String.pipe(Schema.pattern(/^[0-9]{17}-[A-Za-z0-9]+$/)),
  takenAt: Timestamp,
  op: Schema.String,
}).pipe(Schema.annotations({ identifier: "HistoryEntry" }));

export type HistoryEntry = typeof HistoryEntry.Type;
