import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCrew } from "../../src/suite-helpers.js";

describe("§5.1.6 upgrades are marked and unmarked box-wise", () => {
  testCase("SEMANTICS-UPGRADES-001", "marking the same multi-box upgrade twice retains two boxes", async () => {
    const crew = await newCrew();
    const first = await api.crewOp(crew.id, "upgrade.mark", { name: "Secure Lair" });
    expect(first.ok).toBe(true);
    const second = await api.crewOp(crew.id, "upgrade.mark", { name: "Secure Lair" });
    expect(second.ok).toBe(true);
    expect(second.crew?.upgrades.find((upgrade) => upgrade.name === "Secure Lair")?.boxesMarked).toBe(2);
  });

  testCase("SEMANTICS-UPGRADES-002", "unmarking removes one box instead of the whole upgrade", async () => {
    const crew = await newCrew();
    await api.crewOp(crew.id, "upgrade.mark", { name: "Secure Lair" });
    await api.crewOp(crew.id, "upgrade.mark", { name: "Secure Lair" });
    const result = await api.crewOp(crew.id, "upgrade.unmark", { name: "Secure Lair" });
    expect(result.ok).toBe(true);
    expect(result.crew?.upgrades.find((upgrade) => upgrade.name === "Secure Lair")?.boxesMarked).toBe(1);
  });
});
