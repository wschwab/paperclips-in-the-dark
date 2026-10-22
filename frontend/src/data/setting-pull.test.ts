import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const gamesDir = fileURLToPath(new URL("../../../data/games/", import.meta.url));
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("SETTING-PULL-01 shipping data", () => {
  it("ships no stock factions, districts or locations while permission is pending", () => {
    const world = json(fileURLToPath(new URL("../../../data/world/doskvol.json", import.meta.url)));
    expect(world.factions.length).toBe(0);
    expect(world.districts.length).toBe(0);
    expect(world.groups.length).toBe(0);
    expect(world.source.status).toBe("pulled pending permission");
  });
  it("empties heritage choices and descriptions in every shipped Doskvol edition discovered from the data directory", () => {
    const editions = readdirSync(gamesDir).filter(name => name.endsWith("blades-in-the-dark.json"));
    expect(editions.length).toBeGreaterThan(0);
    for (const edition of editions) expect(json(`${gamesDir}/${edition}`).Heritages.length, edition).toBe(0);
  });
  it("does not retain a setting heritage in the shipped demo scoundrel", () => {
    expect(Object.values(json(`${gamesDir}/demo-character.json`).Dossier.Heritage).every(value => value === "")).toBe(true);
  });
  it("does not remove unrelated Scum and Villainy game choices in this Doskvol-only pull", () => {
    expect(json(`${gamesDir}/scum-and-villainy.json`).Heritages.length).toBeGreaterThan(0);
  });
});
