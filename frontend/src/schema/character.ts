import { Schema } from "effect";
import {
  BoundedInteger,
  Closeness,
  Commitment,
  CrewIdRef,
  Experience,
  FormatVersion,
  GameStem,
  NamedDescription,
  Revision,
  Timestamp,
  Uuid,
} from "./common.js";

const GearItem = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  bulk: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
});

const GearItems = Schema.Array(GearItem);

const Trauma = Schema.Struct({
  traumas: Schema.Array(Schema.String),
  max: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});

const HealingClock = Schema.Struct({
  segments: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  size: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  rollover: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
});

const Harm = Schema.Struct({
  lesser: Schema.Array(Schema.String),
  moderate: Schema.Array(Schema.String),
  severe: Schema.Array(Schema.String),
  fatal: Schema.Array(Schema.String),
  healingClock: HealingClock,
});

const Armor = Schema.Struct({
  standardUsed: Schema.Boolean,
  heavyUsed: Schema.Boolean,
  specialUsed: Schema.Boolean,
  hasStandard: Schema.Boolean,
  hasHeavy: Schema.Boolean,
  hasSpecial: Schema.Boolean,
});

const Monitor = Schema.Struct({
  stress: BoundedInteger,
  trauma: Trauma,
  harm: Harm,
  armor: Armor,
});

const Dossier = Schema.Struct({
  name: Schema.String,
  crewId: CrewIdRef,
  alias: Schema.String,
  look: Schema.String,
  notes: Schema.String,
  background: NamedDescription,
  heritage: NamedDescription,
  vice: NamedDescription,
});

const Action = Schema.Struct({
  name: Schema.String,
  rating: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  maxRating: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});

const Attribute = Schema.Struct({
  name: Schema.String,
  experience: Experience,
  actions: Schema.Array(Action),
});

const Talent = Schema.Struct({
  attributes: Schema.Array(Attribute),
});

const Ability = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  timesTaken: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});

const Playbook = Schema.Struct({
  name: Schema.String,
  experience: Experience,
  abilities: Schema.Array(Ability),
});

const Gear = Schema.Struct({
  loadout: GearItems,
  availableGear: GearItems,
  commitment: Commitment,
  isCommitmentLocked: Schema.Boolean,
  maxBulk: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
});

const CoinPurse = Schema.Struct({
  coins: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  max: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
});

const Fund = Schema.Struct({
  satchel: CoinPurse,
  stash: CoinPurse,
});

const Friend = Schema.Struct({
  entry: Schema.String.pipe(Schema.minLength(1)),
  closeness: Closeness,
});

const Rolodex = Schema.Struct({
  friends: Schema.Array(Friend),
});

const Session = Schema.Struct({
  playbookExpressions: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
  ),
  characterExpressions: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
  ),
  struggleExpressions: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(0),
  ),
  max: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
});

/** Full character DTO — mirrors contract/schemas/character.json */
export const Character = Schema.Struct({
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
  dossier: Dossier,
  monitor: Monitor,
  talent: Talent,
  playbook: Playbook,
  gear: Gear,
  fund: Fund,
  rolodex: Rolodex,
  session: Session,
  notebook: Schema.String,
}).pipe(Schema.annotations({ identifier: "Character" }));

export type Character = typeof Character.Type;

export const decodeCharacter = Schema.decodeUnknownSync(Character);
export const decodeCharacterEither = Schema.decodeUnknownEither(Character);
