import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew, characterOp, firstActionFor } from "../../src/suite-helpers.js";

/**
 * A13: playtest server fixes — stress reduction, armor availability,
 * ability descriptions, Mastery-gated action caps.
 */
describe("§5.1 playtest server fixes", () => {
  testCase("SEMANTICS-STRESS-REDUCE-001", "stress.add with a negative delta reduces stress (clamped at 0)", async () => {
    const character = await newCharacter();
    await characterOp(character, "stress.add", { delta: 3 });
    expect((await api.character(character.id)).monitor.stress.current).toBe(3);

    const reduced = await api.characterOp(character.id, "stress.add", { delta: -2 });
    expect(reduced.ok).toBe(true);
    expect(reduced.character?.monitor.stress.current).toBe(1);
    expect(reduced.applied.requested).toBe(-2);
    expect(reduced.applied.effective).toBe(-2);

    const floored = await api.characterOp(character.id, "stress.add", { delta: -99 });
    expect(floored.ok).toBe(true);
    expect(floored.character?.monitor.stress.current).toBe(0);
  });

  testCase("SEMANTICS-ARMOR-001", "standard and heavy armor are available by default; special is not", async () => {
    const character = await newCharacter();
    expect(character.monitor.armor.hasStandard).toBe(true);
    expect(character.monitor.armor.hasHeavy).toBe(true);
    expect(character.monitor.armor.hasSpecial).toBe(false);

    const used = await api.characterOp(character.id, "armor.set", { armor: "standard", used: true });
    expect(used.ok).toBe(true);
    expect(used.character?.monitor.armor.standardUsed).toBe(true);

    const special = await api.characterOp(character.id, "armor.set", { armor: "special", used: true });
    expect(special.ok).toBe(false);
    expect(special.error?.code).toBe("ARMOR_NOT_AVAILABLE");
  });

  testCase("SEMANTICS-ABILITY-DESC-001", "ability.take stores the game-data description", async () => {
    const character = await newCharacter();
    const taken = await api.characterOp(character.id, "ability.take", { name: "Battleborn" });
    expect(taken.ok).toBe(true);
    const ability = taken.character?.playbook.abilities.find((a) => a.name === "Battleborn");
    expect(ability?.description).toBeTruthy();
    expect(ability?.description.length).toBeGreaterThan(10);
  });

  testCase("SEMANTICS-MASTERY-001", "action ratings cap at 3 until the character's crew unlocks Mastery", async () => {
    const character = await newCharacter();
    const { action } = firstActionFor("blades-in-the-dark");
    // No crew: cap 3.
    const to4 = await api.characterOp(character.id, "action.set-rating", { action, rating: 4 });
    expect(to4.ok).toBe(false);
    expect(to4.error?.code).toBe("RATING_MAXED");
    const to3 = await api.characterOp(character.id, "action.set-rating", { action, rating: 3 });
    expect(to3.ok).toBe(true);

    // Join a crew WITHOUT Mastery: still capped at 3.
    const crew = await newCrew();
    await api.characterOp(character.id, "dossier.update", { crewId: crew.id });
    const to4NoMastery = await api.characterOp(character.id, "action.set-rating", { action, rating: 4 });
    expect(to4NoMastery.ok).toBe(false);
    expect(to4NoMastery.error?.code).toBe("RATING_MAXED");

    // Crew takes Mastery (4 boxes): now 4 is allowed.
    for (let i = 0; i < 4; i++) {
      await api.crewOp(crew.id, "upgrade.mark", { name: "Mastery" });
    }
    const to4Mastery = await api.characterOp(character.id, "action.set-rating", { action, rating: 4 });
    expect(to4Mastery.ok).toBe(true);
    const rating = to4Mastery.character?.talent.attributes
      .flatMap((attr) => attr.actions)
      .find((a) => a.name === action)?.rating;
    expect(rating).toBe(4);
  });
});
