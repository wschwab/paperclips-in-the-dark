import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { assertResponseValid, decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook } from "../../src/game-data.js";

// AUDIT-0 BUG-013: the conformance suite accepted outputs that violate the
// frozen JSON Schemas — the campaign lacked its required `kind`, timestamps
// used a space separator instead of the RFC 3339 'T', history snapshot IDs
// were plain UUIDs instead of ^[0-9]{17}-[A-Za-z0-9]+$, and decoders treated
// all of these as unrestricted strings. The offline cases below pin the
// decoders to the frozen schemas (known-invalid counterexamples MUST be
// rejected); the live cases require the current server's responses to decode
// against those same schemas.

const BLADES = "blades-in-the-dark";
/** Value the Ada server actually emitted at audit time (BUG-013). */
const BROKEN_TIMESTAMP = "2026-08-10 06:08:41.23Z";
const PLAIN_UUID = "c46ba7cb-993b-4fc7-974d-fb95eacd5446";
const SNAPSHOT_ID_PATTERN = /^[0-9]{17}-[A-Za-z0-9]+$/;
const RFC3339_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

async function goldenCharacter(): Promise<Record<string, unknown>> {
  return (await import("../../fixtures/golden-character.json", { with: { type: "json" } })).default as Record<string, unknown>;
}

async function goldenCrew(): Promise<Record<string, unknown>> {
  return (await import("../../fixtures/golden-crew.json", { with: { type: "json" } })).default as Record<string, unknown>;
}

async function goldenClock(): Promise<Record<string, unknown>> {
  return (await import("../../fixtures/golden-clock.json", { with: { type: "json" } })).default as Record<string, unknown>;
}

async function seedCharacterId(): Promise<string> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  assertResponseValid("createCharacter", response.status, response.body);
  const body = response.body as { character?: { id?: string } };
  if (!body.character?.id) throw new Error("character seeding returned no id");
  return body.character.id;
}

describe("strict decoders reject contract-invalid output (AUDIT-0 BUG-013)", () => {
  testCase("CONTRACT-STRICT-DECODE-CAMPAIGN-001", "campaign without the required kind is rejected", async () => {
    await expect(
      decode(Schemas.Campaign, {
        name: "Paperclips Campaign",
        gameStem: "blades-in-the-dark",
        createdAt: "2026-07-19T12:00:00.000Z",
        formatVersion: 1,
      }),
    ).rejects.toThrow();
  });

  testCase("CONTRACT-STRICT-DECODE-TIMESTAMP-001", "space-separated timestamps (no RFC 3339 T) are rejected", async () => {
    const character = await goldenCharacter();
    await expect(decode(Schemas.Character, { ...character, createdAt: BROKEN_TIMESTAMP })).rejects.toThrow();
    const crew = await goldenCrew();
    await expect(decode(Schemas.Crew, { ...crew, updatedAt: BROKEN_TIMESTAMP })).rejects.toThrow();
  });

  testCase("CONTRACT-STRICT-DECODE-SNAPSHOT-001", "plain-UUID snapshotIds are rejected (pattern requires 17 digits)", async () => {
    await expect(
      decode(Schemas.HistoryEntry, { snapshotId: PLAIN_UUID, takenAt: "2026-07-19T12:00:00.000Z", op: "stress.add" }),
    ).rejects.toThrow();
  });

  testCase("CONTRACT-STRICT-DECODE-REVISION-001", "revision 0 violates the minimum of 1", async () => {
    const character = await goldenCharacter();
    await expect(decode(Schemas.Character, { ...character, revision: 0 })).rejects.toThrow();
  });

  testCase("CONTRACT-STRICT-DECODE-UUID-001", "non-UUID entity ids are rejected", async () => {
    const character = await goldenCharacter();
    await expect(decode(Schemas.Character, { ...character, id: "not-a-uuid" })).rejects.toThrow();
  });

  testCase("CONTRACT-STRICT-DECODE-EXCESS-001", "excess properties are rejected (additionalProperties: false)", async () => {
    const character = await goldenCharacter();
    await expect(decode(Schemas.Character, { ...character, extra: true })).rejects.toThrow();
  });

  testCase("CONTRACT-STRICT-DECODE-SUMMARY-001", "a full character DTO does not decode as a character summary", async () => {
    const character = await goldenCharacter();
    await expect(decode(Schemas.CharacterSummary, character)).rejects.toThrow();
  });

  testCase("CONTRACT-STRICT-DECODE-CREWSUMMARY-001", "a crew with object-valued heat does not decode as a crew summary", async () => {
    const crew = await goldenCrew();
    await expect(decode(Schemas.CrewSummary, crew)).rejects.toThrow();
  });

  testCase("EDGE-DECODER-LIFECYCLE-001", "current characters require every lifecycle flag", async () => {
    const character = await goldenCharacter();
    for (const property of ["traumaPending", "isOutOfAction", "stressClearPending"]) {
      const { [property]: _missing, ...withoutProperty } = character;
      await expect(decode(Schemas.Character, withoutProperty)).rejects.toThrow();
    }
  });

  testCase("EDGE-DECODER-CLOCK-001", "ordinary clock decoding rejects missing metadata and the legacy clockKind shape", async () => {
    const clock = await goldenClock();
    for (const property of ["ownerKind", "ownerId", "purpose", "behavior", "relatedClockIds"]) {
      const { [property]: _missing, ...withoutProperty } = clock;
      await expect(decode(Schemas.Clock, withoutProperty)).rejects.toThrow();
    }
    const { behavior: _behavior, ...withoutBehavior } = clock;
    await expect(decode(Schemas.Clock, { ...withoutBehavior, clockKind: "project" })).rejects.toThrow();
  });

  testCase("EDGE-DECODER-SUMMARY-001", "ordinary summary decoding rejects missing readability metadata", async () => {
    const summary = {
      kind: "character",
      id: "c46ba7cb-993b-4fc7-974d-fb95eacd5446",
      name: "Brenda Hilton",
      alias: "Webweaver",
      playbook: "Spider",
      gameStem: BLADES,
      crewId: "",
      stress: 0,
      traumas: [],
      isRetired: false,
      isDeadish: false,
      revision: 1,
      isRepairable: false,
      isComplete: true,
      deleteToken: "",
      canUndo: false,
      historyCount: 0,
    };
    await expect(decode(Schemas.CharacterSummary, summary)).rejects.toThrow();
  });

  testCase("EDGE-DECODER-ERROR-001", "ordinary operation decoding rejects legacy {code,message} errors", async () => {
    await expect(decode(Schemas.OperationResult, {
      ok: false,
      applied: { op: "get" },
      sideEffects: [],
      error: { code: "NOT_FOUND", message: "missing" },
    })).rejects.toThrow();
  });

  testCase("CONTRACT-STRICT-DECODE-ERRORCODE-001", "unknown error codes are rejected", async () => {
    await expect(
      decode(Schemas.OperationResult, {
        ok: false,
        applied: { op: "stress.add" },
        sideEffects: [],
        error: { code: "WHATEVER", message: "x" },
      }),
    ).rejects.toThrow();
  });
});

