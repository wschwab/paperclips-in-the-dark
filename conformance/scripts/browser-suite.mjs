#!/usr/bin/env node
// BROWSER-01 — repository-owned managed Chromium runner.
//
// Drives real headless Chromium journeys against the backend-ada server with
// the exact lifecycle owned by scripts/managed-browser-smoke.mjs: that launcher
// builds (or reuses) the server executable, picks an unused loopback port,
// seeds a fresh temporary data dir (--seed-defaults), observes readiness, and
// runs the command below with BASE_URL / CONFORMANCE_BASE_URL / PITD_DATA_DIR
// in its environment. This script never spawns or kills the server itself —
// it only asserts the launcher's success line, which is the launcher's
// contract that the exact-PID cleanup happened (no leaked server/temp data).
//
// Two modes in one file:
//   parent (default): ensures frontend/dist is fresh, then spawns
//     managed-browser-smoke.mjs --seed-defaults -- <this file> --child
//     and fails unless the launcher exits 0 AND prints its success line AND
//     the child's journey results all pass.
//   child (--child): launched by the launcher with BASE_URL set; resolves a
//     Chromium executable, loads every conformance/suites-browser/*.journey.mjs,
//     drives each in a fresh browser context, probes every visited route for
//     decode-failure notices and horizontal overflow, enforces the request
//     allowlist (same-origin /api + static), and emits artifacts to a run dir
//     under ${tmpdir()}/pitd-browser/<runId>/ (outside the launcher's run dir,
//     which the launcher removes on success).
//
// Usage:
//   npm run test:browser              # headless (CI semantics)
//   npm run test:browser -- --headed  # headed diagnostic mode: ONLY flips
//                                     # headless:false; everything else
//                                     # (seeds, allowlist, probes, artifacts)
//                                     # is identical.
//   node scripts/browser-suite.mjs [--headed] [--force-frontend-build]
//
// Exit code 0 requires ALL of: fresh frontend build, launcher exit 0 +
// success line, every journey passing, zero console/page errors, zero
// unexpected requests, zero decode-failure notices, zero horizontal overflow,
// and every declared checkpoint recorded.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { resolveChromiumExecutable } from "./lib/chromium-resolve.mjs";

const scriptDir = dirnameOf(import.meta.url);
const conformanceDir = resolve(scriptDir, "..");
const repoRoot = resolve(conformanceDir, "..");
const frontendDir = join(repoRoot, "frontend");
const suitesBrowserDir = join(conformanceDir, "suites-browser");

function dirnameOf(url) {
  return fileURLToPath(new URL(".", url));
}

// ---------------------------------------------------------------------------
// Shared CLI parsing
// ---------------------------------------------------------------------------

function parseCli(argv) {
  const opts = { child: false, headed: false, forceFrontendBuild: false, help: false };
  for (const arg of argv) {
    switch (arg) {
      case "--child": opts.child = true; break;
      case "--headed": opts.headed = true; break;
      case "--force-frontend-build": opts.forceFrontendBuild = true; break;
      case "--help":
      case "-h": opts.help = true; break;
      default:
        throw new Error(`unknown option ${arg} (supported: --child, --headed, --force-frontend-build, --help)`);
    }
  }
  return opts;
}

function usage() {
  return `browser-suite.mjs — managed Chromium journey runner (BROWSER-01)

Usage:
  npm run test:browser [-- --headed]

Options:
  --child                internal: run journeys against BASE_URL provided by
                         scripts/managed-browser-smoke.mjs (the launch boundary).
  --headed               diagnostic mode: headless:false ONLY; seeds, probes,
                         allowlist, artifacts, and exit semantics are unchanged.
  --force-frontend-build rebuild frontend/dist even when it looks newer than src.
  --help                 this text.

Artifacts land in \${tmpdir()}/pitd-browser/<runId>/ and the final path is printed.`;
}

// ---------------------------------------------------------------------------
// Parent mode
// ---------------------------------------------------------------------------

