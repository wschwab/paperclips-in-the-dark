import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { firstPlaybook } from "../../src/game-data.js";

// AUDIT-0 BUG-011: operation request schemas are not enforced — required
// fields, minLength, enum constraints, integer bounds, and
// additionalProperties:false were routinely bypassed, and `harm.add {}`
// stored a persistent empty-description harm. Each case below sends a
// request that violates the frozen request schema and requires:
//   1. HTTP 400 with error.code VALIDATION, and
//   2. zero mutation — the entity's bytes (revision, timestamps, content)
//      are unchanged afterwards (create endpoints: the collection count does
//      not grow).
// Against the current server these return 200 and mutate, so every case is
// red until the server enforces the request schemas.

const BLADES = "blades-in-the-dark";

type Target =
  | "character"
  | "crew"
  | "clock"
  | "create-character"
  | "create-crew"
  | "create-clock";

type NegativeCase = {
  id: string;
  target: Target;
  /** Full relative path; may contain {id} for entity targets. */
  path: string;
  body: unknown;
  note: string;
};

const negativeCases: NegativeCase[] = [
  // ---- character ops (BUG-011 canonical case first) ----
  { id: "CONTRACT-VALIDATION-CHARACTER-HARM-ADD-EMPTY-001", target: "character", path: "characters/{id}/ops/harm.add", body: {}, note: "harm.add {} (both fields required)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-HARM-ADD-MISSING-INTENSITY-001", target: "character", path: "characters/{id}/ops/harm.add", body: { description: "x" }, note: "harm.add without intensity" },
  { id: "CONTRACT-VALIDATION-CHARACTER-HARM-ADD-EMPTY-DESCRIPTION-001", target: "character", path: "characters/{id}/ops/harm.add", body: { description: "", intensity: "lesser" }, note: "harm.add with empty description (minLength 1)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-HARM-ADD-BAD-INTENSITY-001", target: "character", path: "characters/{id}/ops/harm.add", body: { description: "x", intensity: "mortal" }, note: "harm.add with out-of-enum intensity" },
  { id: "CONTRACT-VALIDATION-CHARACTER-HARM-ADD-EXTRA-FIELD-001", target: "character", path: "characters/{id}/ops/harm.add", body: { description: "x", intensity: "lesser", extra: 1 }, note: "harm.add with an unknown field (additionalProperties:false)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-STRESS-ADD-EMPTY-001", target: "character", path: "characters/{id}/ops/stress.add", body: {}, note: "stress.add {} (delta required)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-STRESS-ADD-TYPE-001", target: "character", path: "characters/{id}/ops/stress.add", body: { delta: "1" }, note: "stress.add with string delta" },
  { id: "CONTRACT-VALIDATION-CHARACTER-STRESS-ADD-EXTRA-FIELD-001", target: "character", path: "characters/{id}/ops/stress.add", body: { delta: 1, extra: true }, note: "stress.add with an unknown field" },
  { id: "CONTRACT-VALIDATION-CHARACTER-TRAUMA-ADD-EMPTY-001", target: "character", path: "characters/{id}/ops/trauma.add", body: { trauma: "" }, note: "trauma.add with empty trauma (minLength 1)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-TRAUMA-ADD-EXTRA-FIELD-001", target: "character", path: "characters/{id}/ops/trauma.add", body: { trauma: "Haunted", extra: 1 }, note: "trauma.add with an unknown field" },
  { id: "CONTRACT-VALIDATION-CHARACTER-ARMOR-SET-BAD-KIND-001", target: "character", path: "characters/{id}/ops/armor.set", body: { armor: "plate", used: true }, note: "armor.set with out-of-enum armor" },
  { id: "CONTRACT-VALIDATION-CHARACTER-ARMOR-SET-MISSING-USED-001", target: "character", path: "characters/{id}/ops/armor.set", body: { armor: "standard" }, note: "armor.set without used" },
  { id: "CONTRACT-VALIDATION-CHARACTER-GEAR-ADD-NEGATIVE-BULK-001", target: "character", path: "characters/{id}/ops/gear.add", body: { name: "x", bulk: -1 }, note: "gear.add with negative bulk (minimum 0)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-GEAR-ADD-EMPTY-NAME-001", target: "character", path: "characters/{id}/ops/gear.add", body: { name: "", bulk: 0 }, note: "gear.add with empty name (minLength 1)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-FUND-GAIN-ZERO-001", target: "character", path: "characters/{id}/ops/fund.gain", body: { coins: 0 }, note: "fund.gain with coins below minimum 1" },
  { id: "CONTRACT-VALIDATION-CHARACTER-ROLODEX-ADD-EMPTY-001", target: "character", path: "characters/{id}/ops/rolodex.add", body: { entry: "" }, note: "rolodex.add with empty entry (minLength 1)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-ROLODEX-CLOSENESS-ENUM-001", target: "character", path: "characters/{id}/ops/rolodex.set-closeness", body: { entry: "x", closeness: "best-friend" }, note: "rolodex.set-closeness with out-of-enum closeness" },
  { id: "CONTRACT-VALIDATION-CHARACTER-NOTE-ADD-EMPTY-001", target: "character", path: "characters/{id}/ops/note.add", body: {}, note: "note.add {} (text required)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-NOTE-REMOVE-NEGATIVE-001", target: "character", path: "characters/{id}/ops/note.remove", body: { index: -1 }, note: "note.remove with negative index (minimum 0)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-SESSION-SET-EMPTY-001", target: "character", path: "characters/{id}/ops/session.set", body: {}, note: "session.set {} (minProperties 1)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-SESSION-SET-NEGATIVE-001", target: "character", path: "characters/{id}/ops/session.set", body: { playbookExpressions: -1 }, note: "session.set with negative expression (minimum 0)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-DOSSIER-UPDATE-EMPTY-001", target: "character", path: "characters/{id}/ops/dossier.update", body: {}, note: "dossier.update {} (minProperties 1)" },
  { id: "CONTRACT-VALIDATION-CHARACTER-DOSSIER-UPDATE-EXTRA-FIELD-001", target: "character", path: "characters/{id}/ops/dossier.update", body: { name: "x", extra: 1 }, note: "dossier.update with an unknown field" },
  { id: "CONTRACT-VALIDATION-CHARACTER-END-SCORE-EXTRA-FIELD-001", target: "character", path: "characters/{id}/end-score", body: { clearArmorUsed: true, extra: 1 }, note: "end-score with an unknown field" },
  { id: "CONTRACT-VALIDATION-CHARACTER-END-DOWNTIME-NEGATIVE-001", target: "character", path: "characters/{id}/end-downtime", body: { viceReliefStress: -1 }, note: "end-downtime with negative viceReliefStress (minimum 0)" },

  // ---- crew ops ----
  { id: "CONTRACT-VALIDATION-CREW-HEAT-ADD-EMPTY-001", target: "crew", path: "crews/{id}/ops/heat.add", body: {}, note: "heat.add {} (delta required)" },
  { id: "CONTRACT-VALIDATION-CREW-HOLD-SET-ENUM-001", target: "crew", path: "crews/{id}/ops/hold.set", body: { hold: "iron" }, note: "hold.set with out-of-enum hold" },
  { id: "CONTRACT-VALIDATION-CREW-COHORT-ADD-EMPTY-001", target: "crew", path: "crews/{id}/ops/cohort.add", body: {}, note: "cohort.add {} (cohortKind required)" },
  { id: "CONTRACT-VALIDATION-CREW-COHORT-ADD-ENUM-001", target: "crew", path: "crews/{id}/ops/cohort.add", body: { cohortKind: "warband" }, note: "cohort.add with out-of-enum cohortKind" },
  { id: "CONTRACT-VALIDATION-CREW-CONTACT-ADD-EMPTY-001", target: "crew", path: "crews/{id}/ops/contact.add", body: {}, note: "contact.add {} (name and profession required)" },
  { id: "CONTRACT-VALIDATION-CREW-CONTACT-ADD-EMPTY-NAME-001", target: "crew", path: "crews/{id}/ops/contact.add", body: { name: "", profession: "x" }, note: "contact.add with empty name (minLength 1)" },
  { id: "CONTRACT-VALIDATION-CREW-FACTION-SET-STATUS-EMPTY-001", target: "crew", path: "crews/{id}/ops/faction.set-status", body: {}, note: "faction.set-status {} (name and status required)" },
  { id: "CONTRACT-VALIDATION-CREW-UPGRADE-MARK-EMPTY-001", target: "crew", path: "crews/{id}/ops/upgrade.mark", body: {}, note: "upgrade.mark {} (name required)" },
  { id: "CONTRACT-VALIDATION-CREW-FIELDS-UPDATE-EMPTY-001", target: "crew", path: "crews/{id}/ops/fields.update", body: {}, note: "fields.update {} (minProperties 1)" },
  { id: "CONTRACT-VALIDATION-CREW-NOTE-REMOVE-NEGATIVE-001", target: "crew", path: "crews/{id}/ops/note.remove", body: { index: -1 }, note: "crew note.remove with negative index" },

  // ---- clock ops ----
  { id: "CONTRACT-VALIDATION-CLOCK-PROGRESS-EMPTY-001", target: "clock", path: "clocks/{id}/ops/clock.progress", body: {}, note: "clock.progress {} (segments required)" },
  { id: "CONTRACT-VALIDATION-CLOCK-PROGRESS-TYPE-001", target: "clock", path: "clocks/{id}/ops/clock.progress", body: { segments: "3" }, note: "clock.progress with string segments" },

  // ---- create request schemas ----
  { id: "CONTRACT-VALIDATION-CREATE-CHARACTER-MISSING-PLAYBOOK-001", target: "create-character", path: "characters", body: { gameStem: BLADES }, note: "character create without required playbook" },
  { id: "CONTRACT-VALIDATION-CREATE-CREW-MISSING-CREWTYPE-001", target: "create-crew", path: "crews", body: { gameStem: BLADES }, note: "crew create without required crewType" },
  { id: "CONTRACT-VALIDATION-CREATE-CLOCK-EMPTY-001", target: "create-clock", path: "clocks", body: {}, note: "clock create {} (name, clockKind, size required)" },
  { id: "CONTRACT-VALIDATION-CREATE-CLOCK-BAD-KIND-001", target: "create-clock", path: "clocks", body: { name: "x", clockKind: "fancy", size: 4 }, note: "clock create with out-of-enum clockKind" },
];

