import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCrew } from "../../src/suite-helpers.js";

describe("persistence repeatability", () => {
  testCase("PERSISTENCE-REPEATABILITY-001", "roster remains available as persisted crews accumulate", async () => {
    const crews = [];
    for (let index = 0; index < 12; index += 1) {
      crews.push(await newCrew());
    }

    const roster = await api.get("campaign/roster");
    expect(roster.status).toBe(200);
    const body = roster.body as { crews: Array<{ id: string }> };
    for (const crew of crews) {
      expect(body.crews.some((item) => item.id === crew.id)).toBe(true);
    }
  });

  testCase("PERSISTENCE-REPEATABILITY-002", "deletion does not make a live entity ID reusable", async () => {
    const first = await newCrew();
    const survivor = await newCrew();
    const deleted = await api.post(`crews/${first.id}/delete`, { confirm: true });
    expect(deleted.status).toBe(200);

    const replacement = await newCrew();
    expect(replacement.id).not.toBe(survivor.id);
    const stillPresent = await api.crew(survivor.id);
    expect(stillPresent.id).toBe(survivor.id);
  });
});