async function newestMtimeUnder(dir) {
  let newest = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue; // vanished mid-scan; treat as no signal
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

// Freshness rule: vite build rewrites every output, so dist/index.html's mtime
// approximates the last build time. Rebuild when that marker is missing or
// older than ANY source input (frontend/src recursively, index.html, tsconfig,
// package.json, vite config). Documented tradeoff: a touched-but-semantically
// identical source file triggers one extra build; a stale dist never goes
// unnoticed.
async function frontendDistIsFresh() {
  const marker = join(frontendDir, "dist", "index.html");
  if (!existsSync(marker)) return false;
  const builtAt = statSync(marker).mtimeMs;
  const srcNewest = await newestMtimeUnder(join(frontendDir, "src"));
  let configNewest = 0;
  for (const name of ["index.html", "package.json", "tsconfig.json"]) {
    const full = join(frontendDir, name);
    if (existsSync(full)) configNewest = Math.max(configNewest, statSync(full).mtimeMs);
  }
  for (const name of await readdir(frontendDir)) {
    if (/^vite\.config\./.test(name)) {
      configNewest = Math.max(configNewest, statSync(join(frontendDir, name)).mtimeMs);
    }
  }
  return builtAt >= Math.max(srcNewest, configNewest);
}

async function buildFrontend() {
  console.log("[browser-suite] building frontend (npm run build in frontend/)…");
  const result = await new Promise((resolvePromise) => {
    const child = spawn("npm", ["run", "build"], { cwd: frontendDir, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { out += chunk; });
    child.once("error", (error) => resolvePromise({ code: 1, output: String(error) }));
    child.once("exit", (code) => resolvePromise({ code: code ?? 1, output: out }));
  });
  if (result.code !== 0) {
    const tail = result.output.split("\n").slice(-40).join("\n");
    throw new Error(`frontend build failed (exit ${result.code}); tail of output:\n${tail}`);
  }
}

async function runParent(opts) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
  const artifactsDir = join(tmpdir(), "pitd-browser", runId);
  await mkdir(join(artifactsDir, "screenshots"), { recursive: true });

  if (opts.forceFrontendBuild || !(await frontendDistIsFresh())) {
    await buildFrontend();
  } else {
    console.log("[browser-suite] frontend/dist is newer than src; skipping vite build");
  }

  // The command the launcher runs after `--`. Absolute paths so the detached
  // shell spawned by the launcher resolves them regardless of cwd.
  const suiteSelf = join(scriptDir, "browser-suite.mjs");
  const smoke = join(scriptDir, "managed-browser-smoke.mjs");

  console.log(`[browser-suite] artifacts dir: ${artifactsDir}`);
  let launcherStderr = "";
  let launcherStdout = "";
  const command = [
    "node",
    suiteSelf,
    "--child",
    ...(opts.headed ? ["--headed"] : []),
  ];
  const launcherArgs = [
    smoke,
    "--seed-defaults",
    "--",
    ...command,
  ];
  const launcherCode = await new Promise((resolvePromise) => {
    const child = spawn("node", launcherArgs, {
      cwd: conformanceDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PITD_BROWSER_ARTIFACTS: artifactsDir },
    });
    child.stdout.on("data", (chunk) => {
      launcherStdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      launcherStderr += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", (error) => {
      console.error(`[browser-suite] failed to spawn launcher: ${error.message}`);
      resolvePromise(1);
    });
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
  const successLine = launcherStderr.match(
    /\[managed-browser-smoke\] success; (evidence removed|run dir kept) \((.+)\)/,
  );
  const failedLine = launcherStderr.match(/\[managed-browser-smoke\] FAILED: (.*)/);
  const evidenceLine = launcherStderr.match(/evidence preserved: (runDir=\S+ .*)/);

  const failures = [];
  if (launcherCode !== 0) {
    failures.push(`launcher exited ${launcherCode}${failedLine ? `: ${failedLine[1]}` : ""}`);
    if (evidenceLine) failures.push(`launcher preserved evidence (${evidenceLine[1]})`);
  }
  if (!successLine && !failedLine) {
    failures.push("launcher printed neither a success nor FAILED line; cleanup contract not asserted");
  }

  const resultsFile = join(artifactsDir, "journey-results.json");
  if (!existsSync(resultsFile)) {
    failures.push(`journey results missing: ${resultsFile} (child crashed before writing results?)`);
  } else {
    const results = JSON.parse(await readFile(resultsFile, "utf8"));
    if (results.passed !== true) {
      for (const problem of results.problems ?? []) failures.push(problem);
    }
  }

  if (failures.length > 0) {
    console.error(`[browser-suite] FAIL (${failures.length} problem${failures.length === 1 ? "" : "s"}):`);
    for (const failure of failures) console.error(`[browser-suite]   - ${failure}`);
    console.error(`[browser-suite] artifacts: ${artifactsDir}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[browser-suite] PASS — launcher cleaned up ("success; ${successLine[1]}"), all journeys green`);
  console.log(`[browser-suite] artifacts: ${artifactsDir}`);
}

// ---------------------------------------------------------------------------
// Child mode (runs under the launcher, BASE_URL is set)
// ---------------------------------------------------------------------------

// Decode-failure notice text surfaced by the UI (frozen copy from
// frontend/src: roster pages render `Invalid roster response: …` while other
// surfaces share DECODE_ERROR_COPY). Never edit app code to make this list —
// extend NEEDLES only when the app's copy changes.
const DECODE_NOTICE_NEEDLES = [
  "Invalid roster response",
  "The server answered in an unexpected format",
];


async function loadJourneys() {
  let files;
  try {
    files = (await readdir(suitesBrowserDir)).filter((name) => name.endsWith(".journey.mjs")).sort();
  } catch (error) {
    throw new Error(`cannot read ${suitesBrowserDir}: ${error.message}`);
  }
  if (files.length === 0) {
    throw new Error(`no *.journey.mjs files found in ${suitesBrowserDir}`);
  }
  const journeys = [];
  const seenIds = new Set();
  for (const file of files) {
    const mod = await import(`${suitesBrowserDir}/${file}`);
    const { id, checkpoints, run } = mod;
    if (typeof id !== "string" || id.length === 0) throw new Error(`${file}: must export a non-empty string id`);
    if (seenIds.has(id)) throw new Error(`${file}: duplicate journey id ${id}`);
    seenIds.add(id);
    if (!Array.isArray(checkpoints) || checkpoints.some((c) => typeof c?.id !== "string")) {
      throw new Error(`${file}: must export checkpoints: [{ id, description? }]`);
    }
    if (typeof run !== "function") throw new Error(`${file}: must export async run(page, ctx)`);
    journeys.push({ id, checkpoints, run, file });
  }
  return journeys;
}

// Chromium auto-requests /favicon.ico when no icon link is declared; the
// server has none, and the resulting 404 console message is browser chrome
// noise, not app behavior. Suppress exactly that message (URL path + text
// matched) and count it, so "zero console errors" measures the app.
const FAVICON_NOISE = { path: "/favicon.ico", text: "Failed to load resource" };
// Allowlist: same-origin /api/** (any method) + same-origin static GET/HEAD.
// Everything else (cross-origin requests, same-origin mutations outside /api,
// non-http schemes other than data:/blob:) is an unexpected request.
function requestViolation(baseUrl, request) {
  let url;
  try {
    url = new URL(request.url());
  } catch {
    return `unparseable request URL: ${request.url()}`;
  }
  const scheme = url.protocol.replace(":", "");
  if (scheme === "data:" || scheme === "blob:") return null;
  if (scheme !== "http" && scheme !== "https") return `non-http request: ${request.url()}`;
  const origin = new URL(baseUrl).origin;
  if (url.origin !== origin) return `cross-origin request: ${request.method()} ${request.url()}`;
  if (url.pathname.startsWith("/api/")) return null;
  if (request.method() === "GET" || request.method() === "HEAD") return null;
  return `non-GET same-origin request outside /api: ${request.method()} ${url.pathname}`;
}

async function probeOverflow(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body ? document.body.scrollWidth : -1,
  }));
}

