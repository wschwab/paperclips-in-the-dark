// Shared contract-reading utilities for the SC-C5 generators.
//
// Everything here is a pure function of the files under contract/ (plus the
// curated recovery/lifecycle tables in generate-api-reference.mjs). No
// timestamps, environment variables, or filesystem state leak into output.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const skillDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(skillDir, "..");
export const contractDir = resolve(repoRoot, "contract");
export const schemaDir = resolve(contractDir, "schemas");

const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

// ---------------------------------------------------------------------------
// OpenAPI parsing (indentation-based YAML subset; matches openapi.yaml style)
// ---------------------------------------------------------------------------

export const indentOf = (line) => line.length - line.trimStart().length;

export const unquote = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export function scalar(block, key) {
  const prefix = `${key}:`;
  const index = block.findIndex((line) => line.trimStart().startsWith(prefix));
  if (index < 0) return "";
  const line = block[index];
  const value = line.trimStart().slice(prefix.length).trim();
  if (value && value !== ">" && value !== "|") return unquote(value);

  const baseIndent = indentOf(line);
  const continuation = [];
  for (let i = index + 1; i < block.length && indentOf(block[i]) > baseIndent; i += 1) {
    continuation.push(block[i].trim());
  }
  return continuation.join(value === "|" ? "\n" : " ").trim();
}

export function schemaSnippet(block) {
  const index = block.findIndex((line) => /^\s{12}schema:/.test(line));
  if (index < 0) return "None";
  const baseIndent = indentOf(block[index]);
  const snippet = [block[index].slice(baseIndent)];
  for (let i = index + 1; i < block.length; i += 1) {
    if (block[i].trim() && indentOf(block[i]) <= baseIndent) break;
    snippet.push(block[i].slice(Math.min(baseIndent, indentOf(block[i]))));
  }
  return `\`\`\`yaml\n${snippet.join("\n").trimEnd()}\n\`\`\``;
}

