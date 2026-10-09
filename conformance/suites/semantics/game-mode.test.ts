import { describe, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { api, type HttpResponse } from "../../src/api.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";
import { testCase } from "../../src/test-case.js";

// GAME-MODE-01 RED contract-change oracles. No current typed DTO decoder.
// Human override: stored free/paid/spent counters; assistance ONLY at result root.
type Mode = "free-play" | "score" | "downtime";
type Flow = { kind: "none" | "score-start" | "resolution"; step: string };
interface Character extends Record<string, unknown> {
  id: string;
  revision: number;
  gameStem: string;
  mode: Mode;
  modeFlow: Flow;
  downtime: { free: number; paid: number; spent: number; activities: { activity: string; description: string }[] };
  monitor: { stress: { current: number; max: number }; [key: string]: unknown };
  gear: { commitment: string; loadout: unknown[]; [key: string]: unknown };
  dossier: { notes: string[]; [key: string]: unknown };
  traumaPending: boolean;
  isOutOfAction: boolean;
  stressClearPending: boolean;
}
interface Result {
  ok: boolean;
  character?: Character;
  mode?: Mode;
  suggestedOps?: string[];
  error?: { code: string; status: number };
  batch?: { ok: boolean; op: string }[];
}
const MODES: Mode[] = ["free-play", "score", "downtime"];
const BLADES = "blades-in-the-dark";
const ACTIVITY = { activity: "other", description: "GAME-MODE explicit activity" };
const NONE: Flow = { kind: "none", step: "" };

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
  return value as Record<string, unknown>; // Validated object boundary; fields asserted below.
}
function fixtureCharacter(value: unknown): Character {
  const body = object(value);
  expect(body.id).toBeTypeOf("string");
  expect(Number.isInteger(body.revision)).toBe(true);
  return body as Character; // Setup view only; feature shape is not asserted or synthesized here.
}
function rawCharacter(value: unknown): Character {
  const body = object(value);
  expect(body.id).toBeTypeOf("string");
  expect(Number.isInteger(body.revision)).toBe(true);
  expect(MODES).toContain(body.mode);
  const downtime = object(body.downtime);
  for (const key of ["free", "paid", "spent"]) expect(Number.isInteger(downtime[key])).toBe(true);
  expect(downtime.free).toBeGreaterThanOrEqual(0);
  expect(downtime.spent).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(downtime.activities)).toBe(true);
  expect(body).not.toHaveProperty("downtimeBudget");
  expect(body).not.toHaveProperty("suggestedOps");
  return body as Character; // Local raw wire view, not the obsolete shared DTO.
}
async function read(id: string) {
  const response = await api.get(`characters/${id}`);
  expect(response.status).toBe(200);
  return rawCharacter(response.body);
}
async function settings(stem: string) {
  // The RED server needs its pre-feature settings shape to start. Expectations
  // still come from the repository's actual settings, never invented limits.
  const value = gameSetting(stem);
  const downtime = object(value.DowntimeSettings);
  expect(Number.isInteger(downtime.FreeActivities)).toBe(true);
  expect(downtime.FreeActivities).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(value.StressMax)).toBe(true);
  return { free: Number(downtime.FreeActivities), stressMax: Number(value.StressMax) };
}
function success(response: HttpResponse): Result {
  expect(response.status).toBe(200);
  const body = object(response.body);
  expect(body.ok).toBe(true);
  return body as unknown as Result; // Raw result envelope, asserted independently of DTO decoding.
}
function returned(response: HttpResponse) {
  const result = success(response);
  const character = rawCharacter(result.character);
  expect(result.mode).toBe(character.mode);
  if (!Array.isArray(result.suggestedOps)) throw new Error("Missing suggestedOps array on character result");
  expect(result.suggestedOps.every((entry) => typeof entry === "string")).toBe(true);
  return character;
}
function target(response: HttpResponse, kind: "crew" | "clock") {
  success(response);
  const body = object(response.body);
  const entity = object(body[kind]);
  expect(entity.id).toBeTypeOf("string");
  return String(entity.id);
}
async function create(stem = BLADES) {
  const request = { gameStem: stem, playbook: firstPlaybook(stem) };
  const response = await api.post("characters", request);
  expect(response.status, JSON.stringify({
    method: "POST", path: "/api/characters", request,
    response: { status: response.status, body: response.body },
  })).toBe(200);
  const result = success(response);
  return fixtureCharacter(result.character);
}
async function op(character: Character, name: string, body: unknown) {
  const response = await api.post(`characters/${character.id}/ops/${name}`, body, { "If-Match": String(character.revision) });
  if (name.startsWith("mode.") || name.startsWith("downtime.")) return returned(response);
  return fixtureCharacter(success(response).character);
}
async function endpoint(character: Character, name: string, body: unknown = {}) {
  return returned(await api.post(`characters/${character.id}/${name}`, body, { "If-Match": String(character.revision) }));
}
async function history(id: string) {
  const response = await api.get(`characters/${id}/history`);
  expect(response.status).toBe(200);
  if (!Array.isArray(response.body)) throw new Error("Expected history array");
  return response.body;
}
function gameplay(character: Character) {
  const { revision, updatedAt, mode, modeFlow, canUndo, historyCount, lastSnapshotId, ...state } = character;
  return state;
}
function restorable(character: Character) {
  const { revision, updatedAt, canUndo, historyCount, lastSnapshotId, ...state } = character;
  return state;
}
function remaining(character: Character) {
  return character.downtime.free + character.downtime.paid - character.downtime.spent;
}
async function defaults(character: Character) {
  expect(character.downtime).toEqual({ free: (await settings(character.gameStem)).free, paid: 0, spent: 0, activities: [] });
}
async function importEntity(character: Character, entity: Record<string, unknown>) {
  const preview = await api.post(`characters/${character.id}/import?preview=1`, { entity });
  expect(preview.status).toBe(200);
  const body = object(preview.body);
  expect(body.previewToken).toBeTypeOf("string");
  return returned(await api.post(`characters/${character.id}/import`, { entity, previewToken: body.previewToken, confirm: true }, { "If-Match": String(character.revision) }));
}

