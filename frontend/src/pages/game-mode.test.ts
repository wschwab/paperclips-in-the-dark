import { describe, expect, it } from "vitest";
import {
  SCORE_START_STEPS,
  RESOLUTION_STEPS,
  LOAD_CHOICES,
  cursorForMode,
  downtimeRemaining,
  entanglementRows,
  isValidModeFlow,
  loadLimitFor,
  payoffRepSuggestion,
  stepAfter,
  stepBefore,
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

  it("walks Score and Resolution steps forward and back, stopping at the ends", () => {
    expect([...SCORE_START_STEPS]).toEqual(["planning", "loadout", "engagement"]);
    expect([...RESOLUTION_STEPS]).toEqual(["scoundrel-xp", "payoff", "heat", "entanglements", "crew-xp", "crew-rep"]);
    expect(stepAfter("resolution", "scoundrel-xp")).toBe("payoff");
    expect(stepAfter("resolution", "crew-rep")).toBeNull();
    expect(stepBefore("resolution", "scoundrel-xp")).toBeNull();
    expect(stepBefore("score-start", "engagement")).toBe("loadout");
  });

  it("accepts only the declared kind/step pairings", () => {
    expect(isValidModeFlow({ kind: "none", step: "" })).toBe(true);
    expect(isValidModeFlow({ kind: "none", step: "payoff" })).toBe(false);
    expect(isValidModeFlow({ kind: "score-start", step: "payoff" })).toBe(false);
    expect(isValidModeFlow({ kind: "score-start", step: "loadout" })).toBe(true);
    expect(isValidModeFlow({ kind: "resolution", step: "planning" })).toBe(false);
    expect(isValidModeFlow({ kind: "resolution", step: "crew-rep" })).toBe(true);
  });

  it("sets the score-start cursor when entering Score and clears it otherwise", () => {
    expect(cursorForMode("score")).toEqual({ kind: "score-start", step: "planning" });
    expect(cursorForMode("free-play")).toEqual({ kind: "none", step: "" });
    expect(cursorForMode("downtime")).toEqual({ kind: "none", step: "" });
  });

  it("filters entanglements by heat, with the full table behind Show all", () => {
    expect(entanglementRows(1, false).map((r) => r.heat)).toEqual(["1–3"]);
    expect(entanglementRows(4, false).map((r) => r.heat)).toEqual(["4–5"]);
    expect(entanglementRows(6, false).map((r) => r.heat)).toEqual(["6"]);
    expect(entanglementRows(4, true).map((r) => r.heat)).toEqual(["1–3", "4–5", "6"]);
  });

  it("suggests payoff rep as 2 plus the target-minus-crew tier difference, never below zero", () => {
    expect(payoffRepSuggestion(2, 2)).toBe(2);
    expect(payoffRepSuggestion(4, 2)).toBe(4);
    expect(payoffRepSuggestion(0, 3)).toBe(0);
  });

  it("lists desperate-action attributes from settings", () => {
    expect(desperateAttributes(SETTINGS)).toEqual(["Insight", "Prowess", "Resolve"]);
    expect(desperateAttributes(null)).toEqual([]);
  });
});
