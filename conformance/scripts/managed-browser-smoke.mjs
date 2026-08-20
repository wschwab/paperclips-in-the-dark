#!/usr/bin/env node
// Wave-0 managed browser-smoke launcher.
//
// Owns the full lifecycle of the backend-ada server for a browser-smoke (or any
// arbitrary) command: builds (or receives) the executable, picks an unused
// loopback port, creates a fresh temporary data dir under a launcher-managed run
// dir, seeds exact bytes before every start, observes readiness, then spawns the
// required `-- command` with BASE_URL, CONFORMANCE_BASE_URL, and PITD_DATA_DIR
// in its environment. It stops only the exact processes it spawned: the server is
// killed by its exact PID, while the build child and the command run detached in
// their own process groups and are signalled with the negative PID (so a signal
// reaches their whole tree). Evidence (run manifest, server log, data dir) is
// removed on success unless --keep, and preserved on failure.
//
// Sibling of conformance/scripts/managed-run.mjs (the vitest harness): the
// server lifecycle (build/port/seed/static/games/timeout/health/cleanup) is
// shared logic, but this launcher drives an arbitrary command instead of vitest, so a
// browser smoke surfaced through a browser tool can reuse the same managed server.
//
// Usage:
//   node scripts/managed-browser-smoke.mjs [options] -- <command> [args...]
//
// Launcher options must come before the FIRST `--`; everything after it is the
// command and is forwarded verbatim (the `--` and command are REQUIRED). With
// npm, `npm run <script> -- <options> -- <command>` works because npm consumes
// its own `--` and appends everything after it, so the first `--` the launcher
// sees is the real separator.
//
// Options:
//   --server <path>     use this executable instead of the default
//   --build             force `alr --non-interactive build` even when the
//                       default executable already exists
//   --build-dir <dir>   alr project dir (default backend-ada/server)
//   --seed <path>       copy fixture bytes into the data dir before start;
//                       repeatable. A file lands at dataDir/<basename>; a
//                       directory's contents are merged into dataDir. Paths
//                       resolve against the current working directory.
//   --seed-defaults     seed the standard oracle trees (conformance/fixtures/sc-o2-seeds
//                       + conformance/fixtures/completeness-seeds) before start
//   --static <dir>      server --static dir (default frontend/dist)
//   --games <dir>       server --games dir (default data/games)
//   --timeout <ms>      readiness bound (default 30000)
//   --keep              keep the run dir on success (by default success removes it)
//   --help             this text
//
// Exit code: 0 when the command exits 0; otherwise the command's exit code (or
// 128+signal). On failure (including a command failure) the run dir is preserved
// under <tmp>/pitd-managed/ and its path is printed to stderr.