async function probeDecodeNotice(page) {
  return page.evaluate((needles) => {
    const hits = [];
    // Collapsed <details> holds decode detail invisibly; scan textContent of
    // the app's error-card detail blocks so folded notices are still caught…
    for (const pre of document.querySelectorAll(".error-card-detail pre")) {
      const text = pre.textContent ?? "";
      for (const needle of needles) {
        if (text.includes(needle)) hits.push({ needle, surface: ".error-card-detail pre" });
      }
    }
    // …plus visible text, for any future notice rendered outside error cards.
    const visible = document.body?.innerText ?? "";
    for (const needle of needles) {
      if (visible.includes(needle)) hits.push({ needle, surface: "body.innerText" });
    }
    return hits;
  }, DECODE_NOTICE_NEEDLES);
}

class JourneyRecorder {
  constructor(journey) {
    this.journey = journey;
    this.checkpointValues = [];
    this.recordedIds = new Set();
    this.problems = [];
    this.visitedRoutes = [];
    this.consoleErrors = [];
    this.faviconSuppressed = 0;
    this.pageErrors = [];
    this.unexpectedRequests = [];
    this.httpFailures = [];
    this.decodeNotices = [];
    this.overflow = [];
    this.error = null;
  }

  checkpoint(id, value) {
    const declared = this.journey.checkpoints.some((c) => c.id === id);
    if (!declared) {
      this.problems.push(`undeclared checkpoint "${id}" recorded by "${this.journey.id}" (add it to the journey's checkpoints[])`);
      return;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.problems.push(`checkpoint "${id}" in "${this.journey.id}" got non-numeric value ${JSON.stringify(value)}`);
      return;
    }
    if (this.recordedIds.has(id)) {
      this.problems.push(`checkpoint "${id}" recorded twice in "${this.journey.id}"`);
      return;
    }
    this.recordedIds.add(id);
    this.checkpointValues.push({ id, value });
  }

