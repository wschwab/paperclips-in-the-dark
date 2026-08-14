import { describe, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook } from "../../src/game-data.js";

// ---------------------------------------------------------------------------
// SC-O7 concurrency-token oracle (frozen against the Wave 2 contract:
// PAPERCLIPS.md §7.1 rule 2 — undo/delete/import-apply/repair-apply MUST send
// If-Match — and the openapi.yaml ifMatchRequired parameter + total-collection
// degraded deleteToken semantics, work spec "Degraded entities").
//
// All assertions target the RAW response body; the frozen decoders reject the
// current runtime's legacy shapes, so decoding would obscure the failure
// reason (see error-union.test.ts header).
//
// Red reasons (against the current source): If-Match is optional on undo and
// delete today (FV-019) so missing-header requests are accepted; import/repair
// apply routes do not exist; collections expose no degraded-row deleteToken;
// and STALE_REVISION errors carry no details.currentRevision. The
// no-write-on-stale guard (CONC-NOWRITE-006) passes already.
// ---------------------------------------------------------------------------

const BLADES = "blades-in-the-dark";

/** Runtime narrowing for JSON bodies: object and not an array. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function okFlag(body: unknown): boolean | null {
  const ok = asRecord(body)?.ok;
  return typeof ok === "boolean" ? ok : null;
}

async function createRawCharacter(): Promise<{ id: string; revision: number }> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  const character = asRecord(asRecord(response.body)?.character);
  const id = asString(character?.id);
  const revision = asNumber(character?.revision);
  if (response.status !== 200 || id === null) {
    throw new Error(
      `cannot seed character: HTTP ${response.status} ${JSON.stringify(response.body ?? response.rawBody).slice(0, 200)}`,
    );
  }
  return { id, revision: revision ?? 1 };
}

async function readCharacterRaw(id: string): Promise<string> {
  const response = await api.get(`characters/${id}`);
  expect(response.status, "character readable").toBe(200);
  return response.rawBody;
}

async function dataDir(): Promise<string> {
  const response = await api.get("health");
  const dataDirValue = asString(asRecord(response.body)?.dataDir);
  if (dataDirValue === null) throw new Error(`health returned no dataDir: HTTP ${response.status}`);
  return dataDirValue;
}

/** Write raw (unparseable) bytes for an entity; directory location is authoritative for its identity. */
async function writeDegraded(kind: "character" | "crew" | "clock", id: string, bytes: string): Promise<void> {
  const dir = resolve(await dataDir(), `${kind}s`, id);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "current.json"), bytes, "utf8");
}

function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

async function roster(): Promise<Record<string, unknown> | null> {
  const response = await api.get("campaign/roster");
  expect(response.status, "roster stays 200 (total collections)").toBe(200);
  return asRecord(response.body);
}

/** The degraded character row's deleteToken, or null when the row is missing it. */
async function degradedDeleteToken(id: string): Promise<string | null> {
  const body = await roster();
  const characters = body?.characters;
  if (!Array.isArray(characters)) return null;
  const row = asRecord(characters.find((candidate) => asRecord(candidate)?.id === id));
  const token = asString(row?.deleteToken);
  return token !== null && token.length > 0 ? token : null;
}

