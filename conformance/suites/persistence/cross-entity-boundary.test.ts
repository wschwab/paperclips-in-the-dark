import { describe, expect } from "vitest";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { api, type HttpResponse } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, newCrew } from "../../src/suite-helpers.js";

type ConcurrentRequest = { path: string; body: unknown; headers?: Record<string, string> };
// Same synchronized curl transport as batch-concurrency.test.ts. Spawn every
// child before feeding bodies, so startup work cannot serialize the burst.
async function concurrentRequests(requests: ConcurrentRequest[]): Promise<HttpResponse[]> {
  const children = requests.map(({ path, body, headers = {} }) => {
    let resolve!: (response: HttpResponse) => void;
    let reject!: (cause: unknown) => void;
    const promise = new Promise<HttpResponse>((resolveResponse, rejectResponse) => {
      resolve = resolveResponse;
      reject = rejectResponse;
    });
    const child = execFile("curl", ["--silent", "--show-error", "--max-time", "15", "--dump-header", "-",
      "--header", "Content-Type: application/json", ...Object.entries(headers).flatMap(([key, value]) => ["--header", `${key}: ${value}`]),
      "--data-binary", "@-", `${api.baseUrl}/${path}`], (error, stdout) => {
      if (error) { reject(error); return; }
      try {
        const boundary = stdout.indexOf("\r\n\r\n");
        const lines = stdout.slice(0, boundary).split("\r\n");
        const status = Number(lines.shift()!.split(" ")[1]);
        const responseHeaders = new Headers();
        for (const line of lines) {
          const colon = line.indexOf(":");
          responseHeaders.append(line.slice(0, colon), line.slice(colon + 1).trim());
        }
        const rawBody = stdout.slice(boundary + 4);
        resolve({ status, headers: responseHeaders, body: JSON.parse(rawBody), rawBody });
      } catch (cause) { reject(cause); }
    });
    return { child, body, promise, spawned: once(child, "spawn") };
  });
  try {
    const [, responses] = await Promise.all([
      Promise.all(children.map(({ spawned }) => spawned)).then(() => {
        for (const { child, body } of children) child.stdin!.end(JSON.stringify(body));
      }),
      Promise.all(children.map(({ promise }) => promise)),
    ]);
    return responses;
  } finally {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    }
  }
}
async function succeeded(response: HttpResponse) {
  expect(response.status).toBe(200);
  const result = await api.operation(response);
  expect(result.ok).toBe(true);
  return result;
}
async function clock(ownerKind: "campaign" | "character" | "crew" = "campaign", ownerId = "", relatedClockIds: string[] = []) {
  const result = await api.createClock("Cross-entity boundary", "bounded", 4, "custom", ownerKind, ownerId, relatedClockIds);
  expect(result.ok).toBe(true);
  if (!result.clock) throw new Error("create returned no clock");
  return result.clock;
}
async function history(route: string, id: string) {
  return decode(Schemas.History, (await api.get(`${route}/${id}/history`)).body);
}
async function rejectedUndoPreserves(route: string, id: string, revision: number) {
  const before = await api.get(`${route}/${id}`);
  const beforeHistory = await api.get(`${route}/${id}/history`);
  const entries = await history(route, id);
  const snapshots = await Promise.all(entries.map(async (entry) => (await api.get(`${route}/${id}/history/${entry.snapshotId}`)).rawBody));
  const response = await api.post(`${route}/${id}/undo`, undefined, { "If-Match": String(revision) });
  expect.soft(response.status).toBe(404);
  const result = await api.operation(response);
  expect.soft(result.ok).toBe(false);
  expect.soft(result.error?.code).toBe("NOT_FOUND");
  expect.soft(result.error?.status).toBe(404);
  expect.soft((await api.get(`${route}/${id}`)).rawBody).toBe(before.rawBody);
  expect.soft((await api.get(`${route}/${id}/history`)).rawBody).toBe(beforeHistory.rawBody);
  for (const [index, entry] of entries.entries()) {
    expect.soft((await api.get(`${route}/${id}/history/${entry.snapshotId}`)).rawBody).toBe(snapshots[index]);
  }
}

