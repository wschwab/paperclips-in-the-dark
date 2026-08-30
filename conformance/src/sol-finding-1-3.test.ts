// @vitest-environment node
/**
 * SOL-FINDING-1-3: Tooling tests for the isolation/default-data guard
 * wrapping fix (Finding 1) and the full-result artifact schema fix (Finding 3).
 *
 * RED: All tests below fail against the current code (before the fix).
 * GREEN: All tests pass after the implementation changes.
 */
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkCommand as guardCheckCommand } from "../scripts/workflow-isolation-guard.mjs";
import {
  writeMutationArtifact,
  buildCampaignArtifact,
  sourceRevision,
} from "../scripts/mutation-harness.mjs";

async function fixtureDir() {
  const root = await mkdtemp(join(tmpdir(), "pitd-sol-finding-"));
  return { root };
}

describe("SOL finding 1 — isolation guard wraps all entrypoints", () => {
  it("[TOOLING-SOL-001] checkCommand accepts node invoking managed-browser-smoke.mjs", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/managed-browser-smoke.mjs", "--", "cmd"]);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("managed launcher");
  });

  it("[TOOLING-SOL-002] checkCommand accepts a bare managed-browser-smoke.mjs path", () => {
    const result = guardCheckCommand(["conformance/scripts/managed-browser-smoke.mjs", "--", "cmd"]);
    expect(result.ok).toBe(true);
  });

  it("[TOOLING-SOL-003] checkCommand rejects a lookalike managed-browser-smoke script", () => {
    const result = guardCheckCommand(["conformance/scripts/managed-browser-smoke-lookalike.mjs", "--", "cmd"]);
    expect(result.ok).toBe(false);
  });
});

describe("SOL finding 1b — guard wraps browser/mutation/benchmark entrypoints", () => {
  it("[TOOLING-SOL-004a] checkCommand accepts internal harness: browser-suite.mjs", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/browser-suite.mjs"]);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("internal harness");
  });

  it("[TOOLING-SOL-004b] checkCommand accepts internal harness: mutation-harness.mjs", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/mutation-harness.mjs"]);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("internal harness");
  });

  it("[TOOLING-SOL-004c] checkCommand accepts internal harness: dataset-benchmark.mjs", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/dataset-benchmark.mjs"]);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("internal harness");
  });

  it("[TOOLING-SOL-004d] checkCommand rejects a lookalike harness script", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/mutation-harness-lookalike.mjs"]);
    expect(result.ok).toBe(false);
  });

  it("[TOOLING-SOL-004e] test:browser script path invokes guard around browser-suite.mjs", () => {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    const browserScript = pkg.scripts["test:browser"];
    expect(browserScript).toContain("workflow-isolation-guard.mjs");
    expect(browserScript).toContain("default-data-guard.mjs");
    expect(browserScript).toContain("browser-suite.mjs");
  });

  it("[TOOLING-SOL-004f] test:mutation script path invokes guard around mutation-harness.mjs", () => {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    const mutationScript = pkg.scripts["test:mutation"];
    expect(mutationScript).toContain("workflow-isolation-guard.mjs");
    expect(mutationScript).toContain("default-data-guard.mjs");
    expect(mutationScript).toContain("mutation-harness.mjs");
  });

  it("[TOOLING-SOL-004g] test:benchmark script path invokes guard around dataset-benchmark.mjs", () => {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    const benchScript = pkg.scripts["test:benchmark"];
    expect(benchScript).toContain("workflow-isolation-guard.mjs");
    expect(benchScript).toContain("default-data-guard.mjs");
    expect(benchScript).toContain("dataset-benchmark.mjs");
  });
});



describe("SOL finding 1c — guard rejects caller-provided --child bypass", () => {
  it("[TOOLING-SOL-008a] checkCommand rejects --child on browser-suite.mjs (bypass via npm run test:browser -- --child)", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/browser-suite.mjs", "--child"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("--child");
  });

  it("[TOOLING-SOL-008b] checkCommand rejects bare browser-suite.mjs --child", () => {
    const result = guardCheckCommand(["conformance/scripts/browser-suite.mjs", "--child"]);
    expect(result.ok).toBe(false);
  });

  it("[TOOLING-SOL-008c] checkCommand rejects --child on dataset-benchmark.mjs (bypass via npm run test:benchmark -- --child)", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/dataset-benchmark.mjs", "--child"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("--child");
  });

  it("[TOOLING-SOL-008d] checkCommand rejects bare dataset-benchmark.mjs --child", () => {
    const result = guardCheckCommand(["conformance/scripts/dataset-benchmark.mjs", "--child"]);
    expect(result.ok).toBe(false);
  });

  it("[TOOLING-SOL-008e] checkCommand rejects internal-only env (BASE_URL) on browser-suite.mjs", () => {
    const result = guardCheckCommand(
      ["node", "conformance/scripts/browser-suite.mjs"],
      { env: { BASE_URL: "http://127.0.0.1:9999" } },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("BASE_URL");
  });

  it("[TOOLING-SOL-008f] checkCommand rejects internal-only env (PITD_DATA_DIR) on dataset-benchmark.mjs", () => {
    const result = guardCheckCommand(
      ["node", "conformance/scripts/dataset-benchmark.mjs"],
      { env: { PITD_DATA_DIR: "/tmp/pitd-managed/fake" } },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("PITD_DATA_DIR");
  });

  it("[TOOLING-SOL-008g] checkCommand accepts browser-suite.mjs WITHOUT --child (normal path)", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/browser-suite.mjs"]);
    expect(result.ok).toBe(true);
  });

  it("[TOOLING-SOL-008h] checkCommand accepts dataset-benchmark.mjs WITHOUT internal-only env (normal path)", () => {
    const result = guardCheckCommand(["node", "conformance/scripts/dataset-benchmark.mjs"]);
    expect(result.ok).toBe(true);
  });
});

