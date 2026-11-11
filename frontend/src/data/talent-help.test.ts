import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// TALENT-HELP-01 reuses the edition's existing SRD action summaries.
describe("Talent action help data", () => {
  for (const edition of ["blades-in-the-dark", "français-blades-in-the-dark", "rus-blades-in-the-dark", "scum-and-villainy"]) {
    it(`${edition} supplies a short description for every published action`, () => {
      const game = JSON.parse(readFileSync(`../data/games/${edition}.json`, "utf8").replace(/^\uFEFF/, ""));
      expect(game.Attributes.length).toBeGreaterThan(0);
      for (const attribute of game.Attributes) {
        expect(attribute.Actions.length).toBeGreaterThan(0);
        for (const action of attribute.Actions) {
          expect(typeof action.ShortDescription, action.Name).toBe("string");
          expect(action.ShortDescription.trim().length, action.Name).toBeGreaterThan(0);
        }
      }
    });
  }
});
