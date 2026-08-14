#!/usr/bin/env node

// SC-C5: frontend completeness predicates generator.
//
// Emits frontend/src/schema/generated/completeness.ts from the
// `x-requiredWhenComplete` records in contract/schemas/character.json and
// contract/schemas/crew.json (SC-C1 output). Deterministic and idempotent:
// the emitted module is a pure function of the schema files.
//
//   node skill/generate-completeness.mjs            # write committed location
//   node skill/generate-completeness.mjs --out <f>  # write elsewhere (tests)

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { completenessRecords, readJson, repoRoot, schemaDir } from "./contract-lib.mjs";

const skillDir = dirname(fileURLToPath(import.meta.url));
const defaultOut = resolve(
  repoRoot,
  "frontend/src/schema/generated/completeness.ts",
);
const outFlag = process.argv.indexOf("--out");
const outPath = outFlag >= 0 ? resolve(process.argv[outFlag + 1]) : defaultOut;

const schemas = {
  character: await readJson(resolve(schemaDir, "character.json")),
  crew: await readJson(resolve(schemaDir, "crew.json")),
};
const records = completenessRecords(schemas);

// Stable order: schema file order (character, crew), pointer order inside
// each file (the contract pointer list order, SC-R2).
const entityKinds = Object.keys(records);
if (entityKinds.length === 0) {
  throw new Error("no x-requiredWhenComplete records found in contract/schemas");
}

const lines = [];
lines.push("/**");
lines.push(" * Generated completeness metadata — DO NOT EDIT BY HAND.");
lines.push(" *");
lines.push(" * Source: `x-requiredWhenComplete` in contract/schemas/character.json and");
lines.push(" * contract/schemas/crew.json (SC-C1). Regenerate with:");
lines.push(" *");
lines.push(" *   node skill/generate-completeness.mjs");
lines.push(" *");
lines.push(" * Completeness is derived, never stored (spec-change-work-spec § Completeness,");
lines.push(" * completeness-audit.mdx): a canonical empty at a locked pointer makes an");
lines.push(" * entity readable and incomplete; a genuinely absent property is a");
lines.push(" * canonicality question (repair/degraded), not a completeness question.");
lines.push(" */");
lines.push("");
lines.push("/** Contract completeness-predicate vocabulary (Q9, completeness-audit.mdx). */");
lines.push("export type CompletenessPredicate =");
lines.push('  | "nonBlankString"');
lines.push('  | "nonEmptyArray"');
lines.push('  | "positiveInteger"');
lines.push('  | "true";');
lines.push("");
lines.push("/**");
lines.push(" * One completeness requirement: a JSON pointer into the canonical entity");
lines.push(" * document plus its predicate from the contract vocabulary.");
lines.push(" */");
lines.push("export interface CompletenessRecord {");
lines.push("  readonly pointer: string;");
lines.push("  readonly predicate: CompletenessPredicate;");
lines.push("}");
lines.push("");

for (const [entity, list] of Object.entries(records)) {
  const constantName = `${entity.toUpperCase()}_COMPLETENESS_RECORDS`;
  const label = entity === "character" ? "Character" : entity === "crew" ? "Crew" : entity;
  lines.push(`/** ${label} completeness requirements (${list.length}), in contract pointer order. */`);
  lines.push(`export const ${constantName}: readonly CompletenessRecord[] = [`);
  for (const record of list) {
    lines.push(`  { pointer: "${record.pointer}", predicate: "${record.predicate}" },`);
  }
  lines.push("];");
  lines.push("");
}

