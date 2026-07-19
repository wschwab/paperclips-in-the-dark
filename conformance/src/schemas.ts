import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

const BoundedInteger = Schema.Struct({ current: Schema.Number, max: Schema.Number });
const Experience = Schema.Struct({ points: Schema.Number, max: Schema.Number });
const NamedDescription = Schema.Struct({ name: Schema.String, description: Schema.String });
const GearItem = Schema.Struct({ name: Schema.String, bulk: Schema.Number });

const Armor = Schema.Struct({
  standardUsed: Schema.Boolean,
  heavyUsed: Schema.Boolean,
  specialUsed: Schema.Boolean,
  hasStandard: Schema.Boolean,
  hasHeavy: Schema.Boolean,
  hasSpecial: Schema.Boolean,
});

const Character = Schema.Struct({
  kind: Schema.Literal("character"),
  id: Schema.String,
  gameStem: Schema.String,
  gameName: Schema.String,
  language: Schema.String,
  revision: Schema.Number,
  formatVersion: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  isRetired: Schema.Boolean,
  isDeadish: Schema.Boolean,
  dossier: Schema.Struct({
    name: Schema.String,
    crewId: Schema.String,
    alias: Schema.String,
    look: Schema.String,
    notes: Schema.String,
    background: NamedDescription,
    heritage: NamedDescription,
    vice: NamedDescription,
  }),
  monitor: Schema.Struct({
    stress: BoundedInteger,
    trauma: Schema.Struct({ traumas: Schema.Array(Schema.String), max: Schema.Number }),
    harm: Schema.Struct({
      lesser: Schema.Array(Schema.String),
      moderate: Schema.Array(Schema.String),
      severe: Schema.Array(Schema.String),
      fatal: Schema.Array(Schema.String),
      healingClock: Schema.Struct({ segments: Schema.Number, size: Schema.Number, rollover: Schema.Number }),
    }),
    armor: Armor,
  }),
  talent: Schema.Struct({
    attributes: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        experience: Experience,
        actions: Schema.Array(Schema.Struct({ name: Schema.String, rating: Schema.Number, maxRating: Schema.Number })),
      }),
    ),
  }),
  playbook: Schema.Struct({
    name: Schema.String,
    experience: Experience,
    abilities: Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.String, timesTaken: Schema.Number })),
  }),
  gear: Schema.Struct({
    loadout: Schema.Array(GearItem),
    availableGear: Schema.Array(GearItem),
    commitment: Schema.String,
    isCommitmentLocked: Schema.Boolean,
    maxBulk: Schema.Number,
  }),
  fund: Schema.Struct({
    satchel: Schema.Struct({ coins: Schema.Number, max: Schema.Number }),
    stash: Schema.Struct({ coins: Schema.Number, max: Schema.Number }),
  }),
  rolodex: Schema.Struct({
    friends: Schema.Array(Schema.Struct({ entry: Schema.String, closeness: Schema.String })),
  }),
  session: Schema.Struct({
    playbookExpressions: Schema.Number,
    characterExpressions: Schema.Number,
    struggleExpressions: Schema.Number,
    max: Schema.Number,
  }),
  notebook: Schema.String,
});

const Crew = Schema.Struct({
  kind: Schema.Literal("crew"),
  id: Schema.String,
  gameStem: Schema.String,
  gameName: Schema.String,
  language: Schema.String,
  revision: Schema.Number,
  formatVersion: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  crewTypeName: Schema.String,
  name: Schema.String,
  lair: Schema.String,
  reputation: Schema.String,
  huntingGrounds: Schema.String,
  tier: Schema.Number,
  hold: Schema.String,
  heat: BoundedInteger,
  wanted: BoundedInteger,
  rep: BoundedInteger,
  experience: Experience,
  specialAbilities: Schema.Array(Schema.Struct({ name: Schema.String, timesTaken: Schema.Number })),
  upgrades: Schema.Array(Schema.Struct({ name: Schema.String, boxesMarked: Schema.Number })),
  cohorts: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      cohortKind: Schema.String,
      gangType: Schema.String,
      expertType: Schema.String,
      quality: Schema.Number,
      scale: Schema.Number,
      hasArmor: Schema.Boolean,
      edges: Schema.Array(Schema.String),
      flaws: Schema.Array(Schema.String),
      harm: Schema.String,
      description: Schema.String,
    }),
  ),
  coin: Schema.Number,
  stash: Schema.Number,
  notes: Schema.String,
});

const Clock = Schema.Struct({
  kind: Schema.Literal("clock"),
  id: Schema.String,
  revision: Schema.Number,
  formatVersion: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  name: Schema.String,
  clockKind: Schema.String,
  segments: Schema.Number,
  size: Schema.Number,
  rollover: Schema.Number,
});

const ErrorObject = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

const OperationResult = Schema.Struct({
  ok: Schema.Boolean,
  character: Schema.optional(Character),
  crew: Schema.optional(Crew),
  clock: Schema.optional(Clock),
  applied: Schema.Struct({
    op: Schema.String,
    requested: Schema.optional(Schema.Number),
    effective: Schema.optional(Schema.Number),
    landedIntensity: Schema.optional(Schema.String),
  }),
  sideEffects: Schema.Array(Schema.String),
  error: Schema.Union(Schema.Null, ErrorObject),
  batch: Schema.optional(
    Schema.Array(
      Schema.Struct({
        ok: Schema.Boolean,
        op: Schema.String,
        error: Schema.optional(Schema.Union(Schema.Null, ErrorObject)),
      }),
    ),
  ),
});

const Health = Schema.Struct({
  status: Schema.Literal("ok"),
  implementation: Schema.String,
  version: Schema.String,
  dataDir: Schema.String,
});

const CharacterSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  alias: Schema.String,
  playbook: Schema.String,
  gameStem: Schema.String,
  crewId: Schema.String,
  stress: Schema.Number,
  traumas: Schema.Array(Schema.String),
  isRetired: Schema.Boolean,
  isDeadish: Schema.Boolean,
  revision: Schema.Number,
});

const CrewSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  crewType: Schema.String,
  gameStem: Schema.String,
  tier: Schema.Number,
  heat: Schema.Number,
  wanted: Schema.Number,
  rep: Schema.Number,
  hold: Schema.String,
  memberCount: Schema.Number,
  revision: Schema.Number,
});

const HistoryEntry = Schema.Struct({
  snapshotId: Schema.String,
  takenAt: Schema.String,
  op: Schema.String,
});

export const Schemas = {
  Character,
  Crew,
  Clock,
  OperationResult,
  Health,
  CharacterSummary,
  CrewSummary,
  Roster: Schema.Struct({ characters: Schema.Array(CharacterSummary), crews: Schema.Array(CrewSummary) }),
  History: Schema.Array(HistoryEntry),
  SummaryList: Schema.Array(Schema.Union(CharacterSummary, CrewSummary)),
  JsonArray: Schema.Array(Schema.Unknown),
  JsonObject: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
};

export type CharacterDto = Schema.Schema.Type<typeof Character>;
export type CrewDto = Schema.Schema.Type<typeof Crew>;
export type ClockDto = Schema.Schema.Type<typeof Clock>;
export type OperationResultDto = Schema.Schema.Type<typeof OperationResult>;

export function decode<A>(schema: Schema.Schema<A, any, any>, value: unknown): Promise<A> {
  return Effect.runPromise(Schema.decodeUnknown(schema)(value) as Effect.Effect<A, unknown, never>);
}
