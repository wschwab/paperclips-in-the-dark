import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook } from "../../src/game-data.js";

// AUDIT-0 BUG-007: three declared read routes returned 404 for existing or
// known resources (crew members, an existing history snapshot, and a known
// crew type), and the endpoint coverage never exercised success paths because
// it used invented IDs and accepted 404. Every declared read route below is
// seeded through the public APIs (or is static game data) and must return
// HTTP 200 with exactly its declared response schema. Unknown IDs are covered
// separately by endpoints.test.ts as typed 404s.

const BLADES = "blades-in-the-dark";

async function seedCharacterId(): Promise<string> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  const body = response.body as { character?: { id?: string } };
  if (!body.character?.id) throw new Error("character seeding returned no id");
  return body.character.id;
}

async function seedCrewId(): Promise<string> {
  const response = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
  expect(response.status).toBe(200);
  const body = response.body as { crew?: { id?: string } };
  if (!body.crew?.id) throw new Error("crew seeding returned no id");
  return body.crew.id;
}

async function seedClockId(): Promise<string> {
  const response = await api.post("clocks", { name: "Success-route clock", clockKind: "project", size: 4 });
  expect(response.status).toBe(200);
  const body = response.body as { clock?: { id?: string } };
  if (!body.clock?.id) throw new Error("clock seeding returned no id");
  return body.clock.id;
}

/** Produces one snapshot-worthy mutation and returns the newest snapshotId. */
async function snapshotIdOf(entityKind: "character" | "crew", entityId: string): Promise<string> {
  const response = await api.post(`${entityKind}s/${entityId}/ops/note.add`, { text: "success-route snapshot" });
  expect(response.status).toBe(200);
  const history = await api.get(`${entityKind}s/${entityId}/history`);
  const entries = history.body as Array<{ snapshotId?: string }>;
  if (!entries[0]?.snapshotId) throw new Error("history returned no snapshotId");
  return entries[0].snapshotId;
}

