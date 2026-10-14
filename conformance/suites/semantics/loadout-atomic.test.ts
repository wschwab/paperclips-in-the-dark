import { describe, expect } from "vitest";
import * as Schema from "effect/Schema";
import { api } from "../../src/api.js";
import { newCharacter } from "../../src/suite-helpers.js";
import { decode, Schemas } from "../../src/schemas.js";
import { validate } from "../../src/contract-validator.js";
import { testCase } from "../../src/test-case.js";

const path = (id: string) => `characters/${id}/ops/gear.set-loadout`;
async function prepared() {
  let c = await newCharacter();
  for (const [name, bulk] of [["Armor", 2], ["Old tool", 1], ["Zero-load tool", 0]] as const) {
    const r = await api.characterOp(c.id, "gear.add", { name, bulk }, c.revision);
    expect(r.ok).toBe(true);
    c = r.character!;
  }
  return c;
}
async function history(id: string) {
  return decode(Schemas.History, (await api.get(`characters/${id}/history`)).body);
}
function hasIssueAt(issues: unknown, pointer: string): boolean {
  return Array.isArray(issues) && issues.some((issue: unknown) =>
    typeof issue === "object" && issue !== null &&
    "pointer" in issue && issue.pointer === pointer);
}
const LoadSettings = Schema.Struct({
  LoadMaxima: Schema.Struct({
    CommitmentMaxBulk: Schema.Struct({
      Light: Schema.Number.pipe(Schema.int()),
      Normal: Schema.Number.pipe(Schema.int()),
    }),
  }),
});

