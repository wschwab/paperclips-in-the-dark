import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("persistence idempotency scope", () => {
  testCase(
    "PERSISTENCE-IDEMPOTENCY-001",
    "reusing a key on a different target executes normally instead of replaying",
    async () => {
      const first = await newCharacter();
      const second = await newCharacter();
      const headers = { "Idempotency-Key": `scope-target-${first.id}` };

      const firstResponse = await api.post(`characters/${first.id}/ops/note.add`, { text: "first" }, headers);
      expect(firstResponse.status).toBe(200);
      expect((await api.operation(firstResponse)).character?.id).toBe(first.id);

      const secondResponse = await api.post(`characters/${second.id}/ops/note.add`, { text: "second" }, headers);
      expect(secondResponse.status).toBe(200);
      const secondResult = await api.operation(secondResponse);
      expect(secondResult.ok).toBe(true);
      expect(secondResult.character?.id).toBe(second.id);

      const firstNow = await api.character(first.id);
      const secondNow = await api.character(second.id);
      expect(firstNow.dossier.notes).toEqual(["first"]);
      expect(secondNow.dossier.notes).toEqual(["second"]);
      expect(secondNow.revision).toBe(second.revision + 1);
    },
  );

  testCase(
    "PERSISTENCE-IDEMPOTENCY-002",
    "the same scoped key with a different body is a typed conflict, not a replay",
    async () => {
      const character = await newCharacter();
      const headers = { "Idempotency-Key": `scope-body-${character.id}` };
      const first = await api.post(`characters/${character.id}/ops/note.add`, { text: "first" }, headers);
      expect(first.status).toBe(200);

      const conflict = await api.post(`characters/${character.id}/ops/note.add`, { text: "second" }, headers);
      expect(conflict.status).toBeGreaterThanOrEqual(400);
      expect(conflict.status).toBeLessThan(500);
      const result = await api.operation(conflict);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBeTruthy();

      const current = await api.character(character.id);
      expect(current.dossier.notes).toEqual(["first"]);
      expect(current.revision).toBe(character.revision + 1);
    },
  );

  testCase(
    "PERSISTENCE-IDEMPOTENCY-003",
    "concurrent identical retries apply the mutation exactly once",
    async () => {
      const character = await newCharacter();
      const headers = { "Idempotency-Key": `scope-concurrent-${character.id}` };
      const [a, b] = await Promise.all([
        api.post(`characters/${character.id}/ops/note.add`, { text: "dup" }, headers),
        api.post(`characters/${character.id}/ops/note.add`, { text: "dup" }, headers),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const current = await api.character(character.id);
      expect(current.dossier.notes).toEqual(["dup"]);
      expect(current.revision).toBe(character.revision + 1);
      const entries = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(entries).toHaveLength(1);
    },
  );

  testCase(
    "PERSISTENCE-IDEMPOTENCY-004",
    "an exact retry returns the original response without another revision or snapshot",
    async () => {
      const character = await newCharacter();
      const headers = { "Idempotency-Key": `scope-retry-${character.id}` };
      const first = await api.post(`characters/${character.id}/ops/note.add`, { text: "stable" }, headers);
      expect(first.status).toBe(200);
      const retry = await api.post(`characters/${character.id}/ops/note.add`, { text: "stable" }, headers);
      expect(retry.status).toBe(200);
      expect(retry.rawBody).toBe(first.rawBody);

      const current = await api.character(character.id);
      expect(current.dossier.notes).toEqual(["stable"]);
      expect(current.revision).toBe(character.revision + 1);
      const entries = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(entries).toHaveLength(1);
    },
  );
});
