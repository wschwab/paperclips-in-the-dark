import { describe, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { api } from "../../src/api.js";
import { firstPlaybook } from "../../src/game-data.js";
import { validate } from "../../src/contract-validator.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

const recovery = "This is a server defect. Report it; do not change the request.";

describe("INTERNAL server-defect contract", () => {
  testCase("INTERNAL-ERROR-OPENAPI-001", "every routed OpenAPI operation declares its shared 500 envelope", async () => {
    const document = YAML.parse(await readFile(new URL("../../../contract/openapi.yaml", import.meta.url), "utf8")) as {
      paths: Record<string, Record<string, { operationId?: string; responses?: Record<string, { $ref?: string }> }>>;
    };
    let checked = 0;
    for (const item of Object.values(document.paths)) {
      for (const operation of Object.values(item)) {
        if (!operation.operationId) continue;
        checked++;
        expect(operation.responses?.["500"], operation.operationId).toEqual({ $ref: "#/components/responses/OpResult" });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  testCase("INTERNAL-ERROR-SCHEMA-001", "strict envelope accepts INTERNAL500 and rejects inconsistent status/retryability", async () => {
    const error = { code: "INTERNAL", status: 500, message: "Internal server failure", retryable: false, recovery, details: {} };
    const body = { ok: false, applied: { op: "request" }, sideEffects: [], error };
    expect(validate("operationResult", body).errors).toEqual([]);
    expect(validate("operationResult", body).valid).toBe(true);
    await decode(Schemas.OperationResult, body);
    for (const invalid of [
      { ...error, status: 400 },
      { ...error, retryable: true },
      { ...error, recovery: "Change the request and retry." },
      { ...error, details: { exception: "private stack trace" } },
    ]) expect(validate("operationResult", { ...body, error: invalid }).valid).toBe(false);
  });

  testCase("INTERNAL-ERROR-FAULT-001", "existing crash-mid-write seam returns INTERNAL500 without changing old bytes and remains usable", async () => {
    const created = await api.createCharacter("blades-in-the-dark", firstPlaybook("blades-in-the-dark"));
    expect(created.ok).toBe(true);
    const character = created.character!;
    const path = join((await api.health()).dataDir, "characters", character.id, "current.json");
    const before = await readFile(path, "utf8");
    const armed = await api.post("test-hooks/crash-mid-write", { entity: "character", id: character.id });
    expect(armed.status).toBe(204);
    const failed = await api.post(`characters/${character.id}/ops/stress.add`, { delta: 1 }, { "If-Match": String(character.revision) });
    expect(failed.status).toBe(500);
    expect(failed.body).toMatchObject({ ok: false, error: { code: "INTERNAL", status: 500, retryable: false, recovery, details: {} } });
    expect(validate("operationResult", failed.body).errors).toEqual([]);
    expect(failed.rawBody).not.toContain("crash-mid-write");
    expect(failed.rawBody).not.toContain("Device_Error");
    expect(await readFile(path, "utf8")).toBe(before);
    const reread = await api.get(`characters/${character.id}`);
    expect(reread.status).toBe(200);
    expect(reread.body).toMatchObject({ revision: character.revision });
    const retried = await api.post(`characters/${character.id}/ops/stress.add`, { delta: 1 }, { "If-Match": String(character.revision) });
    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({ ok: true });
  });

  testCase("INTERNAL-ERROR-CLIENT-001", "invalid client input stays VALIDATION400", async () => {
    const response = await api.post("characters", {});
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: { code: "VALIDATION", status: 400, retryable: true } });
    expect(validate("operationResult", response.body).valid).toBe(true);
    const malformed = await fetch(`${api.baseUrl}/characters`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{",
    });
    expect(malformed.status).toBe(400);
    const malformedBody: unknown = await malformed.json();
    expect(malformedBody).toMatchObject({ ok: false, error: { code: "VALIDATION", status: 400, retryable: true } });
    expect(validate("operationResult", malformedBody).valid).toBe(true);
  });
});
