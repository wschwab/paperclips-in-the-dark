import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { characterOp, newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.1 BoundedInteger clamps and reports the applied delta", () => {
  testCase("SEMANTICS-BOUNDED-INTEGER-001", "stress addition clamps at the game maximum", async () => {
    const character = await newCharacter();
    const before = character.monitor.stress.current;
    const requested = character.monitor.stress.max + 3;
    const result = await api.characterOp(character.id, "stress.add", { delta: requested });
    expect(result.ok).toBe(true);
    const updated = result.character;
    expect(updated?.monitor.stress.current).toBe(character.monitor.stress.max);
    expect(result.applied.requested).toBe(requested);
    expect(result.applied.effective).toBe(character.monitor.stress.max - before);
  });

  testCase("SEMANTICS-BOUNDED-INTEGER-002", "action ratings clamp below zero", async () => {
    const character = await newCharacter();
    const action = character.talent.attributes[0]?.actions[0];
    if (!action) throw new Error("created character has no actions");
    const updated = await characterOp(character, "action.set-rating", { action: action.name, rating: 0 });
    const result = await api.characterOp(updated.id, "action.set-rating", { action: action.name, rating: -1 });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
  });
});
