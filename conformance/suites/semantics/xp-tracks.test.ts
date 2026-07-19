import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { gameSetting } from "../../src/game-data.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, SCUM, firstActionFor } from "../../src/suite-helpers.js";

describe("§5.1.5 attribute and playbook XP are asymmetric tracks", () => {
  testCase("SEMANTICS-XP-TRACKS-001", "attribute level-up clears only that attribute track", async () => {
    const character = await newCharacter();
    const attribute = character.talent.attributes[0];
    const action = attribute?.actions[0];
    if (!attribute || !action) throw new Error("created character has no attribute action");
    const filled = await api.characterOp(character.id, "attribute-xp.add", {
      attribute: attribute.name,
      delta: attribute.experience.max,
    });
    expect(filled.ok).toBe(true);
    const level = await api.characterOp(character.id, "attribute.levelup", {
      attribute: attribute.name,
      action: action.name,
    });
    expect(level.ok).toBe(true);
    expect(level.character?.talent.attributes.find((item) => item.name === attribute.name)?.experience.points).toBe(0);
    expect(level.character?.talent.attributes.find((item) => item.name === attribute.name)?.actions.find((item) => item.name === action.name)?.rating)
      .toBe(action.rating + 1);
  });

  testCase("SEMANTICS-XP-TRACKS-002", "taking an ability does not clear playbook XP", async () => {
    const stem = SCUM;
    const setting = gameSetting(stem);
    const character = await newCharacter(stem);
    const abilityName = setting.Playbooks.find((item) => item.Name === character.playbook.name)?.SpecialAbilities?.[0]?.Name;
    if (!abilityName) throw new Error("missing S&V playbook ability setting");
    const before = character.playbook.experience.points;
    const result = await api.characterOp(character.id, "ability.take", { name: abilityName });
    expect(result.ok).toBe(true);
    expect(result.character?.playbook.experience.points).toBe(before);
  });

  testCase("SEMANTICS-XP-TRACKS-003", "S&V action maxima and healing clock size come from game data", async () => {
    const setting = gameSetting(SCUM);
    const character = await newCharacter(SCUM);
    const first = character.talent.attributes[0]?.actions[0];
    if (!first) throw new Error("S&V character has no actions");
    expect(first.maxRating).toBe(setting.ActionPointMaximum);
    expect(character.monitor.harm.healingClock.size).toBe(setting.RecoveryClockSize);
    const selected = firstActionFor(SCUM);
    expect(selected.action).toBe(first.name);
  });
});
