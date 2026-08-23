import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  repoRootOf,
  repoRoot,
  defaultManifestRoot,
  snapshotRoot,
  compareManifests,
  buildCampaignManifest,
  parseArgs,
  usage,
  runGuard,
} from "../scripts/default-data-guard.mjs";

// ---------------------------------------------------------------------------
// RV-00 default-data write guard tooling tests. Everything is temp-only: fixtures
// are built under os.tmpdir() and removed after each test. The real data/games
// tree is only ever read to prove defaultManifestRoot/repoRootOf resolve to it; it
// is never written, listed as a fixture, or hashed for an assertion.
// ---------------------------------------------------------------------------

const sha = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "default-data-guard-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("RV-00 default-data guard", () => {
  it("[TOOLING-DG-001] repoRootOf is exactly two levels above the script dir (synthetic URL)", () => {
    // /a/b/c/d/scripts/x.mjs -> /a/b/c (two levels up)
    const root = repoRootOf(new URL("file:///a/b/c/d/scripts/x.mjs"));
    expect(root).toBe(resolve("/a/b/c"));
    const flat = repoRootOf("file:///repo/conformance/scripts/y.mjs");
    expect(flat).toBe(resolve("/repo"));
  });

  it("[TOOLING-DG-002] repoRoot and defaultManifestRoot resolve the real script location", () => {
    // The module lives at <repoRoot>/conformance/scripts/default-data-guard.mjs, so
    // repoRoot is two levels above it. This test lives two levels below the same root
    // (conformance/src), so the two must agree on the repo root.
    const testRepoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
    expect(resolve(repoRoot)).toBe(testRepoRoot);
    // The guarded default-data root is campaign-data under the repo root (AUDIT-0:
    // user-owned campaign state, not the shipped data/games).
    expect(defaultManifestRoot()).toBe(resolve(repoRoot, "campaign-data"));
  });

  it("[TOOLING-DG-003] snapshotRoot of a missing root is an empty manifest", async () => {
    const missing = join(tmp, "does-not-exist");
    const manifest = await snapshotRoot(missing);
    expect(manifest).toEqual({
      dirs: [],
      files: [],
      summary: {
        exists: false,
        totalFiles: 0,
        totalBytes: 0,
        collections: { characters: 0, crews: 0, clocks: 0 },
      },
    });
  });

  it("[TOOLING-DG-004] snapshotRoot walks recursively with sorted dir/file rows; file rows carry only size+sha256", async () => {
    const root = join(tmp, "tree");
    await mkdir(join(root, "sub", "deeper"), { recursive: true });
    await writeFile(join(root, "b.txt"), "beta");
    await writeFile(join(root, "a.json"), "{}");
    await writeFile(join(root, "sub", "c.json"), "1234567890");

    const manifest = await snapshotRoot(root);

    expect(manifest.dirs).toEqual(["sub", "sub/deeper"]);
    expect(manifest.files.map((f) => f.path)).toEqual(["a.json", "b.txt", "sub/c.json"]);
    expect(manifest.files).toContainEqual({
      path: "a.json",
      size: 2,
      sha256: sha("{}"),
    });
    expect(manifest.files).toContainEqual({
      path: "b.txt",
      size: 4,
      sha256: sha("beta"),
    });
    expect(manifest.files).toContainEqual({
      path: "sub/c.json",
      size: 10,
      sha256: sha("1234567890"),
    });
    // Every file row is exactly { path, size, sha256 } — nothing else.
    for (const file of manifest.files) {
      expect(Object.keys(file).sort()).toEqual(["path", "sha256", "size"]);
    }
  });

  it("[TOOLING-DG-005] compareManifests of identical manifests is empty", () => {
    const m = {
      dirs: ["a", "b"],
      files: [
        { path: "a/one", size: 1, sha256: "x".repeat(64) },
        { path: "b/two", size: 2, sha256: "y".repeat(64) },
      ],
      summary: { exists: true, totalFiles: 2, totalBytes: 3, collections: { characters: 0, crews: 0, clocks: 0 } },
    };
    const diff = compareManifests(m, m);
    expect(diff).toEqual({ added: [], removed: [], changed: [] });
  });

  it("[TOOLING-DG-006] compareManifests reports sorted added/removed/changed rows", () => {
    const before = {
      dirs: ["keep", "gone"],
      files: [
        { path: "keep/a", size: 1, sha256: "a".repeat(64) },
        { path: "gone/b", size: 2, sha256: "b".repeat(64) },
        { path: "keep/c", size: 3, sha256: "c".repeat(64) },
      ],
      summary: { exists: true, totalFiles: 3, totalBytes: 6, collections: { characters: 0, crews: 0, clocks: 0 } },
    };
    const after = {
      dirs: ["keep", "newdir"],
      files: [
        { path: "keep/a", size: 1, sha256: "a".repeat(64) },
        { path: "keep/c", size: 99, sha256: "z".repeat(64) },
        { path: "newdir/d", size: 4, sha256: "d".repeat(64) },
      ],
      summary: { exists: true, totalFiles: 3, totalBytes: 104, collections: { characters: 0, crews: 0, clocks: 0 } },
    };
    const diff = compareManifests(before, after);
    expect(diff.added).toEqual([{ path: "newdir", type: "dir" }, { path: "newdir/d", type: "file", size: 4, sha256: "d".repeat(64) }]);
    expect(diff.removed).toEqual([{ path: "gone", type: "dir" }, { path: "gone/b", type: "file", size: 2, sha256: "b".repeat(64) }]);
    expect(diff.changed).toEqual([
      {
        path: "keep/c",
        type: "file",
        size: 99,
        sha256: "z".repeat(64),
        before: { size: 3, sha256: "c".repeat(64) },
      },
    ]);
  });

  it("[TOOLING-DG-006a] compareManifests reports file-directory replacements as removed plus added", () => {
    const fileBefore = {
      dirs: [],
      files: [{ path: "shape", size: 2, sha256: sha("{}") }],
      summary: { exists: true, totalFiles: 1, totalBytes: 2, collections: { characters: 0, crews: 0, clocks: 0 } },
    };
    const dirAfter = {
      dirs: ["shape"],
      files: [{ path: "shape/child", size: 1, sha256: sha("x") }],
      summary: { exists: true, totalFiles: 1, totalBytes: 1, collections: { characters: 0, crews: 0, clocks: 0 } },
    };
    expect(compareManifests(fileBefore, dirAfter)).toEqual({
      added: [
        { path: "shape", type: "dir" },
        { path: "shape/child", type: "file", size: 1, sha256: sha("x") },
      ],
      removed: [{ path: "shape", type: "file", size: 2, sha256: sha("{}") }],
      changed: [],
    });
    expect(compareManifests(dirAfter, fileBefore)).toEqual({
      added: [{ path: "shape", type: "file", size: 2, sha256: sha("{}") }],
      removed: [
        { path: "shape", type: "dir" },
        { path: "shape/child", type: "file", size: 1, sha256: sha("x") },
      ],
      changed: [],
    });
  });

  it("[TOOLING-DG-007] parseArgs requires -- child and honors --help", () => {
    expect(parseArgs(["--", "echo", "hi"])).toEqual({ help: false, child: ["echo", "hi"] });
    expect(parseArgs(["--"])).toEqual({ help: false, child: [] });
    expect(parseArgs(["echo", "hi"])).toEqual({ help: false, child: [] });
    expect(parseArgs(["--help"])).toEqual({ help: true, child: [] });
    expect(parseArgs(["-h"])).toEqual({ help: true, child: [] });
  });

  it("[TOOLING-DG-008] usage() documents the CLI", () => {
    const text = usage();
    expect(text).toContain("default-data-guard");
    expect(text).toContain("--help");
    expect(text).toContain("--");
  });

  it("[TOOLING-DG-009] runGuard propagates the child code when bytes are unchanged", async () => {
    const root = join(tmp, "stable");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "one.json"), "{}");

    const child = ["noop", "arg"];
    let sawChild: unknown = null;
    const runner = async (c: string[], cwd: string) => {
      sawChild = { c, cwd };
      return 7;
    };
    const code = await runGuard(root, child, { cwd: "/cwd", childRunner: runner });
    expect(code).toBe(7);
    expect(sawChild).toEqual({ c: child, cwd: "/cwd" });
  });

  it("[TOOLING-DG-010] runGuard compares after a child failure (unchanged propagates the failed code)", async () => {
    const root = join(tmp, "stable-fail");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "one.json"), "{}");

    const runner = async () => 42;
    const code = await runGuard(root, ["x"], { childRunner: runner });
    expect(code).toBe(42);
  });

  it("[TOOLING-DG-011] runGuard returns 1 when the child changed a byte (write-guard violation)", async () => {
    const root = join(tmp, "mutable");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "one.json"), "{}");

    const runner = async () => {
      await writeFile(join(root, "one.json"), "{ \"changed\": true }");
      return 0;
    };
    const code = await runGuard(root, ["x"], { childRunner: runner });
    expect(code).toBe(1);
  });

  it("[TOOLING-DG-012] runGuard returns 1 when the child adds or removes a row", async () => {
    const root = join(tmp, "rows");
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "sub", "a.json"), "{}");

    let added = true;
    const runner = async () => {
      if (added) {
        await writeFile(join(root, "sub", "new.json"), "x");
      } else {
        await rm(join(root, "sub", "a.json"));
        await rm(join(root), { recursive: true });
      }
      return 0;
    };
    expect(await runGuard(root, ["x"], { childRunner: runner })).toBe(1);

    added = false;
    expect(await runGuard(root, ["x"], { childRunner: runner })).toBe(1);
  });
  it("[TOOLING-DG-013] snapshotRoot records existence, totals, and collection counts", async () => {
    const root = join(tmp, "tree");
    await mkdir(join(root, "characters", "c1"), { recursive: true });
    await mkdir(join(root, "crews", "x"), { recursive: true });
    await mkdir(join(root, "clocks", "k1"), { recursive: true });
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "characters", "c1", "a.json"), "{}");
    await writeFile(join(root, "crews", "x", "g.json"), "{}");
    await writeFile(join(root, "sub", "d.json"), "123");
    const manifest = await snapshotRoot(root);
    expect(manifest.summary.exists).toBe(true);
    expect(manifest.summary.totalFiles).toBe(3);
    expect(manifest.summary.totalBytes).toBe(7); // 2 + 2 + 3
    expect(manifest.summary.collections.characters).toBe(1);
    expect(manifest.summary.collections.crews).toBe(1);
    expect(manifest.summary.collections.clocks).toBe(1);
  });

  it("[TOOLING-DG-014] runGuard returns 1 when the child renames a file", async () => {
    const root = join(tmp, "renames");
    await mkdir(join(root, "crews"), { recursive: true });
    await writeFile(join(root, "crews", "a.json"), "{}");
    const runner = async () => {
      await rename(join(root, "crews", "a.json"), join(root, "crews", "b.json"));
      return 0;
    };
    expect(await runGuard(root, ["x"], { childRunner: runner })).toBe(1);
  });

  it("[TOOLING-DG-015] runGuard returns 1 when the guard root transitions absent to present", async () => {
    const root = join(tmp, "absent-present");
    const runner = async () => {
      await mkdir(root, { recursive: true });
      await writeFile(join(root, "created.json"), "{}");
      return 0;
    };
    expect(await runGuard(root, ["x"], { childRunner: runner })).toBe(1);
  });

  it("[TOOLING-DG-015a] runGuard detects empty absent-present and present-absent root transitions", async () => {
    const absentRoot = join(tmp, "empty-absent-present");
    expect(await runGuard(absentRoot, ["x"], {
      childRunner: async () => {
        await mkdir(absentRoot);
        return 0;
      },
    })).toBe(1);

    const presentRoot = join(tmp, "empty-present-absent");
    await mkdir(presentRoot);
    expect(await runGuard(presentRoot, ["x"], {
      childRunner: async () => {
        await rm(presentRoot, { recursive: true });
        return 0;
      },
    })).toBe(1);
  });

  it("[TOOLING-DG-015b] runGuard detects file-directory and directory-file replacements", async () => {
    const fileToDirectoryRoot = join(tmp, "file-to-directory");
    const fileToDirectory = join(fileToDirectoryRoot, "shape");
    await mkdir(fileToDirectoryRoot);
    await writeFile(fileToDirectory, "{}");
    expect(await runGuard(fileToDirectoryRoot, ["x"], {
      childRunner: async () => {
        await rm(fileToDirectory);
        await mkdir(fileToDirectory);
        await writeFile(join(fileToDirectory, "child"), "x");
        return 0;
      },
    })).toBe(1);

    const directoryToFileRoot = join(tmp, "directory-to-file");
    const directoryToFile = join(directoryToFileRoot, "shape");
    await mkdir(directoryToFile, { recursive: true });
    await writeFile(join(directoryToFile, "child"), "x");
    expect(await runGuard(directoryToFileRoot, ["x"], {
      childRunner: async () => {
        await rm(directoryToFile, { recursive: true });
        await writeFile(directoryToFile, "{}");
        return 0;
      },
    })).toBe(1);
  });

  it("[TOOLING-DG-016] buildCampaignManifest records exact sorted rows, totals, counts, timestamp, and human-review pollution wording", async () => {
    const root = join(tmp, "manifest");
    await mkdir(join(root, "crews", "crew-1"), { recursive: true });
    await mkdir(join(root, "characters", "char-1"), { recursive: true });
    await mkdir(join(root, "characters", "char-2"), { recursive: true });
    await mkdir(join(root, "archive", "characters", "decoy"), { recursive: true });
    await mkdir(join(root, "clocks", "clock-1"), { recursive: true });
    await mkdir(join(root, "misc", "nested"), { recursive: true });
    await writeFile(join(root, "z.txt"), "1234");
    await writeFile(join(root, "characters", "char-1", "current.json"), "{}");
    await writeFile(join(root, "characters", "char-2", "current.json"), "{}");
    await writeFile(join(root, "archive", "characters", "decoy", "current.json"), "{}");
    await writeFile(join(root, "crews", "crew-1", "current.json"), "abc");
    await writeFile(join(root, "misc", "nested", "note.txt"), "12");

    const manifest = await buildCampaignManifest(root, { timestamp: "fixed-time" });

    expect(manifest.artifact).toBe("campaign-data-manifest");
    expect(manifest.timestamp).toBe("fixed-time");
    expect(manifest.root).toBe(root);
    expect(manifest.exists).toBe(true);
    expect(manifest.totalFiles).toBe(6);
    expect(manifest.totalBytes).toBe(15);
    expect(manifest.collections).toEqual({ characters: 2, crews: 1, clocks: 1 });
    expect(manifest.dirs).toEqual([
      "archive", "archive/characters", "archive/characters/decoy", "characters",
      "characters/char-1", "characters/char-2", "clocks", "clocks/clock-1",
      "crews", "crews/crew-1", "misc", "misc/nested",
    ]);
    expect(manifest.files).toEqual([
      { path: "archive/characters/decoy/current.json", size: 2, sha256: sha("{}") },
      { path: "characters/char-1/current.json", size: 2, sha256: sha("{}") },
      { path: "characters/char-2/current.json", size: 2, sha256: sha("{}") },
      { path: "crews/crew-1/current.json", size: 3, sha256: sha("abc") },
      { path: "misc/nested/note.txt", size: 2, sha256: sha("12") },
      { path: "z.txt", size: 4, sha256: sha("1234") },
    ]);
    expect(manifest.suspectedPollution).toHaveLength(4);
    for (const row of manifest.suspectedPollution) {
      expect(row.reason).toMatch(/human review/i);
      expect(row.reason).not.toMatch(/safe to delete/i);
    }
  });

  it("[TOOLING-DG-016a] defaultManifestRoot is stable across a read-only no-op child", async () => {
    const root = defaultManifestRoot();
    const before = await buildCampaignManifest(root, { timestamp: "fixed-time" });
    const code = await runGuard(root, ["noop"], { childRunner: async () => 0 });
    const after = await buildCampaignManifest(root, { timestamp: "fixed-time" });
    expect(code).toBe(0);
    expect(after).toEqual(before);
  });

  it("[TOOLING-DG-017] buildCampaignManifest records a present root becoming absent", async () => {
    const root = join(tmp, "present-absent");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "before.json"), "{}");
    expect((await buildCampaignManifest(root, { timestamp: "before" })).exists).toBe(true);
    await rm(root, { recursive: true });
    expect(await buildCampaignManifest(root, { timestamp: "after" })).toEqual({
      artifact: "campaign-data-manifest", timestamp: "after", root, exists: false,
      totalFiles: 0, totalBytes: 0, collections: { characters: 0, crews: 0, clocks: 0 },
      files: [], dirs: [], suspectedPollution: [],
    });
  });

});
