import { Schema } from "effect";
import {
  BoundedInteger,
  CohortHarm,
  CohortType,
  Experience,
  FormatVersion,
  Notes,
  GameStem,
  Hold,
  Revision,
  Timestamp,
  Uuid,
} from "./common.js";

const SpecialAbility = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  timesTaken: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});

const Upgrade = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  boxesMarked: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});

const Contact = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  profession: Schema.optional(Schema.String),
});

const Faction = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  status: Schema.Number.pipe(Schema.int()),
});

const Cohort = Schema.Struct({
  id: Uuid,
  cohortKind: CohortType,
  gangType: Schema.String,
  expertType: Schema.String,
  quality: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  scale: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  hasArmor: Schema.Boolean,
  edges: Schema.Array(Schema.String),
  flaws: Schema.Array(Schema.String),
  harm: CohortHarm,
  description: Schema.String,
});

/** Full crew DTO — mirrors contract/schemas/crew.json */
export const Crew = Schema.Struct({
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
  tier: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  hold: Hold,
  heat: BoundedInteger,
  wanted: BoundedInteger,
  rep: BoundedInteger,
  experience: Experience,
  specialAbilities: Schema.Array(SpecialAbility),
  upgrades: Schema.Array(Upgrade),
  cohorts: Schema.Array(Cohort),
  contacts: Schema.optional(Schema.Array(Contact)),
  factions: Schema.optional(Schema.Array(Faction)),
  coin: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  stash: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  notes: Notes,
}).pipe(Schema.annotations({ identifier: "Crew" }));

export type Crew = typeof Crew.Type;

export const decodeCrew = Schema.decodeUnknownSync(Crew);
export const decodeCrewEither = Schema.decodeUnknownEither(Crew);
