import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

describe("persistence revisions and concurrency", () => {
  testCase("PERSISTENCE-REVISION-001", "a stale If-Match returns STALE_REVISION", async () => {
    const character = await newCharacter();
    const first = await api.characterOp(character.id, "stress.add", { delta: 1 }, character.revision);
    expect(first.ok).toBe(true);
    const stale = await api.post(`characters/${character.id}/ops/stress.add`, { delta: 1 }, { "If-Match": String(character.revision) });
    expect(stale.status).toBe(409);
    const result = await api.operation(stale);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("STALE_REVISION");
  });

  testCase("PERSISTENCE-REVISION-002", "one of two same-revision writes loses the race", async () => {
    const character = await newCharacter();
    const headers = { "If-Match": String(character.revision) };
    const responses = await Promise.all([
      api.post(`characters/${character.id}/ops/stress.add`, { delta: 1 }, headers),
      api.post(`characters/${character.id}/ops/stress.add`, { delta: 1 }, headers),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
  });

  testCase("PERSISTENCE-REVISION-003", "idempotency repeats the original operation result", async () => {
    const character = await newCharacter();
    const headers = { "Idempotency-Key": `conformance-${character.id}` };
    const first = await api.post(`characters/${character.id}/ops/stress.add`, { delta: 1 }, headers);
    const second = await api.post(`characters/${character.id}/ops/stress.add`, { delta: 1 }, headers);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.rawBody).toBe(first.rawBody);
  });

  testCase("PERSISTENCE-REVISION-004", "a stale If-Match on a C3 crew op returns STALE_REVISION", async () => {
    const crew = await newCrew();
    const first = await api.crewOp(crew.id, "contact.add", { name: "Rolan Wott", profession: "magistrate" }, crew.revision);
    expect(first.ok).toBe(true);
    const stale = await api.post(`crews/${crew.id}/ops/contact.add`, { name: "Second", profession: "spy" }, { "If-Match": String(crew.revision) });
    expect(stale.status).toBe(409);
    const result = await api.operation(stale);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("STALE_REVISION");
  });

  testCase("PERSISTENCE-REVISION-005", "idempotency repeats the original C3 crew op result", async () => {
    const crew = await newCrew();
    const headers = { "Idempotency-Key": `conformance-c3-${crew.id}` };
    const first = await api.post(`crews/${crew.id}/ops/contact.add`, { name: "Rolan Wott", profession: "magistrate" }, headers);
    const second = await api.post(`crews/${crew.id}/ops/contact.add`, { name: "Rolan Wott", profession: "magistrate" }, headers);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.rawBody).toBe(first.rawBody);
  });
});