describe("live responses satisfy the frozen schemas (AUDIT-0 BUG-013)", () => {
  testCase("CONTRACT-STRICT-CAMPAIGN-001", "the live campaign satisfies the campaign schema with its required kind and RFC 3339 createdAt", async () => {
    const response = await api.get("campaign");
    expect(response.status).toBe(200);
    assertResponseValid("getCampaign", response.status, response.body);
    // validated above against campaign.json#/$defs/campaign (kind required)
    const campaign = response.body as { kind: string };
    expect(campaign.kind).toBe("campaign");
  });

  testCase("CONTRACT-STRICT-CREATE-TIMESTAMP-001", "created entities carry RFC 3339 timestamps and satisfy the character schema", async () => {
    const characterId = await seedCharacterId();
    const response = await api.get(`characters/${characterId}`);
    expect(response.status).toBe(200);
    assertResponseValid("getCharacter", response.status, response.body);
    // validated above against character.json (createdAt/updatedAt required)
    const character = response.body as { createdAt: string; updatedAt: string };
    expect(RFC3339_T.test(character.createdAt)).toBe(true);
    expect(RFC3339_T.test(character.updatedAt)).toBe(true);
  });

  testCase("CONTRACT-STRICT-HISTORY-001", "live history entries satisfy the historyEntry schema with contract snapshot IDs", async () => {
    const characterId = await seedCharacterId();
    const mutation = await api.post(`characters/${characterId}/ops/note.add`, { text: "strict" });
    expect(mutation.status).toBe(200);
    assertResponseValid("noteAdd", mutation.status, mutation.body);
    const response = await api.get(`characters/${characterId}/history`);
    expect(response.status).toBe(200);
    assertResponseValid("listCharacterHistory", response.status, response.body);
    // validated above against campaign.json#/$defs/historyEntry (array of entries)
    const history = response.body as Array<{ snapshotId: string }>;
    expect(history.length).toBeGreaterThan(0);
    expect(SNAPSHOT_ID_PATTERN.test(history[0]!.snapshotId)).toBe(true);
  });

  testCase("CONTRACT-STRICT-HEALTH-001", "health satisfies the health schema with the typed implementation", async () => {
    const response = await api.get("health");
    expect(response.status).toBe(200);
    assertResponseValid("health", response.status, response.body);
    // validated above against campaign.json#/$defs/health (status required: ok|degraded)
    const health = response.body as { status: string };
    expect(health.status).toBe("ok");
  });

  testCase("CONTRACT-STRICT-ROSTER-001", "the live roster satisfies the roster schema, whose crew summaries require canUndo/historyCount", async () => {
    // BUG-013: the tolerant Effect mirror defaulted canUndo/historyCount in, so a
    // roster lacking them decoded green. The AJV contract-validator requires them on
    // every crew summary (campaign.json#/$defs/crewSummary), so a server that
    // omits them fails here.
    const response = await api.get("campaign/roster");
    expect(response.status).toBe(200);
    assertResponseValid("getRoster", response.status, response.body);
    // validated above against campaign.json#/$defs/roster (characters+crews required)
    const roster = response.body as { characters: unknown[]; crews: unknown[] };
    expect(Array.isArray(roster.characters)).toBe(true);
    expect(Array.isArray(roster.crews)).toBe(true);
  });
});
