import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { BLADES, firstActionFor, newCharacter } from "../../src/suite-helpers.js";

/**
 * AUDIT-0 core-boundary regression coverage (BUG-004 / BUG-006 / BUG-010).
 *
 * BUG-004: the HTTP layer bypasses the SPARK-proved core, so a zero-XP
 *   attribute level-up succeeds and a fifth trauma is accepted. Authoritative
 *   reference: TalentAttribute.LevelUp (returns false unless
 *   Experience.CanLevelUp), ExperienceTracker.CanLevelUp (Points == Max),
 *   MonitorTrauma.MaxTraumas = 4, and the core Experience_Trackers.Level_Up /
 *   Monitors.Add_Trauma contracts. Expected: CANNOT_LEVEL_UP with no
 *   mutation; the fifth trauma is rejected without exceeding the declared
 *   max, leaving revision and entity state unchanged.
 * BUG-006: armor availability is loadout-derived (CharacterArmor.cs:
 *   HasArmor / HasHeavyArmor scan Gear.Loadout; BitD heavy search text is
 *   "+Heavy"). Expected: an empty loadout exposes no standard/heavy armor;
 *   committing matching gear flips availability on; uncommit reverses it;
 *   using unavailable armor returns ARMOR_NOT_AVAILABLE without mutation.
 * BUG-010: rollover clocks carry overflow (RolloverClock.cs, core
 *   Clocks.Progress/Reset). Expected: a size-4 rollover clock progressed by 6
 *   lands on (segments=4, rollover=2), reset applies the two carried
 *   segments; overflow larger than one full clock carries across successive
 *   resets; project clocks still clamp.
 */
