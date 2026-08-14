import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter } from "../../src/suite-helpers.js";

/**
 * AUDIT-0 BUG-005 regression coverage (composite operations).
 *
 * campaign.batch, characters/{id}/end-score and characters/{id}/end-downtime
 * are declared in the contract but currently always return ok:false /
 * VALIDATION. Expected behavior per PAPERCLIPS.md §7.2 and the audit's
 * post-fix criteria: valid composites succeed (executed sequentially,
 * all-or-nothing, one snapshot + one history entry, one revision bump), and a
 * batch whose middle op fails rolls back atomically so every affected
 * entity's file, revision and history stay unchanged.
 */
describe("§5.1 composites: campaign.batch / end-score / end-downtime (AUDIT-0 BUG-005)", () => {
  async function historyLength(characterId: string): Promise<number> {
    const response = await api.get(`characters/${characterId}/history`);
    expect(response.status).toBe(200);
    return (await decode(Schemas.History, response.body)).length;
  }

  testCase("SEMANTICS-COMPOSITES-001", "campaign.batch applies ops sequentially, reports per-op outcomes, and writes one history entry", async () => {
    const character = await newCharacter();
    const historyBefore = await historyLength(character.id);

    const response = await api.post("campaign/batch", {
      ops: [
        { entity: "character", id: character.id, op: "stress.add", args: { delta: 1 } },
        // trauma.add is resolution-only under the frozen lifecycle (it
        // requires traumaPending — SC-A8), so the second op is an ungated
        // snapshot-worthy op; the batch subject is sequencing/outcomes.
        { entity: "character", id: character.id, op: "note.add", args: { text: "batched note" } },
      ],
    });
    expect(response.status).toBe(200);
    const result = await api.operation(response);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.batch).toHaveLength(2);
    expect(result.batch?.[0]?.ok).toBe(true);
    expect(result.batch?.[0]?.op).toBe("stress.add");
    expect(result.batch?.[1]?.ok).toBe(true);
    expect(result.batch?.[1]?.op).toBe("note.add");

    const after = await api.character(character.id);
    expect(after.revision).toBe(character.revision + 1);
    expect(after.monitor.stress.current).toBe(character.monitor.stress.current + 1);
    expect(after.dossier.notes).toContain("batched note");
    expect(await historyLength(character.id)).toBe(historyBefore + 1);
  });

  testCase("SEMANTICS-COMPOSITES-002", "a batch with an invalid middle op rolls back atomically leaving revisions and state unchanged", async () => {
    const first = await newCharacter();
    const second = await newCharacter();
    const firstBefore = await api.character(first.id);
    const secondBefore = await api.character(second.id);
    const firstHistoryBefore = await historyLength(first.id);
    const secondHistoryBefore = await historyLength(second.id);

    const response = await api.post("campaign/batch", {
      ops: [
        { entity: "character", id: first.id, op: "stress.add", args: { delta: 1 } },
        { entity: "character", id: second.id, op: "no.such-op", args: {} },
        { entity: "character", id: first.id, op: "stress.add", args: { delta: 1 } },
      ],
    });
    expect(response.status).toBe(200);
    const result = await api.operation(response);
    // Frozen batch envelope: every planned item is evaluated and reported as
    // a per-op outcome; the envelope stays 200 with ok:true and error:null —
    // all-or-nothing refers to WRITES (nothing is written when any item
    // fails), so the batch never fails as a whole.
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.batch).toHaveLength(3);
    expect(result.batch?.[0]?.ok).toBe(true);
    expect(result.batch?.[1]?.ok).toBe(false);
    // Batch items carry the same whole-error union as the top-level error
    // (ERR-BATCH-008); an unknown op is a VALIDATION branch with pointer
    // details.
    const itemError = result.batch?.[1]?.error as { status?: number; retryable?: boolean; recovery?: string } | undefined;
    expect(result.batch?.[1]?.error?.code).toBe("VALIDATION");
    expect(itemError?.status).toBe(400);
    expect(itemError?.retryable).toBeTypeOf("boolean");
    expect(itemError?.recovery).toBeTypeOf("string");
    expect(result.batch?.[1]?.error?.details.issues.length).toBeGreaterThan(0);
    expect(result.batch?.[2]?.ok).toBe(true);

    const firstAfter = await api.character(first.id);
    const secondAfter = await api.character(second.id);
    expect(firstAfter.revision).toBe(firstBefore.revision);
    expect(firstAfter.monitor.stress.current).toBe(firstBefore.monitor.stress.current);
    expect(secondAfter.revision).toBe(secondBefore.revision);
    expect(await historyLength(first.id)).toBe(firstHistoryBefore);
    expect(await historyLength(second.id)).toBe(secondHistoryBefore);
  });

  testCase("SEMANTICS-COMPOSITES-003", "end-score clears armor used and resets loadout commitment", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "gear.add", { name: "Armor", bulk: 2 });
    await api.characterOp(character.id, "gear.set-commitment", { commitment: "heavy" });
    await api.characterOp(character.id, "gear.commit", { name: "Armor" });
    const used = await api.characterOp(character.id, "armor.set", { armor: "standard", used: true });
    expect(used.ok).toBe(true);
    const before = await api.character(character.id);
    // baseline AFTER setup: gear.add is x-snapshot:true, so it legitimately
    // created one history entry; the composite must add exactly one more.
    const historyBefore = await historyLength(character.id);
    expect(before.monitor.armor.standardUsed).toBe(true);
    expect(before.gear.loadout).toHaveLength(1);
    expect(before.gear.commitment).toBe("heavy");

    const response = await api.post(`characters/${character.id}/end-score`, {
      clearArmorUsed: true,
      resetLoadoutCommitment: true,
    });
    expect(response.status).toBe(200);
    const result = await api.operation(response);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();

    const after = await api.character(character.id);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.monitor.armor.standardUsed).toBe(false);
    expect(after.monitor.armor.heavyUsed).toBe(false);
    expect(after.monitor.armor.specialUsed).toBe(false);
    expect(after.gear.loadout).toHaveLength(0);
    expect(after.gear.commitment).toBe("none");
    expect(await historyLength(character.id)).toBe(historyBefore + 1);
  });

  testCase("SEMANTICS-COMPOSITES-004", "end-downtime clears session expressions and applies the caller-supplied vice relief", async () => {
    const character = await newCharacter();
    await api.characterOp(character.id, "stress.add", { delta: 5 });
    await api.characterOp(character.id, "session.set", {
      playbookExpressions: 2,
      characterExpressions: 1,
      struggleExpressions: 1,
    });
    const before = await api.character(character.id);
    expect(before.monitor.stress.current).toBe(5);
    // baseline AFTER setup: stress.add is x-snapshot:true (one entry);
    // end-downtime must add exactly one more.
    const historyBefore = await historyLength(character.id);
    expect(before.session.playbookExpressions).toBe(2);

    const response = await api.post(`characters/${character.id}/end-downtime`, {
      clearSessionExpressions: true,
      viceReliefStress: 2,
    });
    expect(response.status).toBe(200);
    const result = await api.operation(response);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();

    const after = await api.character(character.id);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.session.playbookExpressions).toBe(0);
    expect(after.session.characterExpressions).toBe(0);
    expect(after.session.struggleExpressions).toBe(0);
    expect(after.monitor.stress.current).toBe(3);
    expect(await historyLength(character.id)).toBe(historyBefore + 1);
  });
});
