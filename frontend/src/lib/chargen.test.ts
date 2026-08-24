import { describe, it, expect } from "vitest";
import {
  actionGroupsFromSettings,
  pcAllocationReady,
  pcBudgetFromSettings,
  sumRatings,
  unspentDots,
} from "./chargen.js";

/** Settings fixture mirroring the blades-in-the-dark shape (values are data). */
const SETTINGS = {
  StartingActionDots: 7,
  StartingActionDotMax: 2,
  Attributes: [
    {
      Name: "Insight",
      Actions: [{ Name: "Hunt" }, { Name: "Study" }, { Name: "Survey" }, { Name: "Tinker" }],
    },
    {
      Name: "Prowess",
      Actions: [{ Name: "Finesse" }, { Name: "Prowl" }, { Name: "Skirmish" }, { Name: "Wreck" }],
    },
    {
      Name: "Resolve",
      Actions: [{ Name: "Attune" }, { Name: "Command" }, { Name: "Consort" }, { Name: "Sway" }],
    },
  ],
};

describe("pcBudgetFromSettings", () => {
  it("extracts the published budget from settings", () => {
    expect(pcBudgetFromSettings(SETTINGS)).toEqual({
      startingActionDots: 7,
      startingActionDotMax: 2,
    });
  });

  const absent: Array<[string, Record<string, unknown> | null | undefined]> = [
    ["both keys are missing", {}],
    ["only StartingActionDots is present", { StartingActionDots: 7 }],
    ["only StartingActionDotMax is present", { StartingActionDotMax: 2 }],
    ["StartingActionDots is not an integer", { StartingActionDots: 7.5, StartingActionDotMax: 2 }],
    ["StartingActionDots is zero", { StartingActionDots: 0, StartingActionDotMax: 2 }],
    ["StartingActionDotMax is negative", { StartingActionDots: 7, StartingActionDotMax: -1 }],
    ["StartingActionDots is a string", { StartingActionDots: "7", StartingActionDotMax: 2 }],
    ["the payload itself is null", null],
    ["the payload itself is undefined", undefined],
  ];
  it.each(absent)("returns null when %s", (_name, settings) => {
    expect(pcBudgetFromSettings(settings)).toBeNull();
  });
});

describe("actionGroupsFromSettings", () => {
  it("extracts attribute groups in settings order", () => {
    expect(actionGroupsFromSettings(SETTINGS)).toEqual([
      { attribute: "Insight", actions: ["Hunt", "Study", "Survey", "Tinker"] },
      { attribute: "Prowess", actions: ["Finesse", "Prowl", "Skirmish", "Wreck"] },
      { attribute: "Resolve", actions: ["Attune", "Command", "Consort", "Sway"] },
    ]);
  });

  it("returns null when Attributes carries an empty action list or bad shapes", () => {
    expect(actionGroupsFromSettings({})).toBeNull();
    expect(actionGroupsFromSettings({ Attributes: [] })).toBeNull();
    expect(actionGroupsFromSettings({ Attributes: [{ Actions: [{ Name: "Hunt" }] }] })).toBeNull();
    expect(
      actionGroupsFromSettings({ Attributes: [{ Name: "Insight", Actions: [] }] }),
    ).toBeNull();
    expect(
      actionGroupsFromSettings({ Attributes: [{ Name: "Insight", Actions: [{}] }] }),
    ).toBeNull();
  });
});

describe("unspent Talent counter math", () => {
  const budget = { startingActionDots: 7, startingActionDotMax: 2 };
  const cases: Array<[string, Record<string, number>, number]> = [
    ["nothing selected sums to the full budget", {}, 7],
    ["partial selection subtracts selected dots", { Hunt: 2, Study: 1 }, 4],
    ["exact allocation reaches zero", { Hunt: 2, Study: 2, Survey: 2, Tinker: 1 }, 0],
    ["over-allocation shows negative (visible before submit)", { Hunt: 2, Study: 2, Survey: 2, Tinker: 2 }, -1],
  ];
  it.each(cases)("%s", (_name, ratings, want) => {
    expect(unspentDots(budget, ratings)).toBe(want);
  });

  it("sumRatings ignores unselected actions", () => {
    expect(sumRatings({})).toBe(0);
    expect(sumRatings({ A: 1, B: 2 })).toBe(3);
  });
});

describe("PC create disabled-button rule", () => {
  const budget = { startingActionDots: 7, startingActionDotMax: 2 };
  const cases: Array<[string, string, Record<string, number>, boolean]> = [
    ["disabled without a playbook", "", { Hunt: 2, Study: 2, Survey: 2, Tinker: 1 }, false],
    ["disabled while dots are unspent", "Cutter", { Hunt: 2, Study: 2 }, false],
    ["enabled at exactly zero unspent within cap", "Cutter", { Hunt: 2, Study: 2, Survey: 2, Tinker: 1 }, true],
    ["blocked when a rating exceeds the cap even at an exact sum", "Cutter", { Hunt: 3, Study: 2, Survey: 2 }, false],
    ["blocked on a negative rating", "Cutter", { Hunt: -1, Study: 2, Survey: 2, Tinker: 4 }, false],
  ];
  it.each(cases)("%s", (_name, playbook, ratings, want) => {
    expect(pcAllocationReady(budget, playbook, ratings)).toBe(want);
  });
});
