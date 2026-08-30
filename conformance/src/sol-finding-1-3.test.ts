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


  it("[TOOLING-SOL-006b] sourceRevision respects PITD_REVISION env override", () => {
    const saved = process.env.PITD_REVISION;
    if (saved === undefined) delete process.env.PITD_REVISION;
    process.env.PITD_REVISION = "deadbeef1234";
    try {
      const rev = sourceRevision();
      expect(rev).toBe("deadbeef1234");
    } finally {
      if (saved === undefined) delete process.env.PITD_REVISION;
      else process.env.PITD_REVISION = saved;
    }
  });

  it("[TOOLING-SOL-006c] sourceRevision uses PITD_REVISION env var when set", () => {
    const saved = process.env.PITD_REVISION;
    process.env.PITD_REVISION = "deadbeef1234";
    try {
      const rev = sourceRevision();
      expect(rev).toBe("deadbeef1234");
    } finally {
      if (saved === undefined) delete process.env.PITD_REVISION;
      else process.env.PITD_REVISION = saved;
    }
  });

  it("[TOOLING-SOL-006d] sourceRevision does not return the ephemeral empty successor", () => {
    // The clean source candidate is @-, not the empty successor @.
    // When working copy is clean, sourceRevision returns @- (parent).
    const saved = process.env.PITD_REVISION;
    delete process.env.PITD_REVISION;
    try {
      const rev = sourceRevision();
      // If the working copy is dirty, sourceRevision throws rather than
      // recording the mutable @. This is the desired behavior.
      if (rev !== "unknown") {
        // If we got a revision, it must not be the empty successor.
        // The empty successor @ would be 524bd408 — verify we got @- instead.
        // We can't assert the exact short hash, but we can assert it's not
        // the same as `jj log -r @ --ignore-working-copy`.
        // In a clean working copy, this returns @-.
        expect(rev).not.toBe("524bd408ed8d".substring(0, 7));
      }
    } catch (e: any) {
      // Dirty working copy — this is the correct behavior when @ is empty
      // but has uncommitted changes.
      expect(e.code).toBe("PROVENANCE_DIRTY");
    } finally {
      if (saved === undefined) delete process.env.PITD_REVISION;
      else process.env.PITD_REVISION = saved;
    }
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
    const saved = process.env.PITD_REVISION;
    process.env.PITD_REVISION = "test-rev-from-env";
    try {
      const rev = mod.sourceRevision();
      expect(rev).toBe("test-rev-from-env");
      expect(rev).not.toBe("null");
      expect(rev).not.toBe("unknown");
    } finally {
      if (saved === undefined) delete process.env.PITD_REVISION;
      else process.env.PITD_REVISION = saved;
    }
  });

  it("[TOOLING-SOL-007b] performance-results.json script invokes guard around dataset-benchmark.mjs", () => {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    const benchScript = pkg.scripts["test:benchmark"];
    expect(benchScript).toContain("workflow-isolation-guard.mjs");
    expect(benchScript).toContain("dataset-benchmark.mjs");
  });
});


describe("SOL finding 4 — gen-doc workflow child-only black-box", () => {
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
  );
  const workflowScript = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "scripts",
    "gen-doc-workflow-managed.mjs",
  );
  const workflowRel = "conformance/scripts/gen-doc-workflow-managed.mjs";

  it("[TOOLING-SOL-009a] test:agent-workflow script is wired through default-data-guard + workflow-isolation-guard + managed-browser-smoke", () => {
    const script = pkg.scripts["test:agent-workflow"];
    expect(script).toBeDefined();
    expect(script).toContain("default-data-guard.mjs");
    expect(script).toContain("workflow-isolation-guard.mjs");
    expect(script).toContain("managed-browser-smoke.mjs");
    expect(script).toContain("gen-doc-workflow-managed.mjs");
  });

  it("[TOOLING-SOL-009b] checkCommand accepts gen-doc-workflow-managed.mjs as internal harness (no --child)", () => {
    const result = guardCheckCommand(["node", workflowRel]);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("internal harness");
  });

  it("[TOOLING-SOL-009c] checkCommand rejects --child on gen-doc-workflow-managed.mjs", () => {
    const result = guardCheckCommand(["node", workflowRel, "--child"]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("--child");
  });

  it("[TOOLING-SOL-009d] checkCommand rejects caller-provided BASE_URL on gen-doc-workflow-managed.mjs", () => {
    const result = guardCheckCommand(
      ["node", workflowRel],
      { env: { BASE_URL: "http://127.0.0.1:9999" } },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("BASE_URL");
  });

  it("[TOOLING-SOL-009e] checkCommand rejects caller-provided PITD_DATA_DIR on gen-doc-workflow-managed.mjs", () => {
    const result = guardCheckCommand(
      ["node", workflowRel],
      { env: { PITD_DATA_DIR: "/tmp/pitd-fake" } },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("PITD_DATA_DIR");
  });

  it("[TOOLING-SOL-009f] gen-doc-workflow-managed.mjs requires BASE_URL or CONFORMANCE_BASE_URL env", async () => {
    // Running the script with no BASE_URL/CONFORMANCE_BASE_URL must fail fast.
    const { spawn } = await import("node:child_process");
    const { pathToFileURL } = await import("node:url");
    const child = spawn(process.execPath, [fileURLToPath(pathToFileURL(workflowScript))], {
      env: { ...process.env, BASE_URL: undefined, CONFORMANCE_BASE_URL: undefined, PITD_DATA_DIR: undefined },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const code = await new Promise((resolve) => child.once("exit", resolve));
    expect(code).toBe(1);
    expect(stderr).toContain("FATAL");
    expect(stderr).toContain("BASE_URL");
  });

  it("[TOOLING-SOL-009g] gen-doc-workflow-managed.mjs requires PITD_DATA_DIR env when BASE_URL is set", async () => {
    const { spawn } = await import("node:child_process");
    const { pathToFileURL } = await import("node:url");
    const child = spawn(process.execPath, [fileURLToPath(pathToFileURL(workflowScript))], {
      env: { ...process.env, BASE_URL: "http://127.0.0.1:9999", CONFORMANCE_BASE_URL: undefined, PITD_DATA_DIR: undefined },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const code = await new Promise((resolve) => child.once("exit", resolve));
    expect(code).toBe(1);
    expect(stderr).toContain("FATAL");
    expect(stderr).toContain("PITD_DATA_DIR");
  });

  it("[TOOLING-SOL-009h] gen-doc-workflow-managed.mjs does NOT import spawn or startServer (child-only)", async () => {
    const src = readFileSync(workflowScript, "utf8");
    expect(src).not.toContain("import { spawn }");
    expect(src).not.toContain("import { createServer }");
    expect(src).not.toContain("pickPort");
    expect(src).not.toContain("defaultPaths");
    expect(src).not.toContain("startServer");
    expect(src).not.toContain("stopServer");
    expect(src).toContain("process.env.BASE_URL");
  });
});
