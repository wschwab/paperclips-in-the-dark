import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CREW-COHORTS-03: a gang or expert cohort may carry up to two types. The
 * first type stays in gangType/expertType; the optional second type is
 * extraTypes (maxItems CohortMaxTypes - 1, from the Blades crews settings).
 */

const BLADES = "blades-in-the-dark";

type Json = Record<string, unknown>;
const asRecord = (v: unknown): Json | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined;

async function newCrewRevision(): Promise<{ id: string; revision: number }> {
  const created = await api.post("crews", { gameStem: BLADES, crewType: "Assassins" });
  expect(created.status).toBe(200);
  const crew = asRecord(asRecord(created.body)?.crew);
  const id = crew?.id;
  const revision = crew?.revision;
  if (typeof id !== "string" || typeof revision !== "number") throw new Error("create returned no crew");
  return { id, revision };
}

function cohortsOf(body: unknown): Json[] {
  // Mutations wrap the crew as { crew }; GET /crews/{id} returns the crew bare.
  const crew = asRecord(asRecord(body)?.crew) ?? asRecord(body);
  const cohorts = crew?.cohorts;
  return Array.isArray(cohorts) ? (cohorts as Json[]) : [];
}

function previewTokenOf(raw: string): string | undefined {
  const body = JSON.parse(raw) as {
    previewToken?: unknown;
    error?: { token?: unknown; details?: { previewToken?: unknown } };
  };
  const token = body.previewToken ?? body.error?.token ?? body.error?.details?.previewToken;
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

function hasClampChange(value: unknown, pointer: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasClampChange(v, pointer));
  const rec = asRecord(value);
  if (rec === undefined) return false;
  if (
    rec.pointer === pointer &&
    typeof rec.reason === "string" &&
    rec.reason.includes("settings-derived clamp")
  ) {
    return true;
  }
  return Object.values(rec).some((v) => hasClampChange(v, pointer));
}

describe("CREW-COHORTS-03 cohort second type", () => {
  testCase(
    "CREW-COHORTS-03-ADD-001",
    "cohort.add accepts one extra type and persists it on the record",
    async () => {
      const { id, revision } = await newCrewRevision();
      const res = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(res.status).toBe(200);
      expect(cohortsOf(res.body)[0]?.extraTypes).toEqual(["Rooks"]);
      expect(cohortsOf(res.body)[0]?.gangType).toBe("Thugs");
    },
  );

  testCase(
    "CREW-COHORTS-03-ADD-002",
    "cohort.add rejects two extra types (maxItems is CohortMaxTypes - 1)",
    async () => {
      const { id, revision } = await newCrewRevision();
      const res = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks", "Skulks"] },
        { "If-Match": String(revision) },
      );
      // Operation failures use the 200 OpResult envelope with error.code.
      expect(res.status).toBe(200);
      expect(asRecord(asRecord(res.body)?.error)?.code).toBe("VALIDATION");
      const fetched = await api.get(`crews/${id}`);
      expect(cohortsOf(fetched.body)).toHaveLength(0);
    },
  );

  testCase(
    "CREW-COHORTS-03-ADD-003",
    "expert cohort accepts a second expert type, and a Custom second type stores its text",
    async () => {
      const { id, revision } = await newCrewRevision();
      const res = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "expert", expertType: "Doctor", extraTypes: ["Spy"] },
        { "If-Match": String(revision) },
      );
      expect(res.status).toBe(200);
      expect(cohortsOf(res.body)[0]?.extraTypes).toEqual(["Spy"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-UPDATE-001",
    "cohort.update replaces the second type and reload round-trips it",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs" },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const cohortId = cohortsOf(added.body)[0]?.id;
      const rev2 = asRecord(asRecord(added.body)?.crew)?.revision;
      if (typeof cohortId !== "string" || typeof rev2 !== "number") throw new Error("no cohort");

      const updated = await api.post(
        `crews/${id}/ops/cohort.update`,
        { cohortId, extraTypes: ["Adepts"] },
        { "If-Match": String(rev2) },
      );
      expect(updated.status).toBe(200);
      expect(cohortsOf(updated.body)[0]?.extraTypes).toEqual(["Adepts"]);

      const fetched = await api.get(`crews/${id}`);
      expect(cohortsOf(fetched.body)[0]?.extraTypes).toEqual(["Adepts"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-UNDO-001",
    "undo of a cohort.update that set a second type restores the previous record",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs" },
        { "If-Match": String(revision) },
      );
      const cohortId = cohortsOf(added.body)[0]?.id;
      const rev2 = asRecord(asRecord(added.body)?.crew)?.revision;
      if (typeof cohortId !== "string" || typeof rev2 !== "number") throw new Error("no cohort");
      const updated = await api.post(
        `crews/${id}/ops/cohort.update`,
        { cohortId, extraTypes: ["Rovers"] },
        { "If-Match": String(rev2) },
      );
      expect(cohortsOf(updated.body)[0]?.extraTypes).toEqual(["Rovers"]);
      const rev3 = asRecord(asRecord(updated.body)?.crew)?.revision;
      if (typeof rev3 !== "number") throw new Error("no revision after update");
      const undone = await api.post(`crews/${id}/undo`, undefined, { "If-Match": String(rev3) });
      expect(undone.status).toBe(200);
      const after = cohortsOf(undone.body)[0];
      expect(after).toBeDefined();
      expect(after?.extraTypes ?? []).toEqual([]);
    },
  );
});

