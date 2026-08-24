#!/usr/bin/env node
// PERF-01 — dataset scale benchmark against a managed Ada server, with frozen
// explicit budgets.
//
// Replaces the defective OPT-009 script wholesale. Architecture: ONE
// managed-browser-smoke.mjs launcher invocation PER SCALE, so every scale gets
// an independent fresh temporary data dir (scales can never accumulate) and
// exact-PID server cleanup owned by the launcher. The launcher's stderr
// success line is asserted per scale — that line is the launcher's published
// contract that the spawned server was killed by its PID and its run dir
// removed (the same assertion BROWSER-01 makes on the launcher).
//
// Modes:
//   node scripts/dataset-benchmark.mjs                       measure + enforce frozen budgets
//   node scripts/dataset-benchmark.mjs --record              measure only; write raw baseline
//   node scripts/dataset-benchmark.mjs --freeze-budgets --revision <id>
//                                                            derive budgets from recorded baseline
//   node scripts/dataset-benchmark.mjs --drill-between-scales
//                                                            deliberate mid-run failure drill
//   node scripts/dataset-benchmark.mjs --scales 0,10         subset of scales (dev/drills)
//
// Per scale (0 / 10 / 100 / 1000 total rows):
//   - readable rows are seeded via API creates (POST /characters, POST /crews
//     with {gameStem, crewType}, POST /clocks); ids are read from the
//     OpResult envelope members json.character.id / json.crew.id /
//     json.clock.id;
//   - degraded rows are seeded PRE-START as owned fixture bytes derived from
//     conformance/fixtures/golden-character.json at documented proportions:
//       70% readable · 10% repairable (D6 unknown nested key, repaired via
//       displayed removal) · 10% needs-input (empty availableGear[].name —
//       minLength 1 with no derivable value) · 10% unreadable (D10 truncated);
//   - actual entity counts are asserted equal to the requested scale BEFORE
//     any timing sample is accepted; every degraded row is asserted present
//     and reachable in the roster with its contract flags, and
//     repair-preview distinguishes needs-input (409 NORMALIZATION_REQUIRED
//     listing pointers) from unreadable (422 INVALID_ENTITY);
//   - metrics captured per scale: API latency distribution p50/p95/max plus
//     transfer bytes per route class (explicit warmup/measured iterations),
//     server process peak RSS (/proc VmHWM of the exact server PID), real
//     Chromium DOM node count, render-to-stable duration (mutation-observer
//     quiet window), performance.memory JS heap when available, and a
//     containment probe (scrollWidth vs innerWidth);
//   - machine/runtime versions are recorded next to the numbers.
//
// Budgets live in agent-docs/test-audit/performance-budgets.json and are only
// ever written by --freeze-budgets from a valid recorded baseline (headroom =
// max(baseline × 1.5, baseline + ε); latency uses ×3 — see headroomBudget)).
// The default mode fails non-zero when a budget is exceeded, when a budgeted
// metric is missing, and when a produced metric has no budget entry —
// fail-closed in all three directions. Raw
// measurements land in agent-docs/test-audit/dataset-benchmark.json
// (gitignored).

import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, hostname, release, tmpdir, type as osType } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirnameOf(import.meta.url);
const SELF_PATH = fileURLToPath(import.meta.url);
const CONFORMANCE_DIR = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(CONFORMANCE_DIR, "..");
const SMOKE_LAUNCHER = join(SCRIPT_DIR, "managed-browser-smoke.mjs");
const GOLDEN_CHARACTER = join(CONFORMANCE_DIR, "fixtures", "golden-character.json");
const FRONTEND_DIR = join(REPO_ROOT, "frontend");
const FRONTEND_DIST = join(FRONTEND_DIR, "dist");
const GAME_SETTINGS_FILE = join(REPO_ROOT, "data", "games", "blades-in-the-dark.json");
const AUDIT_DIR = join(REPO_ROOT, "agent-docs", "test-audit");
const RECORD_FILE = join(AUDIT_DIR, "dataset-benchmark.json");
const BUDGETS_FILE = join(AUDIT_DIR, "performance-budgets.json");

const GAME_STEM = "blades-in-the-dark";
const CREW_TYPE = "Assassins"; // suite convention (src/suite-helpers.ts newCrew default)
const ALL_SCALES = [0, 10, 100, 1000];
const DEGRADED_MIX = { readable: 0.7, repairable: 0.1, needsInput: 0.1, unreadable: 0.1 };
const WARMUP_RUNS = 3;
const MEASURED_RUNS = 20;
const SEED_CONCURRENCY = 8;
const QUIET_WINDOW_MS = 250; // mutation-observer quiet window for render-to-stable
const REQUEST_TIMEOUT_MS = 60_000;

const RECORD_SCHEMA = "perf01-dataset-benchmark/1";
const BUDGETS_SCHEMA = "perf01-performance-budgets/1";

// Temp dirs created by THIS parent run (drill verification input). Only ever
// appended to by runParent before its finally removes them.
const tempDirsCreatedByRun = [];

