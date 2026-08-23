#!/usr/bin/env node
// SC-O0 managed conformance server harness.
//
// Owns the full lifecycle of the backend-ada server for the conformance
// suite: builds (or receives) the executable, picks an unused port, creates a
// fresh temporary data dir under a launcher-managed run dir, seeds exact
// bytes before every start, observes readiness, runs vitest with all args
// after `--` forwarded verbatim, and stops only the exact processes it
// spawned. A port collision between the probe and the server's bind (the
// usual small race) is retried on a fresh port, bounded. The server and the
// alr build child are registered at spawn — before readiness — so every
// cleanup path (normal failure, fatal error, SIGINT/SIGTERM/SIGHUP) stops
// them even when startup never completes. Vitest runs detached in its own
// process group so every cleanup path can stop the whole vitest tree
// (workers included) alongside the server. Evidence (run manifest, server
// log, data dir) is preserved on failure and removed on success.
//
// Usage:
//   npm run test:ada -- --run                      full managed suite
//   npm run test:ada -- --run -t <name>            focused name selector
//   npm run test:ada -- --run suites/foo.test.ts   focused file selector
//   node scripts/managed-run.mjs --seed <path> -- --run ...   (seed fixtures)
//
// Launcher options must come before the final `--`; everything after it is
// forwarded to vitest verbatim. With npm, `npm run test:ada -- <options> --
// <vitest args>` works because npm consumes its own `--` (the launcher
// treats the last `--` as the separator). With no `--` at all, all arguments
// are forwarded to vitest (so direct invocations work without a separator);
// with no arguments at all the default is a full `run`.
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
//   --cycles <n>        controlled restarts: stop the server, re-apply seed
//                       bytes, restart, re-run vitest (default 1). The data
//                       dir is created fresh once per run and persists
//                       across restarts, so earlier cycles' writes are
//                       visible to later cycles. Every cycle runs even if an
//                       earlier cycle fails; the run fails overall when any
//                       cycle fails.
//   --static <dir>      server --static dir (default frontend/dist)
//   --games <dir>       server --games dir (default data/games)
//   --test-hooks        pass --test-hooks to the server (default on; the
//                       launcher only ever points at a throwaway data dir)
//   --no-test-hooks     disable --test-hooks
//   --timeout <ms>      readiness polling bound (default 30000)
//   --help              this text
//
// Exit code: the vitest exit code on test failure, 1 on launcher failure,
// 0 when every cycle passed. On failure the run dir is preserved under
// <tmp>/pitd-managed/<run-id>/ and its path is printed to stderr; on success
// it is removed. All machine-readable facts (port, pid, paths) are printed
// to stdout as `[managed-run] key=value` lines.

import { spawn } from "node:child_process";
import { copyFile, cp, mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
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
  return `managed-run.mjs — SC-O0 managed conformance server harness

Usage:
  npm run test:ada -- --run
  npm run test:ada -- --run -t <name>
  npm run test:ada -- --run suites/foo.test.ts
  node scripts/managed-run.mjs [options] -- [vitest args...]

Launcher options (before the final --; via npm run: npm run test:ada -- <options> -- <vitest args>):
  --server <path>     use this executable instead of building the default
  --build             force an alr build even when the executable exists
  --build-dir <dir>   alr project dir (default backend-ada/server)
  --seed <path>       copy fixture bytes into the data dir; repeatable
  --seed-defaults     seed the standard oracle trees (conformance/fixtures/sc-o2-seeds
                      + conformance/fixtures/completeness-seeds) before start; the
                      seed-dependent oracle suites (entity-admission, total-collections,
                      completeness) document their seeded commands in their file headers
  --cycles <n>        controlled restarts with re-seed (default 1; the data
                      dir is fresh once per run and persists across restarts
                      so earlier cycles' writes stay visible; every cycle
                      runs even if an earlier one fails, and the run fails
                      overall when any cycle fails)
  --static <dir>      server --static dir (default frontend/dist)
  --games <dir>       server --games dir (default data/games)
  --test-hooks        pass --test-hooks (default on)
  --no-test-hooks     disable --test-hooks
  --timeout <ms>      readiness bound (default 30000)
  --help              this text

Everything after the final -- is forwarded to vitest verbatim.`;
}

