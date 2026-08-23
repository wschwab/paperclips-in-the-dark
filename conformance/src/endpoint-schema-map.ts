import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = path.join(here, "..", "..", "contract", "openapi.yaml");
const HTTP_METHODS: Record<string, true> = {
  get: true,
  post: true,
  put: true,
  patch: true,
  delete: true,
  options: true,
  head: true,
  trace: true,
};
const SCHEMA_ID_BY_FILE: Record<string, string> = {
  "common.json": "https://paperclips-in-the-dark/schemas/common.json",
  "campaign.json": "https://paperclips-in-the-dark/schemas/campaign.json",
  "character.json": "https://paperclips-in-the-dark/schemas/character.json",
  "crew.json": "https://paperclips-in-the-dark/schemas/crew.json",
  "clock.json": "https://paperclips-in-the-dark/schemas/clock.json",
  "operation-result.json": "https://paperclips-in-the-dark/schemas/operation-result.json",
};

type JsonObject = Record<string, unknown>;

export type ResponseDisposition =
  | { kind: "schema"; schemaName: string; collection: boolean }
  | { kind: "inline"; schema: JsonObject }
  | { kind: "no-body" };

export interface OperationResponse {
  operationId: string;
  method: string;
  path: string;
  responses: Record<string, ResponseDisposition>;
}

export type EndpointSchemaMap = Record<string, OperationResponse>;

function asObject(value: unknown, context: string): JsonObject {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as JsonObject;
}

function loadSpec(): JsonObject {
  return YAML.parse(fs.readFileSync(OPENAPI_PATH, "utf8")) as JsonObject;
}

function resolveLocalPointer(spec: JsonObject, ref: string, context: string): unknown {
  if (!ref.startsWith("#/")) {
    throw new Error(`${context} uses unsupported reference ${ref}`);
  }
  let current: unknown = spec;
  for (const encodedPart of ref.slice(2).split("/")) {
    const part = encodedPart.replaceAll("~1", "/").replaceAll("~0", "~");
    const object = asObject(current, `reference ${ref}`);
    if (!(part in object)) {
      throw new Error(`${context} cannot resolve reference ${ref}`);
    }
    current = object[part];
  }
  return current;
}

