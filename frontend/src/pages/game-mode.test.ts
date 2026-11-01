import { describe, expect, it } from "vitest";
import {
  LOAD_CHOICES,
  downtimeRemaining,
  loadLimitFor,
  desperateAttributes,
} from "./game-mode.js";

const SETTINGS = {
  Attributes: [{ Name: "Insight" }, { Name: "Prowess" }, { Name: "Resolve" }],
  LoadMaxima: { MaxBulk: 9, CommitmentMaxBulk: { Light: 3, Normal: 5, Heavy: 6, Encumbered: 9 } },
};

describe("game mode domain (GAME-MODE-03)", () => {
  it("derives remaining downtime as free + paid - spent, allowing negatives", () => {
    expect(downtimeRemaining({ free: 2, paid: 0, spent: 0, activities: [] })).toBe(2);
    expect(downtimeRemaining({ free: 2, paid: 1, spent: 1, activities: [] })).toBe(2);
    expect(downtimeRemaining({ free: 2, paid: -1, spent: 3, activities: [] })).toBe(-2);
  });

  it("maps the contract's lowercase commitment onto the settings' level names (Normal -> 5)", () => {
    expect(loadLimitFor(SETTINGS, "normal")).toBe(5);
    expect(loadLimitFor(SETTINGS, "heavy")).toBe(6);
    expect(loadLimitFor(SETTINGS, "light")).toBe(3);
    expect(loadLimitFor(SETTINGS, "encumbered")).toBe(9);
    expect(loadLimitFor(SETTINGS, "none")).toBeNull();
  });

  it("reads load limits from the settings block, never from literals", () => {
    expect(loadLimitFor(SETTINGS, "Light")).toBe(3);
    expect(loadLimitFor(SETTINGS, "Normal")).toBe(5);
    expect(loadLimitFor(SETTINGS, "Heavy")).toBe(6);
    expect(loadLimitFor({}, "Normal")).toBeNull();
    expect(loadLimitFor(null, "Normal")).toBeNull();
  });

  it("offers the three design load choices in order", () => {
    expect([...LOAD_CHOICES]).toEqual(["Light", "Normal", "Heavy"]);
  });


  it("lists desperate-action attributes from settings", () => {
    expect(desperateAttributes(SETTINGS)).toEqual(["Insight", "Prowess", "Resolve"]);
    expect(desperateAttributes(null)).toEqual([]);
  });
});
