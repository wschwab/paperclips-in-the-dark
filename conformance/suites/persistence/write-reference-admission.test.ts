import { describe, expect } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

type Doc = Record<string, any>;
async function clock() {
  const result = await api.createClock("Write boundary", "bounded", 4, "custom");
  if (!result.clock) throw new Error("create returned no clock");
  return result.clock;
}
async function bytes(kind: string, id: string) {
  const dir = join((await api.health()).dataDir, `${kind}s`, id);
  const current = await readFile(join(dir, "current.json"));
  const snapshots = await readdir(join(dir, "history")).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const history = await Promise.all(snapshots.sort().map(async (name) => [name, await readFile(join(dir, "history", name))]));
  return { current, history };
}
async function rejectImport(kind: string, original: Doc, imported: Doc, beforeApply?: () => Promise<void>) {
  const preview = await api.post(`${kind}s/${original.id}/import?preview=1`, { entity: imported });
  expect([200, 409]).toContain(preview.status);
  const token = (preview.body as Doc).previewToken ?? (preview.body as Doc).error?.token;
  expect(token).toBeTruthy();
  if (beforeApply) await beforeApply();
  const before = await bytes(kind, original.id);
  const response = await api.post(`${kind}s/${original.id}/import`, { entity: imported, previewToken: token, confirm: true }, { "If-Match": String(original.revision) });
  expect.soft(response.status).toBe(400);
  expect.soft((await api.operation(response)).error?.code).toBe("INVALID_ENTRY");
  expect(await bytes(kind, original.id)).toEqual(before);
}
async function corruptClock() {
  const doc = await clock();
  const changed = { ...doc, relatedClockIds: [randomUUID()] };
  await writeFile(join((await api.health()).dataDir, "clocks", doc.id, "current.json"), JSON.stringify(changed));
  return changed;
}

