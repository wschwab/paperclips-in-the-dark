import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

const require = createRequire(import.meta.url);
const addFormats: (ajv: Ajv2020, options?: { mode?: string }) => Ajv2020 = require("ajv-formats");

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(here, "..", "..", "contract", "schemas");
const SCHEMA_FILES = [
  "common.json",
  "campaign.json",
  "character.json",
  "crew.json",
  "clock.json",
  "operation-result.json",
] as const;

type JsonSchema = Record<string, unknown>;
type ValidatorFn = ValidateFunction;

function createAjv(): Ajv2020 {
  const instance = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(instance, { mode: "fast" });
  return instance;
}

/** Register and compile a complete schema set. Missing references fail here. */
export function initializeContractValidator(options: { schemas: JsonSchema[] }): Ajv2020 {
  const instance = createAjv();
  for (const schema of options.schemas) {
    const id = schema.$id;
    if (typeof id === "string" && id.length > 0) {
      instance.addSchema(schema, id);
    } else {
      instance.addSchema(schema);
    }
  }
  for (const schema of options.schemas) {
    const id = schema.$id;
    if (typeof id === "string" && id.length > 0) {
      if (!instance.getSchema(id)) {
        throw new Error(`required schema could not be compiled: ${id}`);
      }
    } else {
      instance.compile(schema);
    }
  }
  return instance;
}

const schemaDocuments = SCHEMA_FILES.map((file) =>
  JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), "utf8")) as JsonSchema,
);
const ajv = initializeContractValidator({ schemas: schemaDocuments });

const campaign = "https://paperclips-in-the-dark/schemas/campaign.json";
const opResult = "https://paperclips-in-the-dark/schemas/operation-result.json";
const character = "https://paperclips-in-the-dark/schemas/character.json";
const crew = "https://paperclips-in-the-dark/schemas/crew.json";
const clock = "https://paperclips-in-the-dark/schemas/clock.json";

function requireValidator(schemaName: string, reference: string): ValidatorFn {
  const validator = ajv.getSchema(reference);
  if (!validator) {
    throw new Error(`required contract schema ${schemaName} could not be compiled from ${reference}`);
  }
  return validator;
}

const VALIDATORS: Record<string, ValidatorFn> = {
  campaign: requireValidator("campaign", `${campaign}#/$defs/campaign`),
  health: requireValidator("health", `${campaign}#/$defs/health`),
  characterSummary: requireValidator("characterSummary", `${campaign}#/$defs/characterSummary`),
  crewSummary: requireValidator("crewSummary", `${campaign}#/$defs/crewSummary`),
  clockSummary: requireValidator("clockSummary", `${campaign}#/$defs/clockSummary`),
  roster: requireValidator("roster", `${campaign}#/$defs/roster`),
  historyEntry: requireValidator("historyEntry", `${campaign}#/$defs/historyEntry`),
  character: requireValidator("character", character),
  crew: requireValidator("crew", crew),
  clock: requireValidator("clock", clock),
  operationResult: requireValidator("operationResult", opResult),
  operationError: requireValidator("operationError", `${opResult}#/$defs/operationError`),
  previewResult: requireValidator("previewResult", `${opResult}#/$defs/previewResult`),
};

const inlineValidators = new Map<string, ValidatorFn>();

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validationResult(validator: ValidatorFn, value: unknown): ValidationResult {
  const valid = validator(value);
  return {
    valid,
    errors: valid
      ? []
      : (validator.errors ?? []).map(
          (error: ErrorObject) => `${error.instancePath || "/"} ${error.message ?? ""}`,
        ),
  };
}

export function validate(schemaName: string, value: unknown): ValidationResult {
  const validator = VALIDATORS[schemaName];
  if (!validator) {
    return { valid: false, errors: [`unknown schema name: ${schemaName}`] };
  }
  return validationResult(validator, value);
}

export function validateOrThrow(schemaName: string, value: unknown): void {
  const result = validate(schemaName, value);
  if (!result.valid) {
    throw new Error(
      `response failed validation against ${schemaName}:\n${result.errors.join("\n")}`,
    );
  }
}

/** Compile and validate an inline OpenAPI response schema with the contract AJV. */
export function validateInlineOrThrow(schema: JsonSchema, value: unknown): void {
  const key = JSON.stringify(schema);
  let validator = inlineValidators.get(key);
  if (!validator) {
    validator = ajv.compile(schema);
    inlineValidators.set(key, validator);
  }
  const result = validationResult(validator, value);
  if (!result.valid) {
    throw new Error(`response failed validation against inline schema:\n${result.errors.join("\n")}`);
  }
}
