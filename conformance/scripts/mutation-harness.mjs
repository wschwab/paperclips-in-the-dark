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
import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const CATALOG_PATH = join(REPO_ROOT, "agent-docs/test-audit/mutation-catalog.json");
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

export async function restoreAndRebuild({ snapshots, mutant, rebuild }) {
  let restorationError;
  let rebuildError;
  for (const snapshot of snapshots) {
    const abs = snapshot.path ?? snapshot.abs;
    writeFileSync(abs, snapshot.bytes);
    if (snapshot.hash && hash(readFileSync(abs)) !== snapshot.hash) {
      restorationError = new Error(`failed byte-exact restoration of ${abs}`);
    }
  }
  if (mutant?.layer === "backend-ada" && rebuild) {
    try {
      await rebuild();
    } catch (e) {
      rebuildError = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (restorationError) throw restorationError;
  if (rebuildError) throw new Error(`cleanup rebuild failed: ${rebuildError.message}`);
}

export async function executeMutant({ repoRoot, mutant, baselineTests, runMutant, rebuild }) {
  let snapshots = [];
  let classified;
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
    await restoreAndRebuild({
      snapshots,
      mutant,
      rebuild,
    }).catch((e) => {
      // A cleanup failure (restore or rebuild) is a harness error regardless
      // of prior classification — the workspace is now in an unclean state.
      classified = { state: "harness-error", killed: false, newFailureIds: [], error: e.message };
    });
  }
  return { ...classified, restored: snapshots.length > 0 };
}

export async function executeCampaign({ mutants: campaignMutants, runBaseline, runMutant, onApply, rebuild, repoRoot = REPO_ROOT }) {
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
      rebuild,
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

// Load catalog
const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
let mutants = catalog.mutants;

// ─── Mutation definitions ─────────────────────────────────────────────────
// Each mutation returns { files: [paths], apply: (repoRoot) => desc }
// `files` is the list of files to restore after the test.

const mutations = {
  // M01: suppress crew history projections at their History_Count source.
  M01: {
    files: ["backend-ada/server/src/pitd_summary.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_summary.adb");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `      declare
         Hc : constant Natural :=
           History_Count ("crew", Str_Field (C, "id"));
      begin
         Set_Field (X, "canUndo", Hc > 0);
         Set_Field (X, "historyCount", Integer (Hc));
      end;`,
        `      null; -- MUTANT M01: canUndo/historyCount projection omitted`,
        "M01 Crew_Summary projection omission",
      );
      writeFileSync(file, changed);
      return "Omitted canUndo/historyCount from Crew_Summary";
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
    files: ["backend-ada/server/src/pitd_normalize.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_normalize.adb");
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
    files: ["backend-ada/server/src/pitd_stored.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_stored.adb");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `         E := Read (Bytes);
      exception`,
        `         E := Read (Bytes);
         Set_Field (E, "revision", Int_Field (E, "revision") + 1);
         Write_Entity (Kind, Id, E); -- MUTANT M06: revision-bumping write during classification
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
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `               Sides : JSON_Array := Empty_Array;
            begin
               if Kind = "clock" then`,
        `               Sides : JSON_Array := Empty_Array;
            begin
               if False then -- MUTANT M15: skip W4 unlink sweep`,
      );
      writeFileSync(file, changed);
      return "Skipped W4 unlink-on-delete sweep for related clocks";
    },
  },

  // M10: report the requested delta as applied on overflow (the live clamp
  // is Bounded_Integers.Add — the server's Core_Clamp_Add wraps it).
  M10: {
    files: ["backend-ada/core/src/paperclips_core-bounded_integers.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/core/src/paperclips_core-bounded_integers.adb");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `      else
         Applied := Item.Maximum - Item.Current;
         Item.Current := Item.Maximum;
      end if;`,
        `      else
         Applied := Amount; -- MUTANT M10: requested reported as applied
         Item.Current := Item.Maximum;
      end if;`,
        "M10 overflow clamp",
      );
      writeFileSync(file, changed);
      return "Overflow applied-delta now reports the requested amount";
    },
  },

  // M11: Auto-add trauma on stress overflow instead of raising the pending
  // flag — retargeted to the server's live stress.add arm (the core
  // Add_Stress is not on the HTTP path).
  M11: {
    files: ["backend-ada/server/src/pitd_ops.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_ops.adb");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `               Set_Field (E, "traumaPending", True);`,
        `               declare T2 : constant JSON_Value := Get (Get (E, "monitor"), "trauma"); A2 : constant JSON_Array := Get (T2, "traumas"); O2 : JSON_Array := A2; begin Append (O2, Create ("Broken")); Set_Field (T2, "traumas", O2); end; -- MUTANT M11: auto-add trauma`,
        "M11 pending raise",
      );
      writeFileSync(file, changed);
      return "Landing at max stress auto-adds a trauma instead of raising the pending flag";
    },
  },

  // M12: Clear retirement during trauma removal — retargeted to the server's
  // live trauma.remove arm (the core Remove_Trauma is not on the HTTP path).
  M12: {
    files: ["backend-ada/server/src/pitd_ops.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_ops.adb");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `               if not Found then
                  return Not_Found_Error (Op, "trauma not found", E);
               end if;
               Set_Field(T,"traumas",O);`,
        `               if not Found then
                  return Not_Found_Error (Op, "trauma not found", E);
               end if;
               Set_Field(T,"traumas",O);
               Set_Field (E, "isRetired", False); -- MUTANT M12: trauma.remove clears retirement`,
        "M12 trauma.remove retirement",
      );
      writeFileSync(file, changed);
      return "trauma.remove now clears isRetired";
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
    files: ["backend-ada/server/src/pitd_ops.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_ops.adb");
      const content = readFileSync(file, "utf8");
      // RETARGETED: the creation-template StressMax lookup is normalized away
      // before persistence, so the mutant was unobservable. The live op-time
      // enforcement site is tier.add's CrewTierMax lookup (5892-5895).
      const changed = replaceExactlyOnce(
        content,
        `                 Settings_Int ((To_Unbounded_String (Str_Field (E, "gameStem")),
                                Game (Str_Field (E, "gameStem"))),
                               "CrewTierMax", 0)`,
        `                 3 -- MUTANT M16: hardcoded tier maximum`,
        "M16 CrewTierMax enforcement",
      );
      writeFileSync(file, changed);
      return "Hardcoded the tier.add CrewTierMax settings lookup to 3";
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
      const content = readFileSync(file, "utf8");
      // Targeted behavioral mutant: ONLY the malformed-200-JSON site is
      // reclassified as a status-0 network ApiError. A blanket identifier
      // rename would duplicate `class ApiError` and kill at compile time,
      // which is not a mutant-specific behavioral delta.
      const changed = replaceExactlyOnce(
        content,
        'throw new DecodeError(new Error("malformed JSON response"));',
        'throw new ApiError(0, NETWORK_ERROR_COPY); // MUTANT M20: malformed JSON misclassified as network error',
        "M20 malformed-JSON classification",
      );
      writeFileSync(file, changed);
      return "Reclassified malformed 200 JSON as a status-0 network ApiError";
    },
  },

  // M21: endpoint mapping bypass — unknown endpoints fall back to a permissive
  // no-body disposition instead of failing the frozen response oracle.
  M21: {
    files: ["conformance/src/endpoint-schema-map.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "conformance/src/endpoint-schema-map.ts");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `  if (!operation) {
    throw new Error(\`unknown endpoint operationId \${operationId}\`);
  }`,
        `  if (!operation) {
    return { kind: "no-body" } as ResponseDisposition; // MUTANT M21: unknown endpoints bypass the map
  }`,
        "M21 endpoint map bypass",
      );
      writeFileSync(file, changed);
      return "Unknown endpoint operationIds bypass the schema map (permissive fallback)";
    },
  },

  // M22: default campaign write protection removed — byte drift no longer
  // fails the run.
  M22: {
    files: ["conformance/scripts/default-data-guard.mjs"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "conformance/scripts/default-data-guard.mjs");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `  if (changedCount === 0) return childCode;
  printDiff(diff);
  return 1;`,
        `  return childCode; // MUTANT M22: write protection removed — byte drift no longer fails the run`,
        "M22 default-data guard verdict",
      );
      writeFileSync(file, changed);
      return "default-data-guard no longer fails on byte drift";
    },
  },

  // M23: managed-launch wrong-dataDir acceptance — readiness poll stops
  // verifying that the health dataDir matches the launcher-owned dir.
  M23: {
    files: ["conformance/scripts/managed-run.mjs"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "conformance/scripts/managed-run.mjs");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `if (health?.implementation === "ada" && resolve(health.dataDir) === resolve(expectedDataDir)) return;`,
        `if (health?.implementation === "ada") return; // MUTANT M23: wrong dataDir accepted`,
        "M23 dataDir readiness verification",
      );
      writeFileSync(file, changed);
      return "Readiness accepts any ada health response regardless of dataDir";
    },
  },

  // M24: degraded roster rows hidden by filtering (E11 total-collections
  // regression: unreadable rows must stay reachable).
  M24: {
    files: ["frontend/src/pages/roster.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/pages/roster.ts");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        "const degraded: T[] = all.filter((row) => !row.isReadable);",
        "const degraded: T[] = all.filter((row) => row.isReadable); // MUTANT M24: degraded rows hidden",
        "M24 degraded row filter",
      );
      writeFileSync(file, changed);
      return "Degraded (unreadable) roster rows filtered out of the recovery lane";
    },
  },

  // M25: bounded roster rendering removed — every readable row renders at
  // once, blowing the PERF-02 DOM budget.
  M25: {
    files: ["frontend/src/pages/roster.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/pages/roster.ts");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        "export const ROSTER_PAGE_SIZE = 100;",
        "export const ROSTER_PAGE_SIZE = Number.POSITIVE_INFINITY; // MUTANT M25: unbounded roster rendering",
        "M25 roster page size",
      );
      writeFileSync(file, changed);
      return "ROSTER_PAGE_SIZE unbounded (render window removed)";
    },
  },

  // M26: section-local error routing removed — op failures fall to the
  // sheet-bottom alert instead of the originating section.
  M26: {
    files: ["frontend/src/pages/character-detail.ts"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "frontend/src/pages/character-detail.ts");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        "  if (error && error.section) {",
        "  if (error && false) { // MUTANT M26: section-local error routing removed",
        "M26 section error routing",
      );
      writeFileSync(file, changed);
      return "Errors no longer route to their section; sheet-bottom fallback only";
    },
  },

  // M27: claim-operation coverage removed — claim.set / claim.customize /
  // claim.reset dispatch dropped, ops fall through to the unknown-op error.
  M27: {
    files: ["backend-ada/server/src/pitd_ops.adb"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "backend-ada/server/src/pitd_ops.adb");
      let content = readFileSync(file, "utf8");
      for (const [op, comment] of [
        ["claim.set", "acquire/relinquish a claim"],
        ["claim.customize", "write/merge a per-crew override"],
        ["claim.reset", "delete the override for a claim"],
      ]) {
        content = replaceExactlyOnce(
          content,
          `elsif Op = "${op}" then
         --  Crew Claims: ${comment}`,
          `elsif False then -- MUTANT M27: ${op} dispatch removed
         --  Crew Claims: ${comment}`,
          `M27 ${op}`,
        );
      }
      writeFileSync(file, content);
      return "Claim operation dispatch removed (claim.set/customize/reset)";
    },
  },

  M28: {
    files: ["conformance/scripts/browser-journeys.mjs"],
    apply: (repoRoot) => {
      const file = join(repoRoot, "conformance/scripts/browser-journeys.mjs");
      const content = readFileSync(file, "utf8");
      const changed = replaceExactlyOnce(
        content,
        `files = (await readdir(suitesBrowserDir)).filter((name) => name.endsWith(".journey.mjs")).sort();`,
        `files = (await readdir(suitesBrowserDir)).filter((name) => name.endsWith(".journey.mjs") && name !== "lifecycle.journey.mjs").sort(); // MUTANT M28: journey skipped`,
        "M28 journey enumeration filter",
      );
      writeFileSync(file, changed);
      return "lifecycle journey silently skipped by the enumeration filter";
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

const RESULTS_PATH = join(REPO_ROOT, "agent-docs/test-audit/mutation-results.json");

const sha256File = (path) => hash(readFileSync(path));

// Per-layer verification commands. Each produces a vitest JSON report at
// `report` so kills can be attributed to specific stable test IDs (delta vs
// that layer's green baseline), never to incidental build noise.
function layerTestCommand(layer, report) {
  switch (layer) {
    case "backend-ada":
      // The SC-O0 SIGINT sentinel (suites/__sc_o0_blocker__.test.ts) is a
      // managed-run tooling fixture, not a suite test: it blocks until its
      // 60s timeout and would fail every campaign baseline. Excluded here;
      // it is exercised directly by conformance/src/managed-run.test.ts.
      return { cmd: `cd conformance && npm run test:ada -- --run --exclude "suites/__sc_o0_blocker__.test.ts" --reporter=json --outputFile="${report}"`, cwd: REPO_ROOT, timeout: 2400000 };
    case "frontend":
      return { cmd: `npx vitest run --reporter=json --outputFile="${report}"`, cwd: join(REPO_ROOT, "frontend"), timeout: 900000 };
    case "conformance":
      return { cmd: `npx vitest run --config vitest.tooling.config.ts --reporter=json --outputFile="${report}"`, cwd: join(REPO_ROOT, "conformance"), timeout: 900000 };
    default:
      throw new Error(`unknown layer ${layer}`);
  }
}

function buildCommand() {
  return { cmd: "cd backend-ada/server && alr build", cwd: REPO_ROOT, timeout: 900000 };
}

// Extract stable test IDs from a vitest JSON report. Bracketed conformance
// testCase IDs win ([FOO-001]); otherwise fall back to the inventory's
// path+name slug (test-audit-inventory.mjs idForVitest convention).
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
}

function stableTestId(fullName, relFile) {
  const m = /\[([A-Z][A-Z0-9-]*)\]/.exec(fullName);
  if (m) return m[1];
  return slugify(`${relFile} ${fullName}`);
}

function parseVitestReport(reportPath, exitCode) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (e) {
    return { state: "harness-error", tests: [], error: `cannot parse vitest report: ${e.message}` };
  }
  const tests = [];
  for (const suite of parsed.testResults ?? []) {
    const abs = suite.name ?? "";
    const relFile = abs.startsWith(REPO_ROOT) ? abs.slice(REPO_ROOT.length + 1) : abs;
    for (const a of suite.assertionResults ?? []) {
      tests.push({ id: stableTestId(a.fullName ?? a.title ?? "", relFile), status: a.status === "passed" ? "passed" : "failed" });
    }
  }
  return { state: exitCode === 0 ? "completed" : "test-failure", tests };
}