describe("LOADOUT-ATOMIC-01 gear.set-loadout", () => {
  testCase("LOADOUT-ATOMIC-001", "sets level and complete selected item set in exactly one revision and snapshot, preserving owned gear", async () => {
    const before = await prepared();
    const h = await history(before.id);
    const response = await api.post(path(before.id), { commitment: "normal", items: ["Armor", "Zero-load tool"] }, { "If-Match": String(before.revision) });
    expect(response.status).toBe(200);
    expect(validate("operationResult", response.body).errors).toEqual([]);
    const result = await api.operation(response);
    expect(result.ok).toBe(true);
    const after = await api.character(before.id);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.gear.commitment).toBe("normal");
    expect(after.gear.loadout.map(item => item.name)).toEqual(["Armor", "Zero-load tool"]);
    expect(after.gear.availableGear).toEqual(before.gear.availableGear);
    expect(after.monitor.armor.hasStandard).toBe(true);
    expect((await history(before.id)).length).toBe(h.length + 1);
    const undo = await api.operation(await api.post(`characters/${before.id}/undo`, {}, { "If-Match": String(after.revision) }));
    expect(undo.ok).toBe(true);
    expect(undo.character?.gear).toEqual(before.gear);
  });

  testCase("LOADOUT-ATOMIC-002", "a bad late item cannot leave a changed level, earlier item, revision or history", async () => {
    const before = await prepared();
    const h = await history(before.id);
    const response = await api.post(path(before.id), { commitment: "heavy", items: ["Old tool", "Not owned"] }, { "If-Match": String(before.revision) });
    expect(response.status).toBe(400);
    const result = await api.operation(response);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION");
    expect(hasIssueAt(result.error?.details.issues, "/items/1")).toBe(true);
    expect(await api.character(before.id)).toEqual(before);
    expect(await history(before.id)).toEqual(h);
  });

  testCase("LOADOUT-ATOMIC-003", "capacity is loaded from settings, not trusted client bulk or a hardcoded limit", async () => {
    const before = await prepared();
    const settings = await api.get(`games/${before.gameStem}`);
    const limit = Schema.decodeUnknownSync(LoadSettings)(settings.body).LoadMaxima.CommitmentMaxBulk.Light;
    const added = await api.characterOp(before.id, "gear.add", { name: "Oversized bundle", bulk: limit + 1 }, before.revision);
    expect(added.ok).toBe(true);
    const current = added.character!;
    const response = await api.post(path(current.id), { commitment: "light", items: ["Oversized bundle"] }, { "If-Match": String(current.revision) });
    expect(response.status).toBe(400);
    const result = await api.operation(response);
    expect(hasIssueAt(result.error?.details.issues, "/items")).toBe(true);
    expect(await api.character(current.id)).toEqual(current);
  });

  testCase("LOADOUT-ATOMIC-004", "duplicate, malformed, unsupported-level and extra-field requests do not mutate", async () => {
    const before = await prepared();
    for (const body of [
      { commitment: "normal", items: ["Armor", "Armor"] },
      { commitment: "normal", items: [42] },
      { commitment: "flying", items: [] },
      { commitment: "normal", items: ["Armor"], bulk: 0 },
    ]) {
      const r = await api.post(path(before.id), body, { "If-Match": String(before.revision) });
      expect(r.status).toBe(400);
      expect((await api.operation(r)).error?.code).toBe("VALIDATION");
    }
    expect(await api.character(before.id)).toEqual(before);
  });

  testCase("LOADOUT-ATOMIC-005", "idempotent replay with the old revision returns the same result and only one write", async () => {
    const before = await prepared();
    const body = { commitment: "normal", items: ["Old tool"] };
    const headers = { "If-Match": String(before.revision), "Idempotency-Key": `loadout-${before.id}` };
    const h = await history(before.id);
    const first = await api.post(path(before.id), body, headers);
    expect(first.status).toBe(200);
    const second = await api.post(path(before.id), body, headers);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect((await api.character(before.id)).revision).toBe(before.revision + 1);
    expect((await history(before.id)).length).toBe(h.length + 1);
  });

  testCase("LOADOUT-ATOMIC-006", "stale If-Match and locked commitment reject without partial writes", async () => {
    const before = await prepared();
    const stale = await api.post(path(before.id), { commitment: "normal", items: ["Armor"] }, { "If-Match": String(before.revision + 1) });
    expect(stale.status).toBe(409);
    const locked = await api.characterOp(before.id, "gear.lock", {}, before.revision);
    expect(locked.ok).toBe(true);
    const current = locked.character!;
    const rejected = await api.post(path(before.id), { commitment: "normal", items: ["Armor"] }, { "If-Match": String(current.revision) });
    expect((await api.operation(rejected)).error?.code).toBe("COMMITMENT_LOCKED");
    expect(await api.character(before.id)).toEqual(current);
  });

  testCase("LOADOUT-ATOMIC-007", "batch uses the same atomic replacement and rolls back when another member fails", async () => {
    const before = await prepared();
    const h = await history(before.id);
    const r = await api.post("campaign/batch", { ops: [
      { entity: "character", id: before.id, op: "gear.set-loadout", args: { commitment: "normal", items: ["Armor"] } },
      { entity: "character", id: before.id, op: "no.such-operation", args: {} },
    ] });
    const result = await api.operation(r);
    expect(result.batch?.map(item => item.ok)).toEqual([true, false]);
    expect(await api.character(before.id)).toEqual(before);
    expect(await history(before.id)).toEqual(h);
  });

  testCase("LOADOUT-ATOMIC-008", "none plus an empty item set clears the committed loadout, not owned gear", async () => {
    const before = await prepared();
    const response = await api.post(path(before.id), { commitment: "none", items: [] }, { "If-Match": String(before.revision) });
    expect(response.status).toBe(200);
    const after = (await api.operation(response)).character!;
    expect(after.gear.commitment).toBe("none");
    expect(after.gear.loadout).toEqual([]);
    expect(after.gear.availableGear).toEqual(before.gear.availableGear);
  });
  testCase("LOADOUT-ATOMIC-009", "the exact normal load boundary succeeds and a lower level is checked against its own settings", async () => {
    const before = await prepared();
    const settings = Schema.decodeUnknownSync(LoadSettings)((await api.get(`games/${before.gameStem}`)).body);
    const limits = settings.LoadMaxima.CommitmentMaxBulk;
    expect(limits.Normal).toBeGreaterThan(limits.Light);
    const owned = await api.characterOp(before.id, "gear.add", { name: "Full normal bundle", bulk: limits.Normal }, before.revision);
    const current = owned.character!;
    const accepted = await api.post(path(current.id), { commitment: "normal", items: ["Full normal bundle"] }, { "If-Match": String(current.revision) });
    expect(accepted.status).toBe(200);
    const full = (await api.operation(accepted)).character!;
    expect(full.gear.loadout.reduce((sum, item) => sum + item.bulk, 0)).toBe(limits.Normal);
    const rejected = await api.post(path(full.id), { commitment: "light", items: ["Full normal bundle"] }, { "If-Match": String(full.revision) });
    expect(rejected.status).toBe(400);
    expect(await api.character(full.id)).toEqual(full);
  });

  testCase("LOADOUT-ATOMIC-010", "none rejects even zero-bulk selected gear without a commitment", async () => {
    const before = await prepared();
    const response = await api.post(path(before.id), { commitment: "none", items: ["Zero-load tool"] }, { "If-Match": String(before.revision) });
    expect(response.status).toBe(400);
    expect(hasIssueAt((await api.operation(response)).error?.details.issues, "/items")).toBe(true);
    expect(await api.character(before.id)).toEqual(before);
  });
});
