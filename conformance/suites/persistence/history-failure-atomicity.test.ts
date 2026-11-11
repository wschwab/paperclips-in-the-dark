import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { newCharacter, revisionHeader } from "../../src/suite-helpers.js";

// ---------------------------------------------------------------------------
// BUGFIX-1111 items 5 and 6 — history maintenance must never half-apply.
//
// Reported against a data directory on a filesystem that allows create, write
// and rename but refuses unlink (the Cowork sandbox mount):
//   * undo restored the entity, then returned 500 because the consumed
//     snapshot could not be deleted (item 5);
//   * retention failed every snapshot-worthy write once historyCount reached
//     48, and each failed attempt left one more snapshot file behind (item 6).
//
// The `test-hooks/fail-unlink` probe arms a one-shot unlink failure for one
// entity's history files, so both paths are reachable on a normal filesystem.
// ---------------------------------------------------------------------------

/** Snapshot files on disk (the sidecar index and the baseline are not snapshots). */
const snapshotFiles = async (dataDir: string, kind: "character" | "crew", id: string) => {
  const entries = await readdir(join(dataDir, `${kind}s`, id, "history")).catch(() => []);
  return entries.filter((name) => name.endsWith(".json") && name !== "_index.json" && !name.startsWith("00000000000000000-"));
};

const armUnlinkFailure = async (kind: "character" | "crew", id: string) => {
  const response = await api.post("test-hooks/fail-unlink", { entity: kind, id });
  // 501 means the target was not started with --test-hooks; the shared target
  // guard already refuses such a target, so this is a hard failure here.
  expect(response.status).toBe(204);
};

describe("persistence history failure atomicity", () => {
  testCase(
    "BUGFIX-1111-UNDO-001",
    "undo completes when the consumed snapshot cannot be unlinked, with history still matching disk",
    async () => {
      const character = await newCharacter();
      for (const text of ["a", "b", "c"]) {
        const result = await api.characterOp(character.id, "note.add", { text });
        expect(result.ok).toBe(true);
      }
      const before = await api.character(character.id);
      expect(before.dossier.notes).toEqual(["a", "b", "c"]);

      await armUnlinkFailure("character", character.id);
      const undo = await api.post(
        `characters/${character.id}/undo`,
        undefined,
        revisionHeader(before.revision),
      );

      // The restore happened, so the response must report it rather than a
      // server defect.
      expect(undo.status).toBe(200);
      const result = await api.operation(undo);
      expect(result.ok).toBe(true);
      expect(result.character?.dossier.notes).toEqual(["a", "b"]);
      expect(result.character?.revision).toBe(before.revision + 1);

      // The snapshot that could not be removed is retained, and the reported
      // history counts still describe the files that exist.
      const { dataDir } = await api.health();
      const files = await snapshotFiles(dataDir, "character", character.id);
      const history = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(history).toHaveLength(3);
      expect(history.map((entry) => entry.snapshotId).sort()).toEqual(files.map((name) => name.replace(/\.json$/, "")).sort());
      const summary = (await api.get("characters")).body as Array<{ id: string; historyCount: number }>;
      expect(summary.find((row) => row.id === character.id)?.historyCount).toBe(history.length);
    },
  );

  testCase(
    "BUGFIX-1111-PRUNE-001",
    "a retention failure does not block the snapshot-worthy write that triggered it",
    async () => {
      const character = await newCharacter();
      const { dataDir } = await api.health();
      for (let index = 0; index < 50; index += 1) {
        const result = await api.characterOp(character.id, "note.add", { text: `n${index}` });
        expect(result.ok).toBe(true);
      }
      const beforeArm = await snapshotFiles(dataDir, "character", character.id);

      // The next snapshot makes retention delete the oldest file; that delete
      // is what fails here.
      await armUnlinkFailure("character", character.id);
      const write = await api.characterOp(character.id, "note.add", { text: "n50" });

      expect(write.ok).toBe(true);
      const current = await api.character(character.id);
      expect(current.revision).toBe(character.revision + 51);
      expect(current.dossier.notes).toHaveLength(51);

      // Retention could not remove anything, so nothing was dropped and the
      // reported history still matches the files that exist.
      const files = await snapshotFiles(dataDir, "character", character.id);
      const history = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(files).toHaveLength(beforeArm.length + 1);
      expect(history).toHaveLength(files.length);
      expect(history[0]?.op).toBe("note.add");
    },
  );

  testCase(
    "BUGFIX-1111-WRITE-001",
    "a failed entity write leaves no snapshot file behind",
    async () => {
      const character = await newCharacter();
      const { dataDir } = await api.health();
      expect(await snapshotFiles(dataDir, "character", character.id)).toEqual([]);

      const hook = await api.post("test-hooks/crash-mid-write", { entity: "character", id: character.id });
      expect(hook.status).toBe(204);
      const write = await api.post(`characters/${character.id}/ops/note.add`, { text: "never lands" });
      expect(write.status).toBe(500);

      // Nothing landed, so nothing may be recorded: no snapshot file, no
      // history entry, no revision bump.
      expect(await snapshotFiles(dataDir, "character", character.id)).toEqual([]);
      const history = await decode(Schemas.History, (await api.get(`characters/${character.id}/history`)).body);
      expect(history).toEqual([]);
      const current = await api.character(character.id);
      expect(current.revision).toBe(character.revision);
      expect(current.dossier.notes).toEqual([]);
    },
  );
});
