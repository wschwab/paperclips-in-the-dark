import { describe, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

type BatchOp = { entity: string; id: string; op: string; args: Record<string, unknown> };
const item = (entity: string, id: string, op: string, args: Record<string, unknown>): BatchOp => ({ entity, id, op, args });
async function history(route: string, id: string) {
  const response = await api.get(`${route}/${id}/history`);
  expect(response.status).toBe(200);
  return decode(Schemas.History, response.body);
}
async function clock() {
  const result = await api.createClock("Batch boundary", "bounded", 4);
  if (!result.clock) throw new Error("create returned no clock");
  return result.clock;
}
async function orderedCharacters() {
  const pair = [await newCharacter(), await newCharacter()].sort((a, b) => a.id.localeCompare(b.id));
  return { a: pair[1]!, b: pair[0]! };
}
async function batch(ops: BatchOp[]) {
  const response = await api.post("campaign/batch", { ops });
  expect(response.status).toBe(200);
  return api.operation(response);
}

describe("campaign batch shared boundaries", () => {
  testCase("BATCH-ORDER-001", "lock sorting does not reverse dependent operations on the same character", async () => {
    const { a, b } = await orderedCharacters();
    expect(a.fund.satchel.coins).toBe(2);
    const result = await batch([
      item("character", a.id, "fund.gain", { coins: 3 }),
      item("character", a.id, "fund.spend", { coins: 4 }),
      item("character", b.id, "note.add", { text: "Other character" }),
    ]);
    expect.soft(result.batch?.map((entry) => entry.ok)).toEqual([true, true, true]);
    expect.soft(result.batch?.map((entry) => entry.op)).toEqual(["fund.gain", "fund.spend", "note.add"]);
    expect.soft((await api.character(a.id)).fund.satchel.coins).toBe(Math.min(a.fund.satchel.coins + 3, a.fund.satchel.max) - 4);
    expect.soft((await api.character(b.id)).dossier.notes).toEqual(["Other character"]);
  });

  testCase("BATCH-ORDER-002", "successful item results and repeated-entity state follow request order", async () => {
    const { a, b } = await orderedCharacters();
    const result = await batch([
      item("character", a.id, "note.add", { text: "First" }),
      item("character", a.id, "note.add", { text: "Second" }),
      item("character", b.id, "notebook.set", { text: "Other notebook" }),
    ]);
    expect.soft(result.batch?.map((entry) => entry.op)).toEqual(["note.add", "note.add", "notebook.set"]);
    expect.soft((await api.character(a.id)).dossier.notes).toEqual(["First", "Second"]);
    expect.soft((await api.character(a.id)).revision).toBe(a.revision + 1);
  });

  for (const [index, label] of ["missing character owner", "missing crew owner", "missing related clock", "self relationship", "duplicate relationship"].entries()) {
    testCase(`BATCH-CLOCK-REFS-${String(index + 1).padStart(3, "0")}`, `${label} is rejected identically to a single update and rolls back the whole batch`, async () => {
      const target = await clock();
      const related = await clock();
      const other = await newCharacter();
      const missing = randomUUID();
      const args = index < 2 ? { ownerKind: index === 0 ? "character" : "crew", ownerId: missing }
        : { relatedClockIds: index === 2 ? [missing] : index === 3 ? [target.id] : [related.id, related.id] };
      const beforeClock = await api.get(`clocks/${target.id}`);
      const beforeOther = await api.get(`characters/${other.id}`);
      const single = await api.post(`clocks/${target.id}/update`, args);
      expect(single.status).toBe(400);
      expect((await api.operation(single)).error?.code).toBe("VALIDATION");
      const result = await batch([
        item("character", other.id, "note.add", { text: "Must roll back" }),
        item("clock", target.id, "update", args),
      ]);
      expect.soft(result.batch?.[1]?.ok).toBe(false);
      expect.soft(result.batch?.[1]?.error?.code).toBe("VALIDATION");
      expect.soft(result.batch?.[1]?.error?.status).toBe(400);
      expect.soft((await api.get(`clocks/${target.id}`)).rawBody).toBe(beforeClock.rawBody);
      expect.soft((await api.get(`characters/${other.id}`)).rawBody).toBe(beforeOther.rawBody);
      expect.soft(await history("clocks", target.id)).toHaveLength(0);
      expect.soft(await history("characters", other.id)).toHaveLength(0);
    });
  }

  testCase("BATCH-SNAPSHOT-001", "a batch beginning with a micro-op snapshots the entire pre-batch state once", async () => {
    const character = await newCharacter();
    const result = await batch([
      item("character", character.id, "notebook.set", { text: "Notebook change" }),
      item("character", character.id, "note.add", { text: "Note change" }),
    ]);
    expect(result.batch?.every((entry) => entry.ok)).toBe(true);
    const entries = await history("characters", character.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.op).toBe("campaign.batch");
    const after = await api.character(character.id);
    expect(after.notebook).toBe("Notebook change");
    expect(after.dossier.notes).toEqual(["Note change"]);
    const undone = await api.operation(await api.post(`characters/${character.id}/undo`, {}, { "If-Match": String(after.revision) }));
    expect(undone.ok).toBe(true);
    expect(undone.character?.notebook).toBe(character.notebook);
    expect(undone.character?.dossier.notes).toEqual(character.dossier.notes);
  });

  for (const [index, kind] of ["character", "crew", "clock"].entries()) {
    testCase(`BATCH-SNAPSHOT-${String(index + 2).padStart(3, "0")}`, `${kind} batch gets exactly one composite history entry and revision, including micro-op-only batches`, async () => {
      const entity = kind === "character" ? await newCharacter() : kind === "crew" ? await newCrew() : await clock();
      const route = kind === "character" ? "characters" : `${kind}s`;
      const op = kind === "clock" ? "clock.progress" : kind === "crew" ? "hold.set" : "notebook.set";
      const args = kind === "clock" ? { segments: 1 } : kind === "crew" ? { hold: "strong" } : { text: "Micro-only batch" };
      const result = await batch([item(kind, entity.id, op, args), item(kind, entity.id, op, args)]);
      expect(result.batch?.every((entry) => entry.ok)).toBe(true);
      const entries = await history(route, entity.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.op).toBe("campaign.batch");
      expect((await api.get(`${route}/${entity.id}`)).body.revision).toBe(entity.revision + 1);
    });
  }

  for (const [index, label] of ["top-level", "per-operation"].entries()) {
    testCase(`BATCH-SHAPE-${String(index + 1).padStart(3, "0")}`, `${label} unknown properties return 400 VALIDATION without state or history changes`, async () => {
      const character = await newCharacter();
      const before = await api.get(`characters/${character.id}`);
      const op = item("character", character.id, "note.add", { text: "Must not persist" });
      const body = index === 0 ? { ops: [op], extra: true } : { ops: [{ ...op, extra: true }] };
      const response = await api.post("campaign/batch", body);
      expect.soft(response.status).toBe(400);
      const result = await api.operation(response);
      expect.soft(result.ok).toBe(false);
      expect.soft(result.error?.code).toBe("VALIDATION");
      expect.soft((await api.get(`characters/${character.id}`)).rawBody).toBe(before.rawBody);
      expect.soft(await history("characters", character.id)).toHaveLength(0);
    });
  }
});
