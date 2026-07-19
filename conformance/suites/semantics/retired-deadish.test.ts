import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.9 retirement and deadish flags are distinct", () => {
  testCase("SEMANTICS-RETIRED-DEADISH-001", "the final trauma retires the character and exposes both flags", async () => {
    let character = await newCharacter();
    const missing = character.monitor.trauma.max - character.monitor.trauma.traumas.length;
    for (let index = 0; index < missing; index += 1) {
      const result = await api.characterOp(character.id, "trauma.add", { trauma: `Trauma ${index}` });
      expect(result.ok).toBe(true);
      if (!result.character) throw new Error("trauma result did not contain character");
      character = result.character;
    }
    expect(character.isRetired).toBe(true);
    expect(typeof character.isDeadish).toBe("boolean");
    expect(character.monitor.trauma.traumas.length).toBe(character.monitor.trauma.max);
  });

  testCase("SEMANTICS-RETIRED-DEADISH-002", "retired reads work but notebook writes return RETIRED", async () => {
    const character = await newCharacter();
    let retired = character;
    for (let index = character.monitor.trauma.traumas.length; index < character.monitor.trauma.max; index += 1) {
      const result = await api.characterOp(character.id, "trauma.add", { trauma: `Retirement ${index}` });
      expect(result.ok).toBe(true);
      if (!result.character) throw new Error("trauma result did not contain character");
      retired = result.character;
    }
    expect((await api.character(retired.id)).isRetired).toBe(true);
    const write = await api.characterOp(retired.id, "notebook.set", { text: "not allowed" });
    expect(write.ok).toBe(false);
    expect(write.error?.code).toBe("RETIRED");
    const remove = await api.characterOp(retired.id, "trauma.remove", { trauma: retired.monitor.trauma.traumas[0] });
    expect(remove.ok).toBe(true);
  });
});
