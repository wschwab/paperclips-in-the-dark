import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { assertResponseValid, decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook } from "../../src/game-data.js";

// AUDIT-0 BUG-012: GET /characters and GET /crews returned full entity DTOs
// instead of the declared summary DTOs (crew items had object-valued `heat`,
// no `crewType`, no `memberCount`; character items carried full `dossier` and
// non-string `playbook`), which broke the frontend crew-list decoder. These
// live cases require the exact summary schemas plus the summary semantics:
// crewType, memberCount, integer heat, and members listed under their crew.

const BLADES = "blades-in-the-dark";

async function seedCharacterId(): Promise<string> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  assertResponseValid("createCharacter", response.status, response.body);
  const body = response.body as { character?: { id?: string } };
  if (!body.character?.id) throw new Error("character seeding returned no id");
  return body.character.id;
}

async function seedCrewId(): Promise<string> {
  const response = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
  expect(response.status).toBe(200);
  assertResponseValid("createCrew", response.status, response.body);
  const body = response.body as { crew?: { id?: string } };
  if (!body.crew?.id) throw new Error("crew seeding returned no id");
  return body.crew.id;
}

async function linkCharacterToCrew(characterId: string, crewId: string): Promise<void> {
  const response = await api.post(`characters/${characterId}/ops/dossier.update`, { crewId });
  expect(response.status).toBe(200);
  assertResponseValid("dossierUpdate", response.status, response.body);
}

describe("contract v1 collection summary schemas (AUDIT-0 BUG-012)", () => {
  testCase("CONTRACT-COLLECTION-CHARACTERS-001", "GET /api/characters returns character summaries, not full DTOs", async () => {
    await seedCharacterId();
    const response = await api.get("characters");
    expect(response.status).toBe(200);
    // Strict AJV validation first; decode of validated data is then lossless for
    // reading the typed summary fields below (no false-green tolerance).
    assertResponseValid("listCharacters", response.status, response.body);
    const summaries = await decode(Schemas.CharacterSummaryList, response.body);
    expect(summaries.length).toBeGreaterThan(0);
    const items = response.body as Array<Record<string, unknown>>;
    expect(items.some((item) => "dossier" in item)).toBe(false);
    expect(items.some((item) => typeof item.playbook !== "string")).toBe(false);
  });

  testCase("CONTRACT-COLLECTION-CREWS-001", "GET /api/crews returns crew summaries with crewType and memberCount", async () => {
    const crewId = await seedCrewId();
    const response = await api.get("crews");
    expect(response.status).toBe(200);
    assertResponseValid("listCrews", response.status, response.body);
    const summaries = await decode(Schemas.CrewSummaryList, response.body);
    const crew = summaries.find((item) => item.id === crewId);
    expect(crew).toBeDefined();
    expect(crew?.crewType).toBe("Assassins");
    expect(crew?.memberCount).toBe(0);
    expect(crew?.heat).toBeTypeOf("number");
  });

  testCase("CONTRACT-COLLECTION-MEMBERS-001", "GET /api/campaign/crew/{crewId}/members lists linked characters as summaries", async () => {
    const characterId = await seedCharacterId();
    const crewId = await seedCrewId();
    await linkCharacterToCrew(characterId, crewId);
    const response = await api.get(`campaign/crew/${crewId}/members`);
    expect(response.status).toBe(200);
    assertResponseValid("getCrewMembers", response.status, response.body);
    const members = await decode(Schemas.CharacterSummaryList, response.body);
    expect(members.some((member) => member.id === characterId)).toBe(true);
  });

  testCase("CONTRACT-COLLECTION-MEMBER-COUNT-001", "linked characters are counted in crew summaries and carry the crewId", async () => {
    const characterId = await seedCharacterId();
    const crewId = await seedCrewId();
    await linkCharacterToCrew(characterId, crewId);
    const response = await api.get("campaign/roster");
    assertResponseValid("getRoster", response.status, response.body);
    const roster = await decode(Schemas.Roster, response.body);
    const crew = roster.crews.find((item) => item.id === crewId);
    expect(crew?.memberCount).toBe(1);
    const character = roster.characters.find((item) => item.id === characterId);
    expect(character?.crewId).toBe(crewId);
  });
});