export function parseArgs(argv) {
  // The final `--` separates launcher options from vitest arguments. With
  // npm (`npm run test:ada -- ...`) npm consumes its own `--` and appends
  // everything after it, so launcher options arrive as `-- <options> -- ...`
  // and the LAST `--` is the real separator. Direct invocations pass a
  // single `--`. A leading bare `--` inside the launcher section (npm's
  // consumed separator) is skipped below.
  const dash = argv.lastIndexOf("--");
  const launcherArgs = dash >= 0 ? argv.slice(0, dash) : [];
  const vitestArgs = dash >= 0 ? argv.slice(dash + 1) : argv;
  // A bare `--help`/`-h` invocation (no separator, no other arguments)
  // asks for launcher help; with a `--` separator the flags are forwarded.
  const helpAlone = dash < 0 && argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h");
  const opts = {
    server: null,
    build: false,
    buildDir: null,
    seeds: [],
    cycles: 1,
    staticDir: null,
    gamesDir: null,
    testHooks: true,
    timeoutMs: 30_000,
    help: helpAlone,
    vitestArgs,
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
      case "--cycles": {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 1) throw new Error("--cycles must be a positive integer");
        opts.cycles = n;
        break;
      }
      case "--static":
        opts.staticDir = value();
        break;
      case "--games":
        opts.gamesDir = value();
        break;
      case "--test-hooks":
        opts.testHooks = true;
        break;
      case "--no-test-hooks":
        opts.testHooks = false;
        break;
      case "--timeout": {
        const n = Number(value());
        if (!Number.isInteger(n) || n <= 0) throw new Error("--timeout must be a positive integer (milliseconds)");
        opts.timeoutMs = n;
        break;
      }
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

// Bind port 0 on loopback, read the kernel-assigned port, release it. The
// port is unused at selection time; the gap between close and the server's
// bind is the usual small race, and startServerForCycle retries on a fresh
// port when a competing listener wins it (bounded, see PORT_RETRY_ATTEMPTS).
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

// Bounded number of spawn attempts when the probed port is taken by a
// competing listener between pickPort() and the server's bind. Each retry
// probes a fresh kernel-assigned port.
export const PORT_RETRY_ATTEMPTS = 5;

// The Ada server (AWS) reports a bind failure on stderr with this signature
// (observed: "raised AWS.NET.SOCKET_ERROR : Bind : [98] Address already in
// use") and exits non-zero. The retry loop keys off it so genuine startup
// failures are never masked by retries.
export function isPortCollision(logText) {
  return /address already in use|EADDRINUSE/i.test(logText);
}

// Copy seed sources into the data dir byte-exactly. A file seed lands at
// dataDir/<basename>; a directory seed's contents are merged into dataDir.
// Returns [{ src, dest, kind }] for the run manifest.
export async function seedDataDir(dataDir, seeds) {
  const seeded = [];
  for (const source of seeds) {
    const cwdResolved = resolve(source);
    let src = cwdResolved;
    if (!existsSync(cwdResolved)) {
      const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
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
// signal aborts an in-flight poll immediately (used by waitForHealthOrExit so
// an abandoned poll cannot keep fetching — and keep the event loop alive —
// after the server process has already exited).
export async function waitForHealth(baseUrl, timeoutMs, signal, expectedDataDir) {
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
      if (response.status === 200) {
        let health;
        try {
          health = await response.json();
        } catch {
          lastError = new Error("health returned invalid JSON");
          continue;
        }
        if (health?.implementation === "ada" && resolve(health.dataDir) === resolve(expectedDataDir)) return;
        lastError = new Error("health returned wrong implementation or dataDir");
      } else {
        lastError = new Error(`health returned HTTP ${response.status}`);
      }
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(abortTimer);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(
    `server not ready: GET ${baseUrl}/api/health did not return 200 within ${timeoutMs} ms (last error: ${lastError ?? "no response"})`,
  );
}

// Read the tail of the server log (port-collision evidence and early-exit
// diagnostics). The child holds its own write fd; reading the file directly
// is independent of it.
async function readLogTail(logFile, maxBytes = 4096) {
  try {
    const handle = await open(logFile, "r");
    try {
      const info = await handle.stat();
      const start = Math.max(0, info.size - maxBytes);
      const buffer = Buffer.alloc(info.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

// Race server readiness against an early exit. Resolves null when
// /api/health returns 200; resolves { code, signal } when the server process
// terminates first. A readiness timeout still rejects (a live server that
// never becomes healthy is a startup failure, not a collision). When the
// exit branch wins, the losing health poll is aborted so it stops fetching
// (and stops holding the event loop) instead of polling out its deadline.
async function waitForHealthOrExit(baseUrl, timeoutMs, child, expectedDataDir) {
  const pollController = new AbortController();
  const exited = new Promise((resolvePromise) => {
    child.once("exit", (code, signal) => {
      pollController.abort();
      resolvePromise({ code, signal });
    });
  });
  const healthy = waitForHealth(baseUrl, timeoutMs, pollController.signal, expectedDataDir).then(() => null);
  return Promise.race([healthy, exited]);
}

// Spawn the server on a probed port and hold it until it is healthy. When a
// competing listener wins the port between the probe and the server's bind,
// the server exits non-zero with an EADDRINUSE signature in its log; that is
// retried on a fresh port, bounded by PORT_RETRY_ATTEMPTS. Any other early
// exit is a real startup failure and propagates immediately (with the log
// tail as evidence). Returns { child, port, baseUrl } on success; the caller
// announces the per-attempt port/pid lines through `announce`.
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
      earlyExit = await waitForHealthOrExit(baseUrl, timeoutMs, child, dataDir);
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
        `[managed-run] port ${port} was already in use; retrying with a fresh port (attempt ${attempt + 1}/${PORT_RETRY_ATTEMPTS})`,
      );
    }
  }
  throw new Error(
    `could not start the server: ${PORT_RETRY_ATTEMPTS} consecutive port collisions (EADDRINUSE)`,
  );
}

// Shared stop for an exact spawned child: SIGTERM (to the process group
// when `group` is set — for children spawned detached so they lead their
// own group), escalate to SIGKILL after 5 s, give the exit event at most
// 10 s. Never touches any other PID or group. When the spawn is still in
// flight (no pid assigned yet), the spawn outcome is awaited first so a
// signal landing in that window cannot exit without killing anything and
// orphan the child.
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
    // Clear both timers so a prompt child exit does not hold the event
    // loop open (an uncleared 10 s fallback would delay every run).
    clearTimeout(escalate);
    clearTimeout(fallback);
  }
}

// Stop only the exact spawned process: SIGTERM, escalate to SIGKILL after
// 5 s, give the exit event at most 10 s. Never touches any other PID.
export async function stopServer(child) {
  if (!child) return;
  await stopSpawned(child);
  const logFd = child.logFd;
  child.logFd = null;
  if (logFd) await logFd.close().catch(() => {});
}

// Stop the exact spawned vitest tree: SIGTERM to its process group (vitest
// is spawned detached, so it leads its own group and the negative PID also
// reaches its worker processes), escalate to SIGKILL after 5 s, give the
// exit event at most 10 s. Never touches any other PID or group.
export async function stopVitest(child) {
  await stopSpawned(child, { group: true });
}

// Stop the exact spawned build child (alr) tree: SIGTERM to its process
// group (alr is spawned detached like vitest, so the negative PID also
// reaches its toolchain children), escalate to SIGKILL after 5 s, give the
// exit event at most 10 s. Never touches any other PID or group.
async function stopBuild(child) {
  await stopSpawned(child, { group: true });
}

async function ensureServer(opts, defaults) {
  const exe = resolve(opts.server ?? defaults.server);
  if (!opts.build) {
    const info = await stat(exe).catch(() => null);
    if (info?.isFile() && (info.mode & 0o111) !== 0) return exe;
  }
  const buildDir = resolve(opts.buildDir ?? defaults.buildDir);
  console.error(`[managed-run] building server in ${buildDir} (XDG_RUNTIME_DIR=/tmp alr --non-interactive build)`);
  const code = await new Promise((resolvePromise, rejectPromise) => {
    // The build child is spawned detached in its own process group (like
    // vitest) and registered in activeBuildRef at spawn, so a signal during
    // the build stops the whole alr toolchain tree instead of orphaning it.
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
  // The log file must be open before spawn: Node validates stdio fds
  // synchronously, so a lazily-opening WriteStream is rejected.
  const logFd = await open(logFile, "a");
  const child = spawn(exe, args, { stdio: ["ignore", logFd.fd, logFd.fd] });
  child.logFd = logFd;
  // Registered at spawn — before readiness — so every cleanup path (normal
  // failure, fatal error, SIGINT/SIGTERM/SIGHUP) can stop the exact PID
  // even when startup never completes. Cleared on exit so a superseded
  // attempt (port-collision retry) never points the cleanup at a dead
  // process.
  activeServerRef.current = child;
  child.spawned = new Promise((resolvePromise) => {
    child.once("spawn", () => resolvePromise(true));
    child.once("error", () => resolvePromise(false));
  });
  child.once("exit", () => {
    if (activeServerRef.current === child) activeServerRef.current = null;
  });
  child.on("error", () => {
    // Spawn errors surface through the readiness bound or the exit promise;
    // an unhandled 'error' event would crash the launcher.
  });
  return new Promise((resolvePromise, rejectPromise) => {
    child.once("spawn", () => resolvePromise(child));
    child.once("error", (error) => {
      if (activeServerRef.current === child) activeServerRef.current = null;
      logFd.close().catch(() => {});
      rejectPromise(error);
    });
  });
}

// Spawn vitest detached in its own process group so the cleanup paths can
// terminate the whole tree (vitest plus its workers) with one group signal
// and never touch the launcher's own group. The child is registered in
// activeVitestRef until it exits; returns { child, promise } so the caller
// can announce the PID immediately and await the exit code.
function runVitest(vitestArgs, baseUrl) {
  const vitest = resolve(conformanceDir, "node_modules", "vitest", "vitest.mjs");
  const child = spawn(process.execPath, [vitest, ...vitestArgs], {
    cwd: conformanceDir,
    stdio: "inherit",
    detached: true,
    env: { ...process.env, CONFORMANCE_BASE_URL: baseUrl, BASE_URL: baseUrl },
  });
  activeVitestRef.current = child;
  child.spawned = new Promise((resolvePromise) => {
    child.once("spawn", () => resolvePromise(true));
    child.once("error", () => resolvePromise(false));
  });
  child.once("exit", () => {
    if (activeVitestRef.current === child) activeVitestRef.current = null;
  });
  const promise = new Promise((resolvePromise, rejectPromise) => {
    child.once("error", (error) => {
      if (activeVitestRef.current === child) activeVitestRef.current = null;
      rejectPromise(error);
    });
    child.once("exit", (code) => resolvePromise(code ?? 1));
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

  const vitestArgs = opts.vitestArgs.length > 0 ? opts.vitestArgs : ["run"];
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
  const runDir = join(defaults.managedRoot, runId);
  const logFile = join(runDir, "server.log");
  const dataDir = join(runDir, "data");
  activeRunDirRef.current = runDir;

  let lastPort = null;
  let failure = null;

  const announce = (fields) => {
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== "") console.log(`[managed-run] ${key}=${value}`);
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
      testHooks: opts.testHooks,
      cycles: opts.cycles,
      vitestArgs,
      staticDir,
      gamesDir,
      seeds: opts.seeds.map((source) => resolve(source)),
      createdAt: new Date().toISOString(),
    };

    announce({ runId, server: exe, cycles: opts.cycles, staticDir, gamesDir });

    for (let cycle = 1; cycle <= opts.cycles; cycle++) {
      // The data dir is created fresh once per run and persists across
      // controlled restarts; exact seed bytes are re-applied before every
      // start (initial start and between restarts).
      const seeded = await seedDataDir(dataDir, opts.seeds);

      announce({ cycle: `${cycle}/${opts.cycles}`, dataDir, logFile, runDir });
      for (const entry of seeded) announce({ seed: `${entry.src} -> ${entry.dest} (${entry.kind})` });

      await writeFile(
        join(runDir, "run.json"),
        JSON.stringify({ ...base, cycle: { number: cycle, port: null, baseUrl: null, dataDir, logFile }, pid: null }, null, 2) + "\n",
      );

      const started = await startServerForCycle(
        { exe, staticDir, gamesDir, testHooks: opts.testHooks, dataDir, logFile, timeoutMs: opts.timeoutMs },
        announce,
      );
      lastPort = started.port;
      await writeFile(
        join(runDir, "run.json"),
        JSON.stringify({ ...base, cycle: { number: cycle, port: started.port, baseUrl: started.baseUrl, dataDir, logFile }, pid: started.child.pid }, null, 2) + "\n",
      );

      const vitest = runVitest(vitestArgs, started.baseUrl);
      announce({ vitestPid: vitest.child.pid });
      const code = await vitest.promise;
      if (code !== 0 && failure === null) {
        failure = { exitCode: code, reason: `vitest exited with code ${code} (cycle ${cycle})` };
      }
      await stopServer(started.child);
    }

  } catch (error) {
    failure = { exitCode: 1, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await stopVitest(activeVitestRef.current);
    await stopServer(activeServerRef.current);
    await stopBuild(activeBuildRef.current);
    if (failure !== null) {
      console.error(`[managed-run] FAILED: ${failure.reason}`);
      console.error(
        `[managed-run] failure evidence removed: runDir=${runDir} dataDir=${dataDir} log=${logFile} port=${lastPort ?? "none"}`,
      );
      process.exitCode = failure.exitCode;
    }
    await rm(runDir, { recursive: true, force: true });
    if (activeRunDirRef.current === runDir) activeRunDirRef.current = null;
    if (failure === null) console.error(`[managed-run] success; evidence removed (${runDir})`);
  }
}

// Module-level references so the signal handler can reach the running
// vitest tree, server, and build child even while main() is awaiting inside
// its own try/finally. The server and build children are registered at spawn
// (before readiness / before the build completes) and cleared on exit;
// vitest is registered at spawn and cleared on exit.
const activeServerRef = { current: null };
const activeVitestRef = { current: null };
const activeBuildRef = { current: null };
const activeRunDirRef = { current: null };

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  // EPIPE (e.g. `... | head`) must not crash the launcher mid-run: without
  // these handlers an uncaught stdout error would skip the finally block
  // and orphan the server.
  process.stdout.on("error", () => {});
  process.stderr.on("error", () => {});
  // Last-resort safety net: any uncaught error still stops the exact server
  // PID (evidence stays; abnormal termination counts as failure) before the
  // launcher exits non-zero.
  const fatal = (error) => {
    console.error(`[managed-run] fatal: ${error instanceof Error ? error.message : String(error)}`);
    Promise.all([
      stopServer(activeServerRef.current),
      stopVitest(activeVitestRef.current),
      stopBuild(activeBuildRef.current),
    ])
      .catch(() => {})
      .then(async () => {
        if (typeof activeRunDirRef.current === "string") {
          await rm(activeRunDirRef.current, { recursive: true, force: true }).catch(() => {});
        }
      })
      .finally(() => process.exit(1));
  };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      console.error(`[managed-run] received ${signal}; stopping vitest, server, and build child and removing owned evidence`);
      void mainCleanupAndExit(signal);
    });
  }
  main().catch((error) => {
    console.error(`[managed-run] launcher error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

// Signal-path shutdown: stop the exact spawned vitest tree first (it is the
// active consumer), then the exact spawned server and build child, remove the
// exact active run directory, then exit. Server and build children are
// registered at spawn, so this also
// works while startup (readiness poll or alr build) is still in flight.
async function mainCleanupAndExit(signal) {
  await stopVitest(activeVitestRef.current);
  await stopServer(activeServerRef.current);
  await stopBuild(activeBuildRef.current);
  if (typeof activeRunDirRef.current === "string") {
    await rm(activeRunDirRef.current, { recursive: true, force: true }).catch(() => {});
  }
  const code = 128 + (signal === "SIGHUP" ? 1 : signal === "SIGINT" ? 2 : 15);
  process.exit(code);
}