describe("universal persisted reference admission", () => {
  testCase("WRITE-REF-IMPORT-001", "character import rejects missing crew without clearing history", async () => {
    const original = await newCharacter();
    await rejectImport("character", original, { ...original, dossier: { ...original.dossier, crewId: randomUUID() } });
  });
  testCase("WRITE-REF-IMPORT-002", "crew import without external entity references remains supported", async () => {
    const original = await newCrew();
    const imported = { ...original, name: "Imported local crew" };
    const preview = await api.post(`crews/${original.id}/import?preview=1`, { entity: imported });
    expect(preview.status).toBe(200);
    const response = await api.post(`crews/${original.id}/import`, { entity: imported, previewToken: (preview.body as Doc).previewToken, confirm: true }, { "If-Match": String(original.revision) });
    expect(response.status).toBe(200);
    expect((await api.crew(original.id)).name).toBe(imported.name);
  });
  for (const [index, change] of [
    { ownerKind: "crew", ownerId: randomUUID() },
    { relatedClockIds: [randomUUID()] },
    { ownerKind: "character", ownerId: randomUUID() },
  ].entries()) {
    testCase(`WRITE-REF-IMPORT-00${index + 3}`, "clock import rejects dangling owner or related clock before history reset", async () => {
      const original = await clock();
      await rejectImport("clock", original, { ...original, ...change });
    });
  }
  testCase("WRITE-REF-IMPORT-006", "apply rechecks a crew deleted after valid character preview", async () => {
    const original = await newCharacter();
    const crew = await newCrew();
    await rejectImport("character", original, { ...original, dossier: { ...original.dossier, crewId: crew.id } }, async () => {
      expect((await api.post(`crews/${crew.id}/delete`, { confirm: true }, { "If-Match": String(crew.revision) })).status).toBe(200);
    });
  });
  testCase("WRITE-REF-MUTATE-001", "ordinary mutation cannot repersist a pre-existing dangling clock link", async () => {
    const doc = await corruptClock();
    const before = await bytes("clock", doc.id);
    const response = await api.post(`clocks/${doc.id}/ops/clock.progress`, { segments: 1 });
    expect.soft(response.status).toBe(400);
    expect.soft((await api.operation(response)).error?.code).toBe("VALIDATION");
    expect(await bytes("clock", doc.id)).toEqual(before);
  });
  testCase("WRITE-REF-BATCH-001", "batch rejects complete invalid resulting graph before any entity/history write", async () => {
    const doc = await corruptClock();
    const crew = await newCrew();
    const beforeClock = await bytes("clock", doc.id);
    const beforeCrew = await bytes("crew", crew.id);
    const response = await api.post("campaign/batch", { ops: [
      { entity: "crew", id: crew.id, op: "coin.add", args: { delta: 1 } },
      { entity: "clock", id: doc.id, op: "clock.progress", args: { segments: 1 } },
    ] });
    expect.soft((await api.operation(response)).batch?.some((item) => !item.ok && item.error?.code === "VALIDATION")).toBe(true);
    expect(await bytes("clock", doc.id)).toEqual(beforeClock);
    expect(await bytes("crew", crew.id)).toEqual(beforeCrew);
  });
  testCase("WRITE-REF-REPAIR-001", "repair retains previewed unresolved links pending the contract decision", async () => {
    const original = await newCharacter();
    const dirty = { ...original, dossier: { ...original.dossier, notes: "legacy", crewId: randomUUID() } };
    const raw = JSON.stringify(dirty);
    await writeFile(join((await api.health()).dataDir, "characters", original.id, "current.json"), raw);
    const token = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
    const preview = await api.post(`characters/${original.id}/repair-preview`);
    expect(preview.status).toBe(409);
    const body = preview.body as Doc;
    const response = await api.post(`characters/${original.id}/repair`, { confirm: true, previewToken: body.error?.token }, { "If-Match": token });
    expect(response.status).toBe(200);
    expect((await api.operation(response)).ok).toBe(true);
    const repaired = await api.character(original.id);
    expect(repaired.dossier.crewId).toBe(dirty.dossier.crewId);
    expect(repaired.dossier.notes).toEqual(["legacy"]);
    expect(repaired.revision).toBe(original.revision + 1);
  });
  testCase("WRITE-REF-DELETE-001", "secondary delete writes all validate before the first write or owner deletion", async () => {
    const crew = await newCrew();
    const good = (await api.createClock("Good owned", "bounded", 4, "custom", "crew", crew.id)).clock!;
    const bad = (await api.createClock("Bad owned", "bounded", 4, "custom", "crew", crew.id)).clock!;
    await writeFile(join((await api.health()).dataDir, "clocks", bad.id, "current.json"), JSON.stringify({ ...bad, relatedClockIds: [randomUUID()] }));
    const before = await Promise.all([bytes("crew", crew.id), bytes("clock", good.id), bytes("clock", bad.id)]);
    const response = await api.post(`crews/${crew.id}/delete`, { confirm: true }, { "If-Match": String(crew.revision) });
    expect.soft(response.status).toBe(400);
    expect(await Promise.all([bytes("crew", crew.id), bytes("clock", good.id), bytes("clock", bad.id)])).toEqual(before);
  });
  testCase("WRITE-REF-BATCH-002", "final valid graph may correct an unresolved link after a transient micro-operation", async () => {
    const doc = await corruptClock();
    const response = await api.post("campaign/batch", { ops: [
      { entity: "clock", id: doc.id, op: "clock.progress", args: { segments: 1 } },
      { entity: "clock", id: doc.id, op: "update", args: { relatedClockIds: [] } },
    ] });
    expect(response.status).toBe(200);
    expect((await api.operation(response)).batch?.every((item) => item.ok)).toBe(true);
    const current = (await api.get(`clocks/${doc.id}`)).body as Doc;
    expect(current.relatedClockIds).toEqual([]);
    expect(current.segments).toBe(1);
    expect(current.revision).toBe(doc.revision + 1);
  });
});