import { spawn } from "node:child_process";
import { copyFile, cp, mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const conformanceDir = resolve(scriptDir, "..");
export const repoRoot = resolve(scriptDir, "..", "..");

export function defaultPaths() {
  return {
    server: join(repoRoot, "backend-ada", "server", "bin", "pitd"),
    buildDir: join(repoRoot, "backend-ada", "server"),
    staticDir: join(repoRoot, "frontend", "dist"),
    gamesDir: join(repoRoot, "data", "games"),
    managedRoot: join(tmpdir(), "pitd-managed"),
  };
}

export function usage() {
  return `managed-browser-smoke.mjs — Wave-0 managed browser-smoke launcher

Usage:
  node scripts/managed-browser-smoke.mjs [options] -- <command> [args...]

Launcher options (before the FIRST --; via npm run: npm run <script> -- <options> -- <command>):
  --server <path>     use this executable instead of building the default
  --build             force an alr build even when the executable exists
  --build-dir <dir>   alr project dir (default backend-ada/server)
  --seed <path>       copy fixture bytes into the data dir; repeatable
  --seed-defaults     seed the standard oracle trees (conformance/fixtures/sc-o2-seeds
                      + conformance/fixtures/completeness-seeds) before start
  --static <dir>      server --static dir (default frontend/dist)
  --games <dir>       server --games dir (default data/games)
  --timeout <ms>      readiness bound (default 30000)
  --keep              keep the run dir on success (by default success removes it)
  --help              this text

The FIRST -- separates launcher options from the command; everything after it is the
command and is REQUIRED. The command runs with BASE_URL, CONFORMANCE_BASE_URL,
and PITD_DATA_DIR in its environment, targeting the managed server.`;
}

export function parseArgs(argv) {
  // The FIRST `--` separates launcher options from the required command. With npm
  // (`npm run <script> -- <options> -- <command>`) npm consumes its own `--`
  // and appends everything after it, so the first `--` the launcher sees is the
  // real separator. A leading bare `--` inside the launcher section (npm's
  // consumed separator) is skipped below. Anything after the separator is the command
  // verbatim (even further `--` tokens belong to the command).
  const dash = argv.indexOf("--");
  const launcherArgs = dash >= 0 ? argv.slice(0, dash) : [];
  const command = dash >= 0 ? argv.slice(dash + 1) : [];
  const helpAlone = dash < 0 && argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h");
  const opts = {
    server: null,
    build: false,
    buildDir: null,
    seeds: [],
    staticDir: null,
    gamesDir: null,
    timeoutMs: 30_000,
    keep: false,
    help: helpAlone,
    command,
  };
  for (let i = 0; i < launcherArgs.length; i++) {
    const arg = launcherArgs[i];
    if (arg === "--") continue; // npm's consumed separator (harmless if absent)
    const value = () => {
      const next = launcherArgs[i + 1];
      if (next === undefined) throw new Error(`missing value for ${arg}`);
      i += 1;
      return next;
    };
    switch (arg) {
      case "--server":
        opts.server = value();
        break;
      case "--build":
        opts.build = true;
        break;
      case "--build-dir":
        opts.buildDir = value();
        break;
      case "--seed":
        opts.seeds.push(value());
        break;
      case "--seed-defaults": {
        const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
        opts.seeds.push(join(repoRoot, "conformance/fixtures/sc-o2-seeds"));
        opts.seeds.push(join(repoRoot, "conformance/fixtures/completeness-seeds"));
        break;
      }
      case "--static":
        opts.staticDir = value();
        break;
      case "--games":
        opts.gamesDir = value();
        break;
      case "--timeout": {
        const n = Number(value());
        if (!Number.isInteger(n) || n <= 0) throw new Error("--timeout must be a positive integer (milliseconds)");
        opts.timeoutMs = n;
        break;
      }
      case "--keep":
        opts.keep = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        throw new Error(`unknown launcher option ${arg}; launcher options must precede -- (or use --help)`);
    }
  }
  return opts;
}

// The environment handed to the command child: the server base URL (both the test
// convention names) and the server's data dir. Pure so the tests can assert the
// exact contract without a server.
export function buildChildEnv({ baseUrl, dataDir }) {
  return {
    BASE_URL: baseUrl,
    CONFORMANCE_BASE_URL: baseUrl,
    PITD_DATA_DIR: dataDir,
  };
}

// Path-safety helper: is `candidate` (resolved) strictly inside `root`?
// `sep` is treated as the plain string separator — never a regular expression — so a
// root like "/tmp/pitd-managed" never falsely matches a sibling
// "/tmp/pitd-managed-other". Equality is not "inside".
export function isSubpath(root, candidate) {
  const normalized = resolve(root);
  return resolve(candidate).startsWith(normalized + sep) && resolve(candidate) !== normalized;
}

// Exit-code helpers. A child killed by a signal reports 128+<signal>; a child
// that exits normally reports its own code (or 1 when it never produced one).
const SIGNAL_NUMBER = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 };
export function signalExitCode(signal) {
  const n = signal in SIGNAL_NUMBER ? SIGNAL_NUMBER[signal] : 1;
  return 128 + n;
}
export function childExitCode(code, signal) {
  if (signal) return signalExitCode(signal);
  return code ?? 1;
}

