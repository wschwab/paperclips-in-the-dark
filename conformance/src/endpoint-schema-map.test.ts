import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  getEndpointSchemaMap,
  getResponseDisposition,
} from "./endpoint-schema-map.js";
import { assertResponseValid } from "./schemas.js";

// ---------------------------------------------------------------------------
// Wave-1 operationId -> operation -> status -> response disposition map. The map is
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
    expect(routes.length).toBe(106);
    // Every declared operation appears in the map under its operationId.
    for (const route of routes) {
      const methods = Object.keys(spec.paths[route]).filter((m) =>
        ["get", "post", "put", "patch", "delete"].includes(m),
      );
      for (const method of methods) {
        expect(map).toHaveProperty(spec.paths[route][method].operationId);
      }
    }
  });

  it("[ENDPOINT-MAP-002] GET /campaign maps status 200 to 'campaign'", () => {
    const map = getEndpointSchemaMap();
    expect(map.getCampaign.responses["200"]).toEqual({ kind: "schema", schemaName: "campaign", collection: false });
  });

  it("[ENDPOINT-MAP-003] GET /campaign/roster maps status 200 to 'roster'", () => {
    const map = getEndpointSchemaMap();
    expect(map.getRoster.responses["200"]).toEqual({ kind: "schema", schemaName: "roster", collection: false });
  });

  it("[ENDPOINT-MAP-004] GET /characters maps status 200 to 'characterSummary'", () => {
    const map = getEndpointSchemaMap();
    expect(map.listCharacters.responses["200"]).toEqual({ kind: "schema", schemaName: "characterSummary", collection: true });
  });

  it("[ENDPOINT-MAP-005] GET /characters/{id} maps status 200 to 'character'", () => {
    const map = getEndpointSchemaMap();
    expect(map.getCharacter.responses["200"]).toEqual({ kind: "schema", schemaName: "character", collection: false });
  });

  it("[ENDPOINT-MAP-006] POST /characters/{id}/ops/stress.add maps status 200 to 'operationResult'", () => {
    const map = getEndpointSchemaMap();
    expect(map.stressAdd.responses["200"]).toEqual({ kind: "schema", schemaName: "operationResult", collection: false });
  });

  it("[ENDPOINT-MAP-007] GET /characters/{id}/history maps status 200 to 'historyEntry'", () => {
    const map = getEndpointSchemaMap();
    expect(map.listCharacterHistory.responses["200"]).toEqual({ kind: "schema", schemaName: "historyEntry", collection: true });
  });

  it("[ENDPOINT-MAP-008] GET /crews maps status 200 to 'crewSummary'", () => {
    const map = getEndpointSchemaMap();
    expect(map.listCrews.responses["200"]).toEqual({ kind: "schema", schemaName: "crewSummary", collection: true });
  });

  it("[ENDPOINT-MAP-009] POST /characters/{id}/repair-preview maps status 200 to 'previewResult'", () => {
    const map = getEndpointSchemaMap();
    expect(map.repairCharacterPreview.responses["200"]).toEqual({ kind: "schema", schemaName: "previewResult", collection: false });
  });

  it("[ENDPOINT-MAP-010] error statuses (404, 409, 422) on op endpoints map to 'operationResult'", () => {
    const map = getEndpointSchemaMap();
    const op = map.stressAdd;
    expect(op.responses["404"]).toEqual({ kind: "schema", schemaName: "operationResult", collection: false });
    expect(op.responses["409"]).toEqual({ kind: "schema", schemaName: "operationResult", collection: false });
    expect(op.responses["422"]).toEqual({ kind: "schema", schemaName: "operationResult", collection: false });
  });

  it("[ORACLE-CAL-015] unresolved endpoint throws", () => {
    expect(() => getResponseDisposition("doesNotExist", 200)).toThrow(/endpoint|schema/i);
  });

  it("[ORACLE-CAL-016] unresolved status throws", () => {
    expect(() => getResponseDisposition("getCampaign", 404)).toThrow(/status|schema/i);
  });

  it("[ENDPOINT-MAP-013] the map is deterministic (two calls return the same object)", () => {
    const a = getEndpointSchemaMap();
    const b = getEndpointSchemaMap();
    expect(a).toEqual(b);
    expect(Object.keys(a).length).toBe(Object.keys(b).length);
  });

  it("[ORACLE-CAL-017] derives responses by operationId and distinguishes a schema from explicit no-body", async () => {
    const { getEndpointSchemaMapFromSpec } = await import("./endpoint-schema-map.js");
    const map = getEndpointSchemaMapFromSpec({ paths: {
      "/oracle": { get: { operationId: "oracleBody", responses: { "200": { content: { "application/json": { schema: { type: "object" } } } }, "204": { description: "no body" } } } },
    } });
    expect(map.oracleBody.responses["200"]).toEqual({ kind: "inline", schema: { type: "object" } });
    expect(map.oracleBody.responses["204"]).toEqual({ kind: "no-body" });
  });

  it("[ORACLE-CAL-018] rejects unsupported inline response schemas clearly", async () => {
    const { getEndpointSchemaMapFromSpec } = await import("./endpoint-schema-map.js");
    expect(() => getEndpointSchemaMapFromSpec({ paths: {
      "/oracle": { get: { operationId: "oracleInline", responses: { "200": { content: { "text/plain": { schema: { type: "string" } } } } } } },
    } })).toThrow(/application\/json|inline|schema/i);
  });

  it("[ORACLE-CAL-019] rejects a response with an empty status from the derived map", async () => {
    const { getEndpointSchemaMapFromSpec } = await import("./endpoint-schema-map.js");
    expect(() => getEndpointSchemaMapFromSpec({ paths: {
      "/oracle": { get: { operationId: "oracleMissingStatus", responses: { "": { description: "missing status" } } } },
    } })).toThrow(/status/i);
  });

  it("[ORACLE-CAL-020] rejects duplicate and missing operationIds", async () => {
    const { getEndpointSchemaMapFromSpec } = await import("./endpoint-schema-map.js");
    expect(() => getEndpointSchemaMapFromSpec({ paths: {
      "/one": { get: { operationId: "duplicate", responses: { "200": { description: "no body" } } } },
      "/two": { get: { operationId: "duplicate", responses: { "200": { description: "no body" } } } },
    } })).toThrow(/duplicate|operationId/i);
    expect(() => getEndpointSchemaMapFromSpec({ paths: {
      "/one": { get: { responses: { "200": { description: "no body" } } } },
    } })).toThrow(/operationId/i);
  });

  it("[ENDPOINT-MAP-014] POST /characters/pc maps 200/400/404 to 'operationResult'", () => {
    const map = getEndpointSchemaMap();
    expect(map.createPcCharacter.responses["200"]).toEqual({ kind: "schema", schemaName: "operationResult", collection: false });
    expect(map.createPcCharacter.responses["400"]).toEqual({ kind: "schema", schemaName: "operationResult", collection: false });
    expect(map.createPcCharacter.responses["404"]).toEqual({ kind: "schema", schemaName: "operationResult", collection: false });
  });

  it("[ORACLE-CAL-021] includes a newly supplied fake endpoint automatically", async () => {
    const { getEndpointSchemaMapFromSpec } = await import("./endpoint-schema-map.js");
    const map = getEndpointSchemaMapFromSpec({ paths: {
      "/oracle/fake": { get: { operationId: "oracleFake", responses: { "200": { description: "no body" } } } },
    } });
    expect(map.oracleFake.responses["200"]).toEqual({ kind: "no-body" });
  });

  it("[ORACLE-CAL-022] assertResponseValid rejects the wrong operationId/status body", () => {
    expect(() => assertResponseValid("getCampaign", 200, { not: "campaign" })).toThrow();
    expect(() => assertResponseValid("getCampaign", 404, {})).toThrow(/schema|status|endpoint/i);
  });
});
