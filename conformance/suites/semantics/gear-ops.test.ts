import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

/**
 * A9: the five gear ops (add/remove/commit/uncommit/clear-commitments) are
 * implemented per the C# domain semantics (Gear.cs): add → availableGear,
 * remove → availableGear + loadout, commit → loadout with preconditions,
 * uncommit → loadout, clear-commitments → loadout + commitment reset.
 */
describe("§5.1 gear ops add/remove/commit/uncommit/clear-commitments", () => {
  testCase("SEMANTICS-GEAR-OPS-001", "gear.add appends to availableGear; duplicate name → DUPLICATE", async () => {
    const character = await newCharacter();
    const added = await api.characterOp(character.id, "gear.add", { name: "Fine sword", bulk: 2 });
    expect(added.ok).toBe(true);
    expect(added.character?.gear.availableGear).toContainEqual({ name: "Fine sword", bulk: 2 });
    expect(added.character?.gear.loadout).not.toContainEqual(expect.objectContaining({ name: "Fine sword" }));

    const duplicate = await api.characterOp(character.id, "gear.add", { name: "Fine sword", bulk: 2 });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error?.code).toBe("DUPLICATE");
  });

  testCase("SEMANTICS-GEAR-OPS-002", "gear.commit moves an available item into loadout with preconditions; over-bulk and duplicate rejected", async () => {
    const character = await newCharacter();
    // No commitment yet → NO_COMMITMENT.
    await api.characterOp(character.id, "gear.add", { name: "Fine sword", bulk: 2 });
    const noCommitment = await api.characterOp(character.id, "gear.commit", { name: "Fine sword" });
    expect(noCommitment.ok).toBe(false);
    expect(noCommitment.error?.code).toBe("NO_COMMITMENT");

    // Unknown item → NOT_FOUND.
    const unknown = await api.characterOp(character.id, "gear.commit", { name: "Ghost blade" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.code).toBe("NOT_FOUND");

    // Commit under light commitment (maxBulk 3): bulk 2 fits.
    await api.characterOp(character.id, "gear.set-commitment", { commitment: "light" });
    const committed = await api.characterOp(character.id, "gear.commit", { name: "Fine sword" });
    expect(committed.ok).toBe(true);
    expect(committed.character?.gear.loadout).toContainEqual({ name: "Fine sword", bulk: 2 });

    // Already in loadout → DUPLICATE.
    const again = await api.characterOp(character.id, "gear.commit", { name: "Fine sword" });
    expect(again.ok).toBe(false);
    expect(again.error?.code).toBe("DUPLICATE");

    // Over bulk: add bulk-9 item, commit under light (maxBulk 3) → OVER_BULK.
    await api.characterOp(character.id, "gear.add", { name: "Greatcoat", bulk: 9 });
    const over = await api.characterOp(character.id, "gear.commit", { name: "Greatcoat" });
    expect(over.ok).toBe(false);
    expect(over.error?.code).toBe("OVER_BULK");
  });

  testCase("SEMANTICS-GEAR-OPS-003", "gear.uncommit removes from loadout; lock blocks commit; clear-commitments resets loadout and commitment", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "gear.add", { name: "Fine sword", bulk: 2 });
    await api.characterOp(character.id, "gear.set-commitment", { commitment: "heavy" });
    await api.characterOp(character.id, "gear.commit", { name: "Fine sword" });

    // Locked → commit fails COMMITMENT_LOCKED; uncommit also blocked.
    await api.characterOp(character.id, "gear.lock");
    const lockedCommit = await api.characterOp(character.id, "gear.commit", { name: "Greatcoat" });
    expect(lockedCommit.ok).toBe(false);
    expect(lockedCommit.error?.code).toBe("COMMITMENT_LOCKED");
    const lockedUncommit = await api.characterOp(character.id, "gear.uncommit", { name: "Fine sword" });
    expect(lockedUncommit.ok).toBe(false);
    expect(lockedUncommit.error?.code).toBe("COMMITMENT_LOCKED");

    await api.characterOp(character.id, "gear.unlock");
    const uncommitted = await api.characterOp(character.id, "gear.uncommit", { name: "Fine sword" });
    expect(uncommitted.ok).toBe(true);
    expect(uncommitted.character?.gear.loadout.find((item) => item.name === "Fine sword")).toBeUndefined();

    // Unknown uncommit → NOT_FOUND.
    const unknown = await api.characterOp(character.id, "gear.uncommit", { name: "Ghost blade" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.code).toBe("NOT_FOUND");

    // Clear-commitments resets loadout and commitment to none.
    await api.characterOp(character.id, "gear.commit", { name: "Fine sword" });
    const cleared = await api.characterOp(character.id, "gear.clear-commitments");
    expect(cleared.ok).toBe(true);
    expect(cleared.character?.gear.loadout).toHaveLength(0);
    expect(cleared.character?.gear.commitment).toBe("");
  });

  testCase("SEMANTICS-GEAR-OPS-004", "gear.remove drops from availableGear and loadout; unknown → NOT_FOUND", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "gear.add", { name: "Fine sword", bulk: 2 });
    await api.characterOp(character.id, "gear.set-commitment", { commitment: "heavy" });
    await api.characterOp(character.id, "gear.commit", { name: "Fine sword" });

    const removed = await api.characterOp(character.id, "gear.remove", { name: "Fine sword" });
    expect(removed.ok).toBe(true);
    expect(removed.character?.gear.availableGear.find((item) => item.name === "Fine sword")).toBeUndefined();
    expect(removed.character?.gear.loadout.find((item) => item.name === "Fine sword")).toBeUndefined();

    const unknown = await api.characterOp(character.id, "gear.remove", { name: "Ghost blade" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.code).toBe("NOT_FOUND");
  });
});
