#!/usr/bin/env node
// TA00 test-audit inventory generator (Wave 0 quarantine, action 3/4 baseline).
//
// Produces agent-docs/test-audit/inventory.json: a flat, deterministic
// registration inventory of the whole test/assert/proof base. One row per
// registration/assert/proof family:
//
//   - every vitest `test`/`it`/`describe` registration in the frontend
//     suite (frontend/ via vitest.config.ts), the conformance suite
//     (conformance/suites/), and the conformance tooling set
//     (conformance/ via vitest.tooling.config.ts) — read from
//     `vitest list --json`, one row per returned test;
//   - every `pragma Assert` in backend-ada/core/tests/core_tests.adb,
//     including multiline bodies parsed as a single row;
//   - every SPARK proof family: a spec subprogram in the core `.ads` specs
//     that carries a `with Pre` / `with Post` contract (the unit gnatprove
//     proves).
//
// Rows carry stable ids, human-readable names, repo-relative file paths,
// path-derived layers, frameworks, source line where the row is a
// source-located assert/proof, and BLANK audit decision fields
// (decision/target/dupeOf) that the ledger assigns later. Classifications are
// never guessed: nothing here decides keep/merge/upgrade/delete.
//
// Determinism: ids are stable (conformance bracket id when present, else a
// path+name slug; core_tests:<line>; <package>.<subprogram>) and rows are
// sorted by layer (enum order), then file, then name, then line, so a
// second run over unchanged sources produces byte-identical output. The artifact is
// written with `generated:false` until the orchestrator runs and flips it.
//
// Usage:
//   node scripts/test-audit-inventory.mjs --output <path>
//   node scripts/test-audit-inventory.mjs            (writes default path)
//   node scripts/test-audit-inventory.mjs --help
//
// Options:
//   --output <path>   write inventory.json here (default
//                      <repo>/agent-docs/test-audit/inventory.json)
//   --help            this text

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const conformanceDir = resolve(scriptDir, "..");
export const repoRoot = resolve(scriptDir, "..", "..");

// Path-derived audit layer vocabulary in canonical sort order (mirrors
// inventory.json schema.layer). compareRows ranks layers by this order, not
// alphabetically.
export const LAYERS = [
  "contract",
  "semantics",
  "persistence",
  "lifecycle",
  "parity",
  "tooling",
  "api",
  "components",
  "lib",
  "pages",
  "schema",
  "styles",
  "main",
  "ada-runtime",
  "spark-proof",
];

export function defaultOutputPath() {
  return resolve(repoRoot, "agent-docs", "test-audit", "inventory.json");
}

export function usage() {
  return [
    "test-audit-inventory.mjs — TA00 test/assert/proof inventory generator",
    "",
    "Usage: node scripts/test-audit-inventory.mjs [options]",
    "",
    "Options:",
    "  --output <path>   write inventory.json here",
    "                    (default agent-docs/test-audit/inventory.json)",
    "  --help            this text",
    "",
  ].join("\n");
}

