#!/usr/bin/env node

// Paperclips in the Dark API reference generator (SC-C5 extended).
//
// Regenerates skill/api-reference/README.md from contract/openapi.yaml plus
// the Wave 2 schemas. Sections:
//
//   - endpoint index + per-endpoint details (existing)
//   - completeness predicates (x-requiredWhenComplete, SC-C1)
//   - capability endpoints (/capabilities paths, SC-C3)
//   - recovery instructions and typed error codes (operation-result.json
//     whole-error union, SC-C4)
//   - lifecycle attention codes (lifecycle-matrix §2.3/§8/§9)
//
// Deterministic and idempotent: output is a pure function of the contract
// files. The generator fails loudly when the curated recovery/lifecycle
// tables drift from the schema union. Only README.md is written — other
// generated files in the output directory (capability-manifest.json) are
// preserved.
//
//   node skill/generate-api-reference.mjs            # committed location
//   node skill/generate-api-reference.mjs --out <d>  # elsewhere (tests)

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPLETENESS_PREDICATE_VOCABULARY,
  completenessRecords,
  contractDir,
  detailsShapeLabel,
  errorUnion,
  parseOpenApi,
  readJson,
  schemaDir,
  skillDir,
} from "./contract-lib.mjs";

const openapiPath = resolve(contractDir, "openapi.yaml");
const defaultOutDir = resolve(skillDir, "api-reference");
const outFlag = process.argv.indexOf("--out");
const outputDir = outFlag >= 0 ? resolve(process.argv[outFlag + 1]) : defaultOutDir;

const { endpoints } = await parseOpenApi(openapiPath);

const schemas = {
  character: await readJson(resolve(schemaDir, "character.json")),
  crew: await readJson(resolve(schemaDir, "crew.json")),
};
const records = completenessRecords(schemas);
const operationResult = await readJson(resolve(schemaDir, "operation-result.json"));
const union = errorUnion(operationResult);
const unionByCode = new Map(union.map((entry) => [entry.code, entry]));

// ---------------------------------------------------------------------------
// Curated recovery expectations (one per union code; generator fails on drift)
// ---------------------------------------------------------------------------

const RECOVERY = {
  VALIDATION: "Fix the request body/shape per the pointer-level issues (details.issues) and resubmit.",
  INVALID_ENTRY: "Fix the submitted content per the pointer-level issues, or supply the values the preview identified as needing input, then resubmit.",
  INVALID_ENTITY: "The stored document is non-canonical or unparseable: run the repair preview/apply flow, or delete via the deleteToken. Collections keep serving the row at 200.",
  NORMALIZATION_REQUIRED: "Present the preview warnings to the user; resubmit the confirming apply with the preview token (details.previewToken / token).",
  NOT_FOUND: "The target does not exist: refetch the roster and re-resolve IDs.",
  STALE_REVISION: "Refetch the entity and retry with the fresh If-Match revision (or the current deleteToken for degraded rows).",
  RETIRED: "The character is retired: only the allow-list remains (dossier/notes/notebook/trauma.remove/undo/delete/import/reads); undo restores the prior state.",
  CONFIRM_REQUIRED: "Resubmit with confirm:true after the user confirms.",
  DUPLICATE: "The entry already exists: list current entries and choose a different value.",
  SLOT_FULL_FATAL: "All harm slots at/above the requested intensity are full (the character would become deadish): confirm the intent or pick another intensity.",
  CANNOT_HEAL: "The healing clock is not full: progress it (harm.healing-clock) to full, then retry.",
  ARMOR_NOT_AVAILABLE: "The armor kind is not available (loadout/ability-derived): equip the item or take the ability first.",
  ABILITY_MAXED: "The ability is at its take limit (TimesTakeable): cannot take more.",
  CANNOT_LEVEL_UP: "The attribute XP track is not full: award XP first.",
  RATING_MAXED: "The action is at its effective cap (published per action by the capabilities endpoint): cannot raise it.",
  UPGRADE_MAXED: "The upgrade is at TotalBoxes: cannot mark more boxes.",
  INSUFFICIENT_FUNDS: "Insufficient funds: details report the max affordable — earn or liquidate first.",
  SATCHEL_FULL: "The satchel cannot hold the coins: spend or make room first.",
  OVER_BULK: "The item bulk exceeds load capacity: uncommit or raise the commitment.",
  NO_COMMITMENT: "No commitment is set: set one first (gear.set-commitment).",
  COMMITMENT_LOCKED: "The commitment is locked: unlock first (gear.unlock).",
  NO_HISTORY: "No snapshot exists: there is nothing to undo.",
  GAME_NOT_FOUND: "The game stem is not installed: list games and use a valid stem.",
  PAYLOAD_TOO_LARGE: "The request exceeds the payload bound (details.limit): split or reduce it.",
  TRAUMA_REQUIRED: "Resolve the pending trauma first (trauma.add); end-score cannot erase an unresolved trauma.",
  OUT_OF_ACTION: "The character is out of action until end-score: run end-score (or lifecycle cleanup) to release.",
};

