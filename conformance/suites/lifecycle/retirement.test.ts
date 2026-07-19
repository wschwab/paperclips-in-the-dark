import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("lifecycle retirement", () => {
  testCase("LIFECYCLE-RETIREMENT-001", "a retired character remains readable", async () => {
    const character = await newCharacter();
    let latest = character;
    for (let index = character.monitor.trauma.traumas.length; index < character.monitor.trauma.max; index += 1) {
      const result = await api.characterOp(character.id, "trauma.add", { trauma: `Life trauma ${index}` });
      expect(result.ok).toBe(true);
      if (!result.character) throw new Error("missing character after trauma");
      latest = result.character;
    }
    const read = await api.get(`characters/${latest.id}`);
    expect(read.status).toBe(200);
    expect((read.body as { isRetired: boolean }).isRetired).toBe(true);
  });

  testCase("LIFECYCLE-RETIREMENT-002", "character deletion requires confirmation", async () => {
    const character = await newCharacter();
    const rejected = await api.post(`characters/${character.id}/delete`, { confirm: false });
    expect(rejected.status).toBe(200);
    const rejectedResult = await api.operation(rejected);
    expect(rejectedResult.ok).toBe(false);
    expect(rejectedResult.error?.code).toBe("CONFIRM_REQUIRED");
    const deleted = await api.post(`characters/${character.id}/delete`, { confirm: true });
    expect(deleted.status).toBe(200);
  });
});
