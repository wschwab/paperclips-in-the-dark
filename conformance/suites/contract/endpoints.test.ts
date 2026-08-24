import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { assertResponseValid } from "../../src/schemas.js";
import { getEndpointSchemaMap } from "../../src/endpoint-schema-map.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook } from "../../src/game-data.js";

// AUDIT-0 BUG-007/011/012/013 hardening: known resources are seeded through
// the public create APIs and every declared 200 path must return exactly the
// declared schema. Unknown resources must still return a typed 404
// (OperationResult with error.code NOT_FOUND). Invented IDs are never
// accepted as success, and no response is decoded as a generic object where
// the contract declares a specific schema.

const BLADES = "blades-in-the-dark";
const unknownId = "00000000-0000-4000-8000-000000000000";
const unknownClock = "00000000-0000-4000-8000-000000000001";
const unknownCrew = "00000000-0000-4000-8000-000000000002";
const contractOperations = Object.values(getEndpointSchemaMap());

function operationIdForRequest(method: string, requestPath: string): string {
  const requestSegments = requestPath.split("/");
  const matches = contractOperations.filter((operation) => {
    if (operation.method !== method) return false;
    const templateSegments = operation.path.replace(/^\//, "").split("/");
    return templateSegments.length === requestSegments.length
      && templateSegments.every(
        (segment, index) =>
          (segment.startsWith("{") && segment.endsWith("}")) || segment === requestSegments[index],
      );
  });
  if (matches.length !== 1) {
    throw new Error(`expected one OpenAPI operation for ${method} ${requestPath}, found ${matches.length}`);
  }
  return matches[0]!.operationId;
}

type Seed = "character" | "crew" | "clock";

type Case = {
  id: string;
  method: "GET" | "POST";
  /** May contain {character} {crew} {clock} {snapshot} placeholders. */
  path: string;
  body?: unknown;
  seeds?: Seed[];
  success:
    | "health"
    | "campaign"
    | "roster"
    | "game-list"
    | "character"
    | "crew"
    | "clock"
    | "character-list"
    | "crew-list"
    | "clock-list"
    | "history"
    | "array"
    | "object"
    | "operation";
  status?: number;
  /** When set, the response must decode to an OperationResult with this code. */
  errorCode?: string;
};

const operationBody = { delta: 1 };
const characterOpCases: Array<[string, unknown]> = [
  ["delete", { confirm: true }],
  ["import", {}],
  ["undo", undefined],
  ["ops/stress.add", operationBody],
  ["ops/stress.clear", { amount: 1 }],
  ["ops/trauma.add", { trauma: "Test" }],
  ["ops/trauma.remove", { trauma: "Test" }],
  ["ops/harm.add", { description: "Test", intensity: "lesser" }],
  ["ops/harm.remove", { description: "Test", intensity: "lesser" }],
  ["ops/harm.heal", undefined],
  ["ops/harm.healing-clock", { segments: 1 }],
  ["ops/armor.set", { armor: "standard", used: false }],
  ["ops/playbook-xp.add", operationBody],
  ["ops/playbook-xp.clear", undefined],
  ["ops/attribute-xp.add", { attribute: "Insight", delta: 1 }],
  ["ops/attribute-xp.clear", { attribute: "Insight" }],
  ["ops/attribute.levelup", { attribute: "Insight", action: "Hunt" }],
  ["ops/action.set-rating", { action: "Hunt", rating: 0 }],
  ["ops/ability.take", { name: "Veteran" }],
  ["ops/ability.remove", { name: "Veteran" }],
  ["ops/gear.add", { name: "Test", bulk: 0 }],
  ["ops/gear.remove", { name: "Test" }],
  ["ops/gear.commit", { name: "Test" }],
  ["ops/gear.uncommit", { name: "Test" }],
  ["ops/gear.set-commitment", { commitment: "light" }],
  ["ops/gear.clear-commitments", undefined],
  ["ops/gear.lock", undefined],
  ["ops/gear.unlock", undefined],
  ["ops/fund.gain", { coins: 1 }],
  ["ops/fund.spend", { coins: 1 }],
  ["ops/fund.liquidate", { coins: 1 }],
  ["ops/rolodex.add", { entry: "Test" }],
  ["ops/rolodex.remove", { entry: "Test" }],
  ["ops/rolodex.set-closeness", { entry: "Test", closeness: "friend" }],
  ["ops/dossier.update", { name: "Test" }],
  ["ops/session.set", { playbookExpressions: 0 }],
  ["ops/notebook.set", { text: "Test" }],
];

const crewOpCases: Array<[string, unknown]> = [
  ["delete", { confirm: true }],
  ["import", {}],
  ["undo", undefined],
  ["ops/heat.add", operationBody],
  ["ops/wanted.add", operationBody],
  ["ops/rep.add", operationBody],
  ["ops/tier.add", operationBody],
  ["ops/hold.set", { hold: "strong" }],
  ["ops/xp.add", operationBody],
  ["ops/xp.clear", undefined],
  ["ops/ability.take", { name: "Test" }],
  ["ops/ability.remove", { name: "Test" }],
  ["ops/upgrade.mark", { name: "Test" }],
  ["ops/upgrade.unmark", { name: "Test" }],
  ["ops/cohort.add", { cohortKind: "gang" }],
  ["ops/cohort.update", { cohortId: unknownId, description: "Test" }],
  ["ops/cohort.remove", { cohortId: unknownId }],
  // C3 contract change (2026-07-29): crew contacts & factions ops.
  ["ops/contact.add", { name: "Test", profession: "Test" }],
  ["ops/contact.remove", { name: "Test" }],
  ["ops/faction.set-status", { name: "Test", status: 0 }],
  ["ops/faction.remove", { name: "Test" }],
  ["ops/coin.add", operationBody],
  ["ops/stash.add", operationBody],
  ["ops/fields.update", { name: "Test" }],
];

const clockOpCases: Array<[string, unknown]> = [
  ["delete", { confirm: true }],
  ["ops/clock.progress", { segments: 1 }],
  ["ops/clock.reset", undefined],
];

const cases: Case[] = [
  { id: "CONTRACT-HEALTH-001", method: "GET", path: "health", success: "health" },
  { id: "CONTRACT-CAMPAIGN-001", method: "GET", path: "campaign", success: "campaign" },
  { id: "CONTRACT-ROSTER-001", method: "GET", path: "campaign/roster", success: "roster" },
  { id: "CONTRACT-CREW-MEMBERS-001", method: "GET", path: "campaign/crew/{crew}/members", seeds: ["crew"], success: "character-list" },
  { id: "CONTRACT-BATCH-001", method: "POST", path: "campaign/batch", seeds: ["character"], body: { ops: [{ entity: "character", id: "{character}", op: "stress.add", args: { delta: 1 } }] }, success: "operation" },
  { id: "CONTRACT-GAMES-001", method: "GET", path: "games", success: "game-list" },
  { id: "CONTRACT-GAME-001", method: "GET", path: "games/blades-in-the-dark", success: "object" },
  { id: "CONTRACT-GAME-PLAYBOOKS-001", method: "GET", path: "games/blades-in-the-dark/playbooks", success: "array" },
  { id: "CONTRACT-GAME-PLAYBOOK-001", method: "GET", path: "games/blades-in-the-dark/playbooks/Cutter", success: "object" },
  { id: "CONTRACT-GAME-HERITAGES-001", method: "GET", path: "games/blades-in-the-dark/heritages", success: "array" },
  { id: "CONTRACT-GAME-CREWS-001", method: "GET", path: "games/blades-in-the-dark/crews", success: "object" },
  { id: "CONTRACT-GAME-CREW-TYPE-001", method: "GET", path: "games/blades-in-the-dark/crews/Assassins", success: "object" },
  { id: "CONTRACT-CHARACTERS-LIST-001", method: "GET", path: "characters", success: "character-list" },
  { id: "CONTRACT-CHARACTER-CREATE-001", method: "POST", path: "characters", body: { gameStem: BLADES, playbook: firstPlaybook(BLADES) }, success: "operation" },
  { id: "CONTRACT-CHARACTER-GET-001", method: "GET", path: "characters/{character}", seeds: ["character"], success: "character" },
  { id: "CONTRACT-CHARACTER-HISTORY-001", method: "GET", path: "characters/{character}/history", seeds: ["character"], success: "history" },
  { id: "CONTRACT-CHARACTER-SNAPSHOT-001", method: "GET", path: "characters/{character}/history/{snapshot}", seeds: ["character"], success: "character" },
  { id: "CONTRACT-CHARACTER-END-SCORE-001", method: "POST", path: `characters/${unknownId}/end-score`, body: { clearArmorUsed: true, resetLoadoutCommitment: true }, success: "operation", status: 404, errorCode: "NOT_FOUND" },
  { id: "CONTRACT-CHARACTER-END-DOWNTIME-001", method: "POST", path: `characters/${unknownId}/end-downtime`, body: { clearSessionExpressions: true, viceReliefStress: 1 }, success: "operation", status: 404, errorCode: "NOT_FOUND" },
  { id: "CONTRACT-CREWS-LIST-001", method: "GET", path: "crews", success: "crew-list" },
  { id: "CONTRACT-CREW-CREATE-001", method: "POST", path: "crews", body: { gameStem: BLADES, crewType: "Assassins" }, success: "operation" },
  { id: "CONTRACT-CREW-GET-001", method: "GET", path: "crews/{crew}", seeds: ["crew"], success: "crew" },
  { id: "CONTRACT-CREW-HISTORY-001", method: "GET", path: "crews/{crew}/history", seeds: ["crew"], success: "history" },
  { id: "CONTRACT-CREW-SNAPSHOT-001", method: "GET", path: "crews/{crew}/history/{snapshot}", seeds: ["crew"], success: "crew" },
  { id: "CONTRACT-CLOCKS-LIST-001", method: "GET", path: "clocks", success: "clock-list" },
  { id: "CONTRACT-CLOCK-CREATE-001", method: "POST", path: "clocks", body: { name: "Test", behavior: "bounded", size: 4, ownerKind: "campaign", ownerId: "", purpose: "custom", relatedClockIds: [] }, success: "operation" },
  { id: "CONTRACT-CLOCK-GET-001", method: "GET", path: "clocks/{clock}", seeds: ["clock"], success: "clock" },
];

for (const [suffix, body] of characterOpCases) {
  cases.push({ id: `CONTRACT-CHARACTER-${suffix.replaceAll("/", "-").replaceAll(".", "-").toUpperCase()}-001`, method: "POST", path: `characters/${unknownId}/${suffix}`, body, success: "operation", status: 404, errorCode: "NOT_FOUND" });
}
for (const [suffix, body] of crewOpCases) {
  cases.push({ id: `CONTRACT-CREW-${suffix.replaceAll("/", "-").replaceAll(".", "-").toUpperCase()}-001`, method: "POST", path: `crews/${unknownCrew}/${suffix}`, body, success: "operation", status: 404, errorCode: "NOT_FOUND" });
}
for (const [suffix, body] of clockOpCases) {
  cases.push({ id: `CONTRACT-CLOCK-${suffix.replaceAll("/", "-").replaceAll(".", "-").toUpperCase()}-001`, method: "POST", path: `clocks/${unknownClock}/${suffix}`, body, success: "operation", status: 404, errorCode: "NOT_FOUND" });
}

/** Creates a fresh entity through the public API without decoding its response. */
async function seed(seed: Seed): Promise<string> {
  if (seed === "character") {
    const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
    expect(response.status).toBe(200);
    assertResponseValid("createCharacter", response.status, response.body);
    const body = response.body as { character?: { id?: string } };
    if (!body.character?.id) throw new Error("character seeding returned no id");
    return body.character.id;
  }
  if (seed === "crew") {
    const response = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
    expect(response.status).toBe(200);
    assertResponseValid("createCrew", response.status, response.body);
    const body = response.body as { crew?: { id?: string } };
    if (!body.crew?.id) throw new Error("crew seeding returned no id");
    return body.crew.id;
  }
  const response = await api.post("clocks", {
    name: "Contract clock",
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
  const clockId = body.clock?.id;
  if (!clockId) throw new Error("clock seeding returned no id");
  return clockId;
}

/** Produces one snapshot-worthy mutation and returns the newest snapshotId. */
async function snapshotIdOf(entityKind: "character" | "crew", entityId: string): Promise<string> {
  const response = await api.post(`${entityKind}s/${entityId}/ops/note.add`, { text: "contract snapshot" });
  expect(response.status).toBe(200);
  assertResponseValid(entityKind === "character" ? "noteAdd" : "crewNoteAdd", response.status, response.body);
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

function substitute(value: unknown, ids: Record<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(/\{(character|crew|clock|snapshot)\}/g, (_, key: string) => ids[key] ?? "");
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, ids));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, substitute(item, ids)]),
    );
  }
  return value;
}

