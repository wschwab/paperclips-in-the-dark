import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.2 harm spillover and exact removal", () => {
  testCase("SEMANTICS-HARM-SPILLOVER-001", "full severe harm rolls upward into fatal", async () => {
    const character = await newCharacter();
    const first = await api.characterOp(character.id, "harm.add", { description: "major wound", intensity: "severe" });
    expect(first.ok).toBe(true);
    const second = await api.characterOp(character.id, "harm.add", { description: "worse wound", intensity: "severe" });
    expect(second.ok).toBe(true);
    expect(second.applied.landedIntensity).toBe("fatal");
    expect(second.character?.monitor.harm.fatal).toContain("worse wound");
    expect(second.sideEffects.length).toBeGreaterThan(0);
  });

  testCase("SEMANTICS-HARM-SPILLOVER-002", "removing one intensity does not cascade another slot", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "harm.add", { description: "lesser wound", intensity: "lesser" });
    const withModerate = await api.characterOp(character.id, "harm.add", {
      description: "moderate wound",
      intensity: "moderate",
    });
    expect(withModerate.ok).toBe(true);
    const removed = await api.characterOp(character.id, "harm.remove", {
      description: "lesser wound",
      intensity: "lesser",
    });
    expect(removed.ok).toBe(true);
    expect(removed.character?.monitor.harm.moderate).toContain("moderate wound");
  });
});
