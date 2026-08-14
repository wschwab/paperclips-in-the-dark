import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

/**
 * A8: ability.take is validated against playbook/crew-type game data
 * (TimesTakeable → ABILITY_MAXED) and ability.remove exists for characters
 * and crews (whole-entry removal per contract; unknown name → NOT_FOUND).
 */
describe("§5.1.9 ability.take enforces TimesTakeable and ability.remove removes", () => {
  testCase("SEMANTICS-ABILITY-LIMITS-001", "character ability.take works up to TimesTakeable then ABILITY_MAXED, and remove is whole-entry", async () => {
    const character = await newCharacter();
    // Cutter: Battleborn has TimesTakeable 1.
    const first = await api.characterOp(character.id, "ability.take", { name: "Battleborn" });
    expect(first.ok).toBe(true);
    expect(first.character?.playbook.abilities).toContainEqual(
      expect.objectContaining({ name: "Battleborn", timesTaken: 1 }),
    );

    const over = await api.characterOp(character.id, "ability.take", { name: "Battleborn" });
    expect(over.ok).toBe(false);
    expect(over.error?.code).toBe("ABILITY_MAXED");
    // Frozen union: ABILITY_MAXED is a 200-status domain failure carrying the
    // typed limit details; the DTO rides on error.entity, not the top-level
    // character field.
    expect((over.error as { status?: number }).status).toBe(200);
    expect(over.error?.details).toEqual({ limit: 1, current: 1 });
    // The rejected take must not advance timesTaken or revision.
    const afterReject = await api.character(character.id);
    expect(afterReject.playbook.abilities).toContainEqual(
      expect.objectContaining({ name: "Battleborn", timesTaken: 1 }),
    );
    expect(afterReject.revision).toBe(character.revision + 1);

    const removed = await api.characterOp(character.id, "ability.remove", { name: "Battleborn" });
    expect(removed.ok).toBe(true);
    expect(removed.character?.playbook.abilities.find((item) => item.name === "Battleborn")).toBeUndefined();

    const unknown = await api.characterOp(character.id, "ability.remove", { name: "NoSuchAbility" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.code).toBe("NOT_FOUND");
  });

  testCase("SEMANTICS-ABILITY-LIMITS-002", "crew ability.take works up to TimesTakeable then ABILITY_MAXED, and remove is whole-entry", async () => {
    const crew = await newCrew();
    // Assassins: Predators has TimesTakeable 1.
    const first = await api.crewOp(crew.id, "ability.take", { name: "Predators" });
    expect(first.ok).toBe(true);
    expect(first.crew?.specialAbilities).toContainEqual(
      expect.objectContaining({ name: "Predators", timesTaken: 1 }),
    );

    const over = await api.crewOp(crew.id, "ability.take", { name: "Predators" });
    expect(over.ok).toBe(false);
    expect(over.error?.code).toBe("ABILITY_MAXED");
    expect(over.error?.details).toEqual({ limit: 1, current: 1 });
    const afterReject = await api.crew(crew.id);
    expect(afterReject.specialAbilities).toContainEqual(
      expect.objectContaining({ name: "Predators", timesTaken: 1 }),
    );

    const removed = await api.crewOp(crew.id, "ability.remove", { name: "Predators" });
    expect(removed.ok).toBe(true);
    expect(removed.crew?.specialAbilities.find((item) => item.name === "Predators")).toBeUndefined();

    const unknown = await api.crewOp(crew.id, "ability.remove", { name: "NoSuchAbility" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.code).toBe("NOT_FOUND");
  });
});
