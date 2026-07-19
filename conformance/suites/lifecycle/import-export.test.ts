import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

describe("lifecycle import and export", () => {
  testCase("LIFECYCLE-IMPORT-001", "a golden character can be schema-decoded before import", async () => {
    const character = await newCharacter();
    const crew = await newCrew();
    const fixture = (await import("../../fixtures/golden-character.json", { with: { type: "json" } })).default as Record<string, unknown>;
    const imported = {
      ...fixture,
      id: character.id,
      createdAt: character.createdAt,
      updatedAt: character.updatedAt,
      revision: character.revision,
      dossier: { ...(fixture.dossier as Record<string, unknown>), crewId: crew.id },
    };
    await decode(Schemas.Character, imported);
    const response = await api.post(`characters/${character.id}/import`, imported);
    expect(response.status).toBe(200);
    const result = await api.operation(response);
    expect(result.ok).toBe(true);
    expect(result.character?.kind).toBe("character");
  });

  testCase("LIFECYCLE-IMPORT-002", "invalid imports return a typed validation response", async () => {
    const character = await newCharacter();
    const response = await api.post(`characters/${character.id}/import`, { kind: "not-a-character" });
    expect(response.status).toBe(400);
    const result = await api.operation(response);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });
});
