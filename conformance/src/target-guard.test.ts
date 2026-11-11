import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  assertTestHooksEnabled,
  healthUrl,
  MissingTargetError,
  requireTarget,
  resolveCliTarget,
  resolveEnvTarget,
  TestHooksDisabledError,
} from "../scripts/target-guard.mjs";

// ---------------------------------------------------------------------------
// BUGFIX-1111 item 1 — a conformance run must never mutate a server it did
// not start. On 2026-11-11 the runner's `http://localhost:9657` fallback
// wrote 454 characters, 187 crews and 192 clocks into a live campaign's data
// directory. These tests pin the two replacement rules: an explicit target
// is mandatory, and the target must announce test hooks in /api/health.
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const responseOf = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "content-type": "application/json" } });

describe("BUGFIX-1111 conformance target guard", () => {
  it("[BUGFIX-1111-TARGET-001] never invents a default target", () => {
    expect(resolveCliTarget({ againstFlag: undefined, env: {} })).toBe("");
    expect(resolveEnvTarget({})).toBe("");
    expect(() => requireTarget({})).toThrow(MissingTargetError);
    expect(() => requireTarget({})).toThrow(/--against/);

    // An explicit target is accepted from the flag, then the canonical env
    // variable, then the CLI-level BASE_URL (Vitest rewrites BASE_URL, so it
    // is only read at the process boundary).
    expect(resolveCliTarget({ againstFlag: "http://127.0.0.1:9600", env: { BASE_URL: "http://127.0.0.1:9601" } })).toBe(
      "http://127.0.0.1:9600",
    );
    expect(resolveCliTarget({ againstFlag: "  ", env: { CONFORMANCE_BASE_URL: "http://127.0.0.1:9601" } })).toBe(
      "http://127.0.0.1:9601",
    );
    expect(resolveCliTarget({ againstFlag: undefined, env: { BASE_URL: "http://127.0.0.1:9602" } })).toBe(
      "http://127.0.0.1:9602",
    );
    expect(requireTarget({ CONFORMANCE_BASE_URL: "http://127.0.0.1:9603" })).toBe("http://127.0.0.1:9603");

    // An empty variable is "no target", never a fallback.
    expect(resolveCliTarget({ againstFlag: undefined, env: { CONFORMANCE_BASE_URL: "", BASE_URL: "" } })).toBe("");
    expect(healthUrl("http://127.0.0.1:9600/")).toBe("http://127.0.0.1:9600/api/health");
  });

  it("[BUGFIX-1111-TARGET-002] refuses a target whose health does not show test hooks", async () => {
    const withHooks = await assertTestHooksEnabled("http://127.0.0.1:9600", {
      fetchImpl: async () => responseOf(JSON.stringify({ status: "ok", testHooks: true })),
    });
    expect(withHooks.testHooks).toBe(true);

    const rejects = async (fetchImpl: typeof fetch, pattern: RegExp) => {
      await expect(
        assertTestHooksEnabled("http://127.0.0.1:9600", { fetchImpl }),
      ).rejects.toThrow(pattern);
      await expect(
        assertTestHooksEnabled("http://127.0.0.1:9600", { fetchImpl }),
      ).rejects.toThrow(TestHooksDisabledError);
    };

    // A campaign server started without --test-hooks reports no field at all.
    await rejects(async () => responseOf(JSON.stringify({ status: "ok", implementation: "ada" })), /testHooks/);
    await rejects(async () => responseOf(JSON.stringify({ status: "ok", testHooks: false })), /testHooks/);
    await rejects(async () => responseOf("{}", 500), /HTTP 500/);
    await rejects(async () => responseOf("not json"), /invalid JSON/);
    await rejects(async () => {
      throw new Error("ECONNREFUSED");
    }, /ECONNREFUSED/);
  });

  it("[BUGFIX-1111-TARGET-003] runner sources carry no localhost:9657 fallback", async () => {
    const sources = [
      "bin/conformance.mjs",
      "src/api.ts",
      "src/report.ts",
      "vitest.config.ts",
    ];
    // The incident is quoted in the comments that explain the fix; only
    // executable code must be free of the old default.
    for (const source of sources) {
      const text = await readFile(join(repoRoot, source), "utf8");
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code, `${source} must not fall back to the campaign port`).not.toMatch(/localhost:9657/);
    }
  });

  // The spawn-based cases run the real CLI. They are written before the fix;
  // executing them pre-fix would drive a full Vitest run against whatever the
  // runner guessed, which is the incident this card fixes, so they are
  // exercised only against a private fake server and an explicitly empty
  // target (never port 9657).
  const runCli = (args: string[], env: Record<string, string>) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolvePromise) => {
      const child = spawn(process.execPath, [join(repoRoot, "bin/conformance.mjs"), ...args], {
        cwd: repoRoot,
        env: { ...env, PATH: process.env.PATH ?? "" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
    });

  it("[BUGFIX-1111-TARGET-004] conformance run without a target refuses before contacting anything", async () => {
    const result = await runCli(["run", "--report", "json"], {
      CONFORMANCE_BASE_URL: "",
      BASE_URL: "",
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/--against/);
    expect(result.stdout).not.toContain("schemaVersion");
  }, 120_000);

  it("[BUGFIX-1111-TARGET-005] conformance run refuses a target without test hooks", async () => {
    // A private server that answers /api/health like a campaign server does.
    const server = createServer((request, response) => {
      if (request.url === "/api/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok", implementation: "ada", version: "0.2.0", dataDir: "/tmp/not-ours" }));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end("{}");
    });
    await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
    const port = (server.address() as AddressInfo).port;
    try {
      const result = await runCli(["run", "--report", "json", "--against", `http://127.0.0.1:${port}`], {
        CONFORMANCE_BASE_URL: "",
        BASE_URL: "",
      });
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/testHooks|test hooks/i);
      expect(result.stdout).not.toContain("schemaVersion");
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  }, 120_000);
});