function externalSchemaReference(ref: string): { schemaName: string; normalizedRef: string } | null {
  const match = ref.match(/^\.\/schemas\/([^#]+)(#.*)?$/);
  if (!match) {
    return null;
  }
  const [, file, fragment = ""] = match;
  const schemaId = SCHEMA_ID_BY_FILE[file];
  if (!schemaId) {
    throw new Error(`response schema references unregistered contract schema ${ref}`);
  }
  const definition = fragment.match(/^#\/\$defs\/([^/]+)$/)?.[1];
  const rootName = file
    .replace(/\.json$/, "")
    .replace(/-([a-z])/g, (_whole, letter: string) => letter.toUpperCase());
  return {
    schemaName: definition ?? rootName,
    normalizedRef: `${schemaId}${fragment}`,
  };
}

function namedSchemaForRef(spec: JsonObject, ref: string, seen: Set<string>): string | null {
  const external = externalSchemaReference(ref);
  if (external) {
    return external.schemaName;
  }
  if (!ref.startsWith("#/components/schemas/")) {
    return null;
  }
  if (seen.has(ref)) {
    throw new Error(`cyclic response schema reference ${ref}`);
  }
  seen.add(ref);
  const resolved = asObject(resolveLocalPointer(spec, ref, "response schema"), `schema ${ref}`);
  const nestedRef = resolved.$ref;
  const result = typeof nestedRef === "string" ? namedSchemaForRef(spec, nestedRef, seen) : null;
  seen.delete(ref);
  return result;
}

function normalizeInlineSchema(spec: JsonObject, value: unknown, seen: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeInlineSchema(spec, item, seen));
  }
  if (value == null || typeof value !== "object") {
    return value;
  }
  const schema = value as JsonObject;
  if (typeof schema.$ref === "string") {
    const external = externalSchemaReference(schema.$ref);
    if (external) {
      return { ...schema, $ref: external.normalizedRef };
    }
    if (!schema.$ref.startsWith("#/components/schemas/")) {
      throw new Error(`unsupported inline schema reference ${schema.$ref}`);
    }
    if (seen.has(schema.$ref)) {
      throw new Error(`cyclic inline schema reference ${schema.$ref}`);
    }
    seen.add(schema.$ref);
    const resolved = normalizeInlineSchema(
      spec,
      resolveLocalPointer(spec, schema.$ref, "inline response schema"),
      seen,
    );
    seen.delete(schema.$ref);
    return resolved;
  }
  const normalized: JsonObject = {};
  for (const [key, child] of Object.entries(schema)) {
    normalized[key] = normalizeInlineSchema(spec, child, seen);
  }
  return normalized;
}

function responseDisposition(spec: JsonObject, schemaValue: unknown): ResponseDisposition {
  if (schemaValue === true || schemaValue === false) {
    throw new Error("boolean inline response schemas are unsupported");
  }
  const schema = asObject(schemaValue, "application/json response schema");
  if (typeof schema.$ref === "string") {
    const schemaName = namedSchemaForRef(spec, schema.$ref, new Set());
    if (schemaName) {
      return { kind: "schema", schemaName, collection: false };
    }
  }
  if (schema.type === "array") {
    const items = asObject(schema.items, "array response items");
    if (typeof items.$ref === "string") {
      const schemaName = namedSchemaForRef(spec, items.$ref, new Set());
      if (schemaName) {
        return { kind: "schema", schemaName, collection: true };
      }
    }
  }
  return {
    kind: "inline",
    schema: normalizeInlineSchema(spec, schema, new Set()) as JsonObject,
  };
}

function resolveResponse(spec: JsonObject, responseValue: unknown, context: string): JsonObject {
  let response = asObject(responseValue, context);
  const seen = new Set<string>();
  while (typeof response.$ref === "string") {
    if (seen.has(response.$ref)) {
      throw new Error(`${context} has a cyclic response reference ${response.$ref}`);
    }
    seen.add(response.$ref);
    response = asObject(resolveLocalPointer(spec, response.$ref, context), context);
  }
  return response;
}

export function getEndpointSchemaMapFromSpec(specDocument: unknown): EndpointSchemaMap {
  const spec = asObject(specDocument, "OpenAPI document");
  const paths = asObject(spec.paths ?? {}, "OpenAPI paths");
  const map: EndpointSchemaMap = {};

  for (const [route, pathValue] of Object.entries(paths)) {
    const pathItem = asObject(pathValue, `path ${route}`);
    for (const [method, operationValue] of Object.entries(pathItem)) {
      if (!HTTP_METHODS[method.toLowerCase()]) {
        continue;
      }
      const operation = asObject(operationValue, `${method.toUpperCase()} ${route}`);
      if (typeof operation.operationId !== "string" || operation.operationId.length === 0) {
        throw new Error(`${method.toUpperCase()} ${route} is missing operationId`);
      }
      if (map[operation.operationId]) {
        throw new Error(`duplicate operationId ${operation.operationId}`);
      }
      const responses = asObject(operation.responses, `${operation.operationId} responses`);
      if (Object.keys(responses).length === 0) {
        throw new Error(`${operation.operationId} declares no response status`);
      }
      const dispositions: Record<string, ResponseDisposition> = {};
      for (const [status, responseValue] of Object.entries(responses)) {
        if (status.length === 0) {
          throw new Error(`${operation.operationId} has an empty response status`);
        }
        const response = resolveResponse(spec, responseValue, `${operation.operationId} ${status}`);
        if (!("content" in response)) {
          dispositions[status] = { kind: "no-body" };
          continue;
        }
        const content = asObject(response.content, `${operation.operationId} ${status} content`);
        const json = content["application/json"];
        if (json === undefined) {
          throw new Error(`${operation.operationId} ${status} has content without application/json`);
        }
        const media = asObject(json, `${operation.operationId} ${status} application/json`);
        if (!("schema" in media)) {
          throw new Error(`${operation.operationId} ${status} application/json has no schema`);
        }
        dispositions[status] = responseDisposition(spec, media.schema);
      }
      map[operation.operationId] = {
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path: route,
        responses: dispositions,
      };
    }
  }

  return map;
}

export function getEndpointSchemaMap(specDocument?: unknown): EndpointSchemaMap {
  return getEndpointSchemaMapFromSpec(specDocument ?? loadSpec());
}

export function getResponseDisposition(
  operationId: string,
  status: number | string,
  specDocument?: unknown,
): ResponseDisposition {
  const operation = getEndpointSchemaMap(specDocument)[operationId];
  if (!operation) {
    throw new Error(`unknown endpoint operationId ${operationId}`);
  }
  const disposition = operation.responses[String(status)] ?? operation.responses.default;
  if (!disposition) {
    throw new Error(`no response schema for endpoint ${operationId} status ${status}`);
  }
  return disposition;
}