const unionCodes = new Set(union.map((entry) => entry.code));
const recoveryCodes = new Set(Object.keys(RECOVERY));
const missingRecovery = [...unionCodes].filter((code) => !recoveryCodes.has(code));
const staleRecovery = [...recoveryCodes].filter((code) => !unionCodes.has(code));
if (missingRecovery.length > 0 || staleRecovery.length > 0) {
  throw new Error(
    `recovery table drift: union codes without recovery = [${missingRecovery.join(", ")}]; ` +
      `recovery codes without union = [${staleRecovery.join(", ")}]`,
  );
}

// ---------------------------------------------------------------------------
// Lifecycle attention codes (lifecycle-matrix §2.3/§8/§9; asserted subset)
// ---------------------------------------------------------------------------

const LIFECYCLE_ATTENTION = [
  { code: "TRAUMA_REQUIRED", meaning: "Stress reached maximum; the pending trauma must be resolved (trauma.add). Never auto-trauma.", clientObligation: "Prompt the trauma choice; gameplay mutations and end-score stay blocked until resolved." },
  { code: "OUT_OF_ACTION", meaning: "Character is out of action for the remainder of the score (stress ops rejected).", clientObligation: "Explain out-of-action; end-score is the release." },
  { code: "RETIRED", meaning: "Retirement is a confirmed lifecycle decision; gameplay mutations are rejected.", clientObligation: "Keep the allow-list reachable (dossier/notes/notebook/trauma.remove/undo/delete/import/reads); offer undo as the recovery path." },
  { code: "CONFIRM_REQUIRED", meaning: "Destructive/lifecycle operations require confirm:true.", clientObligation: "Ask for confirmation and resubmit with confirm:true." },
  { code: "STALE_REVISION", meaning: "Concurrent change, or the degraded row's raw bytes changed.", clientObligation: "Refetch and retry with the fresh If-Match (or deleteToken); never blind-retry." },
  { code: "NO_HISTORY", meaning: "Undo requested with no snapshot available.", clientObligation: "Report that nothing can be restored." },
];
for (const entry of LIFECYCLE_ATTENTION) {
  if (!unionCodes.has(entry.code)) {
    throw new Error(`lifecycle attention code ${entry.code} is not in the typed error union`);
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const out = [];
out.push("# Paperclips in the Dark API reference", "");
out.push("> Generated from `contract/openapi.yaml` by `skill/generate-api-reference.mjs`. Do not edit this file by hand.", "");
out.push(`Base URL: \`http://localhost:9657/api\``, "");
out.push(`Operations: ${endpoints.length}`, "");
out.push("## Conventions", "");
out.push("- Mutations use JSON `POST` requests and return the uniform `OperationResult` described by the contract.");
out.push("- `ifMatch` means the optional `If-Match` revision header; `idempotencyKey` means the optional `Idempotency-Key` header.");
out.push("- A snapshot value reports the contract's `x-snapshot` setting for that mutation.");
out.push("- The companion `skill/api-reference/capability-manifest.json` records every operation's human/agent disposition.");

// --- Completeness predicates -------------------------------------------------
out.push("", "## Completeness predicates", "");
out.push("Completeness is derived, never stored (`x-requiredWhenComplete` in `contract/schemas/character.json` and `contract/schemas/crew.json`). A canonical empty at a locked pointer makes an entity readable and incomplete; an absent property is a canonicality question (repair/degraded), not a completeness question.", "");
out.push("| Predicate | Value type | Passes when | Fails when |", "| --- | --- | --- | --- |");
for (const entry of COMPLETENESS_PREDICATE_VOCABULARY) {
  out.push(`| \`${entry.predicate}\` | ${entry.valueType} | ${entry.passes} | ${entry.fails} |`);
}
out.push("");
for (const [entity, list] of Object.entries(records)) {
  out.push(`### ${entity === "character" ? "Character" : entity === "crew" ? "Crew" : entity} (${list.length})`, "");
  out.push("| Pointer | Predicate |", "| --- | --- |");
  for (const record of list) {
    out.push(`| \`${record.pointer}\` | \`${record.predicate}\` |`);
  }
  out.push("");
}

// --- Capability endpoints -----------------------------------------------------
out.push("## Capability endpoints", "");
out.push("Server-computed capability projections (governing spec \"Limits and capabilities\"): advisory for presentation; mutations remain authoritative and return typed stale/maxed failures if state changes between projection and mutation.", "");
const capabilityEndpoints = endpoints.filter((endpoint) => endpoint.path.includes("/capabilities"));
out.push("| Method | Path | Operation |", "| --- | --- | --- |");
if (capabilityEndpoints.length === 0) {
  out.push("| — | — | none in the current contract |");
} else {
  for (const endpoint of capabilityEndpoints) {
    out.push(`| ${endpoint.method} | \`${endpoint.path}\` | [\`${endpoint.operationId}\`](#${endpoint.operationId.toLowerCase()}) |`);
  }
}

// --- Recovery instructions and typed error codes ------------------------------
out.push("", "## Recovery instructions and typed error codes", "");
out.push("Every failure carries the whole-error discriminated union (`operation-result.json` `$defs/operationError`): `code`, HTTP `status`, human-presentable `message`, `retryable` (may succeed after the documented recovery action — never blind replay), a `recovery` instruction, the per-code typed `details`, and (where applicable) the current `entity` and/or `preview`/`token`. Top-level and `batch[].error` share the same union.", "");
out.push("| Code | HTTP | Details shape | Recovery expectation |", "| --- | --- | --- | --- |");
for (const entry of union) {
  out.push(`| \`${entry.code}\` | ${entry.status} | ${detailsShapeLabel(entry)} | ${RECOVERY[entry.code]} |`);
}

// --- Lifecycle attention codes -------------------------------------------------
out.push("", "## Lifecycle attention codes", "");
out.push("Codes that demand explicit human attention or explanation (lifecycle-matrix §2.3, §8, §9).", "");
out.push("| Code | Meaning | Client obligation |", "| --- | --- | --- |");
for (const entry of LIFECYCLE_ATTENTION) {
  out.push(`| \`${entry.code}\` | ${entry.meaning} | ${entry.clientObligation} |`);
}
out.push("", "- Typed attention sideEffect token: `stress full — trauma pending` (emitted by `stress.add` when stress lands at maximum; the pending trauma is never chosen automatically).");
out.push("- Derived lifecycle state (never persisted): `canUndo` = `historyCount > 0`; both appear on roster summaries and operation results, computed at response time from the retained snapshot count (retention cap 50).");

// --- Endpoint index + details ---------------------------------------------------
out.push("", "## Endpoint index", "");
out.push("| Method | Path | Operation | Snapshot |", "| --- | --- | --- | --- |");
for (const endpoint of endpoints) {
  out.push(`| ${endpoint.method} | \`${endpoint.path}\` | [\`${endpoint.operationId}\`](#${endpoint.operationId.toLowerCase()}) | ${endpoint.snapshot || "—"} |`);
}

for (const endpoint of endpoints) {
  out.push("", `## ${endpoint.operationId}`, "");
  out.push(`\`${endpoint.method} ${endpoint.path}\``);
  if (endpoint.summary) out.push("", endpoint.summary);
  out.push("", `Parameters: ${endpoint.parameters.length ? endpoint.parameters.map((name) => `\`${name}\``).join(", ") : "none"}`);
  if (endpoint.snapshot) out.push("", `Snapshot: \`${endpoint.snapshot}\``);
  out.push("", "Request body schema:", "", endpoint.request);
  out.push("", "Responses:", "");
  if (endpoint.responses.length) {
    for (const [code, detail] of endpoint.responses) out.push(`- \`${code}\`: ${detail}`);
  } else {
    out.push("- See the frozen OpenAPI contract.");
  }
}

// Only README.md is written; sibling generated files (capability-manifest.json)
// must survive regeneration.
await mkdir(outputDir, { recursive: true });
await rm(resolve(outputDir, "README.md"), { force: true });
await writeFile(resolve(outputDir, "README.md"), `${out.join("\n")}\n`, "utf8");