describe("contract v1 endpoint coverage", () => {
  for (const test of cases) {
    testCase(test.id, `${test.method} /api/${test.path}`, async () => {
      const ids: Record<string, string> = {};
      for (const seedName of test.seeds ?? []) ids[seedName] = await seed(seedName);
      if (test.path.includes("{snapshot}")) {
        const entityKind = test.seeds?.includes("crew") ? "crew" : "character";
        const entityId = ids.crew ?? ids.character;
        if (!entityId) throw new Error("snapshot placeholder requires a seeded entity");
        ids.snapshot = await snapshotIdOf(entityKind, entityId);
      } else if (test.success === "history") {
        // Exercise the history list against real snapshot entries, not the
        // empty list a freshly created entity has (BUG-013: snapshotId and
        // takenAt must satisfy the frozen schema).
        const entityKind = test.seeds?.includes("crew") ? "crew" : "character";
        const entityId = ids.crew ?? ids.character;
        if (entityId) {
          const response = await api.post(`${entityKind}s/${entityId}/ops/note.add`, { text: "contract history" });
          expect(response.status).toBe(200);
          assertResponseValid(
            entityKind === "character" ? "noteAdd" : "crewNoteAdd",
            response.status,
            response.body,
          );
        }
      }
      const path = substitute(test.path, ids) as string;
      const body = test.body === undefined ? undefined : substitute(test.body, ids);
      const response = await api.request(test.method, path, body);
      expect(response.status).toBe(test.status ?? 200);
      const operationId = operationIdForRequest(test.method, path);
      assertResponseValid(operationId, response.status, response.body);
      if (test.errorCode) {
        // The operation/status-derived oracle validates the typed error union.
        // response.body validated above against operation-result.json; the
        // operationError union carries a required code discriminator.
        const result = response.body as { error?: { code?: string } };
        expect(result.error?.code).toBe(test.errorCode);
        return;
      }
      const resBody = response.body;
      switch (test.success) {
        case "game-list":
        case "array":
          expect(Array.isArray(resBody)).toBe(true);
          break;
        case "object":
          expect(resBody !== null && typeof resBody === "object").toBe(true);
          break;
      }
    });
  }
});