function runLayerTests(layer, withBuild) {
  const report = join(REPO_ROOT, "agent-docs/test-audit", `.mutation-report-${process.pid}.json`);
  try {
    if (withBuild) {
      console.log("    building Ada server...");
      const b = runCommand(buildCommand().cmd, buildCommand().cwd, buildCommand().timeout);
      if (!b.success) {
        return { state: "build-failure", tests: [], output: (b.stdout + b.stderr).slice(-2000) };
      }
    }
    const { cmd, cwd, timeout } = layerTestCommand(layer, report);
    const r = runCommand(cmd, cwd, timeout);
    const parsed = parseVitestReport(report, r.exitCode);
    parsed.output = (r.stdout + "\n" + r.stderr).slice(-4000);
    return parsed;
  } finally {
    try { rmSync(report, { force: true }); } catch {}
  }
}

function runCommand(cmd, cwd = REPO_ROOT, timeout = 300000) {
  try {
    const result = spawnSync(cmd, { cwd, shell: true, timeout, encoding: "utf8", env: { ...process.env } });
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

function fileSnapshots(paths) {
  return paths.map((rel) => {
    const abs = resolve(REPO_ROOT, rel);
    return { rel, abs, bytes: readFileSync(abs) };
  });
}

function restoreSnapshots(snapshots) {
  for (const s of snapshots) writeFileSync(s.abs, s.bytes);
}

function verifyHashes(mutant, label) {
  for (const [rel, expected] of Object.entries(mutant.restorationHash ?? {})) {
    const actual = sha256File(resolve(REPO_ROOT, rel));
    if (actual !== expected) {
      throw new Error(`${label}: ${rel} hash mismatch — concurrent edit or incomplete restoration (expected ${expected.slice(0, 12)}, got ${actual.slice(0, 12)})`);
    }
  }
}

async function runOneMutant(mutant, baseline, attempt = 1) {
  const mutDef = mutations[mutant.id];
  const maxAttempts = 3;
  const snapshots = fileSnapshots(mutDef.files);
  try {
    verifyHashes(mutant, `${mutant.id} pre-apply`);
    mutDef.apply(REPO_ROOT);
    const postApply = snapshots.map((s) => sha256File(s.abs));
    const run = runLayerTests(mutant.layer, mutant.layer === "backend-ada");
    // Collision check: the mutated files must still hold the mutation; a
    // concurrent writer (another harness session) invalidates this attempt.
    const drifted = snapshots.some((s, i) => sha256File(s.abs) !== postApply[i]);
    if (drifted) {
      if (attempt < maxAttempts) {
        console.log(`  file drift detected (concurrent writer) — retrying ${mutant.id} (${attempt}/${maxAttempts})`);
        return await runOneMutant(mutant, baseline, attempt + 1);
      }
      return { id: mutant.id, severity: mutant.severity, layer: mutant.layer, status: "collided", killed: false, killedBy: [], newFailureIds: [], error: "mutated files drifted mid-run after 3 attempts" };
    }
    const classified = classifyMutant({
      baseline: baseline.tests,
      mutant: run.tests,
      expectedFailureIds: mutant.expectedTestIds ?? [],
      runState: run.state,
    });
    return {
      id: mutant.id,
      severity: mutant.severity,
      layer: mutant.layer,
      status: classified.state,
      killed: classified.killed,
      killedBy: classified.killed ? classified.newFailureIds : [],
      newFailureIds: classified.newFailureIds,
      runState: run.state,
      output: (run.output ?? "").slice(-1500),
    };
  } catch (e) {
    return { id: mutant.id, severity: mutant.severity, layer: mutant.layer, status: "harness-error", killed: false, killedBy: [], newFailureIds: [], error: String(e.message ?? e) };
  } finally {
    // Finalize-style cleanup: restore source, then rebuild clean backend binary
    // (for backend-ada layer mutants) so the compiled pitd never leaks a mutant
    // build into subsequent runs — after success, failure, or interruption.
    restoreSnapshots(snapshots);
    try { verifyHashes(mutant, `${mutant.id} post-restore`); } catch (e) {
      console.error(`  RESTORATION FAILURE: ${e.message}`);
      process.exitCode = 1;
    }
    // Rebuild clean binary after restoration — only for backend-ada layer.
    if (mutant.layer === "backend-ada") {
      console.log(`    rebuilding clean ${mutant.id} backend...`);
      const b = runCommand(buildCommand().cmd, buildCommand().cwd, buildCommand().timeout);
      if (!b.success) {
        console.error(`  CLEANUP REBUILD FAILURE for ${mutant.id}: ${(b.stdout + b.stderr).slice(-500)}`);
        process.exitCode = 1;
      }
    }
  }
}

async function runCampaign() {
  console.log(`MUT-02 mutation campaign — ${mutants.length} mutants: ${mutants.map((m) => m.id).join(", ")}`);

  // Pre-flight: every catalog entry must be fully specified, implemented,
  // its expected test IDs present in a green baseline, and its target files
  // byte-identical to the catalog's restoration hashes.
  const byLayer = new Map();
  for (const mutant of mutants) {
    const mutDef = mutations[mutant.id];
    if (!mutDef) throw new Error(`pre-flight: no mutation implementation for ${mutant.id}`);
    if (!Array.isArray(mutant.expectedTestIds) || mutant.expectedTestIds.length === 0) {
      throw new Error(`pre-flight: ${mutant.id} has no expectedTestIds`);
    }
    if (!mutant.restorationHash || Object.keys(mutant.restorationHash).length === 0) {
      throw new Error(`pre-flight: ${mutant.id} has no restorationHash`);
    }
    verifyHashes(mutant, `pre-flight ${mutant.id}`);
    if (!byLayer.has(mutant.layer)) byLayer.set(mutant.layer, []);
    byLayer.get(mutant.layer).push(mutant);
  }

  // Green baseline per layer; expected IDs must exist in it.
  const baselines = new Map();
  for (const layer of [...byLayer.keys()].sort()) {
    console.log(`\n── baseline: ${layer} ──`);
    const baseline = runLayerTests(layer, layer === "backend-ada");
    if (baseline.state !== "completed" || baseline.tests.some((t) => t.status !== "passed")) {
      throw new Error(`baseline for ${layer} is not green (${baseline.state}); refusing to classify mutants`);
    }
    console.log(`  green: ${baseline.tests.length} tests`);
    baselines.set(layer, baseline);
    const ids = new Set(baseline.tests.map((t) => t.id));
    for (const mutant of byLayer.get(layer)) {
      const missing = mutant.expectedTestIds.filter((id) => !ids.has(id));
      if (missing.length > 0) {
        throw new Error(`pre-flight: ${mutant.id} expects unknown test IDs: ${missing.join(", ")}`);
      }
    }
  }

  const results = [];
  for (const [layer, layerMutants] of byLayer) {
    for (const mutant of layerMutants) {
      console.log(`\n${"=".repeat(70)}\n  ${mutant.id} (${mutant.layer}, ${mutant.severity}) — ${mutant.mutation.slice(0, 90)}…`);
      const result = await runOneMutant(mutant, baselines.get(mutant.layer));
      results.push(result);
      console.log(`  ${result.killed ? "KILLED" : result.status.toUpperCase()}${result.killedBy.length ? ` by ${result.killedBy.join(", ")}` : ""}`);
    }
  }

  const order = { P0: 0, P1: 1, P2: 2 };
  const summary = {};
  for (const sev of ["P0", "P1", "P2"]) {
    const group = results.filter((r) => r.severity === sev);
    summary[sev] = {
      total: group.length,
      killed: group.filter((r) => r.killed).length,
      survived: group.filter((r) => r.status === "survived").length,
      notKilled: group.filter((r) => !r.killed).map((r) => r.id),
    };
  }
  const artifact = {
    generatedAt: new Date().toISOString(),
    catalogIds: mutants.map((m) => m.id),
    totalMutants: results.length,
    killedCount: results.filter((r) => r.killed).length,
    survivedCount: results.filter((r) => r.status === "survived").length,
    killRateBySeverity: summary,
    results: results.sort((a, b) => (order[a.severity] - order[b.severity]) || a.id.localeCompare(b.id)),
  };
  mkdirSync(join(REPO_ROOT, "agent-docs/test-audit"), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify(artifact, null, 2));
  console.log(`\nResults written to ${RESULTS_PATH}`);
  for (const sev of ["P0", "P1", "P2"]) {
    const s = summary[sev];
    if (s.total > 0) console.log(`  ${sev}: ${s.killed}/${s.total} killed${s.notKilled.length ? ` — not killed: ${s.notKilled.join(", ")}` : ""}`);
  }
  if (results.some((r) => !r.killed && r.status !== "survived")) process.exitCode = 1;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  // Parse args
  const args = process.argv.slice(2);
  const specificMutants = args.filter((a) => /^M\d+$/.test(a));
  const frontendOnly = args.includes("--frontend-only");
  const backendOnly = args.includes("--backend-only");
  const conformanceOnly = args.includes("--conformance-only");

  if (frontendOnly) mutants = mutants.filter((m) => m.layer === "frontend");
  if (backendOnly) mutants = mutants.filter((m) => m.layer === "backend-ada");
  if (conformanceOnly) mutants = mutants.filter((m) => m.layer === "conformance");
  if (specificMutants.length > 0) mutants = mutants.filter((m) => specificMutants.includes(m.id));

  runCampaign().catch((e) => {
    console.error(`campaign failed: ${e.message}`);
    process.exitCode = 1;
  });
}
