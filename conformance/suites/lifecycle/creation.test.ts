import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

describe("lifecycle creation flows", () => {
  testCase("LIFECYCLE-CREATION-001", "character creation returns a complete DTO", async () => {
    const result = await api.createCharacter("blades-in-the-dark", firstPlaybook("blades-in-the-dark"));
    expect(result.ok).toBe(true);
    expect(result.character?.kind).toBe("character");
    expect(result.character?.revision).toBeGreaterThanOrEqual(1);
    await decode(Schemas.Character, result.character);
  });

  testCase("LIFECYCLE-CREATION-002", "crew and clock creation are independently discoverable", async () => {
    const crew = await newCrew();
    const clock = await api.createClock("A test clock", "rollover", 4);
    expect(crew.kind).toBe("crew");
    expect(clock.ok).toBe(true);
    expect(clock.clock?.clockKind).toBe("rollover");
    const clocks = await api.get("clocks");
    expect(clocks.status).toBe(200);
    await decode(Schemas.JsonArray, clocks.body);
  });

  testCase("LIFECYCLE-CREATION-003", "S&V creation uses the authored settings", async () => {
    const setting = gameSetting("scum-and-villainy");
    const result = await api.createCharacter("scum-and-villainy", setting.Playbooks[0]!.Name);
    expect(result.ok).toBe(true);
    expect(result.character?.gameStem).toBe("scum-and-villainy");
    expect(result.character?.monitor.harm.healingClock.size).toBe(setting.RecoveryClockSize);
    expect(result.character?.talent.attributes[0]?.actions[0]?.maxRating).toBe(setting.ActionPointMaximum);
  });
});
