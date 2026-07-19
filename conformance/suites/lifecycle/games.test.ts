import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { gameSetting } from "../../src/game-data.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";

describe("lifecycle game discovery", () => {
  testCase("LIFECYCLE-GAMES-001", "the games endpoint includes S&V", async () => {
    const response = await api.get("games");
    expect(response.status).toBe(200);
    const games = (await decode(Schemas.JsonArray, response.body)) as Array<{ stem: string; name: string }>;
    expect(games.some((game) => game.stem === "scum-and-villainy" || game.name === "Scum and Villainy")).toBe(true);
  });

  testCase("LIFECYCLE-GAMES-002", "S&V local maxima are not the Blades defaults", async () => {
    await api.get("games/scum-and-villainy");
    const setting = gameSetting("scum-and-villainy");
    const blades = gameSetting("blades-in-the-dark");
    expect(setting.RecoveryClockSize).not.toBe(blades.RecoveryClockSize);
    expect(setting.ActionPointMaximum).not.toBe(blades.ActionPointMaximum);
  });
});
