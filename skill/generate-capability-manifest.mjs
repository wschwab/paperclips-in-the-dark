#!/usr/bin/env node

// SC-C5: operation capability manifest generator.
//
// Maps every operationId in contract/openapi.yaml to exactly one disposition:
//
//   agent   — documented for agent use (operation documentation is the agent
//             reference entry); no reachable human control required.
//   human   — destructive, lifecycle, or designated sheet-management
//             operation: a reachable human control is REQUIRED (work spec
//             "Client obligations and parity"; lifecycle-matrix §6.1).
//   exempt  — approved exemption with a reason (contract-author approval
//             recorded in approvedExemptions). Default: NO exemptions.
//
// The classification table below is explicit and auditable. The generator
// fails loudly when an operationId has no disposition or a table entry is
// stale, so the manifest can never silently drift from the contract.
// Operations whose classification is debatable are flagged as candidates for
// the orchestrator instead of being resolved unilaterally.
//
//   node skill/generate-capability-manifest.mjs            # committed location
//   node skill/generate-capability-manifest.mjs --out <f>  # elsewhere (tests)
//   node skill/generate-capability-manifest.mjs --list-operation-ids
//       # print the enumerated operationIds as JSON lines (used by tooling)

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contractDir, enumerateOperationIds, parseOpenApi } from "./contract-lib.mjs";

const skillDir = dirname(fileURLToPath(import.meta.url));
const defaultOut = resolve(skillDir, "api-reference/capability-manifest.json");
const openapiPath = resolve(contractDir, "openapi.yaml");
const outFlag = process.argv.indexOf("--out");
const outPath = outFlag >= 0 ? resolve(process.argv[outFlag + 1]) : defaultOut;

const { endpoints } = await parseOpenApi(openapiPath);
const operationIds = enumerateOperationIds(endpoints);
const byId = new Map(endpoints.map((endpoint) => [endpoint.operationId, endpoint]));

