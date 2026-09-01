#!/usr/bin/env node
// fake-server.js — a controllable fake server for SAFE-02 launch-script tests.
//
// Reads configuration from --port, --data (from the script's argv) and from
// the environment variables below (set by the test harness):
//   FAKE_STATE_FILE    — path to write a JSON state object for the test
//   FAKE_IMPL          — value for the "implementation" field in /api/health
//   FAKE_DATA_DIR      — value for the "dataDir" field in /api/health
//   FAKE_EXIT_ON_START — if "1", exit immediately with code 1 (simulate crash)
//   FAKE_BIND_FAILURE — if "1", simulate a bind failure (EADDRINUSE-like)
//   FAKE_BIND_PORT     — if set, try to bind to this port (may collide/fail)
//
// Behaviour:
//   1. Parse --port and --data from argv.
//   2. If FAKE_EXIT_ON_START=1, write state { exited: true } and exit 1.
//   3. Start an HTTP server on the chosen port serving /api/health.
//   4. On SIGTERM/SIGINT, exit cleanly.

import http from "node:http";
import { writeFileSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf("--port") + 1] ?? "0");
const dataDir = argv[argv.indexOf("--data") + 1] ?? "";

const stateFile = process.env.FAKE_STATE_FILE;
const impl = process.env.FAKE_IMPL ?? "ada";
const exitOnStart = process.env.FAKE_EXIT_ON_START === "1";
const bindFailure = process.env.FAKE_BIND_FAILURE === "1";
const fakeDataDir = process.env.FAKE_DATA_DIR ?? dataDir;

function writeState(obj) {
  if (!stateFile) return;
  let prev = {};
  try { prev = JSON.parse(readFileSync(stateFile, "utf8")); } catch {}
  try {
    writeFileSync(stateFile, JSON.stringify({ ...prev, ...obj }));
  } catch {}
}

// Simulate startup failure
if (exitOnStart) {
  writeState({ pid: process.pid, exited: true, reason: "fake-exit-on-start" });
  console.error("fake-server: configured to exit on start");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", implementation: impl, dataDir: fakeDataDir, version: "0.2.0-fake" }));
  } else if (req.url === "/" || req.url === "/roster") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end('<div id="app"></div>');
  } else if (req.url === "/api/games/blades-in-the-dark") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ name: "Blades in the Dark" }));
  } else if (req.url === "/api/campaign/roster") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ characters: [] }));
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    writeState({ pid: process.pid, exited: true, reason: "EADDRINUSE", port });
    console.error(`fake-server: port ${port} already in use`);
    process.exit(1);
  }
  console.error("fake-server: server error:", err);
  process.exit(1);
});

// Simulate bind failure: write state and exit without listening
if (bindFailure) {
  writeState({ pid: process.pid, exited: true, reason: "fake-bind-failure", port });
  console.error(`fake-server: bind failure on port ${port}`);
  process.exit(1);
}
server.listen(port, "127.0.0.1", () => {
  const actualPort = server.address().port;
  writeState({ pid: process.pid, port: actualPort, dataDir, listening: true });
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  writeState({ pid: process.pid, exiting: true, signal: "SIGTERM" });
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  writeState({ pid: process.pid, exiting: true, signal: "SIGINT" });
  server.close(() => process.exit(0));
});