// Bind port 0 on loopback, read the kernel-assigned port, release it. The
// port is unused at selection time; the gap between close and the server's bind is
// the usual small race, and startServerForCycle retries on a fresh port when a
// competing listener wins it (bounded, see PORT_RETRY_ATTEMPTS).
export async function pickPort() {
  const probe = createServer();
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      probe.once("error", rejectPromise);
      probe.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = probe.address();
    if (address === null || typeof address === "string") throw new Error("port probe bound to no TCP port");
    return address.port;
  } finally {
    await new Promise((resolvePromise) => probe.close(resolvePromise));
  }
}

// Bounded number of spawn attempts when the probed port is taken by a competing
// listener between pickPort() and the server's bind.
export const PORT_RETRY_ATTEMPTS = 5;

// The Ada server (AWS) reports a bind failure on stderr with this signature and
// exits non-zero. The retry loop keys off it so genuine startup failures are never
// masked by retries.
export function isPortCollision(logText) {
  return /address already in use|EADDRINUSE/i.test(logText);
}

// Copy seed sources into the data dir byte-exactly. A file seed lands at
// dataDir/<basename>; a directory seed's contents are merged into dataDir.
// Returns [{ src, dest, kind }] for the run manifest.
export async function seedDataDir(dataDir, seeds) {
  const seeded = [];
  for (const source of seeds) {
    let src = source;
    if (!existsSync(src)) {
      const rootResolved = resolve(repoRoot, source);
      if (existsSync(rootResolved)) src = rootResolved;
    }
    const info = await stat(src).catch(() => {
      throw new Error(`seed source not found: ${src}`);
    });
    if (info.isDirectory()) {
      await cp(src, dataDir, { recursive: true, force: true });
      seeded.push({ src, dest: dataDir, kind: "dir" });
    } else if (info.isFile()) {
      const dest = join(dataDir, basename(src));
      await copyFile(src, dest);
      seeded.push({ src, dest, kind: "file" });
    } else {
      throw new Error(`seed source is neither file nor directory: ${src}`);
    }
  }
  return seeded;
}

