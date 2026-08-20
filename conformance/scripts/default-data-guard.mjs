#!/usr/bin/env node
// RV-00 default-data write guard.
//
// A byte guard over the shipped default game data (data/games/) that proves a
// run caused no default-data writes. It snapshots the guarded root before and
// after a child command, diffs the two snapshots, and:
//   - if any byte changed (added / removed / changed rows) it prints the diff
//     and exits 1 — a quarantine violation regardless of the child's outcome;
//   - if the bytes are unchanged it propagates the child's exit code, so a
//     clean child completes normally (0) and a failing child still fails.
//
// The guard is deliberately read-only: it never writes the root, only reads it.
// repoRootOf(scriptUrl) is factored out so tests can prove the two-levels-up
// rule with a synthetic URL; a missing manifest root yields an empty manifest
// (empty dirs/files), so a guard over a non-existent root trivially passes.
//
// Usage:
//   node conformance/scripts/default-data-guard.mjs -- <child...>
//   node conformance/scripts/default-data-guard.mjs --help
//
// Everything after `--` is the child command, run with inherited stdio and cwd
// = the repo root. With no `--` (or no child) it prints usage to stderr and
// exits 2. The guard root defaults to <repoRoot>/data/games.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The repo root is exactly two levels above the script dir
// (conformance/scripts/x.mjs -> conformance/ -> repo root). Factored out of the
// live entry so tests can prove the rule with a synthetic script URL.
export function repoRootOf(scriptUrl) {
  const scriptDir = dirname(fileURLToPath(scriptUrl));
  return resolve(scriptDir, "..", "..");
}

export const repoRoot = repoRootOf(import.meta.url);

// The guarded default-data root, resolved against the repo root so it holds
// whichever way the script is invoked.
export function defaultManifestRoot() {
  return join(repoRoot, "data", "games");
}

// ---------------------------------------------------------------------------
// Manifest snapshot
// ---------------------------------------------------------------------------

// Recursively collect directory rows and file rows under `root`. Rows are
// returned sorted. A file row carries only `size` and `sha256` (the byte guard
// contract); a directory row carries nothing else. A missing root (or any missing
// directory along the walk) contributes nothing — an empty manifest.
export async function snapshotRoot(root) {
  const dirs = [];
  const files = [];
  await collect(root, root, dirs, files);
  dirs.sort();
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { dirs, files };
}