describe("CREW-COHORTS-03 limit agreement", () => {
  testCase("CREW-COHORTS-03-LIMIT-001", "extraTypes maxItems equals CohortMaxTypes - 1 in every contract declaration", async () => {
    const { readFileSync } = await import("node:fs");
    const settings = JSON.parse(readFileSync(new URL("../../../data/games/blades-in-the-dark-crews.json", import.meta.url), "utf8")) as Json;
    const crewSchema = JSON.parse(readFileSync(new URL("../../../contract/schemas/crew.json", import.meta.url), "utf8")) as Json;
    const openapi = readFileSync(new URL("../../../contract/openapi.yaml", import.meta.url), "utf8");
    const limit = (settings.CohortMaxTypes as number) - 1;
    expect(limit).toBe(1);
    expect(JSON.stringify(crewSchema)).toContain('"extraTypes"');
    const cohortItem = (crewSchema as { properties?: { cohorts?: { items?: { properties?: Record<string, { maxItems?: number }> } } } })
      .properties?.cohorts?.items?.properties?.extraTypes;
    expect(cohortItem?.maxItems).toBe(limit);
    const openapiMax = [...openapi.matchAll(/extraTypes: \{ type: array, maxItems: (\d+)/g)].map((m) => Number(m[1]));
    expect(openapiMax.length).toBe(2);
    for (const max of openapiMax) expect(max).toBe(limit);
  });
});

describe("CREW-COHORTS-03 limit on update and import", () => {
  testCase(
    "CREW-COHORTS-03-UPDATE-002",
    "cohort.update rejects two extra types (maxItems is CohortMaxTypes - 1) and stores nothing",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs" },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const cohortId = cohortsOf(added.body)[0]?.id;
      const rev2 = asRecord(asRecord(added.body)?.crew)?.revision;
      if (typeof cohortId !== "string" || typeof rev2 !== "number") throw new Error("no cohort");

      const res = await api.post(
        `crews/${id}/ops/cohort.update`,
        { cohortId, extraTypes: ["Rooks", "Adepts"] },
        { "If-Match": String(rev2) },
      );
      expect(res.status).toBe(200);
      expect(asRecord(asRecord(res.body)?.error)?.code).toBe("VALIDATION");
      const reload = await api.get(`crews/${id}`);
      expect(cohortsOf(reload.body)[0]?.extraTypes ?? []).toEqual([]);
    },
  );

  testCase(
    "CREW-COHORTS-03-IMPORT-001",
    "crew import cannot store a cohort with more extra types than CohortMaxTypes - 1",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const rev2 = asRecord(asRecord(added.body)?.crew)?.revision;
      if (typeof rev2 !== "number") throw new Error("no revision");
      const doc = JSON.parse(JSON.stringify(asRecord(added.body)?.crew)) as Json;
      const cohorts = doc.cohorts as Json[];
      cohorts[0].extraTypes = ["Rooks", "Adepts"];

      const preview = await api.post(`crews/${id}/import?preview=1`, { entity: doc });
      const previewToken = previewTokenOf(preview.rawBody);
      expect(previewToken, "preview issues a token").toBeDefined();
      const response = await api.post(
        `crews/${id}/import`,
        { entity: doc, previewToken, confirm: true },
        { "If-Match": String(rev2) },
      );
      expect(response.status).toBe(400);
      expect(asRecord(asRecord(response.body)?.error)?.code).toBe("INVALID_ENTRY");
      const after = await api.get(`crews/${id}`);
      expect(cohortsOf(after.body)[0]?.extraTypes).toEqual(["Rooks"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-IMPORT-002",
    "crew import applies a valid cohort that carries one extra type",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const rev2 = asRecord(asRecord(added.body)?.crew)?.revision;
      if (typeof rev2 !== "number") throw new Error("no revision");
      const doc = JSON.parse(JSON.stringify(asRecord(added.body)?.crew)) as Json;
      (cohortsOf(doc)[0] as Json).extraTypes = ["Adepts"];

      const preview = await api.post(`crews/${id}/import?preview=1`, { entity: doc });
      const previewToken = previewTokenOf(preview.rawBody);
      expect(previewToken, "preview issues a token").toBeDefined();
      const response = await api.post(
        `crews/${id}/import`,
        { entity: doc, previewToken, confirm: true },
        { "If-Match": String(rev2) },
      );
      expect(response.status).toBe(200);
      expect(asRecord(response.body)?.ok).toBe(true);
      const newRev = asRecord(asRecord(response.body)?.crew)?.revision;
      expect(typeof newRev === "number" && newRev > rev2).toBe(true);
      const after = await api.get(`crews/${id}`);
      expect(cohortsOf(after.body)[0]?.extraTypes).toEqual(["Adepts"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-REPAIR-001",
    "import preview reports an over-limit extraTypes as a repair, not as canonical",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const doc = JSON.parse(JSON.stringify(asRecord(added.body)?.crew)) as Json;
      const cohorts = doc.cohorts as Json[];
      cohorts[0].extraTypes = ["Rooks", "Adepts"];

      const preview = await api.post(`crews/${id}/import?preview=1`, { entity: doc });
      expect(preview.status).toBe(409);
      expect(hasClampChange(JSON.parse(preview.rawBody), "/cohorts/0/extraTypes")).toBe(true);
    },
  );

  testCase(
    "CREW-COHORTS-03-DECODE-001",
    "the typed crew decoder accepts a cohort that carries extraTypes",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const crew = await api.crew(id);
      expect(cohortsOf(crew)[0]?.extraTypes).toEqual(["Rooks"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-IMPORT-003",
    "import rejects caller-supplied keys beyond entity/previewToken/confirm; the record is unchanged",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const doc = JSON.parse(JSON.stringify(asRecord(added.body)?.crew)) as Json;
      (cohortsOf(doc)[0] as Json).extraTypes = "Rooks";

      const needs = await api.post(`crews/${id}/import?preview=1`, { entity: doc });
      expect(needs.status).toBe(409);
      const supplied = await api.post(`crews/${id}/import?preview=1`, {
        entity: doc,
        "/cohorts/0/extraTypes": ["Rooks", "Adepts"],
      });
      expect(supplied.status).toBe(400);
      expect(asRecord(asRecord(supplied.body)?.error)?.code).toBe("VALIDATION");
      expect(supplied.rawBody).toContain("preview mode takes {entity} only");
      const after = await api.get(`crews/${id}`);
      expect(cohortsOf(after.body)[0]?.extraTypes).toEqual(["Rooks"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-IMPORT-004",
    "import apply refuses an over-limit extraTypes when the submitted entity omits gameStem",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const rev2 = asRecord(asRecord(added.body)?.crew)?.revision;
      if (typeof rev2 !== "number") throw new Error("no revision");
      const doc = JSON.parse(JSON.stringify(asRecord(added.body)?.crew)) as Json;
      (cohortsOf(doc)[0] as Json).extraTypes = ["Rooks", "Adepts"];
      delete doc.gameStem;

      const preview = await api.post(`crews/${id}/import?preview=1`, { entity: doc });
      const previewToken = previewTokenOf(preview.rawBody);
      expect(previewToken, "preview issues a token").toBeDefined();
      const response = await api.post(
        `crews/${id}/import`,
        { entity: doc, previewToken, confirm: true },
        { "If-Match": String(rev2) },
      );
      expect(response.status).toBe(400);
      expect(asRecord(asRecord(response.body)?.error)?.code).toBe("INVALID_ENTRY");
      const after = await api.get(`crews/${id}`);
      expect(cohortsOf(after.body)[0]?.extraTypes).toEqual(["Rooks"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-REPAIR-002",
    "repair-preview refuses a caller-supplied over-limit extraTypes; a within-limit value needs confirmation",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      // the API refuses to store a non-array extraTypes, so the stored record is
      // written directly: that is the needs-input state repair resolves
      const health = await api.health();
      const storedPath = join(health.dataDir, "crews", id, "current.json");
      const stored = JSON.parse(readFileSync(storedPath, "utf8")) as Json;
      (cohortsOf(stored)[0] as Json).extraTypes = "Rooks";
      writeFileSync(storedPath, JSON.stringify(stored));

      const refused = await api.post(`crews/${id}/repair-preview`, {
        "/cohorts/0/extraTypes": ["Rooks", "Adepts"],
      });
      expect(refused.status).toBe(400);
      expect(asRecord(asRecord(refused.body)?.error)?.code).toBe("INVALID_ENTRY");
      expect(refused.rawBody).toContain("settings-derived maximum");

      const accepted = await api.post(`crews/${id}/repair-preview`, {
        "/cohorts/0/extraTypes": ["Adepts"],
      });
      expect(accepted.status).toBe(409);
      expect(accepted.rawBody).toContain("/cohorts/0/extraTypes");
    },
  );

  testCase(
    "CREW-COHORTS-03-UNDO-002",
    "undo of a cohort add still succeeds when the record carries an unrelated legacy tracker maximum",
    async () => {
      const { id, revision } = await newCrewRevision();
      // heat.max above the settings bound is legacy data the cohort gate must not block
      const health = await api.health();
      const storedPath = join(health.dataDir, "crews", id, "current.json");
      const stored = JSON.parse(readFileSync(storedPath, "utf8")) as Json;
      const heat = asRecord(stored.heat);
      if (heat === undefined) throw new Error("stored crew has no heat tracker");
      heat.max = 10;
      writeFileSync(storedPath, JSON.stringify(stored));

      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs" },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const rev2 = asRecord(asRecord(added.body)?.crew)?.revision;
      if (typeof rev2 !== "number") throw new Error("no revision");

      const undone = await api.post(`crews/${id}/undo`, {}, { "If-Match": String(rev2) });
      expect(undone.status).toBe(200);
      expect(asRecord(undone.body)?.ok).toBe(true);
      const after = await api.get(`crews/${id}`);
      expect(cohortsOf(after.body)).toHaveLength(0);
    },
  );

  testCase(
    "CREW-COHORTS-03-ADMIT-001",
    "cohort.add and cohort.update refuse an extraTypes array holding a non-string element before any mutation",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: [7] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(400);
      expect(added.rawBody).not.toContain("INTERNAL");
      expect((await api.get(`crews/${id}`)).body).toMatchObject({ revision });

      const seeded = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(seeded.status).toBe(200);
      const cohortId = cohortsOf(seeded.body)[0]?.id;
      const rev2 = asRecord(asRecord(seeded.body)?.crew)?.revision;
      if (typeof cohortId !== "string" || typeof rev2 !== "number") throw new Error("no cohort");
      const updated = await api.post(
        `crews/${id}/ops/cohort.update`,
        { cohortId, extraTypes: [7] },
        { "If-Match": String(rev2) },
      );
      expect(updated.status).toBe(400);
      expect(updated.rawBody).not.toContain("INTERNAL");
      expect((await api.get(`crews/${id}`)).body).toMatchObject({ revision: rev2 });
    },
  );

  testCase(
    "CREW-COHORTS-03-WRITE-001",
    "fields.update refuses a cohorts write whose extraTypes exceed CohortMaxTypes - 1 and leaves the crew unchanged",
    async () => {
      const { id, revision } = await newCrewRevision();
      const seeded = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(seeded.status).toBe(200);
      const rev2 = asRecord(asRecord(seeded.body)?.crew)?.revision;
      const cohort = cohortsOf(seeded.body)[0];
      if (typeof rev2 !== "number" || !cohort) throw new Error("no seeded cohort");
      const overBound = { ...cohort, extraTypes: ["Rooks", "Stokers"] };
      const written = await api.post(
        `crews/${id}/ops/fields.update`,
        { cohorts: [overBound] },
        { "If-Match": String(rev2) },
      );
      expect(written.status).toBe(400);
      expect(written.rawBody).not.toContain("INTERNAL");
      const after = await api.get(`crews/${id}`);
      expect(after.status).toBe(200);
      expect(after.body).toMatchObject({ revision: rev2 });
      expect(cohortsOf(after.body)[0]?.extraTypes).toEqual(["Rooks"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-WRITE-002",
    "a campaign batch fields.update whose cohorts exceed CohortMaxTypes - 1 is refused and the crew is unchanged",
    async () => {
      const { id, revision } = await newCrewRevision();
      const seeded = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(seeded.status).toBe(200);
      const rev2 = asRecord(asRecord(seeded.body)?.crew)?.revision;
      const cohort = cohortsOf(seeded.body)[0];
      if (typeof rev2 !== "number" || !cohort) throw new Error("no seeded cohort");
      const overBound = { ...cohort, extraTypes: ["Rooks", "Stokers"] };
      const batch = await api.post("campaign/batch", {
        ops: [{ entity: "crew", id, op: "fields.update", args: { cohorts: [overBound] } }],
      });
      const result = await api.operation(batch);
      expect(result.batch?.[0]?.ok).toBe(false);
      expect(result.batch?.[0]?.error?.code).toBe("VALIDATION");
      expect(batch.rawBody).not.toContain("INTERNAL");
      const after = await api.get(`crews/${id}`);
      expect(after.status).toBe(200);
      expect(after.body).toMatchObject({ revision: rev2 });
      expect(cohortsOf(after.body)[0]?.extraTypes).toEqual(["Rooks"]);
    },
  );

  testCase(
    "CREW-COHORTS-03-REPAIR-003",
    "repair-preview refuses a caller-supplied extraTypes whose elements are not strings",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const health = await api.health();
      const storedPath = join(health.dataDir, "crews", id, "current.json");
      const stored = JSON.parse(readFileSync(storedPath, "utf8")) as Json;
      (cohortsOf(stored)[0] as Json).extraTypes = "Rooks";
      writeFileSync(storedPath, JSON.stringify(stored));

      const refused = await api.post(`crews/${id}/repair-preview`, {
        "/cohorts/0/extraTypes": [7],
      });
      expect(refused.status).toBe(400);
      expect(asRecord(asRecord(refused.body)?.error)?.code).toBe("INVALID_ENTRY");
      expect(refused.rawBody).toContain("extraTypes elements must be strings");
    },
  );

  testCase(
    "CREW-COHORTS-03-REPAIR-005",
    "repair-preview refuses a caller-supplied extraTypes that is a scalar rather than an array",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const health = await api.health();
      const storedPath = join(health.dataDir, "crews", id, "current.json");
      const stored = JSON.parse(readFileSync(storedPath, "utf8")) as Json;
      (cohortsOf(stored)[0] as Json).extraTypes = "Rooks";
      writeFileSync(storedPath, JSON.stringify(stored));

      const refused = await api.post(`crews/${id}/repair-preview`, {
        "/cohorts/0/extraTypes": 7,
      });
      expect(refused.status).toBe(400);
      expect(asRecord(asRecord(refused.body)?.error)?.code).toBe("INVALID_ENTRY");
      expect(refused.rawBody).toContain("extraTypes must be an array of strings");
    },
  );

  testCase(
    "CREW-COHORTS-03-REPAIR-007",
    "repair-preview refuses a stored null extraTypes instead of canonicalizing it to an empty array",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const health = await api.health();
      const storedPath = join(health.dataDir, "crews", id, "current.json");
      const stored = JSON.parse(readFileSync(storedPath, "utf8")) as Json;
      (cohortsOf(stored)[0] as Json).extraTypes = null;
      writeFileSync(storedPath, JSON.stringify(stored));

      const refused = await api.post(`crews/${id}/repair-preview`, {});
      expect(refused.status).toBe(400);
      expect(asRecord(asRecord(refused.body)?.error)?.code).toBe("INVALID_ENTRY");
      expect(refused.rawBody).not.toContain("previewToken");
    },
  );

  testCase(
    "CREW-COHORTS-03-REPAIR-006",
    "repair-preview refuses a stored extraTypes array holding a non-string element instead of minting a token",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const health = await api.health();
      const storedPath = join(health.dataDir, "crews", id, "current.json");
      const stored = JSON.parse(readFileSync(storedPath, "utf8")) as Json;
      (cohortsOf(stored)[0] as Json).extraTypes = [7];
      writeFileSync(storedPath, JSON.stringify(stored));

      const refused = await api.post(`crews/${id}/repair-preview`, {});
      expect(refused.status).toBe(400);
      expect(asRecord(asRecord(refused.body)?.error)?.code).toBe("INVALID_ENTRY");
      expect(refused.body).not.toHaveProperty("token");
    },
  );


  testCase(
    "CREW-COHORTS-03-REPAIR-004",
    "repair-preview refuses an over-limit caller value even when the game settings do not resolve",
    async () => {
      const { id, revision } = await newCrewRevision();
      const added = await api.post(
        `crews/${id}/ops/cohort.add`,
        { cohortKind: "gang", gangType: "Thugs", extraTypes: ["Rooks"] },
        { "If-Match": String(revision) },
      );
      expect(added.status).toBe(200);
      const health = await api.health();
      const storedPath = join(health.dataDir, "crews", id, "current.json");
      const stored = JSON.parse(readFileSync(storedPath, "utf8")) as Json;
      (cohortsOf(stored)[0] as Json).extraTypes = "Rooks";
      stored.gameStem = "no-such-game";
      writeFileSync(storedPath, JSON.stringify(stored));

      const refused = await api.post(`crews/${id}/repair-preview`, {
        "/cohorts/0/extraTypes": ["Rooks", "Adepts"],
      });
      expect(refused.status).toBe(400);
      expect(asRecord(asRecord(refused.body)?.error)?.code).toBe("INVALID_ENTRY");
    },
  );
});
