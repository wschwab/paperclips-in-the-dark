import { readFileSync } from "node:fs";
import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { BLADES, newCrew, revisionHeader } from "../../src/suite-helpers.js";

interface ClaimNode {
  Id: string;
  Kind?: string;
}

interface CrewDefinitions {
  CrewTypes: Array<{
    Name: string;
    Claims: { Nodes: ClaimNode[] };
  }>;
}

// Contract fixtures are loaded from the checked-in game-settings JSON so claim
// identities follow the selected crew type instead of being duplicated in tests.
const crewDefinitions = JSON.parse(
  readFileSync(new URL(`../../../data/games/${BLADES}-crews.json`, import.meta.url), "utf8"),
) as CrewDefinitions;

function ordinaryClaimId(crewTypeName = "Assassins"): string {
  const crewType = crewDefinitions.CrewTypes.find((candidate) => candidate.Name === crewTypeName);
  const claim = crewType?.Claims.Nodes.find((candidate) => candidate.Kind !== "lair");
  if (!claim) throw new Error(`No ordinary claim in game settings for ${crewTypeName}`);
  return claim.Id;
}

async function historyOps(crewId: string): Promise<string[]> {
  const response = await api.get(`crews/${crewId}/history`);
  expect(response.status).toBe(200);
  return (await decode(Schemas.History, response.body)).map((entry) => entry.op);
}

const UNKNOWN_CLAIM = "not-a-canonical-claim";

