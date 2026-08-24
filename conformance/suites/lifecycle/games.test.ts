import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { gameSetting } from "../../src/game-data.js";
import { decode, Schemas } from "../../src/schemas.js";
import { BLADES, SCUM } from "../../src/suite-helpers.js";
import { testCase } from "../../src/test-case.js";

describe("lifecycle game discovery", () => {
  testCase("LIFECYCLE-GAMES-001", "the games endpoint includes S&V", async () => {
    const response = await api.get("games");
    expect(response.status).toBe(200);
    const games = (await decode(Schemas.JsonArray, response.body)) as Array<{ stem: string; name: string }>;
    expect(games.some((game) => game.stem === "scum-and-villainy" || game.name === "Scum and Villainy")).toBe(true);
  });

  testCase("LIFECYCLE-GAMES-002", "the served S&V document matches its authored fixture maxima and diverges from Blades", async () => {
    // Upgrade (lifecycle.decisions.json): the awaited GET was previously
    // discarded, so the row observed only local fixtures. The served game
    // document is authored data served verbatim from data/games/, so its
    // maxima must equal the authored fixture (real observation) while the
    // divergence assertions stay — they are the precondition making
    // CREATION-003 / LIMIT-* settings-propagation tests discriminating.
    const response = await api.get(`games/${SCUM}`);
    expect(response.status).toBe(200);
    const served = response.body as Record<string, unknown>;
    const setting = gameSetting(SCUM);
    expect(served.RecoveryClockSize).toBe(setting.RecoveryClockSize);
    expect(served.ActionPointMaximum).toBe(setting.ActionPointMaximum);
    const blades = gameSetting(BLADES);
    expect(setting.RecoveryClockSize).not.toBe(blades.RecoveryClockSize);
    expect(setting.ActionPointMaximum).not.toBe(blades.ActionPointMaximum);
  });
});