async function seedEntity(target: "character" | "crew" | "clock"): Promise<string> {
  if (target === "character") {
    const response = await api.post("characters", { gameStem: BLADES, playbook: firstPlaybook(BLADES) });
    expect(response.status).toBe(200);
    const body = response.body as { character?: { id?: string } };
    if (!body.character?.id) throw new Error("character seeding returned no id");
    return body.character.id;
  }
  if (target === "crew") {
    const response = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
    expect(response.status).toBe(200);
    const body = response.body as { crew?: { id?: string } };
    if (!body.crew?.id) throw new Error("crew seeding returned no id");
    return body.crew.id;
  }
  const response = await api.post("clocks", { name: "Validation clock", clockKind: "project", size: 4 });
  expect(response.status).toBe(200);
  const body = response.body as { clock?: { id?: string } };
  if (!body.clock?.id) throw new Error("clock seeding returned no id");
  return body.clock.id;
}

describe("contract v1 request-schema validation (AUDIT-0 BUG-011)", () => {
  for (const test of negativeCases) {
    testCase(test.id, `${test.note} → 400 VALIDATION with no mutation`, async () => {
      if (test.target === "create-character" || test.target === "create-crew" || test.target === "create-clock") {
        const listPath = test.target === "create-character" ? "characters" : test.target === "create-crew" ? "crews" : "clocks";
        const beforeList = await api.get(listPath);
        expect(beforeList.status).toBe(200);
        const countBefore = (beforeList.body as unknown[]).length;
        const response = await api.post(test.path, test.body);
        expect(response.status).toBe(400);
        const result = await api.operation(response);
        expect(result.ok).toBe(false);
        expect(result.error?.code).toBe("VALIDATION");
        // Frozen whole-error union: the VALIDATION branch carries the typed
        // pointer details (issue list) plus the locked envelope fields. The
        // union type admits the legacy {code,message} branch, so the new
        // envelope fields are read through an optional-shape cast.
        const error = result.error as { status?: number; retryable?: boolean; recovery?: string };
        expect(error.status).toBe(400);
        expect(error.retryable).toBeTypeOf("boolean");
        expect(error.recovery).toBeTypeOf("string");
        expect(result.error?.details.issues.length).toBeGreaterThan(0);
        const afterList = await api.get(listPath);
        expect((afterList.body as unknown[]).length).toBe(countBefore);
        return;
      }
      const id = await seedEntity(test.target);
      const before = await api.get(`${test.target}s/${id}`);
      expect(before.status).toBe(200);
      const response = await api.post(test.path.replace("{id}", id), test.body);
      expect(response.status).toBe(400);
      const result = await api.operation(response);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("VALIDATION");
      const error = result.error as { status?: number; retryable?: boolean; recovery?: string };
      expect(error.status).toBe(400);
      expect(error.retryable).toBeTypeOf("boolean");
      expect(error.recovery).toBeTypeOf("string");
      expect(result.error?.details.issues.length).toBeGreaterThan(0);
      const after = await api.get(`${test.target}s/${id}`);
      expect(after.rawBody).toBe(before.rawBody);
    });
  }
});
