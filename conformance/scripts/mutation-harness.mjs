#!/usr/bin/env node
/**
 * AUDIT-0 Wave 3 — Controlled mutation harness.
 *
 * Applies each mutant from agent-docs/test-audit/mutation-catalog.json,
 * builds the affected layer, runs the intended catching layer's tests,
 * and records killed/survived status.
 *
 * Reverts ONLY the mutated files (not the whole working copy) so the
 * harness script itself survives the revert.
 *
 * Usage:
 *   node conformance/scripts/mutation-harness.mjs           # run all mutants
 *   node conformance/scripts/mutation-harness.mjs M01 M04   # run specific mutants
 *   node conformance/scripts/mutation-harness.mjs --frontend-only
 *   node conformance/scripts/mutation-harness.mjs --backend-only
 *
 * Output: agent-docs/test-audit/mutation-baseline.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const CATALOG_PATH = join(REPO_ROOT, "agent-docs/test-audit/mutation-catalog.json");
const OUTPUT_PATH = join(REPO_ROOT, "agent-docs/test-audit/mutation-baseline.json");
function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function replaceExactlyOnce(content, search, replacement, context) {
  if (search === replacement) throw new Error(`${context}: replacement is byte-identical`);
  const first = content.indexOf(search);
  const second = first === -1 ? -1 : content.indexOf(search, first + search.length);
  if (first === -1 || second !== -1) {
    throw new Error(`${context}: expected anchor exactly once`);
  }
  return `${content.slice(0, first)}${replacement}${content.slice(first + search.length)}`;
}

/**
 * Apply exact, uniquely anchored edits and retain byte snapshots for restoration.
 * Validation completes for every edit before the first file is written.
 */
export async function applyVerifiedEdits(repoRoot, edits) {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error("mutation has no verified edits");
  }
  const byFile = new Map();
  for (const edit of edits) {
    if (!edit.file || !edit.symbol || typeof edit.search !== "string" || typeof edit.replacement !== "string") {
      throw new Error("mutation edit requires file, symbol, search, and replacement");
    }
    if (edit.search === edit.replacement) {
      throw new Error(`${edit.file} ${edit.symbol}: replacement is byte-identical`);
    }
    const absolute = resolve(repoRoot, edit.file);
    let entry = byFile.get(absolute);
    if (!entry) {
      const bytes = readFileSync(absolute);
      entry = { absolute, original: bytes, content: bytes.toString("utf8"), regions: [] };
      byFile.set(absolute, entry);
    }
    const first = entry.content.indexOf(edit.search);
    const second = first === -1 ? -1 : entry.content.indexOf(edit.search, first + edit.search.length);
    if (first === -1 || second !== -1) {
      throw new Error(
        `${edit.file} ${edit.symbol}: expected mutation anchor to match exactly once; found ${first === -1 ? 0 : "multiple"}`,
      );
    }
    entry.content = `${entry.content.slice(0, first)}${edit.replacement}${entry.content.slice(first + edit.search.length)}`;
    entry.regions.push({ symbol: edit.symbol, offset: first });
  }
  const snapshots = [];
  try {
    for (const entry of byFile.values()) {
      const changed = Buffer.from(entry.content);
      if (hash(changed) === hash(entry.original)) {
        throw new Error(`${entry.absolute}: mutation changed no bytes`);
      }
      writeFileSync(entry.absolute, changed);
      snapshots.push({
        path: entry.absolute,
        bytes: entry.original,
        hash: hash(entry.original),
        regions: entry.regions,
      });
    }
  } catch (error) {
    for (const snapshot of snapshots) writeFileSync(snapshot.path, snapshot.bytes);
    throw error;
  }
  return snapshots;
}

export function classifyMutant({ baseline, mutant, expectedFailureIds, runState }) {
  const baselineFailures = new Set(baseline.filter((test) => test.status === "failed").map((test) => test.id));
  const mutantFailures = mutant.filter((test) => test.status === "failed").map((test) => test.id);
  const newFailureIds = mutantFailures.filter((id) => !baselineFailures.has(id));
  const expected = new Set(expectedFailureIds);
  const expectedNewFailures = newFailureIds.filter((id) => expected.has(id));
  if (expectedNewFailures.length > 0) {
    return { state: "killed", killed: true, newFailureIds: expectedNewFailures.sort() };
  }
  if (runState === "completed" || (runState === "test-failure" && mutant.length > 0)) {
    return { state: "survived", killed: false, newFailureIds: newFailureIds.sort() };
  }
  return { state: runState, killed: false, newFailureIds: newFailureIds.sort() };
}

