import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { factionStatusRange } from "../../src/game-data.js";
import { newCrew, BLADES } from "../../src/suite-helpers.js";

// C3 contract change (2026-07-29, human-authorized): crew sheet gains
// contacts {name, profession} and factions {name, status} with ops mirroring
// the rolodex ergonomics. Expected red against current backends (no server
// support yet — Ada implementation is the A-track follow-up).

describe("C3 crew contacts (add/remove by name)", () => {
  testCase("SEMANTICS-CREW-CONTACTS-001", "contact.add writes a named contact with profession", async () => {
    const crew = await newCrew();
    const result = await api.crewOp(crew.id, "contact.add", { name: "Rolan Wott", profession: "magistrate" });
    expect(result.ok).toBe(true);
    expect(result.crew?.contacts?.find((contact) => contact.name === "Rolan Wott")?.profession).toBe("magistrate");
  });

  testCase("SEMANTICS-CREW-CONTACTS-002", "duplicate contact name is rejected", async () => {
    const crew = await newCrew();
    await api.crewOp(crew.id, "contact.add", { name: "Rolan Wott", profession: "magistrate" });
    const duplicate = await api.crewOp(crew.id, "contact.add", { name: "Rolan Wott", profession: "spy" });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error?.code).toBe("DUPLICATE");
  });

  testCase("SEMANTICS-CREW-CONTACTS-003", "contact.remove drops the named contact", async () => {
    const crew = await newCrew();
    await api.crewOp(crew.id, "contact.add", { name: "Rolan Wott", profession: "magistrate" });
    const removed = await api.crewOp(crew.id, "contact.remove", { name: "Rolan Wott" });
    expect(removed.ok).toBe(true);
    expect(removed.crew?.contacts?.find((contact) => contact.name === "Rolan Wott")).toBeUndefined();
  });

  testCase("SEMANTICS-CREW-CONTACTS-004", "removing an unknown contact returns NOT_FOUND", async () => {
    const crew = await newCrew();
    const result = await api.crewOp(crew.id, "contact.remove", { name: "Nobody" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("C3 crew factions (status set is an upsert, clamped per game-settings)", () => {
  testCase("SEMANTICS-CREW-FACTIONS-001", "faction.set-status creates the faction on first set", async () => {
    const crew = await newCrew();
    const result = await api.crewOp(crew.id, "faction.set-status", { name: "The Crows", status: 0 });
    expect(result.ok).toBe(true);
    expect(result.crew?.factions?.find((faction) => faction.name === "The Crows")?.status).toBe(0);
  });

  testCase("SEMANTICS-CREW-FACTIONS-002", "faction.set-status updates an existing faction instead of duplicating", async () => {
    const crew = await newCrew();
    await api.crewOp(crew.id, "faction.set-status", { name: "The Crows", status: 0 });
    const updated = await api.crewOp(crew.id, "faction.set-status", { name: "The Crows", status: 3 });
    expect(updated.ok).toBe(true);
    expect(updated.crew?.factions?.filter((faction) => faction.name === "The Crows")).toHaveLength(1);
    expect(updated.crew?.factions?.find((faction) => faction.name === "The Crows")?.status).toBe(3);
  });

  testCase("SEMANTICS-CREW-FACTIONS-003", "status clamps to the game-settings maximum and reports it", async () => {
    const range = factionStatusRange(BLADES);
    expect(range).toBeDefined();
    const crew = await newCrew();
    const requested = (range?.Max ?? 0) + 50;
    const result = await api.crewOp(crew.id, "faction.set-status", { name: "The Crows", status: requested });
    expect(result.ok).toBe(true);
    expect(result.applied.requested).toBe(requested);
    expect(result.applied.effective).toBe(range?.Max);
    expect(result.crew?.factions?.find((faction) => faction.name === "The Crows")?.status).toBe(range?.Max);
  });

  testCase("SEMANTICS-CREW-FACTIONS-004", "status clamps to the game-settings minimum and reports it", async () => {
    const range = factionStatusRange(BLADES);
    expect(range).toBeDefined();
    const crew = await newCrew();
    const requested = (range?.Min ?? 0) - 50;
    const result = await api.crewOp(crew.id, "faction.set-status", { name: "The Crows", status: requested });
    expect(result.ok).toBe(true);
    expect(result.applied.requested).toBe(requested);
    expect(result.applied.effective).toBe(range?.Min);
    expect(result.crew?.factions?.find((faction) => faction.name === "The Crows")?.status).toBe(range?.Min);
  });

  testCase("SEMANTICS-CREW-FACTIONS-005", "faction.remove drops the named faction", async () => {
    const crew = await newCrew();
    await api.crewOp(crew.id, "faction.set-status", { name: "The Crows", status: 1 });
    const removed = await api.crewOp(crew.id, "faction.remove", { name: "The Crows" });
    expect(removed.ok).toBe(true);
    expect(removed.crew?.factions?.find((faction) => faction.name === "The Crows")).toBeUndefined();
  });

  testCase("SEMANTICS-CREW-FACTIONS-006", "removing an unknown faction returns NOT_FOUND", async () => {
    const crew = await newCrew();
    const result = await api.crewOp(crew.id, "faction.remove", { name: "Nobody" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