describe("§5.1 core-boundary invariants (AUDIT-0 BUG-004/006/010)", () => {
  testCase("SEMANTICS-CORE-BOUNDARY-001", "zero-XP attribute level-up is rejected with CANNOT_LEVEL_UP and no mutation", async () => {
    const character = await newCharacter();
    const { attribute, action } = firstActionFor(BLADES);
    const before = await api.character(character.id);
    const attributeBefore = before.talent.attributes.find((item) => item.name === attribute);
    const actionBefore = attributeBefore?.actions.find((item) => item.name === action);
    if (!attributeBefore || !actionBefore) throw new Error("created character is missing the first attribute action");
    expect(attributeBefore.experience.points).toBe(0);
    expect(actionBefore.rating).toBe(0);

    const result = await api.characterOp(character.id, "attribute.levelup", { attribute, action });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("CANNOT_LEVEL_UP");

    const after = await api.character(character.id);
    expect(after.revision).toBe(before.revision);
    const attributeAfter = after.talent.attributes.find((item) => item.name === attribute);
    expect(attributeAfter?.experience.points).toBe(0);
    expect(attributeAfter?.actions.find((item) => item.name === action)?.rating).toBe(actionBefore.rating);
  });

  testCase("SEMANTICS-CORE-BOUNDARY-002", "the fifth trauma is rejected at the declared max without mutation", async () => {
    const character = await newCharacter();
    for (const trauma of ["Cold", "Haunted", "Obsessed", "Paranoid"]) {
      const result = await api.characterOp(character.id, "trauma.add", { trauma });
      expect(result.ok).toBe(true);
    }
    const before = await api.character(character.id);
    expect(before.monitor.trauma.traumas).toHaveLength(before.monitor.trauma.max);

    const fifth = await api.characterOp(character.id, "trauma.add", { trauma: "Reckless" });
    expect(fifth.ok).toBe(false);
    expect(fifth.error?.code).toBe("DUPLICATE");

    const after = await api.character(character.id);
    expect(after.revision).toBe(before.revision);
    expect(after.monitor.trauma.traumas).toHaveLength(before.monitor.trauma.max);
    expect(after.monitor.trauma.traumas).not.toContain("Reckless");
  });

  testCase("SEMANTICS-CORE-BOUNDARY-003", "an empty loadout exposes no standard or heavy armor and using either is rejected", async () => {
    const character = await newCharacter();
    expect(character.gear.loadout).toHaveLength(0);
    expect(character.monitor.armor.hasStandard).toBe(false);
    expect(character.monitor.armor.hasHeavy).toBe(false);

    const standard = await api.characterOp(character.id, "armor.set", { armor: "standard", used: true });
    expect(standard.ok).toBe(false);
    expect(standard.error?.code).toBe("ARMOR_NOT_AVAILABLE");

    const heavy = await api.characterOp(character.id, "armor.set", { armor: "heavy", used: true });
    expect(heavy.ok).toBe(false);
    expect(heavy.error?.code).toBe("ARMOR_NOT_AVAILABLE");

    const after = await api.character(character.id);
    expect(after.revision).toBe(character.revision);
    expect(after.monitor.armor.standardUsed).toBe(false);
    expect(after.monitor.armor.heavyUsed).toBe(false);
  });

  testCase("SEMANTICS-CORE-BOUNDARY-004", "committing armor gear derives standard/heavy availability and uncommit reverses it", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "gear.add", { name: "Armor", bulk: 2 });
    await api.characterOp(character.id, "gear.add", { name: "+Heavy", bulk: 3 });
    await api.characterOp(character.id, "gear.set-commitment", { commitment: "heavy" });

    const commitStandard = await api.characterOp(character.id, "gear.commit", { name: "Armor" });
    expect(commitStandard.ok).toBe(true);
    expect(commitStandard.character?.monitor.armor.hasStandard).toBe(true);
    expect(commitStandard.character?.monitor.armor.hasHeavy).toBe(false);

    const useStandard = await api.characterOp(character.id, "armor.set", { armor: "standard", used: true });
    expect(useStandard.ok).toBe(true);
    expect(useStandard.character?.monitor.armor.standardUsed).toBe(true);

    const commitHeavy = await api.characterOp(character.id, "gear.commit", { name: "+Heavy" });
    expect(commitHeavy.ok).toBe(true);
    expect(commitHeavy.character?.monitor.armor.hasHeavy).toBe(true);

    const useHeavy = await api.characterOp(character.id, "armor.set", { armor: "heavy", used: true });
    expect(useHeavy.ok).toBe(true);
    expect(useHeavy.character?.monitor.armor.heavyUsed).toBe(true);

    const uncommit = await api.characterOp(character.id, "gear.uncommit", { name: "Armor" });
    expect(uncommit.ok).toBe(true);
    expect(uncommit.character?.monitor.armor.hasStandard).toBe(false);
    expect(uncommit.character?.monitor.armor.hasHeavy).toBe(true);

    const again = await api.characterOp(character.id, "armor.set", { armor: "standard", used: true });
    expect(again.ok).toBe(false);
    expect(again.error?.code).toBe("ARMOR_NOT_AVAILABLE");

    const after = await api.character(character.id);
    expect(after.revision).toBe(uncommit.character?.revision);
    expect(after.monitor.armor.standardUsed).toBe(true);
    expect(after.monitor.armor.heavyUsed).toBe(true);
  });

  testCase("SEMANTICS-CORE-BOUNDARY-005", "rollover clock overflow is carried and applied on reset", async () => {
    const created = await api.createClock("AUDIT-0 rollover clock", "rollover", 4);
    expect(created.ok).toBe(true);
    const id = created.clock?.id;
    if (!id) throw new Error("clock creation returned no clock");

    const progressed = await api.operation(await api.post(`clocks/${id}/ops/clock.progress`, { segments: 6 }));
    expect(progressed.ok).toBe(true);
    expect(progressed.clock?.segments).toBe(4);
    expect(progressed.clock?.rollover).toBe(2);

    const reset = await api.operation(await api.post(`clocks/${id}/ops/clock.reset`));
    expect(reset.ok).toBe(true);
    expect(reset.clock?.segments).toBe(2);
    expect(reset.clock?.rollover).toBe(0);
  });

  testCase("SEMANTICS-CORE-BOUNDARY-006", "rollover overflow larger than one clock carries across successive resets", async () => {
    const created = await api.createClock("AUDIT-0 large overflow clock", "rollover", 4);
    expect(created.ok).toBe(true);
    const id = created.clock?.id;
    if (!id) throw new Error("clock creation returned no clock");

    const progressed = await api.operation(await api.post(`clocks/${id}/ops/clock.progress`, { segments: 10 }));
    expect(progressed.ok).toBe(true);
    expect(progressed.clock?.segments).toBe(4);
    expect(progressed.clock?.rollover).toBe(6);

    const firstReset = await api.operation(await api.post(`clocks/${id}/ops/clock.reset`));
    expect(firstReset.ok).toBe(true);
    expect(firstReset.clock?.segments).toBe(4);
    expect(firstReset.clock?.rollover).toBe(2);

    const secondReset = await api.operation(await api.post(`clocks/${id}/ops/clock.reset`));
    expect(secondReset.ok).toBe(true);
    expect(secondReset.clock?.segments).toBe(2);
    expect(secondReset.clock?.rollover).toBe(0);
  });

  testCase("SEMANTICS-CORE-BOUNDARY-007", "project clocks still clamp at full and reset to zero", async () => {
    const created = await api.createClock("AUDIT-0 project clock", "bounded", 4);
    expect(created.ok).toBe(true);
    const id = created.clock?.id;
    if (!id) throw new Error("clock creation returned no clock");

    const progressed = await api.operation(await api.post(`clocks/${id}/ops/clock.progress`, { segments: 6 }));
    expect(progressed.ok).toBe(true);
    expect(progressed.clock?.segments).toBe(4);
    expect(progressed.clock?.rollover).toBe(0);

    const reset = await api.operation(await api.post(`clocks/${id}/ops/clock.reset`));
    expect(reset.ok).toBe(true);
    expect(reset.clock?.segments).toBe(0);
    expect(reset.clock?.rollover).toBe(0);
  });
});
