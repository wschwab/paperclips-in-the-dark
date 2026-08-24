import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { getEndpointSchemaMap } from "../../src/endpoint-schema-map.js";
import { assertResponseValid } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook } from "../../src/game-data.js";

// ONE GENERATED exact-schema operation matrix (ledger TEST-04, DC-001 merge):
// every declared read operation from contract/openapi.yaml — derived at
// runtime through getEndpointSchemaMap() — is executed against known
// resources seeded through the public APIs (or static game data), and its
// response is asserted against exactly the response disposition the contract
// declares (named JSON schema, collection wrapper, or inline schema).
// Replaces the merged success-routes.test.ts rows; unknown-resource typed
// 404 coverage remains in endpoints.test.ts. The two M01-linked roster rows'
// crew-summary projection carry-over lives in the named cases at the bottom.
//
// Every assertion carries `${operationId} ${method} ${path}` in its failure
// message so a red row names the exact failing operation and status.

const BLADES = "blades-in-the-dark";

/** Lazily-created fresh entity ids for one matrix row (never shared). */
interface SeedBag {
  character?: Promise<string>;
  crew?: Promise<string>;
  clock?: Promise<string>;
  characterSnapshot?: Promise<string>;
  crewSnapshot?: Promise<string>;
}

async function createCharacter(): Promise<string> {
  const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
  expect(response.status).toBe(200);
  assertResponseValid("createCharacter", response.status, response.body);
  const body = response.body as { character?: { id?: string } };
  if (!body.character?.id) throw new Error("character seeding returned no id");
  return body.character.id;
}

async function createCrew(): Promise<string> {
  const response = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
  expect(response.status).toBe(200);
  assertResponseValid("createCrew", response.status, response.body);
  const body = response.body as { crew?: { id?: string } };
  if (!body.crew?.id) throw new Error("crew seeding returned no id");
  return body.crew.id;
}

async function createClock(): Promise<string> {
  const response = await api.post("clocks", {
    name: "Operation-matrix clock",
    behavior: "bounded",
    size: 4,
    purpose: "custom",
    ownerKind: "campaign",
    ownerId: "",
    relatedClockIds: [],
  });
  expect(response.status).toBe(200);
  assertResponseValid("createClock", response.status, response.body);
  const body = response.body as { clock?: { id?: string } };
  if (!body.clock?.id) throw new Error("clock seeding returned no id");
  return body.clock.id;
}

/** Produces one snapshot-worthy mutation and returns the newest snapshotId. */
async function newestSnapshotId(entityKind: "character" | "crew", entityId: string): Promise<string> {
  const mutation = await api.post(`${entityKind}s/${entityId}/ops/note.add`, { text: "operation-matrix snapshot" });
  expect(mutation.status).toBe(200);
  assertResponseValid(entityKind === "character" ? "noteAdd" : "crewNoteAdd", mutation.status, mutation.body);
  const history = await api.get(`${entityKind}s/${entityId}/history`);
  expect(history.status).toBe(200);
  assertResponseValid(
    entityKind === "character" ? "listCharacterHistory" : "listCrewHistory",
    history.status,
    history.body,
  );
  const entries = history.body as Array<{ snapshotId?: string }>;
  if (!entries[0]?.snapshotId) throw new Error("history returned no snapshotId");
  return entries[0].snapshotId;
}

const readOperations = Object.values(getEndpointSchemaMap())
  .filter((operation) => operation.method === "GET" && operation.responses["200"] !== undefined)
  .sort((left, right) => left.operationId.localeCompare(right.operationId));

/** camelCase OpenAPI operation id → stable CONTRACT-MATRIX test-case id. */
function matrixId(operationId: string): string {
  const kebab = operationId.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toUpperCase();
  return `CONTRACT-MATRIX-${kebab}-001`;
}

/**
 * Resolves an OpenAPI path template against lazily seeded known resources.
 * Each call seeds fresh entities, so matrix rows never share fixtures.
 */