export async function executeMutant({ repoRoot, mutant, baselineTests, runMutant }) {
  let snapshots = [];
  let classified;
  let restorationError;
  try {
    snapshots = await applyVerifiedEdits(repoRoot, mutant.edits);
    const run = await runMutant();
    classified = classifyMutant({
      baseline: baselineTests,
      mutant: run.tests ?? [],
      expectedFailureIds: mutant.expectedFailureIds,
      runState: run.state,
    });
  } catch (error) {
    classified = { state: "harness-error", killed: false, newFailureIds: [], error: String(error) };
  } finally {
    for (const snapshot of snapshots) {
      writeFileSync(snapshot.path, snapshot.bytes);
      if (hash(readFileSync(snapshot.path)) !== snapshot.hash) {
        restorationError = new Error(`failed byte-exact restoration of ${snapshot.path}`);
      }
    }
  }
  if (restorationError) throw restorationError;
  return { ...classified, restored: snapshots.length > 0 };
}

export async function executeCampaign({ mutants: campaignMutants, runBaseline, runMutant, onApply, repoRoot = REPO_ROOT }) {
  const baseline = await runBaseline();
  const failures = (baseline.tests ?? []).filter((test) => test.status !== "passed");
  if (baseline.state !== "completed" || failures.length > 0) {
    throw new Error("unmodified mutation baseline must be green before classification");
  }
  const results = [];
  for (const mutant of campaignMutants) {
    if (onApply) await onApply(mutant);
    results.push(await executeMutant({
      repoRoot,
      mutant,
      baselineTests: baseline.tests,
      runMutant: () => runMutant(mutant),
    }));
  }
  return results;
}

export async function writeMutationArtifact({ mode, fullPath, diagnosticsDir, runId, artifact }) {
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  if (mode === "targeted") {
    mkdirSync(diagnosticsDir, { recursive: true });
    const target = join(diagnosticsDir, `${runId}.json`);
    const temporary = `${target}.tmp-${process.pid}`;
    writeFileSync(temporary, text);
    renameSync(temporary, target);
    return target;
  }
  mkdirSync(resolve(fullPath, ".."), { recursive: true });
  const temporary = `${fullPath}.tmp-${process.pid}`;
  writeFileSync(temporary, text);
  renameSync(temporary, fullPath);
  return fullPath;
}

// Parse args
const args = process.argv.slice(2);
const specificMutants = args.filter(a => a.startsWith("M"));
const frontendOnly = args.includes("--frontend-only");
const backendOnly = args.includes("--backend-only");

// Load catalog
const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
let mutants = catalog.mutants;

if (specificMutants.length > 0) {
  mutants = mutants.filter(m => specificMutants.includes(m.id));
}
if (frontendOnly) {
  mutants = mutants.filter(m => m.layer === "frontend");
}
if (backendOnly) {
  mutants = mutants.filter(m => m.layer === "backend-ada");
}

// ─── Mutation definitions ─────────────────────────────────────────────────
// Each mutation returns { files: [paths], apply: (repoRoot) => desc }
// `files` is the list of files to restore after the test.

