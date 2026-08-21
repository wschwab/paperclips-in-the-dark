import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const addFormats: (ajv: Ajv2020, options?: { mode?: string }) => Ajv2020 = require("ajv-formats");

/** Resolve the contract/schemas directory regardless of CWD. */
const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(here, "..", "..", "contract", "schemas");

/** Shared AJV 2020-12 instance; ajv-formats provides date-time validation. */
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
addFormats(ajv, { mode: "fast" });

const SCHEMA_FILES = [
  "common.json",
  "campaign.json",
  "character.json",
  "crew.json",
  "clock.json",
  "operation-result.json",
];

/** Register every schema doc under its $id so cross-file $refs resolve. */
for (const file of SCHEMA_FILES) {
  const doc = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), "utf8"));
  ajv.addSchema(doc, doc.$id);
}

const campaign = "https://paperclips-in-the-dark/schemas/campaign.json";
const opResult = "https://paperclips-in-the-dark/schemas/operation-result.json";
const character = "https://paperclips-in-the-dark/schemas/character.json";
const crew = "https://paperclips-in-the-dark/schemas/crew.json";
const clock = "https://paperclips-in-the-dark/schemas/clock.json";

type ValidatorFn = ValidateFunction;

/** Map from exported schema name to a compiled AJV validator. */
const VALIDATORS: Record<string, ValidatorFn> = {
  campaign: ajv.getSchema(`${campaign}#/$defs/campaign`) ?? ajv.compile({}),
  health: ajv.getSchema(`${campaign}#/$defs/health`) ?? ajv.compile({}),
  characterSummary: ajv.getSchema(`${campaign}#/$defs/characterSummary`) ?? ajv.compile({}),
  crewSummary: ajv.getSchema(`${campaign}#/$defs/crewSummary`) ?? ajv.compile({}),
  clockSummary: ajv.getSchema(`${campaign}#/$defs/clockSummary`) ?? ajv.compile({}),
  roster: ajv.getSchema(`${campaign}#/$defs/roster`) ?? ajv.compile({}),
  historyEntry: ajv.getSchema(`${campaign}#/$defs/historyEntry`) ?? ajv.compile({}),
  character: ajv.getSchema(character) ?? ajv.compile({}),
  crew: ajv.getSchema(crew) ?? ajv.compile({}),
  clock: ajv.getSchema(clock) ?? ajv.compile({}),
  operationResult: ajv.getSchema(opResult) ?? ajv.compile({}),
  operationError: ajv.getSchema(`${opResult}#/$defs/operationError`) ?? ajv.compile({}),
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate `value` against the named contract schema. Errors are read from the
 * compiled validator function's own `.errors` property (AJV stores per-validator
 * errors there, not on the shared ajv instance, when using getSchema).
 */
export function validate(schemaName: string, value: unknown): ValidationResult {
  const fn = VALIDATORS[schemaName];
  if (!fn) {
    return { valid: false, errors: [`unknown schema name: ${schemaName}`] };
  }
  const valid = fn(value);
  return {
    valid,
    errors: valid
      ? []
      : (fn.errors ?? []).map((e: ErrorObject) =>
          (e.instancePath ? e.instancePath : "/") + " " + (e.message ?? ""),
        ),
  };
}

export function validateOrThrow(schemaName: string, value: unknown): void {
  const result = validate(schemaName, value);
  if (!result.valid) {
    throw new Error(
      `response failed validation against ${schemaName}:\n` + result.errors.join("\n"),
    );
  }
}
