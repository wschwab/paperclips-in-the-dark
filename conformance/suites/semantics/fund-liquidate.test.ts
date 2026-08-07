import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

/**
 * A10: fund.spend must fall back to stash liquidation at 2 stash → 1 coin when
 * the satchel is short (contract description), and fund.liquidate must convert
 * stash → satchel at 2:1 with SATCHEL_FULL / INSUFFICIENT_FUNDS errors.
 * The Ada server only spends from the satchel and has no fund.liquidate.
 */
describe("§5.1.8 fund spend stash-liquidation and fund.liquidate", () => {
  testCase("SEMANTICS-FUND-003", "fund.spend uses satchel first, then stash liquidation at 2:1", async () => {
    const character = await newCharacter();
    // Drain the satchel completely (initial satchel 2/4; stash 0).
    const drained = await api.characterOp(character.id, "fund.spend", { coins: 2 });
    expect(drained.ok).toBe(true);
    expect(drained.character?.fund.satchel.coins).toBe(0);
    // Fill stash via gain overflow (satchel fills to max, rest goes to stash).
    const gained = await api.characterOp(character.id, "fund.gain", { coins: 40 });
    expect(gained.ok).toBe(true);
    expect(gained.character?.fund.satchel.coins).toBe(gained.character?.fund.satchel.max ?? 0);
    const stashAfterGain = gained.character?.fund.stash.coins ?? 0;
    expect(stashAfterGain).toBeGreaterThanOrEqual(4);

    // Spend 4 from a full satchel → satchel 0, stash unchanged.
    const spendFull = await api.characterOp(character.id, "fund.spend", { coins: 4 });
    expect(spendFull.ok).toBe(true);
    expect(spendFull.character?.fund.satchel.coins).toBe(0);
    expect(spendFull.character?.fund.stash.coins).toBe(stashAfterGain);

    // Now spend 2 with empty satchel: liquidates 4 stash.
    const beforeStash = (await api.character(character.id)).fund.stash.coins;
    const spend = await api.characterOp(character.id, "fund.spend", { coins: 2 });
    expect(spend.ok).toBe(true);
    expect(spend.character?.fund.satchel.coins).toBe(0);
    expect(spend.character?.fund.stash.coins).toBe(beforeStash - 4);
  });

  testCase("SEMANTICS-FUND-004", "fund.spend beyond max affordable → INSUFFICIENT_FUNDS", async () => {
    const character = await newCharacter();
    const tooMuch = character.fund.satchel.max + character.fund.stash.max + 5;
    const result = await api.characterOp(character.id, "fund.spend", { coins: tooMuch });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INSUFFICIENT_FUNDS");
  });

  testCase("SEMANTICS-FUND-005", "fund.liquidate converts stash to satchel at 2:1", async () => {
    const character = await newCharacter();
    // Fill stash via gain overflow.
    const gained = await api.characterOp(character.id, "fund.gain", { coins: 40 });
    expect(gained.ok).toBe(true);
    const stashAfterGain = gained.character?.fund.stash.coins ?? 0;
    expect(stashAfterGain).toBeGreaterThanOrEqual(4);
    // Free satchel room so liquidate can land coins.
    const spent = await api.characterOp(character.id, "fund.spend", { coins: 4 });
    expect(spent.ok).toBe(true);
    const satchelBefore = spent.character?.fund.satchel.coins ?? 0;
    const stashBefore = spent.character?.fund.stash.coins ?? 0;
    expect(satchelBefore).toBe(0);

    // Liquidate 2 coins: costs 4 stash.
    const liquidated = await api.characterOp(character.id, "fund.liquidate", { coins: 2 });
    expect(liquidated.ok).toBe(true);
    expect(liquidated.character?.fund.satchel.coins).toBe(satchelBefore + 2);
    expect(liquidated.character?.fund.stash.coins).toBe(stashBefore - 4);
  });

  testCase("SEMANTICS-FUND-006", "fund.liquidate with a full satchel → SATCHEL_FULL; stash short → INSUFFICIENT_FUNDS", async () => {
    const character = await newCharacter();
    // Fill satchel to max (initial 2 + gain 2).
    await api.characterOp(character.id, "fund.gain", { coins: 2 });
    const after = await api.character(character.id);
    expect(after.fund.satchel.coins).toBe(after.fund.satchel.max);

    const full = await api.characterOp(character.id, "fund.liquidate", { coins: 1 });
    expect(full.ok).toBe(false);
    expect(full.error?.code).toBe("SATCHEL_FULL");

    // Free satchel room, then liquidate more than stash can cover → INSUFFICIENT_FUNDS.
    await api.characterOp(character.id, "fund.spend", { coins: 2 });
    const tooMuch = await api.characterOp(character.id, "fund.liquidate", { coins: 1 });
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.error?.code).toBe("INSUFFICIENT_FUNDS");
  });
});
