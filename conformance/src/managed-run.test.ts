import { spawn, execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  defaultPaths,
  parseArgs,
  pickPort,
  PORT_RETRY_ATTEMPTS,
  seedDataDir,
} from "../scripts/managed-run.mjs";

// ---------------------------------------------------------------------------
// SC-O0 tooling tests: the managed conformance launcher. Covers launcher
// argument forwarding, byte-exact seeding, port isolation, temp-dir lifecycle
// (success and failure remove), controlled restarts (data dir fresh
// per run but persisted across the restart, seed bytes re-applied before
// every start), and exact-PID process-tree cleanup (no orphan pitd after
// success or failure).
//
// Integration tests spawn the real launcher against the real backend-ada
// server executable; vitest is driven with filters that cannot match any
// suite test, so the results never depend on the current red/green suite
// state: `suites/__sc_o0_never__.test.ts` makes vitest exit 1 (no test files
// found), `--passWithNoTests` makes the same filter exit 0, and an unmatched
// `-t` selector makes vitest skip every test and exit 0.
// ---------------------------------------------------------------------------

const conformanceDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launcherPath = resolve(conformanceDir, "scripts", "managed-run.mjs");
const managedRoot = defaultPaths().managedRoot;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const execFileAsync = (
  file: string,
  args: string[],
  cwd = conformanceDir,
  timeoutMs = 120_000,
  env?: NodeJS.ProcessEnv,
): Promise<RunResult> =>
  new Promise((resolvePromise) => {
    execFile(
      file,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        ...(env ? { env: { ...process.env, ...env } } : {}),
      },
      (error, stdout, stderr) => {
        const code = error == null ? 0 : typeof error.code === "number" ? error.code : 1;
        resolvePromise({ code, stdout, stderr });
      },
    );
  });

const runLauncher = (args: string[], timeoutMs = 120_000) =>
  execFileAsync(process.execPath, [launcherPath, ...args], conformanceDir, timeoutMs);

const lineValues = (stdout: string, key: string): string[] => {
  const matches = [...stdout.matchAll(new RegExp(`\\[managed-run\\] ${key}=([^\\s]+)`, "g"))];
  return matches.map((match) => match[1]);
};

const lineValue = (stdout: string, key: string): string => {
  const values = lineValues(stdout, key);
  if (values.length === 0) throw new Error(`missing [managed-run] ${key}= in launcher output:\n${stdout}`);
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

// No pitd may survive with a launcher-managed data dir (any such process is
// an orphan of a managed run; manual dev servers use other data dirs).
const assertNoOrphanServers = async (): Promise<void> => {
  const result = await execFileAsync("pgrep", ["-af", "pitd-managed"], conformanceDir, 10_000);
  expect(result.stdout.trim()).toBe("");
};

beforeAll(async () => {
  const info = await stat(defaultPaths().server).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(
      `SC-O0 integration tests require the server executable at ${defaultPaths().server}; ` +
        "run the alr build first (the launcher builds it automatically on a managed run)",
    );
  }
});

