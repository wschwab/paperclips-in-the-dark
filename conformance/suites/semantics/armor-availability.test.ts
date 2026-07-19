import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.4 armor availability is derived from state", () => {
  testCase("SEMANTICS-ARMOR-AVAILABILITY-001", "unavailable special armor is a typed error", async () => {
    const character = await newCharacter();
    expect(typeof character.monitor.armor.hasSpecial).toBe("boolean");
    if (character.monitor.armor.hasSpecial) return;
    const result = await api.characterOp(character.id, "armor.set", { armor: "special", used: true });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ARMOR_NOT_AVAILABLE");
  });

  testCase("SEMANTICS-ARMOR-AVAILABILITY-002", "clearing an armor-used flag is always permitted", async () => {
    const character = await newCharacter();
    const result = await api.characterOp(character.id, "armor.set", { armor: "special", used: false });
    expect(result.ok).toBe(true);
    expect(result.character?.monitor.armor.specialUsed).toBe(false);
  });
});