describe("claim operation observable coverage", () => {
  testCase(
    "CLAIM-SET-001",
    "claim.set guards request/response schema, transition, history, reload, stale writes, and validation",
    async () => {
      const crew = await newCrew();
      const claimId = ordinaryClaimId(crew.crewTypeName);
      const path = `crews/${crew.id}/ops/claim.set`;

      const malformed = await api.post(path, { claimId }, revisionHeader(crew.revision));
      expect(malformed.status).toBe(400);

      const appliedResponse = await api.post(path, { claimId, claimed: true }, revisionHeader(crew.revision));
      expect(appliedResponse.status).toBe(200);
      const applied = await api.operation(appliedResponse);
      expect(applied.ok).toBe(true);
      expect(applied.applied).toEqual({ op: "claim.set" });
      expect(applied.error).toBeNull();
      expect(applied.crew?.claimedClaimIds).toContain(claimId);
      expect(applied.crew?.revision).toBe(crew.revision + 1);
      expect((await historyOps(crew.id))[0]).toBe("claim.set");

      const reloaded = await api.crew(crew.id);
      expect(reloaded.claimedClaimIds).toContain(claimId);

      const staleResponse = await api.post(path, { claimId, claimed: false }, revisionHeader(crew.revision));
      expect(staleResponse.status).toBe(409);
      const stale = await api.operation(staleResponse);
      expect(stale.ok).toBe(false);
      expect(stale.error?.code).toBe("STALE_REVISION");
      expect((await api.crew(crew.id)).claimedClaimIds).toContain(claimId);

      const invalidResponse = await api.post(
        path,
        { claimId: UNKNOWN_CLAIM, claimed: true },
        revisionHeader(reloaded.revision),
      );
      expect(invalidResponse.status).toBe(200);
      const invalid = await api.operation(invalidResponse);
      expect(invalid.ok).toBe(false);
      expect(invalid.error?.code).toBe("VALIDATION");
      expect((await api.crew(crew.id)).claimedClaimIds).toEqual(reloaded.claimedClaimIds);
    },
  );

  testCase(
    "CLAIM-CUSTOMIZE-002",
    "claim.customize guards request/response schema, transition, history, reload, stale writes, and validation",
    async () => {
      const crew = await newCrew();
      const claimId = ordinaryClaimId(crew.crewTypeName);
      const path = `crews/${crew.id}/ops/claim.customize`;

      const malformed = await api.post(
        path,
        { claimId, unsupported: true },
        revisionHeader(crew.revision),
      );
      expect(malformed.status).toBe(400);

      const fields = {
        name: "Controlled claim",
        description: "A crew-specific claim description",
        effects: [{ Kind: "derivedDelta", Target: "crew.turf", Delta: 1 }],
      };
      const appliedResponse = await api.post(path, { claimId, ...fields }, revisionHeader(crew.revision));
      expect(appliedResponse.status).toBe(200);
      const applied = await api.operation(appliedResponse);
      expect(applied.ok).toBe(true);
      expect(applied.applied).toEqual({ op: "claim.customize" });
      expect(applied.error).toBeNull();
      expect(applied.crew?.claimOverrides).toContainEqual({ claimId, ...fields });
      expect((await historyOps(crew.id))[0]).toBe("claim.customize");

      const reloaded = await api.crew(crew.id);
      expect(reloaded.claimOverrides).toContainEqual({ claimId, ...fields });

      const staleResponse = await api.post(
        path,
        { claimId, name: "Stale overwrite" },
        revisionHeader(crew.revision),
      );
      expect(staleResponse.status).toBe(409);
      const stale = await api.operation(staleResponse);
      expect(stale.ok).toBe(false);
      expect(stale.error?.code).toBe("STALE_REVISION");
      expect((await api.crew(crew.id)).claimOverrides).toContainEqual({ claimId, ...fields });

      const invalidResponse = await api.post(
        path,
        { claimId: UNKNOWN_CLAIM, name: "Unknown" },
        revisionHeader(reloaded.revision),
      );
      expect(invalidResponse.status).toBe(200);
      const invalid = await api.operation(invalidResponse);
      expect(invalid.ok).toBe(false);
      expect(invalid.error?.code).toBe("VALIDATION");
      expect((await api.crew(crew.id)).claimOverrides).toEqual(reloaded.claimOverrides);
    },
  );

  testCase(
    "CLAIM-RESET-003",
    "claim.reset guards request/response schema, transition, history, reload, stale writes, and validation",
    async () => {
      const crew = await newCrew();
      const claimId = ordinaryClaimId(crew.crewTypeName);
      const customized = await api.crewOp(
        crew.id,
        "claim.customize",
        { claimId, name: "Temporary override" },
        crew.revision,
      );
      expect(customized.ok).toBe(true);
      if (!customized.crew) throw new Error("claim.customize returned no crew");
      const path = `crews/${crew.id}/ops/claim.reset`;

      const malformed = await api.post(path, {}, revisionHeader(customized.crew.revision));
      expect(malformed.status).toBe(400);

      const appliedResponse = await api.post(
        path,
        { claimId },
        revisionHeader(customized.crew.revision),
      );
      expect(appliedResponse.status).toBe(200);
      const applied = await api.operation(appliedResponse);
      expect(applied.ok).toBe(true);
      expect(applied.applied).toEqual({ op: "claim.reset" });
      expect(applied.error).toBeNull();
      expect(applied.crew?.claimOverrides.some((override) => override.claimId === claimId)).toBe(false);
      expect((await historyOps(crew.id))[0]).toBe("claim.reset");

      const reloaded = await api.crew(crew.id);
      expect(reloaded.claimOverrides.some((override) => override.claimId === claimId)).toBe(false);

      const staleResponse = await api.post(
        path,
        { claimId },
        revisionHeader(customized.crew.revision),
      );
      expect(staleResponse.status).toBe(409);
      const stale = await api.operation(staleResponse);
      expect(stale.ok).toBe(false);
      expect(stale.error?.code).toBe("STALE_REVISION");
      expect((await api.crew(crew.id)).claimOverrides).toEqual(reloaded.claimOverrides);

      const invalidResponse = await api.post(
        path,
        { claimId: UNKNOWN_CLAIM },
        revisionHeader(reloaded.revision),
      );
      expect(invalidResponse.status).toBe(200);
      const invalid = await api.operation(invalidResponse);
      expect(invalid.ok).toBe(false);
      expect(invalid.error?.code).toBe("VALIDATION");
      expect((await api.crew(crew.id)).claimOverrides).toEqual(reloaded.claimOverrides);
    },
  );
});
