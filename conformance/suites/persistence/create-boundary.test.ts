import { describe, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";

const stem = "blades-in-the-dark";
const setting = gameSetting(stem);
const playbook = firstPlaybook(stem);
function pcRatings(): Record<string, number> {
  const defaults = Object.fromEntries(setting.Playbooks.find((p) => p.Name === playbook)!.DefaultActionPoints.map((p) => [p.Action, p.Points]));
  const ratings = Object.fromEntries(setting.Attributes.flatMap((a) => a.Actions.map((x) => [x.Name, defaults[x.Name] ?? 0])));
  let remaining = setting.StartingActionDots! - Object.values(ratings).reduce((a, b) => a + b, 0);
  while (remaining > 0) {
    let allocated = false;
    for (const name of Object.keys(ratings)) {
      if (remaining > 0 && !(name in defaults) && ratings[name]! < setting.StartingActionDotMax!) {
        ratings[name]! += 1;
        remaining -= 1;
        allocated = true;
      }
    }
    if (!allocated) throw new Error("settings cannot allocate starting action dots");
  }
  return ratings;
}
const routes = [
  ["characters", "character", { gameStem: stem, playbook }],
  ["crews", "crew", { gameStem: stem, crewType: "Custom crew" }],
  ["characters/pc", "character", { gameStem: stem, playbook, actionRatings: pcRatings() }],
  ["clocks", "clock", { name: "Concurrent clock", behavior: "bounded", size: 4, ownerKind: "campaign", ownerId: "", purpose: "custom", relatedClockIds: [] }],
] as const;

describe("shared create idempotency boundary", () => {
  for (const [index, [route, kind, body]] of routes.entries()) {
    const id = (offset: number) => `PERSISTENCE-IDEMPOTENCY-${String(7 + index * 3 + offset).padStart(3, "0")}`;
    testCase(id(0), `${route} exact retries replay bytes and distinct keys create independently`, async () => {
      const headers = { "Idempotency-Key": randomUUID() };
      const first = await api.post(route, body, headers);
      expect(first.status).toBe(200);
      const entity = (await api.operation(first))[kind];
      if (!entity) throw new Error("create returned no entity");
      expect((await api.post(route, body, headers)).rawBody).toBe(first.rawBody);
      expect((await api.post(route, body, { "Idempotency-Key": randomUUID() })).rawBody).not.toBe(first.rawBody);
      expect((await api.get(`${kind === "character" ? "characters" : `${kind}s`}/${entity.id}`)).body).toEqual(entity);
    });
    testCase(id(1), `${route} concurrent identical retries persist exactly one entity`, async () => {
      const collection = kind === "character" ? "characters" : `${kind}s`;
      const before = new Set((await api.get(collection)).body.map((row: { id: string }) => row.id));
      const headers = { "Idempotency-Key": randomUUID() };
      const responses = await Promise.all(Array.from({ length: 12 }, () => api.post(route, body, headers)));
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect.soft(response.rawBody).toBe(responses[0]!.rawBody);
      }
      const entity = (await api.operation(responses[0]!))[kind];
      const added = (await api.get(collection)).body.filter((row: { id: string }) => !before.has(row.id));
      expect.soft(added.map((row: { id: string }) => row.id)).toEqual([entity!.id]);
    });
    testCase(id(2), `${route} validation failures do not consume a retry key`, async () => {
      const headers = { "Idempotency-Key": randomUUID() };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const invalid = await api.post(route, {}, headers);
        expect(invalid.status).toBe(400);
        expect((await api.operation(invalid)).error?.code).toBe("VALIDATION");
      }
      const valid = await api.post(route, body, headers);
      expect(valid.status).toBe(200);
      expect((await api.operation(valid)).ok).toBe(true);
      expect((await api.post(route, body, headers)).rawBody).toBe(valid.rawBody);
    });
  }
  testCase("PERSISTENCE-IDEMPOTENCY-019", "the same create key on different routes remains independently scoped", async () => {
    const headers = { "Idempotency-Key": randomUUID() };
    for (const [route, kind, body] of routes) {
      const first = await api.post(route, body, headers);
      expect(first.status).toBe(200);
      expect((await api.operation(first))[kind]).toBeDefined();
      expect((await api.post(route, body, headers)).rawBody).toBe(first.rawBody);
    }
  });
});
