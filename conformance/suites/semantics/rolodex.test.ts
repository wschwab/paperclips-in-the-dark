import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

describe("§5.1.7 rolodex has the complete closeness transition set", () => {
  testCase("SEMANTICS-ROLODEX-001", "friend can move through close-friend to rival", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "rolodex.add", { entry: "Test contact" });
    await api.characterOp(character.id, "rolodex.set-closeness", { entry: "Test contact", closeness: "close-friend" });
    const rival = await api.characterOp(character.id, "rolodex.set-closeness", { entry: "Test contact", closeness: "rival" });
    expect(rival.ok).toBe(true);
    expect(rival.character?.rolodex.friends.find((friend) => friend.entry === "Test contact")?.closeness).toBe("rival");
  });

  testCase("SEMANTICS-ROLODEX-002", "rival can be downgraded back to friend", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "rolodex.add", { entry: "Second contact" });
    await api.characterOp(character.id, "rolodex.set-closeness", { entry: "Second contact", closeness: "rival" });
    const friend = await api.characterOp(character.id, "rolodex.set-closeness", { entry: "Second contact", closeness: "friend" });
    expect(friend.ok).toBe(true);
    expect(friend.character?.rolodex.friends.find((item) => item.entry === "Second contact")?.closeness).toBe("friend");
  });
});