  finalize() {
    for (const c of this.journey.checkpoints) {
      if (!this.recordedIds.has(c.id)) {
        this.problems.push(`unmet checkpoint "${c.id}" in journey "${this.journey.id}": declared but never recorded`);
      }
    }
    if (this.consoleErrors.length > 0) {
      this.problems.push(`${this.consoleErrors.length} console error(s) in "${this.journey.id}": ${this.consoleErrors.map((e) => e.text).join(" | ")}`);
    }
    if (this.pageErrors.length > 0) {
      this.problems.push(`${this.pageErrors.length} uncaught page error(s) in "${this.journey.id}": ${this.pageErrors.join(" | ")}`);
    }
    for (const violation of this.unexpectedRequests) {
      this.problems.push(`unexpected request in "${this.journey.id}": ${violation}`);
    }
    for (const notice of this.decodeNotices) {
      this.problems.push(`decode-failure notice visible on ${notice.route} in "${this.journey.id}": matched "${notice.hits.map((h) => h.needle).join('", "')}"`);
    }
    for (const entry of this.overflow) {
      if (entry.docScrollWidth > entry.innerWidth || entry.bodyScrollWidth > entry.innerWidth) {
        this.problems.push(
          `horizontal overflow on ${entry.route} in "${this.journey.id}": innerWidth=${entry.innerWidth} docScrollWidth=${entry.docScrollWidth} bodyScrollWidth=${entry.bodyScrollWidth}`,
        );
      }
    }
    if (this.error) this.problems.unshift(`journey "${this.journey.id}" threw: ${this.error}`);
    return this.problems.length === 0;
  }
}

