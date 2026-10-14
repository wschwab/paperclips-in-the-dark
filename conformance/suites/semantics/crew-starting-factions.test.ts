import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { validate } from "../../src/contract-validator.js";
import { testCase } from "../../src/test-case.js";
import { newCrew, BLADES } from "../../src/suite-helpers.js";
import { factionStatusRange } from "../../src/game-data.js";

const names = { ally: "Campaign ally", rival: "Campaign rival" };
const operationPath = (id: string) => `crews/${id}/ops/faction.set-starting`;
async function history(id: string) {
  return decode(Schemas.History, (await api.get(`crews/${id}/history`)).body);
}
async function preparedCrew() {
  let crew = await newCrew();
  for (const name of Object.values(names)) {
    const result = await api.operation(await api.post(`crews/${crew.id}/ops/faction.set-status`, { name, status: 0 }, { "If-Match": String(crew.revision) }));
    expect(result.ok).toBe(true);
    crew = result.crew!;
  }
  return crew;
}

describe("CREW-WORLD-01 starting faction names are historical records, not current status", () => {
  testCase("CREW-WORLD-STARTING-001", "saves both names in one crew revision and snapshot without touching other crew state", async () => {
    const before = await preparedCrew();
    const oldHistory = await history(before.id);
    const response = await api.post(operationPath(before.id), names, { "If-Match": String(before.revision) });
    expect(response.status).toBe(200);
    const result = await api.operation(response);
    expect(result.ok).toBe(true);
    expect(result.crew).toMatchObject({ startingFactions: names, revision: before.revision + 1, coin: before.coin, factions: before.factions });
    expect(validate("crew", result.crew).errors).toEqual([]);
    expect(await api.crew(before.id)).toEqual(result.crew);
    expect((await history(before.id)).length).toBe(oldHistory.length + 1);
  });

  testCase("CREW-WORLD-STARTING-002", "survives canonical reload and later status changes without deriving roles from status", async () => {
    const before = await preparedCrew();
    const saved = await api.operation(await api.post(operationPath(before.id), names, { "If-Match": String(before.revision) }));
    expect(saved.ok).toBe(true);
    const range = factionStatusRange(BLADES)!;
    const status = await api.crewOp(before.id, "faction.set-status", { name: names.ally, status: range.Min - 1 });
    expect(status.ok).toBe(true);
    expect(status.crew).toMatchObject({ startingFactions: names });
    expect(status.crew?.factions.find(faction => faction.name === names.ally)?.status).toBe(range.Min);
    expect(await api.crew(before.id)).toEqual(status.crew);
    const removed = await api.crewOp(before.id, "faction.remove", { name: names.ally });
    expect(removed.ok).toBe(true);
    expect(removed.crew).toMatchObject({ startingFactions: { ally: "", rival: names.rival } });
  });

  testCase("CREW-WORLD-STARTING-003", "replaces or clears the pair atomically and undo restores the previous names", async () => {
    const before = await preparedCrew();
    const first = await api.operation(await api.post(operationPath(before.id), names, { "If-Match": String(before.revision) }));
    expect(first.ok).toBe(true);
    const previous = first.crew!;
    const cleared = await api.operation(await api.post(operationPath(before.id), { ally: "", rival: "" }, { "If-Match": String(previous.revision) }));
    expect(cleared.ok).toBe(true);
    expect(cleared.crew).toMatchObject({ startingFactions: { ally: "", rival: "" }, revision: previous.revision + 1 });
    const undone = await api.operation(await api.post(`crews/${before.id}/undo`, {}, { "If-Match": String(cleared.crew!.revision) }));
    expect(undone.ok).toBe(true);
    expect(undone.crew).toMatchObject({ startingFactions: names });
  });

  testCase("CREW-WORLD-STARTING-004", "idempotent replay under the old revision returns the same result with one write", async () => {
    const before = await preparedCrew();
    const oldHistory = await history(before.id);
    const headers = { "If-Match": String(before.revision), "Idempotency-Key": `crew-starting-${before.id}` };
    const first = await api.post(operationPath(before.id), names, headers);
    expect(first.status).toBe(200);
    const repeated = await api.post(operationPath(before.id), names, headers);
    expect(repeated.status).toBe(200);
    expect(repeated.body).toEqual(first.body);
    expect((await api.crew(before.id)).revision).toBe(before.revision + 1);
    expect((await history(before.id)).length).toBe(oldHistory.length + 1);
  });

  testCase("CREW-WORLD-STARTING-005", "stale If-Match cannot overwrite the pair", async () => {
    const before = await preparedCrew();
    const response = await api.post(operationPath(before.id), names, { "If-Match": String(before.revision + 1) });
    expect(response.status).toBe(409);
    expect(await api.crew(before.id)).toEqual(before);
  });

  testCase("CREW-WORLD-STARTING-006", "missing, mistyped or extra body fields return existing VALIDATION400 without mutation", async () => {
    const before = await preparedCrew();
    for (const body of [{ ally: names.ally }, { ...names, rival: 1 }, { ...names, status: 1 }]) {
      const response = await api.post(operationPath(before.id), body, { "If-Match": String(before.revision) });
      expect(response.status).toBe(400);
      expect((await api.operation(response)).error?.code).toBe("VALIDATION");
      expect(await api.crew(before.id)).toEqual(before);
    }
  });

  testCase("CREW-WORLD-STARTING-007", "batch rollback does not persist a starting pair when another member fails", async () => {
    const before = await preparedCrew();
    const oldHistory = await history(before.id);
    const response = await api.post("campaign/batch", { ops: [
      { entity: "crew", id: before.id, op: "faction.set-starting", args: names },
      { entity: "crew", id: before.id, op: "not-a-registered-operation", args: {} },
    ] });
    expect(response.status).toBe(200);
    expect((await api.operation(response)).batch?.map(item => item.ok)).toEqual([true, false]);
    expect(await api.crew(before.id)).toEqual(before);
    expect(await history(before.id)).toEqual(oldHistory);
  });

  testCase("CREW-WORLD-STARTING-008", "crew schema admits the optional typed pair while old crews remain valid and nested extras do not", async () => {
    const before = await preparedCrew();
    expect(validate("crew", before).errors).toEqual([]);
    expect(validate("crew", { ...before, startingFactions: names }).errors).toEqual([]);
    expect(validate("crew", { ...before, startingFactions: { ally: "", rival: "" } }).errors).toEqual([]);
    for (const startingFactions of [{ ally: names.ally }, { ...names, extra: "not allowed" }, { ...names, rival: null }]) {
      expect(validate("crew", { ...before, startingFactions }).errors.length).toBeGreaterThan(0);
    }
  });

  testCase("CREW-WORLD-TIER-009", "existing status upsert records optional tier, preserves it when omitted and clears it explicitly", async () => {
    const before = await preparedCrew();
    const range = factionStatusRange(BLADES)!;
    const response = await api.post(`crews/${before.id}/ops/faction.set-status`, { name: names.ally, status: range.Max + 1, tier: 99 }, { "If-Match": String(before.revision) });
    expect(response.status).toBe(200);
    const set = await api.operation(response);
    expect(set.ok).toBe(true);
    expect(set.crew?.factions.find(faction => faction.name === names.ally)).toMatchObject({ tier: 99, status: range.Max });
    const kept = await api.crewOp(before.id, "faction.set-status", { name: names.ally, status: 0 });
    expect(kept.crew?.factions.find(faction => faction.name === names.ally)).toHaveProperty("tier", 99);
    const cleared = await api.crewOp(before.id, "faction.set-status", { name: names.ally, status: 0, tier: null });
    expect(cleared.ok).toBe(true);
    expect(cleared.crew?.factions.find(faction => faction.name === names.ally)).not.toHaveProperty("tier");
    expect(await api.crew(before.id)).toEqual(cleared.crew);
  });

  testCase("CREW-WORLD-TIER-010", "negative, fractional or nonnumeric tiers cannot partially change faction status", async () => {
    const before = await preparedCrew();
    for (const tier of [-1, 1.5, "high"]) {
      const response = await api.post(`crews/${before.id}/ops/faction.set-status`, { name: names.ally, status: 1, tier }, { "If-Match": String(before.revision) });
      expect(response.status).toBe(400);
      expect((await api.operation(response)).error?.code).toBe("VALIDATION");
      expect(await api.crew(before.id)).toEqual(before);
    }
  });

  testCase("CREW-WORLD-STARTING-011", "a nonempty starting choice must come from this crew's own faction list", async () => {
    const before = await preparedCrew();
    const oldHistory = await history(before.id);
    for (const field of ["ally", "rival"] as const) {
      const response = await api.post(operationPath(before.id), { ...names, [field]: "Not tracked by this crew" }, { "If-Match": String(before.revision) });
      expect(response.status).toBe(400);
      const result = await api.operation(response);
      expect(result.error?.code).toBe("VALIDATION");
      expect(result.error?.details.issues).toEqual(expect.arrayContaining([expect.objectContaining({ pointer: `/${field}` })]));
      expect(await api.crew(before.id)).toEqual(before);
      expect(await history(before.id)).toEqual(oldHistory);
    }
  });
});
