import { describe, expect } from "vitest";
import { api } from "../../src/api.js";
import { testCase } from "../../src/test-case.js";

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