function dirnameOf(url) {
  return fileURLToPath(new URL(".", url));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    record: false,
    freezeBudgets: false,
    revision: null,
    drillBetweenScales: false,
    scales: ALL_SCALES,
    child: false,
    scale: null,
    plan: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--record":
        opts.record = true;
        break;
      case "--freeze-budgets":
        opts.freezeBudgets = true;
        break;
      case "--revision":
        opts.revision = argv[++i];
        break;
      case "--drill-between-scales":
        opts.drillBetweenScales = true;
        break;
      case "--scales":
        opts.scales = argv[++i].split(",").map(Number);
        break;
      case "--child":
        opts.child = true;
        break;
      case "--scale":
        opts.scale = Number(argv[++i]);
        break;
      case "--plan":
        opts.plan = argv[++i];
        break;
      default:
        throw new Error(
          `unknown option ${arg} (supported: --record, --freeze-budgets, --revision <id>, --drill-between-scales, --scales <list>, --child --scale --plan)`,
        );
    }
  }
  for (const s of opts.scales) {
    if (!ALL_SCALES.includes(s)) throw new Error(`unsupported scale ${s} (supported: ${ALL_SCALES.join(", ")})`);
  }
  opts.scales.sort((a, b) => a - b);
  return opts;
}

// ---------------------------------------------------------------------------
// Scale planning (documented mix, deterministic ids)
// ---------------------------------------------------------------------------

// Degraded rows are stored under characters/<uuid>/current.json before the
// server starts; ids are fixed-pattern UUIDv4-shaped strings whose first group
// encodes the category (cafe=repairable, deed=needs-input, dead=unreadable),
// so runs are reproducible and a stray fixture is self-identifying. The id
// pattern matches contract/schemas/common.json $defs/uuid.
const DEGRADED_PREFIX = { repairable: "cafe", needsInput: "deed", unreadable: "dead" };

function degradedId(category, i) {
  return `${DEGRADED_PREFIX[category]}${String(i).padStart(4, "0")}-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

function range(n) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

// Row mix per scale. Degraded proportions apply to ALL rows (70/10/10/10).
// Among readable rows: ~4% crews, ~6% clocks (min 1 each when the scale is
// nonzero), remainder characters; every degraded row is a character (the
// classification probes below use the character repair-preview route).
export function planScale(scale) {
  if (scale === 0) {
    return {
      scale,
      readableCharacters: 0,
      crews: 0,
      clocks: 0,
      repairable: 0,
      needsInput: 0,
      unreadable: 0,
    };
  }
  const degradedEach = Math.round(scale * DEGRADED_MIX.repairable);
  const readableTotal = scale - 3 * degradedEach;
  const crews = Math.max(1, Math.round(readableTotal * 0.04));
  const clocks = Math.max(1, Math.round(readableTotal * 0.06));
  const readableCharacters = readableTotal - crews - clocks;
  if (readableCharacters < 0) throw new Error(`scale ${scale} too small for the documented mix`);
  return { scale, readableCharacters, crews, clocks, repairable: degradedEach, needsInput: degradedEach, unreadable: degradedEach };
}

function planExpected(mix) {
  return {
    characters: mix.readableCharacters + mix.repairable + mix.needsInput + mix.unreadable,
    crews: mix.crews,
    clocks: mix.clocks,
    rosterRows:
      mix.readableCharacters + mix.crews + mix.repairable + mix.needsInput + mix.unreadable,
    total: mix.readableCharacters + mix.crews + mix.clocks + mix.repairable + mix.needsInput + mix.unreadable,
  };
}

function degradedIdsFor(mix) {
  return {
    repairable: range(mix.repairable).map((i) => degradedId("repairable", i)),
    needsInput: range(mix.needsInput).map((i) => degradedId("needsInput", i)),
    unreadable: range(mix.unreadable).map((i) => degradedId("unreadable", i)),
  };
}

// Pre-start fixture staging. Derived from the checked-in canonical golden
// character so every variant carries exactly one defect class:
//   repairable  → D6 unknown nested key (displayed removal repairs it)
//   needs-input → empty availableGear[].name (minLength 1, no derivable
//                 value — the matrix's NEEDS-INPUT class; note a missing
//                 timestamp would be REPAIRABLE since the server stamps time)
//   unreadable  → D10 truncated JSON (cannot be parsed as an entity object)
function stageDegradedFixtures(stageRoot, mix) {
  const template = JSON.parse(readFileSync(GOLDEN_CHARACTER, "utf8"));
  const variants = [
    ["repairable", mix.repairable],
    ["needsInput", mix.needsInput],
    ["unreadable", mix.unreadable],
  ];
  for (const [category, count] of variants) {
    for (const i of range(count)) {
      const id = degradedId(category, i);
      let bytes;
      if (category === "repairable") {
        bytes = JSON.stringify({
          ...template,
          id,
          dossier: { ...template.dossier, favoriteColor: "red" },
        });
      } else if (category === "needsInput") {
        bytes = JSON.stringify({
          ...template,
          id,
          gear: { ...template.gear, availableGear: [{ name: "", bulk: 0 }] },
        });
      } else {
        bytes = `{ "kind": "character", "name": "trunc`;
      }
      const dir = join(stageRoot, "characters", id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "current.json"), bytes);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared HTTP helpers (child)
// ---------------------------------------------------------------------------

