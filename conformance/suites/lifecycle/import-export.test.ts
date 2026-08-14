import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew, revisionHeader } from "../../src/suite-helpers.js";

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
    // Frozen import transaction: the golden decodes as a canonical
    // character, so the preview returns 200 with a previewToken, and the
    // confirming apply takes {entity, previewToken, confirm:true} plus
    // If-Match (the current revision).
    const preview = await api.post(`characters/${character.id}/import?preview=1`, { entity: imported });
    expect(preview.status).toBe(200);
    const previewBody = preview.body as { previewToken?: string };
    expect(previewBody.previewToken).toBeTruthy();
    const response = await api.post(
      `characters/${character.id}/import`,
      { entity: imported, previewToken: previewBody.previewToken ?? "", confirm: true },
      revisionHeader(character.revision),
    );
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
    // Frozen whole-error union: the VALIDATION branch carries the typed
    // pointer details plus the locked envelope fields (the union type still
    // admits the legacy {code,message} branch, so read them through an
    // optional-shape cast).
    const error = result.error as { status?: number; retryable?: boolean; recovery?: string };
    expect(error.status).toBe(400);
    expect(error.retryable).toBeTypeOf("boolean");
    expect(error.recovery).toBeTypeOf("string");
    expect(result.error?.details.issues.length).toBeGreaterThan(0);
  });
});