lines.push("/** All completeness requirements, keyed by entity kind. */");
lines.push("export const COMPLETENESS_RECORDS: Readonly<{");
for (const entity of entityKinds) {
  lines.push(`  ${entity}: readonly CompletenessRecord[];`);
}
lines.push("}> = {");
for (const entity of entityKinds) {
  lines.push(`  ${entity}: ${entity.toUpperCase()}_COMPLETENESS_RECORDS,`);
}
lines.push("};");
lines.push("");
lines.push("/** nonBlankString: at least one character that is not Unicode whitespace. */");
lines.push("export const isNonBlankString = (value: unknown): boolean =>");
lines.push('  typeof value === "string" && value.trim().length > 0;');
lines.push("");
lines.push("/** nonEmptyArray: at least one entry. */");
lines.push("export const isNonEmptyArray = (value: unknown): boolean =>");
lines.push("  Array.isArray(value) && value.length > 0;");
lines.push("");
lines.push("/** positiveInteger: an integer greater than zero. */");
lines.push("export const isPositiveInteger = (value: unknown): boolean =>");
lines.push('  typeof value === "number" && Number.isInteger(value) && value > 0;');
lines.push("");
lines.push("/** true: the boolean value true. */");
lines.push("export const isTrue = (value: unknown): boolean => value === true;");
lines.push("");
lines.push("/**");
lines.push(" * Predicate vocabulary: name to evaluator. A type mismatch is a predicate");
lines.push(" * failure (readable + incomplete), never a schema violation.");
lines.push(" */");
lines.push("export const PREDICATES: Readonly<");
lines.push("  Record<CompletenessPredicate, (value: unknown) => boolean>");
lines.push("> = {");
lines.push("  nonBlankString: isNonBlankString,");
lines.push("  nonEmptyArray: isNonEmptyArray,");
lines.push("  positiveInteger: isPositiveInteger,");
lines.push("  true: isTrue,");
lines.push("};");
lines.push("");
lines.push("/**");
lines.push(" * RFC 6901 JSON pointer resolution over a decoded document. Returns");
lines.push(" * undefined when the pointer does not resolve (absent property or index).");
lines.push(" * Pointer tokens decode ~1 to / and ~0 to ~ in that order.");
lines.push(" */");
lines.push("export const resolvePointer = (document: unknown, pointer: string): unknown => {");
lines.push('  if (pointer === "") return document;');
lines.push('  if (!pointer.startsWith("/")) return undefined;');
lines.push("  let current: unknown = document;");
lines.push('  for (const rawToken of pointer.slice(1).split("/")) {');
lines.push('    const token = rawToken.replace(/~1/g, "/").replace(/~0/g, "~");');
lines.push("    if (Array.isArray(current)) {");
lines.push('      if (!/^(0|[1-9][0-9]*)$/.test(token)) return undefined;');
lines.push("      const index = Number(token);");
lines.push("      if (index >= current.length) return undefined;");
lines.push("      current = current[index];");
lines.push("    } else if (typeof current === \"object\" && current !== null) {");
lines.push('      if (!Object.prototype.hasOwnProperty.call(current, token)) return undefined;');
lines.push("      current = (current as Record<string, unknown>)[token];");
lines.push("    } else {");
lines.push("      return undefined;");
lines.push("    }");
lines.push("  }");
lines.push("  return current;");
lines.push("};");
lines.push("");
lines.push("/**");
lines.push(" * The records whose predicate fails on the value at their pointer: the");
lines.push(" * readable-and-incomplete set for a canonical stored document.");
lines.push(" */");
lines.push("export const findIncompleteRecords = (");
lines.push("  records: readonly CompletenessRecord[],");
lines.push("  document: unknown,");
lines.push("): readonly CompletenessRecord[] =>");
lines.push("  records.filter(");
lines.push("    (record) =>");
lines.push("      !PREDICATES[record.predicate](resolvePointer(document, record.pointer)),");
lines.push("  );");
lines.push("");
lines.push("/** True when every record's predicate holds for the document. */");
lines.push("export const isComplete = (");
lines.push("  records: readonly CompletenessRecord[],");
lines.push("  document: unknown,");
lines.push("): boolean => findIncompleteRecords(records, document).length === 0;");

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${lines.join("\n")}\n`, "utf8");
