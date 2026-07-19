import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.10 commitment locking is explicit", () => {
  testCase("SEMANTICS-COMMITMENT-LOCK-001", "locked commitment rejects changes", async () => {
    const character = await newCharacter();
    const locked = await api.characterOp(character.id, "gear.lock");
    expect(locked.ok).toBe(true);
    expect(locked.character?.gear.isCommitmentLocked).toBe(true);
    const changed = await api.characterOp(character.id, "gear.set-commitment", { commitment: "light" });
    expect(changed.ok).toBe(false);
    expect(changed.error?.code).toBe("COMMITMENT_LOCKED");
  });

  testCase("SEMANTICS-COMMITMENT-LOCK-002", "unlock permits an explicit commitment change", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "gear.lock");
    const unlocked = await api.characterOp(character.id, "gear.unlock");
    expect(unlocked.ok).toBe(true);
    const changed = await api.characterOp(character.id, "gear.set-commitment", { commitment: "light" });
    expect(changed.ok).toBe(true);
    expect(changed.character?.gear.commitment).toBe("light");
  });
});
