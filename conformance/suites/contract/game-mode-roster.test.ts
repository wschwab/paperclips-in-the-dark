import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { firstPlaybook } from "../../src/game-data.js";
import { validate } from "../../src/contract-validator.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { decodeRoster } from "../../../frontend/src/schema/campaign.js";

describe("GAME-MODE live roster contract and consumer parity", () => {
  testCase("GAME-MODE-ROSTER-001", "roster mode matches the strict contract and both actual decoder mirrors", async () => {
    const created = await api.createCharacter("blades-in-the-dark", firstPlaybook("blades-in-the-dark"));
    expect(created.ok).toBe(true);
    let character = created.character!;

    for (const mode of ["free-play", "score", "downtime"] as const) {
      const changed = await api.operation(await api.post(
        `characters/${character.id}/ops/mode.set`, { mode },
        { "If-Match": String(character.revision) },
      ));
      expect(changed.ok).toBe(true);
      character = changed.character!;
      const response = await api.get("campaign/roster");
      expect(response.status).toBe(200);
      const contractResult = validate("roster", response.body);
      expect(contractResult.errors).toEqual([]);
      expect(contractResult.valid).toBe(true);
      const conformanceRoster = await decode(Schemas.Roster, response.body);
      const row = conformanceRoster.characters.find((candidate) => candidate.id === character.id)!;
      expect(row.isReadable).toBe(true);
      expect(row.mode).toBe(mode);

      // Negative controls establish strictness, not merely a permissive pass.
      const withUnknown = {
        ...conformanceRoster,
        characters: conformanceRoster.characters.map((candidate) =>
          candidate.id === character.id ? { ...candidate, undeclaredRosterProperty: true } : candidate),
      };
      expect(validate("roster", withUnknown).valid).toBe(false);
      const withInvalidMode = {
        ...conformanceRoster,
        characters: conformanceRoster.characters.map((candidate) =>
          candidate.id === character.id ? { ...candidate, mode: "campaign-wide" } : candidate),
      };
      expect(validate("roster", withInvalidMode).valid).toBe(false);

      // Exercise the real independent frontend mirror against live Ada bytes.
      // Contract-only and conformance-only decoders cannot detect its drift.
      const frontendRoster = decodeRoster(response.body);
      expect(frontendRoster.characters.find((candidate) => candidate.id === character.id)).toMatchObject({ mode });
    }
  });
});