async function resolveRequestPath(path: string, seeds: SeedBag): Promise<string> {
  const templateSegments = path.replace(/^\//, "").split("/");
  const top = templateSegments[0];
  const resolved: string[] = [];
  for (const segment of templateSegments) {
    const match = /^\{(.+)\}$/.exec(segment);
    if (!match) {
      resolved.push(segment);
      continue;
    }
    const param = match[1]!;
    switch (param) {
      case "id": {
        if (top === "characters") {
          seeds.character ??= createCharacter();
          resolved.push(await seeds.character);
        } else if (top === "clocks") {
          seeds.clock ??= createClock();
          resolved.push(await seeds.clock);
        } else if (top === "crews") {
          seeds.crew ??= createCrew();
          resolved.push(await seeds.crew);
        } else {
          throw new Error(`operation matrix: no seeder for {${param}} under /${top}`);
        }
        break;
      }
      case "crewId":
        seeds.crew ??= createCrew();
        resolved.push(await seeds.crew);
        break;
      case "snapshotId":
        if (top === "crews") {
          seeds.crew ??= createCrew();
          seeds.crewSnapshot ??= newestSnapshotId("crew", await seeds.crew);
          resolved.push(await seeds.crewSnapshot);
        } else {
          seeds.character ??= createCharacter();
          seeds.characterSnapshot ??= newestSnapshotId("character", await seeds.character);
          resolved.push(await seeds.characterSnapshot);
        }
        break;
      case "stem":
        resolved.push(BLADES);
        break;
      case "playbook":
        resolved.push("Cutter");
        break;
      case "crewType":
        resolved.push("Assassins");
        break;
      default:
        throw new Error(`operation matrix: unresolved path parameter {${param}} in ${path}`);
    }
  }
  return resolved.join("/");
}

describe("contract v1 generated exact-schema operation matrix", () => {
  for (const operation of readOperations) {
    const success = operation.responses["200"];
    const disposition =
      success?.kind === "schema"
        ? `schema ${success.schemaName}${success.collection ? " (collection)" : ""}`
        : "inline schema";
    testCase(
      matrixId(operation.operationId),
      `${operation.method} ${operation.path} returns exactly its declared response (${disposition})`,
      async () => {
        const seeds: SeedBag = {};
        const path = await resolveRequestPath(operation.path, seeds);
        const response = await api.get(path);
        const where = `${operation.operationId} GET ${operation.path}`;
        // Exact operation id + status in every failure message: a red row
        // must name the failing operation, its template, and the status.
        expect(response.status, `${where}: expected 200 for the declared success route`).toBe(200);
        try {
          assertResponseValid(operation.operationId, 200, response.body);
        } catch (error) {
          throw new Error(`${where} status 200: ${(error as Error).message}`, { cause: error });
        }
      },
    );
  }

  // ---------------------------------------------------------------------
  // M01 carry-over (deleted CONTRACT-SUCCESS-ROSTER-001 and
  // CONTRACT-SUCCESS-CREWS-001): the crew-summary projection assertions.
  // campaign.json#/$defs/crewSummary requires canUndo/historyCount and the
  // AJV oracle above enforces them; these two named cases additionally pin
  // the raw field presence on the two M01-linked list routes so a tolerant
  // decoder default can never mask the roster calibration (AUD-001/AUD-002).
  // ---------------------------------------------------------------------
  testCase(
    "CONTRACT-MATRIX-M01-ROSTER-CREWSUMMARY-001",
    "GET /api/campaign/roster exposes canUndo/historyCount on every crew summary (M01 projection)",
    async () => {
      const crewId = await createCrew();
      const response = await api.get("campaign/roster");
      const where = "getRoster GET /campaign/roster";
      expect(response.status, `${where}: expected 200`).toBe(200);
      const body = response.body as { crews?: Array<Record<string, unknown>> };
      const row = body.crews?.find((entry) => entry.id === crewId);
      expect(row, `${where} status 200: seeded crew missing from roster projection`).toBeDefined();
      expect(typeof row!.canUndo, `${where} status 200: canUndo must be present`).toBe("boolean");
      expect(typeof row!.historyCount, `${where} status 200: historyCount must be present`).toBe("number");
      expect(row!.historyCount, `${where} status 200: fresh crew has zero snapshots`).toBe(0);
    },
  );

  testCase(
    "CONTRACT-MATRIX-M01-CREWLIST-CREWSUMMARY-001",
    "GET /api/crews exposes canUndo/historyCount on every crew summary (M01 projection)",
    async () => {
      const crewId = await createCrew();
      const response = await api.get("crews");
      const where = "listCrews GET /crews";
      expect(response.status, `${where}: expected 200`).toBe(200);
      expect(Array.isArray(response.body), `${where} status 200: crew list must be an array`).toBe(true);
      const rows = response.body as Array<Record<string, unknown>>;
      const row = rows.find((entry) => entry.id === crewId);
      expect(row, `${where} status 200: seeded crew missing from crew list`).toBeDefined();
      expect(typeof row!.canUndo, `${where} status 200: canUndo must be present`).toBe("boolean");
      expect(typeof row!.historyCount, `${where} status 200: historyCount must be present`).toBe("number");
      expect(row!.historyCount, `${where} status 200: fresh crew has zero snapshots`).toBe(0);
    },
  );
});