async function runChild(opts) {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    throw new Error("--child requires BASE_URL (must be run through scripts/managed-browser-smoke.mjs)");
  }
  const artifactsDir = process.env.PITD_BROWSER_ARTIFACTS;
  if (!artifactsDir) {
    throw new Error("--child requires PITD_BROWSER_ARTIFACTS (set by the parent mode)");
  }
  const screenshotsDir = join(artifactsDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const journeys = await loadJourneys();
  const executablePath = resolveChromiumExecutable();
  const { chromium } = await import("playwright-core");
  console.log(`[browser-suite] chromium: ${executablePath} (headless: ${!opts.headed})`);

  const browser = await chromium.launch({
    executablePath,
    headless: !opts.headed,
    ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}),
  });

  const records = [];
  try {
    for (const journey of journeys) {
      const record = new JourneyRecorder(journey);
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        const url = message.location()?.url ?? "";
        if (
          text.includes(FAVICON_NOISE.text) &&
          new URL(baseUrl).origin + FAVICON_NOISE.path === url
        ) {
          record.faviconSuppressed += 1;
          return;
        }
        record.consoleErrors.push({ text, location: url || null });
      });
      page.on("pageerror", (error) => {
        record.pageErrors.push(error instanceof Error ? error.message : String(error));
      });
      page.on("request", (request) => {
        const violation = requestViolation(baseUrl, request);
        if (violation) record.unexpectedRequests.push(violation);
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          record.httpFailures.push({ url: response.url(), status: response.status() });
        }
      });

      const sharedProbes = async (routeLabel) => {
        try {
          const overflow = await probeOverflow(page);
          record.overflow.push({ route: routeLabel, ...overflow });
        } catch (error) {
          record.problems.push(`overflow probe failed on ${routeLabel}: ${error.message}`);
        }
        try {
          const hits = await probeDecodeNotice(page);
          if (hits.length > 0) record.decodeNotices.push({ route: routeLabel, hits });
        } catch (error) {
          record.problems.push(`decode-notice probe failed on ${routeLabel}: ${error.message}`);
        }
      };

      const ctx = {
        baseUrl,
        visitedRoutes: record.visitedRoutes,
        checkpoint: (id, value) => record.checkpoint(id, value),
        consoleErrors: () => record.consoleErrors,
        screenshot: async (name) => {
          const file = join(screenshotsDir, `${name}.png`);
          await page.screenshot({ path: file });
          return file;
        },
        goto: async (path) => {
          const response = await page.goto(new URL(path, baseUrl).href, { waitUntil: "load" });
          record.visitedRoutes.push(path);
          await page.waitForLoadState("networkidle").catch(() => {});
          await sharedProbes(path);
          return response;
        },
      };

      try {
        await journey.run(page, ctx);
      } catch (error) {
        record.error = error instanceof Error ? error.stack ?? error.message : String(error);
      }
      // Final probes even when the journey never used ctx.goto (drills inject
      // styles after load; they must still be caught).
      if (record.visitedRoutes.length > 0) {
        await sharedProbes(record.visitedRoutes[record.visitedRoutes.length - 1]).catch(() => {});
      }

      const failed = !record.finalize();
      const shotName = `${journey.id}-${failed ? "failure" : "success"}`;
      try {
        const file = join(screenshotsDir, `${shotName}.png`);
        await page.screenshot({ path: file });
        record.screenshot = file;
      } catch (error) {
        record.screenshotError = error.message;
      }

      console.log(`[browser-suite] journey ${journey.id}: ${failed ? "FAIL" : "PASS"}`);
      records.push(record);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const problems = records.flatMap((r) => r.problems);
  const passed = problems.length === 0;

  const results = {
    runId: basename(artifactsDir),
    baseUrl,
    headless: !opts.headed,
    startedAt: new Date().toISOString(),
    passed,
    problems,
    journeys: records.map((r) => ({
      id: r.journey.id,
      file: r.journey.file,
      status: r.problems.length === 0 ? "pass" : "fail",
      error: r.error,
      visitedRoutes: [...r.visitedRoutes],
      checkpoints: r.checkpointValues,
      declaredCheckpoints: r.journey.checkpoints,
      consoleErrors: r.consoleErrors,
      faviconSuppressed: r.faviconSuppressed,
      consoleErrors: r.consoleErrors,
      pageErrors: r.pageErrors,
      httpFailures: r.httpFailures,
      decodeNotices: r.decodeNotices,
      screenshots: r.screenshot ? [r.screenshot] : [],
    })),
  };
  await writeFile(join(artifactsDir, "journey-results.json"), JSON.stringify(results, null, 2) + "\n");
  await writeFile(
    join(artifactsDir, "console-network-errors.json"),
    JSON.stringify(
      records.map((r) => ({
        journey: r.journey.id,
        consoleErrors: r.consoleErrors,
        pageErrors: r.pageErrors,
        unexpectedRequests: r.unexpectedRequests,
        httpFailures: r.httpFailures,
      })),
      null,
      2,
    ) + "\n",
  );

  if (!passed) {
    console.error(`[browser-suite] child found ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`[browser-suite]   - ${problem}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------

const opts = parseCli(process.argv.slice(2));
if (opts.help) {
  console.log(usage());
} else if (opts.child) {
  await runChild(opts).catch((error) => {
    console.error(`[browser-suite] child fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
} else {
  await runParent(opts).catch((error) => {
    console.error(`[browser-suite] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
