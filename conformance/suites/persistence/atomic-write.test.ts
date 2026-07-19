import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("persistence atomic-write crash hook", () => {
  testCase("PERSISTENCE-ATOMIC-001", "the optional crash hook never exposes a partial JSON document", async () => {
    const character = await newCharacter();
    const hook = await api.post("test-hooks/crash-mid-write", { entity: "character", id: character.id });
    expect([204, 404, 501]).toContain(hook.status);
    const current = await api.get(`characters/${character.id}`);
    expect([200, 404, 502, 503]).toContain(current.status);
    if (current.status === 200) expect(() => JSON.parse(current.rawBody)).not.toThrow();
  });
});
