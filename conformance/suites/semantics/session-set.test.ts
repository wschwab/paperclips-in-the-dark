import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.12 session expression tracks clamp and clear", () => {
  testCase("SEMANTICS-SESSION-SET-001", "session.set updates a track, clamps at max, and clears back down", async () => {
    const character = await newCharacter();
    const max = character.session.max;
    expect(max).toBeGreaterThan(0);

    const first = await api.characterOp(character.id, "session.set", { playbookExpressions: 2 });
    expect(first.ok).toBe(true);
    expect(first.character?.session.playbookExpressions).toBe(2);
    expect(first.applied.requested).toBe(2);
    expect(first.applied.effective).toBe(2);

    const over = await api.characterOp(character.id, "session.set", { playbookExpressions: max + 5 });
    expect(over.ok).toBe(true);
    expect(over.character?.session.playbookExpressions).toBe(max);
    expect(over.applied.requested).toBe(max + 5);
    expect(over.applied.effective).toBe(max);

    const cleared = await api.characterOp(character.id, "session.set", { playbookExpressions: 0 });
    expect(cleared.ok).toBe(true);
    expect(cleared.character?.session.playbookExpressions).toBe(0);
    expect(cleared.applied.requested).toBe(0);
    expect(cleared.applied.effective).toBe(0);
  });
});