describe("SOL finding 2 — mutation provenance identifies clean baseline", () => {
  it("[TOOLING-SOL-006a] buildCampaignArtifact uses passed revision, not sourceRevision()", () => {
    const result = buildCampaignArtifact({
      results: [],
      baselines: [{ green: true }],
      seeds: { name: "seed-defaults", trees: [] },
      catalogIds: [],
      command: { cmd: "npm run test:mutation", cwd: "/repo", timeout: 600000 },
      environment: { node: "v22.0.0", platform: "linux" },
      revision: "clean-baseline-rev",
      rawOutputPath: "mutation-raw-test.txt",
    });
    expect(result.revision).toBe("clean-baseline-rev");
    expect(result.revision).not.toBe("unknown");
  });

  it("[TOOLING-SOL-006b] sourceRevision returns a non-empty string", () => {
    const rev = sourceRevision();
    expect(typeof rev).toBe("string");
    expect(rev.length).toBeGreaterThan(0);
  });
});

describe("SOL finding 3 — mutation full-results artifact schema", () => {
  it("[TOOLING-SOL-004] buildCampaignArtifact includes all required schema fields", async () => {
    const result = buildCampaignArtifact({
      results: [
        {
          id: "M01",
          layer: "backend-ada",
          severity: "P0",
          status: "killed",
          killed: true,
          killedBy: ["TEST-001"],
          newFailureIds: ["TEST-001"],
          output: "some output",
        },
      ],
      baselines: [
        { green: true },
      ],
      seeds: ["/tmp/seed1"],
      catalogIds: ["M01"],
      command: { cmd: "npm run test:mutation", cwd: "/repo", timeout: 300000 },
      environment: { node: "v22.0.0", platform: "linux" },
      revision: "abc123def456",
      rawOutputPath: "mutation-raw-test.txt",
    });

    expect(result.revision).toBe("abc123def456");
    expect(result.timestamp).toBeTruthy();
    expect(result.command).toEqual({ cmd: "npm run test:mutation", cwd: "/repo", timeout: 300000 });
    expect(result.environment).toEqual({ node: "v22.0.0", platform: "linux" });
    expect(result.baselineStatus).toBe("green");
    expect(result.seeds).toEqual(["/tmp/seed1"]);
    expect(result.rawOutputPath).toContain("mutation-raw-");
    expect(result.perCaseStatuses).toHaveLength(1);
    expect(result.perCaseStatuses[0]).toHaveProperty("id", "M01");
    expect(result.perCaseStatuses[0]).toHaveProperty("status", "killed");
  });

  it("[TOOLING-SOL-005] writeMutationArtifact full mode writes atomically (temp + rename)", async () => {
    const { root } = await fixtureDir();
    const fullPath = join(root, "mutation-results.json");
    const diagnosticsDir = join(root, "diagnostics");

    const artifact = { revision: "abc123", timestamp: "2026-01-01T00:00:00Z", results: [] };
    const writtenPath = await writeMutationArtifact({
      mode: "full",
      fullPath,
      diagnosticsDir,
      runId: "2026-01-01T000000Z-abcd",
      artifact,
    });

    expect(writtenPath).toBe(fullPath);
    // The file exists and content is valid JSON matching the artifact
    const content = JSON.parse(await readFile(fullPath, "utf8"));
    expect(content.revision).toBe("abc123");
    // No leftover temp files
    const dirEntries = await readdir(dirname(fullPath));
    expect(dirEntries.some((e) => e.includes(".tmp-"))).toBe(false);
  });
});

describe("SOL finding 3b — benchmark full-results artifact schema", () => {
  it("[TOOLING-SOL-007] performance-results.json revision is not null", async () => {
    // The benchmark writes the record file only when run; but we can verify
    // the sourceRevision function (imported indirectly via the harness pattern)
    // by checking dataset-benchmark.mjs exports sourceRevision.
    const mod: { sourceRevision: () => string } = await import("../scripts/dataset-benchmark.mjs");
    expect(typeof mod.sourceRevision).toBe("function");
    const rev = mod.sourceRevision();
    expect(typeof rev).toBe("string");
    expect(rev.length).toBeGreaterThan(0);
    expect(rev).not.toBe("null");
  });

  it("[TOOLING-SOL-007b] performance-results.json script invokes guard around dataset-benchmark.mjs", () => {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    const benchScript = pkg.scripts["test:benchmark"];
    expect(benchScript).toContain("workflow-isolation-guard.mjs");
    expect(benchScript).toContain("dataset-benchmark.mjs");
  });
});
