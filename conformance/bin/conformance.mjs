#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args[0] !== "run") {
  console.error("usage: conformance run --against <url> --report json");
  process.exit(2);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const reportFormat = valueAfter("--report");
if (reportFormat !== "json") {
  console.error("only --report json is supported");
  process.exit(2);
}
const against = valueAfter("--against") ?? process.env.BASE_URL ?? "http://localhost:9657";
const work = mkdtempSync(resolve(tmpdir(), "pitd-conformance-"));
const output = resolve(work, "vitest.json");
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const child = spawnSync(process.execPath, [vitest, "run", "--reporter=json", `--outputFile=${output}`], {
  cwd: root,
  env: { ...process.env, BASE_URL: against, CONFORMANCE_BASE_URL: against },
  encoding: "utf8",
});

let raw;
try {
  raw = JSON.parse(readFileSync(output, "utf8"));
} catch (error) {
  console.error(child.stderr || child.stdout || `Vitest did not produce JSON: ${String(error)}`);
  rmSync(work, { recursive: true, force: true });
  process.exit(1);
}

const idPattern = /\[([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\]/;
const results = [];
for (const file of raw.testResults ?? []) {
  for (const assertion of file.assertionResults ?? []) {
    const name = assertion.fullName ?? assertion.title ?? "unnamed test";
    const match = idPattern.exec(name);
    if (!match) {
      console.error(`Test is missing a stable ID: ${name}`);
      rmSync(work, { recursive: true, force: true });
      process.exit(1);
    }
    const status = assertion.status === "passed"
      ? "passed"
      : assertion.status === "pending" || assertion.status === "skipped"
        ? "skipped"
        : assertion.status === "todo"
          ? "todo"
          : "failed";
    const failure = assertion.failureMessages?.join("\n");
    results.push({
      id: match[1],
      name,
      suite: file.name ?? "unknown",
      status,
      durationMs: assertion.duration ?? null,
      ...(status === "failed" && failure ? { error: failure } : {}),
    });
  }
}
results.sort((left, right) => left.id.localeCompare(right.id));
const report = {
  schemaVersion: 1,
  against,
  results,
  summary: {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    todo: results.filter((result) => result.status === "todo").length,
  },
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
rmSync(work, { recursive: true, force: true });
process.exitCode = child.status ?? 1;
