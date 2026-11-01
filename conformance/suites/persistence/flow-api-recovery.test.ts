import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { firstPlaybook } from "../../src/game-data.js";
import { testCase } from "../../src/test-case.js";
import { validateOrThrow } from "../../src/contract-validator.js";

// Deliberately isolated: this oracle kills its managed server between cycles.
// FLOW_RECOVERY_ORACLE=1 npm run test:ada -- --cycles 2 -- run suites/persistence/flow-api-recovery.test.ts
// The ordinary full suite skips it; never arm it against the human's live data.
type Json = Record<string, any>;
interface Memo { character: Json; crew: Json; body: Json; }
async function post(path: string, body: unknown, revision?: number): Promise<Json> {
  const response = await api.post(path, body, revision === undefined ? {} : { "If-Match": String(revision) });
  expect(response.status).toBe(200);
  expect((response.body as Json).ok).toBe(true);
  return response.body as Json;
}

describe.skipIf(process.env.FLOW_RECOVERY_ORACLE !== "1")("FLOW-API-01 managed transaction crash/restart", () => {
  testCase("FLOW-API-RECOVERY-001", "crew-publication crash recovers the character, crew, cursor and durable receipt together, without replay awards", async () => {
    const health = await api.get("health");
    expect(health.status).toBe(200);
    const dataDir = (health.body as Json).dataDir;
    expect(typeof dataDir).toBe("string");
    // Canonical launcher creates a dedicated /tmp/pitd-managed/<run>/data.
    // Refuse a surprising data directory even with the explicit opt-in.
    expect(resolve(dataDir)).toMatch(/^\/tmp\/pitd-managed\/[^/]+\/data$/);
    const path = join(dataDir, ".flow-api-recovery-oracle.json");
    let memo: Memo | null = null;
    try { memo = JSON.parse(await readFile(path, "utf8")) as Memo; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (memo === null) {
      const stem = "blades-in-the-dark";
      let character = (await post("characters", { gameStem: stem, playbook: firstPlaybook(stem) })).character;
      const crew = (await post("crews", { gameStem: stem, crewType: "Assassins" })).crew;
      character = (await post(`characters/${character.id}/ops/dossier.update`, { crewId: crew.id }, character.revision)).character;
      character = (await post(`characters/${character.id}/ops/mode.flow.set`, { kind: "resolution", step: "payoff" }, character.revision)).character;
      const projected = await api.get(`characters/${character.id}/flow`);
      expect(projected.status).toBe(200);
      validateOrThrow("flow", projected.body);
      const view = projected.body as Json;
      const body = { completionId: randomUUID(), instanceId: view.instanceId, kind: view.kind, step: view.step, inputs: { crewRevision: crew.revision, crewCoin: 1, myShare: 1 } };
      await writeFile(path, JSON.stringify({ character, crew, body } satisfies Memo));
      const hook = await api.post("test-hooks/crash-mid-write", { entity: "crew", id: crew.id });
      expect(hook.status).toBe(204);
      let disconnected = false;
      try {
        await api.post(`characters/${character.id}/ops/flow.step.complete`, body, { "If-Match": String(character.revision) });
      } catch { disconnected = true; }
      expect(disconnected, "the fault seam must stop the process after publishing character but before crew").toBe(true);
      return; // canonical --cycles 2 now restarts the same managed data directory.
    }
    const character = await api.get(`characters/${memo.character.id}`);
    const crew = await api.get(`crews/${memo.crew.id}`);
    expect(character.status).toBe(200);
    expect(crew.status).toBe(200);
    validateOrThrow("character", character.body);
    validateOrThrow("crew", crew.body);
    expect((character.body as Json).modeFlow).toEqual({ kind: "resolution", step: "heat" });
    expect((character.body as Json).fund.satchel.coins).toBe(memo.character.fund.satchel.coins + 1);
    expect((crew.body as Json).coin).toBe(memo.crew.coin + 1);
    const replay = await api.post(`characters/${memo.character.id}/ops/flow.step.complete`, memo.body, { "If-Match": String(memo.character.revision) });
    expect(replay.status).toBe(200);
    validateOrThrow("operationResult", replay.body);
    expect((replay.body as Json).receipt).toMatchObject({ completionId: memo.body.completionId, status: "completed" });
    expect((await api.get(`characters/${memo.character.id}`)).rawBody).toBe(character.rawBody);
    expect((await api.get(`crews/${memo.crew.id}`)).rawBody).toBe(crew.rawBody);
    await unlink(path);
  });
});
