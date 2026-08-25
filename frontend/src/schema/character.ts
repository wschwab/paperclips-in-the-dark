import { Schema } from "effect";
import {
  BoundedInteger,
  Commitment,
  ContactCloseness,
  CrewIdRef,
  Experience,
  Notes,
  FormatVersion,
  GameStem,
  NamedDescription,
  Revision,
  Timestamp,
  Uuid,
} from "./common.js";
import {
  CHARACTER_COMPLETENESS_RECORDS,
  findIncompleteRecords,
  isComplete,
  type CompletenessRecord,
} from "./generated/completeness.js";

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

/**
 * Vice (C4 playtest change): gains a purveyor { name, description }. The
 * purveyor menu is fed from game data Vices[].Sources (bladesintheday.com:
 * stress track with vice below it).
 */
const Vice = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  purveyor: Schema.Struct({
    name: Schema.String,
    description: Schema.String,
  }),
});

const Dossier = Schema.Struct({
  name: Schema.String,
  crewId: CrewIdRef,
  alias: Schema.String,
  look: Schema.String,
  notes: Notes,
  background: NamedDescription,
  heritage: NamedDescription,
  vice: Vice,
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


/**
 * CONTRACT-05 (2026-08-25 correction): one per-scoundrel contact — the
 * single relationship family evolved from the former rolodex surface.
 * closeness: friend | contact | rival.
 */
export const Contact = Schema.Struct({
  id: Uuid,
  name: Schema.String.pipe(Schema.minLength(1)),
  closeness: ContactCloseness,
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
  traumaPending: Schema.Boolean,
  isOutOfAction: Schema.Boolean,
  stressClearPending: Schema.Boolean,
  dossier: Dossier,
  monitor: Monitor,
  talent: Talent,
  playbook: Playbook,
  gear: Gear,
  fund: Fund,
  // CONTRACT-05 (2026-08-25 correction): REQUIRED canonical array — the
  // single relationship family; absence fails ordinary decoding like any
  // other required property.
  contacts: Schema.Array(Contact),
  session: Session,
  notebook: Schema.String,
}).pipe(Schema.annotations({ identifier: "Character" }));

export type Character = typeof Character.Type;

export const decodeCharacter = Schema.decodeUnknownSync(Character, { onExcessProperty: "error" });
export const decodeCharacterEither = Schema.decodeUnknownEither(Character, {
  onExcessProperty: "error",
});

/**
 * Outstanding (incomplete) character fields, computed from the GENERATED
 * predicates module — never a hand-copied pointer list. A canonical empty at
 * a locked pointer makes the entity readable + incomplete (Q10); a genuinely
 * absent property is a canonicality (repair) concern, not a completeness one.
 */
export const characterOutstandingFields = (
  document: Character,
): readonly CompletenessRecord[] =>
  findIncompleteRecords(CHARACTER_COMPLETENESS_RECORDS, document as unknown);

/** True when every character completeness predicate holds for the document. */
export const isCharacterComplete = (document: Character): boolean =>
  isComplete(CHARACTER_COMPLETENESS_RECORDS, document as unknown);