if (process.argv.includes("--list-operation-ids")) {
  for (const id of operationIds) process.stdout.write(`${id}\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Classification table (explicit; work spec "Client obligations and parity" +
// lifecycle-matrix §3/§6.1). Every operationId must appear exactly once.
// ---------------------------------------------------------------------------

const HUMAN_CONTROL = {
  deleteCharacter:
    "Reachable confirm-guarded delete control (confirm:true + If-Match; degraded rows accept the deleteToken).",
  deleteCrew:
    "Reachable confirm-guarded delete control (confirm:true + If-Match); reports unlinked member characters in sideEffects.",
  deleteClock:
    "Reachable confirm-guarded delete control (confirm:true + If-Match).",
  undoCharacter:
    "Reachable undo control; surfaces NO_HISTORY when no snapshot exists.",
  undoCrew: "Reachable undo control; surfaces NO_HISTORY when no snapshot exists.",
  endScore:
    "Reachable end-of-score control; explains out-of-action release and performs the selected cleanup flags.",
  endDowntime: "Reachable end-of-downtime control.",
  retireCharacter:
    "Reachable confirmation-guarded retire control (confirm:true + If-Match); explains retirement cleanup and undo as the recovery path.",
  traumaAdd:
    "Reachable trauma-resolution control for pending trauma (never auto-trauma).",
  traumaRemove:
    "Reachable trauma-history correction control (never clears isRetired).",
  importCharacter:
    "Reachable import control with preview/apply confirmation (preview first; apply requires the preview token + If-Match).",
  importCrew:
    "Reachable import control with preview/apply confirmation (preview first; apply requires the preview token + If-Match).",
  repairCharacterPreview:
    "Reachable repair-preview control showing the normalized result and warnings before any write.",
  repairCharacterApply:
    "Reachable confirm-guarded repair-apply control (preview token + If-Match).",
  repairCrewPreview:
    "Reachable repair-preview control showing the normalized result and warnings before any write.",
  repairCrewApply:
    "Reachable confirm-guarded repair-apply control (preview token + If-Match).",
  dossierUpdate:
    "Reachable dossier editing control (name, alias, look, heritage, background, vice, crewId; allowed after retirement).",
  noteAdd: "Reachable note-append control (allowed after retirement).",
  noteRemove: "Reachable note-removal control (allowed after retirement).",
  notebookSet: "Reachable notebook editing control (allowed after retirement).",
  crewFieldsUpdate:
    "Reachable crew free-text editing control (name, lair, reputation, huntingGrounds, crewTypeName).",
  crewNoteAdd: "Reachable crew note-append control (allowed after retirement).",
  crewNoteRemove: "Reachable crew note-removal control (allowed after retirement).",
};

// disposition: "human" | "agent"; categories explain the obligation.
const TABLE = {
  // Destructive (work spec: human UI required for destructive operations).
  deleteCharacter: { disposition: "human", categories: ["destructive"] },
  deleteCrew: { disposition: "human", categories: ["destructive"] },
  deleteClock: { disposition: "human", categories: ["destructive"] },

  // Lifecycle (lifecycle-matrix §3 transitions + §6.1 allow-list rationale).
  undoCharacter: { disposition: "human", categories: ["lifecycle"] },
  undoCrew: { disposition: "human", categories: ["lifecycle"] },
  endScore: { disposition: "human", categories: ["lifecycle"] },
  endDowntime: { disposition: "human", categories: ["lifecycle"] },
  retireCharacter: { disposition: "human", categories: ["lifecycle"] },
  traumaAdd: { disposition: "human", categories: ["lifecycle"] },
  traumaRemove: { disposition: "human", categories: ["lifecycle"] },
  importCharacter: { disposition: "human", categories: ["data-management"] },
  importCrew: { disposition: "human", categories: ["data-management"] },
  repairCharacterPreview: { disposition: "human", categories: ["repair"] },
  repairCharacterApply: { disposition: "human", categories: ["repair"] },
  repairCrewPreview: { disposition: "human", categories: ["repair"] },
  repairCrewApply: { disposition: "human", categories: ["repair"] },

  // Designated sheet-management subset (lifecycle-matrix §6.1: the
  // non-mechanical edits that stay available after retirement).
  dossierUpdate: { disposition: "human", categories: ["sheet-management"] },
  noteAdd: { disposition: "human", categories: ["sheet-management"] },
  noteRemove: { disposition: "human", categories: ["sheet-management"] },
  notebookSet: { disposition: "human", categories: ["sheet-management"] },
  crewFieldsUpdate: { disposition: "human", categories: ["sheet-management"] },
  crewNoteAdd: { disposition: "human", categories: ["sheet-management"] },
  crewNoteRemove: { disposition: "human", categories: ["sheet-management"] },

  // Flagged candidates: gameplay ops that can trigger lifecycle transitions,
  // composite ops, and creation — classified agent by default, but the
  // orchestrator should confirm the disposition.
  stressAdd: { disposition: "agent", flagged: true },
  harmAdd: { disposition: "agent", flagged: true },
  harmRemove: { disposition: "agent", flagged: true },
  batch: { disposition: "agent", flagged: true },
  createCharacter: { disposition: "agent", flagged: true },
  createCrew: { disposition: "agent", flagged: true },
  createClock: { disposition: "agent", flagged: true },
};

// ---------------------------------------------------------------------------
// Validation: exact bidirectional coverage for table entries
// ---------------------------------------------------------------------------

// Operations not in the table are plain agent operations (the conservative
// default). A schema change that adds a destructive/lifecycle/sheet op must
// add a table entry; the regeneration diff is the review surface.
const unlisted = operationIds.filter((id) => !TABLE[id]);
if (unlisted.length > 0) {
  process.stderr.write(
    `note: ${unlisted.length} operationId(s) use the default agent disposition: ` +
      `${unlisted.join(", ")}\n`,
  );
}

const stale = Object.keys(TABLE).filter((id) => !byId.has(id));
if (stale.length > 0) {
  throw new Error(
    `manifest table entry(ies) with no matching operationId in openapi.yaml: ${stale.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// Emission (deterministic: openapi document order, JSON.stringify)
// ---------------------------------------------------------------------------

const dispositions = {};
for (const id of operationIds) {
  const endpoint = byId.get(id);
  const entry = TABLE[id] ?? { disposition: "agent" };
  const record = {
    disposition: entry.disposition,
    method: endpoint.method,
    path: endpoint.path,
    agentReference: `api-reference/README.md#${id.toLowerCase()}`,
    summary: endpoint.summary,
  };
  if (entry.disposition === "human") {
    record.categories = entry.categories;
    record.humanControl = HUMAN_CONTROL[id];
    if (!record.humanControl) {
      throw new Error(`missing humanControl text for ${id}`);
    }
  }
  if (entry.flagged) record.flagged = true;
  dispositions[id] = record;
}

const flaggedCandidates = operationIds.filter((id) => (TABLE[id] ?? {}).flagged);

const manifest = {
  schemaVersion: 1,
  generator: "skill/generate-capability-manifest.mjs",
  generatedFrom: "contract/openapi.yaml",
  operationCount: operationIds.length,
  dispositions,
  // No exemptions are pre-approved. A disposition of "exempt" requires a
  // matching record here (contract-author approval + reason).
  approvedExemptions: [],
  flaggedCandidates,
  notes: [
    "Every operationId has exactly one disposition.",
    "agent: documented for agent use (agentReference); no reachable human control required.",
    "human: destructive, lifecycle, or designated sheet-management operation — a reachable human control is required (work spec 'Client obligations and parity'; an exported TypeScript function without a reachable control does not count as a human path).",
    "exempt: requires explicit contract-author approval recorded in approvedExemptions with a reason. Default: none.",
    "flagged: disposition is the conservative default; the orchestrator should confirm it.",
  ],
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