describe("contract concurrency tokens (SC-O7)", () => {
  testCase(
    "CONC-IFMATCH-001",
    "undo without If-Match is rejected with VALIDATION and writes nothing",
    async () => {
      // Missing If-Match is a missing required header → invalid inbound
      // request shape → 400 VALIDATION (work spec, stored-entity
      // classification; openapi.yaml ifMatchRequired on undoCharacter/undoCrew).
      const { id } = await createRawCharacter();
      await api.post(`characters/${id}/ops/note.add`, { text: "seed" });
      const before = await readCharacterRaw(id);

      const undone = await api.post(`characters/${id}/undo`);
      expect(undone.status, "undo without If-Match rejected").toBe(400);
      const error = asRecord(asRecord(undone.body)?.error);
      expect(error?.code).toBe("VALIDATION");

      const after = await readCharacterRaw(id);
      expect(after, "rejected undo wrote nothing").toBe(before);
    },
  );

  testCase(
    "CONC-IFMATCH-002",
    "delete without If-Match is rejected with VALIDATION and the entity survives",
    async () => {
      const { id } = await createRawCharacter();
      const deleted = await api.post(`characters/${id}/delete`, { confirm: true });
      expect(deleted.status, "delete without If-Match rejected").toBe(400);
      const error = asRecord(asRecord(deleted.body)?.error);
      expect(error?.code).toBe("VALIDATION");

      const survivor = await api.get(`characters/${id}`);
      expect(survivor.status, "entity survives the rejected delete").toBe(200);
    },
  );

  testCase(
    "CONC-IFMATCH-003",
    "import-apply and repair-apply without If-Match are rejected with VALIDATION",
    async () => {
      const { id, revision } = await createRawCharacter();
      const document = asRecord((await api.get(`characters/${id}`)).body);

      // Import apply requires If-Match (entity revision; degraded target: the
      // sha256 content token). Missing header → 400 VALIDATION, before any
      // preview-token/confirmation validation.
      const imported = await api.post(`characters/${id}/import`, {
        entity: document,
        previewToken: "preview-token",
        confirm: true,
      });
      expect(imported.status, "import apply without If-Match rejected").toBe(400);
      expect(asRecord(asRecord(imported.body)?.error)?.code).toBe("VALIDATION");

      // Repair apply: same required-header rule.
      const repaired = await api.post(`characters/${id}/repair`, { previewToken: "preview-token", confirm: true });
      expect(repaired.status, "repair apply without If-Match rejected").toBe(400);
      expect(asRecord(asRecord(repaired.body)?.error)?.code).toBe("VALIDATION");

      // Neither write happened.
      const after = asRecord((await api.get(`characters/${id}`)).body);
      expect(after?.revision).toBe(revision);
    },
  );

  testCase(
    "CONC-REV-004",
    "readable entity: current revision succeeds, stale revision → 409 STALE_REVISION with the current revision",
    async () => {
      const { id, revision } = await createRawCharacter();

      // Correct revision: the write succeeds.
      const winning = await api.post(`characters/${id}/ops/note.add`, { text: "win" }, { "If-Match": String(revision) });
      expect(winning.status).toBe(200);
      expect(okFlag(winning.body)).toBe(true);
      const currentRevision = revision + 1;

      // Stale revision: typed STALE_REVISION carrying the current revision.
      const stale = await api.post(`characters/${id}/ops/note.add`, { text: "lose" }, { "If-Match": String(revision) });
      expect(stale.status).toBe(409);
      const error = asRecord(asRecord(stale.body)?.error);
      expect(error?.code).toBe("STALE_REVISION");
      expect(error?.status).toBe(409);
      const details = asRecord(error?.details);
      expect(details?.currentRevision, "STALE_REVISION carries the current revision").toBe(currentRevision);
      expect(typeof error?.retryable, "retryable present").toBe("boolean");
      const recovery = asString(error?.recovery);
      expect(recovery, "recovery instruction present").not.toBeNull();
      if (recovery !== null) expect(recovery.length).toBeGreaterThan(0);
    },
  );

  testCase(
    "CONC-TOKEN-005",
    "degraded entity: the collection deleteToken works as If-Match; a stale token → 409 STALE_REVISION",
    async () => {
      // Stale-token case: bytes change under an old token → 409 with the new
      // raw-byte content token (work spec: "Deleting or repairing after the
      // bytes change returns 409 STALE_REVISION rather than acting on unseen
      // data"; token = sha256:<lowercase hex> of the current raw bytes).
      const staleId = "40000000-0000-4000-8000-000000000001";
      const bytesA = "corrupted bytes version A";
      const bytesB = "corrupted bytes version B (changed)";
      await writeDegraded("character", staleId, bytesA);
      const oldToken = await degradedDeleteToken(staleId);
      expect(oldToken, "roster exposes the degraded row's deleteToken").not.toBeNull();
      if (oldToken === null) return;
      expect(oldToken).toBe(`sha256:${sha256Hex(bytesA)}`);

      await writeDegraded("character", staleId, bytesB);
      const staleDelete = await api.post(`characters/${staleId}/delete`, { confirm: true }, { "If-Match": oldToken });
      expect(staleDelete.status, "delete with a stale content token rejected").toBe(409);
      const error = asRecord(asRecord(staleDelete.body)?.error);
      expect(error?.code).toBe("STALE_REVISION");
      const details = asRecord(error?.details);
      expect(details?.currentContentToken, "stale details carry the new raw-byte token").toBe(`sha256:${sha256Hex(bytesB)}`);

      // The entity is still there (bytes unchanged by the rejected delete).
      const stillDegraded = await api.get(`characters/${staleId}`);
      expect(stillDegraded.status, "rejected delete wrote nothing").not.toBe(200);

      // Success case: delete with the CURRENT deleteToken as If-Match.
      const freshId = "40000000-0000-4000-8000-000000000002";
      await writeDegraded("character", freshId, "garbage bytes for delete");
      const token = await degradedDeleteToken(freshId);
      expect(token, "deleteToken for the second degraded row").toMatch(/^sha256:[0-9a-f]{64}$/);
      if (token === null) return;
      const deleted = await api.post(`characters/${freshId}/delete`, { confirm: true }, { "If-Match": token });
      expect(deleted.status, "deleteToken as If-Match succeeds").toBe(200);
      expect(okFlag(deleted.body)).toBe(true);
      const gone = await api.get(`characters/${freshId}`);
      expect(gone.status, "deleted degraded entity is gone").toBe(404);
    },
  );

  testCase(
    "CONC-NOWRITE-006",
    "a failed concurrency check writes nothing (byte-identical entity afterwards)",
    async () => {
      const { id, revision } = await createRawCharacter();
      // Advance the revision so the original revision is stale.
      const advance = await api.post(`characters/${id}/ops/note.add`, { text: "advance" });
      expect(advance.status).toBe(200);
      const before = await readCharacterRaw(id);

      const stale = await api.post(
        `characters/${id}/ops/note.add`,
        { text: "should-not-land" },
        { "If-Match": String(revision) },
      );
      expect(stale.status, "stale If-Match rejected").toBe(409);
      const error = asRecord(asRecord(stale.body)?.error);
      expect(error?.code).toBe("STALE_REVISION");

      const after = await readCharacterRaw(id);
      expect(after, "rejected write left the stored bytes untouched").toBe(before);
    },
  );
});