export function parameterNames(block) {
  const text = block.join("\n");
  const names = new Set();
  for (const match of text.matchAll(/#\/components\/parameters\/([A-Za-z0-9_-]+)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/(?:^|[{,])\s*name:\s*([A-Za-z0-9_-]+)/gm)) {
    names.add(match[1]);
  }
  return [...names];
}

export function responseRows(block) {
  const rows = [];
  for (let i = 0; i < block.length; i += 1) {
    const match = block[i].match(/^\s{8}"([0-9]{3})":(?:\s*(.*))?$/);
    if (!match) continue;
    const code = match[1];
    const inline = match[2] ?? "";
    let detail = inline.includes("$ref") ? "OperationResult" : "";
    for (let j = i + 1; j < block.length && indentOf(block[j]) > 8; j += 1) {
      if (block[j].trimStart().startsWith("description:")) {
        detail = scalar(block.slice(j), "description");
        break;
      }
    }
    rows.push([code, detail || "See response schema in the contract"]);
  }
  return rows;
}

export async function parseOpenApi(openapiPath) {
  const source = await readFile(openapiPath, "utf8");
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const endpoints = [];
  let currentPath = "";
  for (let i = 0; i < lines.length; i += 1) {
    const pathMatch = lines[i].match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = lines[i].match(/^    ([a-z]+):\s*$/);
    if (!currentPath || !methodMatch || !METHODS.has(methodMatch[1])) continue;

    let end = i + 1;
    while (
      end < lines.length &&
      !/^  \/[^:]+:\s*$/.test(lines[end]) &&
      !/^    [a-z]+:\s*$/.test(lines[end])
    ) {
      end += 1;
    }
    const block = lines.slice(i + 1, end);
    endpoints.push({
      path: currentPath,
      method: methodMatch[1].toUpperCase(),
      operationId: scalar(block, "operationId"),
      summary: scalar(block, "summary") || scalar(block, "description"),
      snapshot: scalar(block, "x-snapshot"),
      parameters: parameterNames(block),
      request: schemaSnippet(block),
      responses: responseRows(block),
    });
    i = end - 1;
  }
  return { source, lines, endpoints };
}

export function enumerateOperationIds(endpoints) {
  const ids = endpoints.map((endpoint) => endpoint.operationId);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length > 0) {
    throw new Error(`duplicate operationIds in openapi.yaml: ${duplicates.join(", ")}`);
  }
  if (ids.some((id) => !id)) {
    throw new Error("an operation block in openapi.yaml is missing its operationId");
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Completeness records (x-requiredWhenComplete, SC-C1)
// ---------------------------------------------------------------------------

export const COMPLETENESS_PREDICATE_VOCABULARY = [
  {
    predicate: "nonBlankString",
    valueType: "JSON string",
    passes: "at least one character is not Unicode whitespace",
    fails: "empty string, whitespace-only string, any non-string",
  },
  {
    predicate: "nonEmptyArray",
    valueType: "JSON array",
    passes: "array length >= 1",
    fails: "empty array, any non-array",
  },
  {
    predicate: "positiveInteger",
    valueType: "JSON integer",
    passes: "value >= 1",
    fails: "0, negative, non-integer, any non-number",
  },
  {
    predicate: "true",
    valueType: "JSON boolean",
    passes: "value is true",
    fails: "false, any non-boolean",
  },
];

/** { entityKind: [{ pointer, predicate }] } in schema file order. */
export function completenessRecords(schemas) {
  const records = {};
  for (const [entity, schema] of Object.entries(schemas)) {
    if (!("x-requiredWhenComplete" in schema)) continue;
    const list = schema["x-requiredWhenComplete"];
    if (!Array.isArray(list)) {
      throw new Error(`${entity}.json: x-requiredWhenComplete must be an array`);
    }
    records[entity] = list.map((record, index) => {
      if (
        typeof record.pointer !== "string" ||
        typeof record.predicate !== "string" ||
        !COMPLETENESS_PREDICATE_VOCABULARY.some((v) => v.predicate === record.predicate)
      ) {
        throw new Error(
          `${entity}.json: malformed x-requiredWhenComplete record at index ${index}: ` +
            JSON.stringify(record),
        );
      }
      return { pointer: record.pointer, predicate: record.predicate };
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Typed error union (operation-result.json, SC-C4)
// ---------------------------------------------------------------------------

export function errorUnion(operationResult) {
  const union = operationResult?.$defs?.operationError;
  if (!union || !Array.isArray(union.oneOf)) {
    throw new Error("operation-result.json: $defs.operationError must be a oneOf union");
  }
  const codes = [];
  for (const branch of union.oneOf) {
    const properties = branch.properties ?? {};
    const code = properties.code?.const;
    const status = properties.status?.const;
    if (typeof code !== "string" || typeof status !== "number") {
      throw new Error("operation-result.json: malformed error-union branch (code/status)");
    }
    codes.push({
      code,
      status,
      detailsRef: properties.details?.$ref ?? null,
      detailsDescription: properties.details?.description ?? "",
      requiresEntity: Boolean(properties.entity),
      requiresPreview: Boolean(properties.preview || properties.token),
    });
  }
  return codes;
}

/** Details-shape label for the API reference table. */
export function detailsShapeLabel(entry) {
  if (entry.detailsRef) {
    const defName = entry.detailsRef.split("/").pop();
    return {
      errorPointerDetails: "pointer issues (pointer, reason, expected)",
      errorLimitDetails: "limit + current",
      errorPreviewDetails: "warnings + previewToken",
      errorStaleDetails: "currentRevision or currentContentToken",
    }[defName] ?? defName;
  }
  if (entry.detailsDescription && !entry.detailsDescription.startsWith("No detail shape")) {
    return `object — ${entry.detailsDescription}`;
  }
  return "none";
}
