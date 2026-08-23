#!/usr/bin/env node
// OPT-010: workflow isolation guard.
//
// Automated workflows may start the Ada server only through the canonical
// managed launcher, which owns its port, data directory, and process tree.
// Direct server commands require the explicit human/manual override because
// an argument check cannot prove that a caller-provided directory is fresh or
// launcher-owned.
//
// Usage:
//   node conformance/scripts/workflow-isolation-guard.mjs -- <child...>
//   node conformance/scripts/workflow-isolation-guard.mjs --check-command "node conformance/scripts/managed-run.mjs"
//   node conformance/scripts/workflow-isolation-guard.mjs --help

import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const managedRunPath = join(repoRoot, "conformance", "scripts", "managed-run.mjs");


function isCanonicalManagedRun(args) {
  if (args.length === 0) return false;
  const candidate = args[0] === process.execPath || args[0] === "node" ? args[1] : args[0];
  return candidate !== undefined && resolve(repoRoot, candidate) === managedRunPath;
}

export function checkCommand(args, { manual = false } = {}) {
  if (manual) return { ok: true, reason: "manual mode" };

  if (isCanonicalManagedRun(args)) {
    return { ok: true, reason: "canonical managed-run launcher" };
  }

  return { ok: false, reason: "automated commands must use the canonical managed-run launcher" };
}

function usage() {
  return [
    "workflow-isolation-guard — require the canonical managed launcher",
    "",
    "Usage:",
    "  node conformance/scripts/workflow-isolation-guard.mjs -- <child...>",
    "  node conformance/scripts/workflow-isolation-guard.mjs --check-command 'node conformance/scripts/managed-run.mjs'",
    "",
    "Options:",
    "  --manual           allow a direct command (human-authorized manual mode)",
    "  --check-command <cmd>  check a command string without running it",
    "  --help             this text",
    "",
    "Automated commands must invoke the exact canonical managed-run launcher.",
  ].join("\n");
}

export function parseArgs(argv) {
  if (argv.includes("--help")) return { help: true };
  const manual = argv.includes("--manual");
  const checkCmdIdx = argv.indexOf("--check-command");
  if (checkCmdIdx !== -1 && checkCmdIdx + 1 < argv.length) {
    return { checkCommand: argv[checkCmdIdx + 1], manual };
  }
  const sepIdx = argv.indexOf("--");
  if (sepIdx === -1 || sepIdx === argv.length - 1) {
    return { help: true };
  }
  return { child: argv.slice(sepIdx + 1), manual };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.error(usage());
    return 2;
  }

  if (args.checkCommand) {
    const childArgs = args.checkCommand.split(/\s+/);
    const result = checkCommand(childArgs, { manual: args.manual });
    if (result.ok) {
      console.log(`OK: ${result.reason}`);
      return 0;
    }
    console.error(`FAIL: ${result.reason}`);
    return 1;
  }

  // Run child after checking
  const result = checkCommand(args.child, { manual: args.manual });
  if (!result.ok) {
    console.error(`FAIL: ${result.reason}`);
    console.error("Use --manual for human-authorized manual runs.");
    return 1;
  }

  console.log(`OK: ${result.reason}`);
  const child = spawn(args.child[0], args.child.slice(1), {
    stdio: "inherit",
    cwd: repoRoot,
  });
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main().then((code) => process.exit(code));
}
