import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";
import { BLADES } from "../../src/suite-helpers.js";
import type { OperationResultDto } from "../../src/schemas.js";

/**
 * SC-O5 — Clocks oracle (frozen Wave 2 contract; clock-taxonomy.mdx).
 *
 * The Ada runtime still emits legacy clock rows (clockKind, no owner fields)
 * and rejects the new create request shape until SC-A7, so every
 * create-dependent case is red today at create/decode. The red reason per
 * case is documented in the case title; the assertions freeze the new
 * contract and go green once SC-A7 lands. CLOCK-HEALING-013 is the guard
 * that must stay green (embedded healing clocks are not /api/clocks rows).
 */

/** POST a clock through the frozen create request shape and decode the result. */
async function postClock(body: unknown): Promise<OperationResultDto> {
  return api.operation(await api.post("clocks", body));
}

/**
 * Create a character through the raw API and return its id. The character
 * DTO decode lags the frozen contract until SC-A7, so cases that only need
 * an existing owner id (or an owner to delete) read the raw body instead.
 */
async function rawCharacter(): Promise<{ id: string; revision: number }> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  const character = (response.body as { character?: { id: string; revision: number } }).character;
  if (!character) throw new Error("character create returned no character");
  return character;
}

describe("SC-O5 frozen clock contract (clock-taxonomy.mdx)", () => {
  testCase("CLOCK-OWNER-001", "create with campaign ownership (empty ownerId) succeeds", async () => {
    const result = await api.createClock("Campaign clock", "bounded", 4);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    const clock = result.clock;
    if (!clock) throw new Error("create returned no clock");
    expect(clock.ownerKind).toBe("campaign");
    expect(clock.ownerId).toBe("");
    expect(clock.behavior).toBe("bounded");
    expect(clock.rollover).toBe(0);
    expect(clock.relatedClockIds).toEqual([]);
  });

  testCase("CLOCK-OWNER-002", "character/crew ownerId must reference an existing entity of that kind", async () => {
    const character = await rawCharacter();
    const owned = await api.createClock("Character clock", "bounded", 4, "custom", "character", character.id);
    expect(owned.ok).toBe(true);
    expect(owned.clock?.ownerKind).toBe("character");
    expect(owned.clock?.ownerId).toBe(character.id);

    const bogus = await postClock({
      name: "Orphan clock",
      ownerKind: "character",
      ownerId: "00000000-0000-0000-0000-000000000000",
      purpose: "custom",
      behavior: "bounded",
      size: 4,
    });
    expect(bogus.ok).toBe(false);
    expect(bogus.error?.code).toBe("VALIDATION");
  });

  testCase("CLOCK-OWNER-003", "update changes owner; ownership validation applies", async () => {
    const character = await rawCharacter();
    const created = await api.createClock("Rehome clock", "bounded", 4);
    const clock = created.clock;
    if (!clock) throw new Error("create returned no clock");

    const rehomed = await api.operation(
      await api.post(`clocks/${clock.id}/update`, { ownerKind: "character", ownerId: character.id }, { "If-Match": String(clock.revision) }),
    );
    expect(rehomed.ok).toBe(true);
    expect(rehomed.clock?.ownerKind).toBe("character");
    expect(rehomed.clock?.ownerId).toBe(character.id);

    const bad = await api.operation(
      await api.post(
        `clocks/${clock.id}/update`,
        { ownerKind: "character", ownerId: "00000000-0000-0000-0000-000000000000" },
        { "If-Match": String(rehomed.clock?.revision) },
      ),
    );
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe("VALIDATION");

    // ownerKind and ownerId are updated together — provide both or neither.
    const half = await api.operation(
      await api.post(`clocks/${clock.id}/update`, { ownerKind: "crew" }, { "If-Match": String(rehomed.clock?.revision) }),
    );
    expect(half.ok).toBe(false);
    expect(half.error?.code).toBe("VALIDATION");
  });

  testCase("CLOCK-PURPOSE-004", "purpose validated against the settings ClockPurposes list (10 values)", async () => {
    const purposes = [
      "progress", "danger", "racing", "linked", "mission", "tug-of-war",
      "long-term-project", "faction", "score", "custom",
    ] as const;
    for (const purpose of purposes) {
      const result = await api.createClock(`Purpose ${purpose}`, "bounded", 4, purpose);
      expect(result.ok).toBe(true);
      expect(result.clock?.purpose).toBe(purpose);
    }
    const invalid = await postClock({
      name: "Bad purpose",
      ownerKind: "campaign",
      ownerId: "",
      purpose: "not-a-purpose",
      behavior: "bounded",
      size: 4,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.error?.code).toBe("VALIDATION");
  });

  testCase("CLOCK-BEHAVIOR-005", "bounded clock clamps at full, discards overflow, rollover stays 0", async () => {
    const created = await api.createClock("Bounded clock", "bounded", 4);
    const clock = created.clock;
    if (!clock) throw new Error("create returned no clock");
    const progressed = await api.operation(await api.post(`clocks/${clock.id}/ops/clock.progress`, { segments: 5 }));
    expect(progressed.ok).toBe(true);
    expect(progressed.clock?.segments).toBe(4);
    expect(progressed.clock?.rollover).toBe(0);
    expect(progressed.clock?.behavior).toBe("bounded");
  });

  testCase("CLOCK-ROLLOVER-006", "rollover clock accumulates prior overflow across progress calls (FV-006)", async () => {
    const created = await api.createClock("FV-006 rollover clock", "rollover", 4);
    const clock = created.clock;
    if (!clock) throw new Error("create returned no clock");
    const first = await api.operation(await api.post(`clocks/${clock.id}/ops/clock.progress`, { segments: 5 }));
    expect(first.ok).toBe(true);
    expect(first.clock?.segments).toBe(4);
    expect(first.clock?.rollover).toBe(1);
    // 6th segment (+1) on 4/4 with rollover 1: accumulation keeps rollover 2.
    const second = await api.operation(await api.post(`clocks/${clock.id}/ops/clock.progress`, { segments: 1 }));
    expect(second.ok).toBe(true);
    expect(second.clock?.segments).toBe(4);
    expect(second.clock?.rollover).toBe(2);
  });

  testCase("CLOCK-RESET-007", "reset applies at most one clock size and retains remaining overflow (taxonomy §10.3)", async () => {
    const created = await api.createClock("Reset clock", "rollover", 6);
    const clock = created.clock;
    if (!clock) throw new Error("create returned no clock");
    const progress = async (segments: number) => {
      const r = await api.operation(await api.post(`clocks/${clock.id}/ops/clock.progress`, { segments }));
      expect(r.ok).toBe(true);
      return r.clock;
    };
    const reset = async () => {
      const r = await api.operation(await api.post(`clocks/${clock.id}/ops/clock.reset`));
      expect(r.ok).toBe(true);
      return r.clock;
    };
    let c = await progress(4); // 4/6 r0
    expect(c?.segments).toBe(4);
    expect(c?.rollover).toBe(0);
    c = await progress(5); // 6/6 r3
    expect(c?.segments).toBe(6);
    expect(c?.rollover).toBe(3);
    c = await progress(2); // 6/6 r5 (accumulation)
    expect(c?.segments).toBe(6);
    expect(c?.rollover).toBe(5);
    c = await reset(); // 5/6 r0
    expect(c?.segments).toBe(5);
    expect(c?.rollover).toBe(0);
    c = await progress(3); // 6/6 r2
    expect(c?.segments).toBe(6);
    expect(c?.rollover).toBe(2);
    c = await progress(7); // 6/6 r9
    expect(c?.segments).toBe(6);
    expect(c?.rollover).toBe(9);
    c = await reset(); // 6/6 r3 (at most one size applied)
    expect(c?.segments).toBe(6);
    expect(c?.rollover).toBe(3);
    c = await reset(); // 3/6 r0
    expect(c?.segments).toBe(3);
    expect(c?.rollover).toBe(0);
  });

  testCase("CLOCK-TUG-008", "negative progress consumes rollover first, preserving rollover > 0 ⇒ segments = size", async () => {
    const created = await api.createClock("Tug-of-war clock", "rollover", 4);
    const clock = created.clock;
    if (!clock) throw new Error("create returned no clock");
    const progress = async (segments: number) => {
      const r = await api.operation(await api.post(`clocks/${clock.id}/ops/clock.progress`, { segments }));
      expect(r.ok).toBe(true);
      return r.clock;
    };
    let c = await progress(6); // 4/4 r2
    expect(c?.segments).toBe(4);
    expect(c?.rollover).toBe(2);
    c = await progress(-1); // total 4+2-1=5 → 4/4 r1
    expect(c?.segments).toBe(4);
    expect(c?.rollover).toBe(1);
    c = await progress(-5); // total 4+1-5=0 → 0/0
    expect(c?.segments).toBe(0);
    expect(c?.rollover).toBe(0);
    c = await progress(-1); // never below 0
    expect(c?.segments).toBe(0);
    expect(c?.rollover).toBe(0);
  });

  testCase("CLOCK-RELATED-009", "relatedClockIds validated: unique, not self, must exist; cycles allowed; healing clocks unreferenceable", async () => {
    const a = await api.createClock("Related A", "bounded", 4);
    const aId = a.clock?.id;
    if (!aId) throw new Error("create returned no clock");
    const b = await api.createClock("Related B", "bounded", 4, "custom", "campaign", "", [aId]);
    const bId = b.clock?.id;
    if (!bId) throw new Error("create returned no clock");
    expect(b.clock?.relatedClockIds).toEqual([aId]);

    // Cycles allowed: A references B back (mutual racing pair).
    const cycle = await api.operation(
      await api.post(`clocks/${aId}/update`, { relatedClockIds: [bId] }, { "If-Match": String(a.clock?.revision) }),
    );
    expect(cycle.ok).toBe(true);
    expect(cycle.clock?.relatedClockIds).toEqual([bId]);

    // Duplicates rejected.
    const dup = await postClock({
      name: "Dup",
      ownerKind: "campaign",
      ownerId: "",
      purpose: "custom",
      behavior: "bounded",
      size: 4,
      relatedClockIds: [aId, aId],
    });
    expect(dup.ok).toBe(false);
    expect(dup.error?.code).toBe("VALIDATION");

    // Self-reference rejected.
    const self = await api.operation(
      await api.post(`clocks/${aId}/update`, { relatedClockIds: [aId] }, { "If-Match": String(cycle.clock?.revision) }),
    );
    expect(self.ok).toBe(false);
    expect(self.error?.code).toBe("VALIDATION");

    // Nonexistent id rejected.
    const ghost = await postClock({
      name: "Ghost",
      ownerKind: "campaign",
      ownerId: "",
      purpose: "custom",
      behavior: "bounded",
      size: 4,
      relatedClockIds: ["00000000-0000-0000-0000-000000000000"],
    });
    expect(ghost.ok).toBe(false);
    expect(ghost.error?.code).toBe("VALIDATION");

    // Non-clock entity id rejected (healing clocks have no standalone id and
    // are unreferenceable — CLOCK-HEALING-013 guards their absence from
    // /api/clocks, so any referenceable id must be a standalone clock).
    const character = await rawCharacter();
    const notClock = await postClock({
      name: "NotClock",
      ownerKind: "campaign",
      ownerId: "",
      purpose: "custom",
      behavior: "bounded",
      size: 4,
      relatedClockIds: [character.id],
    });
    expect(notClock.ok).toBe(false);
    expect(notClock.error?.code).toBe("VALIDATION");
  });

  testCase("CLOCK-UNLINK-010", "deleting a clock removes its id from remaining clocks' relatedClockIds atomically", async () => {
    const a = await api.createClock("Unlink A", "bounded", 4);
    const aId = a.clock?.id;
    if (!aId) throw new Error("create returned no clock");
    const b = await api.createClock("Unlink B", "bounded", 4, "custom", "campaign", "", [aId]);
    const bId = b.clock?.id;
    if (!bId) throw new Error("create returned no clock");

    const deleted = await api.operation(
      await api.post(`clocks/${aId}/delete`, { confirm: true }, { "If-Match": String(a.clock?.revision) }),
    );
    expect(deleted.ok).toBe(true);

    const remaining = await api.clock(bId);
    expect(remaining.relatedClockIds).toEqual([]);

    const gone = await api.get(`clocks/${aId}`);
    expect(gone.status).toBe(404);
  });

  testCase("CLOCK-REASSIGN-011", "deleting a character reassigns its clocks to campaign with bumped revisions; no clock deleted", async () => {
    const character = await rawCharacter();
    const created = await api.createClock("Reassign clock", "bounded", 4, "custom", "character", character.id);
    const clock = created.clock;
    if (!clock) throw new Error("create returned no clock");

    const deleted = await api.operation(
      await api.post(`characters/${character.id}/delete`, { confirm: true }, { "If-Match": String(character.revision) }),
    );
    expect(deleted.ok).toBe(true);
    expect(deleted.sideEffects).toContain(`clock ${clock.id} reassigned to campaign`);

    const reassigned = await api.clock(clock.id);
    expect(reassigned.ownerKind).toBe("campaign");
    expect(reassigned.ownerId).toBe("");
    expect(reassigned.revision).toBeGreaterThan(clock.revision);
    expect(reassigned.name).toBe(clock.name);
    expect(reassigned.segments).toBe(clock.segments);

    const list = await api.get("clocks");
    expect(list.status).toBe(200);
    const rows = list.body as Array<{ id: string }>;
    expect(rows.some((row) => row.id === clock.id)).toBe(true);
  });

  testCase("CLOCK-LIST-012", "listClocks is total and lists all standalone clocks with the new row shape", async () => {
    const character = await rawCharacter();
    const campaignClock = await api.createClock("List campaign", "bounded", 4);
    const characterClock = await api.createClock("List character", "rollover", 6, "custom", "character", character.id);
    const response = await api.get("clocks");
    expect(response.status).toBe(200);
    const rows = await decode(Schemas.ClockList, response.body);
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(campaignClock.clock?.id);
    expect(ids).toContain(characterClock.clock?.id);
    for (const row of rows) {
      expect(row.ownerKind).toBeDefined();
      expect(row.ownerId).toBeDefined();
      expect(row.purpose).toBeDefined();
      expect(row.behavior).toBeDefined();
      expect(row.relatedClockIds).toBeDefined();
    }
  });

  testCase("CLOCK-HEALING-013", "embedded healing clock stays out of /api/clocks and heals via harm ops (guard)", async () => {
    // Raw requests: the character DTO decode lags the frozen contract until
    // SC-A7, but the healing clock shape is unchanged, so the guard asserts
    // on raw fields and must stay green.
    const created = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
    expect(created.status).toBe(200);
    const character = (created.body as { character?: { id: string } }).character;
    if (!character) throw new Error("character create returned no character");

    const before = await api.get("clocks");
    expect(before.status).toBe(200);
    const beforeIds = (before.body as Array<{ id: string }>).map((row) => row.id);

    const healingClock = async () => {
      const r = await api.get(`characters/${character.id}`);
      expect(r.status).toBe(200);
      const hc = (r.body as { monitor?: { harm?: { healingClock?: { segments: number; size: number; rollover: number } } } })
        .monitor?.harm?.healingClock;
      if (!hc) throw new Error("character has no healing clock");
      return hc;
    };

    // Fill the healing clock via the character-scoped op. Its size is
    // settings-derived (RecoveryClockSize: 4 BitD, 6 S&V) — never a literal.
    const healingSize = gameSetting(BLADES).RecoveryClockSize;
    for (let i = 0; i < healingSize; i++) {
      const r = await api.post(`characters/${character.id}/ops/harm.healing-clock`, { segments: 1 });
      expect(r.status).toBe(200);
    }
    const full = await healingClock();
    expect(full.segments).toBe(full.size);

    // Rollover healing: overflow past full is carried and applied on heal.
    await api.post(`characters/${character.id}/ops/harm.healing-clock`, { segments: 2 });
    const carried = await healingClock();
    expect(carried.segments).toBe(carried.size);
    expect(carried.rollover).toBe(2);

    await api.post(`characters/${character.id}/ops/harm.add`, { description: "Bruised", intensity: "lesser" });
    const healed = await api.post(`characters/${character.id}/ops/harm.heal`, { intensity: "lesser", description: "Bruised" });
    expect(healed.status).toBe(200);
    const healedHc = (healed.body as { character?: { monitor?: { harm?: { healingClock?: { segments: number; rollover: number } } } } })
      .character?.monitor?.harm?.healingClock;
    expect(healedHc?.segments).toBe(2);
    expect(healedHc?.rollover).toBe(0);

    // The healing clock never appears as a /api/clocks row.
    const after = await api.get("clocks");
    expect(after.status).toBe(200);
    const afterIds = (after.body as Array<{ id: string }>).map((row) => row.id);
    expect(afterIds).toEqual(beforeIds);
  });

  testCase("CLOCK-RESULT-014", "clock.progress result carries requested/effective/visibleApplied/overflowAdded", async () => {
    const created = await api.createClock("Result clock", "rollover", 4);
    const clock = created.clock;
    if (!clock) throw new Error("create returned no clock");
    const progressed = await api.operation(await api.post(`clocks/${clock.id}/ops/clock.progress`, { segments: 5 }));
    expect(progressed.ok).toBe(true);
    expect(progressed.applied.requested).toBe(5);
    expect(progressed.applied.effective).toBe(5);
    expect(progressed.applied.visibleApplied).toBe(4);
    expect(progressed.applied.overflowAdded).toBe(1);
  });

  testCase("CLOCK-CREATE-015", "create requires name/ownerKind/ownerId/purpose/behavior/size", async () => {
    const full = await api.createClock("Full create", "bounded", 4);
    expect(full.ok).toBe(true);
    expect(full.clock?.name).toBe("Full create");

    // Legacy request shape (clockKind) is rejected by the frozen contract.
    const legacy = await api.operation(await api.post("clocks", { name: "Legacy", clockKind: "project", size: 4 }));
    expect(legacy.ok).toBe(false);
    expect(legacy.error?.code).toBe("VALIDATION");

    // Each new required field is enforced.
    const missing = await api.operation(
      await api.post("clocks", { name: "No owner", ownerKind: "campaign", ownerId: "", purpose: "custom", behavior: "bounded" }),
    );
    expect(missing.ok).toBe(false);
    expect(missing.error?.code).toBe("VALIDATION");
  });
});
