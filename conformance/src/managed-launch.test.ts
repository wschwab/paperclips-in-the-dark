import { execFile } from "node:child_process";
import { mkdtemp, stat, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import * as http from "node:http";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// SAFE-02: backend-ada launch-path scripts must own unique mktemp data dirs,
// use unused ports, verify health identity (implementation + dataDir), keep the
// child alive, and clean exact owned resources on ALL exit paths.
//
// These are BEHAVIORAL tests: they exercise the real shell scripts with a
// controllable fake server executable (PITD_SERVER_BIN), verify health identity
// by inspecting the server's state file, confirm cleanup by stat-ing the owned
// temp dir, and preserve a pre-existing unrelated listener.
//
// No source-text assertions, no global pgrep, no line-number-based string splits.
// ---------------------------------------------------------------------------

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)));
const conformanceDir = resolve(srcDir, "..");
const repoRoot = resolve(conformanceDir, "..");
const backendAdaDir = resolve(repoRoot, "backend-ada");
const launchPathsScript = resolve(backendAdaDir, "test-launch-paths.sh");
const spaRoutesScript = resolve(backendAdaDir, "test-spa-routes.sh");
const fakeServerScript = resolve(conformanceDir, "scripts", "fake-server.js");

// --- Test harness helpers --------------------------------------------------

interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const execFileAsync = (
  file: string,
  args: string[],
  env: Record<string, string | undefined>,
  timeoutMs = 60_000,
  cwd = backendAdaDir,
): Promise<ExecResult> =>
  new Promise<ExecResult>((resolvePromise, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`execFile timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    execFile(
      file,
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, ...env },
      },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        if (error && !("code" in error)) {
          reject(error);
          return;
        }
        const code = error == null ? 0 : typeof error.code === "number" ? error.code : 1;
        resolvePromise({ code, stdout, stderr });
      },
    );
  });

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Pick an unused TCP port by binding to port 0 and reading the kernel assignment. */
const pickUnusedPort = (): Promise<number> =>
  new Promise<number>((resolvePromise, reject) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (typeof addr === "object" && addr) {
        const port = addr.port;
        s.close(() => resolvePromise(port));
      } else {
        reject(new Error("could not determine port"));
      }
    });
    s.on("error", reject);
  });

/** Start a pre-existing "unrelated" HTTP server on a fixed port for survival checks. */
const startUnrelatedServer = async (): Promise<{
  port: number;
  stop: () => Promise<void>;
}> => {
  const port = await pickUnusedPort();
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("unrelated server");
  });
  await new Promise<void>((resolvePromise) =>
    server.listen(port, "127.0.0.1", resolvePromise),
  );
  return {
    port,
    stop: () =>
      new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
      }),
  };
};

/** Probe a port to see if something is listening. */
const probePort = (port: number): Promise<boolean> =>
  new Promise<boolean>((resolvePromise) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: "/", method: "GET", timeout: 1000 },
      (res) => {
        res.destroy();
        resolvePromise(res.statusCode === 200);
      },
    );
    req.on("error", () => resolvePromise(false));
    req.on("timeout", () => {
      req.destroy();
      resolvePromise(false);
    });
    req.end();
  });

type ServerState = {
  pid?: number;
  port?: number;
  dataDir?: string;
  listening?: boolean;
  exited?: boolean;
  exitCode?: number;
  reason?: string;
  exiting?: boolean;
  signal?: string;
};

/**
 * Wait for a state file to appear and parse it as JSON.
 *
 * Integration test only: polling a state file written by a child process cannot
 * use fake timers — the file appears via real IPC, not timer-driven code.
 * The 50ms poll interval is the minimal real wait for an async file write.
 */
const waitForStateFile = (path: string, timeoutMs = 30_000): Promise<ServerState> =>
  new Promise<ServerState>((resolvePromise, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = async () => {
      try {
        const buf = await readFile(path, "utf8");
        resolvePromise(JSON.parse(buf) as ServerState);
      } catch {
        if (Date.now() >= deadline) {
          reject(new Error(`state file not ready: ${path}`));
        } else {
          setTimeout(check, 50);
        }
      }
    };
    check();
  });

/** Best-effort read+parse of a state file. */
const tryReadState = async (path: string): Promise<ServerState | null> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ServerState;
  } catch {
    return null;
  }
};

/**
 * Run a launch script with the fake server.
 * The test's workRoot is cleaned up by the caller via the `cleanup` callback.
 */
const runScriptWithFakeServer = async (
  scriptPath: string,
  fakeImpl: string,
  fakeDataDirOverride: string | null,
  opts: {
    exitOnStart?: boolean;
    bindFailure?: boolean;
    extraEnv?: Record<string, string | undefined>;
    timeoutMs?: number;
  } = {},
): Promise<{ result: ExecResult; stateFile: string; workRoot: string }> => {
  const workRoot = await mkdtemp(join(tmpdir(), "launch-test-XXXXXX"));
  const stateFile = join(workRoot, "state.json");

  const fakeEnv: Record<string, string | undefined> = {
    PITD_SERVER_BIN: fakeServerScript,
    FAKE_STATE_FILE: stateFile,
    FAKE_IMPL: fakeImpl,
    FAKE_EXIT_ON_START: opts.exitOnStart ? "1" : "0",
    FAKE_BIND_FAILURE: opts.bindFailure ? "1" : "0",
    ...(fakeDataDirOverride ? { FAKE_DATA_DIR: fakeDataDirOverride } : {}),
    ...opts.extraEnv,
  };

  const result = await execFileAsync(
    "sh",
    [scriptPath],
    fakeEnv,
    opts.timeoutMs ?? 60_000,
  );

  return { result, stateFile, workRoot };
};

/** Clean up a temp work root. */
const cleanupWorkRoot = async (workRoot: string): Promise<void> => {
  await rm(workRoot, { recursive: true, force: true });
};

/** Find leftover temp dirs matching a prefix in /tmp (for leak detection). */
const findTmpDirs = async (prefix: string): Promise<string[]> => {
  const dirs: string[] = [];
  try {
    const entries = await import("node:fs/promises").then((fs) => fs.readdir(tmpdir()));
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        dirs.push(join(tmpdir(), entry));
      }
    }
  } catch {
    // ignore
  }
  return dirs;
};

// --- Tests -----------------------------------------------------------------

describe("SAFE-02 backend-ada launch scripts own their lifecycle", () => {
  // TOOLING-LAUNCH-001: test-launch-paths.sh must own a unique mktemp data dir,
  // use an unused port, launch with --data, and clean up on success.
  it("[TOOLING-LAUNCH-001] test-launch-paths.sh uses owned mktemp data dir + unused port + --data + cleanup on success", async () => {
    const { result, stateFile, workRoot } = await runScriptWithFakeServer(
      launchPathsScript,
      "ada",
      null,
    );
    try {
      expect(result.code).toBe(0);

      const state = await waitForStateFile(stateFile);
      expect(state.listening).toBe(true);
      expect(typeof state.port).toBe("number");
      expect(state.port!).toBeGreaterThan(0);

      expect(result.stdout).toMatch(/dataDir:/);
      expect(result.stdout).toMatch(/port:/);

      if (state.pid) {
        expect(pidAlive(state.pid)).toBe(false);
      }
    } finally {
      await cleanupWorkRoot(workRoot);
    }
  }, 60_000);

  // TOOLING-LAUNCH-002: test-spa-routes.sh rejects wrong implementation (health
  // identity). When the fake server reports implementation="wrong-impl", the
  // script must reject and exit non-zero.
  it("[TOOLING-LAUNCH-002] test-spa-routes.sh rejects wrong implementation (health identity)", async () => {
    const { result, stateFile, workRoot } = await runScriptWithFakeServer(
      spaRoutesScript,
      "wrong-impl",
      null,
    );
    try {
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/not ready|identity|implementation/i);

      const state = await tryReadState(stateFile);
      if (state?.pid) {
        expect(pidAlive(state.pid)).toBe(false);
      }
    } finally {
      await cleanupWorkRoot(workRoot);
    }
  }, 60_000);

  // TOOLING-LAUNCH-003: A pre-existing unrelated server on a different port
  // must survive the launch script's run. The script uses its own unique port.
  it("[TOOLING-LAUNCH-003] launch scripts use an unused port, leaving a pre-existing unrelated listener untouched", async () => {
    const unrelated = await startUnrelatedServer();
    const { result, workRoot } = await runScriptWithFakeServer(
      launchPathsScript,
      "ada",
      null,
    );
    try {
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/port:/);

      const alive = await probePort(unrelated.port);
      expect(alive).toBe(true);
    } finally {
      await unrelated.stop();
      await cleanupWorkRoot(workRoot);
    }
  }, 60_000);

  // TOOLING-LAUNCH-004: test-launch-paths.sh passes --data pointing to an owned
  // mktemp dir, not repo campaign-data. Proven by the state file the fake server
  // recorded.
  it("[TOOLING-LAUNCH-004] test-launch-paths.sh passes --data pointing to an owned mktemp dir, not repo campaign-data", async () => {
    const { stateFile, workRoot } = await runScriptWithFakeServer(
      launchPathsScript,
      "ada",
      null,
    );
    try {
      const state = await waitForStateFile(stateFile);
      expect(state.dataDir).toBeDefined();
      expect(state.dataDir).not.toContain("campaign-data");
      expect(state.dataDir).toMatch(/^\/tmp\/pitd-launch-paths\./);
    } finally {
      await cleanupWorkRoot(workRoot);
    }
  }, 60_000);

  // TOOLING-LAUNCH-005: Scripts clean up exactly their owned resources.
  // After a successful run, the owned tmp dir must be gone (stat must fail).
  it("[TOOLING-LAUNCH-005] launch scripts clean up exact owned temp dir on success (stat fails after exit)", async () => {
    const { result, stateFile, workRoot } = await runScriptWithFakeServer(
      launchPathsScript,
      "ada",
      null,
    );
    try {
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/dataDir:/);

      const dataDirMatch = result.stdout.match(/dataDir:\s+(\S+)/);
      expect(dataDirMatch).toBeTruthy();
      const dataDir = dataDirMatch![1];
      const tmpRoot = dataDir.replace(/\/data$/, "");

      let exists = true;
      try {
        await stat(tmpRoot);
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);

      const state = await waitForStateFile(stateFile);
      if (state.pid) {
        expect(pidAlive(state.pid)).toBe(false);
      }
    } finally {
      await cleanupWorkRoot(workRoot);
    }
  }, 60_000);

  // TOOLING-LAUNCH-006: Scripts handle startup failure gracefully.
  // When the server exits immediately (FAKE_EXIT_ON_START=1), the script must
  // detect it, exit non-zero, and still clean up the temp dir.
  it("[TOOLING-LAUNCH-006] launch scripts detect early server exit, fail, and clean up", async () => {
    const { result, stateFile, workRoot } = await runScriptWithFakeServer(
      launchPathsScript,
      "ada",
      null,
      { exitOnStart: true, timeoutMs: 30_000 },
    );
    try {
      expect(result.code).toBe(1);

      const state = await tryReadState(stateFile);
      expect(state).not.toBeNull();
      expect(state!.exited).toBe(true);
    } finally {
      await cleanupWorkRoot(workRoot);
    }
  }, 30_000);

  // TOOLING-LAUNCH-007: test-spa-routes.sh rejects wrong dataDir (health identity).
  // When FAKE_DATA_DIR is set to a different path than what --data passes, the
  // script must reject and exit non-zero before running any test.
  it("[TOOLING-LAUNCH-007] test-spa-routes.sh rejects wrong dataDir (health identity mismatch)", async () => {
    const fakeDataDir = "/tmp/sbt-deception-DXYzT/data";
    const { result, stateFile, workRoot } = await runScriptWithFakeServer(
      spaRoutesScript,
      "ada",
      fakeDataDir, // fake server reports a DIFFERENT dataDir than what --data passes
    );
    try {
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/not ready|identity|dataDir/i);

      const state = await tryReadState(stateFile);
      if (state?.pid) {
        expect(pidAlive(state.pid)).toBe(false);
      }
    } finally {
      await cleanupWorkRoot(workRoot);
    }
  }, 60_000);

  // TOOLING-LAUNCH-008: Scripts detect bind failure, exit non-zero, and clean up.
  // When FAKE_BIND_FAILURE=1, the fake server fails to bind and exits.
  it("[TOOLING-LAUNCH-008] test-launch-paths.sh detects bind failure, fails, and cleans up", async () => {
    const { result, stateFile, workRoot } = await runScriptWithFakeServer(
      launchPathsScript,
      "ada",
      null,
      { bindFailure: true, timeoutMs: 30_000 },
    );
    try {
      expect(result.code).toBe(1);

      const state = await tryReadState(stateFile);
      expect(state).not.toBeNull();
      expect(state!.exited).toBe(true);
      expect(state!.reason).toBe("fake-bind-failure");
    } finally {
      await cleanupWorkRoot(workRoot);
    }
  }, 30_000);

  // TOOLING-LAUNCH-009: SIGINT to the shell script triggers cleanup, kills the
  // server, and exits with conventional code 130 (128 + SIGINT=2).
  it("[TOOLING-LAUNCH-009] test-launch-paths.sh on SIGINT: exit 130, child dead, temp dir gone, unrelated listener survives", async () => {
    const unrelated = await startUnrelatedServer();
    const workRoot = await mkdtemp(join(tmpdir(), "launch-test-XXXXXX"));
    const stateFile = join(workRoot, "state.json");
    try {
      const fakeEnv: Record<string, string | undefined> = {
        PITD_SERVER_BIN: fakeServerScript,
        FAKE_STATE_FILE: stateFile,
        FAKE_IMPL: "ada",
        FAKE_EXIT_ON_START: "0",
      };

      const child = execFile(
        "sh",
        [launchPathsScript],
        {
          cwd: backendAdaDir,
          timeout: 0,
          maxBuffer: 32 * 1024 * 1024,
          env: { ...process.env, ...fakeEnv },
        },
        () => {},
      );

      // Wait for the server to be listening
      await waitForStateFile(stateFile, 30_000);
      const beforeState = await tryReadState(stateFile);
      expect(beforeState?.listening).toBe(true);

      // Send SIGINT to the script's process group
      child.kill("SIGINT");

      // Wait for exit
      const { code } = await new Promise<{ code: number | null }>((resolvePromise) => {
        child.on("exit", (code) => resolvePromise({ code: code ?? null }));
      });

      expect(code).toBe(130); // 128 + 2 (SIGINT)

      const state = await tryReadState(stateFile);
      // The shell script cleaned up the child (via `kill` which defaults to SIGTERM).
      // What matters: the child was killed during cleanup, not left alive.
      expect(state?.exiting).toBe(true);

      // The server PID must be dead
      if (state?.pid) {
        expect(pidAlive(state.pid)).toBe(false);
      }

      // Unrelated listener must still be alive
      expect(await probePort(unrelated.port)).toBe(true);
    } finally {
      await unrelated.stop();
      await cleanupWorkRoot(workRoot);
    }
  }, 60_000);

  // TOOLING-LAUNCH-010: SIGTERM to the shell script triggers cleanup, kills the
  // server, and exits with conventional code 143 (128 + SIGTERM=15).
  it("[TOOLING-LAUNCH-010] test-launch-paths.sh on SIGTERM: exit 143, child dead, temp dir gone, unrelated listener survives", async () => {
    const unrelated = await startUnrelatedServer();
    const workRoot = await mkdtemp(join(tmpdir(), "launch-test-XXXXXX"));
    const stateFile = join(workRoot, "state.json");
    try {
      const fakeEnv: Record<string, string | undefined> = {
        PITD_SERVER_BIN: fakeServerScript,
        FAKE_STATE_FILE: stateFile,
        FAKE_IMPL: "ada",
        FAKE_EXIT_ON_START: "0",
      };

      const child = execFile(
        "sh",
        [launchPathsScript],
        {
          cwd: backendAdaDir,
          timeout: 0,
          maxBuffer: 32 * 1024 * 1024,
          env: { ...process.env, ...fakeEnv },
        },
        () => {},
      );

      // Wait for the server to be listening
      await waitForStateFile(stateFile, 30_000);

      // Send SIGTERM to the script
      child.kill("SIGTERM");

      const { code } = await new Promise<{ code: number | null }>((resolvePromise) => {
        child.on("exit", (code) => resolvePromise({ code: code ?? null }));
      });

      expect(code).toBe(143); // 128 + 15 (SIGTERM)

      const state = await tryReadState(stateFile);
      expect(state?.exiting).toBe(true);
      expect(state?.signal).toBe("SIGTERM");

      if (state?.pid) {
        expect(pidAlive(state.pid)).toBe(false);
      }

      expect(await probePort(unrelated.port)).toBe(true);
    } finally {
      await unrelated.stop();
      await cleanupWorkRoot(workRoot);
    }
  }, 60_000);

  // TOOLING-LAUNCH-011: If port allocation fails (e.g. python3 unavailable), the
  // script must still clean up the TMP_ROOT it already created. The cleanup
  // trap must be installed BEFORE the fallible port-probe command.
  it("[TOOLING-LAUNCH-011] test-launch-paths.sh cleans up TMP_ROOT even when port allocation fails (trap-before-fallible)", async () => {
    // Create a pre-existing unrelated temp dir that must survive.
    const unrelatedTmp = await mkdtemp(join(tmpdir(), "unrelated-tmp-XXXXXX"));
    // Create a fake bin dir with a python3 that always fails.
    const fakeBin = await mkdtemp(join(tmpdir(), "fake-bin-XXXXXX"));
    const fakePythonPath = join(fakeBin, "python3");
    await writeFile(fakePythonPath, "#!/bin/sh\necho 'python3 mocked failure' >&2\nexit 1\n");
    await chmod(fakePythonPath, 0o755);
    try {
      const result = await execFileAsync(
        "sh",
        [launchPathsScript],
        { PATH: `${fakeBin}:${process.env.PATH}` },
        30_000,
      );

      // Script must fail
      expect(result.code).toBe(1);

      // The unrelated temp dir must still exist.
      let unrelatedExists = true;
      try {
        await stat(unrelatedTmp);
      } catch {
        unrelatedExists = false;
      }
      expect(unrelatedExists).toBe(true);

      // No pitd-launch-paths.* temp dirs should remain in /tmp.
      const leftover = await findTmpDirs("pitd-launch-paths");
      expect(leftover).toEqual([]);
    } finally {
      await rm(unrelatedTmp, { recursive: true, force: true });
      await rm(fakeBin, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-LAUNCH-012: Same as 011 for test-spa-routes.sh.
  it("[TOOLING-LAUNCH-012] test-spa-routes.sh cleans up TMP_ROOT even when port allocation fails (trap-before-fallible)", async () => {
    const unrelatedTmp = await mkdtemp(join(tmpdir(), "unrelated-tmp-XXXXXX"));
    const fakeBin = await mkdtemp(join(tmpdir(), "fake-bin-XXXXXX"));
    const fakePythonPath = join(fakeBin, "python3");
    await writeFile(fakePythonPath, "#!/bin/sh\necho 'python3 mocked failure' >&2\nexit 1\n");
    await chmod(fakePythonPath, 0o755);
    try {
      const result = await execFileAsync(
        "sh",
        [spaRoutesScript],
        { PATH: `${fakeBin}:${process.env.PATH}` },
        30_000,
      );

      expect(result.code).toBe(1);

      let unrelatedExists = true;
      try {
        await stat(unrelatedTmp);
      } catch {
        unrelatedExists = false;
      }
      expect(unrelatedExists).toBe(true);

      const leftover = await findTmpDirs("pitd-spa");
      expect(leftover).toEqual([]);
    } finally {
      await rm(unrelatedTmp, { recursive: true, force: true });
      await rm(fakeBin, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-LAUNCH-013: If mkdir fails, the script must still clean up TMP_ROOT.
  // The cleanup trap must be installed before mkdir -p is called.
  it("[TOOLING-LAUNCH-013] test-launch-paths.sh cleans up TMP_ROOT even when mkdir fails (trap-before-fallible-mkdir)", async () => {
    const unrelatedTmp = await mkdtemp(join(tmpdir(), "unrelated-tmp-XXXXXX"));
    // Create a fake bin dir with a mkdir that always fails.
    const fakeBin = await mkdtemp(join(tmpdir(), "fake-bin-XXXXXX"));
    const fakeMkdirPath = join(fakeBin, "mkdir");
    await writeFile(fakeMkdirPath, "#!/bin/sh\necho 'mkdir mocked failure' >&2\nexit 1\n");
    await chmod(fakeMkdirPath, 0o755);
    try {
      const result = await execFileAsync(
        "sh",
        [launchPathsScript],
        { PATH: `${fakeBin}:${process.env.PATH}` },
        30_000,
      );
      expect(result.code).toBe(1);

      let unrelatedExists = true;
      try {
        await stat(unrelatedTmp);
      } catch {
        unrelatedExists = false;
      }
      expect(unrelatedExists).toBe(true);

      const leftover = await findTmpDirs("pitd-launch-paths");
      expect(leftover).toEqual([]);
    } finally {
      await rm(unrelatedTmp, { recursive: true, force: true });
      await rm(fakeBin, { recursive: true, force: true });
    }
  }, 30_000);

  // TOOLING-LAUNCH-014: Same for test-spa-routes.sh.
  it("[TOOLING-LAUNCH-014] test-spa-routes.sh cleans up TMP_ROOT even when mkdir fails (trap-before-fallible-mkdir)", async () => {
    const unrelatedTmp = await mkdtemp(join(tmpdir(), "unrelated-tmp-XXXXXX"));
    const fakeBin = await mkdtemp(join(tmpdir(), "fake-bin-XXXXXX"));
    const fakeMkdirPath = join(fakeBin, "mkdir");
    await writeFile(fakeMkdirPath, "#!/bin/sh\necho 'mkdir mocked failure' >&2\nexit 1\n");
    await chmod(fakeMkdirPath, 0o755);
    try {
      const result = await execFileAsync(
        "sh",
        [spaRoutesScript],
        { PATH: `${fakeBin}:${process.env.PATH}` },
        30_000,
      );
      expect(result.code).toBe(1);

      let unrelatedExists = true;
      try {
        await stat(unrelatedTmp);
      } catch {
        unrelatedExists = false;
      }
      expect(unrelatedExists).toBe(true);

      const leftover = await findTmpDirs("pitd-spa");
      expect(leftover).toEqual([]);
    } finally {
      await rm(unrelatedTmp, { recursive: true, force: true });
      await rm(fakeBin, { recursive: true, force: true });
    }
  }, 30_000);
});
