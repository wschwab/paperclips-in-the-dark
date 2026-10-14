import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { validate } from "../../src/contract-validator.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";
import { testCase } from "../../src/test-case.js";

describe("UNKNOWN-OP-01 rejects unknown single operations, preserves batch reporting", () => {
  for (const kind of ["character", "crew"] as const) {
    testCase(`UNKNOWN-OP-SINGLE-${kind.toUpperCase()}-001`, `${kind} unknown operation returns VALIDATION400 without a write`, async () => {
      const entity = kind === "character" ? await newCharacter() : await newCrew();
      const collection = kind === "character" ? "characters" : "crews";
      const before = await api.get(`${collection}/${entity.id}`);
      const history = await api.get(`${collection}/${entity.id}/history`);
      const response = await api.post(`${collection}/${entity.id}/ops/no.such-operation`, {}, {
        "If-Match": String(entity.revision),
        "Idempotency-Key": `unknown-${entity.id}`,
      });
      expect(response.status).toBe(400);
      expect(validate("operationResult", response.body).errors).toEqual([]);
      const result = await api.operation(response);
      expect(result.ok).toBe(false);
      expect(result.error).toMatchObject({ code: "VALIDATION", status: 400 });
      expect(result.error?.details.issues.length).toBeGreaterThan(0);
      expect((await api.get(`${collection}/${entity.id}`)).body).toEqual(before.body);
      expect((await api.get(`${collection}/${entity.id}/history`)).body).toEqual(history.body);
    });
  }

  testCase("UNKNOWN-OP-BATCH-001", "unknown and schema-invalid members use identical failed-outcome reporting and roll back all writes", async () => {
    for (const invalid of [
      { op: "no.such-operation", args: {} },
      { op: "stress.add", args: { delta: "not-an-integer" } },
    ]) {
      const entity = await newCharacter();
      const before = await api.get(`characters/${entity.id}`);
      const history = await api.get(`characters/${entity.id}/history`);
      const response = await api.post("campaign/batch", { ops: [
        { entity: "character", id: entity.id, op: "stress.add", args: { delta: 1 } },
        { entity: "character", id: entity.id, ...invalid },
        { entity: "character", id: entity.id, op: "stress.add", args: { delta: 1 } },
      ] });
      expect(response.status).toBe(200);
      expect(validate("operationResult", response.body).errors).toEqual([]);
      const result = await api.operation(response);
      // Frozen aggregate success means outcomes evaluated, not writes committed.
      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(result.batch).toHaveLength(3);
      expect(result.batch?.map(item => item.ok)).toEqual([true, false, true]);
      expect(result.batch?.[1]?.error).toMatchObject({ code: "VALIDATION", status: 400 });
      expect((await api.get(`characters/${entity.id}`)).body).toEqual(before.body);
      expect((await api.get(`characters/${entity.id}/history`)).body).toEqual(history.body);
    }
  });
});
