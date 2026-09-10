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
    expect(clock.clock?.behavior).toBe("rollover");
    expect(clock.clock?.ownerKind).toBe("campaign");
    expect(clock.clock?.ownerId).toBe("");
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

  for (const [index, kind, route, field] of [
    [4, "character", "characters", "playbook"],
    [7, "crew", "crews", "crewType"],
  ] as const) {
    for (const [offset, label, value] of [
      [0, "quoted type names round-trip as data", 'Custom "type"\n雪\t\u0001'],
      [1, "literal backslash escapes are not decoded twice", String.raw`Custom\n\t\u0041\\type`],
    ] as const) {
      testCase(`LIFECYCLE-CREATION-00${index + offset}`, `${kind} ${label}`, async () => {
        const response = await api.post(route, { gameStem: "blades-in-the-dark", [field]: value });
        expect(response.status).toBe(200);
        const result = await api.operation(response);
        expect(result.ok).toBe(true);
        const entity = result[kind];
        if (!entity) throw new Error(`create returned no ${kind}`);
        const actual = kind === "character" ? result.character?.playbook.name : result.crew?.crewTypeName;
        expect(actual).toBe(value);
        const current = await api.get(`${route}/${entity.id}`);
        expect(current.status).toBe(200);
        const stored = kind === "character"
          ? (await decode(Schemas.Character, current.body)).playbook.name
          : (await decode(Schemas.Crew, current.body)).crewTypeName;
        expect(stored).toBe(value);
      });
    }

    testCase(`LIFECYCLE-CREATION-00${index + 2}`, `${kind} create type cannot inject an ID or replace existing state`, async () => {
      const original = kind === "character" ? await newCharacter() : await newCrew();
      const changed = await api.operation(await api.post(
        `${route}/${original.id}/ops/${kind === "character" ? "note.add" : "tier.add"}`,
        kind === "character" ? { text: "Preserve this note" } : { delta: 2 },
      ));
      expect(changed.ok).toBe(true);
      const before = await api.get(`${route}/${original.id}`);
      const unrelated = kind === "character" ? await newCharacter() : await newCrew();
      const unrelatedBefore = await api.get(`${route}/${unrelated.id}`);
      const value = kind === "character"
        ? `replacement"},"id":"${original.id}","playbook":{"name":"replacement`
        : `replacement","id":"${original.id}`;
      const response = await api.post(route, { gameStem: "blades-in-the-dark", [field]: value });
      expect(response.status).toBe(200);
      const result = await api.operation(response);
      expect(result.ok).toBe(true);
      const entity = result[kind];
      if (!entity) throw new Error(`create returned no ${kind}`);
      expect.soft(entity.id).not.toBe(original.id);
      expect.soft(kind === "character" ? result.character?.playbook.name : result.crew?.crewTypeName).toBe(value);
      const current = await api.get(`${route}/${original.id}`);
      expect.soft(current.rawBody).toBe(before.rawBody);
      if (kind === "character") {
        const character = await decode(Schemas.Character, current.body);
        expect.soft(character.revision).toBe(changed.character?.revision);
        expect.soft(character.dossier.notes).toEqual(["Preserve this note"]);
      } else {
        const crew = await decode(Schemas.Crew, current.body);
        expect.soft(crew.revision).toBe(changed.crew?.revision);
        expect.soft(crew.tier).toBe(2);
      }
      expect.soft((await api.get(`${route}/${unrelated.id}`)).rawBody).toBe(unrelatedBefore.rawBody);
    });
  }
});
