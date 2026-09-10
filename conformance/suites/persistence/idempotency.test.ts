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

  testCase(
    "PERSISTENCE-IDEMPOTENCY-005",
    "an immediate identical clock-create retry replays one persisted clock while distinct keys create independently",
    async () => {
      const marker = await api.createClock("Clock retry scope", "bounded", 4);
      if (!marker.clock) throw new Error("create returned no clock");
      const body = {
        name: `Retry clock ${marker.clock.id}`,
        behavior: "bounded", size: 4, ownerKind: "campaign", ownerId: "",
        purpose: "custom", relatedClockIds: [],
      };
      const headers = { "Idempotency-Key": `clock-create-${marker.clock.id}` };
      const first = await api.post("clocks", body, headers);
      const retry = await api.post("clocks", body, headers);
      expect(first.status).toBe(200);
      expect(retry.status).toBe(200);
      const created = await api.operation(first);
      expect(created.ok).toBe(true);
      if (!created.clock) throw new Error("create returned no clock");
      expect.soft(retry.rawBody).toBe(first.rawBody);
      const rows = await decode(Schemas.ClockList, (await api.get("clocks")).body);
      expect.soft(rows.filter((row) => row.name === body.name).map((row) => row.id)).toEqual([created.clock.id]);
      expect(await api.clock(created.clock.id)).toEqual(created.clock);

      const independent = await api.post("clocks", body, { "Idempotency-Key": `${headers["Idempotency-Key"]}-other` });
      expect(independent.status).toBe(200);
      const second = await api.operation(independent);
      expect(second.ok).toBe(true);
      expect(second.clock?.id).not.toBe(created.clock.id);
      const finalRows = await decode(Schemas.ClockList, (await api.get("clocks")).body);
      expect(finalRows.filter((row) => row.name === body.name).map((row) => row.id).sort())
        .toEqual([created.clock.id, second.clock!.id].sort());
    },
  );

  testCase(
    "PERSISTENCE-IDEMPOTENCY-006",
    "failed clock creation remains a validation error and does not consume a retry key",
    async () => {
      const marker = await api.createClock("Clock validation scope", "bounded", 4);
      if (!marker.clock) throw new Error("create returned no clock");
      const headers = { "Idempotency-Key": `clock-error-${marker.clock.id}` };
      const body = {
        name: `Valid clock ${marker.clock.id}`, behavior: "bounded", size: 4,
        ownerKind: "campaign", ownerId: "", purpose: "custom", relatedClockIds: [],
      };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const invalid = await api.post("clocks", { ...body, name: "" }, headers);
        expect(invalid.status).toBe(400);
        const result = await api.operation(invalid);
        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe("VALIDATION");
      }
      const valid = await api.post("clocks", body, headers);
      expect(valid.status).toBe(200);
      const created = await api.operation(valid);
      expect(created.ok).toBe(true);
      expect(created.clock?.name).toBe(body.name);
      const retry = await api.post("clocks", body, headers);
      expect(retry.status).toBe(200);
      expect(retry.rawBody).toBe(valid.rawBody);
    },
  );
});
