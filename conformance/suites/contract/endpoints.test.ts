import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { decode, Schemas } from "../../src/schemas.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook } from "../../src/game-data.js";

const unknownId = "00000000-0000-4000-8000-000000000000";
const unknownClock = "00000000-0000-4000-8000-000000000001";
const unknownCrew = "00000000-0000-4000-8000-000000000002";

type Case = {
  id: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  success: "health" | "character" | "crew" | "clock" | "array" | "object" | "operation";
  statuses?: number[];
};

const operationBody = { delta: 1 };
const characterOpCases: Array<[string, unknown]> = [
  ["delete", { confirm: true }],
  ["import", {}],
  ["undo", undefined],
  ["ops/stress.add", operationBody],
  ["ops/stress.clear", undefined],
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
  { id: "CONTRACT-CAMPAIGN-001", method: "GET", path: "campaign", success: "object" },
  { id: "CONTRACT-ROSTER-001", method: "GET", path: "campaign/roster", success: "object" },
  { id: "CONTRACT-CREW-MEMBERS-001", method: "GET", path: `campaign/crew/${unknownCrew}/members`, success: "array", statuses: [200, 404] },
  { id: "CONTRACT-BATCH-001", method: "POST", path: "campaign/batch", body: { ops: [{ entity: "character", id: unknownId, op: "stress.add", args: { delta: 1 } }] }, success: "operation" },
  { id: "CONTRACT-GAMES-001", method: "GET", path: "games", success: "array" },
  { id: "CONTRACT-GAME-001", method: "GET", path: "games/blades-in-the-dark", success: "object", statuses: [200, 404] },
  { id: "CONTRACT-GAME-PLAYBOOKS-001", method: "GET", path: "games/blades-in-the-dark/playbooks", success: "array", statuses: [200, 404] },
  { id: "CONTRACT-GAME-PLAYBOOK-001", method: "GET", path: "games/blades-in-the-dark/playbooks/Cutter", success: "object", statuses: [200, 404] },
  { id: "CONTRACT-GAME-HERITAGES-001", method: "GET", path: "games/blades-in-the-dark/heritages", success: "array", statuses: [200, 404] },
  { id: "CONTRACT-GAME-CREWS-001", method: "GET", path: "games/blades-in-the-dark/crews", success: "object", statuses: [200, 404] },
  { id: "CONTRACT-GAME-CREW-TYPE-001", method: "GET", path: "games/blades-in-the-dark/crews/Assassins", success: "object", statuses: [200, 404] },
  { id: "CONTRACT-CHARACTERS-LIST-001", method: "GET", path: "characters", success: "array" },
  { id: "CONTRACT-CHARACTER-CREATE-001", method: "POST", path: "characters", body: { gameStem: "blades-in-the-dark", playbook: firstPlaybook("blades-in-the-dark") }, success: "operation" },
  { id: "CONTRACT-CHARACTER-GET-001", method: "GET", path: `characters/${unknownId}`, success: "character", statuses: [200, 404] },
  { id: "CONTRACT-CHARACTER-HISTORY-001", method: "GET", path: `characters/${unknownId}/history`, success: "array", statuses: [200, 404] },
  { id: "CONTRACT-CHARACTER-SNAPSHOT-001", method: "GET", path: `characters/${unknownId}/history/20260719120000000-abc`, success: "character", statuses: [200, 404] },
  { id: "CONTRACT-CHARACTER-END-SCORE-001", method: "POST", path: `characters/${unknownId}/end-score`, body: { clearArmorUsed: true, resetLoadoutCommitment: true }, success: "operation", statuses: [200, 400, 404, 409] },
  { id: "CONTRACT-CHARACTER-END-DOWNTIME-001", method: "POST", path: `characters/${unknownId}/end-downtime`, body: { clearSessionExpressions: true, viceReliefStress: 1 }, success: "operation", statuses: [200, 400, 404, 409] },
  { id: "CONTRACT-CREWS-LIST-001", method: "GET", path: "crews", success: "array" },
  { id: "CONTRACT-CREW-CREATE-001", method: "POST", path: "crews", body: { gameStem: "blades-in-the-dark", crewType: "Assassins" }, success: "operation" },
  { id: "CONTRACT-CREW-GET-001", method: "GET", path: `crews/${unknownCrew}`, success: "crew", statuses: [200, 404] },
  { id: "CONTRACT-CREW-HISTORY-001", method: "GET", path: `crews/${unknownCrew}/history`, success: "array", statuses: [200, 404] },
  { id: "CONTRACT-CREW-SNAPSHOT-001", method: "GET", path: `crews/${unknownCrew}/history/20260719120000000-abc`, success: "crew", statuses: [200, 404] },
  { id: "CONTRACT-CLOCKS-LIST-001", method: "GET", path: "clocks", success: "array" },
  { id: "CONTRACT-CLOCK-CREATE-001", method: "POST", path: "clocks", body: { name: "Test", clockKind: "project", size: 4 }, success: "operation" },
  { id: "CONTRACT-CLOCK-GET-001", method: "GET", path: `clocks/${unknownClock}`, success: "clock", statuses: [200, 404] },
];

for (const [suffix, body] of characterOpCases) {
  cases.push({ id: `CONTRACT-CHARACTER-${suffix.replaceAll("/", "-").replaceAll(".", "-").toUpperCase()}-001`, method: "POST", path: `characters/${unknownId}/${suffix}`, body, success: "operation", statuses: [200, 400, 404, 409, 413] });
}
for (const [suffix, body] of crewOpCases) {
  cases.push({ id: `CONTRACT-CREW-${suffix.replaceAll("/", "-").replaceAll(".", "-").toUpperCase()}-001`, method: "POST", path: `crews/${unknownCrew}/${suffix}`, body, success: "operation", statuses: [200, 400, 404, 409, 413] });
}
for (const [suffix, body] of clockOpCases) {
  cases.push({ id: `CONTRACT-CLOCK-${suffix.replaceAll("/", "-").replaceAll(".", "-").toUpperCase()}-001`, method: "POST", path: `clocks/${unknownClock}/${suffix}`, body, success: "operation", statuses: [200, 400, 404, 409] });
}

describe("contract v1 endpoint coverage", () => {
  for (const test of cases) {
    testCase(test.id, `${test.method} /api/${test.path}`, async () => {
      const response = await api.request(test.method, test.path, test.body);
      expect(test.statuses ?? [200]).toContain(response.status);
      if (test.success === "health" && response.status === 200) await decode(Schemas.Health, response.body);
      if (test.success === "character" && response.status === 200) await decode(Schemas.Character, response.body);
      if (test.success === "crew" && response.status === 200) await decode(Schemas.Crew, response.body);
      if (test.success === "clock" && response.status === 200) await decode(Schemas.Clock, response.body);
      if (test.success === "array" && response.status === 200) await decode(Schemas.JsonArray, response.body);
      if (test.success === "object" && response.status === 200) await decode(Schemas.JsonObject, response.body);
      if (test.success === "operation") await decode(Schemas.OperationResult, response.body);
      if (response.status >= 400) await decode(Schemas.OperationResult, response.body);
    });
  }
});