describe("secondary writes and historical cross-entity references", () => {
  testCase("CROSS-LOCK-001", "crew deletion and 16 member note mutations preserve every unlink and note", async () => {
    const crew = await newCrew();
    const members = [];
    for (let index = 0; index < 16; index += 1) {
      const member = await newCharacter();
      await succeeded(await api.post(`characters/${member.id}/ops/dossier.update`, { crewId: crew.id }));
      members.push(await api.character(member.id));
    }
    const responses = await concurrentRequests([
      { path: `crews/${crew.id}/delete`, body: { confirm: true }, headers: { "If-Match": String(crew.revision) } },
      ...members.map((member, index) => ({ path: `characters/${member.id}/ops/note.add`, body: { text: `member-note-${index}` } })),
    ]);
    for (const response of responses) await succeeded(response);
    expect((await api.get(`crews/${crew.id}`)).status).toBe(404);
    for (const [index, member] of members.entries()) {
      const current = await api.character(member.id);
      expect.soft(current.dossier.crewId).toBe("");
      expect.soft(current.dossier.notes).toEqual([`member-note-${index}`]);
      expect.soft(current.revision).toBe(member.revision + 2);
    }
  });

  testCase("CROSS-LOCK-002", "clock deletion and 16 related-clock progress mutations preserve unlink and progress", async () => {
    const deleted = await clock();
    const targets = [];
    for (let index = 0; index < 16; index += 1) targets.push(await clock("campaign", "", [deleted.id]));
    const responses = await concurrentRequests([
      { path: `clocks/${deleted.id}/delete`, body: { confirm: true }, headers: { "If-Match": String(deleted.revision) } },
      ...targets.map((target) => ({ path: `clocks/${target.id}/ops/clock.progress`, body: { segments: 1 } })),
    ]);
    for (const response of responses) await succeeded(response);
    for (const target of targets) {
      const current = await api.clock(target.id);
      expect.soft(current.relatedClockIds).toEqual([]);
      expect.soft(current.segments).toBe(1);
      expect.soft(current.revision).toBe(target.revision + 2);
    }
  });

  for (const [index, ownerKind] of (["character", "crew"] as const).entries()) {
    testCase(`CROSS-LOCK-${String(index + 3).padStart(3, "0")}`, `${ownerKind} deletion and 16 owned-clock progress mutations preserve reassignment and progress`, async () => {
      const owner = ownerKind === "character" ? await newCharacter() : await newCrew();
      const targets = [];
      for (let count = 0; count < 16; count += 1) targets.push(await clock(ownerKind, owner.id));
      const route = ownerKind === "character" ? "characters" : "crews";
      const responses = await concurrentRequests([
        { path: `${route}/${owner.id}/delete`, body: { confirm: true }, headers: { "If-Match": String(owner.revision) } },
        ...targets.map((target) => ({ path: `clocks/${target.id}/ops/clock.progress`, body: { segments: 1 } })),
      ]);
      const deleted = await succeeded(responses[0]!);
      for (const response of responses.slice(1)) await succeeded(response);
      for (const target of targets) {
        const current = await api.clock(target.id);
        expect.soft(current.ownerKind).toBe("campaign");
        expect.soft(current.ownerId).toBe("");
        expect.soft(current.segments).toBe(1);
        expect.soft(current.revision).toBe(target.revision + 2);
        expect.soft(deleted.sideEffects).toContain(`clock ${target.id} reassigned to campaign`);
      }
    });
  }

  testCase("CROSS-LOCK-005", "delete lock sets exceed the former 64-slot capacity without limiting campaign size", async () => {
    const owner = await newCharacter();
    const targets = [];
    for (let index = 0; index < 65; index += 1) targets.push(await clock("character", owner.id));
    await succeeded(await api.post(`characters/${owner.id}/delete`, { confirm: true }, { "If-Match": String(owner.revision) }));
    for (const target of targets) {
      const current = await api.clock(target.id);
      expect.soft(current.ownerKind).toBe("campaign");
      expect.soft(current.ownerId).toBe("");
    }
  });

  testCase("CROSS-LOCK-006", "overlapping delete and batch lock sets complete without deadlock", async () => {
    const crew = await newCrew();
    const member = await newCharacter();
    await succeeded(await api.post(`characters/${member.id}/ops/dossier.update`, { crewId: crew.id }));
    const owned = await clock("crew", crew.id);
    const responses = await concurrentRequests([
      { path: `crews/${crew.id}/delete`, body: { confirm: true }, headers: { "If-Match": String(crew.revision) } },
      { path: "campaign/batch", body: { ops: [
        { entity: "character", id: member.id, op: "note.add", args: { text: "batch survives delete" } },
        { entity: "clock", id: owned.id, op: "clock.progress", args: { segments: 1 } },
      ] } },
    ]);
    await succeeded(responses[0]!);
    const result = await succeeded(responses[1]!);
    expect(result.batch?.map((item) => item.ok)).toEqual([true, true]);
    expect((await api.character(member.id)).dossier.crewId).toBe("");
    expect((await api.character(member.id)).dossier.notes).toEqual(["batch survives delete"]);
    const current = await api.clock(owned.id);
    expect(current.ownerKind).toBe("campaign");
    expect(current.segments).toBe(1);
  });

  testCase("CROSS-LOCK-007", "a safe path id cannot collide with the private membership lock", async () => {
    const response = await api.post("crews/entity-membership/delete", { confirm: true }, { "If-Match": "1" });
    expect(response.status).toBe(404);
    expect((await api.operation(response)).error?.code).toBe("NOT_FOUND");
    expect((await newCrew()).id).not.toBe("");
  });

  testCase("CROSS-LOCK-008", "owner deletion freezes new clock discovery and rejects stale create references before persistence", async () => {
    const crew = await newCrew();
    const responses = await concurrentRequests([
      { path: `crews/${crew.id}/delete`, body: { confirm: true }, headers: { "If-Match": String(crew.revision) } },
      ...Array.from({ length: 16 }, (_, index) => ({ path: "clocks", body: {
        name: `new-owned-${index}`, behavior: "bounded", size: 4, purpose: "custom",
        ownerKind: "crew", ownerId: crew.id, relatedClockIds: [],
      } })),
    ]);
    await succeeded(responses[0]!);
    for (const response of responses.slice(1)) {
      expect([200, 400]).toContain(response.status);
      const result = await api.operation(response);
      if (result.ok) {
        if (!result.clock) throw new Error("create returned no clock");
        const current = await api.clock(result.clock.id);
        expect.soft(current.ownerKind).toBe("campaign");
        expect.soft(current.ownerId).toBe("");
      } else {
        expect.soft(result.error?.code).toBe("VALIDATION");
      }
    }
    expect((await api.get("clocks")).body).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerKind: "crew", ownerId: crew.id }),
    ]));
  });

  testCase("UNDO-REF-001", "undo cannot resurrect a deleted crew reference and preserves bytes, revision, history, and snapshots", async () => {
    const crew = await newCrew();
    const member = await newCharacter();
    await succeeded(await api.post(`characters/${member.id}/ops/dossier.update`, { crewId: crew.id }));
    await succeeded(await api.post(`characters/${member.id}/ops/note.add`, { text: "keep current note" }));
    await succeeded(await api.post(`crews/${crew.id}/delete`, { confirm: true }, { "If-Match": String(crew.revision) }));
    const current = await api.character(member.id);
    expect(current.dossier.crewId).toBe("");
    await rejectedUndoPreserves("characters", member.id, current.revision);
    await succeeded(await api.post(`characters/${member.id}/ops/note.add`, { text: "lock released after rejection" }));
  });

  for (const [index, ownerKind] of (["character", "crew"] as const).entries()) {
    testCase(`UNDO-REF-${String(index + 2).padStart(3, "0")}`, `clock undo cannot resurrect a deleted ${ownerKind} owner`, async () => {
      const owner = ownerKind === "character" ? await newCharacter() : await newCrew();
      const target = await clock(ownerKind, owner.id);
      await succeeded(await api.post(`clocks/${target.id}/update`, { purpose: "progress" }));
      const route = ownerKind === "character" ? "characters" : "crews";
      await succeeded(await api.post(`${route}/${owner.id}/delete`, { confirm: true }, { "If-Match": String(owner.revision) }));
      const current = await api.clock(target.id);
      expect(current.ownerKind).toBe("campaign");
      await rejectedUndoPreserves("clocks", target.id, current.revision);
    });
  }

  testCase("UNDO-REF-004", "clock undo cannot resurrect a deleted related clock", async () => {
    const related = await clock();
    const target = await clock("campaign", "", [related.id]);
    await succeeded(await api.post(`clocks/${target.id}/update`, { purpose: "progress" }));
    await succeeded(await api.post(`clocks/${related.id}/delete`, { confirm: true }, { "If-Match": String(related.revision) }));
    const current = await api.clock(target.id);
    expect(current.relatedClockIds).toEqual([]);
    await rejectedUndoPreserves("clocks", target.id, current.revision);
  });

  testCase("UNDO-REF-005", "undo preserves valid owner and related references and consumes exactly the newest snapshot", async () => {
    const owner = await newCharacter();
    const related = await clock();
    const target = await clock("character", owner.id, [related.id]);
    await succeeded(await api.post(`clocks/${target.id}/update`, { purpose: "progress" }));
    const current = await api.clock(target.id);
    const restored = await succeeded(await api.post(`clocks/${target.id}/undo`, undefined, { "If-Match": String(current.revision) }));
    expect(restored.clock?.name).toBe(target.name);
    expect(restored.clock?.purpose).toBe(target.purpose);
    expect(restored.clock?.ownerKind).toBe("character");
    expect(restored.clock?.ownerId).toBe(owner.id);
    expect(restored.clock?.relatedClockIds).toEqual([related.id]);
    expect(restored.clock?.revision).toBe(current.revision + 1);
    expect(await history("clocks", target.id)).toHaveLength(0);
  });

  testCase("UNDO-REF-006", "crew delete racing 16 member undos never leaves a dangling restored crewId", async () => {
    const crew = await newCrew();
    const members = [];
    for (let index = 0; index < 16; index += 1) {
      const member = await newCharacter();
      await succeeded(await api.post(`characters/${member.id}/ops/dossier.update`, { crewId: crew.id }));
      await succeeded(await api.post(`characters/${member.id}/ops/note.add`, { text: `note-${index}` }));
      members.push(await api.character(member.id));
    }
    const responses = await concurrentRequests([
      { path: `crews/${crew.id}/delete`, body: { confirm: true }, headers: { "If-Match": String(crew.revision) } },
      ...members.map((member) => ({ path: `characters/${member.id}/undo`, body: undefined, headers: { "If-Match": String(member.revision) } })),
    ]);
    await succeeded(responses[0]!);
    for (const [index, member] of members.entries()) {
      const response = responses[index + 1]!;
      expect([200, 404, 409]).toContain(response.status);
      const result = await api.operation(response);
      if (!result.ok) expect(["NOT_FOUND", "STALE_REVISION"]).toContain(result.error?.code);
      expect.soft((await api.character(member.id)).dossier.crewId).toBe("");
      expect.soft(await history("characters", member.id)).toHaveLength(result.ok ? 1 : 2);
    }
  });
});
