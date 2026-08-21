import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  getEndpointSchemaMap,
  getSchemaForResponse,
} from "./endpoint-schema-map.js";

// ---------------------------------------------------------------------------
// Wave-1 endpoint -> method -> status -> response-schema map. The map is
// mechanically derived from contract/openapi.yaml; these tests pin the resolution
// rules so new endpoints cannot bypass response validation.
// ---------------------------------------------------------------------------

describe("endpoint schema map", () => {
  it("[ENDPOINT-MAP-001] the map covers every path in the OpenAPI spec", () => {
    const map = getEndpointSchemaMap();
    const here = path.dirname(fileURLToPath(import.meta.url));
    const openapiPath = path.join(here, "..", "..", "contract", "openapi.yaml");
    const spec = YAML.parse(fs.readFileSync(openapiPath, "utf8"));
    const routes = Object.keys(spec.paths);
    expect(routes.length).toBe(105);
    // Every declared path appears in the map under every HTTP method it declares.
    for (const route of routes) {
      const methods = Object.keys(spec.paths[route]).filter((m) =>
        ["get", "post", "put", "patch", "delete"].includes(m),
      );
      for (const method of methods) {
        expect(map).toHaveProperty(`${method.toUpperCase()} ${route}`);
      }
    }
  });

  it("[ENDPOINT-MAP-002] GET /campaign maps status 200 to 'campaign'", () => {
    const map = getEndpointSchemaMap();
    expect(map["GET /campaign"]["200"]).toBe("campaign");
  });

  it("[ENDPOINT-MAP-003] GET /campaign/roster maps status 200 to 'roster'", () => {
    const map = getEndpointSchemaMap();
    expect(map["GET /campaign/roster"]["200"]).toBe("roster");
  });

  it("[ENDPOINT-MAP-004] GET /characters maps status 200 to 'characterSummary'", () => {
    const map = getEndpointSchemaMap();
    expect(map["GET /characters"]["200"]).toBe("characterSummary");
  });

  it("[ENDPOINT-MAP-005] GET /characters/{id} maps status 200 to 'character'", () => {
    const map = getEndpointSchemaMap();
    expect(map["GET /characters/{id}"]["200"]).toBe("character");
  });

  it("[ENDPOINT-MAP-006] POST /characters/{id}/ops/stress.add maps status 200 to 'operationResult'", () => {
    const map = getEndpointSchemaMap();
    expect(map["POST /characters/{id}/ops/stress.add"]["200"]).toBe("operationResult");
  });

  it("[ENDPOINT-MAP-007] GET /characters/{id}/history maps status 200 to 'historyEntry'", () => {
    const map = getEndpointSchemaMap();
    expect(map["GET /characters/{id}/history"]["200"]).toBe("historyEntry");
  });

  it("[ENDPOINT-MAP-008] GET /crews maps status 200 to 'crewSummary'", () => {
    const map = getEndpointSchemaMap();
    expect(map["GET /crews"]["200"]).toBe("crewSummary");
  });

  it("[ENDPOINT-MAP-009] POST /characters/{id}/repair-preview maps status 200 to 'previewResult'", () => {
    const map = getEndpointSchemaMap();
    expect(map["POST /characters/{id}/repair-preview"]["200"]).toBe("previewResult");
  });

  it("[ENDPOINT-MAP-010] error statuses (404, 409, 422) on op endpoints map to 'operationResult'", () => {
    const map = getEndpointSchemaMap();
    const op = map["POST /characters/{id}/ops/stress.add"];
    expect(op["404"]).toBe("operationResult");
    expect(op["409"]).toBe("operationResult");
    expect(op["422"]).toBe("operationResult");
  });

  it("[ENDPOINT-MAP-011] getSchemaForResponse returns null for an unknown endpoint", () => {
    expect(getSchemaForResponse("GET", "/does/not/exist", 200)).toBeNull();
  });

  it("[ENDPOINT-MAP-012] getSchemaForResponse returns null for an unlisted status on a known endpoint", () => {
    // GET /campaign declares only 200.
    expect(getSchemaForResponse("GET", "/campaign", 404)).toBeNull();
  });

  it("[ENDPOINT-MAP-013] the map is deterministic (two calls return the same object)", () => {
    const a = getEndpointSchemaMap();
    const b = getEndpointSchemaMap();
    expect(a).toEqual(b);
    expect(Object.keys(a).length).toBe(Object.keys(b).length);
  });
});
