import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

describe("§5.1.11 character and crew cross-links", () => {
  testCase("SEMANTICS-CROSS-LINKS-001", "dossier crewId accepts an existing crew and roster counts members", async () => {
    const crew = await newCrew();
    const character = await newCharacter();
    const linked = await api.characterOp(character.id, "dossier.update", { crewId: crew.id });
    expect(linked.ok).toBe(true);
    expect(linked.character?.dossier.crewId).toBe(crew.id);
    const roster = await api.get("campaign/roster");
    expect(roster.status).toBe(200);
    const body = roster.body as { crews: Array<{ id: string; memberCount: number }> };
    expect(body.crews.find((item) => item.id === crew.id)?.memberCount).toBeGreaterThanOrEqual(1);
  });

  testCase("SEMANTICS-CROSS-LINKS-002", "deleting a crew unlinks its members", async () => {
    const crew = await newCrew();
    const character = await newCharacter();
    await api.characterOp(character.id, "dossier.update", { crewId: crew.id });
    const deleted = await api.post(`crews/${crew.id}/delete`, { confirm: true });
    expect(deleted.status).toBe(200);
    const unlinked = await api.character(character.id);
    expect(unlinked.dossier.crewId).toBe("");
  });
});
