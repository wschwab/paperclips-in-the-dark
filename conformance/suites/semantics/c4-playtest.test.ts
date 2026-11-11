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

  testCase("NOTES-EDIT-01-001", "character note.update replaces the text at a 0-based index; bad index is NOT_FOUND and empty text is rejected", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "note.add", { text: "First" });
    const added = await api.characterOp(character.id, "note.add", { text: "Second" });
    expect(added.ok).toBe(true);

    const updated = await api.characterOp(character.id, "note.update", { index: 0, text: "Edited" });
    expect(updated.ok).toBe(true);
    expect(updated.character?.dossier.notes).toEqual(["Edited", "Second"]);
    expect(updated.character?.revision).toBeGreaterThan(added.character!.revision);

    const missing = await api.characterOp(character.id, "note.update", { index: 9, text: "x" });
    expect(missing.ok).toBe(false);
    expect(missing.error?.code).toBe("NOT_FOUND");

    const empty = await api.characterOp(character.id, "note.update", { index: 0, text: "" });
    expect(empty.ok).toBe(false);
    expect(empty.error?.code).toBe("VALIDATION");
  });

  testCase("NOTES-EDIT-01-002", "character note.update is undone by the sheet undo to the prior text", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "note.add", { text: "Original" });
    const updated = await api.characterOp(character.id, "note.update", { index: 0, text: "Changed" });
    expect(updated.character?.dossier.notes).toEqual(["Changed"]);

    const undone = await api.operation(await api.post(`characters/${character.id}/undo`, {}, { "If-Match": String(updated.character!.revision) }));
    expect(undone.ok).toBe(true);
    expect(undone.character?.dossier.notes).toEqual(["Original"]);
  });

  testCase("NOTES-EDIT-01-003", "a retired character can still edit a note (locked lifecycle rule: note edits remain allowed)", async () => {
    const character = await newCharacter();
    const seeded = await api.characterOp(character.id, "note.add", { text: "Before retirement" });
    const retired = await api.operation(await api.post(`characters/${character.id}/retire`, { confirm: true }, { "If-Match": String(seeded.character!.revision) }));
    expect(retired.ok).toBe(true);

    const edited = await api.characterOp(character.id, "note.update", { index: 0, text: "After retirement" });
    expect(edited.ok).toBe(true);
    expect(edited.character?.dossier.notes).toEqual(["After retirement"]);
  });

  testCase("NOTES-EDIT-01-004", "crew note.update replaces the text at a 0-based index; bad index is NOT_FOUND and empty text is rejected", async () => {
    const crew = await newCrew();
    await api.crewOp(crew.id, "note.add", { text: "First" });
    await api.crewOp(crew.id, "note.add", { text: "Second" });

    const updated = await api.crewOp(crew.id, "note.update", { index: 1, text: "Edited" });
    expect(updated.ok).toBe(true);
    expect(updated.crew?.notes).toEqual(["First", "Edited"]);

    const missing = await api.crewOp(crew.id, "note.update", { index: 5, text: "x" });
    expect(missing.ok).toBe(false);
    expect(missing.error?.code).toBe("NOT_FOUND");

    const empty = await api.crewOp(crew.id, "note.update", { index: 0, text: "" });
    expect(empty.ok).toBe(false);
    expect(empty.error?.code).toBe("VALIDATION");

    const undone = await api.operation(await api.post(`crews/${crew.id}/undo`, {}, { "If-Match": String(updated.crew!.revision) }));
    expect(undone.ok).toBe(true);
    expect(undone.crew?.notes).toEqual(["First", "Second"]);
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
