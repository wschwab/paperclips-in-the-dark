import { expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook, gameSetting } from "../../src/game-data.js";
import { assertResponseValid, decode, Schemas, type OperationResultDto } from "../../src/schemas.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const stem = "blades-in-the-dark";
const setting = gameSetting(stem);
const playbook = firstPlaybook(stem);
const defaults = Object.fromEntries((setting.Playbooks.find(p => p.Name === playbook)?.DefaultActionPoints ?? []).filter(d => d.Points > 0).map(d => [d.Action, d.Points]));
const names = setting.Attributes.flatMap(a => a.Actions.map(x => x.Name));
const free = names.filter(n => !(n in defaults));
const budget = setting.StartingActionDots!;
const cap = setting.StartingActionDotMax!;
const allocationEndpoints: Record<string, string> = {
  "action.set-rating": "actionSetRating",
  "attribute.levelup": "attributeLevelup",
  "talent.allocation.complete": "talentAllocationComplete",
};

async function draft() {
  const response = await api.post("characters/pc", { gameStem: stem, playbook });
  expect(response.status).toBe(200);
  const body = await decode(Schemas.OperationResult, response.body);
  expect(body.ok).toBe(true);
  expect(body.character!.talent.allocationPending).toBe(true);
  return body.character!;
}
async function rejected(id: string, op: string, body: unknown) {
  const before = await api.get(`characters/${id}`);
  const response = await api.post(`characters/${id}/ops/${op}`, body);
  const result = await api.operation(response);
  expect(result.ok).toBe(false);
  expect(result.error?.code).toBe("VALIDATION");
  expect(result.error?.status).toBe(400);
  // Check the whole current DTO, including revision, action ratings and XP.
  // The decoded error union is not uniform: only the branches that carry a
  // current entity declare `entity`, so narrow before reading it.
  const error = result.error;
  const entity = error && "entity" in error ? error.entity : undefined;
  expect.soft(entity).toEqual(before.body);
  expect.soft(response.status).toBe(400);
  expect.soft(() => assertResponseValid(allocationEndpoints[op], response.status, response.body)).not.toThrow();
  expect((await api.get(`characters/${id}`)).rawBody).toBe(before.rawBody);
}

testCase("CREATE02-RATING", "attribute ratings count first-column dots and remain export-identical", async () => {
  const created = await api.createCharacter(stem, playbook);
  const id = created.character!.id;
  await api.characterOp(id, "action.set-rating", { action: free[0], rating: cap });
  const detail = await api.get(`characters/${id}`);
  const character = await decode(Schemas.Character, detail.body);
  for (const attr of character.talent.attributes) {
    expect(attr.rating).toBe(attr.actions.filter(a => a.rating > 0).length);
  }
  expect(character.talent.allocationPending).toBe(false);
  expect((await api.get(`characters/${id}?download=1`)).rawBody).toBe(detail.rawBody);
});

testCase("CREATE02-DRAFT", "draft defaults survive refresh and pending allocation enforces locks cap budget and completion", async () => {
  const character = await draft();
  const id = character.id;
  const refreshed = await api.character(id);
  expect(refreshed.talent.allocationPending).toBe(true);
  for (const attr of refreshed.talent.attributes) {
    for (const action of attr.actions) expect(action.rating).toBe(defaults[action.name] ?? 0);
    expect(attr.rating).toBe(attr.actions.filter(a => a.rating > 0).length);
  }
  await rejected(id, "talent.allocation.complete", {});
  const locked = Object.keys(defaults)[0];
  await rejected(id, "action.set-rating", { action: locked, rating: defaults[locked] - 1 });
  await rejected(id, "action.set-rating", { action: free[0], rating: cap + 1 });
  let remaining = budget - Object.values(defaults).reduce((a, b) => a + b, 0);
  let last: OperationResultDto | undefined;
  const assigned: Record<string, number> = {};
  for (const action of free) {
    const rating = Math.min(cap, remaining);
    assigned[action] = rating;
    last = await api.characterOp(id, "action.set-rating", { action, rating });
    expect(last.ok).toBe(true);
    remaining -= rating;
  }
  expect(remaining).toBe(0);
  const raise = free.find(n => assigned[n] < cap)!;
  await rejected(id, "action.set-rating", { action: raise, rating: assigned[raise] + 1 });
  const before = last!.character!;
  const complete = await api.characterOp(id, "talent.allocation.complete", {});
  expect(complete.ok).toBe(true);
  expect(complete.character!.talent.allocationPending).toBe(false);
  expect(complete.character!.fund).toEqual(before.fund);
  expect(complete.character!.playbook.experience).toEqual(before.playbook.experience);
  expect(complete.character!.talent.attributes).toEqual(before.talent.attributes);
  await rejected(id, "talent.allocation.complete", {});
  expect((await api.characterOp(id, "action.set-rating", { action: locked, rating: 0 })).ok).toBe(true);
});