const mutations = {
  // M01: suppress crew history projections at their History_Count source.
  M01: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        'History_Count ("crew", Str_Field (C, "id"))',
        "0",
        "M01 Crew_Summary History_Count",
      );
      writeFileSync(file, changed);
      return "Forced Crew_Summary History_Count projection to zero";
    },
  },

  // M02: Make relatedClockIds optional in clock decoder (reverse Wave 2C fix)
  M02: {
    files: ["frontend/src/schema/clock.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/schema/clock.ts");
      let content = readFileSync(file, "utf8");
      // The actual code has: relatedClockIds: Schema.Array(Uuid)
      // in ClockInput, ClockOutput, ClockSummary structs
      // Change the FIRST occurrence (ClockInput) to optionalWith default
      const pattern = /relatedClockIds:\s*Schema\.Array\(Uuid\)/;
      if (!pattern.test(content)) {
        throw new Error("M02: Could not find relatedClockIds: Schema.Array(Uuid)");
      }
      // Only change the first occurrence (ClockInput)
      let changed = false;
      content = content.replace(pattern, (match) => {
        if (changed) return match;
        changed = true;
        return 'relatedClockIds: Schema.optionalWith(Schema.Array(Uuid), { default: () => [] })';
      });
      writeFileSync(file, content);
      return "Made relatedClockIds optional with default in ClockInput decoder";
    },
  },

  // M03: Allow excess nested keys in decoder (drop onExcessProperty rejection)
  M03: {
    files: ["frontend/src/schema/clock.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/schema/clock.ts");
      let content = readFileSync(file, "utf8");
      // The actual code uses onExcessProperty: "error"
      if (!content.includes('onExcessProperty: "error"')) {
        throw new Error("M03: Could not find onExcessProperty: \"error\"");
      }
      content = content.replaceAll('onExcessProperty: "error"', 'onExcessProperty: "ignore"');
      writeFileSync(file, content);
      return 'Changed onExcessProperty from "error" to "ignore" in clock decoder';
    },
  },

  // M04: Truncate key collection at 512 (reverse Wave 2B unbounded fix)
  M04: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      let content = readFileSync(file, "utf8");
      // Collect_Keys uses: Append (K, Create (String (Name)));
      // Add a length check before the Append to cap at 512
      const pattern = /Append\s*\(K,\s*Create\s*\(String\s*\(Name\)\)\s*\);/;
      if (!pattern.test(content)) {
        throw new Error("M04: Could not find Append (K, Create (String (Name))) in Collect_Keys");
      }
      content = content.replace(
        pattern,
        "if Length (K) < 512 then -- MUTANT M04: truncate at 512\n         Append (K, Create (String (Name)));\n         end if;"
      );
      writeFileSync(file, content);
      return "Truncated Collect_Keys to 512 entries";
    },
  },

  // M05: Change INVALID_ENTITY from 422 to 500
  M05: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      let content = readFileSync(file, "utf8");
      // Find S422 in Invalid_Entity contexts and change to S500
      if (!content.includes("S422")) {
        throw new Error("M05: Could not find S422 in pitd_callback.adb");
      }
      // Only change S422 in the Invalid_Entity_Result function, not all S422
      content = content.replace(
        /(function Invalid_Entity_Result[\s\S]*?)S422/g,
        '$1S500'
      );
      writeFileSync(file, content);
      return "Changed INVALID_ENTITY from 422 to 500";
    },
  },

  // M06: introduce the forbidden persistence write in Classify_Stored.
  M06: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `         E := Read (Bytes);
      exception`,
        `         E := Read (Bytes);
         Write_Entity (Kind, Id, E); -- MUTANT M06: write during classification
      exception`,
        "M06 Classify_Stored",
      );
      writeFileSync(file, changed);
      return "Injected a persistence write into Classify_Stored";
    },
  },

  // M07: Skip If-Match stale revision check
  M07: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      let content = readFileSync(file, "utf8");
      // The stale revision check at line ~6916-6921
      const pattern = /if Suffix \/= "import" and then Suffix \/= "repair"\n\s*and then Suffix \/= "repair-preview"\n\s*and then Header \(Request, "If-Match"\) \/= ""\n\s*then/;
      if (!pattern.test(content)) {
        throw new Error("M07: Could not find If-Match check block");
      }
      content = content.replace(pattern, 'if False then -- MUTANT M07: skip If-Match');
      writeFileSync(file, content);
      return "Skipped If-Match stale revision check";
    },
  },

  // M08: Skip pre-mutation snapshot (same as M06 in practice — the Snapshot call)
  M08: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      let content = readFileSync(file, "utf8");
      if (!content.includes("if Snapshots (Op) then Snapshot (Kind, Id, Op, Before); end if;")) {
        throw new Error("M08: Could not find snapshot call");
      }
      content = content.replace(
        "if Snapshots (Op) then Snapshot (Kind, Id, Op, Before); end if;",
        "null; -- MUTANT M08: skipped pre-mutation snapshot"
      );
      writeFileSync(file, content);
      return "Skipped pre-mutation snapshot on x-snapshot:true operation";
    },
  },

  // M09: Don't consume snapshot on undo (skip Delete_File)
  M09: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      let content = readFileSync(file, "utf8");
      // The undo handler deletes the snapshot file: Ada.Directories.Delete_File (Path);
      // which is at line ~7122 inside the undo handler
      const pattern = /Ada\.Directories\.Delete_File \(Path\);/;
      if (!pattern.test(content)) {
        throw new Error("M09: Could not find Delete_File (Path) in undo handler");
      }
      content = content.replace(pattern, "null; -- MUTANT M09: skip snapshot consumption");
      writeFileSync(file, content);
      return "Skipped snapshot consumption on undo";
    },
  },

  // M14: Delete owner clocks instead of reassigning (skip W5 reassignment)
  M14: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      let content = readFileSync(file, "utf8");
      // The W5 branch reassigns clocks: Set_Field (V, "ownerKind", "campaign");
      // Skip the entire W5 branch by changing the condition
      if (!content.includes("elsif Kind = \"character\" or else Kind = \"crew\" then")) {
        throw new Error("M14: Could not find W5 owner-deletion branch");
      }
      content = content.replace(
        'elsif Kind = "character" or else Kind = "crew" then',
        'elsif False then -- MUTANT M14: skip W5 reassignment'
      );
      writeFileSync(file, content);
      return "Skipped W5 owner-clock reassignment on entity delete";
    },
  },

  // M15: Leave related clock id dangling (skip W4 unlink sweep)
  M15: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      let content = readFileSync(file, "utf8");
      // The W4 branch unlinks related clock ids: if Kind = "clock" then
      if (!content.includes("if Kind = \"clock\" then")) {
        throw new Error("M15: Could not find W4 unlink branch");
      }
      content = content.replace(
        'if Kind = "clock" then',
        'if False then -- MUTANT M15: skip W4 unlink sweep'
      );
      writeFileSync(file, content);
      return "Skipped W4 unlink-on-delete sweep for related clocks";
    },
  },

  // M10: Clamp off by one (Applied := Item.Stress_Max instead of Item.Stress_Max - Item.Stress_Value)
  M10: {
    files: ["backend-ada/core/src/paperclips_core-monitors.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/core/src/paperclips_core-monitors.adb");
      let content = readFileSync(file, "utf8");
      if (!content.includes("Item.Stress_Max - Item.Stress_Value")) {
        throw new Error("M10: Could not find Item.Stress_Max - Item.Stress_Value");
      }
      content = content.replace(
        /Applied\s*:=\s*Item\.Stress_Max\s*-\s*Item\.Stress_Value;/g,
        "Applied := Item.Stress_Max; -- MUTANT M10: off by one"
      );
      writeFileSync(file, content);
      return "Changed stress clamp to Applied := Item.Stress_Max (off by one)";
    },
  },

  // M11: Auto-add trauma on stress overflow instead of setting Trauma_Pending
  M11: {
    files: ["backend-ada/core/src/paperclips_core-monitors.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/core/src/paperclips_core-monitors.adb");
      let content = readFileSync(file, "utf8");
      if (!content.includes("Item.Trauma_Pending := True")) {
        throw new Error("M11: Could not find Item.Trauma_Pending := True");
      }
      content = content.replace(
        /Item\.Trauma_Pending\s*:=\s*True/g,
        "Item.Trauma_Count := Item.Trauma_Count + 1; -- MUTANT M11: auto-add trauma"
      );
      writeFileSync(file, content);
      return "Changed Item.Trauma_Pending := True to auto-add trauma";
    },
  },

  // M12: Clear retirement during trauma removal
  M12: {
    files: ["backend-ada/core/src/paperclips_core-monitors.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/core/src/paperclips_core-monitors.adb");
      let content = readFileSync(file, "utf8");
      // The actual code uses: Item.Trauma_Count := Item.Trauma_Count - 1;
      if (!content.includes("Item.Trauma_Count := Item.Trauma_Count - 1")) {
        throw new Error("M12: Could not find Item.Trauma_Count decrement in Remove_Trauma");
      }
      content = content.replace(
        /Item\.Trauma_Count\s*:=\s*Item\.Trauma_Count\s*-\s*1/g,
        "Item.Trauma_Count := Item.Trauma_Count - 1;\n      Item.Retired_Flag := False; -- MUTANT M12: clear retirement"
      );
      writeFileSync(file, content);
      return "Added Item.Retired_Flag := False to Remove_Trauma";
    },
  },

  // M13: Drop clock rollover accumulation (overwrite instead of add)
  M13: {
    files: ["backend-ada/core/src/paperclips_core-clocks.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/core/src/paperclips_core-clocks.adb");
      let content = readFileSync(file, "utf8");
      if (!content.includes("Item.Overflow := Item.Overflow + (Amount - Applied)")) {
        throw new Error("M13: Could not find clock rollover accumulation");
      }
      content = content.replace(
        /Item\.Overflow\s*:=\s*Item\.Overflow\s*\+\s*\(Amount\s*-\s*Applied\);/g,
        "Item.Overflow := Amount - Applied; -- MUTANT M13: drop accumulation"
      );
      writeFileSync(file, content);
      return "Changed clock overflow from accumulate to overwrite";
    },
  },

  // M16: Hardcode a game-settings maximum lookup
  M16: {
    files: ["backend-ada/server/src/pitd_callback.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_callback.adb");
      let content = readFileSync(file, "utf8");
      // The settings-derived maxima use Settings_Int (S, "StressMax", 0)
      // Replace the first StressMax lookup with a hardcoded 9
      if (!content.includes('Settings_Int (S, "StressMax", 0)')) {
        throw new Error('M16: Could not find Settings_Int (S, "StressMax", 0)');
      }
      content = content.replace(
        'Trim_Image (Settings_Int (S, "StressMax", 0))',
        '"9"'
      );
      writeFileSync(file, content);
      return "Hardcoded StressMax settings lookup to 9";
    },
  },

  // M17: omit recovery in the typed exported focus functions.
  M17: {
    files: ["frontend/src/lib/focus.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/lib/focus.ts");
      let content = readFileSync(file, "utf8");
      content = replaceExactlyOnce(
        content,
        "export function captureFocusTarget(root: HTMLElement): FocusTarget | null {",
        "export function captureFocusTarget(root: HTMLElement): FocusTarget | null {\n  return null; // MUTANT M17",
        "M17 captureFocusTarget",
      );
      content = replaceExactlyOnce(
        content,
        "export function applyFocusTarget(root: HTMLElement, target: FocusTarget): boolean {",
        "export function applyFocusTarget(root: HTMLElement, target: FocusTarget): boolean {\n  return false; // MUTANT M17",
        "M17 applyFocusTarget",
      );
      writeFileSync(file, content);
      return "Disabled capture and apply focus recovery";
    },
  },

  // M18: Reduce action-dot hit area
  M18: {
    files: ["frontend/src/styles/components.css"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/styles/components.css");
      let content = readFileSync(file, "utf8");
      if (!content.includes("action-dot")) {
        throw new Error("M18: Could not find .action-dot in components.css");
      }
      content = content.replace(
        /(\.action-dot\s*\{[^}]*?width:\s*)16px/g,
        '$18px'
      );
      content = content.replace(
        /(\.action-dot\s*\{[^}]*?height:\s*)16px/g,
        '$18px'
      );
      writeFileSync(file, content);
      return "Reduced action-dot from 16x16 to 8x8";
    },
  },

  // M19: Route '/' away from roster
  M19: {
    files: ["frontend/src/main.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/main.ts");
      let content = readFileSync(file, "utf8");
      if (!content.includes("/roster")) {
        throw new Error("M19: Could not find /roster in main.ts");
      }
      content = content.replaceAll("/roster", "/health");
      writeFileSync(file, content);
      return "Changed default route from /roster to /health";
    },
  },

  // M20: Make malformed JSON a network error
  M20: {
    files: ["frontend/src/api/client.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/api/client.ts");
      let content = readFileSync(file, "utf8");
      if (!content.includes("DecodeError")) {
        throw new Error("M20: Could not find DecodeError in client.ts");
      }
      content = content.replaceAll("DecodeError", "ApiError");
      writeFileSync(file, content);
      return "Changed DecodeError to ApiError on malformed JSON";
    },
  },
};
export function applyCatalogMutation(id, repoRoot) {
  const definition = mutations[id];
  if (!definition) throw new Error(`unknown catalog mutation ${id}`);
  const description = definition.apply(repoRoot);
  return { files: [...definition.files], description };
}