describe("SC-O0 managed conformance launcher", () => {
  it("[TOOLING-MANAGED-001] forwards everything after -- to vitest verbatim", () => {
    const opts = parseArgs(["--seed", "a", "--cycles", "2", "--", "--run", "-t", "name", "suites/x.test.ts"]);
    expect(opts.seeds).toEqual(["a"]);
    expect(opts.cycles).toBe(2);
    expect(opts.vitestArgs).toEqual(["--run", "-t", "name", "suites/x.test.ts"]);

    // Without a -- separator every argument is a vitest argument.
    expect(parseArgs(["--run", "-t", "name"]).vitestArgs).toEqual(["--run", "-t", "name"]);
    // npm shape: `npm run test:ada -- <options> -- <vitest args>` appends
    // `-- <options> -- <vitest args>` to the script template, so the last
    // -- is the real separator and the leading bare -- is npm's own.
    const viaNpm = parseArgs(["--", "--cycles", "2", "--seed", "a", "--", "--run", "-t", "name"]);
    expect(viaNpm.cycles).toBe(2);
    expect(viaNpm.seeds).toEqual(["a"]);
    expect(viaNpm.vitestArgs).toEqual(["--run", "-t", "name"]);
    // With no arguments the launcher defaults to a full run.
    expect(parseArgs([]).vitestArgs).toEqual([]);
    expect(parseArgs(["--no-test-hooks", "--"]).testHooks).toBe(false);
    expect(parseArgs(["--test-hooks", "--"]).testHooks).toBe(true);
    expect(() => parseArgs(["--bogus", "--"])).toThrow(/unknown launcher option/);
    expect(() => parseArgs(["--cycles", "0", "--"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--timeout", "0", "--"])).toThrow(/positive integer/);
  });

  it("[TOOLING-MANAGED-002] port probing yields distinct unused loopback ports", async () => {
    const ports = await Promise.all(Array.from({ length: 5 }, () => pickPort()));
    for (const port of ports) {
      expect(Number.isInteger(port)).toBe(true);
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65_535);
    }
    expect(new Set(ports).size).toBeGreaterThan(1);
  });

  it("[TOOLING-MANAGED-003] seeding copies exact bytes for files and directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "sc-o0-seed-"));
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
      expect(
        await readFile(join(dataDir, "characters", "00000000-0000-4000-8000-000000000000", "character.json")),
      ).toEqual(Buffer.from([0x00, 0x7f, 0x80, 0xff, 0x0a]));
      expect(await readFile(join(dataDir, "extra-file.bin"))).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x00, 0xff]));
      await expect(seedDataDir(dataDir, [join(root, "missing-source")])).rejects.toThrow(/not found/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-004] success path removes evidence and leaves no orphan process", async () => {
    const { code, stdout, stderr } = await runLauncher([
      "--run",
      "--passWithNoTests",
      "suites/__sc_o0_never__.test.ts",
    ]);
    expect(code).toBe(0);
    const runDir = lineValue(stdout, "runDir");
    const pid = Number(lineValue(stdout, "pid"));
    const port = Number(lineValue(stdout, "port"));
    expect(port).toBeGreaterThan(0);
    expect(pid).toBeGreaterThan(0);
    expect(stderr).toContain("evidence removed");
    await expect(stat(runDir)).rejects.toThrow();
    expect(pidAlive(pid)).toBe(false);
    await assertNoOrphanServers();
  });

  it("[TOOLING-MANAGED-005] failure path removes evidence and leaves no orphan process", async () => {
    const { code, stdout, stderr } = await runLauncher(["--run", "suites/__sc_o0_never__.test.ts"]);
    expect(code).toBe(1);
    const runDir = lineValue(stdout, "runDir");
    const pid = Number(lineValue(stdout, "pid"));
    const port = Number(lineValue(stdout, "port"));

    expect(port).toBeGreaterThan(0);
    expect(stderr).toContain("FAILED");
    expect(stderr).not.toContain("evidence preserved");
    await expect(stat(runDir)).rejects.toThrow();
    expect(pidAlive(pid)).toBe(false);
    await assertNoOrphanServers();
  });

  it("[TOOLING-MANAGED-006] two runs get isolated ports and data dirs", async () => {
    const first = await runLauncher(["--run", "suites/__sc_o0_never__.test.ts"]);
    const second = await runLauncher(["--run", "suites/__sc_o0_never__.test.ts"]);
    expect(first.code).toBe(1);
    expect(second.code).toBe(1);
    const port1 = Number(lineValue(first.stdout, "port"));
    const port2 = Number(lineValue(second.stdout, "port"));
    const runDir1 = lineValue(first.stdout, "runDir");
    const runDir2 = lineValue(second.stdout, "runDir");
    expect(port1).not.toBe(port2);
    expect(runDir1).not.toBe(runDir2);
    expect(runDir1).toContain("pitd-managed");
    await expect(stat(runDir1)).rejects.toThrow();
    await expect(stat(runDir2)).rejects.toThrow();
    await assertNoOrphanServers();
  });

  it("[TOOLING-MANAGED-007] controlled restart re-seeds a fresh data dir and re-runs vitest", async () => {
    const root = await mkdtemp(join(tmpdir(), "sc-o0-cycles-"));
    const fixture = join(root, "campaign.json");
    const seedBytes = '{"kind":"campaign","name":"seeded","formatVersion":1}\n';
    await writeFile(fixture, seedBytes);
    try {
      const { code, stdout, stderr } = await runLauncher([
        "--seed",
        fixture,
        "--cycles",
        "2",
        "--",
        "--run",
        "suites/__sc_o0_never__.test.ts",
      ]);
      expect(code).toBe(1);
      const runDir = lineValue(stdout, "runDir");
      expect(lineValues(stdout, "cycle")).toEqual(["1/2", "2/2"]);
      const pids = lineValues(stdout, "pid");
      expect(pids).toHaveLength(2);
      expect(new Set(pids).size).toBe(2);
      expect(lineValues(stdout, "port")).toHaveLength(2);
      // The data dir is fresh once per run and persists across the
      // controlled restart: both cycles announce the same path.
      const dataDirs = lineValues(stdout, "dataDir");
      expect(dataDirs).toHaveLength(2);
      expect(dataDirs[0]).toBe(dataDirs[1]);

      // Failure cleanup removes the run directory, so cycle announcements,
      // stable dataDir announcements, and process cleanup are the observables.
      expect(stderr).not.toContain("evidence preserved");
      await expect(stat(runDir)).rejects.toThrow();
      for (const pid of pids) expect(pidAlive(Number(pid))).toBe(false);
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-008] -t selectors reach vitest and only matching tests are considered", async () => {
    const { code, stdout, stderr } = await runLauncher(["--run", "-t", "__sc_o0_probe__"], 240_000);
    expect(code).toBe(0);
    // With the -t filter forwarded, every suite test is skipped and nothing
    // executes against the server; if forwarding broke, the full suite would
    // run instead (and could fail or exercise the server).
    expect(stdout).toContain("skipped");
    expect(stderr).toContain("evidence removed");
    const runDir = lineValue(stdout, "runDir");
    await expect(stat(runDir)).rejects.toThrow();
    expect(pidAlive(Number(lineValue(stdout, "pid")))).toBe(false);
    await assertNoOrphanServers();
  }, 60_000);

  it("[TOOLING-MANAGED-009] a broken stdout pipe (EPIPE) never orphans the server", async () => {
    // Regression: an EPIPE crash in the launcher used to skip the cleanup
    // finally and leave the pitd running. Destroying stdout synchronously
    // guarantees every write after spawn fails; vitest inherits the broken
    // pipe and exits non-zero, so the launcher must take its failure path —
    // stop the exact server PID, remove the run, and exit promptly.
    const before = await readdir(managedRoot);
    const code = await new Promise<number>((resolvePromise) => {
      const child = spawn(
        process.execPath,
        [launcherPath, "--run", "--passWithNoTests", "suites/__sc_o0_never__.test.ts"],
        { cwd: conformanceDir },
      );
      child.stdout.destroy();
      child.stderr.resume();
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolvePromise(99);
      }, 60_000);
      child.on("exit", (exitCode) => {
        clearTimeout(timer);
        resolvePromise(exitCode ?? 1);
      });
    });
    expect(code).toBe(1);
    await assertNoOrphanServers();
    const after = await readdir(managedRoot);
    for (const name of after.filter((entry) => !before.includes(entry))) {
      await rm(join(managedRoot, name), { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-010] a port collision between probe and bind retries on a fresh port", async () => {
    // The fake server simulates the real Ada/AWS bind failure (same stderr
    // signature and non-zero exit) on its first invocation, then binds and
    // serves /api/health on the retried port. FAKE_SERVER_STATE records how
    // often it was started and on which ports.
    const root = await mkdtemp(join(tmpdir(), "sc-o0-collision-"));
    const stateFile = join(root, "state.json");
    const fakeServer = join(root, "fake-server.mjs");
    await writeFile(
      fakeServer,
      `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
const stateFile = process.env.FAKE_SERVER_STATE;
const prior = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { attempts: 0, ports: [] };
const attempt = prior.attempts + 1;
writeFileSync(stateFile, JSON.stringify({ attempts: attempt, ports: [...prior.ports, port] }));
if (attempt === 1) {
  process.stderr.write("raised AWS.NET.SOCKET_ERROR : Bind : [98] Address already in use\\n");
  process.exit(1);
}
const server = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ implementation: "ada", dataDir: args[args.indexOf("--data") + 1] }));
    return;
  }
  res.writeHead(404);
  res.end();
});
server.listen(port, "127.0.0.1");
`,
    );
    await chmod(fakeServer, 0o755);
    try {
      const { code, stdout, stderr } = await execFileAsync(
        process.execPath,
        [
          launcherPath,
          "--server",
          fakeServer,
          "--",
          "--run",
          "--passWithNoTests",
          "suites/__sc_o0_never__.test.ts",
        ],
        conformanceDir,
        120_000,
        { FAKE_SERVER_STATE: stateFile },
      );
      expect(code).toBe(0);
      // Attempt 1 collided and was retried on attempt 2; both announce a
      // port and a pid, and the second attempt reached readiness.
      expect(lineValues(stdout, "port")).toHaveLength(2);
      expect(lineValues(stdout, "pid")).toHaveLength(2);
      expect(stderr).toContain("retrying with a fresh port");
      expect(stderr).toContain("evidence removed");
      const state = JSON.parse(await readFile(stateFile, "utf8")) as {
        attempts: number;
        ports: number[];
      };
      expect(state.attempts).toBe(2);
      expect(state.ports).toHaveLength(2);
      const runDir = lineValue(stdout, "runDir");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-011] a non-collision startup failure is not retried", async () => {
    const root = await mkdtemp(join(tmpdir(), "sc-o0-crash-"));
    const fakeServer = join(root, "crash-server.mjs");
    await writeFile(
      fakeServer,
      `#!/usr/bin/env node
process.stderr.write("raised PROGRAM_ERROR : boom\\n");
process.exit(1);
`,
    );
    await chmod(fakeServer, 0o755);
    try {
      const { code, stdout, stderr } = await runLauncher([
        "--server",
        fakeServer,
        "--",
        "--run",
        "--passWithNoTests",
        "suites/__sc_o0_never__.test.ts",
      ]);
      expect(code).toBe(1);
      // No EADDRINUSE signature: exactly one attempt, then the startup
      // failure propagates with the log tail as evidence.
      expect(lineValues(stdout, "port")).toHaveLength(1);
      expect(stderr).toContain("exited before readiness");
      expect(stderr).toContain("boom");
      expect(stderr).not.toContain("evidence preserved");
      const runDir = lineValue(stdout, "runDir");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-016] readiness rejects wrong implementation and removes the owned run", async () => {
    const root = await mkdtemp(join(tmpdir(), "sc-o0-readiness-impl-"));
    const fakeServer = join(root, "wrong-implementation.mjs");
    await writeFile(
      fakeServer,
      `#!/usr/bin/env node
import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const server = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ implementation: "zero", dataDir: process.argv[process.argv.indexOf("--data") + 1] }));
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(port, "127.0.0.1");
`,
    );
    await chmod(fakeServer, 0o755);
    try {
      const { code, stdout, stderr } = await runLauncher([
        "--server", fakeServer, "--timeout", "250", "--", "--run", "--passWithNoTests", "suites/__sc_o0_never__.test.ts",
      ]);
      expect(code).toBe(1);
      expect(stderr).toContain("server not ready");
      const runDir = lineValue(stdout, "runDir");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-017] readiness rejects a health response with the wrong data directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sc-o0-readiness-data-"));
    const fakeServer = join(root, "wrong-data-dir.mjs");
    await writeFile(
      fakeServer,
      `#!/usr/bin/env node
import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const server = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ implementation: "ada", dataDir: "/wrong-owned-data-dir" }));
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(port, "127.0.0.1");
`,
    );
    await chmod(fakeServer, 0o755);
    try {
      const { code, stdout, stderr } = await runLauncher([
        "--server", fakeServer, "--timeout", "250", "--", "--run", "--passWithNoTests", "suites/__sc_o0_never__.test.ts",
      ]);
      expect(code).toBe(1);
      expect(stderr).toContain("server not ready");
      const runDir = lineValue(stdout, "runDir");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-018] SIGTERM during startup stops the exact child and removes the run", async () => {
    const root = await mkdtemp(join(tmpdir(), "sc-o0-sigterm-"));
    const fakeServer = join(root, "slow-server.mjs");
    await writeFile(fakeServer, `#!/usr/bin/env node\nsetInterval(() => {}, 1_000_000);\n`);
    await chmod(fakeServer, 0o755);
    const child = spawn(process.execPath, [launcherPath, "--server", fakeServer, "--", "--run"], {
      cwd: conformanceDir,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const exited = new Promise<number>((resolvePromise) => {
      child.on("exit", (code, signal) => resolvePromise(code ?? (signal ? 128 : 1)));
    });
    const delay = (ms: number): Promise<void> => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
    try {
      const deadline = Date.now() + 90_000;
      while (!/\[managed-run\] pid=\d+/.test(stdout)) {
        if (Date.now() > deadline) throw new Error(`launcher never announced server pid; stdout:\n${stdout}\nstderr:\n${stderr}`);
        await delay(50);
      }
      const serverPid = Number(/\[managed-run\] pid=(\d+)/.exec(stdout)![1]);
      const runDir = lineValue(stdout, "runDir");
      expect(pidAlive(serverPid)).toBe(true);
      child.kill("SIGTERM");
      const code = await Promise.race([
        exited,
        new Promise<number>((resolvePromise) => setTimeout(() => { child.kill("SIGKILL"); resolvePromise(99); }, 60_000)),
      ]);
      expect(code).toBe(143);
      expect(stderr).toContain("received SIGTERM");
      while (pidAlive(serverPid) && Date.now() < deadline) await delay(50);
      expect(pidAlive(serverPid)).toBe(false);
      await expect(stat(runDir)).rejects.toThrow();
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-019] readiness timeout stops a live unhealthy child and removes the run", async () => {
    const root = await mkdtemp(join(tmpdir(), "sc-o0-readiness-timeout-"));
    const fakeServer = join(root, "unhealthy-server.mjs");
    await writeFile(fakeServer, `#!/usr/bin/env node\nsetInterval(() => {}, 1_000_000);\n`);
    await chmod(fakeServer, 0o755);
    try {
      const started = Date.now();
      const { code, stdout, stderr } = await runLauncher([
        "--server", fakeServer, "--timeout", "250", "--", "--run", "--passWithNoTests", "suites/__sc_o0_never__.test.ts",
      ], 10_000);
      expect(code).not.toBe(0);
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(stderr).toContain("server not ready");
      const serverPid = Number(lineValue(stdout, "pid"));
      const runDir = lineValue(stdout, "runDir");
      expect(pidAlive(serverPid)).toBe(false);
      await expect(stat(runDir)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-020] preserves an unrelated loopback 9657 listener", async () => {
    const unrelated = spawn(process.execPath, ["--input-type=module", "-e", `import { createServer } from "node:net"; const s=createServer(); s.once("error", (error) => { console.error(error.message); process.exit(1); }); s.listen(9657,"127.0.0.1", () => console.log("READY"));`], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    unrelated.stdout!.setEncoding("utf8");
    unrelated.stdout!.on("data", (chunk) => { output += chunk; });
    const outcome = await Promise.race([
      new Promise<"ready" | "exit">((resolvePromise) => {
        unrelated.stdout!.on("data", () => { if (output.includes("READY")) resolvePromise("ready"); });
        unrelated.once("exit", () => resolvePromise("exit"));
      }),
      new Promise<"timeout">((resolvePromise) => setTimeout(() => resolvePromise("timeout"), 5_000)),
    ]);
    if (outcome !== "ready") {
      if (unrelated.exitCode === null) unrelated.kill("SIGTERM");
      return;
    }
    try {
      const { code, stdout } = await runLauncher(["--run", "--passWithNoTests", "suites/__sc_o0_never__.test.ts"]);
      expect(code).toBe(0);
      expect(Number(lineValue(stdout, "port"))).not.toBe(9657);
      expect(pidAlive(unrelated.pid!)).toBe(true);
    } finally {
      unrelated.kill("SIGTERM");
      await new Promise<void>((resolvePromise) => unrelated.once("exit", () => resolvePromise()));
    }
  });

  it("[TOOLING-MANAGED-012] repeated port collisions give up after a bounded number of attempts", async () => {
    const root = await mkdtemp(join(tmpdir(), "sc-o0-collide-all-"));
    const fakeServer = join(root, "always-collide.mjs");
    await writeFile(
      fakeServer,
      `#!/usr/bin/env node
process.stderr.write("raised AWS.NET.SOCKET_ERROR : Bind : [98] Address already in use\\n");
process.exit(1);
`,
    );
    await chmod(fakeServer, 0o755);
    try {
      const { code, stdout, stderr } = await runLauncher([
        "--server",
        fakeServer,
        "--",
        "--run",
        "--passWithNoTests",
        "suites/__sc_o0_never__.test.ts",
      ]);
      expect(code).toBe(1);
      expect(lineValues(stdout, "port")).toHaveLength(PORT_RETRY_ATTEMPTS);
      expect(stderr).toContain("consecutive port collisions");
      expect(stderr).not.toContain("evidence preserved");
      const runDir = lineValue(stdout, "runDir");
      await expect(stat(runDir)).rejects.toThrow();
      await assertNoOrphanServers();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-013] SIGINT during vitest stops the vitest tree and the server, leaving no orphans", async () => {
    // A real blocking suite test keeps vitest alive past the interrupt
    // point. It writes a marker file the moment it starts executing in a
    // worker — a real cross-process signal, so the interrupt lands while
    // vitest is provably mid-test (a guessed sleep would mask boot races).
    // The blocker is removed in finally so no other suite run can pick it up.
    const root = await mkdtemp(join(tmpdir(), "sc-o0-sigint-"));
    const marker = join(root, "blocker-started");
    const blocker = join(conformanceDir, "suites", "__sc_o0_blocker__.test.ts");
    await writeFile(
      blocker,
      `import { writeFile } from "node:fs/promises";
import { it } from "vitest";

it("blocks forever for the SC-O0 SIGINT cleanup test", async () => {
  const marker = process.env.BLOCKER_MARKER;
  if (marker) await writeFile(marker, "started\\n");
  await new Promise(() => {});
}, 60_000);
`,
    );
    const child = spawn(process.execPath, [launcherPath, "--run", "suites/__sc_o0_blocker__.test.ts"], {
      cwd: conformanceDir,
      env: { ...process.env, BLOCKER_MARKER: marker },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const exited = new Promise<number>((resolvePromise) => {
      child.on("exit", (code, signal) => resolvePromise(code ?? (signal ? 128 : 1)));
    });
    const fileExists = async (path: string): Promise<boolean> =>
      stat(path)
        .then(() => true)
        .catch(() => false);
    const delay = (ms: number): Promise<void> => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
    try {
      const deadline = Date.now() + 90_000;
      while (!/\[managed-run\] vitestPid=\d+/.test(stdout)) {
        if (Date.now() > deadline) {
          throw new Error(`launcher never announced vitestPid; stdout so far:\n${stdout}\nstderr:\n${stderr}`);
        }
        await delay(50);
      }
      const vitestPid = Number(/\[managed-run\] vitestPid=(\d+)/.exec(stdout)![1]);
      const serverPid = Number(lineValue(stdout, "pid"));
      // Wait for the blocker test to actually start in a worker, then
      // interrupt the launcher mid-vitest.
      while (!(await fileExists(marker))) {
        if (Date.now() > deadline) {
          throw new Error(`blocker test never started; stdout so far:\n${stdout}\nstderr:\n${stderr}`);
        }
        await delay(50);
      }
      child.kill("SIGINT");
      const code = await Promise.race([
        exited,
        new Promise<number>((resolvePromise) => {
          setTimeout(() => {
            child.kill("SIGKILL");
            resolvePromise(99);
          }, 60_000);
        }),
      ]);
      expect(code).toBe(130);
      expect(stderr).toContain("received SIGINT");
      expect(pidAlive(vitestPid)).toBe(false);
      expect(pidAlive(serverPid)).toBe(false);
      // The vitest worker processes (tinypool forks) share vitest's process
      // group, so the tree kill must have taken them down too: nothing keeps
      // the blocker path in its command line.
      const orphans = await execFileAsync("pgrep", ["-af", "__sc_o0_blocker__"], conformanceDir, 10_000);
      expect(orphans.stdout.trim()).toBe("");
      await assertNoOrphanServers();
      const runDir = lineValue(stdout, "runDir");
      await rm(runDir, { recursive: true, force: true });
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await rm(blocker, { force: true });
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-014] SIGINT during startup (before readiness) leaves no orphan server", async () => {
    // Regression: the server PID used to be registered only after
    // readiness, so an interrupt during the readiness poll exited the
    // launcher with activeServerRef null and orphaned the freshly spawned
    // server. The fake server never binds and never serves /api/health,
    // keeping the launcher inside the pre-readiness window; the interrupt
    // must still stop the exact PID.
    const root = await mkdtemp(join(tmpdir(), "sc-o0-startup-sigint-"));
    const fakeServer = join(root, "slow-server.mjs");
    await writeFile(
      fakeServer,
      `#!/usr/bin/env node
// Never binds and never serves /api/health: the launcher stays in the
// pre-readiness window until interrupted. The interval keeps the event
// loop alive — a pending promise alone would let the process exit.
setInterval(() => {}, 1_000_000);
`,
    );
    await chmod(fakeServer, 0o755);
    try {
      const child = spawn(process.execPath, [launcherPath, "--server", fakeServer, "--", "--run"], {
        cwd: conformanceDir,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const exited = new Promise<number>((resolvePromise) => {
        child.on("exit", (code, signal) => resolvePromise(code ?? (signal ? 128 : 1)));
      });
      const delay = (ms: number): Promise<void> => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
      try {
        const deadline = Date.now() + 90_000;
        // The pid is announced right after spawn — before readiness — so
        // matching it guarantees the interrupt lands inside the startup
        // window this regression targets.
        while (!/\[managed-run\] pid=\d+/.test(stdout)) {
          if (Date.now() > deadline) {
            throw new Error(`launcher never announced a server pid; stdout so far:\n${stdout}\nstderr:\n${stderr}`);
          }
          await delay(50);
        }
        const serverPid = Number(/\[managed-run\] pid=(\d+)/.exec(stdout)![1]);
        expect(pidAlive(serverPid)).toBe(true);
        child.kill("SIGINT");
        const code = await Promise.race([
          exited,
          new Promise<number>((resolvePromise) => {
            setTimeout(() => {
              child.kill("SIGKILL");
              resolvePromise(99);
            }, 60_000);
          }),
        ]);
        expect(code).toBe(130);
        expect(stderr).toContain("received SIGINT");
        // The launcher only exits after the server's exit event, so the
        // child is already reaped; the poll is defensive.
        const killDeadline = Date.now() + 10_000;
        while (pidAlive(serverPid) && Date.now() < killDeadline) await delay(50);
        expect(pidAlive(serverPid)).toBe(false);
        await assertNoOrphanServers();
        const runDir = lineValue(stdout, "runDir");
        await rm(runDir, { recursive: true, force: true });
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("[TOOLING-MANAGED-015] SIGINT during the alr build kills the build child, leaving no orphan", async () => {
    // Regression: the alr build child was never registered, so an interrupt
    // during `alr --non-interactive build` exited the launcher and orphaned
    // the still-running build. A fake `alr` on PATH records its PID and
    // blocks; the interrupt must stop it.
    const root = await mkdtemp(join(tmpdir(), "sc-o0-build-sigint-"));
    const fakeAlr = join(root, "alr");
    await writeFile(
      fakeAlr,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.env.ALR_MARKER, String(process.pid) + "\\n");
// The interval keeps the event loop alive — a pending promise alone would
// let the process exit right after writing the marker.
setInterval(() => {}, 1_000_000);
`,
    );
    await chmod(fakeAlr, 0o755);
    const before = await readdir(managedRoot);
    try {
      const marker = join(root, "alr.pid");
      const child = spawn(
        process.execPath,
        [launcherPath, "--build", "--build-dir", root, "--", "--run"],
        {
          cwd: conformanceDir,
          env: { ...process.env, PATH: `${root}:${process.env.PATH}`, ALR_MARKER: marker },
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const exited = new Promise<number>((resolvePromise) => {
        child.on("exit", (code, signal) => resolvePromise(code ?? (signal ? 128 : 1)));
      });
      const delay = (ms: number): Promise<void> => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
      const fileExists = async (path: string): Promise<boolean> =>
        stat(path)
          .then(() => true)
          .catch(() => false);
      try {
        const deadline = Date.now() + 90_000;
        while (!(await fileExists(marker))) {
          if (Date.now() > deadline) {
            throw new Error(`fake alr never started; stdout so far:\n${stdout}\nstderr:\n${stderr}`);
          }
          await delay(50);
        }
        const alrPid = Number((await readFile(marker, "utf8")).trim());
        expect(pidAlive(alrPid)).toBe(true);
        child.kill("SIGINT");
        const code = await Promise.race([
          exited,
          new Promise<number>((resolvePromise) => {
            setTimeout(() => {
              child.kill("SIGKILL");
              resolvePromise(99);
            }, 60_000);
          }),
        ]);
        expect(code).toBe(130);
        expect(stderr).toContain("received SIGINT");
        // The launcher only exits after the build child's exit event, so it
        // is already reaped; the poll is defensive.
        const killDeadline = Date.now() + 10_000;
        while (pidAlive(alrPid) && Date.now() < killDeadline) await delay(50);
        expect(pidAlive(alrPid)).toBe(false);
        // Nothing may keep the fake alr (or anything else under the build
        // dir) in its command line.
        const orphans = await execFileAsync("pgrep", ["-af", root], conformanceDir, 10_000);
        expect(orphans.stdout.trim()).toBe("");
        await assertNoOrphanServers();
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    } finally {
      // The signal path preserves evidence; clean up any new run dir.
      const after = await readdir(managedRoot);
      for (const name of after.filter((entry) => !before.includes(entry))) {
        await rm(join(managedRoot, name), { recursive: true, force: true });
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});
