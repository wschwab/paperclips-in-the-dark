import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

const COMMITMENT_OPTIONS = ["none", "light", "normal", "heavy", "encumbered"];

/**
 * A12: gear.commitment must always be a contract-enum value ("none" for unset)
 * — the Ada server emitted "" for fresh characters, which the frontend schema
 * (contract-mirroring) rejects, breaking character-sheet decode.
 */
describe("§5.1 gear commitment is a contract enum value", () => {
  testCase("SEMANTICS-COMMITMENT-001", "a fresh character has commitment \"none\"", async () => {
    const character = await newCharacter();
    expect(character.gear.commitment).toBe("none");
  });

  testCase("SEMANTICS-COMMITMENT-002", "gear.clear-commitments resets commitment to \"none\"", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "gear.set-commitment", { commitment: "heavy" });
    await api.characterOp(character.id, "gear.add", { name: "Fine sword", bulk: 2 });
    await api.characterOp(character.id, "gear.commit", { name: "Fine sword" });

    const cleared = await api.characterOp(character.id, "gear.clear-commitments");
    expect(cleared.ok).toBe(true);
    expect(cleared.character?.gear.commitment).toBe("none");
    expect(cleared.character?.gear.loadout).toHaveLength(0);
  });

  testCase("SEMANTICS-COMMITMENT-003", 'gear.commit with unset commitment → NO_COMMITMENT', async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "gear.add", { name: "Fine sword", bulk: 2 });
    const noCommit = await api.characterOp(character.id, "gear.commit", { name: "Fine sword" });
    expect(noCommit.ok).toBe(false);
    expect(noCommit.error?.code).toBe("NO_COMMITMENT");
  });

  testCase("SEMANTICS-COMMITMENT-004", "commitment always decodes to the contract enum across set/commit/clear cycles", async () => {
    const character = await newCharacter();
    for (const opt of ["light", "normal", "heavy", "encumbered"]) {
      const set = await api.characterOp(character.id, "gear.set-commitment", { commitment: opt });
      expect(set.ok).toBe(true);
      expect(COMMITMENT_OPTIONS).toContain(set.character?.gear.commitment);
      expect(set.character?.gear.commitment).toBe(opt);
    }
    const cleared = await api.characterOp(character.id, "gear.clear-commitments");
    expect(cleared.character?.gear.commitment).toBe("none");
  });
});
