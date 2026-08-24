// Shared frontend freshness + build helper (Wave-5 review fix).
//
// Freshness rule: vite build rewrites every output, so dist/index.html's mtime
// approximates the last build time. Rebuild when that marker is missing or
// older than ANY source input (frontend/src recursively, index.html,
// tsconfig.json, package.json, vite config). Documented tradeoff: a
// touched-but-semantically identical source file triggers one extra build; a
// stale dist never goes unnoticed. Used by browser-suite.mjs (BROWSER-01) and
// dataset-benchmark.mjs (PERF-01) so both benchmark the current frontend.

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const conformanceDir = resolve(scriptDir, "..", "..");
const repoRoot = resolve(conformanceDir, "..");
export const frontendDir = join(repoRoot, "frontend");

async function newestMtimeUnder(dir) {
  let newest = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue; // vanished mid-scan; treat as no signal
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

export async function frontendDistIsFresh() {
  const marker = join(frontendDir, "dist", "index.html");
  if (!existsSync(marker)) return false;
  const builtAt = statSync(marker).mtimeMs;
  const srcNewest = await newestMtimeUnder(join(frontendDir, "src"));
  let configNewest = 0;
  for (const name of ["index.html", "package.json", "tsconfig.json"]) {
    const full = join(frontendDir, name);
    if (existsSync(full)) configNewest = Math.max(configNewest, statSync(full).mtimeMs);
  }
  for (const name of await readdir(frontendDir)) {
    if (/^vite\.config\./.test(name)) {
      configNewest = Math.max(configNewest, statSync(join(frontendDir, name)).mtimeMs);
    }
  }
  return builtAt >= Math.max(srcNewest, configNewest);
}

export async function buildFrontend(logPrefix = "[frontend-fresh]") {
  console.log(`${logPrefix} building frontend (npm run build in frontend/)…`);
  // Prefer the invoking npm's own CLI (npm_execpath is set inside `npm run`),
  // so this works even when no npm shim directory is on PATH.
  const npmExecpath = process.env.npm_execpath;
  const command = npmExecpath ? [process.execPath, npmExecpath] : ["npm"];
  execFileSync(command[0], [...command.slice(1), "run", "build"], {
    cwd: frontendDir,
    stdio: "inherit",
  });
}

/** Ensure dist is current; returns true when a build was performed. */
export async function ensureFreshFrontendBuild(logPrefix = "[frontend-fresh]", force = false) {
  if (force || !(await frontendDistIsFresh())) {
    await buildFrontend(logPrefix);
    return true;
  }
  return false;
}
