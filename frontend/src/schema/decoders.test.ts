import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Either } from "effect";
import { describe, expect, it } from "vitest";
import {
  decodeHealth,
  decodeHealthEither,
  decodeHistoryEntry,
  decodeHistoryEntryEither,
  decodeRoster,
  decodeRosterEither,
} from "./campaign.js";
import { decodeCharacter, decodeCharacterEither } from "./character.js";
import {
  characterOutstandingFields,
  isCharacterComplete,
} from "./character.js";
import { decodeClock, decodeClockEither, decodeClockSummary, decodeClockSummaryEither } from "./clock.js";
import { decodeCrew, decodeCrewEither } from "./crew.js";
import { crewOutstandingFields, isCrewComplete } from "./crew.js";
import {
  decodeOperationResult,
  decodeOperationResultEither,
} from "./operation-result.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../../conformance/fixtures");

function loadFixture(name: string): unknown {
  const raw = readFileSync(resolve(fixturesDir, name), "utf8");
  return JSON.parse(raw) as unknown;
}

describe("schema decoders against golden fixtures", () => {
  it("decodes golden-character.json", () => {
    const data = loadFixture("golden-character.json");
    const character = decodeCharacter(data);
    expect(character.kind).toBe("character");
    expect(character.id).toBe("c46ba7cb-993b-4fc7-974d-fb95eacd5446");
    expect(character.dossier.name).toBe("Brenda Hilton");
    expect(character.dossier.alias).toBe("Webweaver");
    expect(character.monitor.stress).toEqual({ current: 3, max: 9 });
    expect(character.monitor.trauma.traumas).toEqual(["Haunted"]);
    expect(character.playbook.name).toBe("Spider");
    expect(character.gear.commitment).toBe("light");
    expect(character.fund.satchel.coins).toBe(4);
    expect(character.rolodex.friends).toHaveLength(3);
    expect(character.isRetired).toBe(false);
    expect(character.revision).toBe(12);
  });

  it("decodes golden-crew.json", () => {
    const data = loadFixture("golden-crew.json");
    const crew = decodeCrew(data);
    expect(crew.kind).toBe("crew");
    expect(crew.id).toBe("8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2");
    expect(crew.name).toBe("The Red Sashes");
    expect(crew.crewTypeName).toBe("Assassins");
    expect(crew.hold).toBe("strong");
    expect(crew.heat).toEqual({ current: 4, max: 9 });
    expect(crew.cohorts).toHaveLength(1);
    expect(crew.cohorts[0]?.cohortKind).toBe("gang");
    expect(crew.cohorts[0]?.harm).toBe("healthy");
    expect(crew.specialAbilities[0]?.name).toBe("Predators");
    expect(crew.revision).toBe(5);
    expect(crew.contacts).toHaveLength(1);
    expect(crew.contacts?.[0]?.name).toBe("Rolan Wott");
    expect(crew.contacts?.[0]?.profession).toBe("magistrate");
    expect(crew.factions).toHaveLength(2);
    expect(crew.factions?.[0]?.name).toBe("The Crows");
    expect(crew.factions?.[0]?.status).toBe(-1);
  });

  it("decodes golden-clock.json", () => {
    const data = loadFixture("golden-clock.json");
    const clock = decodeClock(data);
    expect(clock.kind).toBe("clock");
    expect(clock.id).toBe("a1b2c3d4-5e6f-47a8-9b0c-1d2e3f4a5b6c");
    expect(clock.name).toBe("Infiltrate the Bluecoats");
    expect(clock.clockKind).toBe("project");
    expect(clock.segments).toBe(3);
    expect(clock.size).toBe(8);
    expect(clock.rollover).toBe(0);
  });

  it("rejects a character missing required fields (Either path)", () => {
    const result = decodeCharacterEither({ kind: "character" });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects a crew with invalid hold", () => {
    const data = loadFixture("golden-crew.json") as Record<string, unknown>;
    const bad = { ...data, hold: "medium" };
    const result = decodeCrewEither(bad);
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects a clock with unknown clockKind", () => {
    const data = loadFixture("golden-clock.json") as Record<string, unknown>;
    const bad = { ...data, clockKind: "death" };
    const result = decodeClockEither(bad);
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("ClockSummary decoder (campaign.json#/$defs/clockSummary)", () => {
  const row = {
    kind: "clock",
    id: "a1b2c3d4-5e6f-47a8-9b0c-1d2e3f4a5b6c",
    name: "Infiltrate the Bluecoats",
    ownerKind: "campaign",
    ownerId: "",
    purpose: "custom",
    behavior: "bounded",
    segments: 3,
    size: 8,
    rollover: 0,
    relatedClockIds: [],
    isReadable: true,
    isRepairable: true,
    isComplete: true,
    deleteToken: "",
  };

  it("decodes a readable summary row and derives clockKind from behavior", () => {
    const summary = decodeClockSummary(row);
    expect(summary.kind).toBe("clock");
    expect(summary.id).toBe("a1b2c3d4-5e6f-47a8-9b0c-1d2e3f4a5b6c");
    expect(summary.clockKind).toBe("project");
    expect(summary.isReadable).toBe(true);
    expect(summary.deleteToken).toBe("");
  });

  it("decodes a degraded row (canonical empties + sha256 deleteToken)", () => {
    const token = "sha256:" + "c".repeat(64);
    const degraded = decodeClockSummary({
      ...row,
      name: "",
      ownerKind: "campaign",
      ownerId: "",
      purpose: "custom",
      behavior: "bounded",
      segments: 0,
      size: 1,
      rollover: 0,
      relatedClockIds: [],
      isReadable: false,
      isRepairable: false,
      isComplete: false,
      deleteToken: token,
    });
    expect(degraded.isReadable).toBe(false);
    expect(degraded.isComplete).toBe(false);
    expect(degraded.deleteToken).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects a full Clock DTO (revision/formatVersion/timestamps are excess)", () => {
    const full = loadFixture("golden-clock.json") as Record<string, unknown>;
    const result = decodeClockSummaryEither(full);
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects a row missing the metadata (isReadable/isComplete/deleteToken)", () => {
    const { isReadable: _isReadable, isComplete: _isComplete, deleteToken: _deleteToken, isRepairable: _isRepairable, ...bare } = row;
    const result = decodeClockSummaryEither(bare);
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects a row with an empty deleteToken when isReadable is false (token required on degraded rows)", () => {
    const result = decodeClockSummaryEither({
      ...row,
      isReadable: false,
      isRepairable: false,
      isComplete: false,
      deleteToken: "nope",
    });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("Health decoder", () => {
  it("decodes a valid health payload", () => {
    const health = decodeHealth({
      status: "ok",
      implementation: "ada",
      version: "0.1.0",
      dataDir: "./campaign-data",
    });
    expect(health.status).toBe("ok");
    expect(health.implementation).toBe("ada");
    expect(health.version).toBe("0.1.0");
    expect(health.dataDir).toBe("./campaign-data");
  });

  it("accepts zero implementation", () => {
    const health = decodeHealth({
      status: "ok",
      implementation: "zero",
      version: "dev",
      dataDir: "/tmp/data",
    });
    expect(health.implementation).toBe("zero");
  });

  it("rejects unknown implementation", () => {
    const result = decodeHealthEither({
      status: "ok",
      implementation: "dotnet",
      version: "1",
      dataDir: ".",
    });
    expect(Either.isLeft(result)).toBe(true);
  });

  it("rejects non-ok status", () => {
    const result = decodeHealthEither({
      status: "degraded",
      implementation: "ada",
      version: "1",
      dataDir: ".",
    });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("Roster decoder", () => {
  it("decodes an empty roster", () => {
    const roster = decodeRoster({ characters: [], crews: [] });
    expect(roster.characters).toEqual([]);
    expect(roster.crews).toEqual([]);
  });

  // E11 frozen contract (campaign.json#/$defs/characterSummary|crewSummary):
  // every row MUST carry the full collection-metadata set. The backend has
  // emitted these fields since Waves 4-5, so the Wave-3-era tolerance for
  // rows that omit them is gone — omission is a schema violation.
  const strictRoster = {
    characters: [
      {
        kind: "character",
        id: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
        name: "Brenda Hilton",
        alias: "Webweaver",
        playbook: "Spider",
        gameStem: "blades-in-the-dark",
        crewId: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        stress: 3,
        traumas: ["Haunted"],
        isRetired: false,
        isDeadish: false,
        revision: 12,
        isReadable: true,
        isRepairable: false,
        isComplete: true,
        deleteToken: "",
        canUndo: false,
        historyCount: 0,
      },
    ],
    crews: [
      {
        kind: "crew",
        id: "8f14e45f-ceea-467f-a2d3-1f6ecfa1b1a2",
        name: "The Red Sashes",
        crewType: "Assassins",
        gameStem: "blades-in-the-dark",
        tier: 0,
        heat: 4,
        wanted: 1,
        rep: 3,
        hold: "strong",
        memberCount: 1,
        revision: 5,
        isReadable: true,
        isRepairable: false,
        isComplete: true,
        deleteToken: "",
        canUndo: false,
        historyCount: 0,
      },
    ],
  };

  it("decodes summaries matching the strict contract fields", () => {
    const result = decodeRosterEither(strictRoster);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.characters[0]?.playbook).toBe("Spider");
      expect(result.right.crews[0]?.memberCount).toBe(1);
      expect(result.right.characters[0]?.isReadable).toBe(true);
      expect(result.right.crews[0]?.deleteToken).toBe("");
      expect(result.right.crews[0]?.historyCount).toBe(0);
    }
  });

  it("rejects summaries that omit the collection metadata fields", () => {
    const { isReadable: _isReadable, isRepairable: _isRepairable, isComplete: _isComplete, deleteToken: _deleteToken, canUndo: _canUndo, historyCount: _historyCount, ...bareCharacter } = strictRoster.characters[0];
    const { isReadable: _isReadable2, isRepairable: _isRepairable2, isComplete: _isComplete2, deleteToken: _deleteToken2, canUndo: _canUndo2, historyCount: _historyCount2, ...bareCrew } = strictRoster.crews[0];
    const result = decodeRosterEither({
      characters: [bareCharacter],
      crews: [bareCrew],
    });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("OperationResult decoder", () => {
  it("decodes a successful character op wrapping the golden character", () => {
    const character = loadFixture("golden-character.json");
    const result = decodeOperationResult({
      ok: true,
      character,
      applied: { op: "stress.add", requested: 3, effective: 2 },
      sideEffects: ["stress full — consider trauma"],
      error: null,
    });
    expect(result.ok).toBe(true);
    expect(result.character?.dossier.name).toBe("Brenda Hilton");
    expect(result.applied.op).toBe("stress.add");
    expect(result.applied.requested).toBe(3);
    expect(result.applied.effective).toBe(2);
    expect(result.sideEffects).toEqual(["stress full — consider trauma"]);
    expect(result.error).toBeNull();
  });

  it("decodes a successful crew op", () => {
    const crew = loadFixture("golden-crew.json");
    const result = decodeOperationResult({
      ok: true,
      crew,
      applied: { op: "heat.add", requested: 1, effective: 1 },
      sideEffects: [],
      error: null,
    });
    expect(result.crew?.name).toBe("The Red Sashes");
  });

  it("decodes a successful clock op", () => {
    const clock = loadFixture("golden-clock.json");
    const result = decodeOperationResult({
      ok: true,
      clock,
      applied: { op: "clock.tick", requested: 1, effective: 1 },
      sideEffects: [],
      error: null,
    });
    expect(result.clock?.segments).toBe(3);
  });

  it("decodes a failure with typed error", () => {
    const result = decodeOperationResult({
      ok: false,
      applied: { op: "armor.use-special" },
      sideEffects: [],
      error: {
        code: "ARMOR_NOT_AVAILABLE",
        message: "special armor is not in loadout",
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ARMOR_NOT_AVAILABLE");
    expect(result.character).toBeUndefined();
  });

  it("decodes harm spillover landing intensity", () => {
    const character = loadFixture("golden-character.json");
    const result = decodeOperationResult({
      ok: true,
      character,
      applied: {
        op: "harm.add",
        requested: 1,
        effective: 1,
        landedIntensity: "severe",
      },
      sideEffects: ["harm spilled to severe"],
      error: null,
    });
    expect(result.applied.landedIntensity).toBe("severe");
  });

  it("rejects unknown error codes", () => {
    const result = decodeOperationResultEither({
      ok: false,
      applied: { op: "x" },
      sideEffects: [],
      error: { code: "NOT_A_REAL_CODE", message: "nope" },
    });
    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("HistoryEntry decoder (F2aa)", () => {
  it("decodes a snapshotId emitted by the Ada server (17-digit tick format)", () => {
    const entry = decodeHistoryEntry({
      snapshotId: "63835568000000000-abc123def456",
      takenAt: "2026-08-09T12:00:00.000Z",
      op: "stress.add",
    });
    expect(entry.snapshotId).toBe("63835568000000000-abc123def456");
    expect(entry.op).toBe("stress.add");
  });

  it("decodes a 17-digit tick snapshot id with a long random suffix", () => {
    const entry = decodeHistoryEntry({
      snapshotId: "63835568000000000-AbCdEf1234567890",
      takenAt: "2026-08-09T12:00:00.000Z",
      op: "crew.undo",
    });
    expect(entry.snapshotId).toBe("63835568000000000-AbCdEf1234567890");
  });

  it("rejects an empty snapshotId", () => {
    const result = decodeHistoryEntryEither({
      snapshotId: "",
      takenAt: "2026-08-09T12:00:00.000Z",
      op: "stress.add",
    });
    expect(Either.isLeft(result)).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// FV-027 P27B — recursive strictness matrix
// ---------------------------------------------------------------------------
describe("recursive strictness matrix (FV-027 P27B)", () => {
  const goldenCharacter = loadFixture("golden-character.json") as Record<string, any>;
  const goldenCrew = loadFixture("golden-crew.json") as Record<string, any>;

  it("rejects an unknown top-level key", () => {
    expect(Either.isLeft(decodeCharacterEither({ ...goldenCharacter, extraTop: 1 }))).toBe(
      true,
    );
    expect(Either.isLeft(decodeCrewEither({ ...goldenCrew, extraTop: 1 }))).toBe(true);
  });

  it("rejects an unknown nested key", () => {
    const dossier = { ...(goldenCharacter.dossier as object), extraNested: 1 };
    expect(Either.isLeft(decodeCharacterEither({ ...goldenCharacter, dossier }))).toBe(true);

    const harm = { ...(goldenCharacter.monitor.harm as object), extraHarm: 1 };
    const monitor = { ...(goldenCharacter.monitor as object), harm };
    expect(Either.isLeft(decodeCharacterEither({ ...goldenCharacter, monitor }))).toBe(true);
  });

  it("rejects an unknown key on an array item", () => {
    const cohorts = (goldenCrew.cohorts as any[]).map((c: any) => ({
      ...c,
      extraCohort: 1,
    }));
    expect(Either.isLeft(decodeCrewEither({ ...goldenCrew, cohorts }))).toBe(true);
  });

  it("rejects an unknown nested key on a clock (M03 killer)", () => {
    const goldenClock = loadFixture("golden-clock.json") as object;
    const withExcess = { ...goldenClock, extraClockKey: 1 };
    expect(Either.isLeft(decodeClockEither(withExcess))).toBe(true);
  });

  it("rejects a clock missing relatedClockIds (M02 killer)", () => {
    const goldenClock = loadFixture("golden-clock.json") as Record<string, unknown>;
    const { relatedClockIds: _drop, ...missingField } = goldenClock;
    expect(Either.isLeft(decodeClockEither(missingField))).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { id: _id, ...missingId } = goldenCharacter;
    expect(Either.isLeft(decodeCharacterEither(missingId))).toBe(true);
  });

  it("rejects a wrong primitive type", () => {
    expect(
      Either.isLeft(decodeCharacterEither({ ...goldenCharacter, isRetired: "yes" })),
    ).toBe(true);
  });

  it("rejects a wrong enum value", () => {
    expect(Either.isLeft(decodeCrewEither({ ...goldenCrew, hold: "medium" }))).toBe(true);
    expect(
      Either.isLeft(
        decodeClockEither({
          ...(loadFixture("golden-clock.json") as object),
          behavior: "death",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a value outside the declared bound", () => {
    const stress = { current: -1, max: 9 };
    const monitor = { ...(goldenCharacter.monitor as object), stress };
    expect(Either.isLeft(decodeCharacterEither({ ...goldenCharacter, monitor }))).toBe(true);

    const clock = { ...(loadFixture("golden-clock.json") as object), size: 0 };
    expect(Either.isLeft(decodeClockEither(clock))).toBe(true);
  });

  it("decodes a valid canonical shape", () => {
    expect(Either.isRight(decodeCharacterEither(goldenCharacter))).toBe(true);
    expect(Either.isRight(decodeCrewEither(goldenCrew))).toBe(true);
  });

  it("decodes explicitly extensible nested data", () => {
    // claimOverrides entries are sparse (only claimId required); their
    // `effects` member is an arbitrary object (Schema.Record) — explicitly
    // extensible, so extra/arbitrary keys must NOT be rejected.
    const claimOverrides = [
      {
        claimId: "docks-warehouse",
        effects: [{ arbitrary: true, nested: { deep: [1, 2, 3] } }],
      },
    ];
    const result = decodeCrewEither({ ...goldenCrew, claimOverrides });
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.claimOverrides[0]?.effects).toEqual([
        { arbitrary: true, nested: { deep: [1, 2, 3] } },
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// Completeness consumption (SC-F1) — driven by the GENERATED predicates module
// ---------------------------------------------------------------------------
describe("completeness consumption (SC-F1)", () => {
  it("reports a fully-named golden character as complete with no outstanding fields", () => {
    const character = decodeCharacter(loadFixture("golden-character.json"));
    expect(characterOutstandingFields(character)).toEqual([]);
    expect(isCharacterComplete(character)).toBe(true);
  });

  it("reports a canonical empty at a locked pointer as readable + incomplete", () => {
    const data = loadFixture("golden-character.json") as Record<string, any>;
    const dossier = { ...(data.dossier as object), name: "" };
    const character = decodeCharacter({ ...data, dossier });
    const outstanding = characterOutstandingFields(character);
    expect(outstanding.map((r) => r.pointer)).toContain("/dossier/name");
    expect(isCharacterComplete(character)).toBe(false);
  });

  it("reports a whitespace-only locked pointer as incomplete", () => {
    const data = loadFixture("golden-character.json") as Record<string, any>;
    const dossier = { ...(data.dossier as object), alias: "   " };
    const character = decodeCharacter({ ...data, dossier });
    expect(characterOutstandingFields(character).map((r) => r.pointer)).toContain(
      "/dossier/alias",
    );
  });

  it("reports a fully-named golden crew as complete", () => {
    const crew = decodeCrew(loadFixture("golden-crew.json"));
    expect(crewOutstandingFields(crew)).toEqual([]);
    expect(isCrewComplete(crew)).toBe(true);
  });

  it("reports a canonical empty crew name as incomplete", () => {
    const crew = decodeCrew({
      ...(loadFixture("golden-crew.json") as object),
      name: "",
    });
    expect(crewOutstandingFields(crew).map((r) => r.pointer)).toContain("/name");
    expect(isCrewComplete(crew)).toBe(false);
  });
});
