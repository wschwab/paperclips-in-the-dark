import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { newCrew } from "../../src/suite-helpers.js";
import { firstPlaybook } from "../../src/game-data.js";
import type { CharacterDto } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { validateInlineOrThrow, validateOrThrow } from "../../src/contract-validator.js";

// FLOW-API-01: human-authorized contract/conformance change, 2026-11-01.
// Raw projection boundary is intentional: assertions must fail before decoders are generated.
type Json = Record<string, any>;
async function newCharacter(): Promise<CharacterDto> {
  const response = await api.post("characters", { gameStem: "blades-in-the-dark", playbook: firstPlaybook("blades-in-the-dark") });
  expect(response.status).toBe(200);
  const result = response.body as Json;
  expect(result.ok).toBe(true);
  expect(result.character?.id).toEqual(expect.any(String));
  // Setup-only raw fixture avoids an additive DTO field making the red fail
  // before it reaches the missing guided endpoint; strict reads follow below.
  return result.character as CharacterDto;
}
async function flow(id: string): Promise<Json> {
  const response = await api.get(`characters/${id}/flow`);
  expect(response.status).toBe(200);
  validateOrThrow("flow", response.body);
  return response.body as Json;
}
async function op(id: string, name: string, body: unknown, revision?: number): Promise<Json> {
  const response = await api.post(`characters/${id}/ops/${name}`, body,
    revision === undefined ? {} : { "If-Match": String(revision) });
  expect(response.status).toBe(200);
  expect((response.body as Json).ok).toBe(true);
  return response.body as Json;
}
async function at(step: string, linked = false) {
  let character = await newCharacter();
  const crew = linked ? await newCrew() : null;
  if (crew) character = (await op(character.id, "dossier.update", { crewId: crew.id }, character.revision)).character;
  character = (await op(character.id, "mode.flow.set", { kind: "resolution", step }, character.revision)).character;
  return { character, crew, view: await flow(character.id) };
}
function completion(view: Json, inputs: Json = {}, extra: Json = {}): Json {
  return { completionId: randomUUID(), instanceId: view.instanceId, kind: view.kind, step: view.step, inputs, ...extra };
}
async function complete(id: string, revision: number, body: Json) {
  return api.post(`characters/${id}/ops/flow.step.complete`, body, { "If-Match": String(revision) });
}

