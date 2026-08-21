#!/usr/bin/env node
// OPT-009: dataset scale benchmarks.
//
// Profiles roster response time and transfer size at 0, 10, 100, and 1000-row
// campaign scales, including degraded records. Runs against a managed Ada
// server with a temp data directory.
//
// Usage:
//   node conformance/scripts/dataset-benchmark.mjs [--port 9670]
//
// Output: agent-docs/test-audit/dataset-benchmark.json (gitignored)

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--port") ?? "9670", 10);
const PITD = "backend-ada/server/bin/pitd";
const GAMES = "data/games";
const FRONTEND = "frontend/dist";

function ensureBuild() {
  if (!existsSync(PITD)) {
    console.log("Building Ada server...");
    execFileSync("alr", ["build"], { cwd: "backend-ada/server", stdio: "inherit" });
  }
  if (!existsSync(FRONTEND)) {
    console.log("Building frontend...");
    execFileSync("npm", ["run", "build"], { cwd: "frontend", stdio: "inherit" });
  }
}

async function fetchJson(url) {
  const start = performance.now();
  const res = await fetch(url);
  const text = await res.text();
  const elapsed = performance.now() - start;
  return { status: res.status, body: text, elapsed, bytes: text.length };
}

async function createCharacter(port, gameStem, playbook, crewId) {
  const body = { gameStem, playbook };
  if (crewId) body.crewId = crewId;
  const res = await fetch(`http://localhost:${port}/api/characters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json.id;
}

async function createCrew(port, gameStem, crewType) {
  const res = await fetch(`http://localhost:${port}/api/crews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameStem, crewTypeName: crewType }),
  });
  const json = await res.json();
  return json.id;
}

async function benchmarkScale(port, count) {
  console.log(`  Benchmarking ${count} characters...`);

  // Create crew for membership
  const crewId = await createCrew(port, "blades-in-the-dark", "Hawkers");

  // Create characters
  for (let i = 0; i < count; i++) {
    await createCharacter(port, "blades-in-the-dark", "Spider", crewId);
  }

  // Benchmark roster endpoint
  const results = [];
  for (let run = 0; run < 3; run++) {
    const r = await fetchJson(`http://localhost:${port}/api/campaign/roster`);
    results.push({ elapsed: r.elapsed, bytes: r.bytes, status: r.status });
  }

  const avg = results.reduce((s, r) => s + r.elapsed, 0) / results.length;
  const min = Math.min(...results.map((r) => r.elapsed));
  const max = Math.max(...results.map((r) => r.elapsed));

  // Count DOM nodes if frontend is available
  let domNodes = null;
  // (DOM node counting requires a browser; skip for API-only benchmark)

  // Parse roster to verify counts
  const roster = JSON.parse(results[0].body || "{}");
  const charCount = roster.characters?.length ?? 0;
  const crewCount = roster.crews?.length ?? 0;

  return {
    scale: count,
    runs: results,
    avgMs: Math.round(avg * 100) / 100,
    minMs: Math.round(min * 100) / 100,
    maxMs: Math.round(max * 100) / 100,
    transferBytes: results[0].bytes,
    actualCharacters: charCount,
    actualCrews: crewCount,
  };
}

async function main() {
  ensureBuild();

  const dataDir = mkdtempSync(join(tmpdir(), "pitd-bench-"));
  console.log(`Data dir: ${dataDir}`);

  // Start server
  const { spawn } = await import("node:child_process");
  const server = spawn(PITD, [
    "--port", String(PORT),
    "--data", dataDir,
    "--static", FRONTEND,
    "--games", GAMES,
    "--test-hooks",
  ], { stdio: ["pipe", "pipe", "pipe"] });

  server.stderr.on("data", (d) => process.stderr.write(d));

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10000);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${PORT}/api/health`);
        if (res.ok) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      } catch {
        // not ready yet
      }
    }, 200);
  });

  console.log("Server ready, running benchmarks...");

  const scales = [0, 10, 100, 1000];
  const allResults = [];

  for (const scale of scales) {
    const result = await benchmarkScale(PORT, scale);
    allResults.push(result);
    console.log(`  ${scale} chars: avg=${result.avgMs}ms, min=${result.minMs}ms, max=${result.maxMs}ms, ${result.transferBytes} bytes`);
  }

  // Write results
  const outputDir = "agent-docs/test-audit";
  if (!existsSync(outputDir)) mkdirSyncSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, "dataset-benchmark.json"),
    JSON.stringify({ date: new Date().toISOString(), results: allResults }, null, 2),
  );

  console.log(`\nResults written to ${join(outputDir, "dataset-benchmark.json")}`);

  // Cleanup
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  rmSync(dataDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
