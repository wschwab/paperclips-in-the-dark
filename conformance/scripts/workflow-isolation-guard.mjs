#!/usr/bin/env node
// OPT-010: workflow isolation guard.
//
// Checks that a command spawning the Ada server uses a managed temp data
// directory, not the default campaign-data path. Fails if the command's
// --data argument points at data/games/ or campaign-data/.
//
// Per AUDIT-0 Wave 6:
// - "Generated agent/browser instructions must require a managed base URL
//    and temp data directory."
// - "Add a guard that fails test/smoke commands if they target the default
//    campaign-data/ unless explicitly in human/manual mode."
//
// Usage:
//   node conformance/scripts/workflow-isolation-guard.mjs -- <child...>
//   node conformance/scripts/workflow-isolation-guard.mjs --check-command "pitd --data /tmp/..."
//   node conformance/scripts/workflow-isolation-guard.mjs --help
//
// The guard inspects the child command's arguments for --data and verifies
// the path is NOT under the repo root's data/ directory. The --manual flag
// overrides the guard for human-authorized manual runs.

import { spawn } from "node:child_process";
import { resolve, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

const FORBIDDEN_DATA_PATHS = [
  "data/games",
  "data/campaign",
  "campaign-data",
  "data/entities",
];

function isForbiddenDataPath(dataPath) {
  const rel = relative(repoRoot, resolve(repoRoot, dataPath));
  return FORBIDDEN_DATA_PATHS.some((p) => rel === p || rel.startsWith(p + "/"));
}

function extractDataArg(args) {
  // Find --data <path> or --data=<path>
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--data" && i + 1 < args.length) {
      return args[i + 1];
    }
    if (args[i].startsWith("--data=")) {
      return args[i].slice("--data=".length);
    }
  }
  return null;
}

export function checkCommand(args, { manual = false } = {}) {
  if (manual) return { ok: true, reason: "manual mode" };

  const dataPath = extractDataArg(args);
  if (!dataPath) {
    return { ok: false, reason: "no --data argument found" };
  }
  if (isForbiddenDataPath(dataPath)) {
    return { ok: false, reason: `--data path "${dataPath}" is a forbidden default path` };
  }
  return { ok: true, reason: `--data path "${dataPath}" is a managed temp directory` };
}

function usage() {
  return [
    "workflow-isolation-guard — verify commands use managed temp data dirs",
    "",
    "Usage:",
    "  node conformance/scripts/workflow-isolation-guard.mjs -- <child...>",
    "  node conformance/scripts/workflow-isolation-guard.mjs --check-command 'pitd --data /tmp/...'",
    "",
    "Options:",
    "  --manual           allow forbidden paths (human-authorized manual mode)",
    "  --check-command <cmd>  check a command string without running it",
    "  --help             this text",
    "",
    "The guard inspects the child command's --data argument and fails if it",
    "points at data/games/, campaign-data/, or similar default paths.",
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
