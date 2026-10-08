import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, successfulCharacter } from "../../src/suite-helpers.js";

// CONTRACT-CONTACTS-01 (human ruling 2026-10-08): contact closeness has five
// levels, ordered enemy < rival < contact < friend < confidante. The default
// stays "contact". This file is additive; the frozen three-level tests in
// character-contacts.test.ts are unchanged.

describe("CONTRACT-CONTACTS-01 contact closeness levels", () => {
  testCase("CONTACTS-LEVELS-001", "contact.closeness sets confidante and enemy and persists each", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Tessa, a fence" });
    for (const level of ["confidante", "enemy"] as const) {
      const result = await api.characterOp(character.id, "contact.closeness", { name: "Tessa, a fence", closeness: level });
      expect(result.ok).toBe(true);
      expect(successfulCharacter(result).contacts.find((c) => c.name === "Tessa, a fence")?.closeness).toBe(level);
    }
  });

  testCase("CONTACTS-LEVELS-002", "contact.closeness still rejects a value outside the five-level scale with VALIDATION", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "contact.add", { name: "Tessa, a fence" });
    const result = await api.characterOp(character.id, "contact.closeness", { name: "Tessa, a fence", closeness: "best-friend" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });
});
