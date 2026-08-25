import { describe, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCrew } from "../../src/suite-helpers.js";

/**
 * CONTRACT-04 (2026-08-25) — crew progression semantics corrections.
 *
 * Normative source: docs/pages/contract/contract-c4-crew-progression.mdx
 * (DEC-04 human ruling, 2026-08-24). Every expected value below is derived
 * from the frozen game data — never embedded as a literal:
 *
 *  - CrewTierMax / CrewStashBaseCapacity come from the validated settings
 *    file for the BLADES stem;
 *  - the Vault capacity table comes from the crew-type catalog
 *    (blades-in-the-dark-crews.json, StashCapacities on the Vault upgrade).
 *
 * Roman numeral Tier display is a frontend presentation formatter over the
 * DTO integer; by contract it has NO assertion here (wire format unchanged).
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface GameSettings {
  CrewTierMax: number;
  CrewStashBaseCapacity: number;
}
interface CrewCatalog {
  CrewTypes: Array<{
    Upgrades: Array<{ Name: string; TotalBoxes: number; StashCapacities?: number[] }>;
  }>;
}

const settings = JSON.parse(
  readFileSync(resolve(repoRoot, "data/games/blades-in-the-dark.json"), "utf8"),
) as GameSettings;
const crewsData = JSON.parse(
  readFileSync(resolve(repoRoot, "data/games/blades-in-the-dark-crews.json"), "utf8"),
) as CrewCatalog;

const tierMax = settings.CrewTierMax;
const baseCapacity = settings.CrewStashBaseCapacity;

// The BitD Vault is the only upgrade in any supported catalog that declares
// StashCapacities; its frozen shape is [4, 8, 16] over TotalBoxes 2.
const vaultEntries = crewsData.CrewTypes.flatMap((t) => t.Upgrades).filter(
  (u) => u.Name === "Vault" && u.StashCapacities !== undefined,
);
if (vaultEntries.length === 0) throw new Error("frozen data must declare Vault StashCapacities");
const vaultSteps = vaultEntries[0].StashCapacities!;
const vaultTotalBoxes = vaultEntries[0].TotalBoxes;

/** Capacity per the CONTRACT-04 derivation for `marked` Vault boxes. */
function expectedCapacity(marked: number): number {
  if (marked <= 0) return baseCapacity;
  return vaultSteps[Math.min(marked, vaultSteps.length - 1)];
}

describe("CONTRACT-04 crew progression semantics", () => {
  testCase(
    "CREW-PROGRESSION-TIER-001",
    "tier.add clamps positive deltas at the settings-derived CrewTierMax",
    async () => {
      const crew = await newCrew();
      const up = await api.crewOp(crew.id, "tier.add", { delta: tierMax + 10 });
      expect(up.ok).toBe(true);
      expect(up.applied.requested).toBe(tierMax + 10);
      expect(up.applied.effective).toBe(tierMax);
      expect(up.crew?.tier).toBe(tierMax);

      // The ceiling is per-state: at max, further positive deltas apply 0.
      const again = await api.crewOp(crew.id, "tier.add", { delta: 1 });
      expect(again.ok).toBe(true);
      expect(again.applied.effective).toBe(0);
      expect(again.crew?.tier).toBe(tierMax);

      // Negative deltas still floor at 0.
      const down = await api.crewOp(crew.id, "tier.add", { delta: -(tierMax + 1) });
      expect(down.ok).toBe(true);
      expect(down.applied.effective).toBe(-tierMax);
      expect(down.crew?.tier).toBe(0);
    },
  );

  testCase(
    "CREW-PROGRESSION-STASHCAP-001",
    "stashCapacity derives from the crew's own Vault marks across 0/1/2 boxes",
    async () => {
      expect(vaultTotalBoxes).toBeGreaterThanOrEqual(2);
      const crew = await newCrew();
      // 0 boxes: base capacity from settings.
      expect(crew.stashCapacity).toBe(expectedCapacity(0));

      const mark1 = await api.crewOp(crew.id, "upgrade.mark", { name: "Vault" });
      expect(mark1.ok).toBe(true);
      expect(mark1.crew?.stashCapacity).toBe(expectedCapacity(1));

      const mark2 = await api.crewOp(crew.id, "upgrade.mark", { name: "Vault" });
      expect(mark2.ok).toBe(true);
      expect(mark2.crew?.stashCapacity).toBe(expectedCapacity(2));

      // Unmarking lowers future capacity without touching stored stash.
      const unmark = await api.crewOp(crew.id, "upgrade.unmark", { name: "Vault" });
      expect(unmark.ok).toBe(true);
      expect(unmark.crew?.stashCapacity).toBe(expectedCapacity(1));
      expect(unmark.crew?.stash).toBe(0);
    },
  );

  testCase(
    "CREW-PROGRESSION-STASH-CLAMP-001",
    "stash.add clamps at the current derived capacity and reconciles after expansion",
    async () => {
      const crew = await newCrew();
      const over = await api.crewOp(crew.id, "stash.add", { delta: baseCapacity + 10 });
      expect(over.ok).toBe(true);
      expect(over.applied.requested).toBe(baseCapacity + 10);
      expect(over.applied.effective).toBe(baseCapacity);
      expect(over.crew?.stash).toBe(baseCapacity);
      expect(over.crew?.stashCapacity).toBe(baseCapacity);

      // Expand to two boxes: capacity rises, remaining headroom is fillable.
      await api.crewOp(crew.id, "upgrade.mark", { name: "Vault" });
      const expanded = await api.crewOp(crew.id, "upgrade.mark", { name: "Vault" });
      expect(expanded.crew?.stashCapacity).toBe(expectedCapacity(2));
      const topUp = expectedCapacity(2) - baseCapacity + 5;
      const fill = await api.crewOp(crew.id, "stash.add", { delta: topUp });
      expect(fill.ok).toBe(true);
      expect(fill.applied.effective).toBe(expectedCapacity(2) - baseCapacity);
      expect(fill.crew?.stash).toBe(expectedCapacity(2));

      // At capacity, positive deltas apply 0; negatives floor at 0.
      const full = await api.crewOp(crew.id, "stash.add", { delta: 3 });
      expect(full.ok).toBe(true);
      expect(full.applied.effective).toBe(0);
      const drain = await api.crewOp(crew.id, "stash.add", { delta: -1000 });
      expect(drain.ok).toBe(true);
      expect(drain.applied.effective).toBe(-expectedCapacity(2));
      expect(drain.crew?.stash).toBe(0);
    },
  );

  testCase(
    "CREW-PROGRESSION-DTO-001",
    "create response carries the server-computed stashCapacity (shared crew shape)",
    async () => {
      const crew = await newCrew();
      expect(crew.stashCapacity).toBeDefined();
      expect(crew.stashCapacity).toBe(baseCapacity);
      const fetched = await api.get(`crews/${crew.id}`);
      expect(fetched.status).toBe(200);
      const body = JSON.parse(fetched.rawBody) as { stashCapacity?: number };
      expect(body.stashCapacity).toBe(baseCapacity);
    },
  );
});
