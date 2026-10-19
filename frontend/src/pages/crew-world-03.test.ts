// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import world from "../../../data/world/doskvol.json";
import { doskvolDistrictsDisclosure } from "./crew-sections/doskvol-world.js";

const canonicalDistricts = [
  "Barrowcleft", "Brightstone", "Charhollow", "Charterhall", "Coalridge", "Crow's Foot",
  "The Docks", "Dunslough", "Nightmarket", "Silkshore", "Six Towers", "Whitecrown",
];

describe("CREW-WORLD-03 canonical district reference", () => {
  it("contains exactly the twelve districts, with Whitecrown classified once as a district", () => {
    expect(world.districts.map(district => district.name).sort()).toEqual([...canonicalDistricts].sort());
    expect(world.factions.some(faction => faction.name === "Whitecrown")).toBe(false);
    expect(world.districts.find(district => district.name === "Whitecrown")).toMatchObject({ tier: 5, hold: "strong" });
  });

  it("uses distinct app-written district descriptions instead of tier/hold templates", () => {
    expect(new Set(world.districts.map(district => district.summary)).size).toBe(12);
    for (const district of world.districts) {
      expect(district.summaryAuthor).toBe("app");
      expect(district.summary.trim().split(/\s+/).length).toBeGreaterThanOrEqual(10);
      expect(district.summary).not.toMatch(/district at tier|hold rating|campaign sheet/i);
      expect(district.summary.match(/[.!?](?:\s|$)/g)?.length).toBeGreaterThanOrEqual(1);
      expect(district.summary.match(/[.!?](?:\s|$)/g)?.length).toBeLessThanOrEqual(2);
    }
  });

  it("records two to four sourced canonical location names with short app-written descriptions", () => {
    for (const district of world.districts) {
      expect(district.locations.length).toBeGreaterThanOrEqual(2);
      expect(district.locations.length).toBeLessThanOrEqual(4);
      for (const location of district.locations) {
        expect(location).toMatchObject({ name: expect.any(String), description: expect.any(String), descriptionAuthor: "app" });
        expect(location).toHaveProperty("sources", expect.arrayContaining([expect.stringMatching(/^https:\/\//)]));
      }
    }
  });

  it("renders district prose and named location descriptions without old empty-state claims", () => {
    const disclosure = doskvolDistrictsDisclosure();
    expect(disclosure.querySelector("summary")?.textContent).toBe("Doskvol districts (12)");
    expect(disclosure.querySelectorAll(".doskvol-district")).toHaveLength(12);
    expect(disclosure.querySelectorAll(".doskvol-locations li").length).toBeGreaterThanOrEqual(24);
    expect(disclosure.querySelectorAll(".doskvol-locations li strong").length).toBeGreaterThanOrEqual(24);
    expect(disclosure.textContent).not.toMatch(/not recorded yet|No noteworthy locations recorded|\[object Object\]/);
    expect(disclosure.textContent).toContain("Descriptions are written for this app");
  });
});