// Poll GET /api/health until 200, bounded by timeoutMs. An optional external
// signal aborts an in-flight poll immediately (used by waitForHealthOrExit).
export async function waitForHealth(baseUrl, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error("health poll aborted (server exited before readiness)");
    }
    let controller;
    let abortTimer;
    try {
      controller = new AbortController();
      abortTimer = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
      });
      if (response.status === 200) return;
      lastError = new Error(`health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(abortTimer);
    }
  }
  throw lastError ?? new Error(`health never became ready within ${timeoutMs}ms`);
}

// Read the tail of the server log (port-collision evidence and early-exit
// diagnostics). The child holds its own write fd; reading the file directly is
// independent of it.
async function readLogTail(logFile, maxBytes = 4096) {
  let handle;
  try {
    handle = await open(logFile, "r");
    const size = Number((await handle.stat()).size);
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close().catch(() => {});
  }
}

// Race server readiness against an early exit. Resolves null when /api/health
// returns 200; resolves { code, signal } when the server process terminates first.
async function waitForHealthOrExit(baseUrl, timeoutMs, child) {
  const pollController = new AbortController();
  const exited = new Promise((resolvePromise) => {
    child.once("exit", (code, signal) => {
      pollController.abort();
      resolvePromise({ code, signal });
    });
  });
  const healthy = waitForHealth(baseUrl, timeoutMs, pollController.signal).then(() => null);
  return Promise.race([healthy, exited]);
}

// Spawn the server on a probed port and hold it until it is healthy. Retries on
// a fresh port on a port collision, bounded by PORT_RETRY_ATTEMPTS. Any other
// early exit is a real startup failure and propagates immediately. Returns
// { child, port, baseUrl } on success.
async function startServerForCycle(
  { exe, staticDir, gamesDir, testHooks, dataDir, logFile, timeoutMs },
  announce,
) {
  for (let attempt = 1; attempt <= PORT_RETRY_ATTEMPTS; attempt++) {
    const port = await pickPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    announce({ port, baseUrl });
    const child = await spawnServer(exe, { port, dataDir, staticDir, gamesDir, testHooks }, logFile);
    announce({ pid: child.pid });
    let earlyExit;
    try {
      earlyExit = await waitForHealthOrExit(baseUrl, timeoutMs, child);
    } catch (error) {
      await stopServer(child);
      throw error;
    }
    if (earlyExit === null) {
      announce({ ready: baseUrl });
      return { child, port, baseUrl };
    }
    const logTail = await readLogTail(logFile);
    await stopServer(child);
    if (!isPortCollision(logTail)) {
      throw new Error(
        `server exited before readiness on port ${port} (exit ${earlyExit.code}, signal ${earlyExit.signal}); ` +
          `log tail: ${logTail.trim() || "(empty)"}`,
      );
    }
    if (attempt < PORT_RETRY_ATTEMPTS) {
      console.error(
        `[managed-browser-smoke] port ${port} was already in use; retrying with a fresh port (attempt ${attempt + 1}/${PORT_RETRY_ATTEMPTS})`,
      );
    }
  }
  throw new Error(
    `could not start the server: ${PORT_RETRY_ATTEMPTS} consecutive port collisions (EADDRINUSE)`,
  );
}

// Shared stop for an exact spawned child: SIGTERM (to the process group when
// `group` is set — for children spawned detached so they lead their own group),
// escalate to SIGKILL after 5 s, give the exit event at most 10 s. Never
// touches any other PID or group.
async function stopSpawned(child, { group = false } = {}) {
  if (!child) return;
  if (child.pid === undefined && child.exitCode === null && child.signalCode === null) {
    await child.spawned;
  }
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const pid = group ? -child.pid : child.pid;
  const exited = new Promise((resolvePromise) => child.once("exit", resolvePromise));
  let escalate;
  let fallback;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ESRCH: already gone.
  }
  escalate = setTimeout(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ESRCH: already gone.
    }
  }, 5000);
  const wait = new Promise((resolvePromise) => {
    fallback = setTimeout(resolvePromise, 10_000);
  });
  try {
    await Promise.race([exited, wait]);
  } finally {
    clearTimeout(escalate);
    clearTimeout(fallback);
  }
}

// Stop only the exact spawned process: SIGTERM, escalate to SIGKILL after 5 s,
// give the exit event at most 10 s. Never touches any other PID.
async function stopServer(child) {
  if (!child) return;
  await stopSpawned(child);
  const logFd = child.logFd;
  child.logFd = null;
  if (logFd) await logFd.close().catch(() => {});
}

// Stop the exact spawned build child (alr) tree: SIGTERM to its process group
// (alr is spawned detached like the command, so the negative PID also reaches its
// toolchain children), escalate to SIGKILL after 5 s.
async function stopBuild(child) {
  await stopSpawned(child, { group: true });
}

// Stop the exact spawned command tree: SIGTERM to its process group (the command
// runs via a detached shell in its own group, so the negative PID also reaches its
// descendants), escalate to SIGKILL after 5 s.
async function stopCommand(child) {
  await stopSpawned(child, { group: true });
}

async function ensureServer(opts, defaults) {
  const exe = resolve(opts.server ?? defaults.server);
  if (!opts.build) {
    const info = await stat(exe).catch(() => null);
    if (info?.isFile() && (info.mode & 0o111) !== 0) return exe;
  }
  const buildDir = resolve(opts.buildDir ?? defaults.buildDir);
  console.error(`[managed-browser-smoke] building server in ${buildDir} (XDG_RUNTIME_DIR=/tmp alr --non-interactive build)`);
  const code = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("alr", ["--non-interactive", "build"], {
      cwd: buildDir,
      env: { ...process.env, XDG_RUNTIME_DIR: "/tmp" },
      stdio: "inherit",
      detached: true,
    });
    activeBuildRef.current = child;
    child.spawned = new Promise((resolvePromiseSpawn) => {
      child.once("spawn", () => resolvePromiseSpawn(true));
      child.once("error", () => resolvePromiseSpawn(false));
    });
    const clearRef = () => {
      if (activeBuildRef.current === child) activeBuildRef.current = null;
    };
    child.once("error", (error) => {
      clearRef();
      rejectPromise(error);
    });
    child.once("exit", (exitCode) => {
      clearRef();
      resolvePromise(exitCode ?? 1);
    });
  });
  if (code !== 0) throw new Error(`alr build failed with exit code ${code} (cwd ${buildDir})`);
  const info = await stat(exe).catch(() => null);
  if (!info?.isFile() || (info.mode & 0o111) === 0) throw new Error(`build finished but ${exe} is not an executable file`);
  return exe;
}

async function spawnServer(exe, { port, dataDir, staticDir, gamesDir, testHooks }, logFile) {
  const args = ["--port", String(port), "--data", dataDir, "--static", staticDir, "--games", gamesDir];
  if (testHooks) args.push("--test-hooks");
  const logFd = await open(logFile, "a");
  const child = spawn(exe, args, { stdio: ["ignore", logFd.fd, logFd.fd] });
  child.logFd = logFd;
  // Registered at spawn — before readiness — so every cleanup path can stop the
  // exact PID even when startup never completes.
  activeServerRef.current = child;
  child.spawned = new Promise((resolvePromise) => {
    child.once("spawn", () => resolvePromise(true));
    child.once("error", () => resolvePromise(false));
  });
  child.once("exit", () => {
    if (activeServerRef.current === child) activeServerRef.current = null;
  });
  child.on("error", () => {});
  return new Promise((resolvePromise, rejectPromise) => {
    child.once("spawn", () => resolvePromise(child));
    child.once("error", (error) => {
      if (activeServerRef.current === child) activeServerRef.current = null;
      logFd.close().catch(() => {});
      rejectPromise(error);
    });
  });
}

// Spawn the command via a detached shell in its own process group so every cleanup
// path can terminate the whole tree (the command plus any descendants) with one group
// signal and never touch the launcher's own group. The child is registered in
// activeCommandRef until it exits; returns { child, promise }.
function runCommand(command, baseUrl, dataDir) {
  const shell = process.env.SHELL || "/bin/sh";
  const child = spawn(shell, ["-c", command.join(" ")], {
    cwd: process.cwd(),
    stdio: "inherit",
    detached: true,
    env: { ...process.env, ...buildChildEnv({ baseUrl, dataDir }) },
  });
  activeCommandRef.current = child;
  child.spawned = new Promise((resolvePromise) => {
    child.once("spawn", () => resolvePromise(true));
    child.once("error", () => resolvePromise(false));
  });
  child.once("exit", () => {
    if (activeCommandRef.current === child) activeCommandRef.current = null;
  });
  const promise = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", (error) => {
      if (activeCommandRef.current === child) activeCommandRef.current = null;
      rejectPromise(error);
    });
    child.once("exit", (code, signal) => resolvePromise(childExitCode(code, signal)));
  });
  return { child, promise };
}

export async function main(argv = process.argv.slice(2)) {
  const defaults = defaultPaths();
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(usage());
    return;
  }
  if (opts.command.length === 0) {
    throw new Error("a command is required after the first `--` (see --help)");
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
  const runDir = join(defaults.managedRoot, runId);
  const logFile = join(runDir, "server.log");
  const dataDir = join(runDir, "data");

  let lastPort = null;
  let failure = null;

  const announce = (fields) => {
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== "") console.log(`[managed-browser-smoke] ${key}=${value}`);
    }
  };

  try {
    await mkdir(runDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    const exe = await ensureServer(opts, defaults);
    const staticDir = resolve(opts.staticDir ?? defaults.staticDir);
    const gamesDir = resolve(opts.gamesDir ?? defaults.gamesDir);
    const base = {
      runId,
      serverExe: exe,
      keep: opts.keep,
      timeoutMs: opts.timeoutMs,
      command: opts.command,
      staticDir,
      gamesDir,
      seeds: opts.seeds.map((source) => resolve(source)),
      createdAt: new Date().toISOString(),
    };

    announce({ runId, server: exe, staticDir, gamesDir, command: opts.command.join(" ") });

    const seeded = await seedDataDir(dataDir, opts.seeds);
    await writeFile(
      join(runDir, "run.json"),
      JSON.stringify({ ...base, pid: null, dataDir, logFile, port: null, baseUrl: null }, null, 2) + "\n",
    );

    announce({ dataDir, logFile, runDir });
    for (const entry of seeded) announce({ seed: `${entry.src} -> ${entry.dest} (${entry.kind})` });

    const started = await startServerForCycle(
      { exe, staticDir, gamesDir, testHooks: true, dataDir, logFile, timeoutMs: opts.timeoutMs },
      announce,
    );
    lastPort = started.port;
    await writeFile(
      join(runDir, "run.json"),
      JSON.stringify({ ...base, pid: started.child.pid, dataDir, logFile, port: started.port, baseUrl: started.baseUrl }, null, 2) + "\n",
    );

    const command = runCommand(opts.command, started.baseUrl, dataDir);
    announce({ commandPid: command.child.pid });
    const code = await command.promise;
    if (code !== 0 && failure === null) {
      failure = { exitCode: code, reason: `command exited with code ${code}: ${opts.command.join(" ")}` };
    }
    await stopServer(started.child);

    if (failure === null) {
      if (opts.keep) {
        console.error(`[managed-browser-smoke] success; run dir kept (${runDir})`);
      } else {
        await rm(runDir, { recursive: true, force: true });
        console.error(`[managed-browser-smoke] success; evidence removed (${runDir})`);
      }
    }
  } catch (error) {
    failure = { exitCode: 1, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await stopCommand(activeCommandRef.current);
    await stopServer(activeServerRef.current);
    await stopBuild(activeBuildRef.current);
    if (failure !== null) {
      console.error(`[managed-browser-smoke] FAILED: ${failure.reason}`);
      console.error(
        `[managed-browser-smoke] evidence preserved: runDir=${runDir} dataDir=${dataDir} log=${logFile} port=${lastPort ?? "none"}`,
      );
      process.exitCode = failure.exitCode;
    }
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  process.stdout.on("error", () => {});
  process.stderr.on("error", () => {});
  const fatal = (error) => {
    console.error(`[managed-browser-smoke] fatal: ${error instanceof Error ? error.message : String(error)}`);
    Promise.all([
      stopServer(activeServerRef.current),
      stopCommand(activeCommandRef.current),
      stopBuild(activeBuildRef.current),
    ])
      .catch(() => {})
      .finally(() => process.exit(1));
  };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      console.error(`[managed-browser-smoke] received ${signal}; stopping command, server, and build child and preserving evidence`);
      void mainCleanupAndExit(signal);
    });
  }
  main().catch((error) => {
    console.error(`[managed-browser-smoke] launcher error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

async function mainCleanupAndExit(signal) {
  await stopCommand(activeCommandRef.current);
  await stopServer(activeServerRef.current);
  await stopBuild(activeBuildRef.current);
  process.exit(signalExitCode(signal));
}

// Module-level references so the signal handler can reach the running command tree,
// server, and build child even while main() is awaiting inside its own try/finally.
// Server and build children are registered at spawn (before readiness / before the
// build completes); the command is registered at spawn.
const activeServerRef = { current: null };
const activeCommandRef = { current: null };
const activeBuildRef = { current: null };