function apiRoot(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

async function timedFetch(url, init) {
  const start = performance.now();
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await res.text();
  const ms = performance.now() - start;
  return { status: res.status, text, ms, bytes: Buffer.byteLength(text) };
}

async function getJson(root, path) {
  const res = await timedFetch(`${root}/${path}`);
  if (res.status !== 200) throw new Error(`GET /${path} → ${res.status}: ${res.text.slice(0, 200)}`);
  return JSON.parse(res.text);
}

async function postOpResult(root, path, body) {
  const res = await timedFetch(`${root}/${path}`, {
    method: "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = JSON.parse(res.text); // uniform OpResult envelope, success or typed failure
  if (res.status !== 200 || json.ok !== true) {
    throw new Error(
      `POST /${path} → ${res.status} ok=${json.ok} error=${JSON.stringify(json.error)?.slice(0, 300)}`,
    );
  }
  return json;
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return results;
}

// Entity creation through the uniform OpResult envelope: the created DTO sits
// in exactly one of character/crew/clock (contract operation-result.json
// description), so response ids are read at json.<kind>.id.
async function createEntities(root, kind, count, makeBody, idField) {
  return mapPool(range(count), SEED_CONCURRENCY, async (i) => {
    const json = await postOpResult(root, kind, makeBody(i));
    const entity = json[idField];
    if (typeof entity?.id !== "string" || entity.id.length === 0) {
      throw new Error(`POST /${kind} did not return ${idField}.id (got ${JSON.stringify(json).slice(0, 200)})`);
    }
    return entity.id;
  });
}

// ---------------------------------------------------------------------------
// Metrics collection helpers (child)
// ---------------------------------------------------------------------------

// Server-process peak RSS: the launcher spawned exactly one server whose
// command line contains this run's unique data dir. Scan /proc read-only,
// matching BOTH the executable basename and that token, requiring one hit.
function findServerPeakRssBytes(dataDir) {
  const hits = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let cmdline;
    try {
      cmdline = readFileSync(`/proc/${entry}/cmdline`, "utf8");
    } catch {
      continue; // vanished or not ours
    }
    const parts = cmdline.split("\0").filter(Boolean);
    if (parts.length === 0) continue;
    if (basename(parts[0]) !== "pitd") continue;
    if (!parts.includes(dataDir)) continue;
    hits.push(Number(entry));
  }
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one pitd process for data dir ${dataDir}, found ${hits.length}${hits.length ? ` (${hits.join(", ")})` : ""}`,
    );
  }
  const status = readFileSync(`/proc/${hits[0]}/status`, "utf8");
  const m = status.match(/^VmHWM:\s+(\d+)\s+kB$/m);
  if (!m) throw new Error(`VmHWM not found in /proc/${hits[0]}/status`);
  return Number(m[1]) * 1024;
}

// Real-Chromium frontend metrics using BROWSER-01's shared executable
// resolution (lib/chromium-resolve.mjs).
async function collectBrowserMetrics(baseUrl, expectedRows) {
  const { resolveChromiumExecutable } = await import("./lib/chromium-resolve.mjs");
  const { chromium } = await import("playwright-core");
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    ...(process.getuid?.() === 0 ? { args: ["--no-sandbox"] } : {}),
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Install the mutation observer before any page script runs. Page-clock
    // performance.now() is relative to navigation start, so once the quiet
    // window has elapsed, lastMutation IS the render-to-stable instant.
    await page.addInitScript(() => {
      const state = { lastMutation: null };
      window.__pitdBench = state;
      // Init scripts run before documentElement exists — observe the
      // document node itself; subtree:true still covers the whole page.
      new MutationObserver(() => {
        state.lastMutation = performance.now();
      }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    });
    await page.goto(`${baseUrl.replace(/\/+$/, "")}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(
      ({ quietMs, rows }) => {
        const state = window.__pitdBench;
        if (!state || state.lastMutation === null) return false;
        const rendered = document.querySelectorAll("[data-character-id],[data-crew-id]").length;
        return performance.now() - state.lastMutation >= quietMs && rendered >= rows;
      },
      { quietMs: QUIET_WINDOW_MS, rows: expectedRows },
      { timeout: 30_000, polling: 50 },
    );
    const metrics = await page.evaluate(() => ({
      lastMutation: window.__pitdBench.lastMutation,
      domNodes: document.getElementsByTagName("*").length,
      jsHeapUsedBytes: globalThis.performance?.memory?.usedJSHeapSize ?? null,
      overflowPx: document.documentElement.scrollWidth - window.innerWidth,
    }));
    return {
      executablePath,
      chromiumVersion: browser.version(),
      domNodes: metrics.domNodes,
      renderStableMs: round2(metrics.lastMutation),
      jsHeapUsedBytes: metrics.jsHeapUsedBytes === null ? null : Math.round(metrics.jsHeapUsedBytes),
      containmentOverflowPx: metrics.overflowPx,
    };
  } finally {
    await browser.close();
  }
}

function percentile(sorted, p) {
  const index = Math.max(0, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.min(index, sorted.length - 1)];
}

function summarize(samples) {
  const sortedMs = samples.map((s) => s.ms).sort((a, b) => a - b);
  return {
    warmupRuns: WARMUP_RUNS,
    measuredRuns: samples.length,
    p50Ms: round2(percentile(sortedMs, 0.5)),
    p95Ms: round2(percentile(sortedMs, 0.95)),
    maxMs: round2(sortedMs[sortedMs.length - 1]),
    avgBytesPerRun: Math.round(samples.reduce((sum, s) => sum + s.bytes, 0) / samples.length),
  };
}

// Measure one route class: WARMUP_RUNS unrecorded runs, then MEASURED_RUNS
// recorded samples. Every response must be 200 — a failed request never
// contributes timing.
async function measureRouteClass(label, runOnce) {
  for (let i = 0; i < WARMUP_RUNS; i++) {
    const res = await runOnce(i);
    if (res.status !== 200) throw new Error(`${label} warmup got ${res.status}: ${res.text.slice(0, 200)}`);
  }
  const samples = [];
  for (let i = 0; i < MEASURED_RUNS; i++) {
    const res = await runOnce(WARMUP_RUNS + i);
    if (res.status !== 200) throw new Error(`${label} measurement got ${res.status}: ${res.text.slice(0, 200)}`);
    samples.push({ ms: res.ms, bytes: res.bytes });
  }
  return summarize(samples);
}

// Degraded-row verification: presence + reachability in the roster, then a
// repair-preview probe per degraded row. The roster's isRepairable summary
// flag does NOT separate repairable from needs-input (the Ada server reports
// isRepairable:true for both — verified empirically 2026-08-24), so the
// preview outcome is the contract's distinguishing observable:
//   repairable   → 409 NORMALIZATION_REQUIRED, NO needs-input pointers
//                  (apply would succeed after confirmation)
//   needs-input  → 409 NORMALIZATION_REQUIRED listing pointers awaiting
//                  caller values (error.details.needsInputPointers)
//   unreadable   → 422 INVALID_ENTITY (deletion only)
// All degraded rows must also show isReadable:false; unreadable rows must
// additionally show isRepairable:false. These probes are setup-time
// assertions, never measured traffic.
async function classifyDegradedRows(root, roster, clocksList, degradedIds) {
  const observed = { readable: 0, repairable: 0, needsInput: 0, unreadable: 0 };
  const rowsById = new Map();
  for (const row of [...roster.characters, ...roster.crews, ...clocksList]) {
    rowsById.set(row.id, row);
    if (row.isReadable) observed.readable++;
  }

  const problems = [];

  async function classify(id) {
    const res = await timedFetch(`${root}/characters/${id}/repair-preview`, { method: "POST" });
    const json = safeParse(res.text);
    if (res.status === 422 && json?.error?.code === "INVALID_ENTITY") return "unreadable";
    const pointers =
      json?.error?.details?.needsInputPointers ?? json?.error?.preview?.needsInputPointers ?? [];
    if (res.status === 409 && json?.error?.code === "NORMALIZATION_REQUIRED") {
      return Array.isArray(pointers) && pointers.length > 0 ? "needsInput" : "repairable";
    }
    problems.push(
      `row ${id}: unexpected preview outcome ${res.status} ${json?.error?.code} pointers=${JSON.stringify(pointers)}`,
    );
    return null;
  }

  await mapPool(
    [
      ...degradedIds.repairable.map((id) => ({ id, want: "repairable" })),
      ...degradedIds.needsInput.map((id) => ({ id, want: "needsInput" })),
      ...degradedIds.unreadable.map((id) => ({ id, want: "unreadable" })),
    ],
    SEED_CONCURRENCY,
    async ({ id, want }) => {
      const row = rowsById.get(id);
      if (!row) {
        problems.push(`degraded row ${id} (${want}) missing from roster — unreachable`);
        return;
      }
      if (row.isReadable !== false) {
        problems.push(`degraded row ${id} (${want}): expected isReadable=false, got ${row.isReadable}`);
        return;
      }
      if (want === "unreadable" && row.isRepairable !== false) {
        problems.push(`unreadable row ${id}: expected isRepairable=false, got ${row.isRepairable}`);
        return;
      }
      const got = await classify(id);
      if (got !== null) observed[got]++;
      if (got !== null && got !== want) {
        problems.push(`row ${id}: seeded as ${want} but server classifies it ${got}`);
      }
    },
  );

  if (problems.length > 0) {
    throw new Error(`degraded-row verification failed:\n  ${problems.join("\n  ")}`);
  }
  return observed;
}

// ---------------------------------------------------------------------------
// Child mode — runs UNDER the launcher with BASE_URL / PITD_DATA_DIR set
// ---------------------------------------------------------------------------

async function runChild(argv) {
  const baseUrl = process.env.BASE_URL ?? process.env.CONFORMANCE_BASE_URL;
  const dataDir = process.env.PITD_DATA_DIR;
  const outFile = process.env.PITD_BENCH_OUT;
  if (!baseUrl || !dataDir || !outFile) {
    throw new Error("--child requires BASE_URL, PITD_DATA_DIR and PITD_BENCH_OUT (set by the parent)");
  }
  const scale = Number(argv[argv.indexOf("--scale") + 1]);
  const plan = JSON.parse(readFileSync(argv[argv.indexOf("--plan") + 1], "utf8"));
  const mix = plan.mix;
  const expected = plan.expected;
  const root = apiRoot(baseUrl);

  // Sanity: we are measuring OUR launcher's server instance.
  const health = await getJson(root, "health");
  if (health.dataDir !== dataDir) {
    throw new Error(`health.dataDir ${health.dataDir} ≠ launcher data dir ${dataDir}`);
  }

  const playbook = JSON.parse(readFileSync(GAME_SETTINGS_FILE, "utf8")).Playbooks[0]?.Name;
  if (typeof playbook !== "string" || playbook.length === 0) {
    throw new Error(`no playbook found in ${GAME_SETTINGS_FILE}`);
  }

  // --- Seed readable rows via API creates (contract request shapes) --------
  const crewIds = await createEntities(root, "crews", mix.crews, () => ({ gameStem: GAME_STEM, crewType: CREW_TYPE }), "crew");
  const clockIds = await createEntities(
    root,
    "clocks",
    mix.clocks,
    (i) => ({
      name: `bench-clock-${String(i).padStart(4, "0")}`,
      ownerKind: "campaign",
      ownerId: "",
      purpose: "custom",
      behavior: "bounded",
      size: 4,
    }),
    "clock",
  );
  const characterIds = await createEntities(
    root,
    "characters",
    mix.readableCharacters,
    () => ({ gameStem: GAME_STEM, playbook }),
    "character",
  );

  // --- Assert counts equal requested scale BEFORE accepting timings -------
  const roster = await getJson(root, "campaign/roster");
  const clocksList = await getJson(root, "clocks");
  const counts = {
    requested: expected.total,
    characters: roster.characters.length,
    crews: roster.crews.length,
    clocks: clocksList.length,
    total: roster.characters.length + roster.crews.length + clocksList.length,
  };
  if (
    counts.characters !== expected.characters ||
    counts.crews !== expected.crews ||
    counts.clocks !== expected.clocks ||
    counts.total !== expected.total
  ) {
    throw new Error(
      `count mismatch at scale ${scale}: observed ${JSON.stringify(counts)} expected ${JSON.stringify(expected)}`,
    );
  }

  // --- Assert degraded rows present, reachable, correctly classified ------
  const observedDegraded = await classifyDegradedRows(root, roster, clocksList, plan.degradedIds);
  const intended = {
    readable: mix.readableCharacters + mix.crews + mix.clocks,
    repairable: mix.repairable,
    needsInput: mix.needsInput,
    unreadable: mix.unreadable,
  };
  for (const key of Object.keys(intended)) {
    if (observedDegraded[key] !== intended[key]) {
      throw new Error(
        `degraded proportion mismatch at scale ${scale}: ${key} observed ${observedDegraded[key]} ≠ intended ${intended[key]}`,
      );
    }
  }

  // --- Measured route classes ---------------------------------------------
  // roster        GET /campaign/roster
  // collections   GET /characters | /clocks | /crews (cycled per run)
  // entity-direct GET /characters/{probe}            (skipped at scale 0)
  // mutation      POST /characters/{probe}/ops/stress.clear (skipped at scale 0)
  const api = {};
  api.roster = await measureRouteClass("roster", () => timedFetch(`${root}/campaign/roster`));

  const collectionsRoutes = ["characters", "clocks", "crews"];
  api.collections = await measureRouteClass("collections", (i) =>
    timedFetch(`${root}/${collectionsRoutes[i % collectionsRoutes.length]}`),
  );

  if (characterIds.length > 0) {
    const probe = characterIds[0];
    api["entity-direct"] = await measureRouteClass("entity-direct", () =>
      timedFetch(`${root}/characters/${probe}`),
    );
    api.mutation = await measureRouteClass("mutation", () =>
      timedFetch(`${root}/characters/${probe}/ops/stress.clear`, { method: "POST" }),
    );
  }

  // --- Server peak RSS ------------------------------------------------------
  const serverPeakRssBytes = findServerPeakRssBytes(dataDir);

  // --- Frontend metrics in real Chromium -----------------------------------
  const browser = await collectBrowserMetrics(baseUrl, expected.rosterRows);

  const scaleResult = {
    scale,
    mix,
    counts,
    degraded: {
      proportions: DEGRADED_MIX,
      intended,
      observed: observedDegraded,
    },
    api,
    serverPeakRssBytes,
    browser,
    serverImplementation: `${health.implementation ?? "unknown"} ${health.version ?? ""}`.trim(),
    assertions: {
      countsMatchRequestedScale: true, // enforced above — timing never accepted otherwise
      degradedRowsPresentReachableClassified: true,
    },
  };

  writeFileSync(outFile, JSON.stringify(scaleResult, null, 2));
  console.log(
    `[dataset-benchmark] scale ${scale}: rows=${counts.total} (chars ${counts.characters}, crews ${counts.crews}, clocks ${counts.clocks}); degraded ${JSON.stringify(observedDegraded)}; rss ${(serverPeakRssBytes / 1048576).toFixed(1)}MiB; dom ${browser.domNodes}; stable ${browser.renderStableMs}ms`,
  );
}

// ---------------------------------------------------------------------------
// Machine / runtime description
// ---------------------------------------------------------------------------

function machineInfo() {
  let cpuModel = "";
  try {
    const line = readFileSync("/proc/cpuinfo", "utf8")
      .split("\n")
      .find((l) => l.startsWith("model name"));
    cpuModel = line?.split(":").slice(1).join(":").trim() ?? "";
  } catch {
    /* non-Linux */
  }
  let memoryTotalBytes = null;
  try {
    const m = readFileSync("/proc/meminfo", "utf8").match(/^MemTotal:\s+(\d+)\s+kB$/m);
    if (m) memoryTotalBytes = Number(m[1]) * 1024;
  } catch {
    /* non-Linux */
  }
  return {
    hostname: hostname(),
    platform: process.platform,
    arch: process.arch,
    cpuModel,
    cpuCount: availableParallelism(),
    memoryTotalBytes,
    osType: osType(),
    osRelease: release(),
  };
}

function fileMtimeIso(path) {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metric flattening / budgets
// ---------------------------------------------------------------------------

// Flat metric keys derived from one scale result. A null value means "not
// available on this machine" (performance.memory); an unbudgeted null is fine,
// but a budget that EXISTS for a key makes that key REQUIRED (fail-closed).
function flattenMetrics(scaleResult) {
  const flat = new Map();
  for (const [classKey, stats] of Object.entries(scaleResult.api)) {
    flat.set(`${classKey}.p50Ms`, stats.p50Ms);
    flat.set(`${classKey}.p95Ms`, stats.p95Ms);
    flat.set(`${classKey}.maxMs`, stats.maxMs);
    flat.set(`${classKey}.avgBytesPerRun`, stats.avgBytesPerRun);
  }
  flat.set("server.peakRssBytes", scaleResult.serverPeakRssBytes);
  flat.set("browser.domNodes", scaleResult.browser.domNodes);
  flat.set("browser.renderStableMs", scaleResult.browser.renderStableMs);
  flat.set("browser.jsHeapUsedBytes", scaleResult.browser.jsHeapUsedBytes);
  flat.set("browser.containmentOverflowPx", scaleResult.browser.containmentOverflowPx);
  return flat;
}

function unitForKey(key) {
  if (key.endsWith("Ms")) return "ms";
  if (key.includes("Bytes")) return "bytes";
  if (key.endsWith("Px")) return "px";
  if (key.includes("domNodes")) return "nodes";
  throw new Error(`cannot derive unit for metric ${key}`);
}

// Headroom policy: byte/count/RSS budgets use max(baseline × 1.5, baseline + ε)
// (transfer sizes and VmHWM are stable run-to-run; RSS adds MiB-scale slack for
// page-granular kernel reporting). Latency budgets use ×3 with a +5ms floor:
// observed wall-clock p95 variance on this suite is up to ~2.4× between runs
// (scheduler/GC noise), so 1.5× would false-positive on healthy machines.
export function headroomBudget(key, baseline) {
  const unit = unitForKey(key);
  if (unit === "px") {
    if (baseline > 0) {
      throw new Error(`containment probe overflows at baseline (${baseline}px) — fix layout before freezing budgets`);
    }
    return {
      value: 0,
      unit,
      rationale: `hard containment bound: scrollWidth − innerWidth ≤ 0 (baseline ${baseline}px)`,
    };
  }
  let value;
  let rationale;
  if (unit === "ms") {
    value = Math.max(Math.ceil(baseline * 3), baseline + 5);
    rationale = `baseline ${baseline} ms; ×3 headroom (+5ms floor) covering observed run-to-run scheduler/GC variance`;
  } else {
    const epsilon = unit === "bytes" ? 1024 : 64; // nodes
    value = Math.max(Math.ceil(baseline * 1.5), baseline + epsilon);
    rationale = `baseline ${baseline} ${unit}; headroom = max(×1.5, +ε)`;
    if (key === "server.peakRssBytes") {
      value += 16 * 1024 * 1024;
      rationale = `baseline ${baseline} bytes; ×1.5 headroom +16MiB allocator/page slack`;
    }
  }
  if (baseline === 0) {
    value = unit === "ms" ? 5 : epsilon;
    rationale += "; zero baseline floored at ε";
  }
  return { value, unit, rationale };
}

function freezeBudgets(recorded, revision) {
  if (!revision) throw new Error("--freeze-budgets requires --revision <working-copy commit id>");
  const scalesBlock = {};
  for (const scaleResult of recorded.scales) {
    const metrics = {};
    for (const [key, value] of flattenMetrics(scaleResult)) {
      if (value === null || value === undefined) continue; // unavailable metric stays unbudgeted
      metrics[key] = headroomBudget(key, value);
    }
    scalesBlock[String(scaleResult.scale)] = {
      requestedRows: scaleResult.counts.requested,
      metrics,
    };
  }
  return {
    schema: BUDGETS_SCHEMA,
    frozenAt: new Date().toISOString(),
    reviewRevisionId: revision,
    sourceRecordedAt: recorded.recordedAt,
    policy: {
      headroom:
        "bytes/nodes/RSS: max(baseline × 1.5, +ε) with RSS +16MiB slack; ms: max(baseline × 3, +5ms); containment hard-bound at 0px",
      failClosed:
        "a run fails when a budget is exceeded, when a budgeted metric is missing, and when a produced metric has no budget entry",
    },
    scales: scalesBlock,
  };
}

function enforceBudgets(recorded, budgets) {
  const violations = [];
  const recordedByScale = new Map(recorded.scales.map((r) => [String(r.scale), r]));

  for (const [scaleKey, block] of Object.entries(budgets.scales)) {
    const result = recordedByScale.get(scaleKey);
    if (!result) {
      violations.push(`scale ${scaleKey}: MISSING METRICS — no measurements for budget block`);
      continue;
    }
    if (result.counts.requested !== block.requestedRows) {
      violations.push(
        `scale ${scaleKey}: measured ${result.counts.requested} rows but budgets froze ${block.requestedRows}`,
      );
    }
    const produced = flattenMetrics(result);
    for (const [key, budget] of Object.entries(block.metrics)) {
      const value = produced.get(key);
      if (value === null || value === undefined) {
        violations.push(`scale ${scaleKey}: MISSING METRIC ${key} (budget ${budget.value} ${budget.unit})`);
        continue;
      }
      if (value > budget.value) {
        violations.push(
          `scale ${scaleKey}: BUDGET EXCEEDED ${key} = ${value} ${budget.unit} > budget ${budget.value} ${budget.unit}`,
        );
      }
    }
    for (const [key, value] of produced) {
      if (value === null || value === undefined) continue;
      if (!(key in block.metrics)) {
        violations.push(
          `scale ${scaleKey}: UNBUDGETED METRIC ${key} = ${value} (fail-closed: freeze budgets again)`,
        );
      }
    }
  }
  for (const [scaleKey] of recordedByScale) {
    if (!budgets.scales[scaleKey]) {
      violations.push(`scale ${scaleKey}: measured but budgets contain no block for it`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Parent mode — orchestrates one launcher invocation per scale
// ---------------------------------------------------------------------------

function assertLauncherClean(launcherCode, stdout, stderr) {
  const combined = stdout + stderr;
  if (launcherCode !== 0) {
    const failed = combined.match(/\[managed-browser-smoke\] FAILED: (.*)/);
    const evidence = combined.match(/evidence preserved: (\S+)/);
    throw new Error(
      `launcher exited ${launcherCode}${failed ? `: ${failed[1]}` : ""}${evidence ? ` (evidence preserved: ${evidence[1]})` : ""}`,
    );
  }
  if (!/\[managed-browser-smoke\] success;/.test(combined)) {
    throw new Error("launcher exited 0 but printed no success line; cleanup contract not asserted");
  }
}

function runLauncher(scale, stageDir, planFile, outFile) {
  const args = [
    SMOKE_LAUNCHER,
    "--seed",
    stageDir,
    "--",
    process.execPath,
    SELF_PATH,
    "--child",
    "--scale",
    String(scale),
    "--plan",
    planFile,
  ];
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd: CONFORMANCE_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PITD_BENCH_OUT: outFile },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      try {
        assertLauncherClean(code ?? 1, stdout, stderr);
        resolvePromise();
      } catch (error) {
        rejectPromise(error);
      }
    });
  });
}

function ensureFrontendBuild() {
  if (existsSync(join(FRONTEND_DIST, "index.html"))) return;
  console.log("[dataset-benchmark] building frontend (frontend/dist missing)...");
  execFileSync("npm", ["run", "build"], { cwd: FRONTEND_DIR, stdio: "inherit" });
}

async function runParent(opts) {
  if (opts.freezeBudgets) {
    const recorded = JSON.parse(readFileSync(RECORD_FILE, "utf8"));
    if (recorded.schema !== RECORD_SCHEMA) {
      throw new Error(`${RECORD_FILE} has unexpected schema ${recorded.schema}`);
    }
    const budgets = freezeBudgets(recorded, opts.revision);
    mkdirSync(AUDIT_DIR, { recursive: true });
    writeFileSync(BUDGETS_FILE, JSON.stringify(budgets, null, 2) + "\n");
    console.log(`[dataset-benchmark] budgets frozen for revision ${opts.revision} → ${BUDGETS_FILE}`);
    return;
  }

  ensureFrontendBuild();
  if (!existsSync(GOLDEN_CHARACTER)) throw new Error(`missing fixture ${GOLDEN_CHARACTER}`);

  const stageRoot = mkdtempSync(join(tmpdir(), "pitd-bench-stage-"));
  const artifactsRoot = mkdtempSync(join(tmpdir(), "pitd-bench-artifacts-"));
  tempDirsCreatedByRun.push(stageRoot, artifactsRoot);

  try {
    // Pre-stage EVERY scale up front so a mid-run failure leaves real debris
    // behind for the finally block (and the drill) to prove cleanup on.
    const plans = [];
    for (const scale of opts.scales) {
      const mix = planScale(scale);
      const expected = planExpected(mix);
      if (expected.total !== scale) throw new Error(`mix for scale ${scale} sums to ${expected.total}, not ${scale}`);
      const stageDir = join(stageRoot, `scale-${scale}`);
      mkdirSync(stageDir, { recursive: true });
      stageDegradedFixtures(stageDir, mix);
      const planFile = join(artifactsRoot, `plan-${scale}.json`);
      writeFileSync(planFile, JSON.stringify({ mix, expected, degradedIds: degradedIdsFor(mix) }));
      plans.push({ scale, stageDir, planFile });
    }

    const results = [];
    for (const plan of plans) {
      const outFile = join(artifactsRoot, `result-${plan.scale}.json`);
      console.log(`[dataset-benchmark] === scale ${plan.scale} (fresh launcher invocation) ===`);
      await runLauncher(plan.scale, plan.stageDir, plan.planFile, outFile);
      results.push(JSON.parse(readFileSync(outFile, "utf8")));

      if (opts.drillBetweenScales && plan.scale === opts.scales[0]) {
        throw new Error("DRILL: deliberate mid-run failure thrown between scales");
      }
    }

    results.sort((a, b) => a.scale - b.scale);
    const record = {
      schema: RECORD_SCHEMA,
      recordedAt: new Date().toISOString(),
      revision: opts.revision,
      machine: machineInfo(),
      runtime: {
        node: process.version,
        serverImplementation: results[0]?.serverImplementation ?? null,
        chromiumVersion: results[0]?.browser?.chromiumVersion ?? null,
        pitdBinaryMtime: fileMtimeIso(join(REPO_ROOT, "backend-ada", "server", "bin", "pitd")),
        frontendDistMtime: fileMtimeIso(FRONTEND_DIST),
      },
      config: {
        scales: opts.scales,
        warmupRuns: WARMUP_RUNS,
        measuredRuns: MEASURED_RUNS,
        seedConcurrency: SEED_CONCURRENCY,
        mutationObserverQuietWindowMs: QUIET_WINDOW_MS,
        degradedMixProportions: DEGRADED_MIX,
        crewType: CREW_TYPE,
        gameStem: GAME_STEM,
        routeClasses: ["roster", "collections", "entity-direct (>0)", "mutation (>0)"],
        launcher: "managed-browser-smoke.mjs — one fresh invocation per scale (independent data dirs)",
        browserResolution: "shared lib/chromium-resolve.mjs (BROWSER-01 order)",
      },
      scales: results,
    };

    mkdirSync(AUDIT_DIR, { recursive: true });
    writeFileSync(RECORD_FILE, JSON.stringify(record, null, 2) + "\n");
    console.log(`[dataset-benchmark] raw record written → ${RECORD_FILE}`);

    if (opts.record) {
      console.log("[dataset-benchmark] --record: budget enforcement skipped");
      return;
    }

    if (!existsSync(BUDGETS_FILE)) {
      console.error(`[dataset-benchmark] FAIL-CLOSED: no budgets file at ${BUDGETS_FILE}`);
      console.error(
        "Freeze one first: npm run test:benchmark -- --record, then npm run test:benchmark -- --freeze-budgets --revision <commit-id>",
      );
      process.exitCode = 1;
      return;
    }
    const budgets = JSON.parse(readFileSync(BUDGETS_FILE, "utf8"));
    if (budgets.schema !== BUDGETS_SCHEMA) {
      throw new Error(`${BUDGETS_FILE} has unexpected schema ${budgets.schema}`);
    }
    const violations = enforceBudgets(record, budgets);
    if (violations.length > 0) {
      for (const v of violations) console.error(`[dataset-benchmark] ${v}`);
      process.exitCode = 1;
      return;
    }
    console.log("[dataset-benchmark] PASS — all scales within frozen budgets");
  } finally {
    for (const dir of tempDirsCreatedByRun.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

// Drill wrapper: fires the deliberate mid-run failure, then proves the
// finally-block cleanup removed every temp dir and left no process holding a
// reference to them. Exits non-zero on leftover debris or a drill that never
// fired.
async function runDrillBetweenScales(opts) {
  let drillError = null;
  try {
    await runParent({ ...opts, drillBetweenScales: true });
  } catch (error) {
    drillError = error;
  }
  if (!drillError) {
    console.error("[dataset-benchmark] DRILL INVALID: mid-run failure never fired");
    process.exitCode = 1;
    return;
  }
  const problems = [];
  for (const dir of tempDirsCreatedByRun) {
    if (existsSync(dir)) problems.push(`leftover temp dir: ${dir}`);
  }
  problems.push(...verifyProcReferences(tempDirsCreatedByRun));
  if (problems.length > 0) {
    console.error(`[dataset-benchmark] DRILL FAIL (${drillError.message}):`);
    for (const p of problems) console.error(`[dataset-benchmark]   ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[dataset-benchmark] DRILL PASS — mid-run failure ("${drillError.message}") left no temp dirs and no live processes`,
  );
}

function verifyProcReferences(dirPaths) {
  const problems = [];
  const needles = dirPaths.map((d) => basename(d));
  if (needles.length === 0) return problems;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let cmdline;
    try {
      cmdline = readFileSync(`/proc/${entry}/cmdline`, "utf8");
    } catch {
      continue;
    }
    for (const needle of needles) {
      if (cmdline.includes(needle)) problems.push(`process ${entry} still references ${needle}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  if (opts.child) {
    await runChild(argv);
    return;
  }
  if (opts.drillBetweenScales) {
    await runDrillBetweenScales(opts);
    return;
  }
  await runParent(opts);
}

main().catch((error) => {
  console.error(`[dataset-benchmark] FAILED: ${error?.stack ?? error}`);
  process.exit(1);
});