testCase("CREATE02-LEGACY", "legacy talent overlays are read-only and detail and export share the view", async () => {
  const created = await api.createCharacter(stem, playbook);
  const character = created.character!;
  const path = join((await api.health()).dataDir, "characters", character.id, "current.json");
  const legacy = JSON.parse(JSON.stringify(character)) as { talent: { allocationPending?: boolean; attributes: Array<{ rating?: number }> } };
  delete legacy.talent.allocationPending;
  for (const attribute of legacy.talent.attributes) delete attribute.rating;
  const bytes = JSON.stringify(legacy);
  await writeFile(path, bytes);
  const detail = await api.get(`characters/${character.id}`);
  expect(detail.status).toBe(200);
  const view = await decode(Schemas.Character, detail.body);
  expect(view.revision).toBe(character.revision);
  expect(view.talent.allocationPending).toBe(false);
  for (const attribute of view.talent.attributes) {
    expect(attribute.rating).toBe(attribute.actions.filter(action => action.rating > 0).length);
  }
  expect((await api.get(`characters/${character.id}?download=1`)).rawBody).toBe(detail.rawBody);
  expect(await readFile(path, "utf8")).toBe(bytes);
});

testCase("CREATE02-LEVELUP", "levelup cannot bypass draft defaults and batch cannot bypass total allocation", async () => {
  const character = await draft();
  const locked = Object.keys(defaults)[0];
  const attribute = character.talent.attributes.find(a => a.actions.some(x => x.name === locked))!;
  expect((await api.characterOp(character.id, "attribute-xp.add", { attribute: attribute.name, delta: attribute.experience.max })).ok).toBe(true);
  await rejected(character.id, "attribute.levelup", { attribute: attribute.name, action: locked });
  const before = await api.get(`characters/${character.id}`);
  const current = await api.character(character.id);
  const response = await api.post("campaign/batch", { ops: free.map(action => ({
    entity: "character", id: character.id, revision: current.revision,
    op: "action.set-rating", args: { action, rating: cap },
  })) });
  const result = await api.operation(response);
  expect(result.batch?.some(item => item.ok === false)).toBe(true);
  const failures = result.batch!.filter(item => !item.ok);
  for (const failure of failures) {
    expect(failure.error?.code).toBe("VALIDATION");
    expect(failure.error?.status).toBe(400);
  }
  expect.soft(response.status).toBe(400);
  expect.soft(() => assertResponseValid("batch", response.status, response.body)).not.toThrow();
  expect((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
});

testCase("CREATE02-BATCH-RESPONSES", "allocation member responses match the contract without changing unrelated validation delivery", async () => {
  const character = await draft();
  const locked = Object.keys(defaults)[0];
  const attribute = character.talent.attributes.find(a => a.actions.some(x => x.name === locked))!;
  expect((await api.characterOp(character.id, "attribute-xp.add", {
    attribute: attribute.name, delta: attribute.experience.max,
  })).ok).toBe(true);
  const current = await api.character(character.id);
  const cases = [
    { op: "talent.allocation.complete", args: {}, status: 400 },
    { op: "action.set-rating", args: { action: locked, rating: defaults[locked] - 1 }, status: 400 },
    { op: "attribute.levelup", args: { attribute: attribute.name, action: locked }, status: 400 },
    { op: "trauma.add", args: { trauma: setting.Traumas[0] }, status: 200 },
  ];
  for (const { op, args, status } of cases) {
    const response = await api.post("campaign/batch", { ops: [{
      entity: "character", id: character.id, revision: current.revision, op, args,
    }] });
    const result = await api.operation(response);
    expect(result.batch).toHaveLength(1);
    expect(result.batch![0].ok).toBe(false);
    expect(result.batch![0].error?.code).toBe("VALIDATION");
    expect(result.batch![0].error?.status).toBe(400);
    expect.soft(response.status).toBe(status);
    expect.soft(() => assertResponseValid("batch", response.status, response.body)).not.toThrow();
    expect(await api.character(character.id)).toEqual(current);
  }
});
