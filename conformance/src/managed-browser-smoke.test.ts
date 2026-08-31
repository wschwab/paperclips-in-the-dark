import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildChildEnv,
  childExitCode,
  defaultPaths,
  isSubpath,
  parseArgs,
  pickPort,
  PORT_RETRY_ATTEMPTS,
  seedDataDir,
  signalExitCode,
  usage,
} from "../scripts/managed-browser-smoke.mjs";

// ---------------------------------------------------------------------------
// Wave-0 tooling tests: the managed browser-smoke launcher. These are pure tests:
// they exercise the launcher's parsing, child-env construction, path-safety, and
// exit-code helpers plus byte-exact seeding against temp fixtures — never a live
// server, never real campaign-data. The launcher's server lifecycle is shared with
// managed-run.mjs and exercised by that suite; the browser-smoke unit surface here is
// the option grammar, the three-variable child environment contract, and the path/exit
// helpers that keep the launcher's owned cleanup exact.
// ---------------------------------------------------------------------------

describe("Wave-0 managed browser-smoke launcher", () => {
  it("[TOOLING-BROWSER-001] parses options before the first -- and the command after it verbatim", () => {
    // The first -- separates launcher options from the required command.
    const opts = parseArgs(["--server", "srv", "--seed", "a", "--seed", "b", "--timeout", "5000", "--keep", "--", "cmd", "--flag", "arg"]);
    expect(opts.server).toBe("srv");
    expect(opts.seeds).toEqual(["a", "b"]);
    expect(opts.timeoutMs).toBe(5000);
    expect(opts.keep).toBe(true);
    expect(opts.build).toBe(false);
    // Everything after the first -- is the command verbatim, including further --
    // tokens (the command's own flags).
    expect(opts.command).toEqual(["cmd", "--flag", "arg"]);
  });

  it("[TOOLING-BROWSER-002] a required -- command and option validation are enforced", () => {
    expect(parseArgs([]).command).toEqual([]);
    // The command only exists after a --; without one there is no command (and
    // no launcher options are recognized either).
    expect(parseArgs(["--server", "x"]).command).toEqual([]);
    expect(parseArgs(["--keep"]).command).toEqual([]);
    const byDefault = parseArgs(["--keep", "--", "cmd"]);
    expect(byDefault.timeoutMs).toBe(30_000);
    expect(byDefault.server).toBe(null);
    expect(byDefault.keep).toBe(true);
    expect(byDefault.command).toEqual(["cmd"]);
    // A missed value and an unknown option are rejected.
    expect(() => parseArgs(["--server", "--", "cmd"])).toThrow(/missing value/);
    expect(() => parseArgs(["--bogus", "--", "cmd"])).toThrow(/unknown launcher option/);
    expect(() => parseArgs(["--timeout", "0", "--", "cmd"])).toThrow(/positive integer/);
  });

  it("[TOOLING-BROWSER-003] usage documents the -- command contract and default paths sit inside the temp root", () => {
    const u = usage();
    expect(u).toContain("-- <command>");
    expect(u).toContain("--keep");
    expect(u).toContain("BASE_URL");
    expect(u).toContain("PITD_DATA_DIR");
    expect(defaultPaths().managedRoot).toBe(join(tmpdir(), "pitd-managed"));
    expect(defaultPaths().server).toContain(join("backend-ada", "server"));
  });

  it("[TOOLING-BROWSER-004] the child env carries the base URL and data dir under the three documented variables", () => {
    const env = buildChildEnv({ baseUrl: "http://127.0.0.1:9999", dataDir: "/tmp/run/data" });
    expect(env).toEqual({
      BASE_URL: "http://127.0.0.1:9999",
      CONFORMANCE_BASE_URL: "http://127.0.0.1:9999",
      PITD_DATA_DIR: "/tmp/run/data",
    });
  });

  it("[TOOLING-BROWSER-005] isSubpath treats the separator as a plain string, never matching a sibling prefix", () => {
    const root = join(tmpdir(), "pitd-managed");
    // The separator is a literal string, so a sibling whose name merely starts with
    // root + something-other-than-sep is NOT inside root.
    expect(isSubpath(root, join(root, "run-123", "data"))).toBe(true);
    expect(isSubpath(root, `${root}${sep}run-123`)).toBe(true);
    expect(isSubpath(root, `${root}-other`)).toBe(false);
    // Equality is not "inside".
    expect(isSubpath(root, root)).toBe(false);
    expect(isSubpath(root, resolve(root))).toBe(false);
    // Relative and dot segments are resolved before comparing.
    expect(isSubpath(join(tmpdir(), "a"), join(tmpdir(), "a", "..", "a", "b"))).toBe(true);
  });

  it("[TOOLING-BROWSER-006] exit helpers translate signals and codes into launcher exit codes", () => {
    expect(signalExitCode("SIGINT")).toBe(130);
    expect(signalExitCode("SIGTERM")).toBe(143);
    expect(signalExitCode("SIGKILL")).toBe(137);
    // Unknown signals fall back to 128+1.
    expect(signalExitCode("SIGBOGUS")).toBe(129);
    expect(childExitCode(0, null)).toBe(0);
    expect(childExitCode(3, null)).toBe(3);
    expect(childExitCode(null, "SIGINT")).toBe(130);
    expect(childExitCode(null, null)).toBe(1);
  });

  it("[TOOLING-BROWSER-007] seeding copies exact bytes for files and directories into a temp data dir", async () => {
    const root = await mkdtemp(join(tmpdir(), "wave0-browser-seed-"));
    try {
      const fixtureSet = join(root, "fixture-set");
      const nested = join(fixtureSet, "characters", "00000000-0000-4000-8000-000000000000");
      await mkdir(nested, { recursive: true });
      await writeFile(join(fixtureSet, "campaign.json"), '{"kind":"campaign","formatVersion":1}\n');
      await writeFile(join(nested, "character.json"), Buffer.from([0x00, 0x7f, 0x80, 0xff, 0x0a]));
      const extraFile = join(root, "extra-file.bin");
      await writeFile(extraFile, Buffer.from([0x01, 0x02, 0x03, 0x00, 0xff]));

      const dataDir = join(root, "data");
      const seeded = await seedDataDir(dataDir, [fixtureSet, extraFile]);
      expect(seeded).toHaveLength(2);
      expect(await readFile(join(dataDir, "campaign.json"), "utf8")).toBe('{"kind":"campaign","formatVersion":1}\n');
      expect(await readFile(join(dataDir, "characters", "00000000-0000-4000-8000-000000000000", "character.json"))).toEqual(
        Buffer.from([0x00, 0x7f, 0x80, 0xff, 0x0a]),
      );
      expect(await readFile(join(dataDir, "extra-file.bin"))).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x00, 0xff]));
      await expect(seedDataDir(dataDir, [join(root, "missing-source")])).rejects.toThrow(/not found/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-BROWSER-008] port probing yields distinct unused loopback ports", async () => {
    const ports = await Promise.all(Array.from({ length: 5 }, () => pickPort()));
    for (const port of ports) {
      expect(Number.isInteger(port)).toBe(true);
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65_535);
    }
    expect(new Set(ports).size).toBeGreaterThan(1);
    expect(PORT_RETRY_ATTEMPTS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SAFE-02 red/green tests: managed-browser-smoke.mjs must clean its exact owned
// run directory on ALL exit paths — success, child nonzero/failure, startup
// failure, readiness timeout, SIGINT, and SIGTERM — without broad deletion and
// without touching unrelated siblings or orphaned server processes.
//
// These integration tests spawn the real launcher with a fake --server script
// (same pattern as managed-run.test.ts). The fake server accepts --port, --data,
// --static, --games, and --test-hooks, serves /api/health, then exits (crash,
// hang, or stays) as the test requires.
// ---------------------------------------------------------------------------

const conformanceDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browserSmokePath = resolve(conformanceDir, "scripts", "managed-browser-smoke.mjs");
const managedRoot = defaultPaths().managedRoot;

const execFileAsync = (
  file: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  timeoutMs = 120_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> =>
  new Promise((resolvePromise) => {
    execFile(
      file,
      args,
      {
        cwd: conformanceDir,
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, ...env },
      },
      (error, stdout, stderr) => {
        const code = error == null ? 0 : typeof error.code === "number" ? error.code : 1;
        resolvePromise({ code, stdout, stderr });
      },
    );
  });

const execFileInDir = (
  file: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
  timeoutMs = 30_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> =>
  new Promise((resolvePromise) => {
    execFile(
      file,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        const code = error == null ? 0 : typeof error.code === "number" ? error.code : 1;
        resolvePromise({ code, stdout, stderr });
      },
    );
  });


const lineValues = (stdout: string, key: string): string[] => {
  const matches = [...stdout.matchAll(new RegExp(`\\[managed-browser-smoke\\] ${key}=([^\\s]+)`, "g"))];
  return matches.map((match) => match[1]);
};

const lineValue = (stdout: string, key: string): string => {
  const values = lineValues(stdout, key);
  if (values.length === 0) throw new Error(`missing [managed-browser-smoke] ${key}= in output`);
  return values[0];
};

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const assertNoOrphanServers = async (): Promise<void> => {
  const result = await execFileInDir("pgrep", ["-f", "pitd-managed"], conformanceDir, undefined, 10_000);
  expect(result.stdout.trim()).toBe("");
};

const makeFakeServer = async (root: string, script: string, name: string): Promise<string> => {
  const path = join(root, name);
  await writeFile(path, script);
  await chmod(path, 0o755);
  return path;
};

// A fake server that serves /api/health with the correct implementation and
// dataDir, then stays alive until killed.
const healthyServerScript = `#!/usr/bin/env node
import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const data = process.argv[process.argv.indexOf("--data") + 1];
const server = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ implementation: "ada", dataDir: data }));
    return;
  }
  res.writeHead(404);
  res.end();
});
server.listen(port, "127.0.0.1");
`;

// A fake server that crashes immediately (startup failure).
const crashingServerScript = `#!/usr/bin/env node
process.stderr.write("raised PROGRAM_ERROR : boom\n");
process.exit(1);
`;

// A fake server that starts but never becomes healthy (timeout).
const hangingServerScript = `#!/usr/bin/env node
import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
// Listen on the port but never serve /api/health — causes readiness timeout.
const server = createServer((req, res) => {
  res.writeHead(503);
  res.end("not ready");
});
server.listen(port, "127.0.0.1");
// Don't exit; let the launcher timeout and kill us.
`;

describe("SAFE-02 managed-browser-smoke cleanup lifecycle", () => {
  // TOOLING-BROWSER-009: success path cleans the exact owned run directory
  it("[TOOLING-BROWSER-009] success path removes the exact owned run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sbt-success-"));
    const fakeServer = await makeFakeServer(root, healthyServerScript, "healthy.mjs");
    try {
      const { code, stdout, stderr } = await execFileAsync(
        "node",
        [browserSmokePath, "--server", fakeServer, "--", "true"],
        undefined,
        30_000,
      );
      expect(code).toBe(0);
      expect(stderr).toContain("evidence removed");
      const runDir = lineValue(stdout, "runDir");
      expect(runDir).toContain("pitd-managed");
      // The exact owned run dir must not exist.
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-BROWSER-010: child nonzero/failure cleans the run directory
  it("[TOOLING-BROWSER-010] child nonzero/failure removes the exact owned run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sbt-cmd-fail-"));
    const fakeServer = await makeFakeServer(root, healthyServerScript, "healthy.mjs");
    try {
      // `false` exits 1
      const { code, stdout, stderr } = await execFileAsync(
        "node",
        [browserSmokePath, "--server", fakeServer, "--", "false"],
        undefined,
        30_000,
      );
      expect(code).toBe(1);
      const runDir = lineValue(stdout, "runDir");
      expect(runDir).toContain("pitd-managed");
      // The exact owned run dir must not exist on ANY path.
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-BROWSER-011: startup failure cleans the run directory
  it("[TOOLING-BROWSER-011] startup failure removes the exact owned run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sbt-startup-fail-"));
    const fakeServer = await makeFakeServer(root, crashingServerScript, "crash.mjs");
    try {
      const { code, stdout, stderr } = await execFileAsync(
        "node",
        [browserSmokePath, "--server", fakeServer, "--timeout", "5000", "--", "true"],
        undefined,
        30_000,
      );
      expect(code).toBe(1);
      expect(stderr).toContain("exited before readiness");
      const runDir = lineValue(stdout, "runDir");
      expect(runDir).toContain("pitd-managed");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-BROWSER-012: readiness timeout cleans the run directory
  it("[TOOLING-BROWSER-012] readiness timeout removes the exact owned run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sbt-timeout-"));
    const fakeServer = await makeFakeServer(root, hangingServerScript, "hang.mjs");
    try {
      const { code, stdout, stderr } = await execFileAsync(
        "node",
        [browserSmokePath, "--server", fakeServer, "--timeout", "500", "--", "true"],
        undefined,
        30_000,
      );
      expect(code).toBe(1);
      expect(stderr).toContain("health returned HTTP 503");
      const runDir = lineValue(stdout, "runDir");
      expect(runDir).toContain("pitd-managed");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-BROWSER-013: SIGINT during command cleans the run directory
  it("[TOOLING-BROWSER-013] SIGINT during command removes the exact owned run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sbt-sigint-"));
    const fakeServer = await makeFakeServer(root, healthyServerScript, "healthy.mjs");
    try {
      // Command that sleeps so we can interrupt it
      const { code, stdout, stderr } = await new Promise<{ code: number; stdout: string; stderr: string }>(
        (resolvePromise) => {
          const child = spawn(
            "node",
            [browserSmokePath, "--server", fakeServer, "--", "sleep", "30"],
            { cwd: conformanceDir, env: { ...process.env } },
          );
          let stdoutBuf = "";
          let stderrBuf = "";
          child.stdout?.on("data", (d) => (stdoutBuf += d.toString()));
          child.stderr?.on("data", (d) => (stderrBuf += d.toString()));
          // Wait for readiness announcement, then signal
          const readyTimer = setTimeout(() => {
            child.kill("SIGINT");
          }, 5000);
          child.on("exit", (exitCode) => {
            clearTimeout(readyTimer);
            resolvePromise({ code: exitCode ?? 1, stdout: stdoutBuf, stderr: stderrBuf });
          });
        },
      );
      // SIGINT should result in 128+2 = 130 (SIGINT signal number)
      expect(code).toBe(130);
      const runDir = lineValue(stdout, "runDir");
      expect(runDir).toContain("pitd-managed");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-BROWSER-014: SIGTERM during command cleans the run directory
  it("[TOOLING-BROWSER-014] SIGTERM during command removes the exact owned run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sbt-sigterm-"));
    const fakeServer = await makeFakeServer(root, healthyServerScript, "healthy.mjs");
    try {
      const { code, stdout, stderr } = await new Promise<{ code: number; stdout: string; stderr: string }>(
        (resolvePromise) => {
          const child = spawn(
            "node",
            [browserSmokePath, "--server", fakeServer, "--", "sleep", "30"],
            { cwd: conformanceDir, env: { ...process.env } },
          );
          let stdoutBuf = "";
          let stderrBuf = "";
          child.stdout?.on("data", (d) => (stdoutBuf += d.toString()));
          child.stderr?.on("data", (d) => (stderrBuf += d.toString()));
          const readyTimer = setTimeout(() => {
            child.kill("SIGTERM");
          }, 5000);
          child.on("exit", (exitCode) => {
            clearTimeout(readyTimer);
            resolvePromise({ code: exitCode ?? 1, stdout: stdoutBuf, stderr: stderrBuf });
          });
        },
      );
      // SIGTERM should result in 128+15 = 143
      expect(code).toBe(143);
      const runDir = lineValue(stdout, "runDir");
      expect(runDir).toContain("pitd-managed");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-BROWSER-015: --keep preserves the run dir on success but siblings are untouched
  it("[TOOLING-BROWSER-015] --keep preserves the run dir on success while siblings remain untouched", async () => {
    const root = await mkdtemp(join(tmpdir(), "sbt-keep-"));
    const fakeServer = await makeFakeServer(root, healthyServerScript, "healthy.mjs");
    try {
      // Create an unrelated sibling dir in pitd-managed
      const sibling = join(managedRoot, "sbt-sibling-marker");
      await mkdir(sibling, { recursive: true });
      await writeFile(join(sibling, "marker.txt"), "do not delete");
      try {
        const { code, stdout, stderr } = await execFileAsync(
          "node",
          [browserSmokePath, "--server", fakeServer, "--keep", "--", "true"],
          undefined,
          30_000,
        );
        expect(code).toBe(0);
        expect(stderr).toContain("run dir kept");
        const runDir = lineValue(stdout, "runDir");
        expect(runDir).toContain("pitd-managed");
        // Run dir survives with --keep.
        expect((await stat(runDir)).isDirectory()).toBe(true);
        // Unrelated sibling must still exist.
        const siblingStat = await stat(sibling);
        expect(siblingStat.isDirectory()).toBe(true);
      } finally {
        await rm(sibling, { recursive: true, force: true });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