export function parseArgs(argv = process.argv.slice(2)) {
  const opts = { output: defaultOutputPath(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") opts.help = true;
    else if (arg === "--output") {
      if (i + 1 >= argv.length) throw new Error("--output requires a path");
      opts.output = resolve(process.cwd(), argv[++i]);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

// -- Path-derived layer -------------------------------------------------------

// Derive the audit layer from a repo-relative path. The layer is read from the
// source tree location, never guessed from test content.
export function deriveLayer(relPath) {
  if (relPath.startsWith("backend-ada/core/tests/")) return "ada-runtime";
  if (relPath.endsWith(".ads") && relPath.startsWith("backend-ada/")) {
    return "spark-proof";
  }
  if (relPath.startsWith("conformance/suites/contract/")) return "contract";
  if (relPath.startsWith("conformance/suites/semantics/")) return "semantics";
  if (relPath.startsWith("conformance/suites/persistence/")) return "persistence";
  if (relPath.startsWith("conformance/suites/lifecycle/")) return "lifecycle";
  if (relPath.startsWith("conformance/suites/parity/")) return "parity";
  if (relPath.startsWith("conformance/")) return "tooling";
  if (/^frontend\/src\/api\//.test(relPath)) return "api";
  if (/^frontend\/src\/components\//.test(relPath)) return "components";
  if (/^frontend\/src\/lib\//.test(relPath)) return "lib";
  if (/^frontend\/src\/pages\//.test(relPath)) return "pages";
  if (/^frontend\/src\/schema\//.test(relPath)) return "schema";
  if (/^frontend\/src\/styles\//.test(relPath)) return "styles";
  if (relPath.startsWith("frontend/")) return "main";
  throw new Error(`cannot derive layer for ${relPath}`);
}

// -- Ids and slugs ----------------------------------------------------------

export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

// Extract a bracketed conformance testCase id ([FOO-001]) from a vitest name.
export function conformanceIdFromName(name) {
  const m = /\[([A-Z][A-Z0-9-]*)\]/.exec(name);
  return m ? m[1] : null;
}

// stable id for a vitest registration: the conformance bracket id when present,
// else a path+name slug.
export function idForVitest(name, relFile) {
  const bracketed = conformanceIdFromName(name);
  if (bracketed) return bracketed;
  return slugify(`${relFile} ${name}`);
}

// -- Ada pragma Assert parsing ------------------------------------------------

export function collapseAssertLabel(inner) {
  return inner.replace(/\s+/g, " ").trim();
}

// Parse `pragma Assert ( ... )` occurrences (balanced parens, multiline capable).
export function parseAdaAsserts(sourceText) {
  const out = [];
  const re = /\bpragma\s+Assert\b/g;
  let m;
  while ((m = re.exec(sourceText)) !== null) {
    const open = sourceText.indexOf("(", m.index);
    if (open === -1) continue;
    let depth = 0;
    let i = open;
    for (; i < sourceText.length; i++) {
      if (sourceText[i] === "(") depth++;
      else if (sourceText[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue;
    const inner = sourceText.slice(open + 1, i);
    const startLine = sourceText.slice(0, m.index).split("\n").length;
    const endLine = sourceText.slice(0, i + 1).split("\n").length;
    out.push({ line: startLine, endLine, label: collapseAssertLabel(inner) });
    re.lastIndex = i + 1;
  }
  return out;
}

// -- SPARK proof-family parsing ------------------------------------------------

// Extract contracted spec subprograms from a core `.ads` spec: a
// procedure/function declaration carrying a `with Pre` / `with Post` aspect
// (one proof family per subprogram contract). Only contracts are counted, so
// plain declarations (`;` at depth 0) and expression/null-body functions
// (`is` at depth 0) are excluded — a later aspect never grabs an earlier name.
export function parseProofFamilies(sourceText) {
  const out = [];
  const declRe =
    /(?:^|\n)[ \t]*(procedure|function)[ \t]+([A-Za-z_][A-Za-z_0-9]*)/g;
  const scanRe =
    /\(|\)|;|\bend\b|\bwith\s+(?:Pre|Post)\s*=>|\bis\b|(?:^|\n)[ \t]*(?:procedure|function|type|private)\b/g;
  let m;
  while ((m = declRe.exec(sourceText)) !== null) {
    const name = m[2];
    // The declaration keyword sits after the leading `(?:^|\n)` + spaces +
    // `procedure|function ` prefix; count newlines up to the keyword itself.
    const kwOffset = m.index + m[0].indexOf(name);
    const line = sourceText.slice(0, kwOffset).split("\n").length;
    let depth = 0;
    let contracted = false;
    scanRe.lastIndex = declRe.lastIndex;
    let t;
    while ((t = scanRe.exec(sourceText)) !== null) {
      if (depth === 0) {
        if (t[0] === "(") {
          depth++;
          continue;
        }
        if (t[0].startsWith("with")) contracted = true;
        break;
      }
      if (t[0] === "(") depth++;
      else if (t[0] === ")") depth--;
    }
    if (contracted) out.push({ name, line });
    declRe.lastIndex = m.index + m[0].length;
  }
  return out;
}

// -- Row assembly -----------------------------------------------------------

// The package a spec belongs to, from its `package <name> is` (spec) line.
export function packageOfSpec(sourceText) {
  const m =
    /\bpackage\s+(Paperclips_Core(?:\.[A-Za-z_][A-Za-z_0-9]*)+)\s+is\b/.exec(
      sourceText,
    );
  return m ? m[1] : null;
}

export function blankRow() {
  return { decision: "", target: "", dupeOf: "" };
}

export function makeVitestRow({ id, name, relFile, line = null }) {
  return {
    id,
    name,
    file: relFile,
    layer: deriveLayer(relFile),
    framework: "vitest",
    line,
    ...blankRow(),
  };
}

export function makeAdaRow({ line, label, relFile }) {
  return {
    id: `core_tests:${line}`,
    name: label,
    file: relFile,
    layer: "ada-runtime",
    framework: "ada-runtime",
    line,
    ...blankRow(),
  };
}

export function makeProofRow({ subprogram, pkg, line, relFile }) {
  const family = `${pkg}.${subprogram}`;
  return {
    id: family,
    name: family,
    file: relFile,
    layer: "spark-proof",
    framework: "spark-proof",
    line,
    ...blankRow(),
  };
}

// -- Vitest list parsing -----------------------------------------------------

// Convert a `vitest list --json` array into inventory rows.
export function rowsFromVitestList(rows, { repoRelativeFile }) {
  return rows
    .filter((r) => r && typeof r.name === "string" && typeof r.file === "string")
    .map((r) =>
      makeVitestRow({
        id: idForVitest(r.name, repoRelativeFile(r.file)),
        name: r.name,
        relFile: repoRelativeFile(r.file),
      }),
    );
}

// -- Sorting ---------------------------------------------------------------

// Absolute ordering key for rows: layer (enum order), file, name, then line
// (null last).
export function compareRows(a, b) {
  const li = LAYERS.indexOf(a.layer);
  const lj = LAYERS.indexOf(b.layer);
  if (li !== lj) return li - lj;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  const la = a.line === null || a.line === undefined ? Infinity : a.line;
  const lb = b.line === null || b.line === undefined ? Infinity : b.line;
  if (la !== lb) return la < lb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortRows(rows) {
  return [...rows].sort(compareRows);
}

// -- Collection (runs vitest + parses Ada) --------------------------------

function runVitestList(cwd, config) {
  const args = ["vitest", "list", "--json"];
  if (config) args.push("--config", config);
  const stdout = execFileSync("npx", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(stdout);
}

function repoRelative(repoRootDir, absPath) {
  return absPath.startsWith(repoRootDir + "/")
    ? absPath.slice(repoRootDir.length + 1)
    : absPath;
}

// Run all three vitest lists + the Ada parse and return row bundles grouped by
// source. The subprocess part is isolated here so helper tests exercise only the
// pure functions.
export async function collect(repoRootDir = repoRoot) {
  const frontendDir = resolve(repoRootDir, "frontend");
  const confDir = resolve(repoRootDir, "conformance");
  const rel = (abs) => repoRelative(repoRootDir, abs);

  const frontBundles = rowsFromVitestList(runVitestList(frontendDir, null), {
    repoRelativeFile: rel,
  });
  const confBundles = rowsFromVitestList(runVitestList(confDir, null), {
    repoRelativeFile: rel,
  });
  const toolBundles = rowsFromVitestList(
    runVitestList(confDir, "vitest.tooling.config.ts"),
    { repoRelativeFile: rel },
  );

  const coreTestsText = await readFile(
    resolve(repoRootDir, "backend-ada", "core", "tests", "core_tests.adb"),
    "utf8",
  );
  const adaRows = parseAdaAsserts(coreTestsText).map((a) =>
    makeAdaRow({
      line: a.line,
      label: a.label,
      relFile: "backend-ada/core/tests/core_tests.adb",
    }),
  );

  const proofRows = [];
  for (const fileName of [
    "paperclips_core-bounded_integers.ads",
    "paperclips_core-funds.ads",
    "paperclips_core-gear.ads",
    "paperclips_core-experience_trackers.ads",
    "paperclips_core-crews.ads",
    "paperclips_core-monitors.ads",
    "paperclips_core-clocks.ads",
  ]) {
    const text = await readFile(
      resolve(repoRootDir, "backend-ada", "core", "src", fileName),
      "utf8",
    );
    const pkg = packageOfSpec(text);
    if (!pkg) continue;
    for (const p of parseProofFamilies(text)) {
      proofRows.push(
        makeProofRow({
          subprogram: p.name,
          pkg,
          line: p.line,
          relFile: `backend-ada/core/src/${fileName}`,
        }),
      );
    }
  }

  return {
    frontend: frontBundles,
    conformance: confBundles,
    tooling: toolBundles,
    ada: adaRows,
    proof: proofRows,
  };
}

// -- Assembly --------------------------------------------------------------

// Assemble the full inventory.json object. `generated` stays false until the
// orchestrator runs; decision/target/dupeOf are blank until the ledger assigns.
export function assemble(bundles) {
  const grouped = [
    ...bundles.frontend,
    ...bundles.conformance,
    ...bundles.tooling,
    ...bundles.ada,
    ...bundles.proof,
  ];
  return {
    schema: {
      $id: "ta00-inventory-v1",
      description:
        "Flat registration inventory of the test/assert/proof base: every TS vitest registration (frontend, conformance suites, conformance tooling), every Ada pragma Assert in core_tests.adb, and every SPARK proof family (subprogram contract) in the core specs. Rows carry stable ids, names, relative file paths, path-derived layers, frameworks, and BLANK audit decision fields (keep/merge/upgrade/delete) that the ledger assigns. Classifications are never guessed.",
      fields: {
        id: "stable identifier (conformance testCase id when bracketed; else path+name slug; core_tests:<line>; <package>.<subprogram>)",
        name: "human-readable registration name (rollup chain for vitest; ada assert label; package.subprogram for proof family)",
        file: "repo-relative path",
        layer:
          "path-derived audit layer (contract|semantics|persistence|lifecycle|parity|tooling|api|components|lib|pages|schema|styles|main|ada-runtime|spark-proof)",
        framework: "vitest | ada-runtime | spark-proof",
        line:
          "1-based source line when the row is a source-located assert/proof; null for vitest rows",
        decision:
          "blank until the ledger assigns keep|merge|upgrade|delete",
        target: "blank until the ledger names the guarded mutant/invariant",
        dupeOf: "blank until a merge links a canonical row",
      },
      generated: false,
    },
    generated: false,
    groups: [],
    rows: sortRows(grouped),
  };
}

// -- Output ----------------------------------------------------------------

// Atomic write: write to a temp sibling then rename (repo atomic-write style).
export async function writeInventory(inventory, outputPath) {
  const tmp = `${outputPath}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(tmp, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  await rename(tmp, outputPath);
  return outputPath;
}

// -- CLI ------------------------------------------------------------------

export async function generate({ output = defaultOutputPath() } = {}) {
  const bundles = await collect(repoRoot);
  const inventory = assemble(bundles);
  await writeInventory(inventory, output);
  return { output, rowCount: inventory.rows.length };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(usage());
    return { help: true };
  }
  const result = await generate({ output: opts.output });
  process.stdout.write(
    `[test-audit-inventory] wrote ${result.rowCount} rows to ${result.output}\n`,
  );
  return result;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`test-audit-inventory: ${err.message}\n`);
    process.exitCode = 1;
  });
}