describe("contract v1 declared read routes return 200 for known resources (AUDIT-0 BUG-007)", () => {
  testCase("CONTRACT-SUCCESS-HEALTH-001", "GET /api/health", async () => {
    const response = await api.get("health");
    expect(response.status).toBe(200);
    await decode(Schemas.Health, response.body);
  });

  testCase("CONTRACT-SUCCESS-CAMPAIGN-001", "GET /api/campaign", async () => {
    const response = await api.get("campaign");
    expect(response.status).toBe(200);
    await decode(Schemas.Campaign, response.body);
  });

  testCase("CONTRACT-SUCCESS-ROSTER-001", "GET /api/campaign/roster", async () => {
    const response = await api.get("campaign/roster");
    expect(response.status).toBe(200);
    await decode(Schemas.Roster, response.body);
  });

  testCase("CONTRACT-SUCCESS-CREW-MEMBERS-001", "GET /api/campaign/crew/{crewId}/members for a known crew", async () => {
    const crewId = await seedCrewId();
    const response = await api.get(`campaign/crew/${crewId}/members`);
    expect(response.status).toBe(200);
    await decode(Schemas.CharacterSummaryList, response.body);
  });

  testCase("CONTRACT-SUCCESS-CHARACTERS-001", "GET /api/characters returns character summaries", async () => {
    await seedCharacterId();
    const response = await api.get("characters");
    expect(response.status).toBe(200);
    await decode(Schemas.CharacterSummaryList, response.body);
  });

  testCase("CONTRACT-SUCCESS-CHARACTER-001", "GET /api/characters/{id} for a created character", async () => {
    const characterId = await seedCharacterId();
    const response = await api.get(`characters/${characterId}`);
    expect(response.status).toBe(200);
    await decode(Schemas.Character, response.body);
  });

  testCase("CONTRACT-SUCCESS-CHARACTER-HISTORY-001", "GET /api/characters/{id}/history after a snapshot-worthy op", async () => {
    const characterId = await seedCharacterId();
    await api.post(`characters/${characterId}/ops/note.add`, { text: "success-route history" });
    const response = await api.get(`characters/${characterId}/history`);
    expect(response.status).toBe(200);
    await decode(Schemas.History, response.body);
  });

  testCase("CONTRACT-SUCCESS-CHARACTER-SNAPSHOT-001", "GET /api/characters/{id}/history/{snapshotId} for an existing snapshot", async () => {
    const characterId = await seedCharacterId();
    const snapshotId = await snapshotIdOf("character", characterId);
    const response = await api.get(`characters/${characterId}/history/${snapshotId}`);
    expect(response.status).toBe(200);
    await decode(Schemas.Character, response.body);
  });

  testCase("CONTRACT-SUCCESS-CREWS-001", "GET /api/crews returns crew summaries", async () => {
    await seedCrewId();
    const response = await api.get("crews");
    expect(response.status).toBe(200);
    await decode(Schemas.CrewSummaryList, response.body);
  });

  testCase("CONTRACT-SUCCESS-CREW-001", "GET /api/crews/{id} for a created crew", async () => {
    const crewId = await seedCrewId();
    const response = await api.get(`crews/${crewId}`);
    expect(response.status).toBe(200);
    await decode(Schemas.Crew, response.body);
  });

  testCase("CONTRACT-SUCCESS-CREW-HISTORY-001", "GET /api/crews/{id}/history after a snapshot-worthy op", async () => {
    const crewId = await seedCrewId();
    await api.post(`crews/${crewId}/ops/note.add`, { text: "success-route crew history" });
    const response = await api.get(`crews/${crewId}/history`);
    expect(response.status).toBe(200);
    await decode(Schemas.History, response.body);
  });

  testCase("CONTRACT-SUCCESS-CREW-SNAPSHOT-001", "GET /api/crews/{id}/history/{snapshotId} for an existing snapshot", async () => {
    const crewId = await seedCrewId();
    const snapshotId = await snapshotIdOf("crew", crewId);
    const response = await api.get(`crews/${crewId}/history/${snapshotId}`);
    expect(response.status).toBe(200);
    await decode(Schemas.Crew, response.body);
  });

  testCase("CONTRACT-SUCCESS-CLOCKS-001", "GET /api/clocks returns clock DTOs", async () => {
    await seedClockId();
    const response = await api.get("clocks");
    expect(response.status).toBe(200);
    await decode(Schemas.ClockList, response.body);
  });

  testCase("CONTRACT-SUCCESS-CLOCK-001", "GET /api/clocks/{id} for a created clock", async () => {
    const clockId = await seedClockId();
    const response = await api.get(`clocks/${clockId}`);
    expect(response.status).toBe(200);
    await decode(Schemas.Clock, response.body);
  });

  testCase("CONTRACT-SUCCESS-GAMES-001", "GET /api/games", async () => {
    const response = await api.get("games");
    expect(response.status).toBe(200);
    await decode(Schemas.GameList, response.body);
  });

  testCase("CONTRACT-SUCCESS-GAME-001", "GET /api/games/{stem} for an installed game", async () => {
    const response = await api.get("games/blades-in-the-dark");
    expect(response.status).toBe(200);
    await decode(Schemas.JsonObject, response.body);
  });

  testCase("CONTRACT-SUCCESS-PLAYBOOKS-001", "GET /api/games/{stem}/playbooks", async () => {
    const response = await api.get("games/blades-in-the-dark/playbooks");
    expect(response.status).toBe(200);
    await decode(Schemas.JsonArray, response.body);
  });

  testCase("CONTRACT-SUCCESS-PLAYBOOK-001", "GET /api/games/{stem}/playbooks/{playbook} for a known playbook", async () => {
    const response = await api.get("games/blades-in-the-dark/playbooks/Cutter");
    expect(response.status).toBe(200);
    await decode(Schemas.JsonObject, response.body);
  });

  testCase("CONTRACT-SUCCESS-HERITAGES-001", "GET /api/games/{stem}/heritages", async () => {
    const response = await api.get("games/blades-in-the-dark/heritages");
    expect(response.status).toBe(200);
    await decode(Schemas.JsonArray, response.body);
  });

  testCase("CONTRACT-SUCCESS-CREW-SETTINGS-001", "GET /api/games/{stem}/crews", async () => {
    const response = await api.get("games/blades-in-the-dark/crews");
    expect(response.status).toBe(200);
    await decode(Schemas.JsonObject, response.body);
  });

  testCase("CONTRACT-SUCCESS-CREW-TYPE-SETTINGS-001", "GET /api/games/{stem}/crews/{crewType} for a known crew type", async () => {
    const response = await api.get("games/blades-in-the-dark/crews/Assassins");
    expect(response.status).toBe(200);
    await decode(Schemas.JsonObject, response.body);
  });
});
