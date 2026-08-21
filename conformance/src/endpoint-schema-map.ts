import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

/**
 * Endpoint -> method -> status -> response-schema map, mechanically derived from
 * contract/openapi.yaml (the single source of truth). Every response of every
 * declared operation is resolved to a contract schema name so no endpoint can
 * bypass response validation.
 */

/** Resolve the contract directory regardless of CWD. */
const here = path.dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = path.join(here, "..", "..", "contract", "openapi.yaml");

const HTTP_METHODS: Record<string, true> = {
  get: true,
  post: true,
  put: true,
  patch: true,
  delete: true,
};

/**
 * Resolve a $ref string to a contract schema name, following the frozen
 * resolution rules:
 *   - #/components/responses/OpResult        -> operationResult
 *   - #/components/schemas/X                 -> X with its first letter lowered
 *   - ./schemas/campaign.json#/$defs/X       -> X
 */
function resolveRef(ref: string): string {
  if (ref === "#/components/responses/OpResult") {
    return "operationResult";
  }
  if (ref.startsWith("#/components/schemas/")) {
    const name = ref.slice("#/components/schemas/".length);
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  const defsMatch = ref.match(/\.\/schemas\/[^#]+#\/\$defs\/(.+)$/);
  if (defsMatch) {
    return defsMatch[1];
  }
  return "none";
}

/** Resolve a content schema object (possibly nested under items/oneOf) to a name. */
function resolveSchemaName(schema: unknown): string {
  if (schema == null || typeof schema !== "object") {
    return "none";
  }
  const s = schema as Record<string, unknown>;
  if (typeof s.$ref === "string") {
    return resolveRef(s.$ref);
  }
  if (s.type === "array" && s.items != null && typeof s.items === "object") {
    return resolveSchemaName(s.items as Record<string, unknown>);
  }
  if (Array.isArray(s.oneOf)) {
    const names = s.oneOf.map((branch) => resolveSchemaName(branch)).filter((n) => n !== "none");
    return names.length > 0 ? names.join("|") : "none";
  }
  // Inline content with no resolvable contract schema (e.g. authored game JSON).
  return "none";
}

function loadSpec(): Record<string, unknown> {
  return YAML.parse(fs.readFileSync(OPENAPI_PATH, "utf8"));
}

export type EndpointSchemaMap = Record<string, Record<string, string>>;

/**
 * Build the endpoint schema map fresh from contract/openapi.yaml.
 * Keys are "<METHOD> /path" (uppercase method); each value maps a numeric HTTP
 * status (as a string) to a contract schema name. Rebuilding on every call keeps
 * the result deterministic and always in sync with the source of truth.
 */
export function getEndpointSchemaMap(): EndpointSchemaMap {
  const spec = loadSpec();
  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;

  const map: EndpointSchemaMap = {};

  for (const [route, methods] of Object.entries(paths)) {
    for (const method of Object.keys(methods)) {
      if (!HTTP_METHODS[method.toLowerCase()]) {
        continue;
      }
      const operation = methods[method] as Record<string, unknown>;
      const statusMap: Record<string, string> = {};
      const responses = (operation?.responses ?? {}) as Record<string, unknown>;
      for (const [status, response] of Object.entries(responses)) {
        const resp = response as Record<string, unknown>;
        if (typeof resp?.$ref === "string") {
          statusMap[status] = resolveRef(resp.$ref);
        } else {
          const content = resp?.content as Record<string, unknown> | undefined;
          const json = content?.["application/json"] as Record<string, unknown> | undefined;
          statusMap[status] = resolveSchemaName(json?.schema);
        }
      }
      const key = `${method.toUpperCase()} ${route}`;
      map[key] = statusMap;
    }
  }

  return map;
}

/**
 * Return the contract schema name for a given endpoint + status, or null when the
 * endpoint/status is not declared in the OpenAPI spec.
 */
export function getSchemaForResponse(method: string, pathPattern: string, status: number): string | null {
  const map = getEndpointSchemaMap();
  const key = `${method.toUpperCase()} ${pathPattern}`;
  const statuses = map[key];
  return statuses?.[String(status)] ?? null;
}

