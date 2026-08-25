import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCrew, newCharacter } from "../../src/suite-helpers.js";

/**
 * A11: the remaining missing ops — crew cohorts (add/remove/update), crew
 * coin/stash/tier deltas, and crew xp add/clear. (The character
 * relationship row became the CONTRACT-05 contacts family; see
 * suites/semantics/character-contacts.test.ts.)
 */
describe("§5.1 missing ops: cohorts, crew coin/stash/tier/xp", () => {
  testCase("SEMANTICS-COHORT-001", "cohort.add appends a cohort with an id; update mutates; remove drops; unknown → NOT_FOUND", async () => {
    const crew = await newCrew();
    const added = await api.crewOp(crew.id, "cohort.add", {
      cohortKind: "gang", gangType: "Thugs", quality: 1,
    });
    expect(added.ok).toBe(true);
    expect(added.crew?.cohorts).toHaveLength(1);
    const cohort = added.crew?.cohorts[0];
    expect(cohort?.id).toBeTruthy();
    expect(cohort?.cohortKind).toBe("gang");
    expect(cohort?.gangType).toBe("Thugs");
    expect(cohort?.quality).toBe(1);
    expect(cohort?.harm).toBe("healthy");

    const updated = await api.crewOp(crew.id, "cohort.update", {
      cohortId: cohort?.id ?? "", quality: 2, harm: "weakened",
    });
    expect(updated.ok).toBe(true);
    expect(updated.crew?.cohorts[0].quality).toBe(2);
    expect(updated.crew?.cohorts[0].harm).toBe("weakened");

    const removed = await api.crewOp(crew.id, "cohort.remove", { cohortId: cohort?.id ?? "" });
    expect(removed.ok).toBe(true);
    expect(removed.crew?.cohorts).toHaveLength(0);

    const unknown = await api.crewOp(crew.id, "cohort.remove", { cohortId: "no-such-id" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.code).toBe("NOT_FOUND");
  });

  testCase("SEMANTICS-CREW-FUND-001", "crew coin.add / stash.add / tier.add report applied deltas; stash clamps at derived capacity; tier floors at 0", async () => {
    const crew = await newCrew();
    const coin = await api.crewOp(crew.id, "coin.add", { delta: 5 });
    expect(coin.ok).toBe(true);
    expect(coin.crew?.coin).toBe(5);
    expect(coin.applied.requested).toBe(5);
    expect(coin.applied.effective).toBe(5);

    // CONTRACT-04 (2026-08-25): positive stash deltas clamp at the
    // vault-derived stashCapacity the server computed at creation.
    const cap = crew.stashCapacity;
    const stash = await api.crewOp(crew.id, "stash.add", { delta: cap + 3 });
    expect(stash.ok).toBe(true);
    expect(stash.applied.requested).toBe(cap + 3);
    expect(stash.applied.effective).toBe(cap);
    expect(stash.crew?.stash).toBe(cap);

    const tier = await api.crewOp(crew.id, "tier.add", { delta: 1 });
    expect(tier.ok).toBe(true);
    expect(tier.crew?.tier).toBe(1);

    const tierDown = await api.crewOp(crew.id, "tier.add", { delta: -5 });
    expect(tierDown.ok).toBe(true);
    expect(tierDown.crew?.tier).toBe(0);
  });

  testCase("SEMANTICS-CREW-XP-001", "crew xp.add clamps to max; xp.clear resets", async () => {
    const crew = await newCrew();
    const max = crew.experience.max;
    const added = await api.crewOp(crew.id, "xp.add", { delta: max + 3 });
    expect(added.ok).toBe(true);
    expect(added.crew?.experience.points).toBe(max);

    const cleared = await api.crewOp(crew.id, "xp.clear");
    expect(cleared.ok).toBe(true);
    expect(cleared.crew?.experience.points).toBe(0);
  });

});
