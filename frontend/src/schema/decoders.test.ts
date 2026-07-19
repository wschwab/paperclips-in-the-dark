import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Either } from "effect";
import { describe, expect, it } from "vitest";
import { decodeHealth, decodeHealthEither, decodeRoster } from "./campaign.js";
import { decodeCharacter, decodeCharacterEither } from "./character.js";
import { decodeClock, decodeClockEither } from "./clock.js";
import { decodeCrew, decodeCrewEither } from "./crew.js";
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

  it("decodes summaries matching contract fields", () => {
    const roster = decodeRoster({
      characters: [
        {
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
        },
      ],
      crews: [
        {
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
        },
      ],
    });
    expect(roster.characters[0]?.playbook).toBe("Spider");
    expect(roster.crews[0]?.memberCount).toBe(1);
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