describe("GAME-MODE-01 per-scoundrel advisory modes", () => {
  for (const [index, stem] of [BLADES, "scum-and-villainy", "rus-blades-in-the-dark"].entries()) {
    testCase(`GAME-MODE-DEFAULT-${index + 1}`, `${stem} canonical defaults snapshot runtime settings, without read projections`, async () => {
      const created = await create(stem);
      const character = await read(created.id);
      expect(character.mode).toBe("free-play");
      expect(character.modeFlow).toEqual(NONE);
      await defaults(character);
      expect(character).toEqual(created);
      const capabilities = await api.get(`characters/${character.id}/capabilities`);
      expect(capabilities.status).toBe(200);
      expect(capabilities.body).not.toHaveProperty("downtimeBudget");
      expect(capabilities.body).not.toHaveProperty("suggestedOps");
      const roster = await api.get("campaign/roster");
      expect(roster.status).toBe(200);
      const rosterBody = object(roster.body);
      if (!Array.isArray(rosterBody.characters)) throw new Error("Expected roster characters");
      const rows = rosterBody.characters.map(object);
      const row = rows.find((entry) => entry.id === character.id);
      expect(row).toMatchObject({ mode: "free-play" });
      expect(row).not.toHaveProperty("suggestedOps");
      expect(row).not.toHaveProperty("downtimeBudget");
      const download = await api.get(`characters/${character.id}?download=1`);
      expect(download.status).toBe(200);
      expect(download.body).toMatchObject({ mode: character.mode, modeFlow: character.modeFlow, downtime: character.downtime });
      expect(download.body).not.toHaveProperty("suggestedOps");
      expect(download.body).not.toHaveProperty("downtimeBudget");
    });
  }


  testCase("GAME-MODE-ISOLATION-001", "linked scoundrels, crew and campaign never share mode or budget", async () => {
    const crewId = target(await api.post("crews", { gameStem: BLADES, crewType: "Assassins" }), "crew");
    let a = await create();
    let b = await create();
    a = await op(a, "dossier.update", { crewId });
    b = await op(b, "dossier.update", { crewId });
    const beforeB = await api.get(`characters/${b.id}`);
    const beforeCrew = await api.get(`crews/${crewId}`);
    const beforeCampaign = await api.get("campaign");
    a = await op(a, "mode.set", { mode: "downtime" });
    a = await op(a, "downtime.spend", ACTIVITY);
    expect((await api.get(`characters/${b.id}`)).rawBody).toBe(beforeB.rawBody);
    expect((await api.get(`crews/${crewId}`)).rawBody).toBe(beforeCrew.rawBody);
    expect((await api.get("campaign")).rawBody).toBe(beforeCampaign.rawBody);
    expect(a.mode).toBe("downtime");
    expect(a.downtime.spent).toBe(1);
  });

  for (const from of MODES) for (const to of MODES) {
    testCase(`GAME-MODE-TRANSITION-${from}-${to}`, `${from} → ${to} never resets gameplay`, async () => {
      let character = await create();
      character = await op(character, "mode.set", { mode: from });
      character = await op(character, "downtime.spend", ACTIVITY);
      character = await op(character, "downtime.adjust", { delta: -3, reason: "correction" });
      const before = character;
      character = await op(character, "mode.set", { mode: to });
      expect(character.mode).toBe(to);
      expect(character.modeFlow).toEqual(from === to ? before.modeFlow : to === "score" ? { kind: "score-start", step: "planning" } : NONE);
      expect(gameplay(character)).toEqual(gameplay(before));
    });
  }

  testCase("GAME-MODE-SAME-001", "reselecting Score retains resolution cursor and activity records", async () => {
    let character = await create();
    character = await op(character, "mode.flow.set", { kind: "resolution", step: "heat" });
    character = await op(character, "downtime.spend", ACTIVITY);
    const before = character;
    character = await op(character, "mode.set", { mode: "score" });
    expect(character.modeFlow).toEqual(before.modeFlow);
    expect(gameplay(character)).toEqual(gameplay(before));
  });

  testCase("GAME-MODE-FLOW-001", "forward/back/direct navigation, closing and finishing resolution award nothing", async () => {
    let character = await create();
    const crewId = target(await api.post("crews", { gameStem: BLADES, crewType: "Assassins" }), "crew");
    character = await op(character, "dossier.update", { crewId });
    character = await op(character, "downtime.spend", ACTIVITY);
    const before = gameplay(character);
    const beforeCrew = await api.get(`crews/${crewId}`);
    const flows: Flow[] = [
      ...["engagement", "planning", "loadout", "planning", "engagement"].map((step): Flow => ({ kind: "score-start", step })),
      ...["scoundrel-xp", "payoff", "heat", "entanglements", "crew-xp", "crew-rep", "payoff", "scoundrel-xp", "crew-rep"].map((step): Flow => ({ kind: "resolution", step })),
      NONE,
    ];
    for (const flow of flows) {
      character = await op(character, "mode.flow.set", flow);
      expect(character.mode).toBe("score");
      expect(character.modeFlow).toEqual(flow);
      expect(gameplay(character)).toEqual(before);
      expect((await api.get(`crews/${crewId}`)).rawBody).toBe(beforeCrew.rawBody);
    }
    character = await op(character, "mode.set", { mode: "downtime" });
    expect(character.modeFlow).toEqual(NONE);
    expect(gameplay(character)).toEqual(before);
    expect((await api.get(`crews/${crewId}`)).rawBody).toBe(beforeCrew.rawBody);
  });

  testCase("GAME-MODE-FLOW-002", "unlinked scoundrels jump into resolution from every mode; none preserves mode", async () => {
    for (const mode of MODES) {
      let character = await create();
      character = await op(character, "mode.set", { mode });
      character = await op(character, "mode.flow.set", NONE);
      expect(character.mode).toBe(mode);
      const before = gameplay(character);
      character = await op(character, "mode.flow.set", { kind: "resolution", step: "crew-rep" });
      expect(character.mode).toBe("score");
      expect(character.modeFlow).toEqual({ kind: "resolution", step: "crew-rep" });
      expect(gameplay(character)).toEqual(before);
    }
  });

  testCase("GAME-MODE-BUDGET-001", "all explicit activities remain legal below zero without changing mode", async () => {
    let character = await create();
    const allowance = (await settings(character.gameStem)).free;
    const activities = ["acquire-asset", "long-term-project", "recover", "reduce-heat", "train", "indulge-vice", "other"];
    const records = [];
    for (let index = 0; index < allowance + activities.length + 1; index += 1) {
      const record = { activity: activities[index % activities.length]!, description: `activity ${index}` };
      records.push(record);
      character = await op(character, "downtime.spend", record);
      expect(character.mode).toBe("free-play");
      expect(character.downtime).toEqual({ free: allowance, spent: index + 1, paid: 0, activities: records });
    }
    expect(remaining(character)).toBeLessThan(0);
    character = await op(character, "note.add", { text: "Still legal when over budget" });
    expect(character.downtime.activities).toEqual(records);
  });

  testCase("GAME-MODE-BUDGET-002", "coin/gift record already-paid extras and signed corrections without charging funds or rep", async () => {
    let character = await create();
    const crewId = target(await api.post("crews", { gameStem: BLADES, crewType: "Assassins" }), "crew");
    character = await op(character, "dossier.update", { crewId });
    const funds = character.fund;
    const beforeCrew = await api.get(`crews/${crewId}`);
    for (const [index, reason] of (["coin", "gift"] as const).entries()) {
      character = await op(character, "downtime.adjust", { delta: 1, reason });
      expect(character.downtime.paid).toBe(index + 1);
      expect(character.fund).toEqual(funds);
      expect((await api.get(`crews/${crewId}`)).rawBody).toBe(beforeCrew.rawBody);
    }
    const allowance = character.downtime.free;
    character = await op(character, "downtime.adjust", { delta: -(allowance + 3), reason: "correction" });
    expect(character.downtime.paid).toBe(-allowance - 1);
    expect(remaining(character)).toBe(-1);
  });

  testCase("GAME-MODE-BUDGET-003", "explicit reset snapshots current allowance and clears records, preserving mode and gameplay", async () => {
    let character = await create();
    character = await op(character, "mode.flow.set", { kind: "resolution", step: "payoff" });
    character = await op(character, "downtime.spend", ACTIVITY);
    character = await op(character, "downtime.adjust", { delta: 3, reason: "gift" });
    const before = character;
    character = await op(character, "downtime.reset", {});
    await defaults(character);
    expect(character.mode).toBe(before.mode);
    expect(character.modeFlow).toEqual(before.modeFlow);
    expect(gameplay(character)).toEqual({ ...gameplay(before), downtime: character.downtime });
  });

  for (const mode of MODES) {
    testCase(`GAME-MODE-ORDINARY-${mode}`, `ordinary mutations and mixed entity batch have no ${mode} gate or implicit spending`, async () => {
      let character = await create();
      character = await op(character, "mode.set", { mode });
      character = await op(character, "note.add", { text: "ordinary operation" });
      const beforeBudget = character.downtime;
      const crewId = target(await api.post("crews", { gameStem: BLADES, crewType: "Assassins" }), "crew");
      const clockId = target(await api.post("clocks", { name: "GAME-MODE clock", behavior: "bounded", size: 4, purpose: "custom", ownerKind: "campaign", ownerId: "", relatedClockIds: [] }), "clock");
      const result = success(await api.post("campaign/batch", { ops: [
        { entity: "character", id: character.id, op: "note.add", args: { text: "batch ordinary operation" } },
        { entity: "crew", id: crewId, op: "note.add", args: { text: "crew remains legal" } },
        { entity: "clock", id: clockId, op: "clock.progress", args: { segments: 1 } },
      ] }));
      expect(result.batch?.map((entry) => entry.ok)).toEqual([true, true, true]);
      const after = await read(character.id);
      expect(after.mode).toBe(mode);
      expect(after.downtime).toEqual(beforeBudget);
      expect(after.dossier.notes).toEqual(["ordinary operation", "batch ordinary operation"]);
    });
  }

  const mutations = [
    ["mode.set", { mode: "score" }],
    ["mode.flow.set", { kind: "resolution", step: "heat" }],
    ["downtime.spend", ACTIVITY],
    ["downtime.adjust", { delta: -1, reason: "correction" }],
    ["downtime.reset", {}],
  ] as const;
  for (const [index, [name, args]] of mutations.entries()) {
    testCase(`GAME-MODE-PERSISTENCE-${index + 1}`, `${name} snapshots, revision guards, exact retry and undo follow existing conventions`, async () => {
      let character = await create();
      character = await op(character, "downtime.spend", ACTIVITY);
      character = await op(character, "downtime.adjust", { delta: 2, reason: "gift" });
      const before = await read(character.id);
      const beforeHistory = await history(character.id);
      const path = `characters/${character.id}/ops/${name}`;
      const stale = await api.post(path, args, { "If-Match": String(before.revision - 1) });
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });
      expect(await read(character.id)).toEqual(before);
      expect(await history(character.id)).toEqual(beforeHistory);
      const headers = { "If-Match": String(before.revision), "Idempotency-Key": randomUUID() };
      const first = await api.post(path, args, headers);
      const after = returned(first);
      expect(after.revision).toBe(before.revision + 1);
      expect(await history(character.id)).toHaveLength(beforeHistory.length + 1);
      const retry = await api.post(path, args, headers);
      expect(retry.status).toBe(200);
      expect(retry.rawBody).toBe(first.rawBody);
      expect(await read(character.id)).toEqual(after);
      expect(await history(character.id)).toHaveLength(beforeHistory.length + 1);
      const undone = await endpoint(after, "undo");
      expect(undone.revision).toBe(after.revision + 1);
      expect(restorable(undone)).toEqual(restorable(before));
      expect(await history(character.id)).toHaveLength(beforeHistory.length);
    });
  }

  testCase("GAME-MODE-LEGACY-001", "legacy import missing new fields receives canonical stored defaults", async () => {
    const character = await create();
    const download = await api.get(`characters/${character.id}?download=1`);
    expect(download.status).toBe(200);
    const entity = { ...object(download.body) };
    delete entity.mode;
    delete entity.modeFlow;
    delete entity.downtime;
    const imported = await importEntity(character, entity);
    expect(imported.mode).toBe("free-play");
    expect(imported.modeFlow).toEqual(NONE);
    await defaults(imported);
  });

  testCase("GAME-MODE-ENDSCORE-001", "partial stress and committed gear persist; atomic budget reset enters resolution and undo restores all", async () => {
    let character = await create();
    const stressMax = (await settings(BLADES)).stressMax;
    expect(stressMax).toBeGreaterThan(1);
    character = await op(character, "gear.add", { name: "GAME-MODE retained gear", bulk: 0 });
    character = await op(character, "gear.set-commitment", { commitment: "light" });
    character = await op(character, "gear.commit", { name: "GAME-MODE retained gear" });
    character = await op(character, "stress.add", { delta: stressMax - 1 });
    character = await op(character, "downtime.spend", ACTIVITY);
    character = await op(character, "downtime.adjust", { delta: 1, reason: "coin" });
    const before = character;
    const count = (await history(character.id)).length;
    const headers = { "If-Match": String(before.revision), "Idempotency-Key": randomUUID() };
    const ended = await api.post(`characters/${character.id}/end-score`, {}, headers);
    character = returned(ended);
    expect(character.mode).toBe("score");
    expect(character.modeFlow).toEqual({ kind: "resolution", step: "scoundrel-xp" });
    expect(character.monitor.stress.current).toBe(stressMax - 1);
    expect(character.gear).toEqual(before.gear);
    expect(character.traumaPending).toBe(false);
    expect(character.isOutOfAction).toBe(false);
    expect(character.stressClearPending).toBe(false);
    await defaults(character);
    expect(character.playbook).toEqual(before.playbook);
    expect(character.talent).toEqual(before.talent);
    expect(character.fund).toEqual(before.fund);
    expect(character.revision).toBe(before.revision + 1);
    expect(await read(character.id)).toEqual(character);
    expect(await history(character.id)).toHaveLength(count + 1);
    const replay = await api.post(`characters/${character.id}/end-score`, {}, headers);
    expect(replay.status).toBe(200);
    expect(replay.rawBody).toBe(ended.rawBody);
    expect(await read(character.id)).toEqual(character);
    expect(await history(character.id)).toHaveLength(count + 1);
    const undone = await endpoint(character, "undo");
    expect(restorable(undone)).toEqual(restorable(before));
  });

  testCase("GAME-MODE-ENDSCORE-002", "resolved trauma flags clear without resetting committed loadout", async () => {
    let character = await create();
    character = await op(character, "gear.set-commitment", { commitment: "light" });
    character = await op(character, "stress.add", { delta: (await settings(BLADES)).stressMax });
    character = await op(character, "trauma.add", { trauma: "Cold" });
    expect(character.isOutOfAction).toBe(true);
    const gear = character.gear;
    character = await endpoint(character, "end-score");
    expect(character.isOutOfAction).toBe(false);
    expect(character.stressClearPending).toBe(false);
    expect(character.traumaPending).toBe(false);
    expect(character.gear).toEqual(gear);
    expect(character.modeFlow).toEqual({ kind: "resolution", step: "scoundrel-xp" });
  });


  testCase("GAME-MODE-ENDSCORE-004", "partial stress cleanup is exercised directly without new tracker setup", async () => {
    let character = await create();
    const stressMax = (await settings(BLADES)).stressMax;
    expect(stressMax).toBeGreaterThan(1);
    character = await op(character, "stress.add", { delta: stressMax - 1 });
    const result = success(await api.post(`characters/${character.id}/end-score`, {}, { "If-Match": String(character.revision) }));
    const after = fixtureCharacter(result.character);
    expect(after.monitor.stress.current).toBe(stressMax - 1);
    expect(after.mode).toBe("score");
    expect(after.modeFlow).toEqual({ kind: "resolution", step: "scoundrel-xp" });
  });
  testCase("GAME-MODE-ENDSCORE-003", "full stress retains the existing pending-trauma rejection, not a mode/budget error", async () => {
    let character = await create();
    character = await op(character, "stress.add", { delta: (await settings(BLADES)).stressMax });
    expect(character.traumaPending).toBe(true);
    const beforeHistory = await history(character.id);
    const response = await api.post(`characters/${character.id}/end-score`, {}, { "If-Match": String(character.revision) });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: false, mode: "free-play", error: { code: "TRAUMA_REQUIRED", status: 200 } });
    const failure = object(response.body);
    expect(Array.isArray(failure.suggestedOps)).toBe(true);
    expect(await read(character.id)).toEqual(character);
    expect(await history(character.id)).toEqual(beforeHistory);
  });

  testCase("GAME-MODE-BATCH-001", "new tracker operations compose in order without mode or exhausted-budget gates", async () => {
    const character = await create();
    const allowance = (await settings(BLADES)).free;
    const response = await api.post("campaign/batch", { ops: [
      { entity: "character", id: character.id, op: "downtime.adjust", args: { delta: -(allowance + 1), reason: "correction" } },
      { entity: "character", id: character.id, op: "downtime.spend", args: ACTIVITY },
      { entity: "character", id: character.id, op: "mode.flow.set", args: { kind: "resolution", step: "crew-rep" } },
      { entity: "character", id: character.id, op: "mode.set", args: { mode: "downtime" } },
    ] });
    const result = success(response);
    expect(result.batch?.map((entry) => entry.ok)).toEqual([true, true, true, true]);
    const after = await read(character.id);
    expect(after.mode).toBe("downtime");
    expect(after.modeFlow).toEqual(NONE);
    expect(remaining(after)).toBe(-2);
    expect(after.downtime.activities).toEqual([ACTIVITY]);
    expect(after.revision).toBe(character.revision + 1);
    expect(await history(character.id)).toHaveLength(1);
    const undone = await endpoint(after, "undo");
    expect(restorable(undone)).toEqual(restorable(character));
  });

  testCase("GAME-MODE-VALIDATION-001", "malformed modes, cursors and counters use existing VALIDATION and never mutate", async () => {
    const character = await create();
    const cases = [
      ["mode.set", { mode: "resolution" }],
      ["mode.set", { mode: "score", extra: true }],
      ["mode.flow.set", { kind: "none", step: "planning" }],
      ["mode.flow.set", { kind: "score-start", step: "payoff" }],
      ["mode.flow.set", { kind: "resolution", step: "engagement" }],
      ["downtime.spend", { activity: "unknown", description: "" }],
      ["downtime.adjust", { delta: 0.5, reason: "correction" }],
      ["downtime.adjust", { delta: 1, reason: "unknown" }],
      ["downtime.reset", { spent: 0 }],
    ] as const;
    for (const [name, args] of cases) {
      const response = await api.post(`characters/${character.id}/ops/${name}`, args);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ ok: false, error: { code: "VALIDATION", status: 400 } });
      expect(await read(character.id)).toEqual(character);
      expect(await history(character.id)).toHaveLength(0);
    }
  });
});
