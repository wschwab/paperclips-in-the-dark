import { execFile, spawn } from "node:child_process";
import { watch } from "node:fs";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const conformanceDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = join(conformanceDir, "scripts", "managed-run.mjs");
const marker = "socket-diagnostic-server-marker";

function value(output: string, key: string): string {
  const match = new RegExp(`\\[managed-run\\] ${key}=([^\\n]+)`).exec(output);
  if (!match) throw new Error(`missing ${key} in launcher output:\n${output}`);
  return match[1].trim();
}

async function fixture(healthy: boolean): Promise<{ root: string; server: string }> {
  const root = await mkdtemp(join(tmpdir(), "pitd-log-retention-"));
  const server = join(root, "server.mjs");
  await writeFile(server, `#!/usr/bin/env node
import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const dataDir = process.argv[process.argv.indexOf("--data") + 1];
console.log("${marker}");
console.error("${marker}-stderr");
createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ implementation: "${healthy ? "ada" : "unhealthy"}", dataDir }));
}).listen(port, "127.0.0.1");
`);
  await chmod(server, 0o755);
  return { root, server };
}

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(process.execPath, [launcher, ...args], { cwd: conformanceDir, timeout: 15_000 }, (error, stdout, stderr) => {
      done({ code: error == null ? 0 : typeof error.code === "number" ? error.code : 1, stdout, stderr });
    });
  });
}

async function assertRetained(stdout: string, stderr: string): Promise<void> {
  const runDir = value(stdout, "runDir");
  const log = value(stderr, "retainedLog");
  try {
    expect(log).toBe(join(conformanceDir, "..", "agent-docs", "test-audit", "managed-run-logs", `${runDir.split("/").pop()}-server.log`));
    const bytes = await readFile(log, "utf8");
    expect(bytes).toContain(marker);
    expect(bytes).toContain(`${marker}-stderr`);
    await expect(stat(runDir)).rejects.toThrow();
    const pid = Number(value(stdout, "pid"));
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    await rm(log, { force: true });
  }
}

// These additive tooling cases do not change frozen HTTP conformance tests.
describe("managed launcher failure log retention", () => {
  it("[TOOLING-LOG-RETENTION-001] retains the complete server log and prints its path after a test failure", async () => {
    const { root, server } = await fixture(true);
    try {
      const result = await run(["--server", server, "--", "--run", "suites/__log_retention_never__.test.ts"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("TEST FAILED");
      await assertRetained(result.stdout, result.stderr);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("[TOOLING-LOG-RETENTION-002] retains the server log after a readiness failure", async () => {
    const { root, server } = await fixture(false);
    try {
      const result = await run(["--server", server, "--timeout", "500", "--", "--run"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("SETUP FAILED");
      await assertRetained(result.stdout, result.stderr);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("[TOOLING-LOG-RETENTION-003] SIGTERM retains the log while stopping the owned server", async () => {
    const { root, server } = await fixture(false);
    const child = spawn(process.execPath, [launcher, "--server", server, "--timeout", "10000", "--", "--run"], { cwd: conformanceDir });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (bytes) => { stdout += String(bytes); });
    child.stderr.on("data", (bytes) => { stderr += String(bytes); });
    const exited = new Promise<number | null>((done) => child.once("exit", done));
    try {
      // Real filesystem/process events cross the child boundary; fake timers
      // cannot deliver the server's writes or the launcher's PID announcement.
      await new Promise<void>((done) => {
        const onOutput = () => {
          if (!stdout.includes("[managed-run] pid=")) return;
          child.stdout.off("data", onOutput);
          const log = value(stdout, "logFile");
          const watcher = watch(log, () => { void check(); });
          async function check(): Promise<void> {
            const bytes = await readFile(log, "utf8");
            if (bytes.includes(`${marker}-stderr`)) { watcher.close(); done(); }
          }
          void check();
        };
        child.stdout.on("data", onOutput);
        onOutput();
      });
      child.kill("SIGTERM");
      expect(await exited).toBe(143);
      await assertRetained(stdout, stderr);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-LOG-RETENTION-004] successful runs still remove logs and data", async () => {
    const { root, server } = await fixture(true);
    try {
      const result = await run(["--server", server, "--", "--run", "--passWithNoTests", "suites/__log_retention_never__.test.ts"]);
      expect(result.code).toBe(0);
      const runDir = value(result.stdout, "runDir");
      expect(result.stderr).not.toContain("retainedLog=");
      await expect(stat(runDir)).rejects.toThrow();
      await expect(stat(join(conformanceDir, "..", "agent-docs", "test-audit", "managed-run-logs", `${runDir.split("/").pop()}-server.log`))).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