// ─── Harness ──────────────────────────────────────────────────────────────

function runCommand(cmd, cwd = REPO_ROOT, timeout = 300000) {
  try {
    const result = spawnSync(cmd, {
      cwd,
      shell: true,
      timeout,
      encoding: "utf8",
      env: { ...process.env },
    });
    return {
      success: result.status === 0,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.status,
    };
  } catch (e) {
    return { success: false, stdout: "", stderr: String(e), exitCode: -1 };
  }
}

function revertFiles(files, repoRoot) {
  // Restore only the specific files from the parent commit
  for (const f of files) {
    runCommand(`jj restore --from @- "${f}" 2>&1`, repoRoot);
  }
  return true;
}

function runMutation(mutant) {
  const { id, layer, intendedCatchingLayer } = mutant;
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${id} (${layer}) — ${mutant.severity}`);
  console.log(`  Mutation: ${mutant.mutation.substring(0, 80)}...`);
  console.log(`${"=".repeat(70)}`);

  const result = {
    id,
    severity: mutant.severity,
    layer: mutant.layer,
    status: "not-run",
    mutation: mutant.mutation,
    intendedCatchingLayer: mutant.intendedCatchingLayer,
    buildResult: null,
    testResult: null,
    frontendTestResult: null,
    killed: false,
    error: null,
  };

  const mutDef = mutations[id];
  if (!mutDef) {
    result.status = "no-mutation-defined";
    result.error = `No mutation implementation for ${id}`;
    console.log(`  NO MUTATION DEFINED — skipping`);
    return result;
  }

  // Apply mutation
  try {
    const desc = mutDef.apply(REPO_ROOT);
    console.log(`  Applied: ${desc}`);
  } catch (e) {
    result.status = "apply-failed";
    result.error = e.message;
    console.log(`  APPLY FAILED: ${e.message}`);
    return result;
  }

  // Build if needed
  if (layer === "backend-ada") {
    console.log("  Building Ada server...");
    const buildResult = runCommand("cd backend-ada/server && alr build 2>&1", REPO_ROOT, 180000);
    result.buildResult = {
      success: buildResult.success,
      exitCode: buildResult.exitCode,
      output: buildResult.stdout.slice(-2000) + buildResult.stderr.slice(-2000),
    };
    if (!buildResult.success) {
      result.status = "build-failed";
      result.killed = false;
      console.log("  BUILD FAILED — cannot run tests");
      revertFiles(mutDef.files, REPO_ROOT);
      return result;
    }
    console.log("  Build succeeded.");

    // Run conformance tests
    console.log("  Running conformance tests...");
    const testResult = runCommand("cd conformance && npm run test:ada 2>&1", REPO_ROOT, 300000);
    result.testResult = {
      success: testResult.success,
      exitCode: testResult.exitCode,
      output: testResult.stdout.slice(-3000) + testResult.stderr.slice(-1000),
    };
    result.killed = !testResult.success;
    result.status = result.killed ? "killed" : "survived";
    console.log(`  Conformance: ${result.killed ? "KILLED" : "SURVIVED"} (exit ${testResult.exitCode})`);
  } else if (layer === "frontend") {
    console.log("  Running frontend tests...");
    const testResult = runCommand("cd frontend && npx vitest run 2>&1", REPO_ROOT, 120000);
    result.testResult = {
      success: testResult.success,
      exitCode: testResult.exitCode,
      output: testResult.stdout.slice(-3000) + testResult.stderr.slice(-1000),
    };
    result.killed = !testResult.success;
    result.status = result.killed ? "killed" : "survived";
    console.log(`  Frontend: ${result.killed ? "KILLED" : "SURVIVED"} (exit ${testResult.exitCode})`);
  }

  // Revert ONLY the mutated files
  revertFiles(mutDef.files, REPO_ROOT);
  console.log("  Reverted.");
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function main() {
  console.log(`\nAUDIT-0 Wave 3 — Mutation Harness`);
  console.log(`Running ${mutants.length} mutants: ${mutants.map(m => m.id).join(", ")}`);
  console.log(`Repository: ${REPO_ROOT}`);

  const results = [];
  for (const mutant of mutants) {
    const result = runMutation(mutant);
    results.push(result);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("  MUTATION BASELINE SUMMARY");
  console.log(`${"=".repeat(70)}`);
  const killed = results.filter(r => r.killed);
  const survived = results.filter(r => r.status === "survived");
  const failed = results.filter(r => r.status === "build-failed" || r.status === "apply-failed" || r.status === "no-mutation-defined");
  console.log(`  Total: ${results.length}`);
  console.log(`  Killed: ${killed.length} (${killed.map(r => r.id).join(", ")})`);
  console.log(`  Survived: ${survived.length} (${survived.map(r => r.id).join(", ")})`);
  console.log(`  Failed/Undefined: ${failed.length} (${failed.map(r => r.id).join(", ")})`);

  const baseline = {
    generatedAt: new Date().toISOString(),
    totalMutants: results.length,
    killedCount: killed.length,
    survivedCount: survived.length,
    failedCount: failed.length,
    results,
  };
  mkdirSync(join(REPO_ROOT, "agent-docs/test-audit"), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(baseline, null, 2));
  console.log(`\nBaseline written to ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
