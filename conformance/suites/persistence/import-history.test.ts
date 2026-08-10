import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

describe("persistence import history", () => {
  testCase(
    "PERSISTENCE-IMPORT-001",
    "a schema-invalid import is rejected and leaves bytes, revision, and history unchanged",
    async () => {
      const character = await newCharacter();
      try {
        const added = await api.characterOp(character.id, "note.add", { text: "before import" });
        expect(added.ok).toBe(true);

        const before = await api.get(`characters/${character.id}`);
        expect(before.status).toBe(200);
        const beforeDto = await decode(Schemas.Character, before.body);
        const beforeHistory = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
        expect(beforeHistory.length).toBeGreaterThan(0);

        const imported = await api.post(`characters/${character.id}/import`, { kind: "character", id: character.id });
        expect(imported.status).toBe(400);
        const result = await api.operation(imported);
        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe("VALIDATION");

        const after = await api.get(`characters/${character.id}`);
        expect(after.rawBody).toBe(before.rawBody);
        const afterDto = await decode(Schemas.Character, after.body);
        expect(afterDto.revision).toBe(beforeDto.revision);
        const afterHistory = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
        expect(afterHistory).toEqual(beforeHistory);
      } finally {
        // Teardown (AUDIT-0 BUG-003): the buggy server accepts any import with matching
        // kind/id, so the schema-invalid body above may have replaced current.json with
        // unreadable data. Re-import a valid full Character DTO over the same id to
        // overwrite current.json with valid data, so the corruption does not poison
        // shared endpoints (GET /api/characters, /api/campaign/roster) for the rest of
        // the suite run.
        const fixture = (await import("../../fixtures/golden-character.json", { with: { type: "json" } })).default as Record<string, unknown>;
        const repair = {
          ...fixture,
          id: character.id,
          createdAt: character.createdAt,
          updatedAt: character.updatedAt,
          revision: character.revision,
          dossier: { ...(fixture.dossier as Record<string, unknown>), crewId: character.dossier.crewId, notes: character.dossier.notes },
        };
        await api.post(`characters/${character.id}/import`, repair);
      }
    },
  );

  testCase(
    "PERSISTENCE-IMPORT-002",
    "a valid import round-trips and establishes exactly one baseline snapshot",
    async () => {
      const character = await newCharacter();
      const crew = await newCrew();
      const pre = await api.characterOp(character.id, "note.add", { text: "pre-import" });
      expect(pre.ok).toBe(true);
      const preDto = await api.character(character.id);
      const preHistory = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(preHistory).toHaveLength(1);
      const preSnapshotId = preHistory[0]?.snapshotId;

      const fixture = (await import("../../fixtures/golden-character.json", { with: { type: "json" } })).default as Record<string, unknown>;
      const notes = ["imported-note-1", "imported-note-2"];
      const imported = {
        ...fixture,
        id: character.id,
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
        revision: character.revision,
        dossier: { ...(fixture.dossier as Record<string, unknown>), crewId: crew.id, notes },
      };

      const response = await api.post(`characters/${character.id}/import`, imported);
      expect(response.status).toBe(200);
      const result = await api.operation(response);
      expect(result.ok).toBe(true);
      expect(result.character?.kind).toBe("character");

      const history = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(history).toHaveLength(1);
      expect(history[0]?.snapshotId).not.toBe(preSnapshotId);
      expect(history[0]?.op).toBeTruthy();

      const current = await api.get(`characters/${character.id}`);
      expect(current.status).toBe(200);
      const dto = await decode(Schemas.Character, current.body);
      expect(dto.id).toBe(character.id);
      expect(dto.revision).toBe(preDto.revision + 1);
      expect(dto.dossier.notes).toEqual(notes);
      const download = await api.get(`characters/${character.id}?download=1`);
      expect(download.status).toBe(200);
      expect(download.rawBody).toBe(current.rawBody);
    },
  );
});
