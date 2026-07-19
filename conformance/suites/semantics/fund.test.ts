import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.8 fund gains expose partial capacity", () => {
  testCase("SEMANTICS-FUND-001", "satchel then stash fill and overflow is visible", async () => {
    const character = await newCharacter();
    const available = character.fund.satchel.max - character.fund.satchel.coins + character.fund.stash.max - character.fund.stash.coins;
    const requested = available + 3;
    const result = await api.characterOp(character.id, "fund.gain", { coins: requested });
    expect(result.ok).toBe(true);
    expect(result.applied.requested).toBe(requested);
    expect(result.applied.effective).toBeLessThan(requested);
    expect(result.sideEffects.length).toBeGreaterThan(0);
  });

  testCase("SEMANTICS-FUND-002", "spending uses satchel before stash liquidation", async () => {
    const character = await newCharacter();
    const beforeSatchel = character.fund.satchel.coins;
    const result = await api.characterOp(character.id, "fund.spend", { coins: 1 });
    expect(result.ok).toBe(true);
    expect(result.character?.fund.satchel.coins).toBe(Math.max(0, beforeSatchel - 1));
  });
});