describe("FLOW-API-01 server guided score flow", () => {
  testCase("FLOW-API-001", "pure inactive projection exposes the current revision and no current completion action", async () => {
    const character = await newCharacter();
    const before = await api.get(`characters/${character.id}`);
    const view = await flow(character.id);
    expect(view).toMatchObject({ characterId: character.id, revision: character.revision, mode: "free-play", kind: "none", step: "", actions: [], back: null, next: null });
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
  });

  testCase("FLOW-API-002", "Score projection discovers Planning, typed completion inputs and shared guidance", async () => {
    const character = await newCharacter();
    const result = await op(character.id, "mode.set", { mode: "score" }, character.revision);
    const view = await flow(character.id);
    expect(view).toMatchObject({ revision: result.character.revision, kind: "score-start", step: "planning", back: null, next: "loadout" });
    expect(view.instanceId).toEqual(expect.any(String));
    expect(view.instanceId.length).toBeGreaterThan(0);
    expect(view.actions).toEqual(expect.arrayContaining([expect.objectContaining({ op: "flow.step.complete", inputSchema: expect.objectContaining({ type: "object" }) })]));
    expect(view.guidance).toEqual(expect.any(Object));
    expect(view.steps.map((step: Json) => step.step)).toEqual(["planning", "loadout", "engagement"]);
  });

  testCase("FLOW-API-003", "Planning and Engagement complete via the same op without automatic dice or awards", async () => {
    const character = await newCharacter();
    const started = await op(character.id, "mode.set", { mode: "score" }, character.revision);
    let view = await flow(character.id);
    let result = await complete(character.id, started.character.revision, completion(view, { planApproach: "Stealth" }));
    expect(result.status).toBe(200);
    view = await flow(character.id);
    expect(view.step).toBe("loadout");
    result = await complete(character.id, view.revision, completion(view));
    expect(result.status).toBe(200);
    view = await flow(character.id);
    expect(view.step).toBe("engagement");
    result = await complete(character.id, view.revision, completion(view, { note: "Crew rolled externally; risky position." }));
    expect(result.status).toBe(200);
    expect(await flow(character.id)).toMatchObject({ mode: "score", kind: "none", step: "" });
    expect((await api.character(character.id)).fund).toEqual(character.fund);
  });

  testCase("FLOW-API-004", "Payoff atomically applies explicit crew and personal deltas and advances one cursor", async () => {
    const { character, crew, view } = await at("payoff", true);
    const beforeCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    const response = await complete(character.id, character.revision, completion(view, { crewRevision: crew!.revision, crewCoin: 2, crewRep: 1, myShare: 1 }));
    expect(response.status).toBe(200);
    const after = await api.character(character.id);
    const afterCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    expect(after.revision).toBe(character.revision + 1);
    expect(afterCrew.revision).toBe(crew!.revision + 1);
    expect(afterCrew.coin).toBe(beforeCrew.coin + 2);
    expect(afterCrew.rep.current).toBe(beforeCrew.rep.current + 1);
    expect(after.fund.satchel.coins).toBe(character.fund.satchel.coins + 1);
    expect(await flow(character.id)).toMatchObject({ step: "heat" });
  });

  testCase("FLOW-API-005", "a stale linked crew revision rejects the entire completion without character awards or navigation", async () => {
    const { character, crew, view } = await at("payoff", true);
    await api.post(`crews/${crew!.id}/ops/note.add`, { text: "Another player edited." }, { "If-Match": String(crew!.revision) });
    const before = await api.get(`characters/${character.id}`);
    const beforeCrew = await api.get(`crews/${crew!.id}`);
    const response = await complete(character.id, character.revision, completion(view, { crewRevision: crew!.revision, crewCoin: 1, myShare: 1 }));
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(beforeCrew.rawBody);
  });

  testCase("FLOW-API-006", "durable completion IDs and revisiting an awarded step cannot award twice", async () => {
    const { character, crew, view } = await at("payoff", true);
    const body = completion(view, { crewRevision: crew!.revision, crewCoin: 1 });
    const first = await complete(character.id, character.revision, body);
    expect(first.status).toBe(200);
    const afterCrew = await api.get(`crews/${crew!.id}`);
    const after = await api.character(character.id);
    // No HTTP Idempotency-Key: the durable completion ID is the protection.
    expect((await complete(character.id, character.revision, body)).status).toBe(200);
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(afterCrew.rawBody);
    await op(character.id, "mode.flow.set", { kind: "resolution", step: "payoff" }, after.revision);
    const revisited = await flow(character.id);
    const again = await complete(character.id, revisited.revision, completion(revisited, { crewRevision: (afterCrew.body as Json).revision, crewCoin: 1 }));
    expect(again.status).toBe(400);
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(afterCrew.rawBody);
  });

  testCase("FLOW-API-007", "completion ID reuse with changed input is a proper non-success and preserves both entities", async () => {
    const { character, view } = await at("heat");
    const body = completion(view);
    expect((await complete(character.id, character.revision, body)).status).toBe(200);
    const before = await api.get(`characters/${character.id}`);
    const response = await complete(character.id, character.revision, { ...body, inputs: { crewHeat: 1 } });
    expect(response.status).toBe(400);
    expect((response.body as Json).error?.code).toBe("VALIDATION");
    expect(response.body).toMatchObject({ ok: false });
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
  });

  testCase("FLOW-API-025", "completion ID reuse with changed input under an Idempotency-Key is the same 400 as the headerless path", async () => {
    const { character, view } = await at("heat");
    const body = completion(view);
    const headers = { "If-Match": String(character.revision), "Idempotency-Key": "flow-api-025-key" };
    expect((await api.post(`characters/${character.id}/ops/flow.step.complete`, body, headers)).status).toBe(200);
    const before = await api.get(`characters/${character.id}`);
    const response = await api.post(`characters/${character.id}/ops/flow.step.complete`, { ...body, inputs: { crewHeat: 1 } }, headers);
    expect(response.status).toBe(400);
    expect((response.body as Json).error?.code).toBe("VALIDATION");
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
  });

  testCase("FLOW-API-008", "XP completion awards and clears expressions with cursor advance, while skip preserves expressions", async () => {
    const { character } = await at("scoundrel-xp");
    const prepared = (await op(character.id, "session.set", { playbookExpressions: 1, characterExpressions: 1, struggleExpressions: 1 }, character.revision)).character;
    const view = await flow(character.id);
    const response = await complete(character.id, prepared.revision, completion(view, { total: 1, allocations: { Playbook: 1, Insight: 0, Prowess: 0, Resolve: 0 } }));
    expect(response.status).toBe(200);
    const after = await api.character(character.id);
    expect(after.playbook.experience.points).toBe(character.playbook.experience.points + 1);
    expect(after.session).toMatchObject({ playbookExpressions: 0, characterExpressions: 0, struggleExpressions: 0 });
    expect((await flow(character.id)).step).toBe("payoff");
    const other = await at("scoundrel-xp");
    const marked = (await op(other.character.id, "session.set", { playbookExpressions: 1 }, other.character.revision)).character;
    const skipped = await complete(marked.id, marked.revision, completion(await flow(marked.id), {}, { skip: true }));
    expect(skipped.status).toBe(200);
    expect((await api.character(marked.id)).session.playbookExpressions).toBe(1);
  });

  testCase("FLOW-API-009", "invalid XP allocation fails before any award, clearing or step advance", async () => {
    const { character, view } = await at("scoundrel-xp");
    const before = await api.get(`characters/${character.id}`);
    const response = await complete(character.id, character.revision, completion(view, { total: 2, allocations: { Playbook: 1, Insight: 0, Prowess: 0, Resolve: 0 } }));
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
  });

  testCase("FLOW-API-010", "undo from the scoundrel restores linked crew awards and cursor together", async () => {
    const { character, crew, view } = await at("payoff", true);
    const beforeCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    const body = completion(view, { crewRevision: crew!.revision, crewCoin: 1, myShare: 1 });
    expect((await complete(character.id, character.revision, body)).status).toBe(200);
    const after = await api.character(character.id);
    const undo = await api.post(`characters/${character.id}/undo`, undefined, { "If-Match": String(after.revision) });
    expect(undo.status).toBe(200);
    const restored = await api.character(character.id);
    const restoredCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    expect(restored.fund).toEqual(character.fund);
    expect(restored.modeFlow).toEqual(character.modeFlow);
    expect(restoredCrew.coin).toEqual(beforeCrew.coin);
    expect(restoredCrew.revision).toBeGreaterThan(crew!.revision);
    // An old transport replay must not silently redo an undone award.
    expect((await complete(character.id, character.revision, body)).status).toBe(200);
    expect(((await api.get(`crews/${crew!.id}`)).body as Json).coin).toEqual(beforeCrew.coin);
  });

  testCase("FLOW-API-024", "grouped undo refuses to restore a crew award snapshot whose second types exceed the settings bound", async () => {
    const { character, crew } = await at("payoff", true);
    const added = await api.post(
      `crews/${crew!.id}/ops/cohort.add`,
      { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
      { "If-Match": String(crew!.revision) },
    );
    expect(added.status).toBe(200);
    const crewRevision = (added.body as Json).crew.revision as number;
    const view = await flow(character.id);
    expect((await complete(character.id, character.revision, completion(view, { crewRevision, crewCoin: 1, myShare: 1 }))).status).toBe(200);
    const after = await api.character(character.id);

    // the settings bound has since dropped: the award group's crew snapshot now
    // holds a second-type record above the bound while the current crew is valid
    const groupsDir = join((await api.health()).dataDir, "flow-groups");
    let tampered = 0;
    for (const file of await readdir(groupsDir)) {
      const path = join(groupsDir, file);
      const group = JSON.parse(await readFile(path, "utf8")) as Json;
      for (const participant of (group.participants ?? []) as Json[]) {
        if (participant.kind !== "crew" || participant.id !== crew!.id) continue;
        (((participant.before as Json).cohorts as Json[])[0] as Json).extraTypes = ["Rooks", "Adepts"];
        await writeFile(path, JSON.stringify(group));
        tampered += 1;
      }
    }
    expect(tampered).toBeGreaterThan(0);

    const crewBefore = await api.get(`crews/${crew!.id}`);
    const undo = await api.post(`characters/${character.id}/undo`, undefined, { "If-Match": String(after.revision) });
    expect(undo.status).toBe(400);
    expect((undo.body as Json).error?.code).toBe("INVALID_ENTRY");
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(crewBefore.rawBody);
  });

  testCase("FLOW-API-011", "group undo cannot overwrite a later unrelated crew edit", async () => {
    const { character, crew, view } = await at("payoff", true);
    expect((await complete(character.id, character.revision, completion(view, { crewRevision: crew!.revision, crewCoin: 1 }))).status).toBe(200);
    const awardedCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    await api.post(`crews/${crew!.id}/ops/note.add`, { text: "Keep this later edit." }, { "If-Match": String(awardedCrew.revision) });
    const before = await api.get(`characters/${character.id}`);
    const beforeCrew = await api.get(`crews/${crew!.id}`);
    const after = await api.character(character.id);
    const undo = await api.post(`characters/${character.id}/undo`, undefined, { "If-Match": String(after.revision) });
    expect(undo.status).toBe(409);
    expect(undo.body).toMatchObject({ ok: false });
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(beforeCrew.rawBody);
  });

  testCase("FLOW-API-012", "optional final steps can be skipped into Downtime without crew writes or budget resets", async () => {
    const { character, crew, view } = await at("crew-rep", true);
    expect(view.skippable).toBe(true);
    const beforeCrew = await api.get(`crews/${crew!.id}`);
    const response = await complete(character.id, character.revision, completion(view, {}, { skip: true }));
    expect(response.status).toBe(200);
    const after = await api.character(character.id);
    expect(after.mode).toBe("downtime");
    expect(after.modeFlow).toEqual({ kind: "none", step: "" });
    expect(after.downtime).toEqual(character.downtime);
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(beforeCrew.rawBody);
  });

  testCase("FLOW-API-013", "missing character If-Match and touched crew revision are validation failures without writes", async () => {
    const { character, crew, view } = await at("payoff", true);
    const before = await api.get(`characters/${character.id}`);
    const beforeCrew = await api.get(`crews/${crew!.id}`);
    const missingCharacter = await api.post(`characters/${character.id}/ops/flow.step.complete`, completion(view));
    expect(missingCharacter.status).toBe(400);
    const missingCrew = await complete(character.id, character.revision, completion(view, { crewCoin: 1 }));
    expect(missingCrew.status).toBe(400);
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(beforeCrew.rawBody);
  });

  testCase("FLOW-API-014", "an observed stale cursor rejects without awarding even if character revision is current", async () => {
    const { character, view } = await at("payoff");
    const moved = await op(character.id, "mode.flow.set", { kind: "resolution", step: "heat" }, character.revision);
    const before = await api.get(`characters/${character.id}`);
    const response = await complete(character.id, moved.character.revision, completion(view, { myShare: 1 }));
    expect(response.status).toBe(409);
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
  });

  testCase("FLOW-API-015", "group undo initiated at the crew restores the character cursor and personal share too", async () => {
    const { character, crew, view } = await at("payoff", true);
    const beforeCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    expect((await complete(character.id, character.revision, completion(view, { crewRevision: crew!.revision, crewCoin: 1, myShare: 1 }))).status).toBe(200);
    const awarded = (await api.get(`crews/${crew!.id}`)).body as Json;
    const undone = await api.post(`crews/${crew!.id}/undo`, undefined, { "If-Match": String(awarded.revision) });
    expect(undone.status).toBe(200);
    const restored = await api.character(character.id);
    expect(restored.modeFlow).toEqual(character.modeFlow);
    expect(restored.fund).toEqual(character.fund);
    expect(((await api.get(`crews/${crew!.id}`)).body as Json).coin).toBe(beforeCrew.coin);
  });

  testCase("FLOW-API-016", "invalid later batch member rolls back an earlier guided award and receipt", async () => {
    const { character, crew, view } = await at("payoff", true);
    const body = completion(view, { crewRevision: crew!.revision, crewCoin: 1, myShare: 1 });
    const before = await api.get(`characters/${character.id}`);
    const beforeCrew = await api.get(`crews/${crew!.id}`);
    const batch = await api.post("campaign/batch", { ops: [
      { entity: "character", id: character.id, op: "flow.step.complete", revision: character.revision, args: body },
      { entity: "crew", id: crew!.id, op: "unknown.flow.oracle", args: {} },
    ] });
    expect(batch.status).toBe(200);
    expect((batch.body as Json).batch.some((item: Json) => item.ok === false)).toBe(true);
    expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(beforeCrew.rawBody);
    expect((await complete(character.id, character.revision, body)).status).toBe(200);
    expect(((await api.get(`crews/${crew!.id}`)).body as Json).coin).toBe((beforeCrew.body as Json).coin + 1);
  });

  testCase("FLOW-API-017", "the projected action schema validates typed required Planning inputs and explicit skip", async () => {
    const character = await newCharacter();
    await op(character.id, "mode.set", { mode: "score" }, character.revision);
    const view = await flow(character.id);
    const action = view.actions.find((item: Json) => item.op === "flow.step.complete");
    expect(action).toBeDefined();
    expect(() => validateInlineOrThrow(action.inputSchema, completion(view, { planApproach: "Stealth" }))).not.toThrow();
    expect(() => validateInlineOrThrow(action.inputSchema, completion(view, { planApproach: 12 }))).toThrow();
    expect(() => validateInlineOrThrow(action.inputSchema, completion(view))).toThrow();
    expect(() => validateInlineOrThrow(action.inputSchema, completion(view, {}, { skip: true }))).not.toThrow();
    expect(view.guidance.scoreStart.planning.approaches.map((item: Json) => item.value)).toContain("Stealth");
    expect(view.guidance.onePlayerWarning).toBe("Only one player should update the crew — check nobody else already has.");
  });

  testCase("FLOW-API-018", "two guided groups undo in reverse order with fresh monotonic revisions", async () => {
    const { character, crew, view } = await at("payoff", true);
    const originalCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    expect((await complete(character.id, character.revision, completion(view, { crewRevision: crew!.revision, crewCoin: 1, myShare: 1 }))).status).toBe(200);
    const payoff = await api.character(character.id);
    const payoffCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    expect((await complete(character.id, payoff.revision, completion(await flow(character.id), { crewRevision: payoffCrew.revision, crewHeat: 1 }))).status).toBe(200);
    const heat = await api.character(character.id);
    expect((await api.post(`characters/${character.id}/undo`, undefined, { "If-Match": String(heat.revision) })).status).toBe(200);
    const firstUndo = await api.character(character.id);
    expect(firstUndo.revision).toBeGreaterThan(heat.revision);
    expect(firstUndo.modeFlow.step).toBe("heat");
    const second = await api.post(`characters/${character.id}/undo`, undefined, { "If-Match": String(firstUndo.revision) });
    expect(second.status).toBe(200);
    const restored = await api.character(character.id);
    expect(restored.revision).toBeGreaterThan(firstUndo.revision);
    expect(restored.modeFlow).toEqual(character.modeFlow);
    expect(restored.fund).toEqual(character.fund);
    const restoredCrew = (await api.get(`crews/${crew!.id}`)).body as Json;
    expect(restoredCrew.coin).toBe(originalCrew.coin);
    expect(restoredCrew.heat).toEqual(originalCrew.heat);
  });

  testCase("FLOW-API-019", "two scoundrels racing one observed crew revision cannot both award the crew", async () => {
    const first = await at("payoff", true);
    let second = await newCharacter();
    second = (await op(second.id, "dossier.update", { crewId: first.crew!.id }, second.revision)).character;
    second = (await op(second.id, "mode.flow.set", { kind: "resolution", step: "payoff" }, second.revision)).character;
    const secondView = await flow(second.id);
    const beforeCrew = (await api.get(`crews/${first.crew!.id}`)).body as Json;
    const results = await Promise.all([
      complete(first.character.id, first.character.revision, completion(first.view, { crewRevision: first.crew!.revision, crewCoin: 1, myShare: 1 })),
      complete(second.id, second.revision, completion(secondView, { crewRevision: first.crew!.revision, crewCoin: 1, myShare: 1 })),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    const afterCrew = (await api.get(`crews/${first.crew!.id}`)).body as Json;
    expect(afterCrew.coin).toBe(beforeCrew.coin + 1);
    expect(afterCrew.revision).toBe(beforeCrew.revision + 1);
    const after = await Promise.all([api.character(first.character.id), api.character(second.id)]);
    expect(after.filter((character) => character.modeFlow.step === "heat")).toHaveLength(1);
    expect(after.filter((character) => character.modeFlow.step === "payoff")).toHaveLength(1);
    expect(after.reduce((sum, character) => sum + character.fund.satchel.coins, 0)).toBe(first.character.fund.satchel.coins + second.fund.satchel.coins + 1);
  });

  testCase("FLOW-API-020", "legacy characters silently expose default flow progress without rewriting stored bytes", async () => {
    const character = await newCharacter();
    const dataDir = (await api.health()).dataDir;
    expect(resolve(dataDir)).toMatch(/^\/tmp\/pitd-managed\/[^/]+\/data$/);
    const path = join(dataDir, "characters", character.id, "current.json");
    const legacy = JSON.parse(await readFile(path, "utf8")) as Json;
    delete legacy.flowProgress;
    const bytes = `${JSON.stringify(legacy, null, 2)}\n`;
    await writeFile(path, bytes);
    const read = await api.get(`characters/${character.id}`);
    expect(read.status).toBe(200);
    expect((read.body as Json).flowProgress).toEqual({ instanceId: "", kind: "none", planApproach: "", notes: [] });
    expect((read.body as Json).revision).toBe(character.revision);
    validateOrThrow("character", read.body);
    expect(await flow(character.id)).toMatchObject({ revision: character.revision, kind: "none", step: "" });
    expect(await readFile(path, "utf8")).toBe(bytes);
  });

  testCase("FLOW-API-021", "group undo reports a deleted secondary participant with a valid NOT_FOUND envelope", async () => {
    const { character, crew, view } = await at("payoff", true);
    expect((await complete(character.id, character.revision, completion(view, { crewRevision: crew!.revision, crewCoin: 1 }))).status).toBe(200);
    const awarded = await api.character(character.id);
    const deleted = await api.post(`characters/${character.id}/delete`, { confirm: true }, { "If-Match": String(awarded.revision) });
    expect(deleted.status).toBe(200);
    const beforeCrew = await api.get(`crews/${crew!.id}`);
    const currentCrew = beforeCrew.body as Json;
    const response = await api.post(`crews/${crew!.id}/undo`, undefined, { "If-Match": String(currentCrew.revision) });
    expect(response.status).toBe(404);
    validateOrThrow("operationResult", response.body);
    expect(response.body).toMatchObject({ ok: false, error: { code: "NOT_FOUND", status: 404 } });
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(beforeCrew.rawBody);
  });

  testCase("FLOW-API-022", "group undo cannot silently overwrite a degraded secondary participant", async () => {
    const { character, crew, view } = await at("payoff", true);
    expect((await complete(character.id, character.revision, completion(view, { crewRevision: crew!.revision, crewCoin: 1 }))).status).toBe(200);
    const dataDir = (await api.health()).dataDir;
    expect(resolve(dataDir)).toMatch(/^\/tmp\/pitd-managed\/[^/]+\/data$/);
    const path = join(dataDir, "characters", character.id, "current.json");
    const degraded = JSON.parse(await readFile(path, "utf8")) as Json;
    degraded.monitor.stress.current = "malformed stored field";
    const bytes = `${JSON.stringify(degraded, null, 2)}\n`;
    await writeFile(path, bytes);
    const beforeCrew = await api.get(`crews/${crew!.id}`);
    const response = await api.post(`crews/${crew!.id}/undo`, undefined, { "If-Match": String((beforeCrew.body as Json).revision) });
    expect(response.status).toBe(422);
    validateOrThrow("operationResult", response.body);
    expect(response.body).toMatchObject({ ok: false, error: { code: "INVALID_ENTITY", status: 422 } });
    expect((await api.get(`crews/${crew!.id}`)).rawBody).toBe(beforeCrew.rawBody);
    expect(await readFile(path, "utf8")).toBe(bytes);
  });

  testCase("FLOW-API-023", "a Score character with no active cursor still exposes the Score entry steps so the scoundrel can re-enter", async () => {
    const character = await newCharacter();
    const started = await op(character.id, "mode.set", { mode: "score" }, character.revision);
    expect(started.ok).toBe(true);
    const cleared = await op(character.id, "mode.flow.set", { kind: "none", step: "" }, started.character.revision);
    expect(cleared.ok).toBe(true);
    const view = await flow(character.id);
    expect(view).toMatchObject({ mode: "score", kind: "none", step: "", actions: [] });
    const steps = view.steps as Array<{ kind: string; step: string }>;
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.kind === "score-start")).toBe(true);
  });

  testCase("FLOW-API-026", "an unparseable stored character is refused with INVALID_ENTITY on flow reads and completions, never a server fault", async () => {
    const { character, view } = await at("heat");
    const dataDir = (await api.health()).dataDir;
    expect(resolve(dataDir)).toMatch(/^\/tmp\/pitd-managed\/[^/]+\/data$/);
    const path = join(dataDir, "characters", character.id, "current.json");
    await writeFile(path, "{ not json");
    const read = await api.get(`characters/${character.id}/flow`);
    expect(read.status).toBe(422);
    expect(read.body).toMatchObject({ ok: false, error: { code: "INVALID_ENTITY", status: 422 } });
    const completed = await complete(character.id, character.revision, completion(view));
    expect(completed.status).toBe(422);
    expect(completed.body).toMatchObject({ ok: false, error: { code: "INVALID_ENTITY", status: 422 } });
    expect(await readFile(path, "utf8")).toBe("{ not json");
  });
});
