import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.3 stress overflow is advisory only", () => {
  testCase("SEMANTICS-STRESS-OVERFLOW-001", "full stress does not add trauma automatically", async () => {
    const character = await newCharacter();
    const filled = await api.characterOp(character.id, "stress.add", { delta: character.monitor.stress.max });
    expect(filled.ok).toBe(true);
    const overflow = await api.characterOp(character.id, "stress.add", { delta: 1 });
    expect(overflow.ok).toBe(true);
    expect(overflow.character?.monitor.stress.current).toBe(character.monitor.stress.max);
    expect(overflow.character?.monitor.trauma.traumas).toEqual(character.monitor.trauma.traumas);
    expect(overflow.sideEffects.join(" ")).toContain("stress full");
  });

  testCase("SEMANTICS-STRESS-OVERFLOW-002", "trauma is a separate explicit operation", async () => {
    const character = await newCharacter();
    const result = await api.characterOp(character.id, "trauma.add", { trauma: "Haunted" });
    expect(result.ok).toBe(true);
    expect(result.character?.monitor.trauma.traumas).toContain("Haunted");
  });
});