async function collect(root, dir, dirs, files) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(root, abs);
    if (entry.isDirectory()) {
      dirs.push(rel);
      await collect(root, abs, dirs, files);
    } else {
      // Files and symlinks are leaves; a symlink is hashed through the link
      // (readFile follows). Keeps the walk deterministic with no recursion risk.
      const data = await readFile(abs);
      files.push({
        path: rel,
        size: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

// Compare two sorted snapshots and return sorted added / removed / changed rows.
// added/removed mix directory rows and file rows; changed only ever covers files
// (directories carry no bytes to differ on), tagged with the before/after bytes.
export function compareManifests(before, after) {
  const beforeDirs = new Set(before.dirs);
  const afterDirs = new Set(after.dirs);
  const beforeFiles = new Map(before.files.map((f) => [f.path, f]));
  const afterFiles = new Map(after.files.map((f) => [f.path, f]));

  const allPaths = sortedUnique([
    ...before.dirs,
    ...after.dirs,
    ...before.files.map((f) => f.path),
    ...after.files.map((f) => f.path),
  ]);

  const added = [];
  const removed = [];
  const changed = [];
  for (const path of allPaths) {
    const hadDir = beforeDirs.has(path);
    const hasDir = afterDirs.has(path);
    const beforeFile = beforeFiles.get(path);
    const afterFile = afterFiles.get(path);
    const had = hadDir || beforeFile !== undefined;
    const has = hasDir || afterFile !== undefined;
    if (!had) {
      added.push(
        hasDir
          ? { path, type: "dir" }
          : { path, type: "file", size: afterFile.size, sha256: afterFile.sha256 },
      );
    } else if (!has) {
      removed.push(
        hadDir
          ? { path, type: "dir" }
          : { path, type: "file", size: beforeFile.size, sha256: beforeFile.sha256 },
      );
    } else if (
      beforeFile !== undefined &&
      afterFile !== undefined &&
      (beforeFile.size !== afterFile.size || beforeFile.sha256 !== afterFile.sha256)
    ) {
      changed.push({
        path,
        type: "file",
        size: afterFile.size,
        sha256: afterFile.sha256,
        before: { size: beforeFile.size, sha256: beforeFile.sha256 },
      });
    }
  }

  added.sort(byPath);
  removed.sort(byPath);
  changed.sort(byPath);
  return { added, removed, changed };
}

const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// Unique, byte-sorted strings (paths) — deterministic diff regardless of readdir order.
function sortedUnique(values) {
  return [...new Set(values)].sort();
}

// ---------------------------------------------------------------------------
// Running the guard
// ---------------------------------------------------------------------------

// Spawn the real child with inherited stdio and the given cwd, resolving its exit
// code. A spawn error (e.g. ENOENT) is reported to stderr and counts as 1 so
// the guard still recomputes and reports any byte drift.
export function realChildRunner(child, cwd) {
  return new Promise((resolvePromise) => {
    const proc = spawn(child[0], child.slice(1), { stdio: "inherit", cwd });
    proc.on("error", (error) => {
      process.stderr.write(`default-data-guard: failed to spawn child: ${error.message}\n`);
      resolvePromise(1);
    });
    proc.on("exit", (code) => resolvePromise(code ?? 1));
  });
}

// Run the guard over `root`. The child runner is injectable so tests can drive the
// child without spawning (and never touch real data). If the child changed any bytes,
// print the diff and return 1; otherwise propagate the child's exit code.
export async function runGuard(root, child, { cwd, childRunner = realChildRunner } = {}) {
  const before = await snapshotRoot(root);
  const childCode = await childRunner(child, cwd);
  const after = await snapshotRoot(root);
  const diff = compareManifests(before, after);
  const changedCount =
    diff.added.length + diff.removed.length + diff.changed.length;
  if (changedCount === 0) return childCode;
  printDiff(diff);
  return 1;
}

function printDiff(diff) {
  process.stdout.write("[default-data-guard] WRITE GUARD VIOLATION: default data changed by child\n");
  for (const row of diff.removed) {
    const size = row.type === "file" ? ` (${row.size} bytes, ${row.sha256.slice(0, 12)}...)` : "";
    process.stdout.write(`  - removed ${row.path}${size}\n`);
  }
  for (const row of diff.added) {
    const size = row.type === "file" ? ` (${row.size} bytes, ${row.sha256.slice(0, 12)}...)` : "";
    process.stdout.write(`  + added   ${row.path}${size}\n`);
  }
  for (const row of diff.changed) {
    process.stdout.write(
      `  ~ changed ${row.path} (${row.before.size} bytes -> ${row.size} bytes, ` +
        `sha ${row.before.sha256.slice(0, 12)}... -> ${row.sha256.slice(0, 12)}...)\n`,
    );
  }
  process.stdout.write("[default-data-guard] default data restored; rerun or revert the child's write\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function usage() {
  return [
    "default-data-guard — RV-00 byte guard over the shipped default game data.",
    "",
    "Usage:",
    "  node conformance/scripts/default-data-guard.mjs [--] <child...>",
    "  node conformance/scripts/default-data-guard.mjs --help",
    "",
    "  --help     show this text and exit 0",
    "  --         separator; everything after it is the child command. Required.",
    "",
    "The guarded root defaults to <repoRoot>/data/games. The child runs with",
    "inherited stdio and cwd = the repo root. If the child's run changes any",
    "byte under the root, this guards exits 1 (a write-guard violation);",
    "otherwise it propagates the child's exit code. Missing root => empty manifest.",
    "",
  ].join("\n");
}

// "CLI requires `--` child": the separator and at least one child token. `--help`
// anywhere is honored over the child requirement.
export function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true, child: [] };
  }
  const idx = argv.indexOf("--");
  if (idx === -1) return { help: false, child: [] };
  return { help: false, child: argv.slice(idx + 1) };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  if (args.child.length === 0) {
    process.stderr.write(usage());
    return 2;
  }
  return runGuard(defaultManifestRoot(), args.child, {
    cwd: repoRoot,
    childRunner: realChildRunner,
  });
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().then((code) => {
    process.exitCode = code;
  });
}
