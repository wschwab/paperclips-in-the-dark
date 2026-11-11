import { describe, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { BLADES, newCharacter } from "../../src/suite-helpers.js";

const gamesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/games");

/** The settings-published stash→coin rate (FundMaxima.StashToCoinRate). */
function stashToCoinRate(stem: string): number {
  const settings = JSON.parse(readFileSync(resolve(gamesDir, `${stem}.json`), "utf8")) as {
    FundMaxima: { StashToCoinRate: number };
  };
  return settings.FundMaxima.StashToCoinRate;
}

/**
 * A10: fund.spend must fall back to stash liquidation at 2 stash → 1 coin when
 * the satchel is short (contract description), and fund.liquidate must convert
 * stash → satchel at 2:1 with SATCHEL_FULL / INSUFFICIENT_FUNDS errors.
 * The Ada server only spends from the satchel and has no fund.liquidate.
 */
describe("§5.1.8 fund spend stash-liquidation and fund.liquidate", () => {
  testCase("SEMANTICS-FUND-003", "fund.spend uses satchel first, then stash liquidation at 2:1", async () => {
    const character = await newCharacter();
    const satchelMax = character.fund.satchel.max;
    const stashMax = character.fund.stash.max;
    const rate = stashToCoinRate(BLADES);
    // Drain the satchel completely. Its starting fill comes from the game
    // settings (StartingSatchelCoins), so an already-empty satchel needs no
    // spend at all.
    const startingSatchel = character.fund.satchel.coins;
    if (startingSatchel > 0) {
      const drained = await api.characterOp(character.id, "fund.spend", { coins: startingSatchel });
      expect(drained.ok).toBe(true);
      expect(drained.character?.fund.satchel.coins).toBe(0);
    }
    expect((await api.character(character.id)).fund.satchel.coins).toBe(0);
    // Fill stash via gain overflow: the satchel fills to max, the rest lands
    // in stash 1:1, so gaining satchelMax + stashMax fills both exactly.
    const gained = await api.characterOp(character.id, "fund.gain", { coins: satchelMax + stashMax });
    expect(gained.ok).toBe(true);
    expect(gained.character?.fund.satchel.coins).toBe(satchelMax);
    const stashAfterGain = gained.character?.fund.stash.coins ?? 0;
    expect(stashAfterGain).toBe(stashMax);

    // Spend the full satchel → satchel 0, stash unchanged.
    const spendFull = await api.characterOp(character.id, "fund.spend", { coins: satchelMax });
    expect(spendFull.ok).toBe(true);
    expect(spendFull.character?.fund.satchel.coins).toBe(0);
    expect(spendFull.character?.fund.stash.coins).toBe(stashAfterGain);

    // Now spend 2 with empty satchel: liquidates 2 * StashToCoinRate stash.
    const beforeStash = (await api.character(character.id)).fund.stash.coins;
    const spend = await api.characterOp(character.id, "fund.spend", { coins: 2 });
    expect(spend.ok).toBe(true);
    expect(spend.character?.fund.satchel.coins).toBe(0);
    expect(spend.character?.fund.stash.coins).toBe(beforeStash - 2 * rate);
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
    const satchelMax = character.fund.satchel.max;
    const stashMax = character.fund.stash.max;
    const rate = stashToCoinRate(BLADES);
    // Fill the satchel and the stash via gain overflow (satchel first, then
    // stash 1:1).
    const gained = await api.characterOp(character.id, "fund.gain", { coins: satchelMax + stashMax });
    expect(gained.ok).toBe(true);
    const stashAfterGain = gained.character?.fund.stash.coins ?? 0;
    expect(stashAfterGain).toBe(stashMax);
    // Free satchel room so liquidate can land coins.
    const spent = await api.characterOp(character.id, "fund.spend", { coins: satchelMax });
    expect(spent.ok).toBe(true);
    const satchelBefore = spent.character?.fund.satchel.coins ?? 0;
    const stashBefore = spent.character?.fund.stash.coins ?? 0;
    expect(satchelBefore).toBe(0);

    // Liquidate 2 coins: costs 2 * StashToCoinRate stash.
    const liquidated = await api.characterOp(character.id, "fund.liquidate", { coins: 2 });
    expect(liquidated.ok).toBe(true);
    expect(liquidated.character?.fund.satchel.coins).toBe(satchelBefore + 2);
    expect(liquidated.character?.fund.stash.coins).toBe(stashBefore - 2 * rate);
  });

  testCase("SEMANTICS-FUND-006", "fund.liquidate with a full satchel → SATCHEL_FULL; stash short → INSUFFICIENT_FUNDS", async () => {
    const character = await newCharacter();
    const satchelMax = character.fund.satchel.max;
    // Fill the satchel to its settings maximum from its settings-derived
    // starting fill; the gain is exactly the room left, so no stash overflow.
    const room = satchelMax - character.fund.satchel.coins;
    if (room > 0) await api.characterOp(character.id, "fund.gain", { coins: room });
    const after = await api.character(character.id);
    expect(after.fund.satchel.coins).toBe(satchelMax);
    expect(after.fund.stash.coins).toBe(0);

    const full = await api.characterOp(character.id, "fund.liquidate", { coins: 1 });
    expect(full.ok).toBe(false);
    expect(full.error?.code).toBe("SATCHEL_FULL");

    // Free satchel room, then liquidate more than the (empty) stash can cover → INSUFFICIENT_FUNDS.
    const freed = await api.characterOp(character.id, "fund.spend", { coins: 2 });
    expect(freed.ok).toBe(true);
    const tooMuch = await api.characterOp(character.id, "fund.liquidate", { coins: 1 });
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.error?.code).toBe("INSUFFICIENT_FUNDS");
  });
});
