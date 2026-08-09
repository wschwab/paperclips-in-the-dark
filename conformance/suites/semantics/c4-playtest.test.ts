import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew, characterOp } from "../../src/suite-helpers.js";

/**
 * C4: playtest round 1 contract changes — notes arrays, crew turf, heal
 * targeting, vice purveyor. (Mastery gating + armor/stress/descriptions are
 * A13 server semantics; their conformance cases live there too where the
 * server implements them.)
 */
describe("§C4 playtest contract changes", () => {
  testCase("SEMANTICS-NOTES-001", "character notes are a list; note.add appends and note.remove drops by index", async () => {
    const character = await newCharacter();
    expect(Array.isArray(character.dossier.notes)).toBe(true);

    const added = await api.characterOp(character.id, "note.add", { text: "First note" });
    expect(added.ok).toBe(true);
    expect(added.character?.dossier.notes).toContain("First note");

    const added2 = await api.characterOp(character.id, "note.add", { text: "Second note" });
    expect(added2.ok).toBe(true);
    expect(added2.character?.dossier.notes).toHaveLength(2);

    const removed = await api.characterOp(character.id, "note.remove", { index: 0 });
    expect(removed.ok).toBe(true);
    expect(removed.character?.dossier.notes).toEqual(["Second note"]);

    const bad = await api.characterOp(character.id, "note.remove", { index: 99 });
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe("NOT_FOUND");
  });

  testCase("SEMANTICS-NOTES-002", "crew notes are a list; note.add appends and note.remove drops by index", async () => {
    const crew = await newCrew();
    expect(Array.isArray(crew.notes)).toBe(true);

    const added = await api.crewOp(crew.id, "note.add", { text: "Crew note" });
    expect(added.ok).toBe(true);
    expect(added.crew?.notes).toContain("Crew note");

    const removed = await api.crewOp(crew.id, "note.remove", { index: 0 });
    expect(removed.ok).toBe(true);
    expect(removed.crew?.notes).toHaveLength(0);

    const bad = await api.crewOp(crew.id, "note.remove", { index: 5 });
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe("NOT_FOUND");
  });

  testCase("SEMANTICS-TURF-001", "crew turf.add adds with 0..6 clamp; negative removes", async () => {
    const crew = await newCrew();
    expect(crew.turf).toBe(0);

    const added = await api.crewOp(crew.id, "turf.add", { delta: 3 });
    expect(added.ok).toBe(true);
    expect(added.crew?.turf).toBe(3);
    expect(added.applied.requested).toBe(3);
    expect(added.applied.effective).toBe(3);

    const over = await api.crewOp(crew.id, "turf.add", { delta: 5 });
    expect(over.ok).toBe(true);
    expect(over.crew?.turf).toBe(6); // clamped at max 6

    const removed = await api.crewOp(crew.id, "turf.add", { delta: -2 });
    expect(removed.ok).toBe(true);
    expect(removed.crew?.turf).toBe(4);
  });

  testCase("SEMANTICS-HEAL-001", "harm.heal requires a specific harm and removes exactly it", async () => {
    const character = await newCharacter();
    await characterOp(character, "harm.add", { description: "Bruised", intensity: "lesser" });
    // Fill the healing clock (size 4).
    for (let i = 0; i < 4; i++) {
      await api.characterOp(character.id, "harm.healing-clock", { segments: 1 });
    }
    const full = await api.character(character.id);
    expect(full.monitor.harm.healingClock.segments).toBe(full.monitor.harm.healingClock.size);

    const healed = await api.characterOp(character.id, "harm.heal", { intensity: "lesser", description: "Bruised" });
    expect(healed.ok).toBe(true);
    expect(healed.character?.monitor.harm.lesser).not.toContain("Bruised");
    expect(healed.character?.monitor.harm.healingClock.segments).toBe(0);

    // Healing something not present → NOT_FOUND.
    await api.characterOp(character.id, "harm.add", { description: "Scraped", intensity: "lesser" });
    await api.characterOp(character.id, "harm.healing-clock", { segments: 4 });
    const notFound = await api.characterOp(character.id, "harm.heal", { intensity: "lesser", description: "NoSuchHarm" });
    expect(notFound.ok).toBe(false);
    expect(notFound.error?.code).toBe("NOT_FOUND");
  });
});
